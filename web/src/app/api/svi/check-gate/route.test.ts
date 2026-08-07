// Colocated vitest for GET /api/svi/check-gate — P9-svi-check-gate-route-test.
//
// This is the pre-flight gate the landing-page hero calls before showing a
// founder the SVI analysis form. It decides whether the user can run a fresh
// analysis for free right now, and if so, why (paid plan / free tier
// available / credits remaining / daily limit reached). A regression here
// would either (a) silently deny free analyses to founders on paid plans
// (killing the conversion funnel) or (b) let unauthenticated repeat callers
// through every 24 hours by keying the "recent analyses" lookup on the
// wrong column.
//
// Regressions this suite is designed to catch:
//   - dropping the .toLowerCase().trim() email normalisation would create
//     a per-case-variant free-tier bypass;
//   - dropping the getEntitlements(svi.run) check would refuse free
//     analyses to founders on any plan whose slug wasn't hardcoded here;
//   - flipping the free-tier gate (< 1 rows in last 24h) to a >= check
//     would let repeat callers run every request;
//   - regressing the graceful-degradation branch (no Supabase → allow)
//     would 5xx the /index landing every preview branch without a service
//     role key.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseConfiguredMock: vi.fn<() => boolean>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  getEntitlementsMock: vi.fn<(plan: string | null | undefined) => Promise<string[]>>(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (p: string | null | undefined) => mocks.getEntitlementsMock(p),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic } from "./route";

// --- Fake supabase ---------------------------------------------------------

interface FakeState {
  accountRow: { plan?: string | null } | null;
  recentAnalyses: Array<{ id: string }>;
  usageRow: { credits_remaining?: number | null } | null;
  fromCalls: string[];
  selectCalls: string[];
  eqCalls: Array<[string, string, unknown]>;
  gteCalls: Array<[string, unknown]>;
  limitCalls: Array<[string, number]>;
}

const state: FakeState = {
  accountRow: null,
  recentAnalyses: [],
  usageRow: null,
  fromCalls: [],
  selectCalls: [],
  eqCalls: [],
  gteCalls: [],
  limitCalls: [],
};

