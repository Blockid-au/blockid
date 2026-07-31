// Colocated vitest for the server-only idea-phase persistence helpers.
//
// The five exported helpers (`persistIdeaEvaluation`, `persistEquitySplit`,
// `persistFundingPlan`, `mintFounderPack`, `hydrateFounderPackBySlug`,
// `logFounderPackView`, `loadDashboardSummary`) each recompute a deterministic
// value from a pure engine and then write / read Supabase rows. The pinned
// contract callers depend on is:
//
//   • row-shape verbatim (columns, snake_case keys, rounded numbers)
//   • not_configured / no_artifacts / db_error branch envelopes
//   • 3-attempt slug retry on the 23505 unique-violation
//   • view-counter bump (null → 1) with best-effort update
//   • dashboard summary maps founders array length → founderCount (0 on non-array)
//
// Uses a per-table fake `SupabaseClient` that records every insert payload,
// update payload, select column list, and eq/order/limit filter, plus a
// mocked nanoid + mocked pure engines so the tests assert the wire contract
// in isolation from the underlying pure logic (each of those has its own
// dedicated colocated vitest suite).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module mocks (must precede the import under test) ──────────────────

vi.mock("nanoid", () => ({
  customAlphabet: (_alphabet: string, _n: number) => () => nanoidQueue.shift() ?? "STATICSLUG12",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));

vi.mock("@/lib/idea-valuation", () => ({
  computeIdeaValuation: (_inputs: unknown) => ({
    berkusBaseAud: 800_000,
    scorecardMultiplier: 1.2,
    lowAud: 623_456.7,
    midAud: 960_123.4,
    highAud: 1_296_789.1,
    factors: [{ name: "team", scoreAud: 200_000 }],
    suggestions: [{ title: "Ship pilot", upliftAud: 100_000, detail: "" }],
    confidence: "medium",
  }),
}));

vi.mock("@/lib/equity-split", () => ({
  computeEquitySplit: (_founders: unknown, _settings: unknown) => ({
    allocations: [{ id: "f1", pct: 60 }, { id: "f2", pct: 40 }],
    reserves: { esopPct: 10, firstHirePct: 2, foundersPct: 88 },
    flags: [{ code: "OK", severity: "info" }],
    vesting: { cliffMonths: 12, totalMonths: 48, note: "std" },
    totalPoints: 200,
  }),
}));

vi.mock("@/lib/funding-plan", () => ({
  computeFundingPlan: (_inputs: unknown) => ({
    monthlyBurnAud: 42_500.7,
    totalNeedAud: 850_123.4,
    recommended: { raiseAud: 750_987.5 },
  }),
}));

// ─── fake Supabase client ────────────────────────────────────────────────

interface Captured {
  from: string | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts?: { ascending: boolean } }>;
  limitCall: number | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
}

interface FakeState {
  adminConfigured: boolean;
  // Per-table responses keyed on the sequence of insert / maybeSingle / single / limit.
  // Each helper returns the shape the underlying supabase-js call would return.
  // Tests overwrite the specific slot they exercise.
  insertSelectSingle: Array<{ data: Record<string, unknown> | null; error: unknown }>;
  insertRaw: Array<{ error: unknown }>;
  updateResults: Array<{ error: unknown }>;
  selectMaybeSingle: Array<{ data: Record<string, unknown> | null; error: unknown }>;
  selectLimit: Array<{ data: Record<string, unknown>[] | null; error: unknown }>;
  captured: Captured[];
}

const nanoidQueue: string[] = [];

function freshCaptured(): Captured {
  return {
    from: null,
    selectCols: null,
    eqCalls: [],
    orderCalls: [],
    limitCall: null,
    insertPayload: null,
    updatePayload: null,
  };
}

const state: FakeState = {
  adminConfigured: true,
  insertSelectSingle: [],
  insertRaw: [],
  updateResults: [],
  selectMaybeSingle: [],
  selectLimit: [],
  captured: [],
};

