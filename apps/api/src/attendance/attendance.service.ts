import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { PaymentsService } from "../payments/payments.service";
import { decryptField, encryptField } from "../common/encryption.util";
import { computeAge } from "../common/age.util";
import { JwtPayload } from "../auth/jwt-payload.interface";
import { BookAttendanceDto, CheckOutDto, DropInDto, TakePaymentDto } from "./attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private payments: PaymentsService,
  ) {}

  private async facility() {
    return this.settings.get();
  }

  /** The UTC bounds of a given local calendar day (default: today). */
  private dayBounds(tz: string, isoDate?: string) {
    const base = isoDate ? DateTime.fromISO(isoDate, { zone: tz }) : DateTime.now().setZone(tz);
    const start = base.startOf("day");
    return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate(), date: start.toJSDate() };
  }

  /**
   * Fee for a span of care on the hourly rate. Time is billed rounded UP to the
   * nearest half-hour (so any part-half-hour counts as a full 30 minutes), which
   * keeps billing in tidy 30-minute increments.
   */
  private feeFor(start: Date, end: Date, hourlyRateCents: number): number {
    const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    const billedHours = Math.ceil(hours * 2) / 2;
    return Math.round(billedHours * hourlyRateCents);
  }

  private childCard(child: any) {
    return {
      id: child.id,
      name: `${child.firstName} ${child.lastName}`,
      age: computeAge(child.birthMonth, child.birthYear),
      medicalNotes: child.medicalNotesEncrypted ? decryptField(child.medicalNotesEncrypted) : null,
      guardian: child.guardian
        ? {
            name: `${child.guardian.firstName} ${child.guardian.lastName}`,
            phone: child.guardian.phone,
            relationship: child.guardian.relationship,
            // Second parent shown alongside the primary on the roster cards.
            secondName: child.guardian.secondFirstName ? `${child.guardian.secondFirstName} ${child.guardian.secondLastName ?? ""}`.trim() : null,
            secondPhone: child.guardian.secondPhone ?? null,
            // Compared against the facility's current version on the client to
            // surface "waiver required" BEFORE the check-in attempt.
            waiverVersion: child.guardian.waiverVersion ?? null,
          }
        : null,
      emergencyContacts: (child.emergencyContacts ?? []).map((e: any) => ({
        name: e.name,
        phone: e.phone,
        relationship: e.relationship,
        canPickup: e.canPickup,
      })),
    };
  }

  private serialize(a: any) {
    return {
      id: a.id,
      status: a.status,
      isDropIn: a.isDropIn,
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      checkInAt: a.checkInAt,
      checkOutAt: a.checkOutAt,
      court: a.court,
      courtBookingName: a.courtBookingName,
      feeCents: a.feeCents,
      paymentStatus: a.paymentStatus,
      paymentMethod: a.paymentMethod,
      refundedCents: a.refundedCents ?? 0,
      notes: a.notes,
      child: a.child ? this.childCard(a.child) : null,
    };
  }

  private childInclude = {
    child: { include: { guardian: true, emergencyContacts: true } },
  };

  /** How many children are in care right now. */
  private async currentlyInCare(): Promise<number> {
    return this.prisma.attendance.count({ where: { status: "checked_in" } });
  }

  private async assertCapacityForCheckIn() {
    const f = await this.facility();
    if ((await this.currentlyInCare()) >= f.capacity) {
      throw new ConflictException(`The creche is at capacity (${f.capacity}). Check a child out first.`);
    }
  }

  /** Waivers are mandatory before care starts. If the child's guardian hasn't
   * accepted the CURRENT waiver, an on-screen signature supplied with the
   * check-in stamps it; without one the check-in is refused so the desk knows
   * to collect a signature. */
  private async assertWaiverForCheckIn(childId: string, signature?: string) {
    const f = await this.facility();
    const current = f.waiverVersion ?? 1;
    const child = await this.prisma.child.findUnique({ where: { id: childId }, include: { guardian: true } });
    if (!child) throw new NotFoundException("Child not found");
    if (child.guardian.waiverVersion === current) return;
    if (!signature) {
      throw new ConflictException(
        child.guardian.waiverAcceptedAt
          ? "The waiver has been updated since this parent accepted it — please have them sign the current waiver on screen."
          : "This parent hasn't signed the waiver — please have them sign it on screen before checking in.",
      );
    }
    await this.prisma.guardian.update({
      where: { id: child.guardianId },
      data: {
        waiverSignatureEncrypted: encryptField(signature),
        waiverAcceptedAt: new Date(),
        waiverVersion: current,
        waiverMethod: "signed",
      },
    });
  }

  async roster() {
    const f = await this.facility();
    const { start, end } = this.dayBounds(f.timezone);
    const rows = await this.prisma.attendance.findMany({
      where: {
        OR: [
          { status: "checked_in" },
          { serviceDate: { gte: start, lt: end }, status: { in: ["booked", "checked_out", "no_show"] } },
        ],
      },
      include: this.childInclude,
      orderBy: [{ checkInAt: "asc" }, { scheduledStart: "asc" }],
    });
    const all = rows.map((a) => this.serialize(a));
    const inCare = all.filter((a) => a.status === "checked_in");
    return {
      capacity: f.capacity,
      inCareCount: inCare.length,
      hourlyRateCents: f.hourlyRateCents,
      courts: f.courts,
      // For the day-timeline view and the mandatory-waiver check-in gate.
      openTime: f.openTime,
      closeTime: f.closeTime,
      waiverVersion: f.waiverVersion ?? 1,
      inCare,
      expected: all.filter((a) => a.status === "booked"),
      finished: all.filter((a) => a.status === "checked_out" || a.status === "no_show"),
    };
  }

  async listByDate(isoDate?: string) {
    const f = await this.facility();
    const { start, end } = this.dayBounds(f.timezone, isoDate);
    const rows = await this.prisma.attendance.findMany({
      where: { serviceDate: { gte: start, lt: end } },
      include: this.childInclude,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((a) => this.serialize(a));
  }

  /**
   * Per-day booking counts over [from, to] (facility-local dates) for the
   * bookings calendar. Counts active attendances (excludes cancelled/no-show),
   * split into pre-booked vs drop-in, plus pending online requests per day.
   */
  async calendar(from?: string, to?: string) {
    const f = await this.facility();
    const tz = f.timezone;
    const startDt = (from ? DateTime.fromISO(from, { zone: tz }) : DateTime.now().setZone(tz).startOf("month")).startOf("day");
    const endDt = (to ? DateTime.fromISO(to, { zone: tz }) : startDt.endOf("month")).startOf("day").plus({ days: 1 });
    if (!startDt.isValid || !endDt.isValid || endDt <= startDt) {
      throw new BadRequestException("Invalid calendar range");
    }
    const start = startDt.toJSDate();
    const end = endDt.toJSDate();

    const [atts, requests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: start, lt: end } },
        select: { serviceDate: true, status: true, isDropIn: true },
      }),
      this.prisma.bookingRequest.findMany({
        where: { status: "pending", requestedStart: { gte: start, lt: end } },
        select: { requestedStart: true },
      }),
    ]);

    const key = (d: Date) => DateTime.fromJSDate(d).setZone(tz).toISODate() as string;
    const days = new Map<string, { date: string; total: number; booked: number; dropIn: number; pending: number }>();
    const bump = (k: string) => days.get(k) ?? days.set(k, { date: k, total: 0, booked: 0, dropIn: 0, pending: 0 }).get(k)!;
    for (const a of atts) {
      if (a.status === "cancelled" || a.status === "no_show") continue;
      const e = bump(key(a.serviceDate));
      e.total++;
      if (a.isDropIn) e.dropIn++; else e.booked++;
    }
    for (const q of requests) bump(key(q.requestedStart)).pending++;

    return {
      capacity: f.capacity,
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private async loadChild(childId: string) {
    const child = await this.prisma.child.findFirst({ where: { id: childId, active: true } });
    if (!child) throw new NotFoundException("Child not found");
    return child;
  }

  async book(dto: BookAttendanceDto) {
    const f = await this.facility();
    await this.loadChild(dto.childId);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (end <= start) throw new BadRequestException("End time must be after the start time");
    if ((end.getTime() - start.getTime()) / 3_600_000 > f.maxBookingHours) {
      throw new BadRequestException(`A booking can be at most ${f.maxBookingHours} hours long`);
    }
    // Capacity across the booked window (booked + in-care overlaps).
    const overlapping = await this.prisma.attendance.count({
      where: {
        status: { in: ["booked", "checked_in"] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
    });
    if (overlapping >= f.capacity) {
      throw new ConflictException("The creche is fully booked for that time — try a different window.");
    }
    const { date } = this.dayBounds(f.timezone, DateTime.fromJSDate(start).setZone(f.timezone).toISODate() ?? undefined);
    const created = await this.prisma.attendance.create({
      data: {
        childId: dto.childId,
        serviceDate: date,
        scheduledStart: start,
        scheduledEnd: end,
        status: "booked",
        feeCents: this.feeFor(start, end, f.hourlyRateCents),
        court: dto.court.trim(),
        courtBookingName: dto.courtBookingName?.trim() || null,
        notes: dto.notes,
      },
      include: this.childInclude,
    });
    return this.serialize(created);
  }

  /**
   * Create a booking that's already paid — used when staff confirm a parent's
   * prepaid booking request. Capacity is enforced against the real roster
   * (booked + in-care) so a confirmation can never oversell a window.
   */
  async createConfirmedBooking(p: {
    childId: string;
    start: Date;
    end: Date;
    feeCents: number;
    court?: string | null;
    courtBookingName?: string | null;
    stripePaymentIntentId?: string | null;
    // When the prepayment was actually charged (the online booking's paidAt) —
    // so cash-basis finance dates the revenue to the charge, not the confirm.
    paidAt?: Date | null;
    notes?: string | null;
  }) {
    const f = await this.facility();
    if (p.end <= p.start) throw new BadRequestException("End time must be after the start time");
    const overlapping = await this.prisma.attendance.count({
      where: {
        status: { in: ["booked", "checked_in"] },
        scheduledStart: { lt: p.end },
        scheduledEnd: { gt: p.start },
      },
    });
    if (overlapping >= f.capacity) {
      throw new ConflictException("The creche is fully booked for that time — can't confirm this request.");
    }
    const paid = !!p.stripePaymentIntentId;
    const { date } = this.dayBounds(
      f.timezone,
      DateTime.fromJSDate(p.start).setZone(f.timezone).toISODate() ?? undefined,
    );
    const created = await this.prisma.attendance.create({
      data: {
        childId: p.childId,
        serviceDate: date,
        scheduledStart: p.start,
        scheduledEnd: p.end,
        status: "booked",
        feeCents: p.feeCents,
        court: p.court ?? null,
        courtBookingName: p.courtBookingName ?? null,
        paymentStatus: paid ? "paid" : "unpaid",
        paymentMethod: paid ? "online" : null,
        stripePaymentIntentId: p.stripePaymentIntentId ?? null,
        paidAt: paid ? (p.paidAt ?? new Date()) : null,
        notes: p.notes ?? null,
      },
      include: this.childInclude,
    });
    return created;
  }

  /** Walk-in: create the attendance already checked in. */
  async dropIn(actor: JwtPayload, dto: DropInDto) {
    const f = await this.facility();
    await this.loadChild(dto.childId);
    await this.assertCapacityForCheckIn();
    await this.assertWaiverForCheckIn(dto.childId, dto.waiverSignature);
    const now = new Date();
    const { date } = this.dayBounds(f.timezone);
    const created = await this.prisma.attendance.create({
      data: {
        childId: dto.childId,
        serviceDate: date,
        isDropIn: true,
        status: "checked_in",
        checkInAt: now,
        checkedInById: actor.sub,
        court: dto.court?.trim() || null,
      },
      include: this.childInclude,
    });
    return this.serialize(created);
  }

  /** Check in an existing booking on arrival (optionally recording the court). */
  async checkIn(actor: JwtPayload, id: string, court?: string, waiverSignature?: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status !== "booked") throw new BadRequestException("This booking can't be checked in");
    await this.assertCapacityForCheckIn();
    await this.assertWaiverForCheckIn(a.childId, waiverSignature);
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        status: "checked_in",
        checkInAt: new Date(),
        checkedInById: actor.sub,
        // Keep any court already set on the booking unless a new one is given.
        ...(court !== undefined ? { court: court.trim() || null } : {}),
      },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  /** Update which court the parent is on (e.g. they moved courts). */
  async setCourt(id: string, court?: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: { court: court?.trim() || null },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  async checkOut(actor: JwtPayload, id: string, dto: CheckOutDto) {
    const f = await this.facility();
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status !== "checked_in" || !a.checkInAt) throw new BadRequestException("This child isn't currently checked in");
    const now = new Date();
    // A settled fee is FROZEN: recomputing it on a prepaid/waived row either
    // books phantom revenue (overstay) or silently shrinks banked money (early
    // pickup) — the ledger must keep matching the bank. An overstay is
    // surfaced to the desk as a difference to collect, not a rewrite.
    const settled = a.paymentStatus === "paid" || a.paymentStatus === "waived";
    const actualFeeCents = this.feeFor(a.checkInAt, now, f.hourlyRateCents);
    const feeCents = settled ? a.feeCents : actualFeeCents;
    const overstayCents = settled && actualFeeCents > a.feeCents ? actualFeeCents - a.feeCents : 0;

    // Optionally settle payment at the same time.
    let paymentStatus = a.paymentStatus;
    let paymentMethod = a.paymentMethod;
    let stripePaymentIntentId = a.stripePaymentIntentId;
    let paidAt = a.paidAt;
    if (dto.method && feeCents > 0) {
      if (dto.method === "online") {
        if (!dto.stripePaymentIntentId) throw new BadRequestException("A card payment reference is required for online payment");
        await this.payments.assertSucceeded(dto.stripePaymentIntentId, feeCents, `attendance:${id}`);
        stripePaymentIntentId = dto.stripePaymentIntentId;
      }
      paymentStatus = "paid";
      paymentMethod = dto.method;
      paidAt = now;
    }

    // Atomic claim: only one concurrent check-out wins (the status predicate
    // makes the losing request a clean 400 instead of a silent overwrite).
    const claim = await this.prisma.attendance.updateMany({
      where: { id, status: "checked_in" },
      data: {
        status: "checked_out",
        checkOutAt: now,
        checkedOutById: actor.sub,
        feeCents,
        paymentStatus,
        paymentMethod,
        stripePaymentIntentId,
        paidAt,
        ...(overstayCents > 0
          ? { notes: `${a.notes ? a.notes + " · " : ""}Overstay: time in care bills ${(actualFeeCents / 100).toFixed(2)} vs ${(a.feeCents / 100).toFixed(2)} prepaid — collect ${(overstayCents / 100).toFixed(2)} at the desk.` }
          : {}),
      },
    });
    if (claim.count === 0) throw new BadRequestException("This child isn't currently checked in");
    const updated = await this.prisma.attendance.findUnique({ where: { id }, include: this.childInclude });
    return { ...this.serialize(updated), overstayCents };
  }

  /** A Stripe intent for the fee, so staff can take a card onsite (online method). */
  async paymentIntent(id: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status === "cancelled" || a.status === "no_show") throw new BadRequestException("This booking was cancelled");
    if (a.feeCents <= 0) throw new BadRequestException("Nothing to pay");
    if (a.paymentStatus === "paid" || a.paymentStatus === "waived") throw new BadRequestException("Already settled");
    return this.payments.createIntent(a.feeCents, `attendance:${id}`);
  }

  /** Record a payment against an attendance (at checkout or afterwards). */
  async takePayment(id: string, dto: TakePaymentDto) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.paymentStatus === "paid") throw new BadRequestException("Already paid");
    if (a.feeCents <= 0) throw new BadRequestException("Nothing to pay");
    if (dto.method === "online") {
      if (!dto.stripePaymentIntentId) throw new BadRequestException("A card payment reference is required");
      await this.payments.assertSucceeded(dto.stripePaymentIntentId, a.feeCents, `attendance:${id}`);
    }
    // Guarded claim: the fee we verified must still be the fee on the row, and
    // it must not have been paid concurrently — otherwise the losing request
    // fails cleanly instead of overwriting the winner.
    const claim = await this.prisma.attendance.updateMany({
      where: { id, paymentStatus: { in: ["unpaid", "authorized"] }, feeCents: a.feeCents },
      data: {
        paymentStatus: "paid",
        paymentMethod: dto.method,
        stripePaymentIntentId: dto.method === "online" ? dto.stripePaymentIntentId : null,
        paidAt: new Date(),
      },
    });
    if (claim.count === 0) throw new BadRequestException("This fee was just settled or changed — refresh and check before charging again");
    const updated = await this.prisma.attendance.findUnique({ where: { id }, include: this.childInclude });
    return this.serialize(updated);
  }

  async waivePayment(id: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    // A collected payment can't be "waived" away — that would silently drop
    // banked money from the books while the cash stays in the bank.
    if (a.paymentStatus === "paid") throw new BadRequestException("This fee has already been paid — a refund, not a waiver, is the way to give it back");
    if (a.status === "cancelled") throw new BadRequestException("This booking was cancelled");
    const updated = await this.prisma.attendance.update({
      where: { id },
      // paidAt stays untouched: waived fees were never collected.
      data: { paymentStatus: "waived" },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  /**
   * Cancel a booking that hasn't started. If it was paid, the late-cancellation
   * policy applies: a full refund when cancelled at least `lateCancelWindowHours`
   * before the session start, otherwise only `lateCancelRefundPercent`. Online
   * (card) payments are refunded through Stripe; other methods just record the
   * amount owed back for staff to hand over.
   */
  async cancel(id: string) {
    const f = await this.facility();
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status !== "booked") throw new BadRequestException("Only a booking that hasn't started can be cancelled");

    // Atomically CLAIM the cancellation before any money moves: a double-click
    // or two concurrent staff both passing the read above would otherwise each
    // issue the partial refund, and Stripe stacks partial refunds — money out
    // twice, recorded once. The loser of this claim gets a clean 400.
    const claim = await this.prisma.attendance.updateMany({
      where: { id, status: "booked" },
      data: { status: "cancelled" },
    });
    if (claim.count === 0) throw new BadRequestException("This booking was already cancelled");

    let refundedCents = 0;
    let refundPercent = 0;
    if (a.paymentStatus === "paid" && a.feeCents > 0) {
      const start = a.scheduledStart ?? a.serviceDate;
      const hoursUntilStart = (start.getTime() - Date.now()) / 3_600_000;
      const fullRefund = hoursUntilStart >= f.lateCancelWindowHours;
      refundPercent = fullRefund ? 100 : f.lateCancelRefundPercent;
      refundedCents = Math.round((a.feeCents * refundPercent) / 100);
      // The intent is on the attendance for desk payments; for online bookings
      // it lives on the shared BookingRequest (one payment, several children), so
      // resolve it via the child link. A partial refund of the shared intent is
      // always used online (a full refund would refund the whole family's payment).
      let intentId = a.stripePaymentIntentId;
      let forcePartial = false;
      if (!intentId) {
        const link = await this.prisma.bookingRequestChild.findUnique({
          where: { attendanceId: a.id },
          include: { request: { select: { stripePaymentIntentId: true } } },
        });
        intentId = link?.request.stripePaymentIntentId ?? null;
        forcePartial = !!intentId; // never full-refund a shared multi-child intent
      }
      if (refundedCents > 0 && intentId) {
        try {
          // Full refund omits the amount; partial passes the reduced cents. The
          // idempotency key means a retried request can't refund twice.
          await this.payments.refund(intentId, fullRefund && !forcePartial ? undefined : refundedCents, `cancel:${id}`);
        } catch (e) {
          // The cancellation stands, but the money did NOT move — record that
          // loudly instead of booking a refund that never happened.
          await this.prisma.attendance.update({
            where: { id },
            data: { notes: `${a.notes ? a.notes + " · " : ""}REFUND FAILED — issue ${(refundedCents / 100).toFixed(2)} manually in the Stripe dashboard (intent ${intentId}).` },
          });
          throw e;
        }
      }
    }

    await this.prisma.attendance.update({
      where: { id },
      data: {
        refundedCents,
        refundedAt: refundedCents > 0 ? new Date() : null,
      },
    });
    return { ok: true, refundedCents, refundPercent };
  }

  async dashboard() {
    const f = await this.facility();
    const { start, end } = this.dayBounds(f.timezone);
    const [inCare, bookedToday, checkedOutToday, unpaidToday] = await Promise.all([
      this.currentlyInCare(),
      this.prisma.attendance.count({ where: { serviceDate: { gte: start, lt: end }, status: "booked" } }),
      this.prisma.attendance.count({ where: { serviceDate: { gte: start, lt: end }, status: "checked_out" } }),
      this.prisma.attendance.findMany({
        where: { serviceDate: { gte: start, lt: end }, status: "checked_out", paymentStatus: "unpaid", feeCents: { gt: 0 } },
        select: { feeCents: true },
      }),
    ]);
    return {
      capacity: f.capacity,
      inCareCount: inCare,
      spacesFree: Math.max(0, f.capacity - inCare),
      expectedToday: bookedToday,
      finishedToday: checkedOutToday,
      outstandingCents: unpaidToday.reduce((s, a) => s + a.feeCents, 0),
      outstandingCount: unpaidToday.length,
    };
  }
}
