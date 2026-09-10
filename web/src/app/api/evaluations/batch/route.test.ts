// Route tests for GET/POST /api/evaluations/batch (T0272). Pins:
//   1. Anonymous → 401.
//   2. Scout / Firm (no lp_export / accelerator.cohort) → 403 feature_locked
//      with the Program upgrade hint + recordGateHit(..., "lp_export", "api").
//   3. POST invalid JSON / empty ids / > BATCH_MAX_ITEMS → 400.
//   4. Ids the caller does not hold → 400 with unknown_ids; nothing created.
//   5. Quota all-or-nothing: remaining − pending < n → 402 quota_insufficient,
//      nothing created; unlimited plans always pass.
//   6. Happy path → 201 { batch_id, queued, quota_left } and createBatch gets
//      the deduped ids, the trimmed name and normalised weights.
//   7. GET lists the caller's batches.
//   8. S7-C: a still-trialing subscription may batch at most the 1 included
//      trial report → 402 trial_limit + upgrade hint beyond it.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getEntitlementsMock = vi.fn();
const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id),
  recordGateHit: (u: unknown, f: string, s: string) => recordGateHitMock(u, f, s),
}));

const getReportQuotaMock = vi.fn();
vi.mock("@/lib/evaluations/report-quota", () => ({ getReportQuota: (u: unknown) => getReportQuotaMock(u) }));

const countPendingMock = vi.fn();
const createBatchMock = vi.fn();
const listBatchesMock = vi.fn();
const ownedMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  countPendingBatchItems: (id: string) => countPendingMock(id),
  createBatch: (i: unknown) => createBatchMock(i),
  listBatches: (id: string) => listBatchesMock(id),
  ownedEvaluationIds: (id: string, ids: string[]) => ownedMock(id, ids),
}));

import { GET, POST, dynamic } from "./route";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Pat" };
const PROGRAM_FLAGS = ["investor.dealflow", "portfolio", "api.access", "lp_export", "lp_report", "money_radar"];
const SCOUT_FLAGS = ["investor.dealflow", "watchlist", "money_radar"];
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4", rubricWeights: {}, status: "queued", total: 2, doneCount: 0, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };

function post(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/evaluations/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(PROGRAM_FLAGS);
  getReportQuotaMock.mockResolvedValue({ limit: 100, used: 10, remaining: 90, unlimited: false });
  countPendingMock.mockResolvedValue(0);
  ownedMock.mockImplementation(async (_id: string, ids: string[]) => new Set(ids));
  createBatchMock.mockResolvedValue({ ok: true, batch: BATCH });
  listBatchesMock.mockResolvedValue([BATCH]);
});

