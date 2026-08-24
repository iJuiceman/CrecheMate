import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { decryptField, encryptField } from "../common/encryption.util";
import { computeAge } from "../common/age.util";
import { AddChildDto, CreateFamilyDto, UpdateChildDto, UpdateGuardianDto } from "./families.dto";

@Injectable()
export class FamiliesService {
  constructor(private prisma: PrismaService) {}

  private serializeChild(c: any, includeDetail = false) {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      birthMonth: c.birthMonth,
      birthYear: c.birthYear,
      age: computeAge(c.birthMonth, c.birthYear),
      // The list only needs a flag; the decrypted note is returned on the
      // (audited) detail view only, so a facility-wide list request never
      // pulls every child's medical notes into one response.
      hasMedicalNotes: !!c.medicalNotesEncrypted,
      medicalNotes: includeDetail && c.medicalNotesEncrypted ? decryptField(c.medicalNotesEncrypted) : null,
      active: c.active,
      emergencyContacts: (c.emergencyContacts ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        relationship: e.relationship,
        phone: e.phone,
        canPickup: e.canPickup,
      })),
    };
  }

  private serializeGuardian(g: any, includeDetail = false) {
    return {
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      relationship: g.relationship,
      phone: g.phone,
      email: g.email,
      addressLine: g.addressLine,
      suburb: g.suburb,
      postcode: g.postcode,
      notes: g.notes,
      // Waiver status — metadata is cheap; the signature image is only decrypted
      // and returned on the family detail view (get), never in list responses.
      waiverSigned: !!g.waiverAcceptedAt,
      waiverAcceptedAt: g.waiverAcceptedAt ?? null,
      waiverVersion: g.waiverVersion ?? null,
      waiverSignature: includeDetail && g.waiverSignatureEncrypted ? decryptField(g.waiverSignatureEncrypted) : null,
      children: (g.children ?? []).map((c: any) => this.serializeChild(c, includeDetail)),
    };
  }

  async list(query?: string) {
    const where = query?.trim()
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" as const } },
            { lastName: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query } },
            { children: { some: { firstName: { contains: query, mode: "insensitive" as const } } } },
            { children: { some: { lastName: { contains: query, mode: "insensitive" as const } } } },
          ],
        }
      : {};
    const guardians = await this.prisma.guardian.findMany({
      where,
      include: { children: { where: { active: true }, include: { emergencyContacts: true } } },
      orderBy: { lastName: "asc" },
      take: 200,
    });
    return guardians.map((g) => this.serializeGuardian(g));
  }

  async get(id: string) {
    const g = await this.prisma.guardian.findUnique({
      where: { id },
      include: { children: { where: { active: true }, include: { emergencyContacts: true } } },
    });
    if (!g) throw new NotFoundException("Family not found");
    return this.serializeGuardian(g, true);
  }

  async createFamily(dto: CreateFamilyDto) {
    const guardian = await this.prisma.guardian.create({
      data: {
        firstName: dto.guardian.firstName,
        lastName: dto.guardian.lastName,
        relationship: dto.guardian.relationship,
        phone: dto.guardian.phone,
        email: dto.guardian.email,
        addressLine: dto.guardian.addressLine,
        suburb: dto.guardian.suburb,
        postcode: dto.guardian.postcode,
        notes: dto.guardian.notes,
        children: {
          create: {
            firstName: dto.child.firstName,
            lastName: dto.child.lastName,
            birthMonth: dto.child.birthMonth ?? null,
            birthYear: dto.child.birthYear ?? null,
            medicalNotesEncrypted: dto.child.medicalNotes?.trim() ? encryptField(dto.child.medicalNotes.trim()) : null,
            emergencyContacts: {
              create: dto.child.emergencyContacts.map((e) => ({
                name: e.name,
                relationship: e.relationship,
                phone: e.phone,
                canPickup: e.canPickup ?? true,
              })),
            },
          },
        },
      },
      include: { children: { include: { emergencyContacts: true } } },
    });
    return this.serializeGuardian(guardian);
  }

  async updateGuardian(id: string, dto: UpdateGuardianDto) {
    const g = await this.prisma.guardian.findUnique({ where: { id } });
    if (!g) throw new NotFoundException("Family not found");
    await this.prisma.guardian.update({ where: { id }, data: { ...dto } });
    return this.get(id);
  }

  async addChild(guardianId: string, dto: AddChildDto) {
    const g = await this.prisma.guardian.findUnique({ where: { id: guardianId } });
    if (!g) throw new NotFoundException("Family not found");
    await this.prisma.child.create({
      data: {
        guardianId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthMonth: dto.birthMonth ?? null,
        birthYear: dto.birthYear ?? null,
        medicalNotesEncrypted: dto.medicalNotes?.trim() ? encryptField(dto.medicalNotes.trim()) : null,
        emergencyContacts: {
          create: dto.emergencyContacts.map((e) => ({
            name: e.name,
            relationship: e.relationship,
            phone: e.phone,
            canPickup: e.canPickup ?? true,
          })),
        },
      },
    });
    return this.get(guardianId);
  }

  async updateChild(childId: string, dto: UpdateChildDto) {
    const child = await this.prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new NotFoundException("Child not found");
    await this.prisma.child.update({
      where: { id: childId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthMonth: dto.birthMonth,
        birthYear: dto.birthYear,
        medicalNotesEncrypted:
          dto.medicalNotes !== undefined
            ? dto.medicalNotes.trim()
              ? encryptField(dto.medicalNotes.trim())
              : null
            : undefined,
      },
    });
    // Replace emergency contacts wholesale when provided.
    if (dto.emergencyContacts) {
      await this.prisma.emergencyContact.deleteMany({ where: { childId } });
      await this.prisma.emergencyContact.createMany({
        data: dto.emergencyContacts.map((e) => ({
          childId,
          name: e.name,
          relationship: e.relationship,
          phone: e.phone,
          canPickup: e.canPickup ?? true,
        })),
      });
    }
    return this.get(child.guardianId);
  }

  async removeChild(childId: string) {
    const child = await this.prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new NotFoundException("Child not found");
    // Soft-remove — attendance history references it.
    await this.prisma.child.update({ where: { id: childId }, data: { active: false } });
    return { ok: true };
  }
}