const adminClient = {
  from(table: string) {
    const cap = freshCaptured();
    cap.from = table;
    state.captured.push(cap);

    const chain: Record<string, unknown> = {};
    chain.eq = (col: string, val: unknown) => {
      cap.eqCalls.push({ col, val });
      return chain;
    };
    chain.order = (col: string, opts?: { ascending: boolean }) => {
      cap.orderCalls.push({ col, opts });
      return chain;
    };
    chain.limit = (n: number) => {
      cap.limitCall = n;
      return Promise.resolve(state.selectLimit.shift() ?? { data: [], error: null });
    };
    chain.maybeSingle = () =>
      Promise.resolve(state.selectMaybeSingle.shift() ?? { data: null, error: null });
    chain.single = () =>
      Promise.resolve(state.insertSelectSingle.shift() ?? { data: null, error: null });

    return {
      select(cols: string) {
        cap.selectCols = cols;
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        cap.insertPayload = payload;
        // The insert-then-await path (no .select()) — dashboard view-log's insert
        // is awaited directly, so return a thenable.
        const p = Promise.resolve(state.insertRaw.shift() ?? { error: null });
        return {
          select(cols: string) {
            cap.selectCols = cols;
            return chain;
          },
          then: p.then.bind(p),
          catch: p.catch.bind(p),
        };
      },
      update(payload: Record<string, unknown>) {
        cap.updatePayload = payload;
        return {
          eq: (col: string, val: unknown) => {
            cap.eqCalls.push({ col, val });
            return Promise.resolve(state.updateResults.shift() ?? { error: null });
          },
        };
      },
    };
  },
};

// ─── module under test ───────────────────────────────────────────────────

import {
  persistIdeaEvaluation,
  persistEquitySplit,
  persistFundingPlan,
  mintFounderPack,
  hydrateFounderPackBySlug,
  logFounderPackView,
  loadDashboardSummary,
} from "./persist";

// ─── setup ───────────────────────────────────────────────────────────────

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.adminConfigured = true;
  state.insertSelectSingle = [];
  state.insertRaw = [];
  state.updateResults = [];
  state.selectMaybeSingle = [];
  state.selectLimit = [];
  state.captured = [];
  nanoidQueue.length = 0;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ─── persistIdeaEvaluation ───────────────────────────────────────────────

describe("persistIdeaEvaluation", () => {
  it("returns not_configured when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await persistIdeaEvaluation({
      userId: "u1",
      inputs: {} as never,
      ideaName: "n",
    });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(state.captured).toHaveLength(0);
  });

  it("returns db_error and logs when the insert errors", async () => {
    state.insertSelectSingle = [{ data: null, error: { message: "boom" } }];
    const res = await persistIdeaEvaluation({
      userId: "u1",
      inputs: {} as never,
      ideaName: "n",
    });
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns db_error when insert returns no data even without an error", async () => {
    state.insertSelectSingle = [{ data: null, error: null }];
    const res = await persistIdeaEvaluation({
      userId: "u1",
      inputs: {} as never,
      ideaName: "n",
    });
    expect(res).toEqual({ ok: false, reason: "db_error" });
  });

  it("stamps the row shape verbatim + rounds low/mid/high + returns the computed output", async () => {
    state.insertSelectSingle = [{ data: { id: "eval-1" }, error: null }];
    const inputs = { tam: 1_000_000 } as unknown as never;
    const res = await persistIdeaEvaluation({
      userId: "u1",
      inputs,
      ideaName: "IdeaX",
    });
    expect(res.ok).toBe(true);
    expect(res.id).toBe("eval-1");
    expect(res.output?.midAud).toBe(960_123.4);
    const cap = state.captured[0];
    expect(cap.from).toBe("idea_evaluations");
    expect(cap.selectCols).toBe("id");
    expect(cap.insertPayload).toEqual({
      user_id: "u1",
      idea_name: "IdeaX",
      inputs,
      valuation_low_aud: 623_457, // Math.round(623_456.7)
      valuation_mid_aud: 960_123, // Math.round(960_123.4)
      valuation_high_aud: 1_296_789, // Math.round(1_296_789.1)
      factors: [{ name: "team", scoreAud: 200_000 }],
      suggestions: [{ title: "Ship pilot", upliftAud: 100_000, detail: "" }],
      confidence_text: "medium",
    });
  });

  it("defaults idea_name to null when ideaName is omitted", async () => {
    state.insertSelectSingle = [{ data: { id: "eval-2" }, error: null }];
    await persistIdeaEvaluation({ userId: "u1", inputs: {} as never });
    expect(state.captured[0].insertPayload?.idea_name).toBeNull();
  });
});

// ─── persistEquitySplit ──────────────────────────────────────────────────

