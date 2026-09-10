// Route tests for POST /api/evaluations/[id]/report (T0271).
//   * 401 anonymous; 400 bad kind; 403 when the caller does not hold the
//     evaluation or has no evaluator access to its project;
//   * preview (no confirm) returns the cost and runs nothing;
//   * 402 when neither quota nor credits;
//   * spend-after-success ordering: pipeline throws → no evaluation_reports
//     row, no spendCredits; success → row first, then spend (credits) or no
//     spend at all (quota);
//   * re-score runs the cheap path and is billed as trust_report_rescore.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => true }));

const spendCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  spendCredits: (u: string, f: string, m: unknown) => spendCreditsMock(u, f, m),
}));

const getEvaluationForUserMock = vi.fn();
const canAccessMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  getEvaluationForUser: (u: string, id: string) => getEvaluationForUserMock(u, id),
  canAccessProjectAsEvaluator: (u: string, p: string) => canAccessMock(u, p),
}));

const previewMock = vi.fn();
const recordMock = vi.fn();
vi.mock("@/lib/evaluations/report-quota", () => ({
  REPORT_KIND_FEATURE: { full: "trust_report", rescore: "trust_report_rescore" },
  previewReportCharge: (u: unknown, k: string) => previewMock(u, k),
  recordEvaluationReport: (i: unknown) => recordMock(i),
  reportUrlForToken: (t: string | null, base: string) => (t ? `${base}/tbr/${t}` : null),
  pdfUrlForToken: (t: string | null, base: string) => (t ? `${base}/api/svi/report/pdf?token=${t}` : null),
}));

const runFullMock = vi.fn();
const runRescoreMock = vi.fn();
vi.mock("@/lib/report-pipeline/run-for-project", () => ({
  runTrustReportForProject: (a: unknown) => runFullMock(a),
  runRescoreForProject: (a: unknown) => runRescoreMock(a),
}));

import { POST } from "./route";

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
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 2 });
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

  it("pipeline throws → 500, no evaluation_reports row, no spend", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    runFullMock.mockRejectedValue(new Error("orchestrator exploded"));
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("report_failed");
    expect(json.message).toMatch(/Nothing was charged/);
    expect(recordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("quota run: pipeline as the evaluator, row written after success, no credit spend", async () => {
    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(runFullMock).toHaveBeenCalledWith({ projectId: "p-1", requestedByUserId: "u-1", tier: "standard", creditsCost: 0 });
    expect(recordMock).toHaveBeenCalledWith({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "quota",
      creditsCost: 0, reportRef: "rpt-1", shareToken: "tok123", sviTotal: 72,
    });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      ok: true,
      via: "quota",
      credits_spent: 0,
      remaining_quota: 7,
      svi: 72,
      report_url: "https://blockid.au/tbr/tok123",
      pdf_url: "https://blockid.au/api/svi/report/pdf?token=tok123",
      report_id: "r-1",
    });
  });

  it("credits run: spendCredits(trust_report) only AFTER the pipeline + row", async () => {
    previewMock.mockResolvedValue(creditsCost(5));
    const order: string[] = [];
    runFullMock.mockImplementation(async () => { order.push("pipeline"); return { reportId: "rpt-1", snapshotId: "s", shareToken: "tok123", svi: 72 }; });
    recordMock.mockImplementation(async () => { order.push("record"); return { id: "r-1" }; });
    spendCreditsMock.mockImplementation(async () => { order.push("spend"); return { ok: true, balance: 2 }; });

    const res = await POST(post({ kind: "full", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(order).toEqual(["pipeline", "record", "spend"]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "trust_report", {
      evaluation_id: "e-1", project_id: "p-1", report_ref: "rpt-1", kind: "full",
    });
    expect(recordMock.mock.calls[0][0]).toMatchObject({ paidVia: "credits", creditsCost: 3 });
    expect(await res.json()).toMatchObject({ via: "credits", credits_spent: 3, balance: 2, remaining_quota: 0 });
  });

  it("re-score: cheap path, billed as trust_report_rescore (1 credit)", async () => {
    previewMock.mockResolvedValue(creditsCost(4, "rescore"));
    const res = await POST(post({ kind: "rescore", confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(runFullMock).not.toHaveBeenCalled();
    expect(runRescoreMock).toHaveBeenCalledWith({ projectId: "p-1", requestedByUserId: "u-1" });
    expect(recordMock.mock.calls[0][0]).toMatchObject({ kind: "rescore", paidVia: "credits", creditsCost: 1, reportRef: "snap-2", shareToken: "tok456", sviTotal: 74 });
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "trust_report_rescore", expect.objectContaining({ evaluation_id: "e-1" }));
    expect(await res.json()).toMatchObject({ kind: "rescore", via: "credits", credits_spent: 1, svi: 74, report_url: "https://blockid.au/tbr/tok456" });
  });
});
