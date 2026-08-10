import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { UsersService } from "./users.service";
import { CreateStaffDto, UpdateStaffDto } from "./users.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { JwtPayload } from "../auth/jwt-payload.interface";

function actor(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// Staff administration — admin only.
@Controller("staff")
@UseGuards(RolesGuard)
@Roles("admin")
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStaffDto, @Req() req: Request) {
    return this.usersService.update(actor(req), id, dto);
  }

  @Post(":id/reset-password")
  resetPassword(@Param("id") id: string) {
    return this.usersService.resetPassword(id);
  }
}
