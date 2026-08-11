import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

// Reports carry financial + personal data — admin only.
@Controller("reports")
@UseGuards(RolesGuard)
@Roles("admin")
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get("summary")
  summary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.summary(from, to);
  }

  @Get("financial")
  financial(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.financial(from, to);
  }

  @Get("attendance")
  attendance(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.attendance(from, to);
  }

  @Get("families")
  families(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.families(from, to);
  }

  @Get("bookings")
  bookings(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.bookings(from, to);
  }
}