describe("persistEquitySplit", () => {
  it("returns not_configured when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await persistEquitySplit({
      userId: "u1",
      founders: [] as never,
      settings: {} as never,
    });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns db_error on insert failure", async () => {
    state.insertSelectSingle = [{ data: null, error: { message: "boom" } }];
    const res = await persistEquitySplit({
      userId: "u1",
      founders: [] as never,
      settings: {} as never,
    });
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("writes the full row shape including allocations / reserves / flags / vesting / totalPoints", async () => {
    state.insertSelectSingle = [{ data: { id: "split-1" }, error: null }];
    const founders = [{ id: "f1", name: "A" }] as unknown as never;
    const settings = { esopEnabled: true } as unknown as never;
    const res = await persistEquitySplit({ userId: "u1", founders, settings });
    expect(res.ok).toBe(true);
    expect(res.id).toBe("split-1");
    const cap = state.captured[0];
    expect(cap.from).toBe("equity_splits");
    expect(cap.selectCols).toBe("id");
    expect(cap.insertPayload).toEqual({
      user_id: "u1",
      founders,
      settings,
      allocations: [{ id: "f1", pct: 60 }, { id: "f2", pct: 40 }],
      reserves: { esopPct: 10, firstHirePct: 2, foundersPct: 88 },
      flags: [{ code: "OK", severity: "info" }],
      vesting: { cliffMonths: 12, totalMonths: 48, note: "std" },
      total_points: 200,
    });
  });
});

// ─── persistFundingPlan ──────────────────────────────────────────────────

describe("persistFundingPlan", () => {
  it("returns not_configured when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await persistFundingPlan({
      userId: "u1",
      inputs: {} as never,
    });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns db_error on insert failure", async () => {
    state.insertSelectSingle = [{ data: null, error: { message: "boom" } }];
    const res = await persistFundingPlan({
      userId: "u1",
      inputs: {} as never,
    });
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("stamps rounded burn / total-need / recommended-raise and mirrors the full result", async () => {
    state.insertSelectSingle = [{ data: { id: "fund-1" }, error: null }];
    const inputs = { burn: 1 } as unknown as never;
    const res = await persistFundingPlan({ userId: "u1", inputs });
    expect(res.ok).toBe(true);
    expect(res.id).toBe("fund-1");
    const cap = state.captured[0];
    expect(cap.from).toBe("funding_plans");
    expect(cap.selectCols).toBe("id");
    expect(cap.insertPayload).toEqual({
      user_id: "u1",
      inputs,
      result: {
        monthlyBurnAud: 42_500.7,
        totalNeedAud: 850_123.4,
        recommended: { raiseAud: 750_987.5 },
      },
      total_need_aud: 850_123, // Math.round(850_123.4)
      monthly_burn_aud: 42_501, // Math.round(42_500.7)
      recommended_raise: 750_988, // Math.round(750_987.5)
    });
  });
});

// ─── mintFounderPack ─────────────────────────────────────────────────────

