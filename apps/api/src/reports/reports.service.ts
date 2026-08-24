import { BadRequestException, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { computeAge } from "../common/age.util";

// All reports operate over a local (facility-timezone) date range and are
// aggregated in memory — creche data volumes are small. Money is always cents.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  private async facility() {
    return this.settings.get();
  }

  /** Resolve a [from,to] pair of local dates into UTC bounds + the day list. */
  private range(tz: string, from?: string, to?: string) {
    const today = DateTime.now().setZone(tz);
    const parse = (v: string, label: string) => {
      const d = DateTime.fromISO(v, { zone: tz });
      if (!d.isValid) throw new BadRequestException(`Invalid ${label} date`);
      return d;
    };
    const startD = (from ? parse(from, "from") : today.minus({ days: 29 })).startOf("day");
    const endExclusive = (to ? parse(to, "to") : today).startOf("day").plus({ days: 1 });
    const days: string[] = [];
    for (let d = startD; d < endExclusive && days.length < 400; d = d.plus({ days: 1 })) {
      days.push(d.toISODate()!);
    }
    return {
      start: startD.toJSDate(),
      end: endExclusive.toJSDate(),
      days,
      from: startD.toISODate()!,
      to: endExclusive.minus({ days: 1 }).toISODate()!,
    };
  }

  private localDate(d: Date | null, tz: string): string | null {
    return d ? DateTime.fromJSDate(d).setZone(tz).toISODate() : null;
  }

  private emptyByDay(days: string[], keys: string[]) {
    const m: Record<string, any> = {};
    for (const day of days) m[day] = Object.fromEntries([["date", day], ...keys.map((k) => [k, 0])]);
    return m;
  }

  private childName(a: any) {
    return a.child ? `${a.child.firstName} ${a.child.lastName}` : "—";
  }

  private hours(inAt: Date | null, outAt: Date | null): number {
    if (!inAt || !outAt) return 0;
    return Math.max(0, (outAt.getTime() - inAt.getTime()) / 3_600_000);
  }

  // ── Summary (dashboard) ─────────────────────────────────────────────────
  async summary(from?: string, to?: string) {
    const f = await this.facility();
    const r = this.range(f.timezone, from, to);
    const [atts, newFamilies, requests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end } },
        include: { child: true },
      }),
      this.prisma.guardian.count({ where: { createdAt: { gte: r.start, lt: r.end } } }),
      this.prisma.bookingRequest.findMany({ where: { createdAt: { gte: r.start, lt: r.end } } }),
    ]);

    let collected = 0, outstanding = 0, waived = 0, sessions = 0, dropIns = 0, noShows = 0, hoursTotal = 0;
    const method = { cash: 0, card: 0, eftpos: 0, online: 0 } as Record<string, number>;
    const revByDay = this.emptyByDay(r.days, ["collected"]);
    const sessByDay = this.emptyByDay(r.days, ["booked", "dropIn"]);

    for (const a of atts) {
      const day = this.localDate(a.serviceDate, f.timezone)!;
      if (a.paymentStatus === "paid") {
        collected += a.feeCents;
        if (a.paymentMethod && method[a.paymentMethod] !== undefined) method[a.paymentMethod] += a.feeCents;
        if (revByDay[day]) revByDay[day].collected += a.feeCents;
      } else if (a.paymentStatus === "unpaid" && a.status === "checked_out") {
        outstanding += a.feeCents;
      } else if (a.paymentStatus === "waived") {
        waived += a.feeCents;
      }
      if (a.status === "checked_in" || a.status === "checked_out") {
        sessions++;
        if (a.isDropIn) { dropIns++; if (sessByDay[day]) sessByDay[day].dropIn++; }
        else if (sessByDay[day]) sessByDay[day].booked++;
        hoursTotal += this.hours(a.checkInAt, a.checkOutAt);
      }
      if (a.status === "no_show") noShows++;
    }

    const occByDay = this.occupancyByDay(atts, r.days, f.timezone, f.capacity);
    const refunded = requests
      .filter((q) => q.status === "declined" && q.paymentStatus === "paid")
      .reduce((s, q) => s + q.feeCents, 0);

    return {
      range: { from: r.from, to: r.to },
      currency: "AUD",
      kpis: {
        collectedCents: collected,
        outstandingCents: outstanding,
        waivedCents: waived,
        refundedCents: refunded,
        sessions,
        dropIns,
        preBooked: sessions - dropIns,
        noShows,
        hours: Math.round(hoursTotal * 10) / 10,
        newFamilies,
        onlineRequests: requests.length,
        peakOccupancy: occByDay.reduce((m, d) => Math.max(m, d.peak), 0),
        capacity: f.capacity,
      },
      revenueByDay: r.days.map((d) => revByDay[d]),
      sessionsByDay: r.days.map((d) => sessByDay[d]),
      occupancyByDay: occByDay,
      paymentMix: [
        { method: "cash", cents: method.cash },
        { method: "card", cents: method.card },
        { method: "eftpos", cents: method.eftpos },
        { method: "online", cents: method.online },
      ],
    };
  }

  /** Peak concurrent children per day (interval sweep on check-in/out). */
  private occupancyByDay(atts: any[], days: string[], tz: string, capacity: number) {
    const evByDay: Record<string, { t: number; d: number }[]> = {};
    for (const a of atts) {
      if (!a.checkInAt) continue;
      const day = this.localDate(a.serviceDate, tz)!;
      const outT = a.checkOutAt ?? DateTime.fromJSDate(a.checkInAt).setZone(tz).endOf("day").toJSDate();
      (evByDay[day] ??= []).push({ t: a.checkInAt.getTime(), d: +1 }, { t: outT.getTime(), d: -1 });
    }
    return days.map((date) => {
      const ev = (evByDay[date] ?? []).sort((x, y) => x.t - y.t || x.d - y.d);
      let cur = 0, peak = 0;
      for (const e of ev) { cur += e.d; if (cur > peak) peak = cur; }
      return { date, peak, capacity };
    });
  }

  // ── Financial ───────────────────────────────────────────────────────────
  async financial(from?: string, to?: string) {
    const f = await this.facility();
    const r = this.range(f.timezone, from, to);
    const [atts, requests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end }, feeCents: { gt: 0 } },
        include: { child: true },
        orderBy: { serviceDate: "asc" },
      }),
      this.prisma.bookingRequest.findMany({
        where: { createdAt: { gte: r.start, lt: r.end } },
      }),
    ]);

    let collected = 0, outstanding = 0, waived = 0;
    const method = { cash: 0, card: 0, eftpos: 0, online: 0 } as Record<string, number>;
    const byDay = this.emptyByDay(r.days, ["collected", "outstanding"]);
    const rows = atts.map((a) => {
      const day = this.localDate(a.serviceDate, f.timezone)!;
      if (a.paymentStatus === "paid") {
        collected += a.feeCents;
        if (a.paymentMethod && method[a.paymentMethod] !== undefined) method[a.paymentMethod] += a.feeCents;
        if (byDay[day]) byDay[day].collected += a.feeCents;
      } else if (a.paymentStatus === "unpaid" && a.status === "checked_out") {
        outstanding += a.feeCents;
        if (byDay[day]) byDay[day].outstanding += a.feeCents;
      } else if (a.paymentStatus === "waived") {
        waived += a.feeCents;
      }
      return {
        date: day,
        child: this.childName(a),
        court: a.court ?? "",
        hours: Math.round(this.hours(a.checkInAt, a.checkOutAt) * 100) / 100,
        feeCents: a.feeCents,
        status: a.status,
        paymentStatus: a.paymentStatus,
        method: a.paymentMethod ?? "",
        paidAt: this.localDate(a.paidAt, f.timezone) ?? "",
      };
    });

    const refunded = requests
      .filter((q) => q.status === "declined" && q.paymentStatus === "paid")
      .reduce((s, q) => s + q.feeCents, 0);
    const prepaid = requests
      .filter((q) => q.paymentStatus === "paid")
      .reduce((s, q) => s + q.feeCents, 0);

    return {
      range: { from: r.from, to: r.to },
      totals: {
        collectedCents: collected,
        outstandingCents: outstanding,
        waivedCents: waived,
        prepaidOnlineCents: prepaid,
        refundedCents: refunded,
        netCents: collected - refunded,
      },
      byMethod: [
        { method: "cash", cents: method.cash },
        { method: "card", cents: method.card },
        { method: "eftpos", cents: method.eftpos },
        { method: "online", cents: method.online },
      ],
      byDay: r.days.map((d) => byDay[d]),
      rows,
    };
  }

  // ── Attendance & occupancy ───────────────────────────────────────────────
  async attendance(from?: string, to?: string) {
    const f = await this.facility();
    const r = this.range(f.timezone, from, to);
    const atts = await this.prisma.attendance.findMany({
      where: { serviceDate: { gte: r.start, lt: r.end } },
      include: { child: true },
      orderBy: { serviceDate: "asc" },
    });

    let sessions = 0, dropIns = 0, noShows = 0, cancelled = 0, hoursTotal = 0;
    const byDay = this.emptyByDay(r.days, ["booked", "dropIn", "hours"]);
    const byCourt: Record<string, number> = {};
    const rows = atts.map((a) => {
      const day = this.localDate(a.serviceDate, f.timezone)!;
      const h = this.hours(a.checkInAt, a.checkOutAt);
      if (a.status === "checked_in" || a.status === "checked_out") {
        sessions++;
        if (a.isDropIn) { dropIns++; if (byDay[day]) byDay[day].dropIn++; }
        else if (byDay[day]) byDay[day].booked++;
        hoursTotal += h;
        if (byDay[day]) byDay[day].hours = Math.round((byDay[day].hours + h) * 10) / 10;
        if (a.court) byCourt[a.court] = (byCourt[a.court] ?? 0) + 1;
      }
      if (a.status === "no_show") noShows++;
      if (a.status === "cancelled") cancelled++;
      return {
        date: day,
        child: this.childName(a),
        type: a.isDropIn ? "drop-in" : "booked",
        court: a.court ?? "",
        checkIn: a.checkInAt ? DateTime.fromJSDate(a.checkInAt).setZone(f.timezone).toFormat("HH:mm") : "",
        checkOut: a.checkOutAt ? DateTime.fromJSDate(a.checkOutAt).setZone(f.timezone).toFormat("HH:mm") : "",
        hours: Math.round(h * 100) / 100,
        status: a.status,
      };
    });

    return {
      range: { from: r.from, to: r.to },
      totals: {
        sessions,
        preBooked: sessions - dropIns,
        dropIns,
        noShows,
        cancelled,
        hours: Math.round(hoursTotal * 10) / 10,
        avgHours: sessions ? Math.round((hoursTotal / sessions) * 10) / 10 : 0,
        capacity: f.capacity,
        peakOccupancy: this.occupancyByDay(atts, r.days, f.timezone, f.capacity).reduce((m, d) => Math.max(m, d.peak), 0),
      },
      byDay: r.days.map((d) => byDay[d]),
      occupancyByDay: this.occupancyByDay(atts, r.days, f.timezone, f.capacity),
      byCourt: Object.entries(byCourt).map(([court, sessions]) => ({ court, sessions })).sort((a, b) => b.sessions - a.sessions),
      rows,
    };
  }

  // ── Families & children ──────────────────────────────────────────────────
  async families(from?: string, to?: string) {
    const f = await this.facility();
    const r = this.range(f.timezone, from, to);
    const [guardians, newInRange, courtAtts] = await Promise.all([
      this.prisma.guardian.findMany({ include: { children: true } }),
      this.prisma.guardian.findMany({ where: { createdAt: { gte: r.start, lt: r.end } } }),
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end }, court: { not: null } },
        select: { court: true, status: true },
      }),
    ]);

    const activeFamilies = guardians.filter((g) => g.children.some((c) => c.active)).length;
    const activeChildren = guardians.flatMap((g) => g.children).filter((c) => c.active);
    const ageBuckets: Record<string, number> = { "Under 1": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0, "Unknown": 0 };
    for (const c of activeChildren) {
      const age = computeAge(c.birthMonth, c.birthYear);
      if (age === null) ageBuckets["Unknown"]++;
      else if (age < 1) ageBuckets["Under 1"]++;
      else if (age >= 6) ageBuckets["6+"]++;
      else ageBuckets[String(age)]++;
    }
    const waiverSigned = guardians.filter((g) => g.waiverAcceptedAt).length;

    const regByDay = this.emptyByDay(r.days, ["registrations"]);
    for (const g of newInRange) {
      const day = this.localDate(g.createdAt, f.timezone)!;
      if (regByDay[day]) regByDay[day].registrations++;
    }
    const byCourt: Record<string, number> = {};
    for (const a of courtAtts) if (a.court) byCourt[a.court] = (byCourt[a.court] ?? 0) + 1;

    const rows = guardians
      .filter((g) => g.children.some((c) => c.active))
      .map((g) => ({
        family: `${g.firstName} ${g.lastName}`,
        phone: g.phone,
        children: g.children.filter((c) => c.active).length,
        waiver: g.waiverAcceptedAt ? "signed" : "not signed",
        registered: this.localDate(g.createdAt, f.timezone) ?? "",
      }));

    return {
      range: { from: r.from, to: r.to },
      totals: {
        activeFamilies,
        activeChildren: activeChildren.length,
        newFamilies: newInRange.length,
        waiverSigned,
        waiverUnsigned: guardians.length - waiverSigned,
      },
      childrenByAge: Object.entries(ageBuckets).map(([bucket, count]) => ({ bucket, count })),
      registrationsByDay: r.days.map((d) => regByDay[d]),
      courtUsage: Object.entries(byCourt).map(([court, sessions]) => ({ court, sessions })).sort((a, b) => b.sessions - a.sessions),
      rows,
    };
  }

  // ── Online bookings & staff activity ─────────────────────────────────────
  async bookings(from?: string, to?: string) {
    const f = await this.facility();
    const r = this.range(f.timezone, from, to);
    const [requests, atts, staff] = await Promise.all([
      this.prisma.bookingRequest.findMany({
        where: { createdAt: { gte: r.start, lt: r.end } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: r.start, lt: r.end } },
        select: { checkedInById: true, checkedOutById: true },
      }),
      this.prisma.user.findMany({ select: { id: true, firstName: true, lastName: true } }),
    ]);

    const byStatus = { pending: 0, confirmed: 0, declined: 0, cancelled: 0 } as Record<string, number>;
    let prepaid = 0, refunded = 0;
    for (const q of requests) {
      if (byStatus[q.status] !== undefined) byStatus[q.status]++;
      if (q.paymentStatus === "paid") prepaid += q.feeCents;
      if (q.status === "declined" && q.paymentStatus === "paid") refunded += q.feeCents;
    }

    const nameById = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    const activity: Record<string, { checkIns: number; checkOuts: number }> = {};
    for (const a of atts) {
      if (a.checkedInById) (activity[a.checkedInById] ??= { checkIns: 0, checkOuts: 0 }).checkIns++;
      if (a.checkedOutById) (activity[a.checkedOutById] ??= { checkIns: 0, checkOuts: 0 }).checkOuts++;
    }

    const requestRows = requests.map((q) => ({
      created: this.localDate(q.createdAt, f.timezone) ?? "",
      child: `${q.childFirstName} ${q.childLastName}`,
      parent: `${q.parentFirstName} ${q.parentLastName}`,
      session: `${DateTime.fromJSDate(q.requestedStart).setZone(f.timezone).toFormat("dd LLL HH:mm")}–${DateTime.fromJSDate(q.requestedEnd).setZone(f.timezone).toFormat("HH:mm")}`,
      court: q.court ?? "",
      feeCents: q.feeCents,
      status: q.status,
      payment: q.paymentStatus,
    }));

    return {
      range: { from: r.from, to: r.to },
      totals: {
        requests: requests.length,
        ...byStatus,
        prepaidCents: prepaid,
        refundedCents: refunded,
      },
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      staffActivity: Object.entries(activity)
        .map(([id, v]) => ({ staff: nameById.get(id) ?? "—", ...v }))
        .sort((a, b) => b.checkIns + b.checkOuts - (a.checkIns + a.checkOuts)),
      requestRows,
    };
  }
}
