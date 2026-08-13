// Colocated vitest for /api/equity/grants — P5-equity-grants-route-test.
//
// equity_grants (T0099) is the ESOP Grant Register that renders vested +
// unvested option positions and — critically — powers the P5_investor_
// readiness_score dilution / ESOP-headroom callouts on the investor-ready
// data-room surface. Silent regressions the suite pins: (a) dropping the
// plan-ownership WHERE clause on the equity_plans lookup or the member
// existing-plan check (cross-tenant grant creation), (b) dropping the
// `options_granted > 0` filter on the members list (would surface founder
// shareholders as option holders and destroy the pool utilization %),
// (c) breaking the pool-utilization / benchmark thresholds that show the
// founder whether their ESOP is healthy or exhausted, (d) losing the
// `.in(member_id, ids)` fan-out on the schedule fetch (would fail the
// vesting-timeline render across the whole register), (e) swallowing a
// bogus body into an unsafe INSERT (missing planId / grantDate / shares /
// vestingMonths guards), (f) computing an ISO-string vestedShares from a
// throwing calculateVestingSchedule (the route silently catches so a bad
// timeline row must still yield vestedShares = 0, not a NaN).
//
// getCurrentUser, the Supabase admin client, and the pure
// calculateVestingSchedule engine are mocked so the assertions pin route
// wiring — the vesting-math engine itself is covered by its own suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Auth ────────────────────────────────────────────────────
type AppUserFake = { id: string; email: string };
const getCurrentUserMock = vi.fn<() => Promise<AppUserFake | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Supabase admin (recording fake, per-table result keys) ──
type QueryResult = { data: unknown; error: { message: string } | null };

type QueryPromise = Promise<QueryResult> & {
  select: (...args: unknown[]) => QueryPromise;
  eq: (...args: unknown[]) => QueryPromise;
  gt: (...args: unknown[]) => QueryPromise;
  in: (...args: unknown[]) => QueryPromise;
  order: (...args: unknown[]) => QueryPromise;
  insert: (...args: unknown[]) => QueryPromise;
  update: (...args: unknown[]) => QueryPromise;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
};

type FromCall = { table: string; ops: Array<{ op: string; args: unknown[] }> };
const fromCalls: FromCall[] = [];

// One key per (table, mode) — GET fires several .from()s and each needs its
// own recorded fixture. `list` covers a .select(...).order(...) fan-out (the
// members list). `single` covers .maybeSingle() or .insert(...).select().single().
type Slot = { list?: QueryResult; single?: QueryResult; insert?: QueryResult; update?: QueryResult };
const state: {
  byTable: Record<string, Slot>;
  insertLog: Array<{ table: string; rows: unknown }>;
} = { byTable: {}, insertLog: [] };

function slotFor(table: string): Slot {
  state.byTable[table] ??= {};
  return state.byTable[table];
}

function makeFrom(table: string): QueryPromise {
  const call: FromCall = { table, ops: [] };
  fromCalls.push(call);

  const chain = {} as QueryPromise;
  let mode: "list" | "single" | "insert" | "update" | null = null;
  let terminal: "maybeSingle" | "single" | null = null;

  const record = (op: string, args: unknown[]) => {
    call.ops.push({ op, args });
  };

  const resolve = (): QueryResult => {
    const s = slotFor(table);
    // insert().select().single() and update().eq() flows: prefer the mode-
    // scoped slot, then fall back to the `.single` slot so a caller can just
    // set `slotFor(t).single` for the terminal-single row and not care which
    // verb triggered it.
    if (mode === "insert") return s.insert ?? s.single ?? { data: null, error: null };
    if (mode === "update") return s.update ?? s.single ?? { data: null, error: null };
    if (terminal === "maybeSingle" || terminal === "single") return s.single ?? { data: null, error: null };
    return s.list ?? { data: [], error: null };
  };

  (chain as unknown as { then: unknown }).then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);

  chain.select = (...args: unknown[]) => {
    record("select", args);
    if (mode === null) mode = "list";
    return chain;
  };
  chain.eq = (...args: unknown[]) => { record("eq", args); return chain; };
  chain.gt = (...args: unknown[]) => { record("gt", args); return chain; };
  chain.in = (...args: unknown[]) => { record("in", args); return chain; };
  chain.order = (...args: unknown[]) => { record("order", args); return chain; };
  chain.insert = (...args: unknown[]) => {
    record("insert", args);
    state.insertLog.push({ table, rows: args[0] });
    mode = "insert";
    return chain;
  };
  chain.update = (...args: unknown[]) => {
    record("update", args);
    mode = "update";
    return chain;
  };
  chain.maybeSingle = () => {
    record("maybeSingle", []);
    terminal = "maybeSingle";
    return Promise.resolve(resolve());
  };
  chain.single = () => {
    record("single", []);
    terminal = "single";
    return Promise.resolve(resolve());
  };
  return chain;
}

