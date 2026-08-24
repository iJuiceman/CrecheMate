import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./guards";

// ExecutionContext stub that returns the given roles metadata and request user.
function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWithRoles(required: string[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe("RolesGuard — RBAC decisions", () => {
  it("allows any authenticated user when no roles are required", () => {
    expect(guardWithRoles(undefined).canActivate(ctx({ role: "educator" }))).toBe(true);
    expect(guardWithRoles([]).canActivate(ctx({ role: "educator" }))).toBe(true);
  });

  it("allows a user whose role matches", () => {
    expect(guardWithRoles(["admin"]).canActivate(ctx({ role: "admin" }))).toBe(true);
  });

  it("forbids an educator from an admin-only route", () => {
    expect(() => guardWithRoles(["admin"]).canActivate(ctx({ role: "educator" }))).toThrow(
      ForbiddenException,
    );
  });

  it("forbids when there is no user on the request", () => {
    expect(() => guardWithRoles(["admin"]).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
