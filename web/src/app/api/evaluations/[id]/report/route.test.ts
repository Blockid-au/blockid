// Route tests for POST /api/evaluations/[id]/report (T0271).
//   * 401 anonymous; 400 bad kind; 403 when the caller does not hold the
//     evaluation or has no evaluator access to its project;
//   * preview (no confirm) returns the cost and runs nothing;
//   * 402 when neither quota nor credits;
//   * money-path review #1 (P0): credits are spent BEFORE the pipeline; a
//     failed spend → 402, nothing runs, no share token; a pipeline throw
//     after a successful spend → grantCredits refund + 500; quota runs
//     never touch credits and write the row only after success;
//   * review #9: an existing evaluation_reports row for the idempotency key
//     (or one < 10 min old for the same evaluation+kind) is returned with
//     reused:true — no run, no spend; GET polls the same lookup;
//   * re-score runs the cheap path and is billed as trust_report_rescore.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => true }));

const spendCreditsMock = vi.fn();
const grantCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  spendCredits: (u: string, f: string, m: unknown) => spendCreditsMock(u, f, m),
  grantCredits: (u: string, a: number, r: string, m: unknown) => grantCreditsMock(u, a, r, m),
}));

const getEvaluationForUserMock = vi.fn();
const canAccessMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  getEvaluationForUser: (u: string, id: string) => getEvaluationForUserMock(u, id),
  canAccessProjectAsEvaluator: (u: string, p: string) => canAccessMock(u, p),
}));

const previewMock = vi.fn();
const recordMock = vi.fn();
const findRecentMock = vi.fn();
vi.mock("@/lib/evaluations/report-quota", () => ({
  REPORT_KIND_FEATURE: { full: "trust_report", rescore: "trust_report_rescore" },
  previewReportCharge: (u: unknown, k: string) => previewMock(u, k),
  recordEvaluationReport: (i: unknown) => recordMock(i),
  findRecentEvaluationReport: (i: unknown) => findRecentMock(i),
  normaliseIdempotencyKey: (raw: unknown) =>
    typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw.toLowerCase() : null,
  reportUrlForToken: (t: string | null, base: string) => (t ? `${base}/tbr/${t}` : null),
  pdfUrlForToken: (t: string | null, base: string) => (t ? `${base}/api/svi/report/pdf?token=${t}` : null),
}));

const runFullMock = vi.fn();
const runRescoreMock = vi.fn();
vi.mock("@/lib/report-pipeline/run-for-project", () => ({
  runTrustReportForProject: (a: unknown) => runFullMock(a),
  runRescoreForProject: (a: unknown) => runRescoreMock(a),
}));

// S20-B — outbound webhook emitter (enqueue only).
const enqueueMock = vi.fn(async () => ({ queued: 1, endpoints: ["ep"], envelopeId: "evt" }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => enqueueMock(...(a as [])) }));

import { GET, POST } from "./route";

const KEY = "0b7f3f2e-9c1a-4c6e-8e5d-2f0a1b2c3d4e";

const USER = { id: "u-1", email: "scout@fund.vc", plan: "investor_angel" };
const EVAL = { id: "e-1", projectId: "p-1", evaluatorUserId: "u-1" };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/api/evaluations/e-1/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const quotaCost = (used: number) => ({
  kind: "full",
  via: "quota",
  credits: 0,
  list_credits: 3,
  balance: 0,
  quota: { limit: 10, used, remaining: 10 - used, unlimited: false },
  remaining_quota: 10 - used - 1,
});
const creditsCost = (balance: number, kind = "full") => ({
  kind,
  via: "credits",
  credits: kind === "full" ? 3 : 1,
  list_credits: kind === "full" ? 3 : 1,
  balance,
  quota: { limit: 10, used: 10, remaining: 0, unlimited: false },
  remaining_quota: 0,
});
const noneCost = () => ({ ...creditsCost(0), via: "none" });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  getCurrentUserMock.mockResolvedValue(USER);
  getEvaluationForUserMock.mockResolvedValue(EVAL);
  canAccessMock.mockResolvedValue({ allowed: true, via: "evaluator", evaluation: EVAL });
  previewMock.mockResolvedValue(quotaCost(2));
  recordMock.mockResolvedValue({ id: "r-1" });
  findRecentMock.mockResolvedValue(null);
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 2 });
  grantCreditsMock.mockResolvedValue({ ok: true, balance: 5 });
  runFullMock.mockResolvedValue({ kind: "full", reportId: "rpt-1", snapshotId: "snap-1", shareToken: "tok123", svi: 72, stage: 3 });
  runRescoreMock.mockResolvedValue({ kind: "rescore", snapshotId: "snap-2", shareToken: "tok456", analysisId: "a-2", svi: 74, delta: 2, stage: 3 });
});

