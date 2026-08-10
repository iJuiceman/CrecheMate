import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./settings.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

@Controller("settings")
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // Any staff member can read settings (rate/capacity drive the desk UI).
  @Get()
  get() {
    return this.settings.get();
  }

  // Only admins can change them.
  @Patch()
  @UseGuards(RolesGuard)
  @Roles("admin")
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
