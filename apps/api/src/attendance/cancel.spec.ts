import { AttendanceService } from "./attendance.service";

// Cancellation refund policy: full refund outside the late-cancel window,
// the configured percentage within it. The cancellation is CLAIMED atomically
// (updateMany on status=booked) before any money moves, and the Stripe call
// carries an idempotency key — so a race or retry can't refund twice.
// Prisma/settings/payments are mocked.
function makeService(booking: any, policy = { lateCancelWindowHours: 24, lateCancelRefundPercent: 50 }, claimCount = 1) {
  const refund = jest.fn(async () => {});
  const update = jest.fn(async () => ({}));
  const updateMany = jest.fn(async () => ({ count: claimCount }));
  const prisma = { attendance: { findUnique: async () => booking, update, updateMany } } as any;
  const settings = { get: async () => policy } as any;
  const payments = { refund } as any;
  return { svc: new AttendanceService(prisma, settings, payments), refund, update, updateMany };
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);
const paidBooking = (startInHours: number) => ({
  id: "att1",
  status: "booked",
  paymentStatus: "paid",
  feeCents: 2000,
  scheduledStart: hoursFromNow(startInHours),
  serviceDate: hoursFromNow(startInHours),
  stripePaymentIntentId: "pi_live_x",
});

describe("AttendanceService.cancel — late-cancellation refund policy", () => {
  it("refunds 100% when cancelled outside the window (>24h before start)", async () => {
    const { svc, refund } = makeService(paidBooking(48));
    const res = await svc.cancel("att1");
    expect(res.refundPercent).toBe(100);
    expect(res.refundedCents).toBe(2000);
    expect(refund).toHaveBeenCalledWith("pi_live_x", undefined, "cancel:att1"); // full refund
  });

  it("refunds only the configured percentage within the window (<24h)", async () => {
    const { svc, refund } = makeService(paidBooking(5));
    const res = await svc.cancel("att1");
    expect(res.refundPercent).toBe(50);
    expect(res.refundedCents).toBe(1000);
    expect(refund).toHaveBeenCalledWith("pi_live_x", 1000, "cancel:att1"); // partial refund
  });

  it("honours a custom policy from settings", async () => {
    const { svc } = makeService(paidBooking(2), { lateCancelWindowHours: 48, lateCancelRefundPercent: 25 });
    const res = await svc.cancel("att1"); // 2h out, window 48h → late
    expect(res.refundPercent).toBe(25);
    expect(res.refundedCents).toBe(500);
  });

  it("refunds nothing for an unpaid booking", async () => {
    const { svc, refund } = makeService({ ...paidBooking(5), paymentStatus: "unpaid" });
    const res = await svc.cancel("att1");
    expect(res.refundedCents).toBe(0);
    expect(refund).not.toHaveBeenCalled();
  });

  it("claims the cancellation atomically — the losing concurrent cancel never refunds", async () => {
    const { svc, refund, updateMany } = makeService(paidBooking(5), undefined, 0); // claim already taken
    await expect(svc.cancel("att1")).rejects.toThrow("already cancelled");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "att1", status: "booked" }, data: { status: "cancelled" } });
    expect(refund).not.toHaveBeenCalled();
  });

  it("records a failed refund loudly instead of booking it", async () => {
    const { svc, refund, update } = makeService(paidBooking(5));
    refund.mockRejectedValueOnce(new Error("stripe down") as never);
    await expect(svc.cancel("att1")).rejects.toThrow("stripe down");
    // The cancellation stands; the note flags the manual refund; no refundedCents write.
    const noteWrite = update.mock.calls.find((c: any[]) => c[0]?.data?.notes?.includes("REFUND FAILED"));
    expect(noteWrite).toBeTruthy();
    const moneyWrite = update.mock.calls.find((c: any[]) => c[0]?.data?.refundedCents > 0);
    expect(moneyWrite).toBeFalsy();
  });
});
