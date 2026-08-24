import { AttendanceService } from "./attendance.service";

// feeFor is pure; instantiate the service with no-op deps and reach it directly.
const svc = new AttendanceService({} as any, {} as any, {} as any);
const feeFor = (start: string, end: string, rateCents: number) =>
  (svc as any).feeFor(new Date(start), new Date(end), rateCents);

describe("AttendanceService.feeFor — fee rounding (up to nearest ¼ hour)", () => {
  const RATE = 1000; // $10/hr

  it("bills a full hour at the hourly rate", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T10:00:00Z", RATE)).toBe(1000);
  });

  it("rounds any part-quarter up to the next 15 minutes", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:01:00Z", RATE)).toBe(250); // 1 min → 15
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:16:00Z", RATE)).toBe(500); // 16 min → 30
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T10:30:00Z", RATE)).toBe(1500); // 1.5h
  });

  it("charges nothing for a zero or negative span", () => {
    expect(feeFor("2026-08-24T09:00:00Z", "2026-08-24T09:00:00Z", RATE)).toBe(0);
    expect(feeFor("2026-08-24T10:00:00Z", "2026-08-24T09:00:00Z", RATE)).toBe(0);
  });
});
