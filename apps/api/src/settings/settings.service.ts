import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { UpdateSettingsDto } from "./settings.dto";

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
    const { stripeSecretKeyEncrypted, ...safe } = s;
    return {
      ...safe,
      stripeConfigured: !!stripeSecretKeyEncrypted,
      paymentsTestMode: await this.payments.isTestMode(),
    };
  }

  async update(dto: UpdateSettingsDto) {
    const current = await this.get();
    // Bump the waiver version whenever its wording actually changes, so each
    // parent's signature stays tied to the text they saw.
    const waiverChanged = dto.waiverText !== undefined && dto.waiverText !== (current.waiverText ?? "");
    await this.prisma.facilitySettings.update({
      where: { id: current.id },
      data: { ...dto, ...(waiverChanged ? { waiverVersion: current.waiverVersion + 1 } : {}) },
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
