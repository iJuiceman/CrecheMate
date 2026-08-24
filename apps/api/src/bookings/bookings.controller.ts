import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
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

// The public routes here are internet-facing. The global ThrottlerGuard applies;
// the public write routes add a tighter 30/min/IP cap against abuse.
@Controller("bookings")
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  // ── Public (parent-facing) ──────────────────────────────────────────
  @Public()
  @Get("config")
  config() {
    return this.bookings.config();
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("quote")
  quote(@Body() dto: BookingQuoteDto) {
    return this.bookings.quote(dto.startAt, dto.endAt);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  createRequest(@Body() dto: CreateBookingRequestDto) {
    return this.bookings.createRequest(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
