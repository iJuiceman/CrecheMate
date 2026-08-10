import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class EmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  relationship?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  phone: string;

  @IsOptional()
  @IsBoolean()
  canPickup?: boolean;
}

export class ChildInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  birthYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medicalNotes?: string;

  // At least one emergency contact for a child.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts: EmergencyContactDto[];
}

export class GuardianInputDto {
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
  @MinLength(3)
  @MaxLength(40)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  suburb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// Create a whole family in one step: the guardian + their first child.
export class CreateFamilyDto {
  @ValidateNested()
  @Type(() => GuardianInputDto)
  guardian: GuardianInputDto;

  @ValidateNested()
  @Type(() => ChildInputDto)
  child: ChildInputDto;
}

export class UpdateGuardianDto extends GuardianInputDto {}

// Add another child to an existing family — same shape as the child in
// CreateFamilyDto.
export class AddChildDto extends ChildInputDto {}

export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  birthYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medicalNotes?: string;

  // Full replacement of the child's emergency contacts.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];
}
