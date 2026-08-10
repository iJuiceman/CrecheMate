import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { LinkStripeDto, UpdateSettingsDto } from "./settings.dto";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

@Controller("settings")
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // Any staff member can read settings (rate/capacity drive the desk UI, the
  // publishable key drives the card form). The Stripe secret is never returned.
  @Get()
  get() {
    return this.settings.publicView();
  }

  // Only admins can change them.
  @Patch()
  @UseGuards(RolesGuard)
  @Roles("admin")
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  // Link a Stripe account to take real card payments (admin only). The secret
  // key is validated against Stripe and stored encrypted.
  @Post("stripe")
  @UseGuards(RolesGuard)
  @Roles("admin")
  linkStripe(@Body() dto: LinkStripeDto) {
    return this.settings.linkStripe(dto.secretKey, dto.publishableKey);
  }

  // Unlink Stripe — online payments fall back to test-mode stubs (admin only).
  @Delete("stripe")
  @UseGuards(RolesGuard)
  @Roles("admin")
  unlinkStripe() {
    return this.settings.unlinkStripe();
  }
}
