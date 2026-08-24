import { BadRequestException } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

// No Stripe key linked and PAYMENTS_TEST_MODE unset → the service is in test
// mode, so createIntent returns a stub and assertSucceeded validates it purely
// (no network). This exercises the replay-fix reference binding end to end.
function testModeService(): PaymentsService {
  const prisma = { facilitySettings: { findFirst: async () => null } } as any;
  const config = { get: () => undefined } as any;
  return new PaymentsService(prisma, config);
}

describe("PaymentsService — PaymentIntent reference binding (replay guard)", () => {
  it("accepts a stub only for the exact amount AND reference it was created for", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(1000, "booking:abc");
    expect(intent.testMode).toBe(true);
    await expect(svc.assertSucceeded(intent.id, 1000, "booking:abc")).resolves.toBeUndefined();
  });

  it("rejects replaying an intent against a different record (same amount)", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(1000, "booking:AAA");
    // Same price, different booking — this is the exact replay attack.
    await expect(svc.assertSucceeded(intent.id, 1000, "booking:BBB")).rejects.toThrow(
      /reference mismatch/i,
    );
  });

  it("rejects an amount mismatch", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(1000, "attendance:x");
    await expect(svc.assertSucceeded(intent.id, 2000, "attendance:x")).rejects.toThrow(
      /amount mismatch/i,
    );
  });

  it("refuses a positive amount of zero or less", async () => {
    await expect(testModeService().createIntent(0, "booking:x")).rejects.toThrow(BadRequestException);
  });
});

describe("PaymentsService — authorise/hold flow (manual capture)", () => {
  it("accepts an authorised hold for the exact amount and reference", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(2500, "booking:hold1", { manualCapture: true });
    await expect(svc.assertAuthorized(intent.id, 2500, "booking:hold1")).resolves.toBeUndefined();
  });

  it("rejects an authorised hold replayed against another booking", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(2500, "booking:hold1", { manualCapture: true });
    await expect(svc.assertAuthorized(intent.id, 2500, "booking:hold2")).rejects.toThrow(/reference mismatch/i);
  });

  it("capture and cancelAuthorization are safe no-ops on a test stub", async () => {
    const svc = testModeService();
    const intent = await svc.createIntent(2500, "booking:hold1", { manualCapture: true });
    await expect(svc.capture(intent.id)).resolves.toBeUndefined();
    await expect(svc.cancelAuthorization(intent.id)).resolves.toBeUndefined();
  });
});
