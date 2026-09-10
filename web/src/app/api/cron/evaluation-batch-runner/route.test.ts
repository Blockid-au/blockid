// Colocated vitest for /api/cron/evaluation-batch-runner (T0272). Pins:
// Bearer CRON_SECRET gate (401 unset / mismatched), 503 without Supabase,
// idle when no batch is queued, `?dry=1` → claims nothing / runs nothing and
// lists the items the next tick would take, N = 5 items per tick, the live
// path (running → runTrustReportForProject → dimension scores from the
// snapshot → done + evaluation_reports quota row), a thrown item marked
// failed (error kept, NOTHING recorded) while the loop continues, the batch
// closing → one weekly_next_step notification "Batch '{name}' scored: d/t",
// not closing while items remain, 503 ai_unavailable, and POST === GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  supabaseAvailable: true,
  aiConfigured: true,
  claimMock: vi.fn(),
  nextItemsMock: vi.fn(),
  markMock: vi.fn(),
  scoresMock: vi.fn(),
  finaliseMock: vi.fn(),
  runMock: vi.fn(),
  recordMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.supabaseAvailable ? { from: () => ({}) } : null) }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => h.aiConfigured }));
vi.mock("@/lib/notifications", () => ({ insertNotification: (a: unknown) => h.notifyMock(a) }));
vi.mock("@/lib/evaluations/report-quota", () => ({ recordEvaluationReport: (a: unknown) => h.recordMock(a) }));
vi.mock("@/lib/report-pipeline/run-for-project", () => ({ runTrustReportForProject: (a: unknown) => h.runMock(a) }));
vi.mock("@/lib/evaluations/batch", () => ({
  claimNextBatch: (dry: boolean) => h.claimMock(dry),
  nextQueuedItems: (id: string, n: number) => h.nextItemsMock(id, n),
  markItem: (id: number, patch: unknown) => h.markMock(id, patch),
  loadSnapshotDimensionScores: (id: string | null) => h.scoresMock(id),
  finaliseBatch: (id: string) => h.finaliseMock(id),
}));

import { GET, POST, batchNotificationPayload, dynamic, maxDuration } from "./route";

const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4", rubricWeights: {}, status: "running", total: 3, doneCount: 0, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: "2026-09-10T12:00:00Z", finishedAt: null };
function item(id: number, evaluationId: string, projectId: string | null = `p-${id}`) {
  return { id, batchId: "b-1", evaluationId, status: "queued", reportId: null, snapshotId: null, shareToken: null, sviTotal: null, dimensionScores: null, error: null, scoredAt: null, projectId, projectName: `Startup ${id}` };
}

