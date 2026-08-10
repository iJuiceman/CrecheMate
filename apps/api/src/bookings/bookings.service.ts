import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { PaymentsService } from "../payments/payments.service";
import { AttendanceService } from "../attendance/attendance.service";
import { computeAge } from "../common/age.util";
import { JwtPayload } from "../auth/jwt-payload.interface";
import { CreateBookingRequestDto } from "./bookings.dto";

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private payments: PaymentsService,
    private attendance: AttendanceService,
  ) {}

  private feeFor(start: Date, end: Date, hourlyRateCents: number): number {
    const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    return Math.round(hours * hourlyRateCents);
  }

  /** Public: everything the booking form needs to render + constrain input. */
  async config() {
    const f = await this.settings.get();
    return {
      facilityName: f.name,
      timezone: f.timezone,
      openTime: f.openTime,
      closeTime: f.closeTime,
      hourlyRateCents: f.hourlyRateCents,
      capacity: f.capacity,
      maxDaysAhead: 120,
    };
  }

  /** Validate a requested window against opening hours and the clock. */
  private async validateWindow(startAt: string, endAt: string) {
    const f = await this.settings.get();
    const start = DateTime.fromISO(startAt);
    const end = DateTime.fromISO(endAt);
    if (!start.isValid || !end.isValid) throw new BadRequestException("Invalid start or end time");
    if (end <= start) throw new BadRequestException("The end time must be after the start time");
    if (start < DateTime.now()) throw new BadRequestException("Please choose a time in the future");
    if (start > DateTime.now().plus({ days: 120 })) throw new BadRequestException("That date is too far ahead");

    const sLocal = start.setZone(f.timezone);
    const eLocal = end.setZone(f.timezone);
    if (sLocal.toISODate() !== eLocal.toISODate()) {
      throw new BadRequestException("A booking must start and end on the same day");
    }
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const openMin = toMin(f.openTime);
    const closeMin = toMin(f.closeTime);
    const sMin = sLocal.hour * 60 + sLocal.minute;
    const eMin = eLocal.hour * 60 + eLocal.minute;
    if (sMin < openMin || eMin > closeMin) {
      throw new BadRequestException(`Bookings must be between ${f.openTime} and ${f.closeTime}`);
    }
    return { f, start: start.toJSDate(), end: end.toJSDate() };
  }

  /** Free capacity for a window: real roster (booked + in-care) plus other
   * paid, still-pending requests that haven't been decided yet. */
  private async spacesFree(start: Date, end: Date, excludeRequestId?: string): Promise<number> {
    const f = await this.settings.get();
    const [booked, pending] = await Promise.all([
      this.prisma.attendance.count({
        where: { status: { in: ["booked", "checked_in"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
      }),
      this.prisma.bookingRequest.count({
        where: {
          status: "pending",
          paymentStatus: "paid",
          requestedStart: { lt: end },
          requestedEnd: { gt: start },
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
      }),
    ]);
    return Math.max(0, f.capacity - booked - pending);
  }

  /** Public: price + availability for a window, before taking any details. */
  async quote(startAt: string, endAt: string) {
    const { f, start, end } = await this.validateWindow(startAt, endAt);
    const spacesFree = await this.spacesFree(start, end);
    return {
      ok: spacesFree > 0,
      feeCents: this.feeFor(start, end, f.hourlyRateCents),
      spacesFree,
      capacity: f.capacity,
    };
  }

  /** Public: create a pending request and a payment intent for the fee. */
  async createRequest(dto: CreateBookingRequestDto) {
    const { f, start, end } = await this.validateWindow(dto.startAt, dto.endAt);
    if ((await this.spacesFree(start, end)) <= 0) {
      throw new ConflictException("That session is now full — please choose a different time.");
    }
    const feeCents = this.feeFor(start, end, f.hourlyRateCents);
    if (feeCents <= 0) throw new BadRequestException("That window is too short to book");

    const request = await this.prisma.bookingRequest.create({
      data: {
        parentFirstName: dto.parent.firstName.trim(),
        parentLastName: dto.parent.lastName.trim(),
        parentPhone: dto.parent.phone.trim(),
        parentEmail: dto.parent.email?.trim().toLowerCase() || null,
        childFirstName: dto.child.firstName.trim(),
        childLastName: dto.child.lastName.trim(),
        childBirthMonth: dto.child.birthMonth,
        childBirthYear: dto.child.birthYear,
        requestedStart: start,
        requestedEnd: end,
        feeCents,
        notes: dto.notes?.trim() || null,
      },
    });

    const intent = await this.payments.createIntent(feeCents);
    return {
      requestId: request.id,
      feeCents,
      clientSecret: intent.clientSecret,
      publishableKey: intent.publishableKey,
      testMode: intent.testMode,
      paymentIntentId: intent.id,
    };
  }

  /** Public: record that the parent's prepayment succeeded. */
  async payRequest(id: string, stripePaymentIntentId: string) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Booking request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been processed");
    if (request.paymentStatus === "paid") return { ok: true };
    await this.payments.assertSucceeded(stripePaymentIntentId, request.feeCents);
    await this.prisma.bookingRequest.update({
      where: { id },
      data: { paymentStatus: "paid", stripePaymentIntentId, paidAt: new Date() },
    });
    return { ok: true };
  }

  // ── Staff ────────────────────────────────────────────────────────────
  private async suggestMatch(req: {
    childFirstName: string;
    childLastName: string;
    parentPhone: string;
  }) {
    const candidates = await this.prisma.child.findMany({
      where: {
        active: true,
        firstName: { equals: req.childFirstName, mode: "insensitive" },
        lastName: { equals: req.childLastName, mode: "insensitive" },
      },
      include: { guardian: true },
      take: 5,
    });
    if (!candidates.length) return null;
    const wanted = onlyDigits(req.parentPhone);
    const phoneMatch = candidates.find((c) => onlyDigits(c.guardian.phone) === wanted);
    const chosen = phoneMatch ?? candidates[0];
    return {
      familyId: chosen.guardianId,
      childId: chosen.id,
      childName: `${chosen.firstName} ${chosen.lastName}`,
      guardianName: `${chosen.guardian.firstName} ${chosen.guardian.lastName}`,
      phoneMatches: !!phoneMatch,
    };
  }

  private serializeRequest(r: any, suggestion: any) {
    return {
      id: r.id,
      parentName: `${r.parentFirstName} ${r.parentLastName}`,
      parentPhone: r.parentPhone,
      parentEmail: r.parentEmail,
      childName: `${r.childFirstName} ${r.childLastName}`,
      childFirstName: r.childFirstName,
      childLastName: r.childLastName,
      childBirthMonth: r.childBirthMonth,
      childBirthYear: r.childBirthYear,
      childAge: computeAge(r.childBirthMonth, r.childBirthYear),
      requestedStart: r.requestedStart,
      requestedEnd: r.requestedEnd,
      feeCents: r.feeCents,
      paymentStatus: r.paymentStatus,
      notes: r.notes,
      createdAt: r.createdAt,
      suggestedMatch: suggestion,
    };
  }

  /** Staff: paid, still-pending requests waiting for a decision. */
  async listRequests() {
    const rows = await this.prisma.bookingRequest.findMany({
      where: { status: "pending", paymentStatus: "paid" },
      orderBy: { requestedStart: "asc" },
    });
    return Promise.all(rows.map(async (r) => this.serializeRequest(r, await this.suggestMatch(r))));
  }

  async pendingCount(): Promise<number> {
    return this.prisma.bookingRequest.count({ where: { status: "pending", paymentStatus: "paid" } });
  }

  /** Staff: confirm a request → create the real (already-paid) booking. Either
   * matches an existing child, or creates a new family from the request. */
  async confirm(actor: JwtPayload, id: string, opts: { childId?: string; createNewFamily?: boolean }) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Booking request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been processed");
    if (request.paymentStatus !== "paid") throw new BadRequestException("This request hasn't been paid");

    let childId = opts.childId;
    if (opts.createNewFamily) {
      // Minimal family from the parent-typed details — no emergency contacts or
      // waiver yet; staff complete those on the family page / first visit.
      const guardian = await this.prisma.guardian.create({
        data: {
          firstName: request.parentFirstName,
          lastName: request.parentLastName,
          phone: request.parentPhone,
          email: request.parentEmail,
          children: {
            create: {
              firstName: request.childFirstName,
              lastName: request.childLastName,
              birthMonth: request.childBirthMonth,
              birthYear: request.childBirthYear,
            },
          },
        },
        include: { children: true },
      });
      childId = guardian.children[0].id;
    }
    if (!childId) throw new BadRequestException("Choose a child to book, or create a new family");
    const child = await this.prisma.child.findFirst({ where: { id: childId, active: true } });
    if (!child) throw new NotFoundException("Child not found");

    const booking = await this.attendance.createConfirmedBooking({
      childId,
      start: request.requestedStart,
      end: request.requestedEnd,
      feeCents: request.feeCents,
      stripePaymentIntentId: request.stripePaymentIntentId,
      notes: request.notes,
    });

    await this.prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "confirmed",
        attendanceId: booking.id,
        childId,
        decidedAt: new Date(),
        decidedById: actor.sub,
      },
    });
    return { ok: true, attendanceId: booking.id };
  }

  /** Staff: decline a request → refund the prepayment. */
  async decline(actor: JwtPayload, id: string, reason?: string) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Booking request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been processed");
    if (request.paymentStatus === "paid") {
      await this.payments.refund(request.stripePaymentIntentId);
    }
    await this.prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "declined",
        decidedAt: new Date(),
        decidedById: actor.sub,
        notes: reason ? `${request.notes ? request.notes + " · " : ""}Declined: ${reason}` : request.notes,
      },
    });
    return { ok: true, refunded: request.paymentStatus === "paid" };
  }
}
