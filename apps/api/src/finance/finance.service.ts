import { Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

// Finance works on a cash basis: a transaction belongs to the export window by
// the day the money actually moved (paidAt / refund decidedAt, facility-local),
// unlike the Reports module which slices by service date. That's what lines up
// with the bank statement when the file lands in Xero.

export interface FinanceTxn {
  id: string;
  invoiceNumber: string;
  paidDate: string; // facility-local ISO date
  serviceDate: string;
  child: string;
  guardian: string;
  guardianEmail: string | null;
  method: string;
  amountCents: number;
}

export interface FinanceRefund {
  id: string;
  invoiceNumber: string; // the prepayment invoice of the pair
  creditNumber: string;
  paidDate: string; // when the prepayment was taken
  refundDate: string; // when it was declined/refunded
  child: string;
  parent: string;
  parentEmail: string | null;
  amountCents: number;
}

export interface FinanceData {
  range: { from: string; to: string };
  xero: { accountCode: string; taxType: string; invoicePrefix: string };
  facility: { name: string; abn: string | null; timezone: string };
  totals: {
    collectedCents: number;
    refundedCents: number;
    netCents: number;
    outstandingCents: number;
    waivedCents: number;
  };
  byMethod: { method: string; cents: number }[];
  rows: FinanceTxn[];
  refunds: FinanceRefund[];
}

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /** Resolve a [from,to] pair of local dates into UTC bounds (mirrors reports). */
  private range(tz: string, from?: string, to?: string) {
    const today = DateTime.now().setZone(tz);
    const startD = (from ? DateTime.fromISO(from, { zone: tz }) : today.minus({ days: 29 })).startOf("day");
    const endExclusive = (to ? DateTime.fromISO(to, { zone: tz }) : today).startOf("day").plus({ days: 1 });
    return {
      start: startD.toJSDate(),
      end: endExclusive.toJSDate(),
      from: startD.toISODate()!,
      to: endExclusive.minus({ days: 1 }).toISODate()!,
    };
  }

  private localDate(d: Date | null, tz: string): string {
    return d ? DateTime.fromJSDate(d).setZone(tz).toISODate()! : "";
  }

  /** Deterministic invoice number from a row id, so re-exports of overlapping
   *  ranges produce identical numbers and Xero's duplicate check skips them. */
  private invoiceNo(prefix: string, id: string, kind?: "B" | "R") {
    return `${prefix}-${kind ? `${kind}-` : ""}${id.slice(0, 8).toUpperCase()}`;
  }

  async summary(from?: string, to?: string): Promise<FinanceData> {
    const f = await this.settings.get();
    const tz = f.timezone;
    const r = this.range(tz, from, to);

    const [payments, refundedRequests, serviceWindow] = await Promise.all([
      // Money in: fees paid inside the window (any payment method).
      this.prisma.attendance.findMany({
        where: { paymentStatus: "paid", feeCents: { gt: 0 }, paidAt: { gte: r.start, lt: r.end } },
        include: { child: { include: { guardian: true } } },
        orderBy: { paidAt: "asc" },
      }),
      // Money back out: online prepayments refunded when a request was declined.
      this.prisma.bookingRequest.findMany({
        where: { status: "declined", paymentStatus: "paid", decidedAt: { gte: r.start, lt: r.end } },
        orderBy: { decidedAt: "asc" },
      }),
      // Context KPIs (not exported): unpaid/waived fees for sessions in the window.
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end }, feeCents: { gt: 0 }, paymentStatus: { not: "paid" } },
        select: { feeCents: true, paymentStatus: true, status: true },
      }),
    ]);

    let collected = 0;
    const method = { cash: 0, card: 0, eftpos: 0, online: 0 } as Record<string, number>;
    const rows: FinanceTxn[] = payments.map((a) => {
      collected += a.feeCents;
      if (a.paymentMethod && method[a.paymentMethod] !== undefined) method[a.paymentMethod] += a.feeCents;
      const g = a.child?.guardian ?? null;
      return {
        id: a.id,
        invoiceNumber: this.invoiceNo(f.xeroInvoicePrefix, a.id),
        paidDate: this.localDate(a.paidAt, tz) || this.localDate(a.serviceDate, tz),
        serviceDate: this.localDate(a.serviceDate, tz),
        child: a.child ? `${a.child.firstName} ${a.child.lastName}` : "—",
        guardian: g ? `${g.firstName} ${g.lastName}` : "Creche customer",
        guardianEmail: g?.email ?? null,
        method: a.paymentMethod ?? "",
        amountCents: a.feeCents,
      };
    });

    let refunded = 0;
    const refunds: FinanceRefund[] = refundedRequests.map((q) => {
      refunded += q.feeCents;
      return {
        id: q.id,
        invoiceNumber: this.invoiceNo(f.xeroInvoicePrefix, q.id, "B"),
        creditNumber: this.invoiceNo(f.xeroInvoicePrefix, q.id, "R"),
        paidDate: this.localDate(q.paidAt, tz) || this.localDate(q.decidedAt, tz),
        refundDate: this.localDate(q.decidedAt, tz),
        child: `${q.childFirstName} ${q.childLastName}`,
        parent: `${q.parentFirstName} ${q.parentLastName}`,
        parentEmail: q.parentEmail ?? null,
        amountCents: q.feeCents,
      };
    });

    let outstanding = 0, waived = 0;
    for (const a of serviceWindow) {
      if (a.paymentStatus === "unpaid" && a.status === "checked_out") outstanding += a.feeCents;
      else if (a.paymentStatus === "waived") waived += a.feeCents;
    }

    return {
      range: { from: r.from, to: r.to },
      xero: { accountCode: f.xeroAccountCode, taxType: f.xeroTaxType, invoicePrefix: f.xeroInvoicePrefix },
      facility: { name: f.name, abn: f.abn, timezone: tz },
      totals: {
        collectedCents: collected,
        refundedCents: refunded,
        netCents: collected - refunded,
        outstandingCents: outstanding,
        waivedCents: waived,
      },
      byMethod: [
        { method: "cash", cents: method.cash },
        { method: "card", cents: method.card },
        { method: "eftpos", cents: method.eftpos },
        { method: "online", cents: method.online },
      ],
      rows,
      refunds,
    };
  }

  /**
   * Xero's sales-invoice import template (Business → Invoices → Import). One
   * invoice line per fee collected; declined-and-refunded online prepayments
   * export as an invoice + credit-note pair (negative UnitAmount) so both bank
   * transactions reconcile and the pair nets to zero.
   */
  async xeroSalesCsv(from?: string, to?: string): Promise<{ filename: string; csv: string }> {
    const d = await this.summary(from, to);
    const HEADERS = [
      "*ContactName", "EmailAddress",
      "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4",
      "POCity", "PORegion", "POPostalCode", "POCountry",
      "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate",
      "InventoryItemCode", "*Description", "*Quantity", "*UnitAmount", "Discount",
      "*AccountCode", "*TaxType",
      "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2",
      "Currency", "BrandingTheme",
    ];
    const esc = (v: string | number) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (cols: Record<string, string | number>) => HEADERS.map((h) => esc(cols[h] ?? "")).join(",");
    const dollars = (cents: number) => (cents / 100).toFixed(2);

    const out = [HEADERS.join(",")];
    for (const t of d.rows) {
      out.push(line({
        "*ContactName": t.guardian,
        "EmailAddress": t.guardianEmail ?? "",
        "*InvoiceNumber": t.invoiceNumber,
        "Reference": `Creche ${t.serviceDate}`,
        "*InvoiceDate": t.paidDate,
        "*DueDate": t.paidDate,
        "*Description": `Creche care - ${t.child} - ${t.serviceDate}${t.method ? ` (paid by ${t.method})` : ""}`,
        "*Quantity": 1,
        "*UnitAmount": dollars(t.amountCents),
        "*AccountCode": d.xero.accountCode,
        "*TaxType": d.xero.taxType,
        "Currency": "AUD",
      }));
    }
    for (const q of d.refunds) {
      const common = {
        "*ContactName": q.parent,
        "EmailAddress": q.parentEmail ?? "",
        "*Quantity": 1,
        "*AccountCode": d.xero.accountCode,
        "*TaxType": d.xero.taxType,
        "Currency": "AUD",
      };
      out.push(line({
        ...common,
        "*InvoiceNumber": q.invoiceNumber,
        "Reference": "Online booking prepayment (later declined)",
        "*InvoiceDate": q.paidDate,
        "*DueDate": q.paidDate,
        "*Description": `Creche online booking prepayment - ${q.child}`,
        "*UnitAmount": dollars(q.amountCents),
      }));
      out.push(line({
        ...common,
        "*InvoiceNumber": q.creditNumber,
        "Reference": `Refund of ${q.invoiceNumber}`,
        "*InvoiceDate": q.refundDate,
        "*DueDate": q.refundDate,
        "*Description": `Refund - declined online booking - ${q.child}`,
        "*UnitAmount": `-${dollars(q.amountCents)}`,
      }));
    }
    return {
      filename: `xero-sales-${d.range.from}-to-${d.range.to}.csv`,
      // UTF-8 BOM so Excel/importers don't misread names as Windows-1252.
      csv: "﻿" + out.join("\r\n") + "\r\n",
    };
  }
}
