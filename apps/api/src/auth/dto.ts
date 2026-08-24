import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

// Login identifier: letters, numbers, dot, underscore, hyphen. Stored and
// compared lower-case so "Ada" and "ada" are the same account.
const USERNAME_RULE = /^[a-zA-Z0-9._-]{3,40}$/;
const USERNAME_MESSAGE =
  "Username must be 3–40 characters, letters/numbers/.-_ only";

export class RegisterFirstAdminDto {
  @IsString()
  @Matches(USERNAME_RULE, { message: USERNAME_MESSAGE })
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;
}

export class LoginDto {
  @IsString()
  @MaxLength(80)
  username: string;

  // Bound the input so bcrypt never hashes an attacker-sized payload.
  @IsString()
  @MaxLength(128)
  password: string;
}
