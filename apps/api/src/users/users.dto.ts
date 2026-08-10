import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string; // omit to auto-generate a one-time password

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsIn(["admin", "educator"])
  role: "admin" | "educator";
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsIn(["admin", "educator"])
  role?: "admin" | "educator";

  @IsOptional()
  @IsIn(["active", "suspended"])
  status?: "active" | "suspended";
}
