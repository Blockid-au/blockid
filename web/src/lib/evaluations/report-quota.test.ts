import { beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for lib/evaluations/report-quota.ts (T0271). Pins:
//   * quota = plans.usage_limits.reports_per_month minus paid_via='quota'
//     rows this UTC calendar month (Scout 10 → after 10 uses, credits);
//   * unlimited sentinels (-1 / ≥9999) never fall through to credits;
//   * re-score never consumes the quota — always trust_report_rescore;
//   * `none` when neither quota nor credits remain (route turns it into 402);
//   * recordEvaluationReport writes the row that IS the quota decrement;
//   * listLastEvaluationReports keeps only the newest row per evaluation;
//   * review #8: previewReportCharge subtracts queued batch items; #9: the
//     idempotency lookup / key on insert (42703 fallback); #14: configured flag;
//   * S7-C: while subscription_trial_state.status='trialing' (trial_end in the
//     future) the quota is TRIAL_REPORT_ALLOWANCE = 1 for the whole trial,
//     counted since trial_start; 1 used → credits, never a block; status
//     'active' or an expired trial_end → the plan quota again.

interface Captured {
  table: string;
  op: "select" | "insert" | null;
  payload: unknown;
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; val: unknown }>;
  gte: Array<{ col: string; val: unknown }>;
  lt: Array<{ col: string; val: unknown }>;
  selectOpts: Record<string, unknown> | null;
  selectCols: string | null;
}

const state = {
  queue: [] as Array<{ table: string; data?: unknown; error?: unknown; count?: number | null }>,
  calls: [] as Captured[],
};

function nextResponse(table: string) {
  const idx = state.queue.findIndex((q) => q.table === table);
  if (idx === -1) return { data: null, error: null, count: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null, count: q.count ?? null };
}

function makeBuilder(table: string) {
  const c: Captured = { table, op: null, payload: null, eqs: [], ins: [], gte: [], lt: [], selectOpts: null, selectCols: null };
  state.calls.push(c);
  const resolve = () => Promise.resolve(nextResponse(table));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select(cols: string, opts?: Record<string, unknown>) {
      if (c.op === null) c.op = "select";
      c.selectOpts = opts ?? null;
      c.selectCols = cols;
      return b;
    },
    insert(payload: unknown) { c.op = "insert"; c.payload = payload; return b; },
    eq(col: string, val: unknown) { c.eqs.push({ col, val }); return b; },
    in(col: string, val: unknown) { c.ins.push({ col, val }); return b; },
    gte(col: string, val: unknown) { c.gte.push({ col, val }); return b; },
    lt(col: string, val: unknown) { c.lt.push({ col, val }); return b; },
    order() { return b; },
    limit() { return b; },
    single() { return resolve(); },
    maybeSingle() { return resolve(); },
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) { return resolve().then(onOk, onErr); },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (t: string) => makeBuilder(t) }),
}));

const getPlanCachedMock = vi.fn<(id: string) => Promise<{ usage_limits: Record<string, number> } | null>>();
vi.mock("@/lib/plans-db", () => ({ getPlanCached: (id: string) => getPlanCachedMock(id) }));

const getBalanceMock = vi.fn<(id: string) => Promise<number>>(async () => 0);
vi.mock("@/lib/credits", () => ({
  FEATURE_COSTS: { trust_report: 3, trust_report_rescore: 1 },
  getBalance: (id: string) => getBalanceMock(id),
}));

import {
  NO_TRIAL,
  TRIAL_REPORT_ALLOWANCE,
  buildQuota,
  buildTrialQuota,
  countPendingBatchItems,
  countTrialReportsUsed,
  getTrialState,
  trialFromState,
  findRecentEvaluationReport,
  getReportQuota,
  listLastEvaluationReports,
  monthWindow,
  normaliseIdempotencyKey,
  previewReportCharge,
  recordEvaluationReport,
  reportLimitFromUsageLimits,
  reportLimitIsConfigured,
  resolveReportCharge,
  REPORT_KIND_FEATURE,
  REPORT_REUSE_WINDOW_MS,
} from "./report-quota";

const SCOUT = { id: "u-1", plan: "investor_angel" };

beforeEach(() => {
  state.queue = [];
  state.calls = [];
  getPlanCachedMock.mockReset();
  getBalanceMock.mockReset();
  getBalanceMock.mockResolvedValue(0);
  getPlanCachedMock.mockResolvedValue({ usage_limits: { reports_per_month: 10, profiles: 25 } });
});

