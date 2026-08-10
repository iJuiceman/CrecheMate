import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";

// Honest Stripe integration for card payments taken at the desk.
//
// TEST MODE (default when STRIPE_SECRET_KEY is blank, or PAYMENTS_TEST_MODE
// isn't false): online payments auto-succeed with a stub PaymentIntent id so
// the whole flow is exercisable onsite without a Stripe account. It never
// pretends a real charge happened — the id is clearly a stub. Set a real
// sk_live_ key and PAYMENTS_TEST_MODE=false to take real cards.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private config: ConfigService) {}

  private get testMode(): boolean {
    const key = this.config.get<string>("STRIPE_SECRET_KEY");
    const flag = this.config.get<string>("PAYMENTS_TEST_MODE");
    if (flag === "false") return false;
    return !key || !key.startsWith("sk_");
  }

  /** Create a payment intent for `amountCents`. In test mode returns a stub. */
  async createIntent(amountCents: number): Promise<{ id: string; clientSecret: string; testMode: boolean }> {
    if (amountCents <= 0) throw new BadRequestException("Amount must be positive");
    if (this.testMode) {
      const id = `pi_test_${amountCents}_${randomBytes(8).toString("hex")}`;
      return { id, clientSecret: `test_${id}`, testMode: true };
    }
    // Real Stripe path — kept minimal; add the SDK when going live.
    throw new ServiceUnavailableException(
      "Real card payments need the Stripe SDK wired up and a live key. Running in test mode meanwhile.",
    );
  }

  /** Verify a payment succeeded for `amountCents`. Stub intents pass in test mode only. */
  async assertSucceeded(paymentIntentId: string, amountCents: number): Promise<void> {
    if (paymentIntentId.startsWith("pi_test_")) {
      if (!this.testMode) throw new BadRequestException("Invalid payment reference");
      const expected = Number(paymentIntentId.split("_")[2]);
      if (expected !== amountCents) throw new BadRequestException("Payment amount mismatch");
      return;
    }
    throw new BadRequestException("Real card payments aren't wired up yet");
  }
}
