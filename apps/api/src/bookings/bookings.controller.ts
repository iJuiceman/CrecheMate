import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { BookingsService } from "./bookings.service";
import {
  BookingQuoteDto,
  ConfirmBookingRequestDto,
  CreateBookingRequestDto,
  DeclineBookingRequestDto,
  PayBookingRequestDto,
} from "./bookings.dto";
import { Public } from "../auth/decorators";
import { JwtPayload } from "../auth/jwt-payload.interface";

function actor(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// The public routes here are internet-facing, so they're rate-limited.
@Controller("bookings")
@UseGuards(ThrottlerGuard)
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  // ── Public (parent-facing) ──────────────────────────────────────────
  @Public()
  @Get("config")
  config() {
    return this.bookings.config();
  }

  @Public()
  @Post("quote")
  quote(@Body() dto: BookingQuoteDto) {
    return this.bookings.quote(dto.startAt, dto.endAt);
  }

  @Public()
  @Post()
  createRequest(@Body() dto: CreateBookingRequestDto) {
    return this.bookings.createRequest(dto);
  }

  @Public()
  @Post(":id/pay")
  payRequest(@Param("id") id: string, @Body() dto: PayBookingRequestDto) {
    return this.bookings.payRequest(id, dto.stripePaymentIntentId);
  }

  // ── Staff ───────────────────────────────────────────────────────────
  @Get("requests")
  listRequests() {
    return this.bookings.listRequests();
  }

  @Get("requests/count")
  pendingCount() {
    return this.bookings.pendingCount().then((count) => ({ count }));
  }

  @Post("requests/:id/confirm")
  confirm(@Param("id") id: string, @Body() dto: ConfirmBookingRequestDto, @Req() req: Request) {
    return this.bookings.confirm(actor(req), id, { childId: dto.childId, createNewFamily: dto.createNewFamily });
  }

  @Post("requests/:id/decline")
  decline(@Param("id") id: string, @Body() dto: DeclineBookingRequestDto, @Req() req: Request) {
    return this.bookings.decline(actor(req), id, dto.reason);
  }
}