describe("/api/evaluations/batch", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ evaluation_ids: ["e-1"] }))).status).toBe(401);
    expect(createBatchMock).not.toHaveBeenCalled();
  });

  it("403s Scout / Firm with the Program upgrade hint and records the gate hit", async () => {
    getEntitlementsMock.mockResolvedValue(SCOUT_FLAGS);
    const res = await POST(post({ evaluation_ids: ["e-1"] }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("feature_locked");
    expect(json.feature).toBe("lp_export");
    expect(json.message).toMatch(/Program/);
    expect(json.upgrade_url).toBe("/pricing?segment=evaluator");
    expect(recordGateHitMock).toHaveBeenCalledWith({ id: "u-1", plan: "investor_vc_small", segment: "investor" }, "lp_export", "api");
    expect(createBatchMock).not.toHaveBeenCalled();
    expect((await GET()).status).toBe(403);
  });

  it("400s bad bodies", async () => {
    expect((await POST(post("{nope", true))).status).toBe(400);
    expect((await POST(post({ evaluation_ids: [] }))).status).toBe(400);
    expect((await POST(post({ name: "x" }))).status).toBe(400);
    expect((await POST(post({ evaluation_ids: Array.from({ length: 201 }, (_, i) => `e-${i}`) }))).status).toBe(400);
    expect(createBatchMock).not.toHaveBeenCalled();
  });

  it("400s when an id is not one of the caller's evaluations", async () => {
    ownedMock.mockResolvedValue(new Set(["e-1"]));
    const res = await POST(post({ evaluation_ids: ["e-1", "e-x"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).unknown_ids).toEqual(["e-x"]);
    expect(createBatchMock).not.toHaveBeenCalled();
  });

  it("402s all-or-nothing when the batch does not fit the remaining quota net of pending items", async () => {
    getReportQuotaMock.mockResolvedValue({ limit: 100, used: 95, remaining: 5, unlimited: false });
    countPendingMock.mockResolvedValue(3);
    const res = await POST(post({ evaluation_ids: ["e-1", "e-2", "e-3"] }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe("quota_insufficient");
    expect(json.needed).toBe(3);
    expect(json.available).toBe(2);
    expect(json.quota.pending).toBe(3);
    expect(json.message).toMatch(/3 already queued/);
    expect(createBatchMock).not.toHaveBeenCalled();

    // Exactly fits → passes.
    countPendingMock.mockResolvedValue(2);
    expect((await POST(post({ evaluation_ids: ["e-1", "e-2", "e-3"] }))).status).toBe(201);
  });

  it("S7-C: during the trial a batch may only use the 1 included report — 402 trial_limit with the upgrade hint beyond it", async () => {
    const trial = { active: true, ends_at: "2026-09-17T00:00:00.000Z", started_at: "2026-09-10T00:00:00.000Z", allowance: 1, used: 0, plan_id: "investor_vc_small" };
    getReportQuotaMock.mockResolvedValue({ limit: 1, used: 0, remaining: 1, unlimited: false, configured: true, trial });
    const res = await POST(post({ evaluation_ids: ["e-1", "e-2"] }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe("trial_limit");
    expect(json).toMatchObject({ needed: 2, available: 1, upgrade_url: "/pricing?segment=evaluator", trial: { active: true, allowance: 1 } });
    expect(json.message).toMatch(/Your trial includes 1 Trust BizReport; this batch needs 2 and 1 remains\. Score 1 now or upgrade — Batch scoring is included in Program/);
    expect(createBatchMock).not.toHaveBeenCalled();

    // Exactly the included one → queued, nothing left.
    const ok = await POST(post({ evaluation_ids: ["e-1"] }));
    expect(ok.status).toBe(201);
    expect((await ok.json()).quota_left).toBe(0);

    // Included one already used → trial_limit, not the monthly-reset wording.
    getReportQuotaMock.mockResolvedValue({ limit: 1, used: 1, remaining: 0, unlimited: false, configured: true, trial: { ...trial, used: 1 } });
    const spent = await POST(post({ evaluation_ids: ["e-1"] }));
    expect(spent.status).toBe(402);
    const spentJson = await spent.json();
    expect(spentJson.error).toBe("trial_limit");
    expect(spentJson.message).toMatch(/once your trial converts/);
    expect(spentJson.message).not.toMatch(/monthly reset/);

    // Converted (trial.active=false) → the ordinary plan quota path.
    getReportQuotaMock.mockResolvedValue({ limit: 100, used: 0, remaining: 100, unlimited: false, configured: true, trial: { ...trial, active: false } });
    expect((await POST(post({ evaluation_ids: ["e-1", "e-2"] }))).status).toBe(201);
  });

  it("#14: a plan with no usage_limits.reports_per_month (accelerator_* Contact-Sales) gets 402 quota_not_configured + Contact sales, not a generic quota error", async () => {
    getReportQuotaMock.mockResolvedValue({ limit: 0, used: 0, remaining: 0, unlimited: false, configured: false });
    const res = await POST(post({ evaluation_ids: ["e-1"] }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "quota_not_configured", hint: "Contact sales" });
    expect(createBatchMock).not.toHaveBeenCalled();

    // A configured 0 is still the ordinary quota_insufficient path.
    getReportQuotaMock.mockResolvedValue({ limit: 0, used: 0, remaining: 0, unlimited: false, configured: true });
    expect((await (await POST(post({ evaluation_ids: ["e-1"] }))).json()).error).toBe("quota_insufficient");
  });

  it("unlimited plans never hit the quota check", async () => {
    getReportQuotaMock.mockResolvedValue({ limit: Number.MAX_SAFE_INTEGER, used: 0, remaining: Number.MAX_SAFE_INTEGER, unlimited: true });
    countPendingMock.mockResolvedValue(999);
    const res = await POST(post({ evaluation_ids: ["e-1", "e-2"] }));
    expect(res.status).toBe(201);
    expect((await res.json()).quota_left).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("201s with the insert shape: deduped ids, trimmed name, normalised weights", async () => {
    const res = await POST(post({ evaluation_ids: ["e-1", "e-2", "e-1", " ", 5], name: "  Cohort 4  ", rubric_weights: { ftv: 3, mpc: 1, bogus: 9 } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, batch_id: "b-1", queued: 2, quota_left: 88 });
    expect(json.batch.id).toBe("b-1");
    expect(createBatchMock).toHaveBeenCalledTimes(1);
    const input = createBatchMock.mock.calls[0][0];
    expect(input.userId).toBe("u-1");
    expect(input.name).toBe("Cohort 4");
    expect(input.evaluationIds).toEqual(["e-1", "e-2"]);
    expect(input.rubricWeights.ftv).toBe(75);
    expect(input.rubricWeights.mpc).toBe(25);
    expect(input.rubricWeights.bogus).toBeUndefined();
    expect(ownedMock).toHaveBeenCalledWith("u-1", ["e-1", "e-2"]);
  });

  it("defaults the name and surfaces createBatch failures", async () => {
    createBatchMock.mockResolvedValue({ ok: false, error: "create_failed", message: "nope" });
    const res = await POST(post({ evaluation_ids: ["e-1"] }));
    expect(res.status).toBe(500);
    expect(createBatchMock.mock.calls[0][0].name).toMatch(/^Batch \d{4}-\d{2}-\d{2}$/);
    createBatchMock.mockResolvedValue({ ok: false, error: "service_unavailable", message: "db" });
    expect((await POST(post({ evaluation_ids: ["e-1"] }))).status).toBe(503);
  });

  it("GET lists the caller's batches", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).batches).toEqual([BATCH]);
    expect(listBatchesMock).toHaveBeenCalledWith("u-1");
  });
});
