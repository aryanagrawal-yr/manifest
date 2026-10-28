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
    colour: { accent: [219, 26, 33], urlFill: [255, 242, 242] },
    bw: { accent: [0, 0, 0], urlFill: [255, 255, 255] },
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
            box(30, 676 - warnH, 535, warnH, [255, 246, 224], [154, 103, 0], 1);
            txt(`WARNING: ${d.duplicates.length} DUPLICATE ORDER ID / AWB`, 38, 676 - 13, { size: 9, bold: true, color: DUPTAG });
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(92, 61, 0);
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
          if (dup) box(30, y - 6, 535, ROW, DUPFILL);
          else if (i % 2 === 1) box(30, y - 6, 535, ROW, ZEBRA);
          txt(String(i + 1), COLS.sno, y, { size: 9 });
          txt(it.order_id, COLS.order, y, { size: 9, maxW: 126 });
          txt(it.awb, COLS.awb, y, { size: 9, bold: true, maxW: 116 });
          txt(String(it.boxes), COLS.boxes, y, { size: 9 });
          txt(Ship.fmtNum(it.weight), COLS.weight, y, { size: 9 });
          txt(d.partner, COLS.courier, y, { size: 9, maxW: dup ? 68 : 120 });
          if (dup) {
            box(515, y - 2.5, 46, 10, DUPTAG);
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
  //  GATE PASS
  // ======================================================================
  const M = 15, PW = 210, PH = 297, CW = 180;

  function newDoc(title) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setProperties({ title, author: "YOUTH ROBE" });
    return doc;
  }

  function header(doc, title, no, partner) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(25); doc.setTextColor(...INK);
    doc.text("YOUTH ROBE", M, 21);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
    doc.text(title, M, 28);
    doc.setFontSize(7.5);
    doc.text("LOGISTICS PARTNER", PW - M, 14, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(lat(partner), 80).slice(0, 2), PW - M, 21, { align: "right" });
    doc.setDrawColor(...INK); doc.setLineWidth(0.7); doc.line(M, 32, PW - M, 32);
    doc.setFontSize(15); doc.text(title.toUpperCase(), M, 42);
    doc.setFontSize(11); doc.text("No: " + lat(no), PW - M, 42, { align: "right" });
    return 47;
  }

  function grid(doc, y, pairs) {
    const rows = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const a = pairs[i], b = pairs[i + 1];
      rows.push([a[0].toUpperCase(), lat(a[1]), b ? b[0].toUpperCase() : "", b ? lat(b[1]) : ""]);
    }
    doc.autoTable({
      startY: y, body: rows, theme: "grid", margin: { left: M, right: M },
      styles: { fontSize: 10, cellPadding: 2.4, lineColor: LINE, lineWidth: 0.2, fillColor: SOFT, textColor: INK, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 32, fontSize: 7, fontStyle: "normal", textColor: GREY },
        1: { cellWidth: 58 },
        2: { cellWidth: 32, fontSize: 7, fontStyle: "normal", textColor: GREY },
        3: { cellWidth: 58 },
      },
    });
    return doc.lastAutoTable.finalY;
  }

  function common(d) {
    return [
      ["Dispatch date & time", d.dispatch_dt], ["Logistics partner", d.partner],
      ["Courier boy name", d.courier_name], ["Courier boy phone", d.courier_phone],
      ["Vehicle number", d.vehicle_no], ["Vehicle type", d.vehicle_type],
      ["Employee (Youth Robe)", d.employee], ["Dispatch ref", d.id],
    ];
  }

  function warning(doc, y, d) {
    const dups = d.duplicates || [];
    if (!dups.length) return y;
    const lines = doc.splitTextToSize(lat(`This dispatch has duplicate Order ID / AWB entries. Check the manifest ${d.manifest_no} before the vehicle leaves.`), CW - 8);
    const hgt = 9 + lines.length * 4;
    doc.setFillColor(255, 246, 224); doc.setDrawColor(154, 103, 0); doc.setLineWidth(0.6);
    doc.rect(M, y, CW, hgt, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(180, 35, 24);
    doc.text(`WARNING: ${dups.length} DUPLICATE ORDER ID / AWB`, M + 4, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(92, 61, 0);
    doc.text(lines, M + 4, y + 11);
    return y + hgt + 4;
  }

  function paragraph(doc, y, text, size) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size || 9); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(lat(text), CW);
    doc.text(lines, M, y);
    return y + lines.length * ((size || 9) * 0.45) + 2;
  }

  function sign(doc, y, labels) {
    if (y > PH - 55) { doc.addPage(); y = 25; }
    const gap = 10, w = (CW - gap * (labels.length - 1)) / labels.length;
    labels.forEach((l, i) => {
      const x = M + i * (w + gap);
      doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(x, y + 18, x + w, y + 18);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
      doc.text(doc.splitTextToSize(lat(l), w), x, y + 22);
    });
    return y + 34;
  }

  function footer(doc, no) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
      doc.text("YOUTH ROBE  |  " + lat(no), M, PH - 9);
      doc.text(`Page ${i} of ${n}`, PW - M, PH - 9, { align: "right" });
    }
  }

  async function gatepass(d) {
    const doc = newDoc(d.gatepass_no);
    let y = header(doc, "Vehicle Gate Pass", d.gatepass_no, d.partner);
    y = grid(doc, y, common(d).concat([["Purpose", `Pickup of ${d.items.length} shipment(s)`], ["Manifest no", d.manifest_no]]));
    y += 6;
    y = warning(doc, y, d) + 2;
    const bw = CW / 2;
    doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.rect(M, y, CW, 22); doc.line(M + bw, y, M + bw, y + 22);
    [["VEHICLE ENTRY (IN) TIME", d.entry_time], ["VEHICLE EXIT (OUT) TIME", d.exit_time]].forEach(([lab, val], i) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
      doc.text(lab, M + i * bw + 4, y + 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
      doc.text(val ? lat(val) : "____________________", M + i * bw + 4, y + 16);
    });
    y += 30;
    if (d.notes) y = paragraph(doc, y, "Notes: " + d.notes, 9);
    y = paragraph(doc, y + 3, `This pass is valid only for the vehicle and date mentioned above. Goods leaving must match the attached manifest ${d.manifest_no}.`, 9);
    y = sign(doc, y + 4, [`Authorised by: ${d.employee} (YOUTH ROBE)`, `Driver / courier: ${d.courier_name}`, "Security / gate in-charge"]);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(`Generated ${d.created_at} IST.`, M, y);
    footer(doc, d.gatepass_no);
    return doc;
  }

  root.PDFGen = { manifest, gatepass };
})(typeof window !== "undefined" ? window : globalThis);
