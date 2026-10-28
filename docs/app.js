// YOUTH ROBE Manifest & Gatepass: browser app. All user text is inserted as text nodes (never HTML).
(function () {
  const cfg = window.APP_CONFIG;
  const app = document.getElementById("app");
  const TOKEN_KEY = "yr_token";
  let user = null;
  let records = [];
  let loaded = false;
  let filters = { q: "", partner: "", date: "" };

  // ---------- helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function parts() {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return p;
  }
  const nowStr = () => { const p = parts(); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };
  const nowInput = () => nowStr().replace(" ", "T");
  const label = () => user.name;
  const dupMap = (d) => { const m = new Map(); (d.duplicates || []).forEach((x) => m.set(x.ref.toUpperCase(), x)); return m; };
  const dupWhy = (x) => [x.earlier.length ? "already in " + x.earlier.join(", ") : "", x.times_in_list > 1 ? `entered ${x.times_in_list} times in this list` : ""].filter(Boolean).join("; ");

  let pending = null; // message to show after the next page render
  function go(hash, msg, kind) {
    pending = msg ? { msg, kind } : null;
    if (location.hash === hash) route(); else location.hash = hash;
  }

  let flashEl = null;
  function flash(msg, kind) {
    if (flashEl) flashEl.remove();
    flashEl = h("div", { class: "flash " + (kind || "ok"), role: "status" }, msg);
    const main = document.getElementById("main");
    if (main) main.prepend(flashEl);
    window.scrollTo(0, 0);
  }

  function shell(...content) {
    const nav = user ? h("nav", {},
      h("a", { href: "#/" }, "All records"),
      h("a", { class: "btn small", href: "#/new" }, "+ New"),
      h("button", { class: "link", onclick: logout, title: user.login }, "Logout")) : null;
    app.replaceChildren(
      h("header", { class: "top" },
        h("a", { class: "brand", href: user ? "#/" : "#/login" }, "YOUTH ROBE", h("small", {}, "Manifest & Gatepass")), nav),
      h("main", { id: "main" }, ...content));
    flashEl = null;
  }

  // ---------- auth ----------
  function logout() {
    sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY);
    GH.disconnect(); user = null; records = []; loaded = false;
    go("#/login");
  }

  function viewLogin(msg) {
    const tokenIn = h("input", { type: "password", autocomplete: "off", required: true, placeholder: "github_pat_..." });
    const remember = h("input", { type: "checkbox" });
    const btn = h("button", { class: "btn" }, "Sign in");
    const form = h("form", { class: "card narrow", onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true; btn.textContent = "Checking...";
      try {
        user = await GH.connect(tokenIn.value);
        (remember.checked ? localStorage : sessionStorage).setItem(TOKEN_KEY, tokenIn.value.trim());
        go("#/");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Sign in"; flash(err.message, "error");
      }
    } },
      h("h1", {}, "Sign in"),
      h("p", { class: "muted small" }, "Use your personal GitHub access token. Only people added to the private data repository can sign in."),
      h("label", {}, "Access token", tokenIn),
      h("label", { class: "check" }, remember, " Remember on this device (only on your own phone/computer)"),
      btn);
    shell(form);
    if (msg) flash(msg, "error");
  }

  // ---------- data ----------
  async function refresh(force) {
    if (loaded && !force) return;
    records = await GH.loadAll();
    loaded = true;
  }

  // ---------- views ----------
  function viewList() {
    const partners = Array.from(new Set(cfg.partners.concat(records.map((r) => r.partner)))).sort();
    const q = h("input", { name: "q", value: filters.q, placeholder: "Search AWB, order id, courier, vehicle, manifest no..." });
    const ps = h("select", {}, h("option", { value: "" }, "All partners"),
      partners.map((p) => h("option", { value: p, selected: p === filters.partner }, p)));
    const dt = h("input", { type: "date", value: filters.date });
    const holder = h("div");

    function draw() {
      filters = { q: q.value, partner: ps.value, date: dt.value };
      const needle = filters.q.trim().toLowerCase();
      const rows = records.filter((r) => {
        if (filters.partner && r.partner !== filters.partner) return false;
        if (filters.date && !r.dispatch_dt.startsWith(filters.date)) return false;
        if (needle) {
          const hay = [r.id, r.manifest_no, r.gatepass_no, r.partner, r.courier_name, r.courier_phone, r.vehicle_no, r.employee].join(" ").toLowerCase();
          if (!hay.includes(needle) && !r.items.some((x) => x.toLowerCase().includes(needle))) return false;
        }
        return true;
      });
      const shown = rows.slice(0, 300);
      holder.replaceChildren(
        h("p", { class: "muted" }, `${rows.length} record(s)` + (rows.length > shown.length ? ", showing latest 300" : "")),
        shown.length ? h("div", { class: "table-wrap" }, h("table", {},
          h("thead", {}, h("tr", {}, ["Date & time", "Partner", "Courier boy", "Vehicle", "Shipments", "Gate", "Downloads"].map((t) => h("th", {}, t)))),
          h("tbody", {}, shown.map((r) => h("tr", {},
            h("td", {}, h("a", { href: "#/d/" + r.id }, r.dispatch_dt), h("br"), h("small", { class: "muted" }, r.manifest_no)),
            h("td", {}, r.partner),
            h("td", {}, r.courier_name, h("br"), h("small", { class: "muted" }, r.courier_phone)),
            h("td", {}, r.vehicle_no, h("br"), h("small", { class: "muted" }, r.vehicle_type)),
            h("td", {}, r.items.length, r.duplicates.length ? [h("br"), h("span", { class: "pill warn" }, `\u26A0 ${r.duplicates.length} duplicate`)] : null),
            h("td", {}, h("span", { class: "pill" + (r.entry_time ? " ok" : "") }, "In"), " ", h("span", { class: "pill" + (r.exit_time ? " ok" : "") }, "Out")),
            h("td", { class: "nowrap" },
              h("button", { class: "link", onclick: () => download("manifest", r) }, "Manifest"), " | ",
              h("button", { class: "link", onclick: () => download("gatepass", r) }, "Gatepass"))))))) :
          h("div", { class: "card" }, "No records found. ", h("a", { href: "#/new" }, "Create the first manifest & gatepass"), "."));
    }
    [q, ps, dt].forEach((el) => el.addEventListener("input", draw));

    shell(
      h("div", { class: "row between" }, h("h1", {}, "All records"),
        h("div", { class: "row" },
          h("button", { class: "btn ghost", onclick: async () => { try { await refresh(true); viewList(); } catch (e) { flash(e.message, "error"); } } }, "Refresh"),
          h("button", { class: "btn ghost", onclick: exportExcel }, "Download full Excel"))),
      h("div", { class: "filters" }, q, ps, dt), holder);
    draw();
  }

  function viewNew() {
    const f = (name, props) => h("input", Object.assign({ name }, props));
    const dtI = f("dispatch_dt", { type: "datetime-local", value: nowInput(), required: true });
    const emp = f("employee", { value: user.name, required: true, maxlength: 80 });
    const partner = f("partner", { list: "partners", required: true, maxlength: 60, placeholder: "e.g. Delhivery" });
    const cname = f("courier_name", { required: true, maxlength: 80 });
    const cphone = f("courier_phone", { required: true, inputmode: "tel", placeholder: "10 digit number" });
    const vno = f("vehicle_no", { required: true, maxlength: 20, placeholder: "MP 09 AB 1234", class: "upper" });
    const vtype = h("select", { name: "vehicle_type", required: true }, h("option", { value: "" }, "Select..."), cfg.vehicleTypes.map((v) => h("option", {}, v)));
    const notes = f("notes", { maxlength: 300 });
    const refs = h("textarea", { name: "refs", rows: 10, required: true, placeholder: "One per line (or separated by commas / spaces)" });
    const btn = h("button", { class: "btn" }, "Create manifest & gatepass");

    const form = h("form", { class: "card grid", onsubmit: async (e) => {
      e.preventDefault();
      const errs = [];
      const digits = cphone.value.replace(/[\s-]/g, "").replace(/^\+?91/, "");
      if (!/^\d{10}$/.test(digits)) errs.push("Courier boy phone must be a 10 digit number.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dtI.value)) errs.push("Date and time is invalid.");
      const seen = new Map(), items = [];
      refs.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
        const k = s.toUpperCase();
        if (!seen.has(k)) { seen.set(k, 1); items.push(s.slice(0, 60)); } else seen.set(k, seen.get(k) + 1);
      });
      if (!items.length) errs.push("Add at least one Order ID / AWB number.");
      if (items.length > 1000) errs.push("Maximum 1000 shipments per manifest.");
      if (errs.length) { flash(errs.join(" "), "error"); return; }

      btn.disabled = true; btn.textContent = "Saving...";
      try {
        await refresh(false);
        const prior = new Map();
        records.forEach((r) => r.items.forEach((x) => { const k = x.toUpperCase(); if (!prior.has(k)) prior.set(k, []); prior.get(k).push(r.manifest_no); }));
        const duplicates = [];
        items.forEach((x) => {
          const k = x.toUpperCase(), earlier = prior.get(k) || [], times = seen.get(k) || 1;
          if (earlier.length || times > 1) duplicates.push({ ref: x, earlier: earlier.slice(0, 5), times_in_list: times });
        });
        const rec = await GH.createRecord({
          dispatch_dt: dtI.value.replace("T", " "), employee: emp.value.trim().slice(0, 80), partner: partner.value.trim().slice(0, 60),
          courier_name: cname.value.trim().slice(0, 80), courier_phone: digits,
          vehicle_no: vno.value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 20), vehicle_type: vtype.value,
          notes: notes.value.trim().slice(0, 300), items, duplicates,
        }, label(), nowStr());
        records.unshift(rec);
        go("#/d/" + rec.id,
          duplicates.length ? `Saved with WARNING: ${duplicates.length} duplicate AWB/Order ID(s): ${duplicates.slice(0, 10).map((x) => x.ref).join(", ")}. They are highlighted in the manifest.` : "Manifest and gatepass created.",
          duplicates.length ? "warn" : "ok");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Create manifest & gatepass"; flash(err.message, "error");
      }
    } },
      h("label", {}, "Date & time", dtI), h("label", {}, "Employee name (Youth Robe)", emp),
      h("label", {}, "Logistics partner", partner, h("datalist", { id: "partners" }, cfg.partners.map((p) => h("option", { value: p })))),
      h("label", {}, "Courier boy name", cname),
      h("label", {}, "Courier boy phone", cphone), h("label", {}, "Vehicle number", vno),
      h("label", {}, "Vehicle type", vtype), h("label", {}, "Notes (optional)", notes),
      h("label", { class: "full" }, "Order IDs / AWB numbers", refs, h("small", { class: "muted" }, "Paste straight from a sheet. Duplicates inside this list are removed automatically.")),
      h("div", { class: "full" }, btn));
    shell(h("h1", {}, "New manifest & gatepass"), h("p", { class: "muted" }, "Enter the details once. Both documents are generated from the same record."), form);
  }

  function viewDetail(id) {
    const d = records.find((r) => r.id === id);
    if (!d) { shell(h("div", { class: "card" }, "Record not found. ", h("a", { href: "#/" }, "Back to all records"))); return; }
    const dl = (k, v, wide) => h("div", { class: wide ? "wide" : "" }, h("dt", {}, k), h("dd", {}, v || "-"));
    const gate = (which, title, val) => h("div", { class: "gatebox" }, h("strong", {}, title),
      val ? h("div", { class: "big" }, val) : h("button", { class: "btn ghost", onclick: async (e) => {
        e.target.disabled = true;
        try {
          const res = await GH.markGate(d, which, label(), nowStr());
          records[records.findIndex((r) => r.id === d.id)] = res.record;
          viewDetail(id);
          flash(res.changed ? `Vehicle ${which} time recorded.` : "Already recorded by someone else.", res.changed ? "ok" : "warn");
        } catch (err) { e.target.disabled = false; flash(err.message, "error"); }
      } }, `Mark ${which} now`));

    shell(
      h("div", { class: "row between" }, h("h1", {}, d.manifest_no, " ", h("span", { class: "muted" }, "/ " + d.gatepass_no)), h("a", { href: "#/" }, "← All records")),
      h("div", { class: "actions" },
        h("button", { class: "btn", onclick: () => download("manifest", d) }, "Download Manifest PDF"),
        h("button", { class: "btn", onclick: () => download("gatepass", d) }, "Download Gatepass PDF")),
      h("div", { class: "card" }, h("dl", { class: "details" },
        dl("Date & time", d.dispatch_dt), dl("Logistics partner", d.partner), dl("Courier boy", d.courier_name), dl("Phone", d.courier_phone),
        dl("Vehicle number", d.vehicle_no), dl("Vehicle type", d.vehicle_type), dl("Employee", d.employee),
        dl("Created", `${d.created_at} by ${d.created_by}`), d.notes ? dl("Notes", d.notes, true) : null)),
      h("div", { class: "card" }, h("h2", {}, "Gate record"),
        h("div", { class: "gate" }, gate("entry", "Vehicle entry", d.entry_time), gate("exit", "Vehicle exit", d.exit_time)),
        h("p", { class: "muted small" }, "Times are recorded once and cannot be overwritten. The downloaded gatepass shows them.")),
      d.duplicates.length ? h("div", { class: "warnbox" }, h("strong", {}, `\u26A0 WARNING: ${d.duplicates.length} duplicate Order ID / AWB`),
        h("ul", {}, d.duplicates.map((x) => h("li", {}, h("b", {}, x.ref), " \u2013 " + dupWhy(x))))) : null,
      h("div", { class: "card" }, h("h2", {}, `Shipments (${d.items.length})`), h("ol", { class: "refs" }, d.items.map((x) => {
        const dp = dupMap(d).get(x.toUpperCase());
        return h("li", { class: dp ? "dup" : "", title: dp ? dupWhy(dp) : null }, x, dp ? h("span", { class: "tag" }, "DUPLICATE") : null);
      }))));
  }

  // ---------- actions ----------
  async function download(kind, rec) {
    try {
      const doc = await (kind === "manifest" ? PDFGen.manifest(rec) : PDFGen.gatepass(rec));
      doc.save((kind === "manifest" ? rec.manifest_no : rec.gatepass_no) + ".pdf");
    } catch (e) { flash("Could not create the PDF: " + e.message, "error"); }
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const disp = [["Dispatch ID", "Manifest No", "Gatepass No", "Dispatch Date & Time", "Employee Name", "Logistics Partner", "Courier Boy Name", "Courier Boy Phone",
      "Vehicle Number", "Vehicle Type", "Total Orders / AWB", "Duplicate Warning", "Notes", "Gate Entry Time", "Gate Exit Time", "Created By", "Created At"]];
    const items = [["Dispatch ID", "Sr No", "Order ID / AWB", "Duplicate?"]];
    records.slice().reverse().forEach((r) => {
      disp.push([r.id, r.manifest_no, r.gatepass_no, r.dispatch_dt, r.employee, r.partner, r.courier_name, r.courier_phone, r.vehicle_no, r.vehicle_type,
        r.items.length, r.duplicates.length ? r.duplicates.length + " duplicate: " + r.duplicates.map((x) => x.ref).join(", ") : "", r.notes || "", r.entry_time || "", r.exit_time || "", r.created_by, r.created_at]);
      const dm = dupMap(r);
      r.items.forEach((x, i) => { const dp = dm.get(x.toUpperCase()); items.push([r.id, i + 1, x, dp ? "DUPLICATE (" + dupWhy(dp) + ")" : ""]); });
    });
    const w1 = XLSX.utils.aoa_to_sheet(disp), w2 = XLSX.utils.aoa_to_sheet(items);
    w1["!cols"] = [20, 20, 20, 20, 18, 20, 20, 16, 16, 14, 12, 30, 30, 18, 18, 14, 18].map((wch) => ({ wch }));
    w2["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 30 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, w1, "Dispatches");
    XLSX.utils.book_append_sheet(wb, w2, "Items");
    XLSX.writeFile(wb, "youth-robe-manifest-database.xlsx");
  }

  // ---------- router ----------
  async function route() {
    const hash = location.hash || "#/";
    if (!user) {
      const t = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      if (t) {
        try { user = await GH.connect(t); } catch (e) {
          sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY);
          return viewLogin(e.message);
        }
      } else return viewLogin();
    }
    shell(h("p", { class: "muted" }, "Loading..."));
    try { await refresh(false); } catch (e) { shell(h("div", { class: "flash error" }, "Could not load records: " + e.message), h("button", { class: "btn", onclick: () => { loaded = false; route(); } }, "Try again")); return; }
    const m = hash.match(/^#\/d\/(.+)$/);
    if (hash === "#/new") viewNew();
    else if (m && GH.ID_RE.test(m[1])) viewDetail(m[1]);
    else viewList();
    if (pending) { flash(pending.msg, pending.kind); pending = null; }
  }

  window.addEventListener("hashchange", route);
  route();
})();
