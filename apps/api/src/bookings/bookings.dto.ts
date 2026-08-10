import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { IsAuPhone } from "../common/phone.validator";

export class BookingQuoteDto {
  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;
}

class BookingParentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsString()
  @MaxLength(40)
  @IsAuPhone()
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;
}

class BookingChildDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth: number;

  @IsInt()
  @Min(2010)
  @Max(2026)
  birthYear: number;
}

export class CreateBookingRequestDto {
  @ValidateNested()
  @Type(() => BookingParentDto)
  parent: BookingParentDto;

  @ValidateNested()
  @Type(() => BookingChildDto)
  child: BookingChildDto;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PayBookingRequestDto {
  @IsString()
  @MaxLength(255)
  stripePaymentIntentId: string;
}

export class ConfirmBookingRequestDto {
  // Book against an existing child…
  @IsOptional()
  @IsUUID()
  childId?: string;

  // …or create a new family from the request's details and book that child.
  @IsOptional()
  @IsBoolean()
  createNewFamily?: boolean;
}

export class DeclineBookingRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
