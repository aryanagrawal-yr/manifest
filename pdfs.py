"""PDF generation: dispatch manifest and vehicle gatepass (same shared record)."""
import os
from io import BytesIO
from math import ceil
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#111111")
GREY = colors.HexColor("#6b6b6b")
LINE = colors.HexColor("#c9c9c9")
SOFT = colors.HexColor("#f3f3f3")
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "logo.png")

S = lambda **k: ParagraphStyle("x", fontName=k.pop("font", "Helvetica"), **k)
BRAND = S(fontSize=26, leading=28, textColor=INK, font="Helvetica-Bold")
SUB = S(fontSize=10, leading=13, textColor=GREY)
PL_LABEL = S(fontSize=7.5, leading=10, textColor=GREY, alignment=TA_RIGHT)
PL_NAME = S(fontSize=15, leading=18, textColor=INK, alignment=TA_RIGHT, font="Helvetica-Bold")
TITLE = S(fontSize=15, leading=18, textColor=INK, font="Helvetica-Bold")
LBL = S(fontSize=7.5, leading=10, textColor=GREY)
VAL = S(fontSize=10, leading=13, textColor=INK, font="Helvetica-Bold")
BODY = S(fontSize=9, leading=12, textColor=INK)
SMALL = S(fontSize=8, leading=10, textColor=GREY)
CELL = S(fontSize=9, leading=11, textColor=INK)


def P(text, style=VAL):
    return Paragraph(escape(str(text if text not in (None, "") else "-")), style)


