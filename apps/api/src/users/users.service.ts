import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStaffDto, UpdateStaffDto } from "./users.dto";
import { JwtPayload } from "../auth/jwt-payload.interface";

const SELECT = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ select: SELECT, orderBy: { createdAt: "asc" } });
  }

  async create(dto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username.toLowerCase() } });
    if (existing) throw new ConflictException("A staff member with this username already exists");
    const tempPassword = dto.password ?? randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username.toLowerCase(),
        email: dto.email?.toLowerCase() || null,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
      select: SELECT,
    });
    return { ...user, temporaryPassword: dto.password ? undefined : tempPassword };
  }

  async update(actor: JwtPayload, id: string, dto: UpdateStaffDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Staff member not found");
    // Don't let the last admin be demoted/suspended out of existence, and
    // don't let an admin lock themselves out.
    if (user.role === "admin" && (dto.role === "educator" || dto.status === "suspended")) {
      const otherAdmins = await this.prisma.user.count({
        where: { role: "admin", status: "active", id: { not: id } },
      });
      if (otherAdmins === 0) throw new BadRequestException("This is the only active admin — add another first");
    }
    if (id === actor.sub && dto.status === "suspended") {
      throw new BadRequestException("You can't suspend your own account");
    }
    const data = { ...dto, ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() || null } : {}) };
    return this.prisma.user.update({ where: { id }, data, select: SELECT });
  }

  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Staff member not found");
    const tempPassword = randomBytes(6).toString("base64url");
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(tempPassword, 10) } });
    return { temporaryPassword: tempPassword };
  }
}
