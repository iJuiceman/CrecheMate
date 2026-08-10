import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { IntakeService } from "./intake.service";
import { IntakeDto } from "./intake.dto";
import { Public } from "../auth/decorators";

// Parent-facing self-registration (iPad kiosk). Both routes are public — the
// form is handed to a parent who has no staff account. Rate-limited since it's
// reachable externally.
@Controller("intake")
@UseGuards(ThrottlerGuard)
export class IntakeController {
  constructor(private intake: IntakeService) {}

  @Public()
  @Get("info")
  info() {
    return this.intake.info();
  }

  @Public()
  @Post()
  submit(@Body() dto: IntakeDto) {
    return this.intake.submit(dto);
  }
}
