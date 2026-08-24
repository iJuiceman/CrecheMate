import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { PaymentsService } from "../payments/payments.service";
import { decryptField } from "../common/encryption.util";
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
   * nearest quarter-hour (so any part-quarter counts as a full 15 minutes),
   * which keeps billing tidy.
   */
  private feeFor(start: Date, end: Date, hourlyRateCents: number): number {
    const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    const billedHours = Math.ceil(hours * 4) / 4;
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
  async checkIn(actor: JwtPayload, id: string, court?: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status !== "booked") throw new BadRequestException("This booking can't be checked in");
    await this.assertCapacityForCheckIn();
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
    const feeCents = this.feeFor(a.checkInAt, now, f.hourlyRateCents);

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

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        status: "checked_out",
        checkOutAt: now,
        checkedOutById: actor.sub,
        feeCents,
        paymentStatus,
        paymentMethod,
        stripePaymentIntentId,
        paidAt,
      },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  /** A Stripe intent for the fee, so staff can take a card onsite (online method). */
  async paymentIntent(id: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.feeCents <= 0) throw new BadRequestException("Nothing to pay");
    if (a.paymentStatus === "paid") throw new BadRequestException("Already paid");
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
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        paymentStatus: "paid",
        paymentMethod: dto.method,
        stripePaymentIntentId: dto.method === "online" ? dto.stripePaymentIntentId : null,
        paidAt: new Date(),
      },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  async waivePayment(id: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    const updated = await this.prisma.attendance.update({
      where: { id },
      data: { paymentStatus: "waived", paidAt: new Date() },
      include: this.childInclude,
    });
    return this.serialize(updated);
  }

  async cancel(id: string) {
    const a = await this.prisma.attendance.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Attendance not found");
    if (a.status !== "booked") throw new BadRequestException("Only a booking that hasn't started can be cancelled");
    await this.prisma.attendance.update({ where: { id }, data: { status: "cancelled" } });
    return { ok: true };
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
