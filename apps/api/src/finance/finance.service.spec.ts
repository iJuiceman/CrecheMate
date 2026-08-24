import { FinanceService } from "./finance.service";

// Mocked prisma keyed by the shape of each query the summary issues, so we can
// assert the cash-basis accounting without a database.
function makeService(data: {
  paidAttendances?: any[];
  prepayments?: any[]; // paid bookingRequests, status pending|declined
  refunds?: any[]; // declined+refunded bookingRequests
  serviceWindow?: any[]; // unpaid/waived attendances in the service window
}) {
  const prisma = {
    attendance: {
      findMany: (args: any) =>
        Promise.resolve(args.where.paymentStatus === "paid" ? data.paidAttendances ?? [] : data.serviceWindow ?? []),
    },
    bookingRequest: {
      findMany: (args: any) =>
        Promise.resolve(args.where.status?.in ? data.prepayments ?? [] : data.refunds ?? []),
    },
  } as any;
  const settings = {
    get: async () => ({
      timezone: "Australia/Sydney",
      xeroAccountCode: "200",
      xeroTaxType: "GST Free Income",
      xeroInvoicePrefix: "CM",
      name: "CrecheMate",
      abn: null,
    }),
  } as any;
  return new FinanceService(prisma, settings);
}

const AUG = (d: number) => new Date(`2026-08-${String(d).padStart(2, "0")}T02:00:00Z`);
const prepay = (id: string, cents: number, day: number) => ({
  id,
  feeCents: cents,
  paidAt: AUG(day),
  decidedAt: AUG(day),
  requestedStart: AUG(day),
  childFirstName: "Kid",
  childLastName: id,
  parentFirstName: "Pat",
  parentLastName: id,
  parentEmail: null,
});

describe("FinanceService.summary — cash-basis accounting", () => {
  it("nets a declined prepayment to zero (cash-in counted, refund counted)", async () => {
    const svc = makeService({
      prepayments: [prepay("A", 2000, 10)], // declined prepayment appears as cash-in
      refunds: [prepay("A", 2000, 10)], // and as a refund out
    });
    const d = await svc.summary("2026-08-01", "2026-08-31");
    expect(d.totals.collectedCents).toBe(2000);
    expect(d.totals.refundedCents).toBe(2000);
    expect(d.totals.netCents).toBe(0); // was -2000 before the fix
  });

  it("counts a confirmed booking once (as its attendance, not the prepayment)", async () => {
    const svc = makeService({
      paidAttendances: [
        {
          id: "att1",
          feeCents: 1000,
          paymentMethod: "online",
          paidAt: AUG(12),
          serviceDate: AUG(12),
          child: { firstName: "Boss", lastName: "Baby", guardian: { firstName: "Mal", lastName: "J", email: null } },
        },
      ],
      // confirmed requests are excluded from the prepayments query, so none here
    });
    const d = await svc.summary("2026-08-01", "2026-08-31");
    expect(d.totals.collectedCents).toBe(1000);
    expect(d.totals.netCents).toBe(1000);
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].kind).toBe("fee");
  });

  it("keeps the Xero CSV total equal to net revenue", async () => {
    const svc = makeService({
      paidAttendances: [
        { id: "att1", feeCents: 1500, paymentMethod: "cash", paidAt: AUG(5), serviceDate: AUG(5), child: null },
      ],
      prepayments: [prepay("B", 2000, 10)],
      refunds: [prepay("B", 2000, 10)],
    });
    const { csv } = await svc.xeroSalesCsv("2026-08-01", "2026-08-31");
    const amounts = csv
      .trim()
      .split("\r\n")
      .slice(1) // drop header
      .map((l) => Number(l.split(",")[17])); // *UnitAmount column index
    const total = amounts.reduce((s, n) => s + n, 0);
    // 15.00 (fee) + 20.00 (prepayment) - 20.00 (refund credit) = 15.00 = net
    expect(Math.round(total * 100)).toBe(1500);
  });
});
