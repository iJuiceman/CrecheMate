import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RosterService } from "./roster.service";
import { CreateShiftDto, UpdateShiftDto } from "./roster.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { JwtPayload } from "../auth/jwt-payload.interface";

function actor(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// The creche-operator roster: who is scheduled to run the creche and when.
// Every signed-in staff member can VIEW it (the dashboard shows who's in
// charge); only admins schedule, move or remove shifts.
@Controller("staff-roster")
export class RosterController {
  constructor(private roster: RosterService) {}

  @Get()
  list(@Query("from") from?: string, @Query("to") to?: string) {
    return this.roster.list(from, to);
  }

  @Get("today")
  today() {
    return this.roster.today();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin")
  create(@Body() dto: CreateShiftDto, @Req() req: Request) {
    return this.roster.create(actor(req).sub, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateShiftDto) {
    return this.roster.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  remove(@Param("id") id: string) {
    return this.roster.remove(id);
  }
}
