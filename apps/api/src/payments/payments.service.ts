import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "crypto";
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

  /** The active Stripe secret key: DB-linked account first, then env fallback.
   * FAILS CLOSED when a key is stored but can't be decrypted (wrong/rotated
   * CHILD_DATA_ENCRYPTION_KEY): previously that fell through to the forgeable
   * test-mode stub — free confirmed bookings on a public route from one bad
   * env var. */
  private async secretKey(): Promise<string | null> {
    const s = await this.prisma.facilitySettings.findFirst();
    if (s?.stripeSecretKeyEncrypted) {
      let key = "";
      try {
        key = decryptField(s.stripeSecretKeyEncrypted);
      } catch { /* fall through to the guard below */ }
      if (key.startsWith("sk_")) return key;
      throw new BadRequestException("Card payments are misconfigured — the stored Stripe key can't be read. An admin must re-link the Stripe account.");
    }
    const envKey = this.config.get<string>("STRIPE_SECRET_KEY");
    if (envKey?.startsWith("sk_") && this.config.get<string>("PAYMENTS_TEST_MODE") !== "true") {
      return envKey;
    }
    return null;
  }

  /** HMAC binding a test-mode stub id to this server (keyed by JWT_SECRET) —
   * the client knows the amount and reference, but can't sign them. */
  private stubMac(amountCents: number, reference: string, nonce: string): string {
    const secret = this.config.get<string>("JWT_SECRET") ?? "crechemate-stub";
    return createHmac("sha256", secret).update(`${amountCents}:${reference}:${nonce}`).digest("hex").slice(0, 16);
  }

  private client(key: string): Stripe {
    if (this.stripeCache?.key === key) return this.stripeCache.client;
    const client = new Stripe(key);
    this.stripeCache = { key, client };
    return client;
  }

  /** True when no real Stripe key is linked — the stub takes over. A stored
   * but undecryptable key reads as NOT test mode (fail closed: stubs are
   * rejected and real charges throw a clear misconfiguration error). */
  async isTestMode(): Promise<boolean> {
    try {
      return (await this.secretKey()) === null;
    } catch {
      return false;
    }
  }

  /** The publishable key the browser needs for Stripe Elements (or null). */
  async publishableKey(): Promise<string | null> {
    const s = await this.prisma.facilitySettings.findFirst();
    return s?.stripePublishableKey ?? null;
  }

  /**
   * Create a payment intent for `amountCents`, bound to `reference` — a stable
   * token identifying exactly what is being paid for (e.g. `booking:<id>` or
   * `attendance:<id>`). The reference is stamped into the intent's Stripe
   * metadata (server-authoritative, the client can't forge it) and re-checked
   * at `assertSucceeded`, so an intent created for one record can never be
   * replayed to mark a different record paid. In test mode the reference is
   * embedded in the stub id for the same check. In both modes the DB also
   * carries a unique constraint on the stored intent id as a second line of
   * defence against reuse.
   */
  async createIntent(
    amountCents: number,
    reference: string,
    opts: { manualCapture?: boolean } = {},
  ): Promise<{ id: string; clientSecret: string; testMode: boolean; publishableKey: string | null }> {
    if (amountCents <= 0) throw new BadRequestException("Amount must be positive");
    const key = await this.secretKey();
    if (!key) {
      // The stub id carries an HMAC over amount+reference+nonce (keyed by the
      // server's JWT secret), so it can only be minted HERE — a client can no
      // longer construct a "successful payment" string from values it knows.
      const refHex = Buffer.from(reference, "utf8").toString("hex");
      const nonce = randomBytes(8).toString("hex");
      const mac = this.stubMac(amountCents, reference, nonce);
      const id = `pi_test_${amountCents}_${refHex}_${nonce}_${mac}`;
      return { id, clientSecret: `test_${id}`, testMode: true, publishableKey: null };
    }
    const intent = await this.client(key).paymentIntents.create({
      amount: amountCents,
      currency: "aud",
      // Cards only: async payment methods (BECS etc.) settle hours later with
      // no webhook to complete the booking — the parent would be charged with
      // nothing booked and no recovery path.
      payment_method_types: ["card"],
      // Online bookings authorise (hold) at booking and capture on staff
      // approval, so a rejected booking is voided rather than refunded.
      capture_method: opts.manualCapture ? "manual" : "automatic",
      description: "CrecheMate childcare fee",
      metadata: { crechemate_ref: reference },
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? "",
      testMode: false,
      publishableKey: await this.publishableKey(),
    };
  }

  /**
   * Verify a payment is AUTHORISED (a manual-capture hold placed) for
   * `amountCents` and `reference`, without capturing it. Used when a parent's
   * card is held at booking time — the charge only happens on staff approval.
   */
  async assertAuthorized(paymentIntentId: string, amountCents: number, reference: string): Promise<void> {
    if (paymentIntentId.startsWith("pi_test_")) {
      if (!(await this.isTestMode())) throw new BadRequestException("Invalid payment reference");
      const parts = paymentIntentId.split("_");
      if (Number(parts[2]) !== amountCents) throw new BadRequestException("Payment amount mismatch");
      if (Buffer.from(parts[3] ?? "", "hex").toString("utf8") !== reference) {
        throw new BadRequestException("Payment reference mismatch");
      }
      const mac = this.stubMac(amountCents, reference, parts[4] ?? "");
      if (!parts[5] || parts[5] !== mac) throw new BadRequestException("Invalid payment reference");
      return;
    }
    const key = await this.secretKey();
    if (!key) throw new BadRequestException("Card payments aren't linked to a Stripe account");
    const intent = await this.client(key).paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "requires_capture") throw new BadRequestException("Card hasn't been authorised");
    if (intent.amount_capturable !== amountCents) throw new BadRequestException("Payment amount mismatch");
    if (intent.currency !== "aud") throw new BadRequestException("Payment currency mismatch");
    if (intent.metadata?.crechemate_ref !== reference) throw new BadRequestException("Payment reference mismatch");
  }

  /** Capture a previously-authorised hold (charge the card). No-op stub in test mode. */
  async capture(paymentIntentId: string): Promise<void> {
    if (paymentIntentId.startsWith("pi_test_")) return;
    const key = await this.secretKey();
    if (!key) throw new BadRequestException("Card payments aren't linked to a Stripe account");
    try {
      const captured = await this.client(key).paymentIntents.capture(paymentIntentId);
      if (captured.status !== "succeeded") throw new Error(`unexpected status ${captured.status}`);
    } catch (e) {
      this.logger.error(`Stripe capture failed for ${paymentIntentId}: ${(e as Error).message}`);
      throw new BadRequestException("Couldn't capture the card hold — it may have expired. Ask the parent to re-book.");
    }
  }

  /** Release an authorised-but-uncaptured hold (no money moves). Best-effort:
   * a failure is logged, not thrown — an un-voided hold auto-expires (~7 days). */
  async cancelAuthorization(paymentIntentId: string | null | undefined): Promise<void> {
    if (!paymentIntentId || paymentIntentId.startsWith("pi_test_")) return;
    const key = await this.secretKey();
    if (!key) return;
    try {
      await this.client(key).paymentIntents.cancel(paymentIntentId);
    } catch (e) {
      this.logger.error(`Stripe hold cancel failed for ${paymentIntentId}: ${(e as Error).message}`);
    }
  }

  /**
   * Verify a payment succeeded for `amountCents` AND was created for
   * `reference`, before marking a fee paid. The reference check is what stops
   * a real, succeeded intent from being replayed against a different booking
   * or attendance of the same price.
   */
  async assertSucceeded(paymentIntentId: string, amountCents: number, reference: string): Promise<void> {
    if (paymentIntentId.startsWith("pi_test_")) {
      // A stub intent is only acceptable while genuinely in test mode.
      if (!(await this.isTestMode())) throw new BadRequestException("Invalid payment reference");
      const parts = paymentIntentId.split("_"); // pi_test_<amount>_<refHex>_<nonce>_<mac>
      if (Number(parts[2]) !== amountCents) throw new BadRequestException("Payment amount mismatch");
      const embeddedRef = Buffer.from(parts[3] ?? "", "hex").toString("utf8");
      if (embeddedRef !== reference) throw new BadRequestException("Payment reference mismatch");
      // Server-minted only: verify the HMAC (legacy stubs without one are
      // rejected — nothing durable depends on an unconsumed old stub).
      const mac = this.stubMac(amountCents, reference, parts[4] ?? "");
      if (!parts[5] || parts[5] !== mac) throw new BadRequestException("Invalid payment reference");
      return;
    }
    const key = await this.secretKey();
    if (!key) throw new BadRequestException("Card payments aren't linked to a Stripe account");
    const intent = await this.client(key).paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") throw new BadRequestException("Card payment hasn't completed");
    if (intent.amount_received !== amountCents) throw new BadRequestException("Payment amount mismatch");
    if (intent.currency !== "aud") throw new BadRequestException("Payment currency mismatch");
    if (intent.metadata?.crechemate_ref !== reference) throw new BadRequestException("Payment reference mismatch");
  }

  /**
   * Validate + store a Stripe account link. Confirms the secret key actually
   * works against Stripe before saving. Returns nothing sensitive.
   */
  async linkAccount(settingsId: string, secretKey: string, publishableKey: string): Promise<void> {
    if (!secretKey.startsWith("sk_")) throw new BadRequestException("Secret key must start with sk_");
    if (!publishableKey.startsWith("pk_")) throw new BadRequestException("Publishable key must start with pk_");
    // Test keys make the whole app REPORT payments as live while no money is
    // ever collected — parents see "you've been charged", Xero gets phantom
    // revenue. The built-in stub mode (no keys linked) is the way to trial.
    if (secretKey.startsWith("sk_test_")) {
      throw new BadRequestException("That's a Stripe TEST key. Link your live keys — or unlink Stripe entirely to use the built-in test mode.");
    }
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

  /** Refund a captured payment (e.g. a late cancellation). Pass `amountCents`
   * for a partial refund (the cancellation policy's percentage); omit for a
   * full refund. No-op for test-mode stubs, which never moved real money. */
  async refund(paymentIntentId: string | null | undefined, amountCents?: number, idempotencyKey?: string): Promise<void> {
    if (!paymentIntentId || paymentIntentId.startsWith("pi_test_")) return;
    if (amountCents !== undefined && amountCents <= 0) return; // nothing to refund
    const key = await this.secretKey();
    if (!key) return; // account was unlinked; nothing we can do here
    try {
      await this.client(key).refunds.create(
        {
          payment_intent: paymentIntentId,
          ...(amountCents !== undefined ? { amount: amountCents } : {}),
        },
        // Stripe-side backstop: a retried/raced call with the same key can
        // never move the money twice.
        idempotencyKey ? { idempotencyKey } : undefined,
      );
    } catch (e) {
      this.logger.error(`Stripe refund failed for ${paymentIntentId}: ${(e as Error).message}`);
      throw new BadRequestException("Refund failed — issue it manually in the Stripe dashboard");
    }
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
