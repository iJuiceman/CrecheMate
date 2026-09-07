import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

export class BookAttendanceDto {
  @IsUUID()
  childId: string;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  // Required — a creche booking must be attached to a court booking. The
  // start/end above are the court booking's window (same duration).
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  court: string;

  // The name the court is booked under, if different from the parent.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  courtBookingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DropInDto {
  @IsUUID()
  childId: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  court?: string;

  // Waivers are mandatory: when the guardian hasn't accepted the current
  // waiver, the parent signs on screen at the desk and the PNG comes through
  // here (same shape/cap as the kiosk intake signature).
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: "Invalid signature" })
  @MaxLength(500_000)
  waiverSignature?: string;
}

export class CheckInDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  court?: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: "Invalid signature" })
  @MaxLength(500_000)
  waiverSignature?: string;
}

export class SetCourtDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  court?: string;
}

export class TakePaymentDto {
  @IsIn(["cash", "card", "eftpos", "online"])
  method: "cash" | "card" | "eftpos" | "online";

  // Required only when method = online (a verified Stripe intent for the fee).
  @IsOptional()
  @IsString()
  stripePaymentIntentId?: string;
}

export class CheckOutDto {
  // Optionally take payment at the same time as checking out.
  @IsOptional()
  @IsIn(["cash", "card", "eftpos", "online"])
  method?: "cash" | "card" | "eftpos" | "online";

  @IsOptional()
  @IsString()
  stripePaymentIntentId?: string;
}
