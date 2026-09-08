import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RegisterFirstAdminDto } from "./dto";
import { Public } from "./decorators";
import { JwtPayload } from "./jwt-payload.interface";

// Auth routes are internet-facing (the parent pages share this API). The global
// ThrottlerGuard covers them; the unauthenticated write routes below add a much
// tighter per-IP cap to blunt credential brute-force and setup races. bcrypt is
// the only other brake.
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get("setup-status")
  setupStatus() {
    return this.authService.needsSetup();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register-first-admin")
  registerFirstAdmin(@Body() dto: RegisterFirstAdminDto) {
    return this.authService.registerFirstAdmin(dto);
  }

  // 10 attempts/minute/IP — enough for a fat-fingered staffer, far too few for
  // an online password-guessing attack against bcrypt-hashed credentials.
  // (Per-account lockout in the service covers distributed guessing.)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    // Login is @Public, so req.user never exists for the audit middleware —
    // stamp the attempted username so the audit log can answer "who logged
    // in" and "which account was being attacked".
    (req as Request & { auditLoginUsername?: string }).auditLoginUsername = dto.username?.toLowerCase?.().slice(0, 80);
    return this.authService.login(dto);
  }

  @Get("me")
  me(@Req() req: Request) {
    return this.authService.me((req as Request & { user: JwtPayload }).user);
  }

  @Post("change-password")
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.authService.changePassword((req as Request & { user: JwtPayload }).user, dto.currentPassword, dto.newPassword);
  }
}
