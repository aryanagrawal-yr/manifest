// RAZZAI WORLD Truck Manifest & Gatepass: browser app. All user text is inserted as text nodes (never HTML).
(function () {
  const cfg = window.APP_CONFIG;
  const app = document.getElementById("app");
  const TOKEN_KEY = "rw_token";
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

  // Parse rows pasted from a sheet: Order ID, AWB, Boxes, Weight (tab, comma or spaces between columns)
  function parsePasted(text) {
    const out = [];
    text.split(/\r?\n/).forEach((line) => {
      line = line.trim();
      if (!line) return;
      const c = (line.includes("\t") ? line.split("\t") : line.includes(",") ? line.split(",") : line.split(/\s+/)).map((x) => x.trim());
      if (/order/i.test(c[0]) && /awb/i.test(c[1] || "")) return; // header row
      let order = "", awb = "", boxes = 1, weight = "";
      if (c.length === 1) { if (/^#/.test(c[0]) || /^\d{1,8}$/.test(c[0])) order = c[0]; else awb = c[0]; }
      else {
        order = c[0]; awb = c[1] || "";
        if (c[2]) boxes = parseInt(c[2], 10) || 1;
        if (c[3]) { weight = parseFloat(c[3]); if (isNaN(weight)) weight = ""; }
      }
      out.push({ order_id: order, awb, boxes, weight });
    });
    return out;
  }

  // Which Order IDs / AWBs are repeated: already in earlier manifests, or entered more than once here.
  function findDuplicates(items) {
    const add = (m, k, no) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(no); };
    const prior = { awb: new Map(), order: new Map() };
    records.forEach((r) => r.items.forEach((x) => {
      if (x.awb) add(prior.awb, Ship.normAwb(x.awb), r.manifest_no);
      if (x.order_id) add(prior.order, Ship.normOrder(x.order_id), r.manifest_no);
    }));
    const mine = { awb: new Map(), order: new Map() };
    items.forEach((x) => {
      if (x.awb) { const k = Ship.normAwb(x.awb), e = mine.awb.get(k) || { ref: x.awb, n: 0 }; e.n++; mine.awb.set(k, e); }
      if (x.order_id) { const k = Ship.normOrder(x.order_id), e = mine.order.get(k) || { ref: x.order_id, n: 0 }; e.n++; mine.order.set(k, e); }
    });
    const out = [];
    [["AWB", "awb"], ["Order ID", "order"]].forEach(([kind, key]) => mine[key].forEach((e, k) => {
      const earlier = prior[key].has(k) ? Array.from(prior[key].get(k)).slice(0, 5) : [];
      if (earlier.length || e.n > 1) out.push({ ref: e.ref, kind, earlier, times_in_list: e.n });
    }));
    return out;
  }

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
        h("a", { class: "brand", href: user ? "#/" : "#/login" }, h("span", {}, "RAZZAI WORLD", h("small", {}, "Truck Manifest & Gate Pass  |  Harda - Indore"))), nav),
      h("div", { class: "stripe" }),
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
    const q = h("input", { name: "q", value: filters.q, placeholder: "Search AWB, order id, driver, vehicle, seal, manifest no..." });
    const ps = h("select", {}, h("option", { value: "" }, "All routes"),
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
          const hay = [r.id, r.manifest_no, r.gatepass_no, r.partner, r.seal_no, r.courier_name, r.courier_phone, r.vehicle_no, r.employee].join(" ").toLowerCase();
          if (!hay.includes(needle) && !r.items.some((x) => (x.awb + " " + x.order_id).toLowerCase().includes(needle))) return false;
        }
        return true;
      });
      const shown = rows.slice(0, 300);
      holder.replaceChildren(
        h("p", { class: "muted" }, `${rows.length} record(s)` + (rows.length > shown.length ? ", showing latest 300" : "")),
        shown.length ? h("div", { class: "table-wrap" }, h("table", { class: "cards" },
          h("thead", {}, h("tr", {}, ["Date & time", "Route", "Driver", "Vehicle", "Shipments", "Trip", "Downloads"].map((t) => h("th", {}, t)))),
          h("tbody", {}, shown.map((r) => h("tr", {},
            h("td", { "data-label": "Date & time" }, h("a", { href: "#/d/" + r.id }, r.dispatch_dt), h("br"), h("small", { class: "muted" }, r.manifest_no)),
            h("td", { "data-label": "Route" }, r.partner),
            h("td", { "data-label": "Driver" }, r.courier_name, h("br"), h("small", { class: "muted" }, r.courier_phone)),
            h("td", { "data-label": "Vehicle" }, r.vehicle_no, h("br"), h("small", { class: "muted" }, r.vehicle_type)),
            h("td", { "data-label": "Shipments" }, r.items.length, r.duplicates.length ? [h("br"), h("span", { class: "pill warn" }, `\u26A0 ${r.duplicates.length} duplicate`)] : null),
            h("td", { "data-label": "Trip" }, h("span", { class: "pill" + (r.entry_time ? " ok" : "") }, "Left"), " ", h("span", { class: "pill" + (r.exit_time ? " ok" : "") }, "Arrived")),
            h("td", { class: "nowrap", "data-label": "Downloads" },
              h("button", { class: "link", onclick: () => download("manifest", r) }, "Manifest"), " ",
              h("button", { class: "link", onclick: () => download("manifest", r, "bw") }, "B&W"), " ",
              h("button", { class: "link", onclick: () => download("gatepass", r) }, "Gatepass"), " ",
              h("button", { class: "link", onclick: () => download("gatepass", r, "bw") }, "(B&W)"))))))) :
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

  function shipmentEditor() {
    const body = h("tbody");
    const renumber = () => Array.from(body.children).forEach((tr, i) => { tr.firstChild.textContent = String(i + 1); });
    function addRow(v) {
      v = v || {};
      const tr = h("tr", {},
        h("td", { class: "sno" }),
        h("td", {}, h("input", { "aria-label": "Order ID", placeholder: "Order ID", value: v.order_id || "", maxlength: 40 })),
        h("td", {}, h("input", { "aria-label": "AWB number", placeholder: "AWB number", value: v.awb || "", maxlength: 40 })),
        h("td", {}, h("input", { "aria-label": "Boxes", placeholder: "Boxes", type: "number", min: 1, step: 1, value: v.boxes || 1 })),
        h("td", {}, h("input", { "aria-label": "Weight in kg", placeholder: "Weight (kg)", type: "number", min: 0, step: "0.01", value: v.weight === undefined ? "" : v.weight })),
        h("td", {}, h("button", { type: "button", class: "link", title: "Remove row", onclick: () => { tr.remove(); renumber(); } }, "\u2715")));
      body.append(tr); renumber();
    }
    addRow();
    // ---- barcode scanning: a USB/Bluetooth scanner types the code and presses Enter; phones can use the camera ----
    let pendingOrder = null;
    const status = h("div", { class: "scanstatus muted" }, "Ready. Click here and scan a barcode.");
    const mode = h("select", { "aria-label": "Scan as" },
      h("option", { value: "awb" }, "Scan AWB numbers"), h("option", { value: "order" }, "Scan Order IDs"),
      h("option", { value: "pair" }, "Scan Order ID, then its AWB"));
    const scanIn = h("input", { class: "scanin", placeholder: "Scan barcode here (scanner presses Enter)", autocomplete: "off", autocapitalize: "off", enterkeyhint: "done", "aria-label": "Barcode scan box" });
    const beep = (ok) => { try {
      const AC = window.AudioContext || window.webkitAudioContext, c = new AC(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = ok ? 880 : 300; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? 0.08 : 0.3));
      setTimeout(() => c.close(), 500); } catch (e) { /* sound is optional */ } };
    const existing = (field, val) => {
      const norm = field === "awb" ? Ship.normAwb : Ship.normOrder;
      return Array.from(body.querySelectorAll("tr")).filter((tr) => { const i = tr.querySelectorAll("input")[field === "awb" ? 1 : 0]; return i.value.trim() && norm(i.value) === norm(val); }).length;
    };
    function addScanned(v) {
      const first = body.firstChild;
      if (body.children.length === 1 && Array.from(first.querySelectorAll("input")).slice(0, 2).every((i) => !i.value.trim())) first.remove();
      addRow(v);
      const last = body.lastChild; last.classList.add("fresh"); if (last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
    }
    function onScan(raw) {
      const code = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!code) return;
      const m = mode.value;
      if (m === "pair" && pendingOrder === null) { pendingOrder = code; beep(true); status.className = "scanstatus"; status.textContent = `Order ${code} scanned. Now scan its AWB.`; return; }
      const rec = m === "awb" ? { awb: code } : m === "order" ? { order_id: code } : { order_id: pendingOrder, awb: code };
      pendingOrder = null;
      const dupA = rec.awb ? existing("awb", rec.awb) : 0, dupO = rec.order_id ? existing("order", rec.order_id) : 0;
      addScanned(rec);
      const n = body.children.length;
      if (dupA || dupO) { beep(false); status.className = "scanstatus bad"; status.textContent = `DUPLICATE: ${dupA ? "AWB " + rec.awb : "Order " + rec.order_id} was already scanned in this list. Added anyway and will be flagged. (${n} rows)`; }
      else { beep(true); status.className = "scanstatus good"; status.textContent = `Added ${rec.awb || rec.order_id}${rec.order_id && rec.awb ? " (" + rec.order_id + ")" : ""}. ${n} row(s) so far.`; }
    }
    scanIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault(); onScan(scanIn.value); scanIn.value = "";
    });
    mode.addEventListener("change", () => { pendingOrder = null; scanIn.focus(); });
    let camBtn = null;
    if ("BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      camBtn = h("button", { type: "button", class: "btn ghost small", onclick: openCamera }, "Scan with camera");
    }
    function openCamera() {
      const video = h("video", { playsinline: true, muted: true, autoplay: true });
      const msg = h("div", { class: "camhint" }, "Point the camera at a barcode. Each scan is added to the list.");
      let stream = null, timer = null, lastCode = "", lastAt = 0;
      const close = () => { clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); overlay.remove(); };
      const overlay = h("div", { class: "camwrap" }, video, msg, h("button", { type: "button", class: "btn", onclick: close }, "Done"));
      document.body.append(overlay);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((st) => {
        stream = st; video.srcObject = st; video.play();
        const det = new window.BarcodeDetector();
        let busy = false;
        timer = setInterval(async () => {
          if (busy || video.readyState < 2) return; busy = true;
          try {
            const found = await det.detect(video);
            if (found.length) {
              const v = found[0].rawValue, now = Date.now();
              if (v && (v !== lastCode || now - lastAt > 2500)) { lastCode = v; lastAt = now; onScan(v); msg.textContent = status.textContent; }
            }
          } catch (e) { /* ignore frame errors */ }
          busy = false;
        }, 300);
      }).catch(() => { msg.textContent = "Camera is not available. Allow camera access in the browser, or type / use a scanner instead."; });
    }
    const paste = h("textarea", { rows: 4, placeholder: "Order ID, AWB, Boxes, Weight (one shipment per line)" });
    const el = h("div", {},
      h("strong", {}, "Shipments"),
      h("div", { class: "scanbox" },
        h("div", { class: "row" }, mode, camBtn),
        scanIn, status),
      h("div", { class: "table-wrap shipt" }, h("table", {},
        h("thead", {}, h("tr", {}, ["#", "Order ID", "AWB number", "Boxes", "Weight (kg)", ""].map((t) => h("th", {}, t)))), body)),
      h("div", { class: "row addrow" }, h("button", { type: "button", class: "btn ghost small", onclick: () => addRow() }, "+ Add row")),
      h("label", {}, "Or paste from Excel / Google Sheet", paste,
        h("small", { class: "muted" }, "Columns: Order ID, AWB, Boxes, Weight. A line with a single value is treated as an Order ID if it starts with # or is a short number, otherwise as an AWB.")),
      h("button", { type: "button", class: "btn ghost small", onclick: () => {
        const rows = parsePasted(paste.value);
        if (!rows.length) { flash("Nothing to add. Paste one shipment per line.", "error"); return; }
        const first = body.firstChild;
        if (body.children.length === 1 && Array.from(first.querySelectorAll("input")).slice(0, 2).every((i) => !i.value.trim())) first.remove();
        rows.forEach(addRow); paste.value = "";
      } }, "Add pasted rows"));
    function read() {
      const items = [], errors = [];
      Array.from(body.children).forEach((tr, idx) => {
        const v = Array.from(tr.querySelectorAll("input")).map((i) => i.value.trim());
        if (!v[0] && !v[1]) return; // blank row
        const boxes = v[2] === "" ? 1 : Number(v[2]), weight = v[3] === "" ? 0 : Number(v[3]);
        if (!Number.isInteger(boxes) || boxes < 1 || boxes > 999) errors.push(`Row ${idx + 1}: boxes must be a whole number from 1 to 999.`);
        else if (!(weight >= 0) || weight > 9999) errors.push(`Row ${idx + 1}: weight must be a number in kg.`);
        else items.push({ order_id: v[0].slice(0, 40), awb: v[1].slice(0, 40), boxes, weight: Math.round(weight * 100) / 100 });
      });
      if (!items.length && !errors.length) errors.push("Add at least one shipment (Order ID or AWB).");
      if (items.length > 500) errors.push("Maximum 500 shipments per manifest.");
      return { items, errors };
    }
    return { el, read };
  }

  function viewNew() {
    const f = (name, props) => h("input", Object.assign({ name }, props));
    const dtI = f("dispatch_dt", { type: "datetime-local", value: nowInput(), required: true });
    const emp = f("employee", { value: user.name, required: true, maxlength: 80 });
    const partner = h("select", { name: "partner", required: true }, h("option", { value: "" }, "Select direction..."), cfg.partners.map((p) => h("option", { value: p }, p)));
    const seal = f("seal_no", { required: true, maxlength: 30, class: "upper", placeholder: "Seal / lock number" });
    const cname = f("courier_name", { required: true, maxlength: 80 });
    const cphone = f("courier_phone", { required: true, inputmode: "tel", placeholder: "10 digit number" });
    const vno = f("vehicle_no", { required: true, maxlength: 20, placeholder: "MP 09 AB 1234", class: "upper" });
    const vtype = h("select", { name: "vehicle_type", required: true }, h("option", { value: "" }, "Select..."), cfg.vehicleTypes.map((v) => h("option", {}, v)));
    const notes = f("notes", { maxlength: 300 });
    const ship = shipmentEditor();
    const btn = h("button", { class: "btn" }, "Create manifest & gatepass");

    const form = h("form", { class: "card grid", onsubmit: async (e) => {
      e.preventDefault();
      const errs = [];
      const digits = cphone.value.replace(/[\s-]/g, "").replace(/^\+?91/, "");
      if (!/^\d{10}$/.test(digits)) errs.push("Driver phone must be a 10 digit number.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dtI.value)) errs.push("Date and time is invalid.");
      const sr = ship.read(), items = sr.items;
      errs.push(...sr.errors);
      if (errs.length) { flash(errs.join(" "), "error"); return; }

      btn.disabled = true; btn.textContent = "Saving...";
      try {
        await refresh(false);
        const duplicates = findDuplicates(items);
        const rec = await GH.createRecord({
          dispatch_dt: dtI.value.replace("T", " "), employee: emp.value.trim().slice(0, 80), partner: partner.value, seal_no: seal.value.trim().toUpperCase().slice(0, 30),
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
      h("label", {}, "Date & time", dtI), h("label", {}, "Employee name (Razzai World)", emp),
      h("label", {}, "Route (direction)", partner), h("label", {}, "Seal number", seal),
      h("label", {}, "Driver name", cname),
      h("label", {}, "Driver phone", cphone), h("label", {}, "Vehicle number", vno),
      h("label", {}, "Vehicle type", vtype), h("label", {}, "Notes (optional)", notes),
      h("div", { class: "full" }, ship.el),
      h("div", { class: "full" }, btn));
    shell(h("h1", {}, "New manifest & gatepass"), h("p", { class: "muted" }, "Enter the details once. Both documents are generated from the same record."), form);
  }

  function viewDetail(id) {
    const d = records.find((r) => r.id === id);
    if (!d) { shell(h("div", { class: "card" }, "Record not found. ", h("a", { href: "#/" }, "Back to all records"))); return; }
    const t = Ship.totals(d.items);
    const dl = (k, v, wide) => h("div", { class: wide ? "wide" : "" }, h("dt", {}, k), h("dd", {}, v || "-"));
    const gate = (which, title, val) => {
      if (val) return h("div", { class: "gatebox" }, h("strong", {}, title), h("div", { class: "big" }, val),
        h("small", { class: "muted" }, "Saved by " + (d[which + "_by"] || "-")));
      const inp = h("input", { type: "datetime-local", value: nowInput(), max: nowInput(), "aria-label": title + " date and time" });
      const btn = h("button", { class: "btn ghost", onclick: async () => {
        const t = inp.value.replace("T", " ");
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)) { flash("Choose a valid date and time.", "error"); return; }
        if (t > nowStr()) { flash("The time cannot be in the future.", "error"); return; }
        if (which === "exit" && d.entry_time && t < d.entry_time) { flash(`Arrival cannot be before departure (${d.entry_time}).`, "error"); return; }
        if (which === "entry" && d.exit_time && t > d.exit_time) { flash(`Departure cannot be after arrival (${d.exit_time}).`, "error"); return; }
        btn.disabled = true;
        try {
          const res = await GH.markGate(d, which, label(), t, nowStr());
          records[records.findIndex((r) => r.id === d.id)] = res.record;
          viewDetail(id);
          flash(res.changed ? which === "entry" ? "Departure time saved." : "Arrival time saved." : "Already recorded by someone else.", res.changed ? "ok" : "warn");
        } catch (err) { btn.disabled = false; flash(err.message, "error"); }
      } }, which === "entry" ? "Save departure time" : "Save arrival time");
      return h("div", { class: "gatebox" }, h("strong", {}, title), inp, btn);
    };

    shell(
      h("div", { class: "row between" }, h("h1", {}, d.manifest_no, " ", h("span", { class: "muted" }, "/ " + d.gatepass_no)), h("a", { href: "#/" }, "← All records")),
      h("div", { class: "actions" },
        h("button", { class: "btn", onclick: () => download("manifest", d) }, "Manifest PDF (Colour)"),
        h("button", { class: "btn", onclick: () => download("manifest", d, "bw") }, "Manifest PDF (Black & White)"),
        h("button", { class: "btn", onclick: () => download("gatepass", d) }, "Gatepass PDF (Colour)"),
        h("button", { class: "btn", onclick: () => download("gatepass", d, "bw") }, "Gatepass PDF (Black & White)")),
      h("div", { class: "card" }, h("dl", { class: "details" },
        dl("Date & time", d.dispatch_dt), dl("Route", d.partner), dl("Seal number", d.seal_no), dl("Driver", d.courier_name), dl("Phone", d.courier_phone),
        dl("Vehicle number", d.vehicle_no), dl("Vehicle type", d.vehicle_type), dl("Employee", d.employee),
        dl("Created", `${d.created_at} by ${d.created_by}`), d.notes ? dl("Notes", d.notes, true) : null)),
      h("div", { class: "card" }, h("h2", {}, "Gate record"),
        h("div", { class: "gate" }, gate("entry", "Departed from origin", d.entry_time), gate("exit", "Arrived at destination", d.exit_time)),
        h("p", { class: "muted small" }, "Choose the actual date and time the truck left the origin and reached the destination (it starts at the current time). Each time is saved once and cannot be changed; who saved it and when is logged. The downloaded gatepass shows them.")),
      d.duplicates.length ? h("div", { class: "warnbox" }, h("strong", {}, `\u26A0 WARNING: ${d.duplicates.length} duplicate Order ID / AWB`),
        h("ul", {}, d.duplicates.map((x) => h("li", {}, h("b", {}, x.kind + " " + x.ref), " \u2013 " + Ship.dupWhy(x))))) : null,
      h("div", { class: "card" }, h("h2", {}, `Shipments (${t.shipments})  \u2022  ${t.boxes} boxes  \u2022  ${t.weight} kg`),
        h("div", { class: "table-wrap" }, h("table", { class: "ship" },
          h("thead", {}, h("tr", {}, ["S.No", "Order ID", "AWB number", "Boxes", "Weight (kg)", "Route"].map((x) => h("th", {}, x)))),
          h("tbody", {}, d.items.map((x, i) => {
            const dp = Ship.rowDupes(d, x);
            return h("tr", { class: dp.length ? "dup" : "", title: dp.length ? dp.map((y) => y.kind + ": " + Ship.dupWhy(y)).join(" | ") : null },
              h("td", {}, i + 1), h("td", {}, x.order_id || "-"), h("td", { class: "b" }, x.awb || "-"), h("td", {}, x.boxes),
              h("td", {}, Ship.fmtNum(x.weight)), h("td", {}, d.partner, dp.length ? h("span", { class: "tag" }, "DUPLICATE") : null));
          }))))));
  }

  // ---------- actions ----------
  async function download(kind, rec, theme) {
    try {
      const doc = await (kind === "manifest" ? PDFGen.manifest(rec, theme) : PDFGen.gatepass(rec, theme));
      doc.save((kind === "manifest" ? rec.manifest_no : rec.gatepass_no) + (theme === "bw" ? "-BW" : "") + ".pdf");
    } catch (e) { flash("Could not create the PDF: " + e.message, "error"); }
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const disp = [["Dispatch ID", "Manifest No", "Gatepass No", "Dispatch Date & Time", "Employee Name", "Route", "Seal Number", "Driver Name", "Driver Phone",
      "Vehicle Number", "Vehicle Type", "Total Shipments", "Total Boxes", "Total Weight (kg)", "Duplicate Warning", "Notes", "Departed Origin", "Arrived Destination", "Created By", "Created At"]];
    const items = [["Dispatch ID", "Sr No", "Order ID", "AWB Number", "Boxes", "Weight (kg)", "Route", "Duplicate?"]];
    records.slice().reverse().forEach((r) => {
      disp.push([r.id, r.manifest_no, r.gatepass_no, r.dispatch_dt, r.employee, r.partner, r.seal_no || "", r.courier_name, r.courier_phone, r.vehicle_no, r.vehicle_type,
        r.items.length, Ship.totals(r.items).boxes, Ship.totals(r.items).weight, r.duplicates.length ? r.duplicates.length + " duplicate: " + r.duplicates.map((x) => x.kind + " " + x.ref).join(", ") : "", r.notes || "", r.entry_time || "", r.exit_time || "", r.created_by, r.created_at]);
      r.items.forEach((x, i) => {
        const dp = Ship.rowDupes(r, x);
        items.push([r.id, i + 1, x.order_id, x.awb, x.boxes, x.weight, r.partner, dp.length ? "DUPLICATE (" + dp.map((y) => y.kind + ": " + Ship.dupWhy(y)).join(" | ") + ")" : ""]);
      });
    });
    const w1 = XLSX.utils.aoa_to_sheet(disp), w2 = XLSX.utils.aoa_to_sheet(items);
    w1["!cols"] = [20, 20, 20, 20, 18, 20, 20, 16, 16, 14, 12, 10, 14, 30, 30, 18, 18, 14, 18].map((wch) => ({ wch }));
    w2["!cols"] = [20, 8, 16, 22, 8, 12, 16, 50].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, w1, "Dispatches");
    XLSX.utils.book_append_sheet(wb, w2, "Items");
    XLSX.writeFile(wb, "razzai-world-manifest-database.xlsx");
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
