import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

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
}
