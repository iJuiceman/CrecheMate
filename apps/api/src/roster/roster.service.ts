import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { CreateShiftDto, UpdateShiftDto } from "./roster.dto";

// A single shift can't span more than a day — catches a mistyped date pair
// before it quietly blocks that staff member's roster for a month.
const MAX_SHIFT_HOURS = 24;

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
      user: s.user ? { id: s.user.id, name: `${s.user.firstName} ${s.user.lastName}`, role: s.user.role } : null,
    };
  }

  private async validateWindow(userId: string, start: Date, end: Date, excludeId?: string) {
    if (!(start instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException("Invalid start or end time");
    }
    if (end <= start) throw new BadRequestException("The shift must end after it starts");
    if (end.getTime() - start.getTime() > MAX_SHIFT_HOURS * 3_600_000) {
      throw new BadRequestException(`A shift can't be longer than ${MAX_SHIFT_HOURS} hours`);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Staff member not found");
    if (user.status !== "active") throw new BadRequestException("That staff account is suspended");
    // Two DIFFERENT staff may overlap (working together); the same person can't
    // be rostered twice over the same window.
    const clash = await this.prisma.rosterShift.findFirst({
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
    const shifts = await this.prisma.rosterShift.findMany({
      where: { startAt: { lt: to.toJSDate() }, endAt: { gt: from.toJSDate() } },
      include: { user: true },
      orderBy: { startAt: "asc" },
    });
    return { from: from.toISO(), to: to.toISO(), timezone: f.timezone, shifts: shifts.map((s) => this.serialize(s)) };
  }

  /** Today's creche-operator roster + who is in charge right now. */
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
      onNow: all.filter((s) => new Date(s.startAt) <= now && new Date(s.endAt) > now),
      today: all,
    };
  }

  async create(actorId: string, dto: CreateShiftDto) {
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    await this.validateWindow(dto.userId, start, end);
    const created = await this.prisma.rosterShift.create({
      data: { userId: dto.userId, startAt: start, endAt: end, notes: dto.notes?.trim() || null, createdById: actorId },
      include: { user: true },
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateShiftDto) {
    const existing = await this.prisma.rosterShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Shift not found");
    const userId = dto.userId ?? existing.userId;
    const start = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const end = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    await this.validateWindow(userId, start, end, id);
    const updated = await this.prisma.rosterShift.update({
      where: { id },
      data: {
        userId,
        startAt: start,
        endAt: end,
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
      include: { user: true },
    });
    return this.serialize(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.rosterShift.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Shift not found");
    await this.prisma.rosterShift.delete({ where: { id } });
    return { ok: true };
  }
}