const getSupabaseAdminMock = vi.fn<() => { from: (t: string) => QueryPromise } | null>();
const isSupabaseConfiguredMock = vi.fn<() => boolean>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
}));

// ── Vesting engine (pure — mocked to keep pins tight) ──────
type VestingEvent = { eventDate: string; sharesVested: number; cumulativeVested: number; isCliff: boolean };
const calculateVestingScheduleMock = vi.fn<(...a: unknown[]) => VestingEvent[]>();
vi.mock("@/lib/equity/engine", () => ({
  calculateVestingSchedule: (...a: unknown[]) => calculateVestingScheduleMock(...a),
}));

// Import AFTER every mock is wired.
import { GET, POST, dynamic } from "./route";

const USER: AppUserFake = { id: "user-1", email: "founder@example.com" };

function getReq(planId?: string | null): NextRequest {
  const url = planId === undefined
    ? "http://x/api/equity/grants"
    : planId === null
      ? "http://x/api/equity/grants?planId="
      : `http://x/api/equity/grants?planId=${encodeURIComponent(planId)}`;
  return new NextRequest(url);
}

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new NextRequest("http://x/api/equity/grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function resetState() {
  fromCalls.length = 0;
  state.byTable = {};
  state.insertLog.length = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  getCurrentUserMock.mockResolvedValue(USER);
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
  // Sensible default — the route never awaits the vesting engine unless it has
  // both a schedule and a member; individual GET tests seed the schedule row.
  calculateVestingScheduleMock.mockReturnValue([]);
});

afterEach(() => { vi.clearAllMocks(); });

