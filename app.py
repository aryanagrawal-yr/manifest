import io
import os
import re
import secrets
import time
from datetime import timedelta
from functools import wraps

from flask import (Flask, Response, abort, flash, redirect, render_template, request,
                   send_file, session, url_for)

import pdfs
import storage
import users

PARTNERS = ["Delhivery", "DTDC", "Shadowfax", "RobeHive", "Bluedart", "Ecom Express", "XpressBees"]
VEHICLE_TYPES = ["Bike", "Scooter", "Auto", "Tempo", "Van", "Mini Truck", "Truck", "Other"]

app = Flask(__name__)
app.secret_key = storage.secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    MAX_CONTENT_LENGTH=1024 * 1024,
)

_fails = {}  # ip -> (count, first_fail_ts)


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_hex(16)
    return session["_csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token


@app.before_request
def _csrf_check():
    if request.method == "POST":
        sent, expected = request.form.get("_csrf", ""), session.get("_csrf", "")
        if not expected or not secrets.compare_digest(sent, expected):
            abort(400)


@app.after_request
def _headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Cache-Control"] = "no-store"
    return resp


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **k):
        if "user" not in session:
            return redirect(url_for("login", next=request.path))
        return fn(*a, **k)
    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    if request.method == "POST":
        cnt, first = _fails.get(ip, (0, time.time()))
        if time.time() - first > 300:
            cnt, first = 0, time.time()
        if cnt >= 5:
            flash("Too many attempts. Try again in a few minutes.", "error")
            return render_template("login.html", has_users=users.has_users()), 429
        u = users.verify(request.form.get("username"), request.form.get("password"))
        if u:
            _fails.pop(ip, None)
            session.clear()
            session.permanent = True
            session["user"] = u
            nxt = request.args.get("next", "")
            return redirect(nxt if re.fullmatch(r"/[A-Za-z0-9_./-]*", nxt) else url_for("dashboard"))
        _fails[ip] = (cnt + 1, first)
        flash("Wrong username or password.", "error")
    return render_template("login.html", has_users=users.has_users())


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    q = request.args.get("q", "").strip().lower()
    partner = request.args.get("partner", "")
    day = request.args.get("date", "")
    rows = list(reversed(storage.list_dispatches()))
    items = storage.all_items() if q else {}
    out = []
    for r in rows:
        if partner and r["partner"] != partner:
            continue
        if day and not r["dispatch_dt"].startswith(day):
            continue
        if q:
            hay = " ".join([r["dispatch_id"], r["manifest_no"], r["gatepass_no"], r["partner"], r["courier_name"],
                            r["courier_phone"], r["vehicle_no"], r["employee"]]).lower()
            if q not in hay and not any(q in x.lower() for x in items.get(r["dispatch_id"], [])):
                continue
        out.append(r)
    return render_template("dashboard.html", rows=out[:300], total=len(out), q=request.args.get("q", ""),
                           partner=partner, day=day, partners=PARTNERS)


@app.route("/new", methods=["GET", "POST"])
@login_required
def new():
    form = {
        "dispatch_dt": storage.now_ist().strftime("%Y-%m-%dT%H:%M"),
        "employee": session["user"]["name"],
        "partner": "", "courier_name": "", "courier_phone": "",
        "vehicle_no": "", "vehicle_type": "", "notes": "", "refs": "",
    }
    if request.method == "POST":
        for k in form:
            form[k] = request.form.get(k, "").strip()
        errs = []
        phone = re.sub(r"[\s-]", "", form["courier_phone"])
        digits = re.sub(r"^\+?91", "", phone)
        if not re.fullmatch(r"\d{10}", digits):
            errs.append("Courier boy phone must be a 10 digit number.")
        for k, label in [("employee", "Employee name"), ("partner", "Logistics partner"),
                         ("courier_name", "Courier boy name"), ("vehicle_no", "Vehicle number"),
                         ("vehicle_type", "Vehicle type")]:
            if not form[k]:
                errs.append(label + " is required.")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", form["dispatch_dt"]):
            errs.append("Date and time is invalid.")
        refs = storage.split_refs(form["refs"])
        if not refs:
            errs.append("Add at least one Order ID / AWB number.")
        if len(refs) > 1000:
            errs.append("Maximum 1000 shipments per manifest.")
        if errs:
            for e in errs:
                flash(e, "error")
        else:
            rec = dict(
                dispatch_dt=form["dispatch_dt"].replace("T", " "),
                employee=form["employee"][:80], partner=form["partner"][:60],
                courier_name=form["courier_name"][:80], courier_phone=digits,
                vehicle_no=re.sub(r"\s+", " ", form["vehicle_no"]).upper()[:20],
                vehicle_type=form["vehicle_type"][:30], notes=form["notes"][:300],
            )
            did, dups = storage.create_dispatch(rec, refs, session["user"]["name"])
            if dups:
                flash("Saved. Note: %d AWB/order id(s) were already in an earlier manifest: %s"
                      % (len(dups), ", ".join(dups[:10])), "warn")
            else:
                flash("Manifest and gatepass created.", "ok")
            return redirect(url_for("view", dispatch_id=did))
    return render_template("new.html", f=form, partners=PARTNERS, vtypes=VEHICLE_TYPES)


def _get_or_404(dispatch_id):
    if not re.fullmatch(r"YR-\d{8}-\d{3}", dispatch_id):
        abort(404)
    d = storage.get_dispatch(dispatch_id)
    if not d:
        abort(404)
    return d


@app.route("/d/<dispatch_id>")
@login_required
def view(dispatch_id):
    return render_template("view.html", d=_get_or_404(dispatch_id))


def _pdf(data, name):
    return send_file(io.BytesIO(data), mimetype="application/pdf", as_attachment=True, download_name=name)


@app.route("/d/<dispatch_id>/manifest.pdf")
@login_required
def manifest_pdf(dispatch_id):
    d = _get_or_404(dispatch_id)
    return _pdf(pdfs.manifest_pdf(d), "%s.pdf" % d["manifest_no"])


@app.route("/d/<dispatch_id>/gatepass.pdf")
@login_required
def gatepass_pdf(dispatch_id):
    d = _get_or_404(dispatch_id)
    return _pdf(pdfs.gatepass_pdf(d), "%s.pdf" % d["gatepass_no"])


@app.route("/d/<dispatch_id>/gate/<which>", methods=["POST"])
@login_required
def gate(dispatch_id, which):
    _get_or_404(dispatch_id)
    if which not in ("entry", "exit"):
        abort(404)
    if storage.mark_gate(dispatch_id, which):
        flash("Vehicle %s time recorded." % which, "ok")
    else:
        flash("Already recorded.", "warn")
    return redirect(url_for("view", dispatch_id=dispatch_id))


@app.route("/export.xlsx")
@login_required
def export():
    with storage.LOCK:
        with open(storage.XLSX_PATH, "rb") as f:
            data = f.read()
    return Response(data, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=youth-robe-manifest-database.xlsx"})


if __name__ == "__main__":
    storage._open().close()
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")))