describe("mintFounderPack", () => {
  it("returns not_configured when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await mintFounderPack({ userId: "u1", evaluationId: "e1" });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns no_artifacts when all three artifact ids are missing", async () => {
    const res = await mintFounderPack({ userId: "u1" });
    expect(res).toEqual({ ok: false, reason: "no_artifacts" });
    expect(state.captured).toHaveLength(0);
  });

  it("succeeds on the first attempt and echoes the slug + id from the DB", async () => {
    nanoidQueue.push("SLUGONE111111");
    state.insertSelectSingle = [
      { data: { id: "pack-1", slug: "SLUGONE111111" }, error: null },
    ];
    const res = await mintFounderPack({
      userId: "u1",
      evaluationId: "e1",
      splitId: "s1",
      fundingId: "f1",
      ideaName: "Rocket",
    });
    expect(res).toEqual({ ok: true, id: "pack-1", slug: "SLUGONE111111" });
    const cap = state.captured[0];
    expect(cap.from).toBe("founder_packs");
    expect(cap.selectCols).toBe("id, slug");
    expect(cap.insertPayload).toEqual({
      user_id: "u1",
      slug: "SLUGONE111111",
      idea_name: "Rocket",
      evaluation_id: "e1",
      split_id: "s1",
      funding_id: "f1",
    });
  });

  it("retries after a 23505 unique-violation and succeeds on the second attempt", async () => {
    nanoidQueue.push("COLLIDE111111", "FRESHSLUG222");
    state.insertSelectSingle = [
      { data: null, error: { code: "23505", message: "dup" } },
      { data: { id: "pack-2", slug: "FRESHSLUG222" }, error: null },
    ];
    const res = await mintFounderPack({ userId: "u1", evaluationId: "e1" });
    expect(res).toEqual({ ok: true, id: "pack-2", slug: "FRESHSLUG222" });
    expect(state.captured).toHaveLength(2);
    // The retry did NOT log an error to console — 23505 is expected + benign.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("bails on the first non-23505 error and logs to console", async () => {
    nanoidQueue.push("SLUGX11111111");
    state.insertSelectSingle = [
      { data: null, error: { code: "42P01", message: "no table" } },
    ];
    const res = await mintFounderPack({ userId: "u1", evaluationId: "e1" });
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(state.captured).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns db_error after three consecutive 23505 collisions", async () => {
    nanoidQueue.push("A", "B", "C");
    state.insertSelectSingle = [
      { data: null, error: { code: "23505" } },
      { data: null, error: { code: "23505" } },
      { data: null, error: { code: "23505" } },
    ];
    const res = await mintFounderPack({ userId: "u1", splitId: "s1" });
    expect(res).toEqual({ ok: false, reason: "db_error" });
    expect(state.captured).toHaveLength(3);
  });
});

// ─── hydrateFounderPackBySlug ────────────────────────────────────────────

