import { Type } from "class-transformer";
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { IsAuPhone } from "../common/phone.validator";

export class IntakeEmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  relationship?: string;

  @IsString()
  @MaxLength(40)
  @IsAuPhone()
  phone: string;

  @IsOptional()
  @IsBoolean()
  canPickup?: boolean;
}

export class IntakeChildDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  // Required on the parent form — chosen from dropdowns.
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth: number;

  @IsInt()
  @Min(2010)
  @Max(2026)
  birthYear: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medicalNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IntakeEmergencyContactDto)
  emergencyContacts: IntakeEmergencyContactDto[];
}

export class IntakeGuardianDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  relationship?: string;

  @IsString()
  @MaxLength(40)
  @IsAuPhone()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class IntakeDto {
  @ValidateNested()
  @Type(() => IntakeGuardianDto)
  guardian: IntakeGuardianDto;

  @ValidateNested()
  @Type(() => IntakeChildDto)
  child: IntakeChildDto;

  // Must be explicitly true — the box has to be ticked.
  @IsBoolean()
  @Equals(true, { message: "You must read and accept the waiver to continue" })
  waiverAccepted: boolean;

  // A PNG data URL from the signature pad. Capped so a stray huge payload can't
  // be posted; a normal signature is well under this.
  @IsString()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: "A signature is required" })
  @MaxLength(500_000)
  waiverSignature: string;
}
