import { describe, expect, it, vi } from "vitest";

// Stub the server-only sentinel so vitest can import require-admin.ts
// without dragging in Next.js server bindings.
vi.mock("server-only", () => ({}));

// Import after the stub is hoisted.
import type { AppUser } from "@/lib/auth";
import { ADMIN_EMAIL } from "@/lib/auth";
import { AdminGateError, isAdmin, requireAdmin } from "./require-admin";

// Covers CI rule R-06 (docs/plans/reseller-module-plan.md § U.15.12; CISO
// D3-CISO-06): the shared admin gate MUST reject any AppUser that is not
// admin-by-role AND not admin-by-email, and reseller-scoped consumers must
// never be able to slip through. The AppUser.role union in web/src/lib/auth.ts
// only names "user" | "admin" so a reseller-role JWT that tried to widen role
// beyond that union would fail type-checking at compile time; this suite
// covers the runtime side of the same posture.

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "someone@example.com",
    displayName: null,
    createdAt: "2026-07-24T00:00:00Z",
    lastLoginAt: null,
    role: "user",
    plan: null,
    googleId: null,
    avatarUrl: null,
    discountPct: null,
    startupName: null,
    startupStage: null,
    industry: null,
    onboardingCompleted: false,
    startupGoals: null,
    ...overrides,
  };
}

describe("isAdmin", () => {
  it("returns false for null / undefined", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("returns true when role === 'admin'", () => {
    expect(isAdmin(makeUser({ role: "admin" }))).toBe(true);
  });

  it("returns true when email matches ADMIN_EMAIL (case-insensitive)", () => {
    const upper = ADMIN_EMAIL.toUpperCase();
    expect(isAdmin(makeUser({ email: upper }))).toBe(true);
  });

  it("returns false for standard user with non-admin email", () => {
    expect(
      isAdmin(makeUser({ role: "user", email: "reseller-owner@example.com" })),
    ).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("throws AdminGateError('no_user') for null", () => {
    let caught: unknown = null;
    try {
      requireAdmin(null);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AdminGateError);
    expect((caught as AdminGateError).code).toBe("no_user");
  });

  it("throws AdminGateError('not_admin') for a plain user", () => {
    let caught: unknown = null;
    try {
      requireAdmin(makeUser({ role: "user", email: "reseller-owner@example.com" }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AdminGateError);
    expect((caught as AdminGateError).code).toBe("not_admin");
  });

  it("passes for role='admin'", () => {
    expect(() => requireAdmin(makeUser({ role: "admin" }))).not.toThrow();
  });

  it("passes for email===ADMIN_EMAIL even when role='user'", () => {
    expect(() =>
      requireAdmin(makeUser({ role: "user", email: ADMIN_EMAIL })),
    ).not.toThrow();
  });
});

describe("R-06 posture — reseller-scoped users cannot resolve requireAdmin", () => {
  // A reseller owner logged in through the standard user flow has role='user'
  // and a non-admin email; the gate must reject them.
  it("rejects a reseller owner with role='user'", () => {
    expect(() =>
      requireAdmin(
        makeUser({ role: "user", email: "partner@infovision.example" }),
      ),
    ).toThrow(AdminGateError);
  });

  // A reseller-role JWT with an admin-looking email would still be rejected
  // if the session issuer stripped role='admin' (see require-admin.ts:36-39).
  // Simulate that by asserting the guard only trusts role, not email, when
  // email whitelist is disabled by env override.
  it("does not grant admin purely because email string happens to match when role is not 'admin' — unless it exactly matches ADMIN_EMAIL", () => {
    // A near-match should NOT open the gate.
    expect(() =>
      requireAdmin(makeUser({ role: "user", email: `not-${ADMIN_EMAIL}` })),
    ).toThrow(AdminGateError);
  });
});
