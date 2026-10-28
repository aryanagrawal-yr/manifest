// PDF generation (jsPDF + autoTable): dispatch manifest and vehicle gate pass from one shared record.
(function (root) {
  const M = 15, PW = 210, PH = 297, CW = 180;
  const INK = [17, 17, 17], GREY = [107, 107, 107], LINE = [201, 201, 201], SOFT = [243, 243, 243];

  // jsPDF's built-in fonts only cover Latin characters
  const lat = (s) => String(s === null || s === undefined || s === "" ? "-" : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

  let logoCache;
  async function loadLogo() {
    if (logoCache !== undefined) return logoCache;
    logoCache = null;
    try {
      if (typeof Image === "undefined" || typeof FileReader === "undefined") return null;
      const r = await fetch("logo.png");
      if (!r.ok) return null;
      const blob = await r.blob();
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      const dim = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = data; });
      const scale = Math.min(42 / dim.w, 15 / dim.h);
      logoCache = { data, w: dim.w * scale, h: dim.h * scale };
    } catch (e) { logoCache = null; }
    return logoCache;
  }

  function newDoc(title) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setProperties({ title, author: "YOUTH ROBE" });
    return doc;
  }

  function header(doc, title, no, partner, logo) {
    if (logo) {
      doc.addImage(logo.data, "PNG", M, 11, logo.w, logo.h);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(25); doc.setTextColor(...INK);
      doc.text("YOUTH ROBE", M, 21);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
    doc.text(title, M, 28);
    doc.setFontSize(7.5);
    doc.text("LOGISTICS PARTNER", PW - M, 14, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK);
    const pl = doc.splitTextToSize(lat(partner), 80);
    doc.text(pl.slice(0, 2), PW - M, 21, { align: "right" });
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

  const dupMapOf = (d) => { const m = new Map(); (d.duplicates || []).forEach((x) => m.set(String(x.ref).toUpperCase(), x)); return m; };
  const dupWhy = (x) => [x.earlier && x.earlier.length ? "also in " + x.earlier.join(", ") : "", x.times_in_list > 1 ? "typed " + x.times_in_list + " times" : ""].filter(Boolean).join("; ");

  // amber warning box listing duplicate Order IDs / AWBs. Returns new y.
  function warning(doc, y, d, full) {
    const dups = d.duplicates || [];
    if (!dups.length) return y;
    const head = `WARNING: ${dups.length} DUPLICATE ORDER ID / AWB`;
    let body;
    if (full) {
      const shown = dups.slice(0, 8).map((x) => `${x.ref} (${dupWhy(x)})`).join(";  ");
      body = "Already listed in an earlier manifest or repeated in this list. Verify before handover. " + shown + (dups.length > 8 ? `;  and ${dups.length - 8} more (highlighted below).` : "");
    } else {
      body = "This dispatch has duplicate Order ID / AWB entries. Check the manifest " + d.manifest_no + " before the vehicle leaves.";
    }
    const lines = doc.splitTextToSize(lat(body), CW - 8);
    const hgt = 9 + lines.length * 4;
    doc.setFillColor(255, 246, 224); doc.setDrawColor(154, 103, 0); doc.setLineWidth(0.6);
    doc.rect(M, y, CW, hgt, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(180, 35, 24);
    doc.text(head, M + 4, y + 6);
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

  async function manifest(d) {
    const doc = newDoc(d.manifest_no);
    let y = header(doc, "Dispatch Manifest", d.manifest_no, d.partner, await loadLogo());
    y = grid(doc, y, common(d).concat([["Total shipments", d.items.length], ["Gatepass no", d.gatepass_no]]));
    y += 4;
    y = warning(doc, y, d, true);
    if (d.notes) y = paragraph(doc, y + 2, "Notes: " + d.notes, 9);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text("SHIPMENT DETAILS (ORDER ID / AWB)", M, y + 6);

    const dm = dupMapOf(d);
    const cellText = (x) => lat(x) + (dm.has(String(x).toUpperCase()) ? "   [DUPLICATE]" : "");
    const items = d.items, half = Math.ceil(items.length / 2), rows = [];
    for (let i = 0; i < half; i++) {
      const j = i + half;
      rows.push([i + 1, cellText(items[i]), j < items.length ? j + 1 : "", j < items.length ? cellText(items[j]) : ""]);
    }
    doc.autoTable({
      startY: y + 9, head: [["Sr", "Order ID / AWB", "Sr", "Order ID / AWB"]], body: rows, theme: "grid",
      margin: { left: M, right: M, bottom: 18 },
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.2, textColor: INK },
      headStyles: { fillColor: INK, textColor: 255 },
      alternateRowStyles: { fillColor: SOFT },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 80 }, 2: { cellWidth: 10 }, 3: { cellWidth: 80 } },
      didParseCell: (data) => {
        if (data.section === "body" && (data.column.index === 1 || data.column.index === 3) && String(data.cell.raw).indexOf("[DUPLICATE]") >= 0) {
          data.cell.styles.fillColor = [255, 226, 140];
          data.cell.styles.textColor = [150, 40, 0];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 9;
    if (y > PH - 75) { doc.addPage(); y = 25; }
    y = paragraph(doc, y,
      `I, the undersigned courier representative of ${d.partner}, confirm that I have received the above ${items.length} shipment(s) from YOUTH ROBE, as listed, in sealed condition for delivery.`, 9);
    y = sign(doc, y + 4, [`Handed over by: ${d.employee} (YOUTH ROBE)`, `Received by: ${d.courier_name} (${d.partner})`]);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(`Generated ${d.created_at} IST by ${lat(d.created_by)}. Count verified at handover.`, M, y);
    footer(doc, d.manifest_no);
    return doc;
  }

  async function gatepass(d) {
    const doc = newDoc(d.gatepass_no);
    let y = header(doc, "Vehicle Gate Pass", d.gatepass_no, d.partner, await loadLogo());
    y = grid(doc, y, common(d).concat([["Purpose", `Pickup of ${d.items.length} shipment(s)`], ["Manifest no", d.manifest_no]]));
    y += 6;
    y = warning(doc, y, d, false) + 2;
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