// ─────────────────────────────────────────────────────────────
describe("route module exports", () => {
  it("marks dynamic = 'force-dynamic' so auth is honoured per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────
describe("GET /api/equity/grants", () => {
  it("returns 401 when unauthenticated (Supabase never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq("plan-1"));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Authentication required" });
    expect(isSupabaseConfiguredMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 200 { grants: [], poolSummary: null } when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(getReq("plan-1"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, grants: [], poolSummary: null });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when planId is missing entirely", async () => {
    const res = await GET(getReq(undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "planId required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 when ?planId= is present but empty (never queries plans without an id)", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "planId required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the plan is not owned by the caller (equity_plans .maybeSingle → null)", async () => {
    slotFor("equity_plans").single = { data: null, error: null };
    const res = await GET(getReq("plan-1"));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Plan not found" });

    // ownership shape: SELECT ... FROM equity_plans WHERE id = $1 AND user_id = $2
    const planCall = fromCalls.find((c) => c.table === "equity_plans")!;
    const eqCalls = planCall.ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls).toEqual([
      ["id", "plan-1"],
      ["user_id", "user-1"],
    ]);
    expect(planCall.ops.some((o) => o.op === "maybeSingle")).toBe(true);
  });

  it("scopes equity_members to the plan and to option_holders only (options_granted > 0), ordered by join_date asc", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("equity_members").list = { data: [], error: null };
    const res = await GET(getReq("plan-1"));
    expect(res.status).toBe(200);
    const memberCall = fromCalls.find((c) => c.table === "equity_members")!;
    expect(memberCall.ops.map((o) => o.op)).toEqual(["select", "eq", "gt", "order"]);
    expect(memberCall.ops.find((o) => o.op === "eq")!.args).toEqual(["equity_plan_id", "plan-1"]);
    expect(memberCall.ops.find((o) => o.op === "gt")!.args).toEqual(["options_granted", 0]);
    expect(memberCall.ops.find((o) => o.op === "order")!.args).toEqual(["join_date", { ascending: true }]);
  });

  it("skips the vesting_schedules fetch when there are zero option-holder members", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("equity_members").list = { data: [], error: null };
    await GET(getReq("plan-1"));
    expect(fromCalls.some((c) => c.table === "equity_vesting_schedules")).toBe(false);
  });

  it("fetches vesting schedules via .in(member_id, ids) when members exist, ordered by created_at desc", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [
        { id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 100_000, join_date: "2025-01-01" },
        { id: "m-2", name: "Bo", email: "b@x", role: "employee", shares_issued: 0, options_granted: 50_000, join_date: "2025-06-01" },
      ],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    await GET(getReq("plan-1"));
    const schedCall = fromCalls.find((c) => c.table === "equity_vesting_schedules")!;
    expect(schedCall.ops.map((o) => o.op)).toEqual(["select", "in", "order"]);
    expect(schedCall.ops.find((o) => o.op === "select")!.args).toEqual(["*"]);
    expect(schedCall.ops.find((o) => o.op === "in")!.args).toEqual(["member_id", ["m-1", "m-2"]]);
    expect(schedCall.ops.find((o) => o.op === "order")!.args).toEqual(["created_at", { ascending: false }]);
  });

  it("computes vestedShares from past events and pps-derived valueAud when the plan has a pre-money valuation", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: 20_000_000, startup_name: "Acme" },
      error: null,
    };
    // pps = 2 AUD / share. 100k grant → 200k value. 25k vested → 50k vested value.
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 100_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = {
      data: [{
        id: "sch-1",
        member_id: "m-1",
        total_shares: 100_000,
        cliff_months: 12,
        vest_months: 48,
        schedule_type: "monthly",
        start_date: "2025-01-01",
      }],
      error: null,
    };
    // Any past event(s) then a future event — route picks last past for cumulative.
    calculateVestingScheduleMock.mockReturnValue([
      { eventDate: "2026-01-01", sharesVested: 25_000, cumulativeVested: 25_000, isCliff: true },
      { eventDate: "2027-01-01", sharesVested: 25_000, cumulativeVested: 50_000, isCliff: false },
    ]);
    const res = await GET(getReq("plan-1"));
    const body = await json(res) as { grants: Array<Record<string, unknown>> };
    expect(body.grants).toHaveLength(1);
    const g = body.grants[0];
    expect(g.vestedShares).toBe(25_000);
    expect(g.vestedPct).toBe(25);
    expect(g.unvestedShares).toBe(75_000);
    expect(g.valueAud).toBe(200_000);
    expect(g.vestedValueAud).toBe(50_000);
    expect(g.scheduleId).toBe("sch-1");
    expect(g.vestingMonths).toBe(48);
    expect(g.cliffMonths).toBe(12);
    expect(g.scheduleType).toBe("monthly");
    expect(g.grantDate).toBe("2025-01-01");
  });

  it("returns valueAud = null when the plan has no pre-money valuation (pps = 0 branch)", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 100_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const res = await GET(getReq("plan-1"));
    const body = await json(res) as { grants: Array<{ valueAud: number | null; vestedValueAud: number | null }> };
    expect(body.grants[0].valueAud).toBeNull();
    expect(body.grants[0].vestedValueAud).toBeNull();
  });

  it("catches a throwing calculateVestingSchedule (bad row must not crash the register)", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: 20_000_000, startup_name: "Acme" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 100_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = {
      data: [{
        id: "sch-1", member_id: "m-1", total_shares: 100_000,
        cliff_months: 12, vest_months: 48, schedule_type: "monthly", start_date: "2025-01-01",
      }],
      error: null,
    };
    calculateVestingScheduleMock.mockImplementation(() => { throw new Error("bad row"); });
    const res = await GET(getReq("plan-1"));
    expect(res.status).toBe(200);
    const body = await json(res) as { grants: Array<{ vestedShares: number; vestedPct: number; unvestedShares: number }> };
    expect(body.grants[0].vestedShares).toBe(0);
    expect(body.grants[0].vestedPct).toBe(0);
    expect(body.grants[0].unvestedShares).toBe(100_000);
  });

  it("returns poolSummary = null when there is no esop_pools row for the plan", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = { data: null, error: null };
    slotFor("equity_members").list = { data: [], error: null };
    const res = await GET(getReq("plan-1"));
    expect((await json(res)).poolSummary).toBeNull();
  });

  it("flags utilizationStatus 'healthy' below 80%", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 1_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: "start-up" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 500_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const res = await GET(getReq("plan-1"));
    const body = await json(res) as { poolSummary: { utilizationPct: number; health: Record<string, unknown> } };
    expect(body.poolSummary.utilizationPct).toBe(50);
    expect(body.poolSummary.health.utilizationStatus).toBe("healthy");
    expect(body.poolSummary.health.needsRefresh).toBe(false);
    expect(body.poolSummary.health.refreshRecommended).toBe(false);
  });

  it("flags utilizationStatus 'warning' at ≥ 80% and 'critical' at ≥ 95% (needsRefresh true at 95, refreshRecommended when < 5% free)", async () => {
    // 90% used
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 1_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: "start-up" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 900_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const res = await GET(getReq("plan-1"));
    const body = await json(res) as { poolSummary: { utilizationPct: number; health: Record<string, unknown> } };
    expect(body.poolSummary.utilizationPct).toBe(90);
    expect(body.poolSummary.health.utilizationStatus).toBe("warning");
    expect(body.poolSummary.health.needsRefresh).toBe(false);
    // 100k available > 5% of 1M (50k) → refreshRecommended false
    expect(body.poolSummary.health.refreshRecommended).toBe(false);

    // Reset for 96% used branch → critical + needsRefresh + refreshRecommended
    resetState();
    getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 1_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: "start-up" },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 960_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const res2 = await GET(getReq("plan-1"));
    const body2 = await json(res2) as { poolSummary: { utilizationPct: number; health: Record<string, unknown> } };
    expect(body2.poolSummary.utilizationPct).toBe(96);
    expect(body2.poolSummary.health.utilizationStatus).toBe("critical");
    expect(body2.poolSummary.health.needsRefresh).toBe(true);
    expect(body2.poolSummary.health.refreshRecommended).toBe(true);
  });

  it("computes grantVsIndustry benchmark tiers (below/at/above 100k/250k AU thresholds)", async () => {
    // avg 80k → below_benchmark
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 1_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: null },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 80_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const body1 = await json(await GET(getReq("plan-1"))) as { poolSummary: { avgGrantSize: number; health: Record<string, unknown> } };
    expect(body1.poolSummary.avgGrantSize).toBe(80_000);
    expect(body1.poolSummary.health.grantVsIndustry).toBe("below_benchmark");

    // avg 100k → at_benchmark
    resetState();
    getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 1_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: null },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 100_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const body2 = await json(await GET(getReq("plan-1"))) as { poolSummary: { health: Record<string, unknown> } };
    expect(body2.poolSummary.health.grantVsIndustry).toBe("at_benchmark");

    // avg 300k → above_benchmark
    resetState();
    getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 5_000_000, pool_size_percent: 10, scheme_type: "ess", au_tax_concession: null },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 300_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const body3 = await json(await GET(getReq("plan-1"))) as { poolSummary: { health: Record<string, unknown> } };
    expect(body3.poolSummary.health.grantVsIndustry).toBe("above_benchmark");
  });

  it("returns available = max(0, poolSize - totalGranted) so an over-allocated pool never renders negative headroom", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000, pre_money_valuation: null, startup_name: "Acme" },
      error: null,
    };
    slotFor("esop_pools").single = {
      data: { id: "pool-1", pool_size_shares: 100_000, pool_size_percent: 1, scheme_type: "ess", au_tax_concession: null },
      error: null,
    };
    slotFor("equity_members").list = {
      data: [{ id: "m-1", name: "Ada", email: "a@x", role: "employee", shares_issued: 0, options_granted: 200_000, join_date: "2025-01-01" }],
      error: null,
    };
    slotFor("equity_vesting_schedules").list = { data: [], error: null };
    const body = await json(await GET(getReq("plan-1"))) as { poolSummary: { available: number; totalGranted: number } };
    expect(body.poolSummary.available).toBe(0);
    expect(body.poolSummary.totalGranted).toBe(200_000);
  });

  it("returns plan echo (id, startupName, totalShares, preMoney) alongside grants", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 8_000_000, pre_money_valuation: 4_000_000, startup_name: "Echo Co" },
      error: null,
    };
    slotFor("equity_members").list = { data: [], error: null };
    const body = await json(await GET(getReq("plan-1"))) as { plan: Record<string, unknown> };
    expect(body.plan).toEqual({
      id: "plan-1",
      startupName: "Echo Co",
      totalShares: 8_000_000,
      preMoney: 4_000_000,
    });
  });

  it("returns preMoney = null when the plan has no pre_money_valuation on echo", async () => {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 8_000_000, pre_money_valuation: null, startup_name: "Echo Co" },
      error: null,
    };
    slotFor("equity_members").list = { data: [], error: null };
    const body = await json(await GET(getReq("plan-1"))) as { plan: { preMoney: number | null } };
    expect(body.plan.preMoney).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
