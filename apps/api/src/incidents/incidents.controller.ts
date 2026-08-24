import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IncidentsService } from "./incidents.service";
import { CreateIncidentDto } from "./incidents.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { JwtPayload } from "../auth/jwt-payload.interface";

function actor(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// Incident log — any signed-in staff member can view and record incidents
// (their own observations or ones a parent reports at the desk). Parents have
// no logins, so nothing here is reachable from the public pages.
@Controller("incidents")
export class IncidentsController {
  constructor(private incidents: IncidentsService) {}

  @Get()
  list() {
    return this.incidents.list();
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(actor(req), dto);
  }

  // Deleting a log entry is admin-only — it's a record, not a note.
  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin")
  remove(@Param("id") id: string) {
    return this.incidents.remove(id);
  }
}
