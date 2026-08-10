import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class BookAttendanceDto {
  @IsUUID()
  childId: string;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  court?: string;

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
}

export class CheckInDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  court?: string;
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