describe("POST /api/equity/grants", () => {
  const validBody = {
    planId: "plan-1",
    memberName: "Ada Lovelace",
    memberEmail: "ada@x",
    memberRole: "employee",
    grantDate: "2026-01-01",
    shares: 100_000,
    vestingMonths: 48,
    cliffMonths: 12,
    scheduleType: "monthly" as const,
  };

  function planOwned() {
    slotFor("equity_plans").single = {
      data: { id: "plan-1", user_id: "user-1", total_shares: 10_000_000 },
      error: null,
    };
  }

  it("returns 401 when unauthenticated (Supabase never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Authentication required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ ok: false, error: "Database not configured" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON when the body is unparseable", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it.each([
    ["planId missing", { ...validBody, planId: "" }],
    ["grantDate missing", { ...validBody, grantDate: "" }],
    ["shares missing", { ...validBody, shares: 0 }],
    ["vestingMonths missing", { ...validBody, vestingMonths: 0 }],
  ])("returns 400 when %s", async (_label, body) => {
    const res = await POST(postReq(body));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "planId, grantDate, shares, and vestingMonths are required",
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the plan is not owned by the caller (equity_plans .maybeSingle → null)", async () => {
    slotFor("equity_plans").single = { data: null, error: null };
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Plan not found" });

    // ownership shape pinned: WHERE id = planId AND user_id = session.id
    const planCall = fromCalls.find((c) => c.table === "equity_plans")!;
    const eqCalls = planCall.ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls).toEqual([
      ["id", "plan-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("returns 400 when neither memberId nor memberName is supplied", async () => {
    planOwned();
    const { memberName: _drop, ...body } = validBody;
    void _drop;
    const res = await POST(postReq(body));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "memberName required when memberId not provided",
    });
    // Only the ownership fetch should have hit Supabase.
    expect(fromCalls.map((c) => c.table)).toEqual(["equity_plans"]);
  });

  it("creates a new member with defaults (email/role/notes nullish-coalesced, shares_issued=0, options_granted=body.shares)", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = {
      data: { id: "sch-1" }, error: null,
    };
    calculateVestingScheduleMock.mockReturnValue([]);
    await POST(postReq({
      planId: "plan-1",
      grantDate: "2026-01-01",
      shares: 25_000,
      vestingMonths: 48,
      cliffMonths: 12,
      memberName: "Ada",
    }));
    const memberInsert = state.insertLog.find((r) => r.table === "equity_members")!;
    expect(memberInsert.rows).toEqual({
      equity_plan_id: "plan-1",
      name: "Ada",
      email: null,
      role: "option_holder",
      share_class: "Ordinary",
      shares_issued: 0,
      options_granted: 25_000,
      join_date: "2026-01-01",
      notes: null,
    });
  });

  it("passes memberEmail / memberRole / notes through unchanged when supplied", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    await POST(postReq({
      ...validBody,
      memberEmail: "ada@x",
      memberRole: "advisor",
      notes: "Signed via portal",
    }));
    const memberInsert = state.insertLog.find((r) => r.table === "equity_members")!;
    expect(memberInsert.rows).toMatchObject({
      email: "ada@x",
      role: "advisor",
      notes: "Signed via portal",
    });
  });

  it("returns 500 when creating the new member fails (error.message surfaces)", async () => {
    planOwned();
    slotFor("equity_members").single = { data: null, error: { message: "unique_violation" } };
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "unique_violation" });
    // Vesting insert must NOT have fired.
    expect(state.insertLog.some((r) => r.table === "equity_vesting_schedules")).toBe(false);
  });

  it("returns 500 with fallback message when member insert returns null with no error", async () => {
    planOwned();
    slotFor("equity_members").single = { data: null, error: null };
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Failed to create member" });
  });

  it("updates an existing member's options_granted (sum with body.shares) when memberId is provided", async () => {
    planOwned();
    slotFor("equity_members").single = {
      data: { id: "m-99", options_granted: 40_000 },
      error: null,
    };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    await POST(postReq({ ...validBody, memberId: "m-99", shares: 60_000 }));
    // Find the equity_members call that performed the update (not the maybeSingle SELECT).
    const memberCalls = fromCalls.filter((c) => c.table === "equity_members");
    const updateCall = memberCalls.find((c) => c.ops.some((o) => o.op === "update"))!;
    const updateOp = updateCall.ops.find((o) => o.op === "update")!;
    expect(updateOp.args[0]).toEqual({ options_granted: 100_000 });
    expect(updateCall.ops.find((o) => o.op === "eq")!.args).toEqual(["id", "m-99"]);
  });

  it("scopes the existing-member lookup by (id, equity_plan_id) so a cross-plan member id is rejected", async () => {
    planOwned();
    // No matching member in this plan.
    slotFor("equity_members").single = { data: null, error: null };
    const res = await POST(postReq({ ...validBody, memberId: "m-other-plan" }));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Member not found in plan" });
    const memberCall = fromCalls.find((c) => c.table === "equity_members")!;
    const eqCalls = memberCall.ops.filter((o) => o.op === "eq").map((o) => o.args);
    expect(eqCalls).toEqual([
      ["id", "m-other-plan"],
      ["equity_plan_id", "plan-1"],
    ]);
    // Vesting insert must NOT have fired.
    expect(state.insertLog.some((r) => r.table === "equity_vesting_schedules")).toBe(false);
  });

  it("treats an existing member with null options_granted as 0 when summing (defensive null-coalesce)", async () => {
    planOwned();
    slotFor("equity_members").single = {
      data: { id: "m-99", options_granted: null },
      error: null,
    };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    await POST(postReq({ ...validBody, memberId: "m-99", shares: 30_000 }));
    const memberCalls = fromCalls.filter((c) => c.table === "equity_members");
    const updateOp = memberCalls.find((c) => c.ops.some((o) => o.op === "update"))!.ops.find((o) => o.op === "update")!;
    expect(updateOp.args[0]).toEqual({ options_granted: 30_000 });
  });

  it("inserts a vesting schedule with defaults (cliff=12, scheduleType='monthly', accelerate_on_exit=false, milestones=[])", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    // Omit cliffMonths + scheduleType — route defaults them.
    await POST(postReq({
      planId: "plan-1",
      grantDate: "2026-01-01",
      shares: 25_000,
      vestingMonths: 48,
      memberName: "Ada",
    }));
    const schedInsert = state.insertLog.find((r) => r.table === "equity_vesting_schedules")!;
    expect(schedInsert.rows).toEqual({
      equity_plan_id: "plan-1",
      member_id: "m-new",
      total_shares: 25_000,
      cliff_months: 12,
      vest_months: 48,
      schedule_type: "monthly",
      start_date: "2026-01-01",
      accelerate_on_exit: false,
      milestones: [],
    });
  });

  it("passes explicit cliffMonths + scheduleType through unchanged", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    await POST(postReq({ ...validBody, cliffMonths: 6, scheduleType: "quarterly" }));
    const schedInsert = state.insertLog.find((r) => r.table === "equity_vesting_schedules")!;
    expect(schedInsert.rows).toMatchObject({
      cliff_months: 6,
      schedule_type: "quarterly",
    });
  });

  it("returns 500 when the vesting-schedule insert fails (error.message surfaces)", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: null, error: { message: "sched boom" } };
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "sched boom" });
    // vesting_events bulk-insert must NOT have fired.
    expect(state.insertLog.some((r) => r.table === "equity_vesting_events")).toBe(false);
  });

  it("returns 500 with fallback message when vesting-schedule insert returns null with no error", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: null, error: null };
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "Failed to create vesting schedule" });
  });

  it("persists computed vesting events into equity_vesting_events and returns timelineEvents = length", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    calculateVestingScheduleMock.mockReturnValue([
      { eventDate: "2027-01-01", sharesVested: 25_000, cumulativeVested: 25_000, isCliff: true },
      { eventDate: "2028-01-01", sharesVested: 25_000, cumulativeVested: 50_000, isCliff: false },
    ]);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    const body = await json(res) as { grant: Record<string, unknown>; vestingTimeline: unknown[]; timelineEvents: number };
    expect(body.timelineEvents).toBe(2);
    expect(body.vestingTimeline).toHaveLength(2);
    expect(body.grant).toEqual({
      memberId: "m-new",
      scheduleId: "sch-1",
      planId: "plan-1",
      grantDate: "2026-01-01",
      shares: 100_000,
      vestingMonths: 48,
      cliffMonths: 12,
      scheduleType: "monthly",
    });
    const eventsInsert = state.insertLog.find((r) => r.table === "equity_vesting_events")!;
    expect(eventsInsert.rows).toEqual([
      { vesting_schedule_id: "sch-1", event_date: "2027-01-01", shares_vested: 25_000, cumulative_vested: 25_000, is_cliff: true },
      { vesting_schedule_id: "sch-1", event_date: "2028-01-01", shares_vested: 25_000, cumulative_vested: 50_000, is_cliff: false },
    ]);
  });

  it("skips the equity_vesting_events insert when the computed timeline is empty", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    calculateVestingScheduleMock.mockReturnValue([]);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    expect(state.insertLog.some((r) => r.table === "equity_vesting_events")).toBe(false);
    const body = await json(res) as { timelineEvents: number };
    expect(body.timelineEvents).toBe(0);
  });

  it("swallows a throwing calculateVestingSchedule — returns 200 with empty timeline, no events insert", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    calculateVestingScheduleMock.mockImplementation(() => { throw new Error("bad input"); });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    const body = await json(res) as { vestingTimeline: unknown[]; timelineEvents: number };
    expect(body.vestingTimeline).toEqual([]);
    expect(body.timelineEvents).toBe(0);
    expect(state.insertLog.some((r) => r.table === "equity_vesting_events")).toBe(false);
  });

  it("defaults cliffMonths → 12 on the RETURNED grant payload when omitted", async () => {
    planOwned();
    slotFor("equity_members").single = { data: { id: "m-new" }, error: null };
    slotFor("equity_vesting_schedules").single = { data: { id: "sch-1" }, error: null };
    const res = await POST(postReq({
      planId: "plan-1",
      grantDate: "2026-01-01",
      shares: 25_000,
      vestingMonths: 48,
      memberName: "Ada",
    }));
    const body = await json(res) as { grant: { cliffMonths: number; scheduleType: string } };
    expect(body.grant.cliffMonths).toBe(12);
    expect(body.grant.scheduleType).toBe("monthly");
  });
});
