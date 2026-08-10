import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt-payload.interface";
import { LoginDto, RegisterFirstAdminDto } from "./dto";

// A constant bcrypt hash to compare against when the account isn't found, so
// login timing doesn't reveal whether an email is registered.
const DUMMY_HASH = bcrypt.hashSync("account-enumeration-timing-equalizer", 10);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /** One-time bootstrap: create the first admin, only when no users exist yet. */
  async registerFirstAdmin(dto: RegisterFirstAdminDto) {
    const count = await this.prisma.user.count();
    if (count > 0) {
      throw new ConflictException("Setup already complete — ask an admin to add your account");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: "admin",
      },
    });
    return this.issue(user);
  }

  async needsSetup(): Promise<{ needsSetup: boolean }> {
    return { needsSetup: (await this.prisma.user.count()) === 0 };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException("Invalid email or password");
    if (user.status !== "active") throw new UnauthorizedException("Your account is suspended");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user);
  }

  async me(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private issue(user: { id: string; email: string; role: "admin" | "educator"; firstName: string; lastName: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload, { expiresIn: "12h" });
    return {
      accessToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }
}
