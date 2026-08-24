import { AttendanceService } from "./attendance.service";

// Cancellation refund policy: full refund outside the late-cancel window,
// the configured percentage within it. Prisma/settings/payments are mocked.
function makeService(booking: any, policy = { lateCancelWindowHours: 24, lateCancelRefundPercent: 50 }) {
  const refund = jest.fn(async () => {});
  const update = jest.fn(async () => ({}));
  const prisma = { attendance: { findUnique: async () => booking, update } } as any;
  const settings = { get: async () => policy } as any;
  const payments = { refund } as any;
  return { svc: new AttendanceService(prisma, settings, payments), refund, update };
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
    expect(refund).toHaveBeenCalledWith("pi_live_x", undefined); // full refund
  });

  it("refunds only the configured percentage within the window (<24h)", async () => {
    const { svc, refund } = makeService(paidBooking(5));
    const res = await svc.cancel("att1");
    expect(res.refundPercent).toBe(50);
    expect(res.refundedCents).toBe(1000);
    expect(refund).toHaveBeenCalledWith("pi_live_x", 1000); // partial refund
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
});