describe("pure helpers", () => {
  it("monthWindow is the UTC calendar month", () => {
    const w = monthWindow(new Date("2026-09-10T23:59:00Z"));
    expect(w.start).toBe("2026-09-01T00:00:00.000Z");
    expect(w.end).toBe("2026-10-01T00:00:00.000Z");
  });

  it("reportLimitFromUsageLimits reads reports_per_month with unlimited sentinels", () => {
    expect(reportLimitFromUsageLimits({ reports_per_month: 10 })).toBe(10);
    expect(reportLimitFromUsageLimits({ reports_per_month: "30" })).toBe(30);
    expect(reportLimitFromUsageLimits({ reports_per_month: -1 })).toBe(Number.MAX_SAFE_INTEGER);
    expect(reportLimitFromUsageLimits({ reports_per_month: 9999 })).toBe(Number.MAX_SAFE_INTEGER);
    expect(reportLimitFromUsageLimits({ profiles: 3 })).toBe(0);
    expect(reportLimitFromUsageLimits(null)).toBe(0);
  });

  it("resolveReportCharge: Scout 10 → quota until 10 used, then 3 credits", () => {
    for (let used = 0; used < 10; used++) {
      const c = resolveReportCharge("full", buildQuota(10, used), 0);
      expect(c.via).toBe("quota");
      expect(c.credits).toBe(0);
      expect(c.remaining_quota).toBe(10 - used - 1);
    }
    const exhausted = resolveReportCharge("full", buildQuota(10, 10), 5);
    expect(exhausted).toMatchObject({ via: "credits", credits: 3, list_credits: 3, remaining_quota: 0 });
    const broke = resolveReportCharge("full", buildQuota(10, 10), 2.5);
    expect(broke.via).toBe("none");
    expect(broke.credits).toBe(3);
  });

  it("resolveReportCharge: unlimited plans never fall through to credits", () => {
    const c = resolveReportCharge("full", buildQuota(Number.MAX_SAFE_INTEGER, 5000), 0);
    expect(c.via).toBe("quota");
    expect(c.remaining_quota).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("resolveReportCharge: re-score never uses the quota — 1 credit or none", () => {
    expect(resolveReportCharge("rescore", buildQuota(10, 0), 1)).toMatchObject({ via: "credits", credits: 1, remaining_quota: 10 });
    expect(resolveReportCharge("rescore", buildQuota(10, 0), 0.5).via).toBe("none");
    expect(REPORT_KIND_FEATURE.rescore).toBe("trust_report_rescore");
    expect(REPORT_KIND_FEATURE.full).toBe("trust_report");
  });

  it("free / founder plans (no reports_per_month) go straight to credits", () => {
    const c = resolveReportCharge("full", buildQuota(0, 0), 3);
    expect(c).toMatchObject({ via: "credits", credits: 3, remaining_quota: 0 });
  });
});

describe("getReportQuota", () => {
  it("counts paid_via=quota rows for the user inside the month window", async () => {
    state.queue.push({ table: "evaluation_reports", count: 4 });
    const q = await getReportQuota(SCOUT, new Date("2026-09-10T10:00:00Z"));
    expect(q).toEqual({ limit: 10, used: 4, remaining: 6, unlimited: false, configured: true, trial: NO_TRIAL });
    // The trial lookup always runs first (no row → not trialing).
    expect(state.calls[0]).toMatchObject({ table: "subscription_trial_state", eqs: [{ col: "user_id", val: "u-1" }] });
    const call = state.calls.find((c) => c.table === "evaluation_reports")!;
    expect(call.selectOpts).toMatchObject({ count: "exact", head: true });
    expect(call.eqs).toEqual([
      { col: "user_id", val: "u-1" },
      { col: "paid_via", val: "quota" },
    ]);
    expect(call.gte).toEqual([{ col: "created_at", val: "2026-09-01T00:00:00.000Z" }]);
    expect(call.lt).toEqual([{ col: "created_at", val: "2026-10-01T00:00:00.000Z" }]);
    expect(getPlanCachedMock).toHaveBeenCalledWith("investor_angel");
  });

  it("treats a missing table (42P01) as nothing used", async () => {
    state.queue.push({ table: "evaluation_reports", error: { code: "42P01" } });
    const q = await getReportQuota(SCOUT);
    expect(q.used).toBe(0);
    expect(q.remaining).toBe(10);
  });

  it("previewReportCharge: 10 used + balance 3 → credits; balance 0 → none", async () => {
    state.queue.push({ table: "evaluation_reports", count: 10 });
    getBalanceMock.mockResolvedValue(3);
    const c = await previewReportCharge(SCOUT, "full");
    expect(c).toMatchObject({ via: "credits", credits: 3, balance: 3, remaining_quota: 0 });

    state.queue.push({ table: "evaluation_reports", count: 10 });
    getBalanceMock.mockResolvedValue(0);
    const none = await previewReportCharge(SCOUT, "full");
    expect(none.via).toBe("none");
  });

  it("#8 previewReportCharge subtracts items queued in the user's batches (reserved quota)", async () => {
    // 6 used of 10, but 4 items still queued in a live batch → 0 available → credits.
    state.queue.push({ table: "evaluation_reports", count: 6 });
    state.queue.push({ table: "evaluation_batches", data: [{ id: "b-1" }] });
    state.queue.push({ table: "evaluation_batch_items", count: 4 });
    getBalanceMock.mockResolvedValue(5);
    const c = await previewReportCharge(SCOUT, "full");
    expect(c.via).toBe("credits");
    expect(c.quota).toMatchObject({ limit: 10, used: 10, remaining: 0 });
    const items = state.calls.find((x) => x.table === "evaluation_batch_items")!;
    expect(items.ins).toEqual([
      { col: "batch_id", val: ["b-1"] },
      { col: "status", val: ["queued", "running"] },
    ]);

    // 3 queued → 1 slot left → quota, and remaining_quota reports 0 after this run.
    state.queue.push({ table: "evaluation_reports", count: 6 });
    state.queue.push({ table: "evaluation_batches", data: [{ id: "b-1" }] });
    state.queue.push({ table: "evaluation_batch_items", count: 3 });
    const q = await previewReportCharge(SCOUT, "full");
    expect(q).toMatchObject({ via: "quota", remaining_quota: 0 });

    // No live batch → nothing reserved.
    state.queue.push({ table: "evaluation_reports", count: 6 });
    state.queue.push({ table: "evaluation_batches", data: [] });
    expect((await previewReportCharge(SCOUT, "full")).remaining_quota).toBe(3);
    expect(await countPendingBatchItems("u-1")).toBe(0);
  });

  it("#14 configured=false when the plan has no reports_per_month at all (a configured 0 stays configured)", async () => {
    expect(reportLimitIsConfigured({ reports_per_month: 0 })).toBe(true);
    expect(reportLimitIsConfigured({ reports_per_month: "30" })).toBe(true);
    expect(reportLimitIsConfigured({ profiles: 3 })).toBe(false);
    expect(reportLimitIsConfigured(null)).toBe(false);
    getPlanCachedMock.mockResolvedValue({ usage_limits: { profiles: 200 } });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    const q = await getReportQuota({ id: "u-acc", plan: "accelerator_starter" });
    expect(q).toMatchObject({ limit: 0, remaining: 0, unlimited: false, configured: false });
    expect(buildQuota(10, 0).configured).toBe(true);
  });
});

describe("S7-C trial allowance", () => {
  const NOW = new Date("2026-09-10T10:00:00Z");
  const TRIALING = { status: "trialing", trial_start: "2026-09-08T00:00:00Z", trial_end: "2026-09-15T00:00:00Z", plan_id: "investor_angel" };

  it("trialFromState: active only while status=trialing and trial_end is in the future", () => {
    expect(TRIAL_REPORT_ALLOWANCE).toBe(1);
    expect(trialFromState(TRIALING, NOW, 0)).toEqual({
      active: true, ends_at: "2026-09-15T00:00:00.000Z", started_at: "2026-09-08T00:00:00.000Z", allowance: 1, used: 0, plan_id: "investor_angel",
    });
    expect(trialFromState({ ...TRIALING, status: "active" }, NOW, 1)).toMatchObject({ active: false, used: 0 });
    expect(trialFromState({ ...TRIALING, trial_end: "2026-09-09T00:00:00Z" }, NOW).active).toBe(false);
    expect(trialFromState({ ...TRIALING, status: "canceled" }, NOW).active).toBe(false);
    expect(trialFromState(null, NOW)).toBe(NO_TRIAL);
    expect(buildTrialQuota({ ...NO_TRIAL, active: true, used: 1 })).toMatchObject({ limit: 1, used: 1, remaining: 0, unlimited: false, configured: true });
  });

  it("trialing + 0 used → 1 included for the whole trial, counted since trial_start, plan quota not consulted", async () => {
    state.queue.push({ table: "subscription_trial_state", data: TRIALING });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    const q = await getReportQuota(SCOUT, NOW);
    expect(q).toMatchObject({ limit: 1, used: 0, remaining: 1, unlimited: false, configured: true, trial: { active: true, allowance: 1, used: 0, ends_at: "2026-09-15T00:00:00.000Z" } });
    expect(getPlanCachedMock).not.toHaveBeenCalled();
    const count = state.calls.find((c) => c.table === "evaluation_reports")!;
    expect(count.eqs).toEqual([{ col: "user_id", val: "u-1" }, { col: "paid_via", val: "quota" }]);
    expect(count.gte).toEqual([{ col: "created_at", val: "2026-09-08T00:00:00.000Z" }]);
    expect(count.lt).toEqual([]); // whole trial, not the calendar month

    state.queue.push({ table: "subscription_trial_state", data: TRIALING });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    getBalanceMock.mockResolvedValue(0);
    const c = await previewReportCharge(SCOUT, "full");
    expect(c).toMatchObject({ via: "quota", credits: 0, remaining_quota: 0 });
    expect(c.quota.trial?.active).toBe(true);
  });

  it("trialing + 1 used → credits (3) with balance, `none` without — never a block on the trial itself", async () => {
    state.queue.push({ table: "subscription_trial_state", data: TRIALING });
    state.queue.push({ table: "evaluation_reports", count: 1 });
    getBalanceMock.mockResolvedValue(3);
    const c = await previewReportCharge(SCOUT, "full");
    expect(c).toMatchObject({ via: "credits", credits: 3, balance: 3, remaining_quota: 0 });
    expect(c.quota).toMatchObject({ limit: 1, used: 1, remaining: 0, trial: { active: true, used: 1 } });

    state.queue.push({ table: "subscription_trial_state", data: TRIALING });
    state.queue.push({ table: "evaluation_reports", count: 1 });
    getBalanceMock.mockResolvedValue(0);
    expect((await previewReportCharge(SCOUT, "full")).via).toBe("none");

    // A queued batch item reserves the single trial slot too (review #8).
    state.queue.push({ table: "subscription_trial_state", data: TRIALING });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    state.queue.push({ table: "evaluation_batches", data: [{ id: "b-1" }] });
    state.queue.push({ table: "evaluation_batch_items", count: 1 });
    getBalanceMock.mockResolvedValue(3);
    expect((await previewReportCharge(SCOUT, "full")).via).toBe("credits");
  });

  it("status=active (converted) → the plan's reports_per_month this month; trial.active=false", async () => {
    state.queue.push({ table: "subscription_trial_state", data: { ...TRIALING, status: "active" } });
    state.queue.push({ table: "evaluation_reports", count: 2 });
    const q = await getReportQuota(SCOUT, NOW);
    expect(q).toMatchObject({ limit: 10, used: 2, remaining: 8, trial: { active: false, used: 0, ends_at: "2026-09-15T00:00:00.000Z" } });
    expect(getPlanCachedMock).toHaveBeenCalledWith("investor_angel");
    const count = state.calls.find((c) => c.table === "evaluation_reports")!;
    expect(count.gte).toEqual([{ col: "created_at", val: "2026-09-01T00:00:00.000Z" }]);
    expect(count.lt).toEqual([{ col: "created_at", val: "2026-10-01T00:00:00.000Z" }]);
  });

  it("trial ended (trial_end in the past, status still trialing) → plan quota; a free plan → 0 included", async () => {
    state.queue.push({ table: "subscription_trial_state", data: { ...TRIALING, trial_end: "2026-09-09T00:00:00Z" } });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    expect(await getReportQuota(SCOUT, NOW)).toMatchObject({ limit: 10, remaining: 10, trial: { active: false } });

    getPlanCachedMock.mockResolvedValue({ usage_limits: { profiles: 1 } });
    state.queue.push({ table: "subscription_trial_state", data: { ...TRIALING, status: "canceled" } });
    state.queue.push({ table: "evaluation_reports", count: 0 });
    getBalanceMock.mockResolvedValue(3);
    const c = await previewReportCharge({ id: "u-1", plan: "free" }, "full");
    expect(c).toMatchObject({ via: "credits", credits: 3 });
    expect(c.quota).toMatchObject({ limit: 0, trial: { active: false } });
  });

  it("getTrialState / countTrialReportsUsed degrade to not-trialing / 0 on lookup errors", async () => {
    state.queue.push({ table: "subscription_trial_state", error: { code: "42P01" } });
    expect(await getTrialState("u-1", NOW)).toBe(NO_TRIAL);
    state.queue.push({ table: "evaluation_reports", error: { code: "42P01" } });
    expect(await countTrialReportsUsed("u-1", { started_at: "2026-09-08T00:00:00Z" })).toBe(0);
    const count = state.calls.find((c) => c.table === "evaluation_reports")!;
    expect(count.gte).toEqual([{ col: "created_at", val: "2026-09-08T00:00:00Z" }]);
  });

  it("countTrialReportsUsed infers the window from trial_end when trial_start is unknown (never fails open)", async () => {
    // Stripe can omit trial_start. Counting all-time would show "1/1 used" to
    // a re-trialling evaluator; counting nothing would hand out unlimited
    // free reports — so the window is trial_end − 7 days.
    state.queue.push({ table: "evaluation_reports", count: 1 });
    expect(await countTrialReportsUsed("u-1", { started_at: null, ends_at: "2026-09-17T00:00:00.000Z" })).toBe(1);
    const count = state.calls.find((c) => c.table === "evaluation_reports")!;
    expect(count.gte).toEqual([{ col: "created_at", val: "2026-09-10T00:00:00.000Z" }]);
  });

  it("countTrialReportsUsed returns 0 without touching the DB when neither trial_start nor trial_end is known", async () => {
    expect(await countTrialReportsUsed("u-1", { started_at: null, ends_at: null })).toBe(0);
    expect(state.calls.find((c) => c.table === "evaluation_reports")).toBeUndefined();
  });
});

describe("#9 idempotent reuse", () => {
  const ROW = {
    id: "r-1", evaluation_id: "e-1", project_id: "p-1", user_id: "u-1", kind: "full", paid_via: "credits",
    credits_cost: 3, report_ref: "rpt-1", share_token: "tok", svi_total: 72, created_at: "2026-09-10T10:00:00Z", idempotency_key: "0b7f3f2e-9c1a-4c6e-8e5d-2f0a1b2c3d4e",
  };

  it("normaliseIdempotencyKey accepts only uuids (lower-cased)", () => {
    expect(normaliseIdempotencyKey("0B7F3F2E-9C1A-4C6E-8E5D-2F0A1B2C3D4E")).toBe("0b7f3f2e-9c1a-4c6e-8e5d-2f0a1b2c3d4e");
    expect(normaliseIdempotencyKey("nope")).toBeNull();
    expect(normaliseIdempotencyKey(42)).toBeNull();
    expect(REPORT_REUSE_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it("findRecentEvaluationReport: by key first, then the newest row inside the 10-min window; null otherwise", async () => {
    state.queue.push({ table: "evaluation_reports", data: ROW });
    const byKey = await findRecentEvaluationReport({ evaluationId: "e-1", kind: "full", idempotencyKey: ROW.idempotency_key });
    expect(byKey).toMatchObject({ id: "r-1", idempotencyKey: ROW.idempotency_key, shareToken: "tok" });
    expect(state.calls[0].eqs).toEqual([
      { col: "evaluation_id", val: "e-1" },
      { col: "kind", val: "full" },
      { col: "idempotency_key", val: ROW.idempotency_key },
    ]);

    // No key match (column missing pre-0325) → falls through to the window.
    state.calls = [];
    state.queue.push({ table: "evaluation_reports", error: { code: "42703" } });
    state.queue.push({ table: "evaluation_reports", data: { ...ROW, idempotency_key: null } });
    const now = new Date("2026-09-10T10:05:00Z");
    const byWindow = await findRecentEvaluationReport({ evaluationId: "e-1", kind: "full", idempotencyKey: ROW.idempotency_key, now });
    expect(byWindow?.id).toBe("r-1");
    expect(state.calls[1].gte).toEqual([{ col: "created_at", val: "2026-09-10T09:55:00.000Z" }]);
    expect(state.calls[1].selectCols).not.toContain("idempotency_key");

    state.calls = [];
    state.queue.push({ table: "evaluation_reports", data: null });
    expect(await findRecentEvaluationReport({ evaluationId: "e-1", kind: "full" })).toBeNull();
    expect(state.calls).toHaveLength(1); // no key → window lookup only
  });

  it("recordEvaluationReport stores the key, and retries without it when 0325 is not applied (42703)", async () => {
    state.queue.push({ table: "evaluation_reports", data: ROW });
    const row = await recordEvaluationReport({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "credits",
      creditsCost: 3, reportRef: "rpt-1", shareToken: "tok", sviTotal: 72, idempotencyKey: ROW.idempotency_key,
    });
    expect(row?.idempotencyKey).toBe(ROW.idempotency_key);
    expect((state.calls[0].payload as Record<string, unknown>).idempotency_key).toBe(ROW.idempotency_key);

    state.calls = [];
    state.queue.push({ table: "evaluation_reports", error: { code: "42703", message: "column idempotency_key does not exist" } });
    state.queue.push({ table: "evaluation_reports", data: { ...ROW, idempotency_key: undefined } });
    const fallback = await recordEvaluationReport({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "credits",
      creditsCost: 3, reportRef: "rpt-1", shareToken: "tok", sviTotal: 72, idempotencyKey: ROW.idempotency_key,
    });
    expect(fallback?.id).toBe("r-1");
    expect(state.calls).toHaveLength(2);
    expect((state.calls[1].payload as Record<string, unknown>).idempotency_key).toBeUndefined();
  });
});

describe("writes + reads", () => {
  it("recordEvaluationReport inserts the row that is the quota decrement", async () => {
    state.queue.push({
      table: "evaluation_reports",
      data: {
        id: "r-1", evaluation_id: "e-1", project_id: "p-1", user_id: "u-1", kind: "full", paid_via: "quota",
        credits_cost: 0, report_ref: "rpt-1", share_token: "tok", svi_total: 72, created_at: "2026-09-10T00:00:00Z",
      },
    });
    const row = await recordEvaluationReport({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "quota",
      creditsCost: 0, reportRef: "rpt-1", shareToken: "tok", sviTotal: 72,
    });
    expect(row).toMatchObject({ id: "r-1", kind: "full", paidVia: "quota", creditsCost: 0, shareToken: "tok", sviTotal: 72 });
    const ins = state.calls.find((c) => c.table === "evaluation_reports" && c.op === "insert")!;
    expect(ins.payload).toEqual({
      evaluation_id: "e-1", project_id: "p-1", user_id: "u-1", kind: "full", paid_via: "quota",
      credits_cost: 0, report_ref: "rpt-1", share_token: "tok", svi_total: 72,
    });
  });

  it("listLastEvaluationReports keeps the newest row per evaluation with tbr/pdf urls", async () => {
    state.queue.push({
      table: "evaluation_reports",
      data: [
        { id: "r-3", evaluation_id: "e-1", project_id: "p-1", user_id: "u-1", kind: "rescore", paid_via: "credits", credits_cost: 1, report_ref: "snap-2", share_token: "tok-new", svi_total: 75, created_at: "2026-09-10T00:00:00Z" },
        { id: "r-2", evaluation_id: "e-1", project_id: "p-1", user_id: "u-1", kind: "full", paid_via: "quota", credits_cost: 0, report_ref: "rpt-1", share_token: "tok-old", svi_total: 72, created_at: "2026-09-09T00:00:00Z" },
        { id: "r-1", evaluation_id: "e-2", project_id: "p-2", user_id: "u-1", kind: "full", paid_via: "quota", credits_cost: 0, report_ref: "rpt-0", share_token: null, svi_total: null, created_at: "2026-09-01T00:00:00Z" },
      ],
    });
    const out = await listLastEvaluationReports("u-1");
    expect(Object.keys(out).sort()).toEqual(["e-1", "e-2"]);
    expect(out["e-1"]).toMatchObject({ kind: "rescore", sviTotal: 75, reportUrl: "/tbr/tok-new", pdfUrl: "/api/svi/report/pdf?token=tok-new" });
    expect(out["e-2"]).toMatchObject({ kind: "full", sviTotal: null, reportUrl: null, pdfUrl: null });
  });
});
