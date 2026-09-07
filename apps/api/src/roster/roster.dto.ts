import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateShiftDto {
  @IsUUID()
  userId: string;

  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
