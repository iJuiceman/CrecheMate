import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterFirstAdminDto } from "./dto";
import { Public } from "./decorators";
import { JwtPayload } from "./jwt-payload.interface";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get("setup-status")
  setupStatus() {
    return this.authService.needsSetup();
  }

  @Public()
  @Post("register-first-admin")
  registerFirstAdmin(@Body() dto: RegisterFirstAdminDto) {
    return this.authService.registerFirstAdmin(dto);
  }

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  me(@Req() req: Request) {
    return this.authService.me((req as Request & { user: JwtPayload }).user);
  }
}