def _header(d, doc_title, doc_no):
    left = [Paragraph("YOUTH ROBE", BRAND)]
    if os.path.exists(LOGO):
        left = [Image(LOGO, width=40 * mm, height=14 * mm, kind="proportional")]
    left.append(Paragraph(doc_title, SUB))
    right = [Paragraph("LOGISTICS PARTNER", PL_LABEL), Paragraph(escape(d["partner"]), PL_NAME)]
    t = Table([[left, right]], colWidths=[100 * mm, 80 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 1.6, INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    num = Table([[Paragraph(doc_title.upper(), TITLE), Paragraph("No: <b>%s</b>" % escape(doc_no), S(fontSize=11, leading=14, alignment=TA_RIGHT))]],
                colWidths=[100 * mm, 80 * mm])
    num.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return [t, num]


def _grid(pairs):
    """pairs: list of (label, value). Laid out 2 pairs per row."""
    rows = []
    for i in range(0, len(pairs), 2):
        row = []
        for lab, val in pairs[i:i + 2]:
            row.append([Paragraph(lab.upper(), LBL), P(val)])
        while len(row) < 2:
            row.append("")
        rows.append(row)
    t = Table(rows, colWidths=[90 * mm, 90 * mm])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _common_pairs(d):
    return [
        ("Dispatch Date & Time", d["dispatch_dt"]),
        ("Logistics Partner", d["partner"]),
        ("Courier Boy Name", d["courier_name"]),
        ("Courier Boy Phone", d["courier_phone"]),
        ("Vehicle Number", d["vehicle_no"]),
        ("Vehicle Type", d["vehicle_type"]),
        ("Employee Name (Youth Robe)", d["employee"]),
        ("Dispatch Ref", d["dispatch_id"]),
    ]


def _sign_row(labels):
    gap = 10 * mm
    w = (180 * mm - gap * (len(labels) - 1)) / len(labels)
    space, text, widths = [], [], []
    for i, lab in enumerate(labels):
        space.append("")
        text.append(Paragraph(escape(lab), SMALL))
        widths.append(w)
        if i < len(labels) - 1:
            space.append("")
            text.append("")
            widths.append(gap)
    t = Table([space, text], colWidths=widths, rowHeights=[16 * mm, None])
    t.setStyle(TableStyle([
        *[("LINEABOVE", (c, 1), (c, 1), 0.8, INK) for c in range(0, len(text), 2)],
        ("VALIGN", (0, 1), (-1, 1), "TOP"),
        ("TOPPADDING", (0, 1), (-1, 1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _footer(doc_no):
    def draw(c, doc):
        c.saveState()
        c.setFont("Helvetica", 7.5)
        c.setFillColor(GREY)
        c.drawString(15 * mm, 9 * mm, "YOUTH ROBE  |  %s" % doc_no)
        c.drawRightString(195 * mm, 9 * mm, "Page %d" % doc.page)
        c.restoreState()
    return draw


def _build(flow, doc_no):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=16 * mm, title=doc_no, author="YOUTH ROBE")
    cb = _footer(doc_no)
    doc.build(flow, onFirstPage=cb, onLaterPages=cb)
    return buf.getvalue()


def manifest_pdf(d):
    items = d["items"]
    flow = _header(d, "Dispatch Manifest", d["manifest_no"])
    flow.append(_grid(_common_pairs(d) + [("Total Shipments", len(items)), ("Gatepass No", d["gatepass_no"])]))
    if d.get("notes"):
        flow += [Spacer(1, 3 * mm), Paragraph("<b>Notes:</b> %s" % escape(d["notes"]), BODY)]
    flow += [Spacer(1, 6 * mm), Paragraph("SHIPMENT DETAILS (ORDER ID / AWB)", S(fontSize=10, leading=13, font="Helvetica-Bold"))]
    flow.append(Spacer(1, 2 * mm))

    # two column-pairs per row to keep long lists compact
    half = ceil(len(items) / 2)
    head = ["Sr", "Order ID / AWB", "Sr", "Order ID / AWB"]
    rows = [head]
    for i in range(half):
        l = [i + 1, Paragraph(escape(items[i]), CELL)]
        j = i + half
        r = [j + 1, Paragraph(escape(items[j]), CELL)] if j < len(items) else ["", ""]
        rows.append(l + r)
    t = Table(rows, colWidths=[10 * mm, 80 * mm, 10 * mm, 80 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    flow.append(t)

    ack = Paragraph(
        "I, the undersigned courier representative of <b>%s</b>, confirm that I have received the above "
        "<b>%d</b> shipment(s) from YOUTH ROBE, as listed, in sealed condition for delivery."
        % (escape(d["partner"]), len(items)), BODY)
    flow.append(KeepTogether([
        Spacer(1, 8 * mm), ack, Spacer(1, 2 * mm),
        _sign_row(["Handed over by: %s (YOUTH ROBE)" % d["employee"],
                   "Received by: %s (%s)" % (d["courier_name"], d["partner"])]),
        Spacer(1, 4 * mm),
        Paragraph("Generated on %s IST. Count verified at handover." % d["created_at"], SMALL),
    ]))
    return _build(flow, d["manifest_no"])


def gatepass_pdf(d):
    flow = _header(d, "Vehicle Gate Pass", d["gatepass_no"])
    flow.append(_grid(_common_pairs(d) + [
        ("Purpose", "Pickup of %d shipment(s)" % len(d["items"])),
        ("Manifest No", d["manifest_no"]),
    ]))
    flow.append(Spacer(1, 6 * mm))

    def box(label, value):
        return [Paragraph(label.upper(), LBL), Spacer(1, 3 * mm),
                P(value if value else "______________________")]
    t = Table([[box("Vehicle entry (in) time", d["entry_time"]), box("Vehicle exit (out) time", d["exit_time"])]],
              colWidths=[90 * mm, 90 * mm])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, INK),
        ("INNERGRID", (0, 0), (-1, -1), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    flow.append(t)
    if d.get("notes"):
        flow += [Spacer(1, 3 * mm), Paragraph("<b>Notes:</b> %s" % escape(d["notes"]), BODY)]
    flow.append(KeepTogether([
        Spacer(1, 6 * mm),
        Paragraph("This pass is valid only for the vehicle and date mentioned above. "
                  "Goods leaving must match the attached manifest <b>%s</b>." % escape(d["manifest_no"]), BODY),
        Spacer(1, 2 * mm),
        _sign_row(["Authorised by: %s (YOUTH ROBE)" % d["employee"],
                   "Driver / courier: %s" % d["courier_name"],
                   "Security / gate in-charge"]),
        Spacer(1, 4 * mm),
        Paragraph("Generated on %s IST." % d["created_at"], SMALL),
    ]))
    return _build(flow, d["gatepass_no"])
