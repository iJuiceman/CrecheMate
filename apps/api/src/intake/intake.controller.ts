import { Body, Controller, Get, Post } from "@nestjs/common";
import { IntakeService } from "./intake.service";
import { IntakeDto } from "./intake.dto";
import { Public } from "../auth/decorators";

// Parent-facing self-registration (iPad kiosk). Both routes are public — the
// form is handed to a parent who has no staff account.
@Controller("intake")
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
