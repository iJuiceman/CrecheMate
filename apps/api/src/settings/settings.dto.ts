import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

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
}

export class LinkStripeDto {
  @IsString()
  @MaxLength(255)
  secretKey: string;

  @IsString()
  @MaxLength(255)
  publishableKey: string;
}
