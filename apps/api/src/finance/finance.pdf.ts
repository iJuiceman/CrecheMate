import PDFDocument from "pdfkit";
import { FinanceData } from "./finance.service";

// A4 financial report rendered with pdfkit: header, totals, payment-method
// breakdown, then the transaction (and any refund) tables with page breaks.

const M = 40; // page margin
const W = 595.28 - M * 2; // A4 width minus margins
const BOTTOM = 780;
const INK = "#1f2933";
const MUTED = "#6b7480";
const LINE = "#e3e6ea";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Col = { label: string; x: number; w: number; align?: "left" | "right" };

export function renderFinancePdf(d: FinanceData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: `Financial report ${d.range.from} to ${d.range.to}` } });

  // ── Header ──
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(d.facility.name, M, M);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED)
    .text(`Financial report — ${d.range.from} to ${d.range.to}`, { paragraphGap: 2 });
  if (d.facility.abn) doc.fontSize(9).text(`ABN ${d.facility.abn}`);
  doc.fontSize(9).text(`Generated ${new Date().toLocaleString("en-AU", { timeZone: d.facility.timezone })} · amounts in AUD · cash basis (by payment date)`);
  doc.moveTo(M, doc.y + 8).lineTo(M + W, doc.y + 8).strokeColor(LINE).stroke();
  doc.y += 16;

  // ── Totals ──
  const totals: [string, number][] = [
    ["Collected", d.totals.collectedCents],
    ["Refunded", -d.totals.refundedCents],
    ["Net revenue", d.totals.netCents],
    ["Outstanding (sessions in range)", d.totals.outstandingCents],
    ["Waived (sessions in range)", d.totals.waivedCents],
  ];
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Summary", M, doc.y);
  doc.y += 4;
  for (const [label, cents] of totals) {
    const y = doc.y;
    const bold = label === "Net revenue";
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(bold ? INK : MUTED).text(label, M, y, { width: 260 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(INK).text(money(cents), M + 260, y, { width: 100, align: "right" });
    doc.y = y + 16;
  }

  // ── By payment method ──
  doc.y += 8;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Collected by payment method", M, doc.y);
  doc.y += 4;
  for (const m of d.byMethod) {
    if (m.cents === 0) continue;
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(m.method.charAt(0).toUpperCase() + m.method.slice(1), M, y, { width: 260 });
    doc.fillColor(INK).text(money(m.cents), M + 260, y, { width: 100, align: "right" });
    doc.y = y + 16;
  }
  if (d.byMethod.every((m) => m.cents === 0)) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("No payments in this range.", M, doc.y);
    doc.y += 16;
  }

  // ── Transactions ──
  const txnCols: Col[] = [
    { label: "Paid", x: M, w: 56 },
    { label: "Service", x: M + 58, w: 56 },
    { label: "Child", x: M + 116, w: 105 },
    { label: "Guardian", x: M + 223, w: 105 },
    { label: "Method", x: M + 330, w: 40 },
    { label: "Invoice #", x: M + 372, w: 82 },
    { label: "Amount", x: M + 456, w: W - 456, align: "right" },
  ];
  table(doc, `Transactions (${d.rows.length})`, txnCols, d.rows.map((t) => [
    t.paidDate, t.serviceDate, t.child, t.guardian, t.method, t.invoiceNumber, money(t.amountCents),
  ]));

  if (d.refunds.length) {
    const refCols: Col[] = [
      { label: "Refunded", x: M, w: 60 },
      { label: "Child", x: M + 62, w: 140 },
      { label: "Parent", x: M + 204, w: 140 },
      { label: "Credit #", x: M + 346, w: 90 },
      { label: "Amount", x: M + 438, w: W - 438, align: "right" },
    ];
    table(doc, `Refunds — declined online bookings (${d.refunds.length})`, refCols, d.refunds.map((q) => [
      q.refundDate, q.child, q.parent, q.creditNumber, `-${money(q.amountCents)}`,
    ]));
  }

  doc.end();
  return doc;
}

function table(doc: PDFKit.PDFDocument, title: string, cols: Col[], rows: string[][]) {
  doc.y += 12;
  if (doc.y > BOTTOM - 60) { doc.addPage(); doc.y = M; }
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(title, M, doc.y);
  doc.y += 6;

  const header = () => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    for (const c of cols) doc.text(c.label.toUpperCase(), c.x, y, { width: c.w, align: c.align ?? "left" });
    doc.moveTo(M, y + 12).lineTo(M + W, y + 12).strokeColor(LINE).stroke();
    doc.y = y + 17;
  };
  header();

  if (!rows.length) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Nothing in this range.", M, doc.y);
    doc.y += 14;
    return;
  }
  for (const row of rows) {
    if (doc.y > BOTTOM) { doc.addPage(); doc.y = M; header(); }
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    row.forEach((cell, i) => {
      const c = cols[i];
      doc.text(cell, c.x, y, { width: c.w, align: c.align ?? "left", lineBreak: false, ellipsis: true });
    });
    doc.y = y + 14;
  }
}
