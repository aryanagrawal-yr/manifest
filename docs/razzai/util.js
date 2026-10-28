// Small shared helpers for shipments (used by the app, the PDFs and the tests).
(function (root) {
  const normAwb = (s) => String(s || "").trim().toUpperCase();
  const normOrder = (s) => String(s || "").trim().replace(/^#/, "").toUpperCase();

  // Duplicate entries stored on a record that apply to one shipment row.
  function rowDupes(d, it) {
    return (d.duplicates || []).filter((x) =>
      x.kind === "Order ID" ? it.order_id && normOrder(x.ref) === normOrder(it.order_id) : it.awb && normAwb(x.ref) === normAwb(it.awb));
  }

  function dupWhy(x) {
    return [
      x.earlier && x.earlier.length ? "already in " + x.earlier.join(", ") : "",
      x.times_in_list > 1 ? `entered ${x.times_in_list} times in this list` : "",
    ].filter(Boolean).join("; ");
  }

  // weight / numbers without float noise; 0 or empty shows as "-"
  function fmtNum(n) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    return n ? String(n) : "-";
  }

  function totals(items) {
    let boxes = 0, wt = 0;
    items.forEach((i) => { boxes += Number(i.boxes) || 0; wt += Number(i.weight) || 0; });
    return { shipments: items.length, boxes, weight: Math.round(wt * 100) / 100 };
  }

  // "29 Oct 2026, 12:15 am" in IST
  function istStamp(date) {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(date || new Date()).forEach((x) => { p[x.type] = x.value; });
    return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod || "").toLowerCase()}`;
  }

  root.Ship = { normAwb, normOrder, rowDupes, dupWhy, fmtNum, totals, istStamp };
})(typeof window !== "undefined" ? window : globalThis);
