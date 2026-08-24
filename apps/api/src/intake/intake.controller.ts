import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IntakeService } from "./intake.service";
import { IntakeDto } from "./intake.dto";
import { Public } from "../auth/decorators";

// Parent-facing self-registration (iPad kiosk). Both routes are public — the
// form is handed to a parent who has no staff account. The global ThrottlerGuard
// applies; the write route adds a tighter 30/min/IP cap against spam.
@Controller("intake")
export class IntakeController {
  constructor(private intake: IntakeService) {}

  @Public()
  @Get("info")
  info() {
    return this.intake.info();
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  submit(@Body() dto: IntakeDto) {
    return this.intake.submit(dto);
  }
}
