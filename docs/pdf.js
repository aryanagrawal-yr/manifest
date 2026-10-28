// PDF generation (jsPDF + autoTable).
//  - manifest(): "Pickup Manifest" in the RobeHive design (colour or black & white), 3 copies
//  - gatepass(): vehicle gate pass
(function (root) {
  const cfg = root.APP_CONFIG;
  const INK = [17, 17, 17], GREY = [107, 107, 107], LINE = [201, 201, 201], SOFT = [243, 243, 243];

  // jsPDF's built-in fonts only cover Latin characters
  const lat = (s) => String(s === null || s === undefined || s === "" ? "-" : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

  // ======================================================================
  //  MANIFEST (design supplied by the owner; coordinates are in points, origin bottom-left like the reference)
  // ======================================================================
  // The "Y" logo from the reference design: [x, y] in a 56.6 x 50 box, y pointing down.
  const LOGO = [[10.65, 49.1], [11.5, 49.6], [12.75, 49.95], [14.55, 49.9], [16.25, 49.4], [18.15, 48.55], [19.5, 47.65], [20.9, 46.55], [22.45, 44.95], [23.6, 43.6], [24.7, 42.05], [25.65, 40.45], [27.05, 37.7], [27.9, 35.4], [28.55, 32.4], [55.85, 1.45], [56.5, 0.9], [56.6, 0.6], [56.45, 0.3], [39.55, 0.05], [39.2, 0.2], [38.75, 0.75], [29.1, 16.55], [25.65, 21.5], [25.45, 21.15], [18.65, 0.65], [18.3, 0.3], [17.95, 0.2], [5.85, 0.25], [0.15, 0.0], [0.0, 0.1], [0.0, 0.5], [5.55, 5.75], [5.9, 6.2], [8.45, 11.3], [15.95, 28.3], [11.75, 44.8], [10.5, 48.55], [10.5, 48.85]];
  const THEMES = {
    colour: { accent: [219, 26, 33], urlFill: [255, 242, 242], zebra: [242, 242, 245], dupFill: [255, 226, 140], dupTag: [180, 35, 24], warnFill: [255, 246, 224], warnLine: [154, 103, 0], warnText: [92, 61, 0] },
    bw: { accent: [0, 0, 0], urlFill: [255, 255, 255], zebra: [242, 242, 242], dupFill: [208, 208, 208], dupTag: [0, 0, 0], warnFill: [255, 255, 255], warnLine: [0, 0, 0], warnText: [0, 0, 0] },
  };
  const ZEBRA = [242, 242, 245], DUPFILL = [255, 226, 140], DUPTAG = [180, 35, 24], MUTED = [115, 115, 115];
  const COLS = { sno: 36, order: 72, awb: 204, boxes: 326, weight: 372, courier: 440 };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function fmtDT(s) { // "2026-10-29 14:30" -> "29 Oct 2026, 2:30 pm"
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return lat(s);
    const hh = parseInt(m[4], 10), h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${parseInt(m[3], 10)} ${MON[parseInt(m[2], 10) - 1]} ${m[1]}, ${h12}:${m[5]} ${hh < 12 ? "am" : "pm"}`;
  }


  async function manifest(d, theme) {
    const { jsPDF } = root.jspdf;
    const TH = THEMES[theme === "bw" ? "bw" : "colour"];
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setProperties({ title: d.manifest_no, author: "YOUTH ROBE" });
    const H = doc.internal.pageSize.getHeight(), PWID = doc.internal.pageSize.getWidth();
    const B = cfg.brand;
    const T = Ship.totals(d.items);
    const stamp = Ship.istStamp(new Date());
    const Y = (y) => H - y;

    function fit(t, maxW) {
      if (!maxW || doc.getTextWidth(t) <= maxW) return t;
      while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
      return t + "...";
    }
    function txt(s, x, y, o) {
      o = o || {};
      doc.setFont("helvetica", o.bold ? "bold" : "normal");
      doc.setFontSize(o.size || 9);
      doc.setTextColor.apply(doc, o.color || [0, 0, 0]);
      doc.text(fit(lat(s), o.maxW), x, Y(y), { align: o.align || "left" });
    }
    function box(x, yBottom, w, h, fill, stroke, lw) {
      if (fill) doc.setFillColor.apply(doc, fill);
      if (stroke) { doc.setDrawColor.apply(doc, stroke); doc.setLineWidth(lw || 1); }
      doc.rect(x, Y(yBottom + h), w, h, fill && stroke ? "FD" : fill ? "F" : "S");
    }
    function hline(x1, x2, y, color, lw) {
      doc.setDrawColor.apply(doc, color); doc.setLineWidth(lw); doc.line(x1, Y(y), x2, Y(y));
    }
    function logo() {
      const s = 0.8808808808808808;
      const P = LOGO.map(([x, y]) => [42 + s * x, Y(807) + s * y]);
      const segs = [];
      for (let i = 1; i < P.length; i++) segs.push([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]);
      doc.setFillColor(255, 255, 255);
      doc.lines(segs, P[0][0], P[0][1], [1, 1], "F", true);
    }

    // ---- warning text for duplicates (first page) ----
    let warnLines = null, warnH = 0;
    if ((d.duplicates || []).length) {
      const shown = d.duplicates.slice(0, 6).map((x) => `${x.kind} ${x.ref} (${Ship.dupWhy(x)})`).join(";  ");
      const more = d.duplicates.length > 6 ? `;  and ${d.duplicates.length - 6} more (highlighted below)` : "";
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      warnLines = doc.splitTextToSize(lat(`Verify before handover. ${shown}${more}`), 535 - 16);
      warnH = 16 + 10 + warnLines.length * 10;
    }

    // ---- pagination (same rules for every copy) ----
    const FIRST_HEAD = warnLines ? 676 - warnH - 8 - 20 : 660, CONT_HEAD = 726, ROW = 17, MIN_BASE = 70;
    const pages = [];
    let cur = [], base = FIRST_HEAD - 16;
    pages.push({ head: FIRST_HEAD, rows: cur, first: true });
    d.items.forEach((it, i) => {
      if (base < MIN_BASE) { cur = []; pages.push({ head: CONT_HEAD, rows: cur, first: false }); base = CONT_HEAD - 16; }
      cur.push({ it, i, y: base }); base -= ROW;
    });
    const lastBase = base + ROW;
    if (lastBase >= 237) {
      const lp = pages[pages.length - 1]; lp.last = true; lp.totalLb = lastBase; // total + signatures fit on the last page
    } else {
      // signatures need more room: keep the total under the last row if it fits, signatures go on one more page
      const fits = lastBase - 23 >= 62;
      if (fits) pages[pages.length - 1].totalLb = lastBase;
      pages.push({ head: CONT_HEAD, rows: [], first: false, last: true, sigOnly: true, totalLb: fits ? 0 : CONT_HEAD + 1 });
    }

    let firstPageOfDoc = true;
    (B.copies || ["VENDOR COPY"]).forEach((copyLabel) => {
      pages.forEach((p, pi) => {
        if (!firstPageOfDoc) doc.addPage();
        firstPageOfDoc = false;

        // header band
        box(30, 758, 535, 58, TH.accent);
        logo();
        txt(B.title, 106, 790, { size: 20, bold: true, color: [255, 255, 255] });
        txt(B.tagline, 106, 774, { size: 9, color: [255, 255, 255] });
        txt(B.documentTitle, 550.5, 792, { size: 15, bold: true, color: [255, 255, 255], align: "right" });
        txt(copyLabel, 550.5, 774, { size: 10, bold: true, color: [255, 255, 255], align: "right" });
        txt("No: " + d.manifest_no, 550.5, 764.5, { size: 7.5, color: [255, 255, 255], align: "right" });

        if (p.first) {
          const lab = (s, x, y) => txt(s, x, y, { size: 7.5, bold: true, color: TH.accent });
          const val = (s, x, y) => txt(s, x, y, { size: 10.5, bold: true, maxW: 255 });
          lab("PREPARED BY", 36, 732); val(d.created_by, 36, 720);
          lab("VENDOR", 300, 732); val(B.vendor, 300, 720);
          lab("DOWNLOADED ON", 36, 698); val(stamp, 36, 686);
          lab("TOTAL", 300, 698); val(`${T.shipments} shipments  |  ${T.boxes} boxes  |  ${T.weight} kg`, 300, 686);
          if (warnLines) {
            box(30, 676 - warnH, 535, warnH, TH.warnFill, TH.warnLine, 1);
            txt(`WARNING: ${d.duplicates.length} DUPLICATE ORDER ID / AWB`, 38, 676 - 13, { size: 9, bold: true, color: TH.dupTag });
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor.apply(doc, TH.warnText);
            warnLines.forEach((ln, k) => doc.text(ln, 38, Y(676 - 25 - k * 10)));
          }
        }

        // table header
        if (!p.sigOnly || p.totalLb) {
          box(30, p.head, 535, 20, TH.accent);
          const hy = p.head + 6, hd = { size: 8.5, bold: true, color: [255, 255, 255] };
          txt("S.No", COLS.sno, hy, hd); txt("Order ID", COLS.order, hy, hd); txt("AWB number", COLS.awb, hy, hd);
          txt("Boxes", COLS.boxes, hy, hd); txt("Weight (kg)", COLS.weight, hy, hd); txt("Courier", COLS.courier, hy, hd);
        }

        // rows
        p.rows.forEach(({ it, i, y }) => {
          const dup = Ship.rowDupes(d, it).length > 0;
          if (dup) box(30, y - 6, 535, ROW, TH.dupFill);
          else if (i % 2 === 1) box(30, y - 6, 535, ROW, TH.zebra);
          txt(String(i + 1), COLS.sno, y, { size: 9 });
          txt(it.order_id, COLS.order, y, { size: 9, maxW: 126 });
          txt(it.awb, COLS.awb, y, { size: 9, bold: true, maxW: 116 });
          txt(String(it.boxes), COLS.boxes, y, { size: 9 });
          txt(Ship.fmtNum(it.weight), COLS.weight, y, { size: 9 });
          txt(d.partner, COLS.courier, y, { size: 9, maxW: dup ? 68 : 120 });
          if (dup) {
            box(515, y - 2.5, 46, 10, TH.dupTag);
            txt("DUPLICATE", 538, y + 0.8, { size: 6.5, bold: true, color: [255, 255, 255], align: "center" });
          }
        });

        if (p.totalLb) {
          const lb = p.totalLb;
          hline(30, 565, lb - 9, TH.accent, 1);
          txt("TOTAL", COLS.order, lb - 23, { size: 9.5, bold: true });
          txt(String(T.boxes), COLS.boxes, lb - 23, { size: 9.5, bold: true });
          txt(String(T.weight), COLS.weight, lb - 23, { size: 9.5, bold: true });
        }

        if (p.last) {
          // signature boxes
          const sig = (x, title, lines) => {
            box(x, 72, 255, 130, null, TH.accent, 1);
            box(x, 190, 255, 12, TH.accent);
            txt(title, x + 6, 193, { size: 8, bold: true, color: [255, 255, 255] });
            lines.forEach((ln, k) => txt(ln, x + 8, 172 - k * 18, { size: 8.5, bold: k === 0, maxW: 239 }));
            hline(x + 8, x + 247, 94, [0, 0, 0], 0.8);
            txt("Signature", x + 8, 82, { size: 7.5, color: MUTED });
          };
          sig(36, "HANDED OVER BY (VENDOR)", [d.employee, "Vendor: " + B.vendor, "Manifest no: " + d.manifest_no, "Date & time: " + fmtDT(d.dispatch_dt)]);
          sig(304, "RECEIVED BY (COURIER EXECUTIVE)", [
            `Name: ${d.courier_name} (${d.courier_phone})`, "Courier: " + d.partner,
            `Vehicle no.: ${d.vehicle_no} (${d.vehicle_type})`, "Date & time: " + fmtDT(d.dispatch_dt)]);
          txt("I confirm the above shipments were handed over in the stated boxes and weight.", 36, 56, { size: 8, color: MUTED });
        }

        // footer
        hline(30, 565, 54, [0, 0, 0], 0.8);
        txt(B.footer, PWID / 2, 40, { size: 9, bold: true, align: "center" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        const bw = doc.getTextWidth(B.url) + 21.4;
        box(PWID / 2 - bw / 2, 16, bw, 16, TH.urlFill, TH.accent, 1.2);
        txt(B.url, PWID / 2, 20.5, { size: 10, bold: true, color: TH.accent, align: "center" });
        txt(`Page ${pi + 1} of ${pages.length}`, 550.5, 24, { size: 8, color: MUTED, align: "right" });
        txt(d.manifest_no, 36, 24, { size: 8, color: MUTED });
      });
    });
    return doc;
  }

  // ======================================================================
  //  GATE PASS (same RobeHive look as the manifest; one page per copy)
  // ======================================================================
  async function gatepass(d) {
    const { jsPDF } = root.jspdf;
    const TH = THEMES.colour, B = cfg.brand;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setProperties({ title: d.gatepass_no, author: "YOUTH ROBE" });
    const H = doc.internal.pageSize.getHeight(), PWID = doc.internal.pageSize.getWidth();
    const Y = (y) => H - y;
    function txt(s, x, y, o) {
      o = o || {};
      doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(o.size || 9);
      doc.setTextColor.apply(doc, o.color || [0, 0, 0]);
      let t = lat(s);
      if (o.maxW) while (t.length > 1 && doc.getTextWidth(t) > o.maxW) t = t.slice(0, -1);
      doc.text(t, x, Y(y), { align: o.align || "left" });
    }
    function box(x, yb, w, h, fill, stroke, lw) {
      if (fill) doc.setFillColor.apply(doc, fill);
      if (stroke) { doc.setDrawColor.apply(doc, stroke); doc.setLineWidth(lw || 1); }
      doc.rect(x, Y(yb + h), w, h, fill && stroke ? "FD" : fill ? "F" : "S");
    }
    function hline(x1, x2, y, c, lw) { doc.setDrawColor.apply(doc, c); doc.setLineWidth(lw); doc.line(x1, Y(y), x2, Y(y)); }
    function logo() {
      const sc = 0.8808808808808808, P = LOGO.map(([x, y]) => [42 + sc * x, Y(807) + sc * y]), segs = [];
      for (let k = 1; k < P.length; k++) segs.push([P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]]);
      doc.setFillColor(255, 255, 255); doc.lines(segs, P[0][0], P[0][1], [1, 1], "F", true);
    }
    const copies = B.gateCopies || ["SECURITY COPY", "COURIER COPY"];
    copies.forEach((copyLabel, ci) => {
      if (ci) doc.addPage();
      box(30, 758, 535, 58, TH.accent); logo();
      txt(B.title, 106, 790, { size: 20, bold: true, color: [255, 255, 255] });
      txt(B.tagline, 106, 774, { size: 9, color: [255, 255, 255] });
      txt("VEHICLE GATE PASS", 550.5, 792, { size: 15, bold: true, color: [255, 255, 255], align: "right" });
      txt(copyLabel, 550.5, 774, { size: 10, bold: true, color: [255, 255, 255], align: "right" });
      txt("No: " + d.gatepass_no, 550.5, 764.5, { size: 7.5, color: [255, 255, 255], align: "right" });

      const cells = [
        ["DISPATCH DATE & TIME", fmtDT(d.dispatch_dt)], ["LOGISTICS PARTNER", d.partner],
        ["COURIER BOY NAME", d.courier_name], ["COURIER BOY PHONE", d.courier_phone],
        ["VEHICLE NUMBER", d.vehicle_no], ["VEHICLE TYPE", d.vehicle_type],
        ["EMPLOYEE (" + B.vendor.toUpperCase() + ")", d.employee], ["MANIFEST NO", d.manifest_no],
      ];
      let y = 732;
      cells.forEach((c, k) => {
        const x = k % 2 ? 300 : 36;
        txt(c[0], x, y, { size: 7.5, bold: true, color: TH.accent });
        txt(c[1], x, y - 12, { size: 10.5, bold: true, maxW: 255 });
        if (k % 2) y -= 36;
      });
      y -= 4; // y = bottom of detail block
      hline(30, 565, y + 8, [200, 200, 200], 0.6);

      const dups = d.duplicates || [];
      if (dups.length) {
        y -= 6;
        box(30, y - 34, 535, 34, [255, 246, 224], [154, 103, 0], 1);
        txt(`WARNING: ${dups.length} DUPLICATE ORDER ID / AWB in manifest ${d.manifest_no}`, 38, y - 13, { size: 9, bold: true, color: DUPTAG });
        txt("Check the manifest before the vehicle leaves.", 38, y - 26, { size: 8, color: [92, 61, 0] });
        y -= 44;
      }

      y -= 14;
      [["VEHICLE ENTRY (IN) TIME", d.entry_time, 36], ["VEHICLE EXIT (OUT) TIME", d.exit_time, 304]].forEach(([lab, val, x]) => {
        box(x, y - 62, 255, 62, null, TH.accent, 1);
        box(x, y - 14, 255, 14, TH.accent);
        txt(lab, x + 6, y - 10.5, { size: 8, bold: true, color: [255, 255, 255] });
        if (val) txt(val, x + 10, y - 40, { size: 14, bold: true, maxW: 235 });
        if (!val) hline(x + 10, x + 245, y - 46, [0, 0, 0], 0.8);
      });
      y -= 84;
      txt(`Purpose: pickup of ${d.items.length} shipment(s) as per manifest ${d.manifest_no}`, 36, y, { size: 9.5, bold: true });
      y -= 14;
      if (d.notes) { txt("Notes: " + d.notes, 36, y, { size: 9, maxW: 520 }); y -= 14; }
      txt("This pass is valid only for the vehicle and date mentioned above. Goods leaving must match the manifest.", 36, y, { size: 8, color: MUTED });

      const sw = 171, gap = 11;
      [[`Authorised by: ${d.employee}`, B.vendor], ["Driver / courier: " + d.courier_name, d.partner], ["Security / gate in-charge", ""]].forEach((sg, k) => {
        const x = 30 + k * (sw + gap);
        box(x, 72, sw, 100, null, TH.accent, 1);
        box(x, 160, sw, 12, TH.accent);
        txt(["AUTHORISED BY", "DRIVER / COURIER", "SECURITY / GATE"][k], x + 6, 163, { size: 8, bold: true, color: [255, 255, 255] });
        txt(k === 2 ? "Name:" : sg[0].replace(/^[^:]*: /, ""), x + 8, 140, { size: 9, bold: true, maxW: sw - 16 });
        if (sg[1]) txt(sg[1], x + 8, 126, { size: 8.5, maxW: sw - 16 });
        hline(x + 8, x + sw - 8, 94, [0, 0, 0], 0.8);
        txt("Signature", x + 8, 82, { size: 7.5, color: MUTED });
      });

      hline(30, 565, 54, [0, 0, 0], 0.8);
      txt(B.footer, PWID / 2, 40, { size: 9, bold: true, align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      const bw = doc.getTextWidth(B.url) + 21.4;
      box(PWID / 2 - bw / 2, 16, bw, 16, TH.urlFill, TH.accent, 1.2);
      txt(B.url, PWID / 2, 20.5, { size: 10, bold: true, color: TH.accent, align: "center" });
      txt(d.gatepass_no, 36, 24, { size: 8, color: MUTED });
      txt(`Copy ${ci + 1} of ${copies.length}`, 550.5, 24, { size: 8, color: MUTED, align: "right" });
    });
    return doc;
  }

  root.PDFGen = { manifest, gatepass };
})(typeof window !== "undefined" ? window : globalThis);