function makeChain(kind: "account" | "analyses" | "usage") {
  const api: Record<string, unknown> = {};
  api.select = (cols: string) => {
    state.selectCalls.push(cols);
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCalls.push([kind, col, val]);
    return api;
  };
  api.gte = (col: string, val: unknown) => {
    state.gteCalls.push([col, val]);
    return api;
  };
  api.limit = (n: number) => {
    state.limitCalls.push([kind, n]);
    return Promise.resolve({ data: state.recentAnalyses, error: null });
  };
  api.maybeSingle = () => {
    if (kind === "account") return Promise.resolve({ data: state.accountRow, error: null });
    if (kind === "usage") return Promise.resolve({ data: state.usageRow, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      if (table === "svi_accounts") return makeChain("account");
      if (table === "svi_analyses") return makeChain("analyses");
      if (table === "svi_analysis_usage") return makeChain("usage");
      return makeChain("account");
    },
  };
}

function req(qs: string): Request {
  return new Request(`http://localhost/api/svi/check-gate?${qs}`);
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.accountRow = null;
  state.recentAnalyses = [];
  state.usageRow = null;
  state.fromCalls = [];
  state.selectCalls = [];
  state.eqCalls = [];
  state.gteCalls = [];
  state.limitCalls = [];

  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.getEntitlementsMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — module invariants", () => {
  it("exports dynamic='force-dynamic' so gate answers are not cached", () => {
    // Caching would return a stale "canAnalyze:true" 24h after the founder
    // already burned their free analysis.
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Email validation (400)
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — email validation", () => {
  it("returns 400 when email is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Email required" });
  });

  it("returns 400 when email has no @", async () => {
    const res = await GET(req("email=noatsign"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty email query", async () => {
    const res = await GET(req("email="));
    expect(res.status).toBe(400);
  });

  it("does not touch Supabase when email is invalid", async () => {
    await GET(req("email=nope"));
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Supabase unavailable — graceful degradation
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — no Supabase", () => {
  it("returns canAnalyze:true (reason=free) when Supabase is unconfigured", async () => {
    // Preview branches without a service-role key MUST NOT 5xx the landing —
    // the hero form falls back to letting the founder try one analysis.
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req("email=a@b.co"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true, canAnalyze: true, reason: "free" });
  });

  it("does not call getSupabaseAdmin when unconfigured", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    await GET(req("email=a@b.co"));
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Paid plan — svi.run entitlement unlocks
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — paid plan", () => {
  it("returns canAnalyze:true (reason=paid_plan) when the plan carries svi.run", async () => {
    state.accountRow = { plan: "growth" };
    mocks.getEntitlementsMock.mockResolvedValue(["svi.run", "reports.deep"]);
    const res = await GET(req("email=a@b.co"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      canAnalyze: true,
      reason: "paid_plan",
      plan: "growth",
    });
  });

  it("passes the account plan to getEntitlements (not a hardcoded fallback)", async () => {
    state.accountRow = { plan: "founder_growth" };
    mocks.getEntitlementsMock.mockResolvedValue(["svi.run"]);
    await GET(req("email=a@b.co"));
    expect(mocks.getEntitlementsMock).toHaveBeenCalledWith("founder_growth");
  });

  it("does NOT short-circuit on paid_plan when the plan lacks svi.run", async () => {
    // A plan that does not grant svi.run (e.g. a legacy read-only tier) must
    // fall through to the free / credits gates.
    state.accountRow = { plan: "reader" };
    mocks.getEntitlementsMock.mockResolvedValue(["reports.view"]);
    const res = await GET(req("email=a@b.co"));
    const body = await json(res);
    expect(body.reason).not.toBe("paid_plan");
  });

  it("does not check entitlements when svi_accounts has no plan", async () => {
    state.accountRow = { plan: null };
    await GET(req("email=a@b.co"));
    expect(mocks.getEntitlementsMock).not.toHaveBeenCalled();
  });

  it("does not check entitlements when svi_accounts has no row", async () => {
    state.accountRow = null;
    await GET(req("email=a@b.co"));
    expect(mocks.getEntitlementsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Free tier (no analyses in last 24h)
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — free tier", () => {
  it("returns canAnalyze:true (reason=free_available) when no analyses in 24h", async () => {
    state.accountRow = null;
    state.recentAnalyses = [];
    const res = await GET(req("email=a@b.co"));
    const body = await json(res);
    expect(body).toEqual({ ok: true, canAnalyze: true, reason: "free_available" });
  });

  it("queries svi_analyses by normalised email + gte 24h ago + limit 1", async () => {
    state.accountRow = null;
    await GET(req("email=A@B.co"));
    expect(state.eqCalls).toContainEqual(["analyses", "email", "a@b.co"]);
    expect(state.gteCalls[0]?.[0]).toBe("created_at");
    expect(state.limitCalls).toContainEqual(["analyses", 1]);
  });

  it("uses a 24-hour window (millisecond precision doesn't matter, hour band does)", async () => {
    state.accountRow = null;
    await GET(req("email=a@b.co"));
    const gte = state.gteCalls[0]?.[1];
    expect(typeof gte).toBe("string");
    const iso = gte as string;
    const parsed = new Date(iso).getTime();
    const nowIsh = Date.now();
    // Between 23h and 25h ago.
    expect(parsed).toBeGreaterThan(nowIsh - 25 * 60 * 60 * 1000);
    expect(parsed).toBeLessThan(nowIsh - 23 * 60 * 60 * 1000);
  });
});

// -----------------------------------------------------------------------------
// Credits path
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — credits path", () => {
  it("returns canAnalyze:true (reason=credits) when credits_remaining > 0", async () => {
    state.accountRow = null;
    state.recentAnalyses = [{ id: "prev" }];
    state.usageRow = { credits_remaining: 3 };
    const res = await GET(req("email=a@b.co"));
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      canAnalyze: true,
      reason: "credits",
      credits: 3,
    });
  });

  it("falls through to daily_limit_reached when credits_remaining is 0", async () => {
    state.accountRow = null;
    state.recentAnalyses = [{ id: "prev" }];
    state.usageRow = { credits_remaining: 0 };
    const res = await GET(req("email=a@b.co"));
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      canAnalyze: false,
      reason: "daily_limit_reached",
    });
  });

  it("falls through to daily_limit_reached when there is no usage row", async () => {
    state.accountRow = null;
    state.recentAnalyses = [{ id: "prev" }];
    state.usageRow = null;
    const res = await GET(req("email=a@b.co"));
    const body = await json(res);
    expect(body.canAnalyze).toBe(false);
    expect(body.reason).toBe("daily_limit_reached");
  });
});

// -----------------------------------------------------------------------------
// Email normalisation
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — email normalisation", () => {
  it("lowercases the email before every DB lookup", async () => {
    await GET(req("email=Founder@Example.COM"));
    for (const [, col, val] of state.eqCalls) {
      if (col === "email") expect(val).toBe("founder@example.com");
    }
  });

  it("trims whitespace before every DB lookup", async () => {
    // URL query values are usually already trimmed but the route does .trim()
    // defensively — pin so a refactor doesn't drop it and let leading-space
    // variants bypass the dedup.
    await GET(req("email=%20a%40b.co%20"));
    for (const [, col, val] of state.eqCalls) {
      if (col === "email") expect(val).toBe("a@b.co");
    }
  });
});

// -----------------------------------------------------------------------------
// Gate precedence
// -----------------------------------------------------------------------------

describe("GET /api/svi/check-gate — gate precedence", () => {
  it("email validation (400) precedes supabase config check", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req("email="));
    expect(res.status).toBe(400);
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("supabase-unconfigured returns free WITHOUT running the entitlement check", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    await GET(req("email=a@b.co"));
    expect(mocks.getEntitlementsMock).not.toHaveBeenCalled();
  });

  it("paid_plan short-circuits (never queries svi_analyses or usage)", async () => {
    state.accountRow = { plan: "growth" };
    mocks.getEntitlementsMock.mockResolvedValue(["svi.run"]);
    await GET(req("email=a@b.co"));
    expect(state.fromCalls).not.toContain("svi_analyses");
    expect(state.fromCalls).not.toContain("svi_analysis_usage");
  });

  it("free_available short-circuits (never queries usage)", async () => {
    state.accountRow = null;
    state.recentAnalyses = [];
    await GET(req("email=a@b.co"));
    expect(state.fromCalls).not.toContain("svi_analysis_usage");
  });
});
