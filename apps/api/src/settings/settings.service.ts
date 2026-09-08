import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { UpdateSettingsDto } from "./settings.dto";
import { DEFAULT_WAIVER } from "../intake/intake.service";

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  /** The single facility-settings row, created with defaults on first read. */
  async get() {
    const existing = await this.prisma.facilitySettings.findFirst();
    if (existing) return existing;
    try {
      return await this.prisma.facilitySettings.create({ data: {} });
    } catch {
      // A concurrent request won the singleton insert — return that row.
      return this.prisma.facilitySettings.findFirstOrThrow();
    }
  }

  /**
   * What the web is allowed to see — never the encrypted Stripe secret. Adds
   * derived payment status so the desk knows whether cards are live or stubbed.
   */
  async publicView() {
    const s = await this.get();
    const { stripeSecretKeyEncrypted, encryptionCanary, ...safe } = s;
    return {
      ...safe,
      stripeConfigured: !!stripeSecretKeyEncrypted,
      paymentsTestMode: await this.payments.isTestMode(),
    };
  }

  async update(dto: UpdateSettingsDto) {
    const current = await this.get();
    const { waiverMinorEdit, ...fields } = dto;
    // Lowering capacity below the number of children in the room right now
    // just produces confusing "check a child out first" errors at the desk.
    if (dto.capacity !== undefined) {
      const inCare = await this.prisma.attendance.count({ where: { status: "checked_in" } });
      if (dto.capacity < inCare) {
        throw new BadRequestException(`${inCare} children are in care right now — capacity can't be set below that`);
      }
    }
    // Bump the waiver version whenever its wording actually changes, so each
    // parent's signature stays tied to the text they saw. A version bump makes
    // EVERY family re-sign at their next check-in, so:
    //  - a stored null compares against the served DEFAULT_WAIVER — saving the
    //    pre-filled default text unchanged must NOT invalidate the facility;
    //  - waiverMinorEdit lets an admin fix a typo without a re-sign campaign;
    //  - the increment is atomic, so two concurrent saves can't share a version.
    const effectiveCurrent = current.waiverText?.trim() ? current.waiverText : DEFAULT_WAIVER;
    const waiverChanged =
      dto.waiverText !== undefined && dto.waiverText.trim() !== effectiveCurrent.trim() && !waiverMinorEdit;
    await this.prisma.facilitySettings.update({
      where: { id: current.id },
      data: { ...fields, ...(waiverChanged ? { waiverVersion: { increment: 1 } } : {}) },
    });
    return this.publicView();
  }

  async linkStripe(secretKey: string, publishableKey: string) {
    const current = await this.get();
    await this.payments.linkAccount(current.id, secretKey, publishableKey);
    return this.publicView();
  }

  async unlinkStripe() {
    const current = await this.get();
    await this.payments.unlinkAccount(current.id);
    return this.publicView();
  }
}
