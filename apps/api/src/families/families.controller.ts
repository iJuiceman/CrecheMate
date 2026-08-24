import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { FamiliesService } from "./families.service";
import { AddChildDto, CreateFamilyDto, UpdateChildDto, UpdateGuardianDto } from "./families.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

// Any signed-in staff member can manage families.
@Controller()
export class FamiliesController {
  constructor(private families: FamiliesService) {}

  @Get("families")
  list(@Query("query") query?: string) {
    return this.families.list(query);
  }

  @Get("families/:id")
  get(@Param("id") id: string) {
    return this.families.get(id);
  }

  @Post("families")
  create(@Body() dto: CreateFamilyDto) {
    return this.families.createFamily(dto);
  }

  @Patch("families/:id")
  updateGuardian(@Param("id") id: string, @Body() dto: UpdateGuardianDto) {
    return this.families.updateGuardian(id, dto);
  }

  @Post("families/:id/children")
  addChild(@Param("id") id: string, @Body() dto: AddChildDto) {
    return this.families.addChild(id, dto);
  }

  @Patch("children/:id")
  updateChild(@Param("id") id: string, @Body() dto: UpdateChildDto) {
    return this.families.updateChild(id, dto);
  }

  // Removing a child record is consequential (like deleting an incident), so
  // it's admin-only — educators do day-to-day edits but can't delete records.
  @Delete("children/:id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  removeChild(@Param("id") id: string) {
    return this.families.removeChild(id);
  }
}
