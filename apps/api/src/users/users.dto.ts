import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const USERNAME_RULE = /^[a-zA-Z0-9._-]{3,40}$/;
const USERNAME_MESSAGE = "Username must be 3–40 characters, letters/numbers/.-_ only";

export class CreateStaffDto {
  @IsString()
  @Matches(USERNAME_RULE, { message: USERNAME_MESSAGE })
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string; // optional — records/receipts only, not used for login

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
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(["admin", "educator"])
  role?: "admin" | "educator";

  @IsOptional()
  @IsIn(["active", "suspended"])
  status?: "active" | "suspended";
}
