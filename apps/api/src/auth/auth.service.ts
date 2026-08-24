import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt-payload.interface";
import { LoginDto, RegisterFirstAdminDto } from "./dto";

// A constant bcrypt hash to compare against when the account isn't found, so
// login timing doesn't reveal whether a username is registered.
const DUMMY_HASH = bcrypt.hashSync("account-enumeration-timing-equalizer", 10);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /** One-time bootstrap: create the first admin, only when no users exist yet.
   * The count-check and the create run in one Serializable transaction so two
   * concurrent setup requests can't both observe zero users and each plant an
   * admin — the second transaction conflicts and aborts. */
  async registerFirstAdmin(dto: RegisterFirstAdminDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma
      .$transaction(
        async (tx) => {
          if ((await tx.user.count()) > 0) {
            throw new ConflictException("Setup already complete — ask an admin to add your account");
          }
          return tx.user.create({
            data: {
              username: dto.username.toLowerCase(),
              email: dto.email?.toLowerCase() || null,
              passwordHash,
              firstName: dto.firstName,
              lastName: dto.lastName,
              role: "admin",
            },
          });
        },
        { isolationLevel: "Serializable" },
      )
      .catch((e) => {
        if (e instanceof ConflictException) throw e;
        // A serialization failure means another setup request won the race.
        throw new ConflictException("Setup already complete — ask an admin to add your account");
      });
    return this.issue(user);
  }

  async needsSetup(): Promise<{ needsSetup: boolean }> {
    return { needsSetup: (await this.prisma.user.count()) === 0 };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username.toLowerCase() } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException("Invalid username or password");
    if (user.status !== "active") throw new UnauthorizedException("Your account is suspended");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user);
  }

  async me(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private issue(user: {
    id: string;
    username: string;
    email: string | null;
    role: "admin" | "educator";
    firstName: string;
    lastName: string;
  }) {
    const payload: JwtPayload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwt.sign(payload, { expiresIn: "12h" });
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
