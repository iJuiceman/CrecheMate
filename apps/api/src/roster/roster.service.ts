import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { CreateShiftDto, UpdateShiftDto } from "./roster.dto";

// A single shift can't span more than a day — catches a mistyped date pair
// before it quietly blocks that staff member's roster for a month.
const MAX_SHIFT_HOURS = 24;
// The longest range a single listing may request (a year + slack).
const MAX_RANGE_DAYS = 400;

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  private serialize(s: any) {
    return {
      id: s.id,
      userId: s.userId,
      startAt: s.startAt,
      endAt: s.endAt,
      notes: s.notes,
      user: s.user
        ? { id: s.user.id, name: `${s.user.firstName} ${s.user.lastName}`, role: s.user.role, status: s.user.status }
        : null,
    };
  }

  /** Parse a client datetime in the FACILITY zone when it carries no offset —
   * a date-only string was previously read as UTC midnight, landing shifts
   * 10-11 hours off for an Australian facility. */
  private parseAt(iso: string, tz: string): Date {
    const d = DateTime.fromISO(iso, { zone: tz });
    if (!d.isValid) throw new BadRequestException("Invalid start or end time");
    return d.toJSDate();
  }

  private async validateWindow(tx: any, userId: string, start: Date, end: Date, excludeId?: string) {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException("Invalid start or end time");
    }
    if (end <= start) throw new BadRequestException("The shift must end after it starts");
    if (end.getTime() - start.getTime() > MAX_SHIFT_HOURS * 3_600_000) {
      throw new BadRequestException(`A shift can't be longer than ${MAX_SHIFT_HOURS} hours`);
    }
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Staff member not found");
    if (user.status !== "active") throw new BadRequestException("That staff account is suspended");
    // Two DIFFERENT staff may overlap (working together); the same person can't
    // be rostered twice over the same window.
    const clash = await tx.rosterShift.findFirst({
      where: {
        userId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (clash) throw new ConflictException(`${user.firstName} ${user.lastName} is already rostered over that time`);
    return user;
  }

  async list(fromIso?: string, toIso?: string) {
    const f = await this.settings.get();
    // Default: this week (facility-local Monday → Sunday).
    const now = DateTime.now().setZone(f.timezone);
    const from = fromIso ? DateTime.fromISO(fromIso, { zone: f.timezone }).startOf("day") : now.startOf("week");
    const to = toIso ? DateTime.fromISO(toIso, { zone: f.timezone }).endOf("day") : now.endOf("week");
    if (!from.isValid || !to.isValid) throw new BadRequestException("Invalid date range");
    if (to < from) throw new BadRequestException("The end date must not be before the start date");
    if (to.diff(from, "days").days > MAX_RANGE_DAYS) throw new BadRequestException(`A roster listing can cover at most ${MAX_RANGE_DAYS} days`);
    const shifts = await this.prisma.rosterShift.findMany({
      where: { startAt: { lt: to.toJSDate() }, endAt: { gt: from.toJSDate() } },
      include: { user: true },
      orderBy: { startAt: "asc" },
      take: 2000,
    });
    return { from: from.toISO(), to: to.toISO(), timezone: f.timezone, shifts: shifts.map((s) => this.serialize(s)) };
  }

  /** Today's creche-operator roster + who is in charge right now. A suspended
   * staff member is never reported as in charge — their shifts stay visible in
   * the day list, flagged by user.status, so the gap is obvious. */
  async today() {
    const f = await this.settings.get();
    const now = new Date();
    const local = DateTime.now().setZone(f.timezone);
    const shifts = await this.prisma.rosterShift.findMany({
      where: { startAt: { lt: local.endOf("day").toJSDate() }, endAt: { gt: local.startOf("day").toJSDate() } },
      include: { user: true },
      orderBy: { startAt: "asc" },
    });
    const all = shifts.map((s) => this.serialize(s));
    return {
      now: now.toISOString(),
      onNow: all.filter((s) => s.user?.status === "active" && new Date(s.startAt) <= now && new Date(s.endAt) > now),
      today: all,
    };
  }

  async create(actorId: string, dto: CreateShiftDto) {
    const f = await this.settings.get();
    const start = this.parseAt(dto.startAt, f.timezone);
    const end = this.parseAt(dto.endAt, f.timezone);
    try {
      // The clash check and the write are one serializable unit, so two admins
      // rostering the same person concurrently can't both slip through.
      const created = await this.prisma.$transaction(
        async (tx) => {
          await this.validateWindow(tx, dto.userId, start, end);
          return tx.rosterShift.create({
            data: { userId: dto.userId, startAt: start, endAt: end, notes: dto.notes?.trim() || null, createdById: actorId },
            include: { user: true },
          });
        },
        { isolationLevel: "Serializable" },
      );
      return this.serialize(created);
    } catch (e: any) {
      if (e?.code === "P2034") throw new ConflictException("Two roster changes collided — please try again.");
      throw e;
    }
  }

  async update(id: string, dto: UpdateShiftDto) {
    const f = await this.settings.get();
    const existing = await this.prisma.rosterShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Shift not found");
    const userId = dto.userId ?? existing.userId;
    const start = dto.startAt ? this.parseAt(dto.startAt, f.timezone) : existing.startAt;
    const end = dto.endAt ? this.parseAt(dto.endAt, f.timezone) : existing.endAt;
    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          await this.validateWindow(tx, userId, start, end, id);
          return tx.rosterShift.update({
            where: { id },
            data: {
              userId,
              startAt: start,
              endAt: end,
              // null clears the note ((dto.notes ?? "") guards the 500 that
              // `null.trim()` used to throw).
              ...(dto.notes !== undefined ? { notes: (dto.notes ?? "").trim() || null } : {}),
            },
            include: { user: true },
          });
        },
        { isolationLevel: "Serializable" },
      );
      return this.serialize(updated);
    } catch (e: any) {
      if (e?.code === "P2034") throw new ConflictException("Two roster changes collided — please try again.");
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.rosterShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Shift not found");
    await this.prisma.rosterShift.delete({ where: { id } });
    return { ok: true };
  }
}
