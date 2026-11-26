// G36 post-ship review — the (founder) layout read app_users twice per request:
// once through the /dashboard redirect (`resolvePersonaForUser`) and once for
// the sidebar seat (`loadPersonaRow`). `loadPersonaRow` is now a per-request
// memo (React `cache`); this spec swaps `cache` for a plain memoiser (vitest
// runs outside an RSC render, where React's `cache` is a pass-through) and
// pins that both callers share ONE read. Also pins `navSeatFor`'s fallbacks
// against the ones /api/entitlement/me hands the client.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reads: 0,
  row: { account_type: "investor_angel", segment: "investor_angel", onboarding_completed: true } as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    // A request-scoped memo stand-in: one Map per test (cleared in beforeEach via memo.clear()).
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      (globalThis as { __personaMemo?: Map<string, unknown> }).__personaMemo = memo as Map<string, unknown>;
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.reads += 1;
            return { data: db.row };
          },
        }),
      }),
    }),
  }),
}));

import { loadPersonaRow, loadPersonaRowUncached, navSeatFor, resolvePersonaForUser } from "./persona-server";

describe("loadPersonaRow — one app_users read per request (G36 review)", () => {
  beforeEach(() => {
    db.reads = 0;
    (globalThis as { __personaMemo?: Map<string, unknown> }).__personaMemo?.clear();
  });

  it("the /dashboard redirect resolver and the sidebar seat share a single read", async () => {
    const user = { id: "u-1", role: "user", plan: "free" };
    expect(await resolvePersonaForUser(user)).toBe("investor_angel");
    const row = await loadPersonaRow(user.id);
    expect(row).toMatchObject({ accountType: "investor_angel", segment: "investor_angel", loaded: true });
    expect(db.reads).toBe(1);
  });

  it("the uncached reader still hits the DB every call", async () => {
    await loadPersonaRowUncached("u-1");
    await loadPersonaRowUncached("u-1");
    expect(db.reads).toBe(2);
  });
});

describe("navSeatFor — the /api/entitlement/me fallbacks", () => {
  const loaded = { accountType: "investor_angel", segment: "investor_angel", onboardingCompleted: true, loaded: true };

  it("passes plan + columns through", () => {
    expect(navSeatFor({ plan: "investor_angel" }, loaded)).toEqual({ accountType: "investor_angel", segment: "investor_angel", plan: "investor_angel" });
  });

  it("plan ?? 'free' and segment ?? 'founder', like the route", () => {
    expect(navSeatFor({ plan: null }, { ...loaded, accountType: null, segment: null })).toEqual({ accountType: null, segment: "founder", plan: "free" });
  });

  it("no user or an unreadable row → no seat", () => {
    expect(navSeatFor(null, loaded)).toBeNull();
    expect(navSeatFor({ plan: "free" }, { ...loaded, loaded: false })).toBeNull();
    expect(navSeatFor({ plan: "free" }, null)).toBeNull();
  });
});
