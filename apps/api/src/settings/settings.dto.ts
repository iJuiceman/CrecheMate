import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

// Xero's Australian tax rates for sales lines.
export const XERO_TAX_TYPES = ["GST Free Income", "GST on Income", "BAS Excluded"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxBookingHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168) // up to a week's notice
  lateCancelWindowHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  lateCancelRefundPercent?: number;

  @IsOptional()
  @Matches(TIME, { message: "openTime must be HH:MM" })
  openTime?: string;

  @IsOptional()
  @Matches(TIME, { message: "closeTime must be HH:MM" })
  closeTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  abn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  waiverText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  courts?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,10}$/, { message: "xeroAccountCode must be 1–10 letters/numbers" })
  xeroAccountCode?: string;

  @IsOptional()
  @IsIn(XERO_TAX_TYPES)
  xeroTaxType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,8}$/, { message: "xeroInvoicePrefix must be 1–8 letters/numbers" })
  xeroInvoicePrefix?: string;
}

export class LinkStripeDto {
  @IsString()
  @MaxLength(255)
  secretKey: string;

  @IsString()
  @MaxLength(255)
  publishableKey: string;
}
