import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt-payload.interface";
import { decryptField, encryptField } from "../common/encryption.util";
import { CreateIncidentDto } from "./incidents.dto";

type IncidentRow = {
  id: string;
  occurredAt: Date;
  reportedBy: "staff" | "parent";
  reporterName: string | null;
  types: string[];
  descriptionEncrypted: string | null;
  loggedById: string;
  createdAt: Date;
  child: { id: string; firstName: string; lastName: string } | null;
};

const INCLUDE = { child: { select: { id: true, firstName: true, lastName: true } } } as const;

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.incident.findMany({
      include: INCLUDE,
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    // loggedById is a plain column (no FK relation, same as attendance's
    // checkedInById) — resolve staff names in one query.
    const staffIds = [...new Set(rows.map((r) => r.loggedById))];
    const staff = await this.prisma.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const names = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    return rows.map((r) => this.serialize(r, names.get(r.loggedById) ?? null));
  }

  async create(actor: JwtPayload, dto: CreateIncidentDto) {
    const description = dto.description?.trim() || null;
    if (dto.types.includes("other") && !description) {
      throw new BadRequestException('Describe the incident when "Other" is ticked');
    }
    if (dto.reportedBy === "parent" && !dto.reporterName?.trim()) {
      throw new BadRequestException("Enter the parent's name when the incident was reported by a parent");
    }
    if (dto.childId) {
      const child = await this.prisma.child.findUnique({ where: { id: dto.childId } });
      if (!child) throw new NotFoundException("Child not found");
    }
    const row = await this.prisma.incident.create({
      data: {
        childId: dto.childId ?? null,
        occurredAt: new Date(dto.occurredAt),
        reportedBy: dto.reportedBy,
        reporterName: dto.reportedBy === "parent" ? dto.reporterName!.trim() : null,
        types: dto.types,
        descriptionEncrypted: description ? encryptField(description) : null,
        loggedById: actor.sub,
      },
      include: INCLUDE,
    });
    const me = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { firstName: true, lastName: true },
    });
    return this.serialize(row, me ? `${me.firstName} ${me.lastName}` : null);
  }

  async remove(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException("Incident not found");
    await this.prisma.incident.delete({ where: { id } });
    return { ok: true };
  }

  private serialize(row: IncidentRow, loggedBy: string | null) {
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      reportedBy: row.reportedBy,
      reporterName: row.reporterName,
      types: row.types,
      description: row.descriptionEncrypted ? decryptField(row.descriptionEncrypted) : null,
      child: row.child ? { id: row.child.id, name: `${row.child.firstName} ${row.child.lastName}` } : null,
      loggedBy,
      createdAt: row.createdAt,
    };
  }
}
