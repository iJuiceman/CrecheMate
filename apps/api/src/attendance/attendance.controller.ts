import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AttendanceService } from "./attendance.service";
import { BookAttendanceDto, CheckInDto, CheckOutDto, DropInDto, ForceCheckOutDto, SetCourtDto, TakePaymentDto } from "./attendance.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { JwtPayload } from "../auth/jwt-payload.interface";

function actor(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

@Controller("attendance")
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get("roster")
  roster() {
    return this.attendance.roster();
  }

  @Get("dashboard")
  dashboard() {
    return this.attendance.dashboard();
  }

  @Get("calendar")
  calendar(@Query("from") from?: string, @Query("to") to?: string) {
    return this.attendance.calendar(from, to);
  }

  @Get()
  list(@Query("date") date?: string) {
    return this.attendance.listByDate(date);
  }

  @Post("book")
  book(@Body() dto: BookAttendanceDto) {
    return this.attendance.book(dto);
  }

  @Post("drop-in")
  dropIn(@Body() dto: DropInDto, @Req() req: Request) {
    return this.attendance.dropIn(actor(req), dto);
  }

  @Post(":id/check-in")
  checkIn(@Param("id") id: string, @Body() dto: CheckInDto, @Req() req: Request) {
    return this.attendance.checkIn(actor(req), id, dto.court, dto.waiverSignature);
  }

  @Post(":id/no-show")
  markNoShow(@Param("id") id: string) {
    return this.attendance.markNoShow(id);
  }

  // Admin correction for a forgotten check-out — otherwise the stale row counts
  // against capacity forever.
  @Post(":id/force-checkout")
  @UseGuards(RolesGuard)
  @Roles("admin")
  forceCheckOut(@Param("id") id: string, @Body() dto: ForceCheckOutDto, @Req() req: Request) {
    return this.attendance.forceCheckOut(actor(req), id, dto.at);
  }

  @Post(":id/court")
  setCourt(@Param("id") id: string, @Body() dto: SetCourtDto) {
    return this.attendance.setCourt(id, dto.court);
  }

  @Post(":id/check-out")
  checkOut(@Param("id") id: string, @Body() dto: CheckOutDto, @Req() req: Request) {
    return this.attendance.checkOut(actor(req), id, dto);
  }

  @Post(":id/payment-intent")
  paymentIntent(@Param("id") id: string) {
    return this.attendance.paymentIntent(id);
  }

  @Post(":id/payment")
  payment(@Param("id") id: string, @Body() dto: TakePaymentDto) {
    return this.attendance.takePayment(id, dto);
  }

  @Post(":id/waive")
  waive(@Param("id") id: string) {
    return this.attendance.waivePayment(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.attendance.cancel(id);
  }
}