describe("POST /api/evaluations/[id]/report", () => {
  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ kind: "full" }), ctx())).status).toBe(401);
  });

  it("400s an unknown kind and bad JSON", async () => {
    expect((await POST(post({ kind: "premium" }), ctx())).status).toBe(400);
    const bad = new Request("http://localhost/x", { method: "POST", body: "{" });
    expect((await POST(bad, ctx())).status).toBe(400);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("403s when the caller does not hold the evaluation", async () => {
    getEvaluationForUserMock.mockResolvedValue(null);
    const res = await POST(post({ kind: "full", confirm: true }), ctx("e-other"));
    expect(res.status).toBe(403);
    expect(getEvaluationForUserMock).toHaveBeenCalledWith("u-1", "e-other");
    expect(runFullMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("403s when evaluator access to the project is gone", async () => {
    canAccessMock.mockResolvedValue({ allowed: false });
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(403);
    expect(canAccessMock).toHaveBeenCalledWith("u-1", "p-1");
    expect(runFullMock).not.toHaveBeenCalled();
  });

  it("returns the cost preview without running or charging when confirm is absent", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    const res = await POST(post({ kind: "full" }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      preview: true,
      kind: "full",
      cost: { via: "credits", credits: 3, list_credits: 3, balance: 5, remaining_quota: 0, quota: { limit: 10, used: 10, remaining: 0 } },
    });
    expect(previewMock).toHaveBeenCalledWith(USER, "full");
    expect(runFullMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("S7-C: the preview and the run carry cost.trial through from the quota (null when the quota has none)", async () => {
    const trial = { active: true, ends_at: "2026-09-17T00:00:00.000Z", started_at: "2026-09-10T00:00:00.000Z", allowance: 1, used: 0, plan_id: "investor_angel" };
    previewMock.mockResolvedValue({ ...quotaCost(0), quota: { limit: 1, used: 0, remaining: 1, unlimited: false, trial }, remaining_quota: 0 });
    let json = await (await POST(post({ kind: "full" }), ctx())).json();
    expect(json.cost).toMatchObject({ via: "quota", remaining_quota: 0, quota: { limit: 1, remaining: 1 }, trial: { active: true, allowance: 1, used: 0 } });

    json = await (await POST(post({ kind: "full", confirm: true }), ctx())).json();
    expect(json).toMatchObject({ ok: true, via: "quota", credits_spent: 0, remaining_quota: 0, trial: { active: true, allowance: 1 } });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ paidVia: "quota", creditsCost: 0 }));

    previewMock.mockResolvedValue(creditsCost(5));
    json = await (await POST(post({ kind: "full" }), ctx())).json();
    expect(json.cost.trial).toBeNull();
  });

  it("402s when neither quota nor credits cover the run", async () => {
    previewMock.mockResolvedValue(noneCost());
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe("insufficient_credits");
    expect(json.cost.via).toBe("none");
    expect(runFullMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("S8-C: GET responses are private/no-store (cross-site refusal moved to the S9-A proxy gate — src/proxy.test.ts)", async () => {
    findRecentMock.mockResolvedValue(null);
    const g = await GET(new Request("http://localhost/api/evaluations/e-1/report?kind=full"), ctx());
    expect(g.status).toBe(200);
    expect(g.headers.get("cache-control")).toBe("private, no-store");
  });

  it("S8-C: the raw pipeline error is not echoed in production", async () => {
    const orig = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      runFullMock.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.9:11434"));
      const res = await POST(post({ kind: "full", confirm: true }), ctx());
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.detail).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain("10.0.0.9");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = orig ?? "test";
    }
  });

  it("quota run: pipeline throws → 500, no evaluation_reports row, credits never touched", async () => {
    runFullMock.mockRejectedValue(new Error("orchestrator exploded"));
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("report_failed");
    expect(json.detail).toBe("orchestrator exploded"); // non-production keeps the detail
    expect(json.message).toMatch(/Nothing was charged/);
    expect(recordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("#1: credits run — pipeline throws AFTER the spend → grantCredits refund of the same amount, 500, no row, no share token", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    runFullMock.mockRejectedValue(new Error("orchestrator exploded"));
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 3, "refund:trust_report", expect.objectContaining({ evaluation_id: "e-1", reason: "pipeline_failed" }));
    expect(json).toMatchObject({ error: "report_failed", refunded: true, credits_refunded: 3, balance: 5 });
    expect(json.message).toMatch(/refunded/);
    expect(json.share_token).toBeUndefined();
    expect(json.report_url).toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("#1: credits run — spendCredits fails (balance moved) → 402 insufficient_credits, pipeline never runs, no row, no share token", async () => {
    previewMock.mockResolvedValue(creditsCost(3));
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0 });
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "insufficient_credits", credits_needed: 3 });
    expect(json.share_token).toBeUndefined();
    expect(json.report_url).toBeUndefined();
    expect(runFullMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("quota run: pipeline as the evaluator, row written after success, no credit spend", async () => {
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(runFullMock).toHaveBeenCalledWith({ projectId: "p-1", requestedByUserId: "u-1", tier: "standard", creditsCost: 0 });
    expect(recordMock).toHaveBeenCalledWith({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "quota",
      creditsCost: 0, reportRef: "rpt-1", shareToken: "tok123", sviTotal: 72, idempotencyKey: null,
    });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      ok: true,
      reused: false,
      via: "quota",
      credits_spent: 0,
      remaining_quota: 7,
      svi: 72,
      report_url: "https://blockid.au/tbr/tok123",
      pdf_url: "https://blockid.au/api/svi/report/pdf?token=tok123",
      report_id: "r-1",
    });
  });

  it("S20-B: a successful run enqueues evaluation.report_ready to the EVALUATOR only (no project endpoints, no share token); a failed run never does", async () => {
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [event, projectId, payload, opts] = enqueueMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>, Record<string, unknown>];
    expect(event).toBe("evaluation.report_ready");
    expect(projectId).toBe("p-1");
    expect(payload).toEqual({ evaluation_id: "e-1", project_id: "p-1", report_id: "r-1", kind: "full", svi_total: 72, via: "quota" });
    expect(JSON.stringify(payload)).not.toContain("tok123");
    expect(opts).toEqual({ userIds: ["u-1"], projectEndpoints: false });

    enqueueMock.mockClear();
    runFullMock.mockRejectedValue(new Error("orchestrator exploded"));
    expect((await POST(post({ kind: "full", confirm: true }), ctx())).status).toBe(500);
    expect(enqueueMock).not.toHaveBeenCalled();
    // A reused row (idempotent replay) does not re-fire either.
    findRecentMock.mockResolvedValue({ id: "r-1", kind: "full", paidVia: "quota", creditsCost: 0, reportRef: "rpt-1", shareToken: "tok123", sviTotal: 72, createdAt: "2026-09-12T00:00:00.000Z" });
    runFullMock.mockResolvedValue({ kind: "full", reportId: "rpt-1", snapshotId: "snap-1", shareToken: "tok123", svi: 72, stage: 3 });
    const replay = await POST(post({ kind: "full", confirm: true, idempotency_key: KEY }), ctx());
    expect((await replay.json()).reused).toBe(true);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("#1: credits run — spendCredits(trust_report) BEFORE the pipeline, row after success, no refund", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    const order: string[] = [];
    runFullMock.mockImplementation(async () => { order.push("pipeline"); return { reportId: "rpt-1", snapshotId: "s", shareToken: "tok123", svi: 72 }; });
    recordMock.mockImplementation(async () => { order.push("record"); return { id: "r-1" }; });
    spendCreditsMock.mockImplementation(async () => { order.push("spend"); return { ok: true, balance: 2 }; });

    const res = await POST(post({ kind: "full", confirm: true, idempotency_key: KEY }), ctx());
    expect(res.status).toBe(200);
    expect(order).toEqual(["spend", "pipeline", "record"]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "trust_report", {
      evaluation_id: "e-1", project_id: "p-1", kind: "full", idempotency_key: KEY,
    });
    expect(grantCreditsMock).not.toHaveBeenCalled();
    expect(recordMock.mock.calls[0][0]).toMatchObject({ paidVia: "credits", creditsCost: 3, idempotencyKey: KEY });
    expect(await res.json()).toMatchObject({ via: "credits", credits_spent: 3, balance: 2, remaining_quota: 0, reused: false });
  });

  it("#9: an existing row for the idempotency key is returned as reused — no run, no spend, no new row", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    findRecentMock.mockResolvedValue({
      id: "r-9", evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "credits", creditsCost: 3,
      reportRef: "rpt-9", shareToken: "tok999", sviTotal: 68, createdAt: "2026-09-10T10:00:00Z", idempotencyKey: KEY,
    });
    const res = await POST(post({ kind: "full", confirm: true, idempotency_key: KEY.toUpperCase() }), ctx());
    expect(res.status).toBe(200);
    expect(findRecentMock).toHaveBeenCalledWith({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY });
    expect(runFullMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      ok: true, reused: true, via: "credits", credits_spent: 0, svi: 68, report_id: "r-9",
      report_url: "https://blockid.au/tbr/tok999", share_token: "tok999", created_at: "2026-09-10T10:00:00Z",
    });
  });

  it("#9: a non-uuid key is ignored (lookup by the 10-min window only); preview never consults the lookup", async () => {
    await POST(post({ kind: "full", confirm: true, idempotency_key: "not-a-uuid" }), ctx());
    expect(findRecentMock).toHaveBeenCalledWith({ evaluationId: "e-1", kind: "full", idempotencyKey: null });
    expect(recordMock.mock.calls[0][0]).toMatchObject({ idempotencyKey: null });
    findRecentMock.mockClear();
    await POST(post({ kind: "full" }), ctx());
    expect(findRecentMock).not.toHaveBeenCalled();
  });

  it("#9: GET ?kind=&idempotency_key= polls the same lookup — null while running, the row once written", async () => {
    const get = (q: string) => GET(new Request(`http://localhost/api/evaluations/e-1/report${q}`), ctx());
    expect((await get("")).status).toBe(400);
    let json = await (await get(`?kind=full&idempotency_key=${KEY}`)).json();
    expect(json).toEqual({ ok: true, report: null });
    expect(findRecentMock).toHaveBeenCalledWith({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY });

    findRecentMock.mockResolvedValue({
      id: "r-9", evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "quota", creditsCost: 0,
      reportRef: "rpt-9", shareToken: "tok999", sviTotal: 68, createdAt: "2026-09-10T10:00:00Z", idempotencyKey: KEY,
    });
    json = await (await get(`?kind=full&idempotency_key=${KEY}&since=2026-09-10T09:59:00Z`)).json();
    expect(json.report).toMatchObject({ reused: true, via: "quota", svi: 68, report_url: "https://blockid.au/tbr/tok999" });
    expect(findRecentMock).toHaveBeenLastCalledWith(expect.objectContaining({ evaluationId: "e-1", kind: "full", idempotencyKey: KEY, windowMs: expect.any(Number) }));

    getEvaluationForUserMock.mockResolvedValue(null);
    expect((await get(`?kind=full`)).status).toBe(403);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await get(`?kind=full`)).status).toBe(401);
  });

  it("re-score: cheap path, billed as trust_report_rescore (1 credit)", async () => {
    previewMock.mockResolvedValue(creditsCost(4, "rescore"));
    const res = await POST(post({ kind: "rescore", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(runFullMock).not.toHaveBeenCalled();
    expect(runRescoreMock).toHaveBeenCalledWith({ projectId: "p-1", requestedByUserId: "u-1" });
    expect(recordMock.mock.calls[0][0]).toMatchObject({ kind: "rescore", paidVia: "credits", creditsCost: 1, reportRef: "snap-2", shareToken: "tok456", sviTotal: 74 });
    expect(spendCreditsMock.mock.invocationCallOrder[0]).toBeLessThan(runRescoreMock.mock.invocationCallOrder[0]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "trust_report_rescore", expect.objectContaining({ evaluation_id: "e-1" }));
    expect(await res.json()).toMatchObject({ kind: "rescore", via: "credits", credits_spent: 1, svi: 74, report_url: "https://blockid.au/tbr/tok456" });
  });
});
