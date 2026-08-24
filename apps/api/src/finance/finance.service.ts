import { BadRequestException, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { escapeCsvCell } from "../common/csv.util";

// Finance works on a cash basis: a transaction belongs to the export window by
// the day the money actually moved (paidAt / refund decidedAt, facility-local),
// unlike the Reports module which slices by service date. That's what lines up
// with the bank statement when the file lands in Xero.

export interface FinanceTxn {
  id: string;
  kind: "fee" | "prepayment"; // an attendance fee, or an online prepayment cash-in
  invoiceNumber: string;
  paidDate: string; // facility-local ISO date the money moved
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
    const parse = (v: string, label: string) => {
      const d = DateTime.fromISO(v, { zone: tz });
      if (!d.isValid) throw new BadRequestException(`Invalid ${label} date`);
      return d;
    };
    const startD = (from ? parse(from, "from") : today.minus({ days: 29 })).startOf("day");
    const endExclusive = (to ? parse(to, "to") : today).startOf("day").plus({ days: 1 });
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

    const [payments, prepayments, refundedRequests, serviceWindow, attendanceRefunds] = await Promise.all([
      // Money in (attendance fees): paid inside the window (any payment method).
      // Confirmed online bookings are attendances too, so they're counted here,
      // dated by their actual charge time (createConfirmedBooking carries paidAt).
      this.prisma.attendance.findMany({
        where: { paymentStatus: "paid", feeCents: { gt: 0 }, paidAt: { gte: r.start, lt: r.end } },
        include: { child: { include: { guardian: true } } },
        orderBy: { paidAt: "asc" },
      }),
      // Money in (online prepayments) that are NOT yet an attendance — i.e. still
      // pending, or declined. Confirmed ones are excluded (counted above as the
      // attendance), so nothing is double-counted. Keyed by the charge date.
      this.prisma.bookingRequest.findMany({
        where: {
          paymentStatus: "paid",
          status: { in: ["pending", "declined"] },
          paidAt: { gte: r.start, lt: r.end },
        },
        orderBy: { paidAt: "asc" },
      }),
      // Money back out: online prepayments refunded when a request was declined,
      // keyed by the refund (decision) date.
      this.prisma.bookingRequest.findMany({
        where: { status: "declined", paymentStatus: "paid", decidedAt: { gte: r.start, lt: r.end } },
        orderBy: { decidedAt: "asc" },
      }),
      // Context KPIs (not exported): unpaid/waived fees for sessions in the window.
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end }, feeCents: { gt: 0 }, paymentStatus: { not: "paid" } },
        select: { feeCents: true, paymentStatus: true, status: true },
      }),
      // Money back out (attendance refunds): late-cancellation refunds, keyed by
      // the refund date.
      this.prisma.attendance.findMany({
        where: { refundedCents: { gt: 0 }, refundedAt: { gte: r.start, lt: r.end } },
        include: { child: { include: { guardian: true } } },
        orderBy: { refundedAt: "asc" },
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
        kind: "fee" as const,
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

    // Prepayment cash-ins become money-in rows too (method: online), so the
    // transactions total and the CSV match `collected`.
    for (const q of prepayments) {
      collected += q.feeCents;
      method.online += q.feeCents;
      rows.push({
        id: q.id,
        kind: "prepayment" as const,
        invoiceNumber: this.invoiceNo(f.xeroInvoicePrefix, q.id, "B"),
        paidDate: this.localDate(q.paidAt, tz) || this.localDate(q.requestedStart, tz),
        serviceDate: this.localDate(q.requestedStart, tz),
        child: `${q.childFirstName} ${q.childLastName}`,
        guardian: `${q.parentFirstName} ${q.parentLastName}`,
        guardianEmail: q.parentEmail ?? null,
        method: "online",
        amountCents: q.feeCents,
      });
    }

    let refunded = 0;
    // Late-cancellation refunds on captured bookings (money out, by refund date).
    const refunds: FinanceRefund[] = attendanceRefunds.map((a) => {
      refunded += a.refundedCents;
      const g = a.child?.guardian ?? null;
      return {
        id: a.id,
        invoiceNumber: this.invoiceNo(f.xeroInvoicePrefix, a.id),
        creditNumber: this.invoiceNo(f.xeroInvoicePrefix, a.id, "R"),
        paidDate: this.localDate(a.paidAt, tz) || this.localDate(a.serviceDate, tz),
        refundDate: this.localDate(a.refundedAt, tz),
        child: a.child ? `${a.child.firstName} ${a.child.lastName}` : "—",
        parent: g ? `${g.firstName} ${g.lastName}` : "Creche customer",
        parentEmail: g?.email ?? null,
        amountCents: a.refundedCents,
      };
    });
    // Legacy: refunds of declined online prepayments (pre-auth-capture bookings).
    for (const q of refundedRequests) {
      refunded += q.feeCents;
      refunds.push({
        id: q.id,
        invoiceNumber: this.invoiceNo(f.xeroInvoicePrefix, q.id, "B"),
        creditNumber: this.invoiceNo(f.xeroInvoicePrefix, q.id, "R"),
        paidDate: this.localDate(q.paidAt, tz) || this.localDate(q.decidedAt, tz),
        refundDate: this.localDate(q.decidedAt, tz),
        child: `${q.childFirstName} ${q.childLastName}`,
        parent: `${q.parentFirstName} ${q.parentLastName}`,
        parentEmail: q.parentEmail ?? null,
        amountCents: q.feeCents,
      });
    }

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
   * invoice line per money-in row (attendance fees AND online prepayment
   * cash-ins), plus a negative credit-note line for each refunded prepayment.
   * A declined-and-refunded prepayment therefore appears as its cash-in invoice
   * (dated when charged) and a credit note (dated when refunded), so both bank
   * transactions reconcile and the pair nets to zero. The file total equals the
   * summary's net for the same range.
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
    const line = (cols: Record<string, string | number>) => HEADERS.map((h) => escapeCsvCell(cols[h] ?? "")).join(",");
    const dollars = (cents: number) => (cents / 100).toFixed(2);

    const out = [HEADERS.join(",")];
    for (const t of d.rows) {
      const description =
        t.kind === "prepayment"
          ? `Creche online booking prepayment - ${t.child}`
          : `Creche care - ${t.child} - ${t.serviceDate}${t.method ? ` (paid by ${t.method})` : ""}`;
      out.push(line({
        "*ContactName": t.guardian,
        "EmailAddress": t.guardianEmail ?? "",
        "*InvoiceNumber": t.invoiceNumber,
        "Reference": t.kind === "prepayment" ? "Online booking prepayment" : `Creche ${t.serviceDate}`,
        "*InvoiceDate": t.paidDate,
        "*DueDate": t.paidDate,
        "*Description": description,
        "*Quantity": 1,
        "*UnitAmount": dollars(t.amountCents),
        "*AccountCode": d.xero.accountCode,
        "*TaxType": d.xero.taxType,
        "Currency": "AUD",
      }));
    }
    // Credit notes for refunded prepayments (the matching cash-in invoice is in
    // d.rows above). Negative UnitAmount, dated the refund day.
    for (const q of d.refunds) {
      out.push(line({
        "*ContactName": q.parent,
        "EmailAddress": q.parentEmail ?? "",
        "*InvoiceNumber": q.creditNumber,
        "Reference": `Refund of ${q.invoiceNumber}`,
        "*InvoiceDate": q.refundDate,
        "*DueDate": q.refundDate,
        "*Description": `Refund - declined online booking - ${q.child}`,
        "*Quantity": 1,
        "*UnitAmount": `-${dollars(q.amountCents)}`,
        "*AccountCode": d.xero.accountCode,
        "*TaxType": d.xero.taxType,
        "Currency": "AUD",
      }));
    }
    return {
      filename: `xero-sales-${d.range.from}-to-${d.range.to}.csv`,
      // UTF-8 BOM so Excel/importers don't misread names as Windows-1252.
      csv: "﻿" + out.join("\r\n") + "\r\n",
    };
  }
}