function req(query = "", auth: string | null = "Bearer test-secret"): Request {
  return new Request(`http://localhost/api/cron/evaluation-batch-runner${query}`, {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  h.supabaseAvailable = true;
  h.aiConfigured = true;
  h.claimMock.mockResolvedValue(BATCH);
  h.nextItemsMock.mockResolvedValue([item(1, "e-1"), item(2, "e-2")]);
  h.markMock.mockResolvedValue(undefined);
  h.scoresMock.mockResolvedValue({ ftv: { score: 80, priority: "low" }, tre: { score: 40, priority: "high" } });
  h.runMock.mockImplementation(async ({ projectId }: { projectId: string }) => ({
    kind: "full", reportId: `r-${projectId}`, snapshotId: `s-${projectId}`, shareToken: `tok-${projectId}`, svi: 71, stage: 3, wordCount: 5000, qualityScore: 80, synthesisedAnalysis: false,
  }));
  h.recordMock.mockResolvedValue({ id: "er-1" });
  h.finaliseMock.mockResolvedValue({ batch: { ...BATCH, status: "running", doneCount: 2 }, closed: false });
  h.notifyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("/api/cron/evaluation-batch-runner", () => {
  it("exports the cron route config", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });

  it("401s without the bearer secret (unset or mismatched)", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer wrong"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req())).status).toBe(401);
    expect(h.claimMock).not.toHaveBeenCalled();
  });

  it("503s without Supabase", async () => {
    h.supabaseAvailable = false;
    expect((await GET(req())).status).toBe(503);
  });

  it("is idle when nothing is queued", async () => {
    h.claimMock.mockResolvedValue(null);
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ ok: true, batch: null, reason: "idle" });
    expect(h.nextItemsMock).not.toHaveBeenCalled();
  });

  it("?dry=1 claims nothing, runs nothing, and lists what the next tick would take", async () => {
    const json = await (await GET(req("?dry=1"))).json();
    expect(h.claimMock).toHaveBeenCalledWith(true);
    expect(h.nextItemsMock).toHaveBeenCalledWith("b-1", 5);
    expect(json.dryRun).toBe(true);
    expect(json.items.map((i: { outcome: string }) => i.outcome)).toEqual(["would_run", "would_run"]);
    expect(json.items[0]).toMatchObject({ item_id: 1, evaluation_id: "e-1", project_id: "p-1", startup: "Startup 1" });
    expect(h.runMock).not.toHaveBeenCalled();
    expect(h.markMock).not.toHaveBeenCalled();
    expect(h.finaliseMock).not.toHaveBeenCalled();
    expect(h.notifyMock).not.toHaveBeenCalled();
  });

  it("503s ai_unavailable and leaves the batch running when no provider is configured", async () => {
    h.aiConfigured = false;
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("ai_unavailable");
    expect(h.runMock).not.toHaveBeenCalled();
    expect(h.markMock).not.toHaveBeenCalled();
  });

  it("scores up to 5 items per tick: running → pipeline → snapshot scores → done + quota row", async () => {
    const json = await (await GET(req())).json();
    expect(h.claimMock).toHaveBeenCalledWith(false);
    expect(h.nextItemsMock).toHaveBeenCalledWith("b-1", 5);
    expect(h.runMock).toHaveBeenCalledTimes(2);
    expect(h.runMock).toHaveBeenCalledWith({ projectId: "p-1", requestedByUserId: "u-1", tier: "standard", creditsCost: 0 });
    // running mark, then done mark with the refs of the run + flattened scores.
    expect(h.markMock).toHaveBeenNthCalledWith(1, 1, { status: "running" });
    expect(h.markMock).toHaveBeenNthCalledWith(2, 1, {
      status: "done", reportId: "r-p-1", snapshotId: "s-p-1", shareToken: "tok-p-1", sviTotal: 71, dimensionScores: { ftv: 80, tre: 40 }, error: null,
    });
    expect(h.scoresMock).toHaveBeenCalledWith("s-p-1");
    expect(h.recordMock).toHaveBeenCalledTimes(2);
    expect(h.recordMock).toHaveBeenCalledWith({
      evaluationId: "e-1", projectId: "p-1", userId: "u-1", kind: "full", paidVia: "quota", creditsCost: 0, reportRef: "r-p-1", shareToken: "tok-p-1", sviTotal: 71,
    });
    expect(h.finaliseMock).toHaveBeenCalledWith("b-1");
    expect(json).toMatchObject({ ok: true, dryRun: false, processed: 2, done: 2, failed: 0, closed: false });
    expect(json.items.map((i: { outcome: string }) => i.outcome)).toEqual(["done", "done"]);
    expect(h.notifyMock).not.toHaveBeenCalled();
  });

  it("a thrown item is marked failed with its error, nothing is recorded for it, and the loop continues", async () => {
    h.nextItemsMock.mockResolvedValue([item(1, "e-1"), item(2, "e-2"), item(3, "e-3", null)]);
    h.runMock.mockImplementationOnce(async () => {
      throw new Error("owner_not_found");
    });
    const json = await (await GET(req())).json();
    expect(h.markMock).toHaveBeenCalledWith(1, { status: "failed", error: "owner_not_found" });
    expect(h.markMock).toHaveBeenCalledWith(3, { status: "failed", error: "evaluation_missing" });
    expect(h.runMock).toHaveBeenCalledTimes(2); // item 3 never reaches the pipeline
    expect(h.recordMock).toHaveBeenCalledTimes(1);
    expect(h.recordMock.mock.calls[0][0].evaluationId).toBe("e-2");
    expect(json).toMatchObject({ processed: 3, done: 1, failed: 2 });
    expect(json.items.map((i: { outcome: string }) => i.outcome)).toEqual(["failed", "done", "failed"]);
    expect(json.items[0].error).toBe("owner_not_found");
  });

  it("closes the batch and writes ONE weekly_next_step notification: Batch {name} scored: d/t", async () => {
    const closedBatch = { ...BATCH, status: "done", doneCount: 2, failedCount: 1, finishedAt: "2026-09-10T12:30:00Z" };
    h.finaliseMock.mockResolvedValue({ batch: closedBatch, closed: true });
    const json = await (await GET(req())).json();
    expect(h.notifyMock).toHaveBeenCalledTimes(1);
    expect(h.notifyMock).toHaveBeenCalledWith({
      userId: "u-1",
      kind: "weekly_next_step",
      payload: { title: "Batch 'Cohort 4' scored: 2/3", batch_id: "b-1", done: 2, failed: 1, total: 3, href: "/workspace/evaluations/cohort/b-1" },
      dedupeKey: "batch:b-1",
      throttleMs: 24 * 60 * 60 * 1000,
    });
    expect(batchNotificationPayload(closedBatch as never).title).toBe("Batch 'Cohort 4' scored: 2/3");
    expect(json.closed).toBe(true);
    expect(json.batch).toMatchObject({ id: "b-1", status: "done", done: 2, failed: 1, total: 3 });
  });

  it("POST === GET", async () => {
    const json = await (await POST(req("?dry=1"))).json();
    expect(json.dryRun).toBe(true);
  });
});
