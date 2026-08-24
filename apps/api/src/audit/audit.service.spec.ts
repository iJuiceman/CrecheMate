import { AuditService } from "./audit.service";

const svc = new AuditService({} as any, {} as any);
const sanitize = (body: unknown, path: string) => (svc as any).sanitize(body, path);

describe("AuditService.sanitize — redaction of sensitive fields", () => {
  it("redacts credentials and Stripe secrets at the top level", () => {
    expect(sanitize({ username: "ada", password: "hunter2" }, "/auth/login")).toEqual({
      username: "ada",
      password: "[redacted]",
    });
    expect(sanitize({ secretKey: "sk_live_x", publishableKey: "pk_x" }, "/settings/stripe")).toEqual({
      secretKey: "[redacted]",
      publishableKey: "[redacted]",
    });
  });

  it("redacts medical notes nested inside the intake children array", () => {
    const out = sanitize(
      { guardian: { firstName: "Sam" }, children: [{ firstName: "Kid", medicalNotes: "nut allergy" }] },
      "/intake",
    );
    expect(out.children[0].medicalNotes).toBe("[redacted]");
    expect(out.children[0].firstName).toBe("Kid");
  });

  it("redacts incident descriptions via the per-path rule", () => {
    expect(sanitize({ description: "child fell", types: ["fall_or_trip"] }, "/incidents")).toEqual({
      description: "[redacted]",
      types: ["fall_or_trip"],
    });
  });

  it("redacts the waiver signature data URL", () => {
    const out = sanitize({ waiverSignature: "data:image/png;base64,AAAA" }, "/intake");
    expect(out.waiverSignature).toBe("[redacted]");
  });
});
