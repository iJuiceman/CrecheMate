import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { decryptField, encryptField } from "../common/encryption.util";

// Honest Stripe integration for card payments.
//
// LIVE MODE: an admin links a Stripe account under Settings → Payments. The
// secret key is stored encrypted (AES-256-GCM, same app key as medical notes);
// the publishable key is stored plain (it's safe to expose to the browser for
// Stripe Elements). Once a usable sk_ key exists, real PaymentIntents are
// created and their status is verified against Stripe before a fee is marked
// paid — sk_test_ keys transact test cards, sk_live_ keys transact real ones.
//
// TEST MODE: with no linked key (and no STRIPE_SECRET_KEY env fallback), online
// payments auto-succeed with a clearly-marked stub PaymentIntent so the desk
// flow is exercisable without a Stripe account. The stub never pretends a real
// charge happened.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripeCache?: { key: string; client: Stripe };

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** The active Stripe secret key: DB-linked account first, then env fallback. */
  private async secretKey(): Promise<string | null> {
    const s = await this.prisma.facilitySettings.findFirst();
    if (s?.stripeSecretKeyEncrypted) {
      const key = decryptField(s.stripeSecretKeyEncrypted);
      if (key.startsWith("sk_")) return key;
    }
    const envKey = this.config.get<string>("STRIPE_SECRET_KEY");
    if (envKey?.startsWith("sk_") && this.config.get<string>("PAYMENTS_TEST_MODE") !== "true") {
      return envKey;
    }
    return null;
  }

  private client(key: string): Stripe {
    if (this.stripeCache?.key === key) return this.stripeCache.client;
    const client = new Stripe(key);
    this.stripeCache = { key, client };
    return client;
  }

  /** True when no real Stripe key is linked — the stub takes over. */
  async isTestMode(): Promise<boolean> {
    return (await this.secretKey()) === null;
  }

  /** The publishable key the browser needs for Stripe Elements (or null). */
  async publishableKey(): Promise<string | null> {
    const s = await this.prisma.facilitySettings.findFirst();
    return s?.stripePublishableKey ?? null;
  }

  /** Create a payment intent for `amountCents`. In test mode returns a stub. */
  async createIntent(
    amountCents: number,
  ): Promise<{ id: string; clientSecret: string; testMode: boolean; publishableKey: string | null }> {
    if (amountCents <= 0) throw new BadRequestException("Amount must be positive");
    const key = await this.secretKey();
    if (!key) {
      const id = `pi_test_${amountCents}_${randomBytes(8).toString("hex")}`;
      return { id, clientSecret: `test_${id}`, testMode: true, publishableKey: null };
    }
    const intent = await this.client(key).paymentIntents.create({
      amount: amountCents,
      currency: "aud",
      automatic_payment_methods: { enabled: true },
      description: "CrecheMate childcare fee",
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? "",
      testMode: false,
      publishableKey: await this.publishableKey(),
    };
  }

  /** Verify a payment succeeded for `amountCents` before marking a fee paid. */
  async assertSucceeded(paymentIntentId: string, amountCents: number): Promise<void> {
    if (paymentIntentId.startsWith("pi_test_")) {
      // A stub intent is only acceptable while genuinely in test mode.
      if (!(await this.isTestMode())) throw new BadRequestException("Invalid payment reference");
      const expected = Number(paymentIntentId.split("_")[2]);
      if (expected !== amountCents) throw new BadRequestException("Payment amount mismatch");
      return;
    }
    const key = await this.secretKey();
    if (!key) throw new BadRequestException("Card payments aren't linked to a Stripe account");
    const intent = await this.client(key).paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") throw new BadRequestException("Card payment hasn't completed");
    if (intent.amount_received !== amountCents) throw new BadRequestException("Payment amount mismatch");
    if (intent.currency !== "aud") throw new BadRequestException("Payment currency mismatch");
  }

  /**
   * Validate + store a Stripe account link. Confirms the secret key actually
   * works against Stripe before saving. Returns nothing sensitive.
   */
  async linkAccount(settingsId: string, secretKey: string, publishableKey: string): Promise<void> {
    if (!secretKey.startsWith("sk_")) throw new BadRequestException("Secret key must start with sk_");
    if (!publishableKey.startsWith("pk_")) throw new BadRequestException("Publishable key must start with pk_");
    // A live secret with a test publishable (or vice-versa) can't work together.
    const secretLive = secretKey.startsWith("sk_live_");
    const pubLive = publishableKey.startsWith("pk_live_");
    if (secretLive !== pubLive) {
      throw new BadRequestException("Both keys must be from the same mode (both test, or both live)");
    }
    try {
      await new Stripe(secretKey).balance.retrieve();
    } catch {
      throw new BadRequestException("Stripe rejected that secret key — check it and try again");
    }
    await this.prisma.facilitySettings.update({
      where: { id: settingsId },
      data: {
        stripeSecretKeyEncrypted: encryptField(secretKey),
        stripePublishableKey: publishableKey,
      },
    });
    this.stripeCache = undefined; // force a fresh client next call
  }

  /** Unlink the Stripe account — payments fall back to test-mode stubs. */
  async unlinkAccount(settingsId: string): Promise<void> {
    await this.prisma.facilitySettings.update({
      where: { id: settingsId },
      data: { stripeSecretKeyEncrypted: null, stripePublishableKey: null },
    });
    this.stripeCache = undefined;
  }
}