describe("hydrateFounderPackBySlug", () => {
  it("returns null when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await hydrateFounderPackBySlug("abc");
    expect(res).toBeNull();
  });

  it("returns null and logs when the founder_packs read errors", async () => {
    state.selectMaybeSingle = [{ data: null, error: { message: "boom" } }];
    const res = await hydrateFounderPackBySlug("abc");
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns null when no pack row matches the slug", async () => {
    state.selectMaybeSingle = [{ data: null, error: null }];
    const res = await hydrateFounderPackBySlug("abc");
    expect(res).toBeNull();
    // Only one query fired (the initial founder_packs select) — the parallel
    // joins are gated behind a truthy pack row.
    expect(state.captured).toHaveLength(1);
  });

  it("hydrates all four joined tables into the canonical HydratedFounderPack envelope", async () => {
    state.selectMaybeSingle = [
      // 1. founder_packs.select(*).eq('slug').maybeSingle()
      {
        data: {
          id: "pack-1",
          slug: "SLUGONE111111",
          idea_name: "Rocket",
          created_at: "2026-07-30T00:00:00Z",
          view_count: 5,
          last_viewed_at: "2026-07-30T12:00:00Z",
          user_id: "u1",
          evaluation_id: "eval-1",
          split_id: "split-1",
          funding_id: "fund-1",
        },
        error: null,
      },
      // 2. idea_evaluations
      {
        data: {
          id: "eval-1",
          idea_name: "Rocket",
          inputs: { tam: 1 },
          valuation_low_aud: 100,
          valuation_mid_aud: 200,
          valuation_high_aud: 300,
          factors: [{ n: "t" }],
          suggestions: [{ t: "x" }],
          confidence_text: "med",
          ai_narrative: "narr",
          ai_strengths: ["a"],
          ai_risks: ["b"],
          created_at: "2026-07-30T01:00:00Z",
        },
        error: null,
      },
      // 3. equity_splits
      {
        data: {
          id: "split-1",
          founders: [{ id: "f1" }],
          settings: { esopEnabled: true },
          allocations: [{ id: "f1", pct: 100 }],
          reserves: { esopPct: 10, firstHirePct: 2, foundersPct: 88 },
          flags: [],
          vesting: { cliffMonths: 12, totalMonths: 48, note: "std" },
          total_points: 100,
          fairness_narrative: "fair",
          created_at: "2026-07-30T02:00:00Z",
        },
        error: null,
      },
      // 4. funding_plans
      {
        data: {
          id: "fund-1",
          inputs: { burn: 1 },
          result: { monthlyBurnAud: 1000 },
          total_need_aud: 500_000,
          monthly_burn_aud: 20_000,
          recommended_raise: 400_000,
          created_at: "2026-07-30T03:00:00Z",
        },
        error: null,
      },
      // 5. app_users
      {
        data: { email: "founder@example.com", display_name: "Founder One" },
        error: null,
      },
    ];
    const res = await hydrateFounderPackBySlug("SLUGONE111111");
    expect(res).not.toBeNull();
    expect(res!.id).toBe("pack-1");
    expect(res!.slug).toBe("SLUGONE111111");
    expect(res!.ideaName).toBe("Rocket");
    expect(res!.viewCount).toBe(5);
    expect(res!.lastViewedAt).toBe("2026-07-30T12:00:00Z");
    expect(res!.user).toEqual({ email: "founder@example.com", displayName: "Founder One" });
    expect(res!.evaluation).toMatchObject({
      id: "eval-1",
      valuationLowAud: 100,
      valuationMidAud: 200,
      valuationHighAud: 300,
      confidenceText: "med",
      aiNarrative: "narr",
      aiStrengths: ["a"],
      aiRisks: ["b"],
    });
    expect(res!.split).toMatchObject({
      id: "split-1",
      totalPoints: 100,
      fairnessNarrative: "fair",
      reserves: { esopPct: 10, firstHirePct: 2, foundersPct: 88 },
    });
    expect(res!.funding).toMatchObject({
      id: "fund-1",
      totalNeedAud: 500_000,
      monthlyBurnAud: 20_000,
      recommendedRaise: 400_000,
    });
  });

  it("skips the joined-table selects when the pack row has null artifact ids", async () => {
    state.selectMaybeSingle = [
      {
        data: {
          id: "pack-2",
          slug: "onlyuser1234",
          idea_name: null,
          created_at: "2026-07-30T00:00:00Z",
          view_count: 0,
          last_viewed_at: null,
          user_id: "u2",
          evaluation_id: null,
          split_id: null,
          funding_id: null,
        },
        error: null,
      },
      // Only one more maybeSingle is consumed — the app_users select.
      { data: { email: "u2@example.com", display_name: null }, error: null },
    ];
    const res = await hydrateFounderPackBySlug("onlyuser1234");
    expect(res).not.toBeNull();
    expect(res!.evaluation).toBeNull();
    expect(res!.split).toBeNull();
    expect(res!.funding).toBeNull();
    expect(res!.user).toEqual({ email: "u2@example.com", displayName: null });
    // Two DB round-trips only — founder_packs + app_users.
    const tables = state.captured.map((c) => c.from);
    expect(tables).toEqual(["founder_packs", "app_users"]);
  });

  it("falls back to empty-string email + null displayName when the app_users row is missing", async () => {
    state.selectMaybeSingle = [
      {
        data: {
          id: "pack-3",
          slug: "orphaned11111",
          idea_name: null,
          created_at: "2026-07-30T00:00:00Z",
          view_count: 0,
          last_viewed_at: null,
          user_id: "ghost",
          evaluation_id: null,
          split_id: null,
          funding_id: null,
        },
        error: null,
      },
      { data: null, error: null }, // app_users missing
    ];
    const res = await hydrateFounderPackBySlug("orphaned11111");
    expect(res!.user).toEqual({ email: "", displayName: null });
  });
});

// ─── logFounderPackView ──────────────────────────────────────────────────

describe("logFounderPackView", () => {
  it("returns null when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await logFounderPackView({ packId: "p1" });
    expect(res).toBeNull();
  });

  it("returns null and logs when the view insert fails", async () => {
    state.insertRaw = [{ error: { message: "boom" } }];
    const res = await logFounderPackView({ packId: "p1" });
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    // Only the failed insert fired — no counter read, no update.
    expect(state.captured).toHaveLength(1);
    expect(state.captured[0].from).toBe("founder_pack_views");
  });

  it("stamps the view row + bumps view_count from existing value → +1 and returns the new count", async () => {
    state.insertRaw = [{ error: null }];
    state.selectMaybeSingle = [{ data: { view_count: 7 }, error: null }];
    state.updateResults = [{ error: null }];
    const res = await logFounderPackView({
      packId: "p1",
      ipHash: "abc",
      userAgent: "ua",
      referer: "ref",
    });
    expect(res).toBe(8);
    const viewInsert = state.captured[0];
    expect(viewInsert.from).toBe("founder_pack_views");
    expect(viewInsert.insertPayload).toEqual({
      pack_id: "p1",
      viewer_ip_hash: "abc",
      viewer_ua: "ua",
      referer: "ref",
    });
    // Second capture = counter read; third = counter update.
    const counterRead = state.captured[1];
    expect(counterRead.from).toBe("founder_packs");
    expect(counterRead.selectCols).toBe("view_count");
    const counterUpdate = state.captured[2];
    expect(counterUpdate.from).toBe("founder_packs");
    expect(counterUpdate.updatePayload).toMatchObject({ view_count: 8 });
    expect(typeof counterUpdate.updatePayload?.last_viewed_at).toBe("string");
    expect(counterUpdate.eqCalls).toEqual([{ col: "id", val: "p1" }]);
  });

  it("treats a missing pack row (null counter) as 0 → returns 1 on the first ever view", async () => {
    state.insertRaw = [{ error: null }];
    state.selectMaybeSingle = [{ data: null, error: null }];
    state.updateResults = [{ error: null }];
    const res = await logFounderPackView({ packId: "p1" });
    expect(res).toBe(1);
    // Null-coalesce path — insert row still stamps the three optional viewer fields as null.
    expect(state.captured[0].insertPayload).toEqual({
      pack_id: "p1",
      viewer_ip_hash: null,
      viewer_ua: null,
      referer: null,
    });
  });
});

