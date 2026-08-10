import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSettingsDto } from "./settings.dto";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /** The single facility-settings row, created with defaults on first read. */
  async get() {
    const existing = await this.prisma.facilitySettings.findFirst();
    if (existing) return existing;
    return this.prisma.facilitySettings.create({ data: {} });
  }

  async update(dto: UpdateSettingsDto) {
    const current = await this.get();
    return this.prisma.facilitySettings.update({ where: { id: current.id }, data: dto });
  }
}
