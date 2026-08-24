import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

// The tick-box categories offered on the incident form. The web mirrors this
// list (with labels) in lib/types.ts — keep the keys in sync.
export const INCIDENT_TYPES = [
  "fall_or_trip",
  "bump_or_bruise",
  "cut_or_graze",
  "bite",
  "allergic_reaction",
  "illness",
  "behavioural",
  "other",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export class CreateIncidentDto {
  @IsOptional()
  @IsUUID()
  childId?: string; // omit when no specific child was involved

  @IsDateString()
  occurredAt: string;

  @IsIn(["staff", "parent"])
  reportedBy: "staff" | "parent";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reporterName?: string; // the parent's name when reportedBy = parent

  @IsArray()
  @ArrayNotEmpty({ message: "Tick at least one incident type" })
  @IsIn(INCIDENT_TYPES, { each: true })
  types: IncidentType[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string; // required when "other" is ticked (checked in the service)
}