// ─── loadDashboardSummary ────────────────────────────────────────────────

describe("loadDashboardSummary", () => {
  it("returns empty arrays for all four buckets when the admin client is null", async () => {
    state.adminConfigured = false;
    const res = await loadDashboardSummary("u1");
    expect(res).toEqual({ packs: [], evaluations: [], splits: [], fundingPlans: [] });
  });

  it("aggregates all four tables + maps snake_case → camelCase + preserves nulls", async () => {
    state.selectLimit = [
      // packs
      { data: [
        { id: "pk1", slug: "sl1", idea_name: "R", view_count: 3, created_at: "t1" },
      ], error: null },
      // idea_evaluations
      { data: [
        { id: "ev1", idea_name: "R", valuation_mid_aud: 950_000, created_at: "t2" },
      ], error: null },
      // equity_splits — mixed shape: one with 3 founders array, one with a non-array founders (→ founderCount 0)
      { data: [
        { id: "sp1", founders: [{ id: "f1" }, { id: "f2" }, { id: "f3" }], created_at: "t3" },
        { id: "sp2", founders: "not-an-array", created_at: "t4" },
      ], error: null },
      // funding_plans — pin the null passthrough on total_need_aud + recommended_raise
      { data: [
        { id: "fp1", total_need_aud: null, recommended_raise: null, created_at: "t5" },
        { id: "fp2", total_need_aud: 500_000, recommended_raise: 400_000, created_at: "t6" },
      ], error: null },
    ];
    const res = await loadDashboardSummary("u1");
    expect(res.packs).toEqual([
      { id: "pk1", slug: "sl1", ideaName: "R", viewCount: 3, createdAt: "t1" },
    ]);
    expect(res.evaluations).toEqual([
      { id: "ev1", ideaName: "R", valuationMidAud: 950_000, createdAt: "t2" },
    ]);
    expect(res.splits).toEqual([
      { id: "sp1", founderCount: 3, createdAt: "t3" },
      { id: "sp2", founderCount: 0, createdAt: "t4" }, // non-array → 0
    ]);
    expect(res.fundingPlans).toEqual([
      { id: "fp1", totalNeedAud: null, recommendedRaise: null, createdAt: "t5" },
      { id: "fp2", totalNeedAud: 500_000, recommendedRaise: 400_000, createdAt: "t6" },
    ]);

    // Every one of the 4 selects scopes on user_id + orders by created_at DESC + limit 20.
    const tables = state.captured.map((c) => c.from);
    expect(tables).toEqual(["founder_packs", "idea_evaluations", "equity_splits", "funding_plans"]);
    for (const cap of state.captured) {
      expect(cap.eqCalls).toEqual([{ col: "user_id", val: "u1" }]);
      expect(cap.orderCalls).toEqual([{ col: "created_at", opts: { ascending: false } }]);
      expect(cap.limitCall).toBe(20);
    }
  });

  it("returns empty arrays per bucket when Supabase returns null data on each select", async () => {
    state.selectLimit = [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];
    const res = await loadDashboardSummary("u1");
    expect(res).toEqual({ packs: [], evaluations: [], splits: [], fundingPlans: [] });
  });
});
