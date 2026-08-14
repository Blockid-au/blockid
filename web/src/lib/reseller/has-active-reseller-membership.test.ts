/**
 * Regression test for hasActiveResellerMembership() — the layout+entitlements
 * probe that keeps reseller owners on founder plans (e.g. plan='growth') from
 * being 307-redirected away from /reseller.
 *
 * Prior bug shape: web/src/app/(app)/(reseller)/reseller/layout.tsx used only
 * `can(user, "reseller.console")` which is plan-derived. A founder-plan user
 * who is also an active `reseller_admins` row would successfully log in but
 * get redirected to /dashboard/svi — surfaced as "reseller login broken".
 *
 * Contract pinned here:
 *   - null Supabase → false (dev / preview safe, never throws)
 *   - Supabase error → false (fail closed, no crash)
 *   - zero rows      → false (not a reseller admin)
 *   - >=1 active row → true  (any active membership grants access)
 *
 * The chain shape is also pinned so downstream refactors can't silently drop
 * the status='active' filter and re-open revoked admins.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type ChainCall = { method: string; args: unknown[] };

interface ChainState {
  calls: ChainCall[];
  result: { data: unknown; error: { message: string } | null };
}

const state: { admin: ReturnType<typeof buildAdmin> | null; chain: ChainState } = {
  admin: null,
  chain: { calls: [], result: { data: null, error: null } },
};

function buildChain() {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(state.chain.result);
        }
        return (...args: unknown[]) => {
          state.chain.calls.push({ method: prop, args });
          return buildChain();
        };
      },
    },
  );
}

function buildAdmin() {
  return {
    from(table: string) {
      state.chain.calls.push({ method: "from", args: [table] });
      return buildChain();
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => state.admin,
}));

// Import AFTER mock so the module binds to the mocked getSupabaseAdmin.
import { hasActiveResellerMembership } from "./scope";

const USER = "00000000-0000-0000-0000-000000000042";

beforeEach(() => {
  state.admin = buildAdmin();
  state.chain = { calls: [], result: { data: null, error: null } };
});

describe("hasActiveResellerMembership", () => {
  it("returns false when Supabase admin is not configured", async () => {
    state.admin = null;
    expect(await hasActiveResellerMembership(USER)).toBe(false);
  });

  it("returns false when Supabase returns an error (fails closed)", async () => {
    state.chain.result = { data: null, error: { message: "db down" } };
    expect(await hasActiveResellerMembership(USER)).toBe(false);
  });

  it("returns false when no active membership rows exist", async () => {
    state.chain.result = { data: [], error: null };
    expect(await hasActiveResellerMembership(USER)).toBe(false);
  });

  it("returns true when at least one active membership row exists", async () => {
    state.chain.result = {
      data: [{ reseller_id: "58831c28-42c8-4547-b3bf-d5bf8be224aa" }],
      error: null,
    };
    expect(await hasActiveResellerMembership(USER)).toBe(true);
  });

  it("queries reseller_admins filtered by user_id + status='active'", async () => {
    state.chain.result = { data: [], error: null };
    await hasActiveResellerMembership(USER);
    const from = state.chain.calls.find((c) => c.method === "from");
    expect(from?.args[0]).toBe("reseller_admins");
    const eqCalls = state.chain.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["user_id", USER] },
        { method: "eq", args: ["status", "active"] },
      ]),
    );
  });
});
