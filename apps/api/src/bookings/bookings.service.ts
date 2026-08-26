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

  // Billed rounded UP to the nearest quarter-hour, matching the desk.
  private feeFor(start: Date, end: Date, hourlyRateCents: number): number {
    const hours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    const billedHours = Math.ceil(hours * 4) / 4;
    return Math.round(billedHours * hourlyRateCents);
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
      maxBookingHours: f.maxBookingHours,
      maxDaysAhead: 120,
      courts: f.courts,
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
    if (end.diff(start, "hours").hours > f.maxBookingHours) {
      throw new BadRequestException(`A booking can be at most ${f.maxBookingHours} hours long`);
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

  /** Public: price + availability for a window, before taking any details.
   * `childCount` (default 1) gives the per-child fee, the total, and whether that
   * many spaces are free. */
  async quote(startAt: string, endAt: string, childCount = 1) {
    const { f, start, end } = await this.validateWindow(startAt, endAt);
    const spacesFree = await this.spacesFree(start, end);
    const n = Math.max(1, childCount);
    const perChild = this.feeFor(start, end, f.hourlyRateCents);
    return {
      ok: spacesFree >= n,
      feeCents: perChild, // per child
      childCount: n,
      totalCents: perChild * n,
      spacesFree,
      capacity: f.capacity,
    };
  }

  /** Public: create a pending booking (with its children) + a payment intent for
   * the total. The card is charged (automatic capture) when the parent confirms —
   * there is no staff approval step. */
  async createRequest(dto: CreateBookingRequestDto) {
    const { f, start, end } = await this.validateWindow(dto.startAt, dto.endAt);
    const n = dto.children.length;
    const spacesFree = await this.spacesFree(start, end);
    if (spacesFree < n) {
      throw new ConflictException(
        spacesFree <= 0
          ? "That session is now full — please choose a different time."
          : `Only ${spacesFree} space${spacesFree === 1 ? "" : "s"} left for that session — please remove a child or choose another time.`,
      );
    }
    const perChild = this.feeFor(start, end, f.hourlyRateCents);
    if (perChild <= 0) throw new BadRequestException("That window is too short to book");
    const total = perChild * n;
    const first = dto.children[0];

    const request = await this.prisma.bookingRequest.create({
      data: {
        parentFirstName: dto.parent.firstName.trim(),
        parentLastName: dto.parent.lastName.trim(),
        parentPhone: dto.parent.phone.trim(),
        parentEmail: dto.parent.email?.trim().toLowerCase() || null,
        // Legacy display columns mirror the first child.
        childFirstName: first.firstName.trim(),
        childLastName: first.lastName.trim(),
        childBirthMonth: first.birthMonth,
        childBirthYear: first.birthYear,
        requestedStart: start,
        requestedEnd: end,
        court: null, // captured by staff at check-in
        courtBookingName: null,
        feeCents: total,
        notes: dto.notes?.trim() || null,
        children: {
          create: dto.children.map((c) => ({
            firstName: c.firstName.trim(),
            lastName: c.lastName.trim(),
            birthMonth: c.birthMonth,
            birthYear: c.birthYear,
            feeCents: perChild,
          })),
        },
      },
    });

    // Automatic capture: the card is charged on confirmation (no staff approval).
    const intent = await this.payments.createIntent(total, `booking:${request.id}`);
    return {
      requestId: request.id,
      feeCents: total,
      perChildCents: perChild,
      childCount: n,
      clientSecret: intent.clientSecret,
      publishableKey: intent.publishableKey,
      testMode: intent.testMode,
      paymentIntentId: intent.id,
    };
  }

  /** Find (by parent phone) or create the family, and resolve each booking child
   * to a Child id — reusing an existing child of that family by name, else
   * creating it. Returns child ids aligned to `request.children`. */
  private async resolveFamily(request: {
    parentFirstName: string;
    parentLastName: string;
    parentPhone: string;
    parentEmail: string | null;
    children: { firstName: string; lastName: string; birthMonth: number | null; birthYear: number | null }[];
  }): Promise<string[]> {
    const wanted = onlyDigits(request.parentPhone);
    const all = await this.prisma.guardian.findMany({ include: { children: true } });
    let guardian = all.find((g) => onlyDigits(g.phone) === wanted) ?? null;
    if (!guardian) {
      guardian = await this.prisma.guardian.create({
        data: {
          firstName: request.parentFirstName,
          lastName: request.parentLastName,
          phone: request.parentPhone,
          email: request.parentEmail,
        },
        include: { children: true },
      });
    }
    const roster = [...guardian.children];
    const ids: string[] = [];
    for (const c of request.children) {
      const match = roster.find(
        (x) => x.active && x.firstName.toLowerCase() === c.firstName.toLowerCase() && x.lastName.toLowerCase() === c.lastName.toLowerCase(),
      );
      if (match) { ids.push(match.id); continue; }
      const child = await this.prisma.child.create({
        data: { guardianId: guardian.id, firstName: c.firstName, lastName: c.lastName, birthMonth: c.birthMonth, birthYear: c.birthYear },
      });
      roster.push(child); // so a repeated name in the same booking isn't created twice
      ids.push(child.id);
    }
    return ids;
  }

  /** Public: the parent has confirmed the card and been CHARGED. Verify the
   * payment, then create the confirmed booking(s) immediately — no staff
   * approval. If the session just filled, the payment is fully refunded. */
  async payRequest(id: string, stripePaymentIntentId: string) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id }, include: { children: true } });
    if (!request) throw new NotFoundException("Booking not found");
    if (request.status === "confirmed") return { ok: true, bookedCount: request.children.length, alreadyConfirmed: true };
    if (request.status !== "pending") throw new BadRequestException("This booking can't be completed");

    // Verify the card was actually CHARGED for the full amount, bound to this booking.
    await this.payments.assertSucceeded(stripePaymentIntentId, request.feeCents, `booking:${id}`);

    // Atomically claim so a double-submit can't create two sets of bookings.
    const claim = await this.prisma.bookingRequest.updateMany({
      where: { id, status: "pending" },
      data: { status: "confirmed", paymentStatus: "paid", stripePaymentIntentId, paidAt: new Date(), decidedAt: new Date() },
    });
    if (claim.count === 0) {
      const fresh = await this.prisma.bookingRequest.findUnique({ where: { id }, include: { children: true } });
      return { ok: true, bookedCount: fresh?.children.length ?? 0, alreadyConfirmed: true };
    }

    const start = request.requestedStart;
    const end = request.requestedEnd;
    const n = request.children.length;

    // Card already charged: if the session filled meanwhile, fully refund + back out.
    if ((await this.spacesFree(start, end, id)) < n) {
      await this.payments.refund(stripePaymentIntentId);
      await this.prisma.bookingRequest.update({
        where: { id },
        data: { status: "declined", paymentStatus: "unpaid", notes: `${request.notes ? request.notes + " · " : ""}Auto-refunded: session filled` },
      });
      throw new ConflictException("Sorry — that session just filled up, so your payment has been fully refunded. Please choose another time.");
    }

    try {
      const paidAt = new Date();
      const childIds = await this.resolveFamily(request);
      const bookings = await this.attendance.createConfirmedBookings(
        request.children.map((c, i) => ({ childId: childIds[i], start, end, feeCents: c.feeCents, paidAt, notes: request.notes })),
      );
      await Promise.all(
        request.children.map((c, i) =>
          this.prisma.bookingRequestChild.update({ where: { id: c.id }, data: { childId: childIds[i], attendanceId: bookings[i].id } }),
        ),
      );
      return { ok: true, bookedCount: bookings.length };
    } catch {
      // Charged but couldn't create the booking(s): refund and mark the request
      // so the parent isn't out of pocket for a booking that didn't happen.
      await this.payments.refund(stripePaymentIntentId).catch(() => {});
      await this.prisma.bookingRequest
        .update({ where: { id }, data: { status: "declined", paymentStatus: "unpaid", notes: `${request.notes ? request.notes + " · " : ""}Auto-refunded: booking error` } })
        .catch(() => {});
      throw new BadRequestException("Something went wrong finalising your booking — your payment has been refunded. Please try again.");
    }
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
      court: r.court,
      courtBookingName: r.courtBookingName,
      feeCents: r.feeCents,
      paymentStatus: r.paymentStatus,
      notes: r.notes,
      createdAt: r.createdAt,
      suggestedMatch: suggestion,
    };
  }

  /** Staff: card-authorised, still-pending requests waiting for a decision. */
  async listRequests() {
    const rows = await this.prisma.bookingRequest.findMany({
      where: { status: "pending", paymentStatus: "authorized" },
      orderBy: { requestedStart: "asc" },
    });
    return Promise.all(rows.map(async (r) => this.serializeRequest(r, await this.suggestMatch(r))));
  }

  async pendingCount(): Promise<number> {
    return this.prisma.bookingRequest.count({ where: { status: "pending", paymentStatus: "authorized" } });
  }

  /** Staff: approve a request → capture the held card and create the booking.
   * Either matches an existing child, or creates a new family from the request. */
  async confirm(actor: JwtPayload, id: string, opts: { childId?: string; createNewFamily?: boolean }) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Booking request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been processed");
    if (request.paymentStatus !== "authorized") throw new BadRequestException("This request's card isn't authorised");

    // Atomically claim the request so two staff confirming at once can't both
    // create a booking (which would oversell capacity and orphan one booking).
    // Only the caller whose update actually flips pending→confirmed proceeds.
    const claim = await this.prisma.bookingRequest.updateMany({
      where: { id, status: "pending" },
      data: { status: "confirmed", decidedAt: new Date(), decidedById: actor.sub },
    });
    if (claim.count === 0) throw new BadRequestException("This request has already been processed");

    try {
      return await this.finishConfirm(request, opts);
    } catch (e) {
      // The work failed (e.g. capacity full, invalid child) — release the claim
      // so staff can retry. Guarded so we never revert a successfully-linked one.
      await this.prisma.bookingRequest
        .updateMany({
          where: { id, status: "confirmed", attendanceId: null },
          data: { status: "pending", decidedAt: null, decidedById: null },
        })
        .catch(() => {});
      throw e;
    }
  }

  private async finishConfirm(
    request: { id: string; parentFirstName: string; parentLastName: string; parentPhone: string; parentEmail: string | null; childFirstName: string; childLastName: string; childBirthMonth: number | null; childBirthYear: number | null; requestedStart: Date; requestedEnd: Date; court: string | null; courtBookingName: string | null; feeCents: number; stripePaymentIntentId: string | null; paidAt: Date | null; notes: string | null },
    opts: { childId?: string; createNewFamily?: boolean },
  ) {
    const id = request.id;
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

    // Capture the held card now — approval is when the money actually moves. If
    // capture fails (e.g. the hold expired), this throws and the caller releases
    // the claim so the request returns to pending.
    if (request.stripePaymentIntentId) await this.payments.capture(request.stripePaymentIntentId);
    const capturedAt = new Date();

    const booking = await this.attendance.createConfirmedBooking({
      childId,
      start: request.requestedStart,
      end: request.requestedEnd,
      feeCents: request.feeCents,
      court: request.court,
      courtBookingName: request.courtBookingName,
      stripePaymentIntentId: request.stripePaymentIntentId,
      paidAt: capturedAt, // cash-basis: dated to the capture, not the booking
      notes: request.notes,
    });

    // Status/decidedAt/decidedById were set by the atomic claim; just link the
    // created booking and matched child.
    await this.prisma.bookingRequest.update({
      where: { id },
      data: { attendanceId: booking.id, childId },
    });
    return { ok: true, attendanceId: booking.id };
  }

  /** Staff: decline a request → release the card hold (no charge, no refund). */
  async decline(actor: JwtPayload, id: string, reason?: string) {
    const request = await this.prisma.bookingRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Booking request not found");
    if (request.status !== "pending") throw new BadRequestException("This request has already been processed");

    // Atomically claim so concurrent declines can't both act. The held card was
    // never charged, so we just void the authorisation — no refund is issued.
    const claim = await this.prisma.bookingRequest.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "declined",
        paymentStatus: "unpaid", // the hold is released; nothing was captured
        decidedAt: new Date(),
        decidedById: actor.sub,
        notes: reason ? `${request.notes ? request.notes + " · " : ""}Declined: ${reason}` : request.notes,
      },
    });
    if (claim.count === 0) throw new BadRequestException("This request has already been processed");

    if (request.paymentStatus === "authorized") {
      await this.payments.cancelAuthorization(request.stripePaymentIntentId);
    }
    return { ok: true, released: request.paymentStatus === "authorized" };
  }
}
