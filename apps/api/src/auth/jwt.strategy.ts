import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET"),
      algorithms: ["HS256"], // pin the algorithm — never accept `none`
    });
  }

  /**
   * Re-check the account against the DB on every request, not just at login.
   * A token stays valid up to 12h, so without this a suspended (or deleted)
   * staff member would keep full access until expiry, and a demoted admin would
   * keep admin rights. We also return the CURRENT role from the DB rather than
   * the (possibly stale) role baked into the token.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, status: true },
    });
    if (!user || user.status !== "active") throw new UnauthorizedException("Account is inactive");
    return { sub: user.id, username: user.username, role: user.role };
  }
}
