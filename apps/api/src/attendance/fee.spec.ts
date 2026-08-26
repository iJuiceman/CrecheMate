import { AttendanceService } from "./attendance.service";

// feeFor is pure; instantiate the service with no-op deps and reach it directly.
const svc = new AttendanceService({} as any, {} as any, {} as any);
const feeFor = (start: string, end: string, rateCents: number) =>
  (svc as any).feeFor(new Date(start), new Date(end), rateCents);

describe("AttendanceService.feeFor — fee rounding (up to nearest ½ hour)", () => {
  const RATE = 1000; // $10/hr

  it("bills a full hour at the hourly rate", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T10:00:00Z", RATE)).toBe(1000);
  });

  it("rounds any part-half-hour up to the next 30 minutes", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:01:00Z", RATE)).toBe(500); // 1 min → 30
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:31:00Z", RATE)).toBe(1000); // 31 min → 60
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T10:30:00Z", RATE)).toBe(1500); // 1.5h exact
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T10:31:00Z", RATE)).toBe(2000); // 1h31m → 2h
  });

  it("charges nothing for a zero or negative span", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:00:00Z", RATE)).toBe(0);
    expect(feeFor("2026-08-24T10:00:00Z", "2026-08-24T09:00:00Z", RATE)).toBe(0);
  });
});
