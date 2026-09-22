import { beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for lib/report-pipeline/run-for-project.ts (T0271). Pins:
//   * loadProjectReportContext resolves account + analysis by the OWNER's
//     email (findSVIAccountWithFallback / findLatestAnalysisWithFallback) and
//     maps evidence + 13-criteria rows exactly as the founder route did;
//   * generateAndPersistReport writes assembled_reports + agent_report_tasks
//     on success, a `failed` row and re-throws on orchestrator error;
//   * runTrustReportForProject synthesises svi_accounts / svi_analyses for
//     an evaluator-entered startup that was never analysed, then persists a
//     tokenised svi_snapshots row the /tbr page can render;
//   * a thrown orchestrator propagates (so the route never charges);
//   * the pure snapshot-shape projection.

interface Captured {
  table: string;
  op: "select" | "insert" | "update" | null;
  payload: unknown;
  eqs: Array<{ col: string; val: unknown }>;
}
const state = {
  queue: [] as Array<{ table: string; data?: unknown; error?: unknown }>,
  calls: [] as Captured[],
};
function nextResponse(table: string) {
  const idx = state.queue.findIndex((q) => q.table === table);
  if (idx === -1) return { data: null, error: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null };
}
function makeBuilder(table: string) {
  const c: Captured = { table, op: null, payload: null, eqs: [] };
  state.calls.push(c);
  const resolve = () => Promise.resolve(nextResponse(table));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select() { if (c.op === null) c.op = "select"; return b; },
    insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
    update(p: unknown) { c.op = "update"; c.payload = p; return b; },
    eq(col: string, val: unknown) { c.eqs.push({ col, val }); return b; },
    order() { return b; },
    limit() { return b; },
    single() { return resolve(); },
    maybeSingle() { return resolve(); },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return resolve().then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (t: string) => makeBuilder(t) }),
}));

const callAIMock = vi.fn(async () => ({ text: "ok" }));
vi.mock("@/lib/ai-client", () => ({ callAI: (a: unknown) => callAIMock(a as never), isAIConfigured: () => true }));
vi.mock("@/lib/slug", () => ({ newSlug: () => "slug12345678" }));
vi.mock("nanoid", () => ({ nanoid: (n: number) => "k".repeat(n) }));

const orchestrateMock = vi.fn();
vi.mock("@/lib/report-pipeline/orchestrator", () => ({
  orchestrateReport: (i: unknown) => orchestrateMock(i),
  assertReportUsable: (r: { fullyDegraded?: boolean }) => {
    if (r.fullyDegraded) throw new Error("report fully degraded");
  },
}));

// G14-S37: the founder-execution loader reads founder_profiles / assessments /
// founder_signals / svi_signals — mocked to a pass-through so the queued table
// responses keep their order; the merge itself is pinned in
// lib/founder/execution.test.ts.
const applyFounderExecutionMock = vi.fn(async (signals: unknown) => ({ signals, exec: null, profile: null }));
vi.mock("@/lib/founder/execution-load", () => ({
  applyFounderExecution: (signals: unknown, args: unknown) => applyFounderExecutionMock(signals, args),
}));

const findAccountMock = vi.fn();
const findAnalysisMock = vi.fn();
const getProjectByIdMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  findSVIAccountWithFallback: (e: string, p: string | null, cols: string) => findAccountMock(e, p, cols),
  findLatestAnalysisWithFallback: (e: string, p: string | null, cols: string) => findAnalysisMock(e, p, cols),
  getProjectById: (id: string) => getProjectByIdMock(id),
}));

import {
  buildSviAnalysisFromStored,
  generateAndPersistReport,
  loadHubEvidenceItems,
  loadProjectReportContext,
  projectReportToSnapshotShapes,
  runRescoreForProject,
  runTrustReportForProject,
  synthesiseRawInput,
} from "./run-for-project";

const ACCOUNT = { id: "acc-1", email: "scout@fund.vc", startup_name: "Acme", current_svi: 118, current_stage: 3 };
const ANALYSIS = {
  id: "an-1",
  raw_input: "Acme builds robots for mines",
  total_svi: 118,
  analysis_json: { version: "2.3.0", subs: [{ key: "ftv", label: "FTV", value: 62, adjustment: 0, rationale: "", evidence: [], gaps: ["No team page"] }], stageLabel: "Early Traction" },
};
const REPORT = {
  id: "rpt-1",
  title: "Acme — Trusted Business Report",
  tier: "standard",
  sections: [
    { id: "s-idea", title: "Idea & Innovation", agentRole: "cpo", criterion: "idea", content: "Strong idea.", score: 71, visuals: [], wordCount: 300 },
    { id: "s-team", title: "Team", agentRole: "chro", criterion: "team", content: "Thin team.", score: 44, visuals: [], wordCount: 280 },
    { id: "s-exec", title: "Executive summary", agentRole: "ceo", content: "…", visuals: [], wordCount: 200 },
  ],
  charts: [],
  executiveSummary: "Acme is …",
  qualityScore: 84,
  totalWords: 2600,
  consistencyIssues: [],
  agentContributions: {},
  markdown: "# Acme",
  createdAt: "2026-09-10T00:00:00Z",
};

beforeEach(() => {
  state.queue = [];
  state.calls = [];
  vi.clearAllMocks();
  findAccountMock.mockResolvedValue(ACCOUNT);
  findAnalysisMock.mockResolvedValue(ANALYSIS);
  orchestrateMock.mockResolvedValue(REPORT);
  getProjectByIdMock.mockResolvedValue({ id: "p-1", userId: "u-1", name: "Acme", description: "Robots for mines", industry: "DeepTech" });
});

describe("pure helpers", () => {
  it("buildSviAnalysisFromStored mirrors the founder route's reconstruction", () => {
    const a = buildSviAnalysisFromStored(ACCOUNT, ANALYSIS);
    expect(a.totalSVI).toBe(118);
    expect(a.stage).toBe(3);
    expect(a.stageLabel).toBe("Early Traction");
    expect(a.version).toBe("2.3.0");
    expect(a.subs).toHaveLength(1);
    const bare = buildSviAnalysisFromStored({ current_svi: null, current_stage: null }, { total_svi: null, analysis_json: null });
    expect(bare).toMatchObject({ totalSVI: 100, baselineSVI: 100, stage: 0, stageLabel: "Concept", confidenceMultiplier: 0.5 });
  });

  it("synthesiseRawInput folds the intake fields into scoreable text", () => {
    const t = synthesiseRawInput({ name: "Acme", description: "Robots", industry: "DeepTech", website: "https://acme.io", state: "NSW", notes: "met at demo day" });
    expect(t).toContain("# Acme");
    expect(t).toContain("Industry: DeepTech");
    expect(t).toContain("Website: https://acme.io");
    expect(t).toContain("Location: NSW, Australia");
    expect(t).toContain("Evaluator notes:\nmet at demo day");
  });

  it("projectReportToSnapshotShapes yields the /tbr dim_results + criterion_results shapes", () => {
    const shapes = projectReportToSnapshotShapes(REPORT as never, { subs: ANALYSIS.analysis_json.subs as never, dimensionScores: { ftv: 62, mpc: 75 } });
    expect(shapes.criterionResults.map((c) => c.key)).toEqual(["idea", "team"]);
    expect(shapes.criterionResults[0]).toMatchObject({ key: "idea", primary_dimension: "mpc", score: 71, verdict: "Solid", weight: 10 });
    expect(shapes.criterionResults[1]).toMatchObject({ key: "team", primary_dimension: "ftv", score: 44, verdict: "Developing" });
    expect(Object.keys(shapes.dimResults)).toEqual(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]);
    expect(shapes.dimResults.ftv).toMatchObject({ status: "complete", score: 62, priority: "medium", insights: ["No team page"] });
    expect(String(shapes.dimResults.ftv.markdown)).toContain("## Team");
    expect(String(shapes.dimResults.mpc.markdown)).toContain("Strong idea.");
    expect(shapes.dimResults.ptd).toMatchObject({ score: null, markdown: null });
    expect(shapes.dimensionScores).toEqual({ ftv: { score: 62, priority: "medium" }, mpc: { score: 75, priority: "low" } });
  });
});

describe("loadProjectReportContext", () => {
  it("keys account + analysis by the owner email and maps evidence / criteria", async () => {
    state.queue.push({ table: "svi_evidence", data: [{ evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" }] });
    state.queue.push({ table: "evaluation_criteria", data: [{ criterion_key: "team", text_input: "3 founders", files: [], links: [{ url: "https://x", label: "LinkedIn" }], quality_level: "good", ai_score: 66 }] });
    const res = await loadProjectReportContext({ ownerEmail: "scout@fund.vc", projectId: "p-1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // W4 review P0: svi_accounts has no user_id column — the select must never
    // name it (PostgREST 42703 → no_account for every report); the owner id
    // comes from projects.user_id. No callerEmail → no DataKeyOptions.
    expect(findAccountMock).toHaveBeenCalledWith("scout@fund.vc", "p-1", "id, email, startup_name, current_svi, current_stage");
    expect(findAnalysisMock).toHaveBeenCalledWith("scout@fund.vc", "p-1", "id, raw_input, total_svi, analysis_json");
    expect(res.ctx.evidenceItems).toEqual([{ evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" }]);
    expect(res.ctx.criteriaData.team).toMatchObject({ textInput: "3 founders", qualityLevel: "good", aiScore: 66 });
    expect(res.ctx.criteriaData.idea).toMatchObject({ textInput: "", qualityLevel: "incomplete" });
    expect(Object.keys(res.ctx.criteriaData)).toHaveLength(13);
    expect(res.ctx.sviAnalysis.totalSVI).toBe(118);
  });

  it("reports no_account / no_analysis", async () => {
    findAccountMock.mockResolvedValue(null);
    expect(await loadProjectReportContext({ ownerEmail: "x@y.z", projectId: "p-1" })).toEqual({ ok: false, error: "no_account" });
    findAccountMock.mockResolvedValue(ACCOUNT);
    findAnalysisMock.mockResolvedValue(null);
    expect(await loadProjectReportContext({ ownerEmail: "x@y.z", projectId: "p-1" })).toEqual({ ok: false, error: "no_analysis" });
  });
});

describe("generateAndPersistReport", () => {
  const ctx = () => ({
    projectId: "p-1",
    account: ACCOUNT,
    latestAnalysis: ANALYSIS,
    evidenceItems: [],
    criteriaData: {} as never,
    sviAnalysis: buildSviAnalysisFromStored(ACCOUNT, ANALYSIS),
  });

  it("persists assembled_reports + agent_report_tasks on success", async () => {
    orchestrateMock.mockImplementation(async (i: { callAI: (s: string, u: string, m: number, c?: string) => Promise<unknown> }) => {
      await i.callAI("sys", "user", 900, "report");
      return REPORT;
    });
    const report = await generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3 });
    expect(report.id).toBe("rpt-1");
    // G19-S46: the pipeline's own fan-out must not sit behind ai-client's per-user fairness cap (2 in flight) — agentId keys the per-report semaphore instead.
    expect(callAIMock).toHaveBeenCalledTimes(1);
    const callOpts = callAIMock.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(callOpts.agentId).toBe("svi:acc-1:p-1");
    expect(callOpts).not.toHaveProperty("userId");
    expect(callOpts.taskClass).toBe("report");
    expect(callOpts.policy).toBe("blockid-report-v1");
    expect(orchestrateMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-1", userId: "u-1", projectId: "p-1", startupName: "Acme", tier: "standard", locale: "en" }));
    const inserted = state.calls.filter((c) => c.op === "insert").map((c) => c.table);
    expect(inserted).toEqual(["assembled_reports", "agent_report_tasks"]);
    const ar = state.calls.find((c) => c.table === "assembled_reports")!.payload as Record<string, unknown>;
    expect(ar).toMatchObject({ id: "rpt-1", account_id: "acc-1", user_id: "u-1", project_id: "p-1", analysis_id: "an-1", status: "complete", credits_cost: 3, sections_count: 3 });
    const tasks = state.calls.find((c) => c.table === "agent_report_tasks")!.payload as Array<Record<string, unknown>>;
    expect(tasks.map((t) => t.criterion_key)).toEqual(["idea", "team"]);
    // G13-W1-R1: ReportV2 projection written best-effort to report_json (0395).
    const rj = state.calls.find((c) => c.table === "assembled_reports" && c.op === "update")!;
    expect(rj.eqs).toEqual([{ col: "id", val: "rpt-1" }]);
    const doc = (rj.payload as { report_json: { schemaVersion: string; dimensions: unknown[]; source: string } }).report_json;
    expect(doc.schemaVersion).toBe("2.0");
    expect(doc.dimensions).toHaveLength(8);
    expect(doc.source).toBe("adapter");
  });

  // G19-S46: one tbr-quality row per run — captured from the orchestrator's `done` event.
  it("records the quality row (hash-only project, calls + cost from `done`, no snapshot) and attaches pipelineStats", async () => {
    orchestrateMock.mockImplementation(async (i: { onEvent?: (e: unknown) => void }) => {
      i.onEvent?.({ type: "done", reportId: "rpt-1", totalMs: 4321, calls: 19, costAud: 0.02, costUsd: 0.0123, costReportedCalls: 19, degradedSections: ["tre"], deadlineHit: false });
      return { ...REPORT, consistencyIssues: [{ type: "x", severity: "warn", description: "d" }] };
    });
    const writer = vi.fn();
    const report = await generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityWriter: writer });
    expect(report.pipelineStats).toEqual({ calls: 19, costUsd: 0.0123, costAud: 0.02, durationMs: 4321, degradedSections: ["tre"], deadlineHit: false, budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
    expect(writer).toHaveBeenCalledTimes(1);
    const row = writer.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ snapshotId: null, tier: "standard", calls: 19, costUsd: 0.0123, consistencyIssues: 1, words: 2600, durationMs: 4321, sviVersion: "2.3.0" });
    expect(row.projectId).toHaveLength(12);
    expect(row.projectId).not.toBe("p-1");
    // `defer` leaves the row to the caller.
    writer.mockClear();
    await generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityLog: "defer", qualityWriter: writer });
    expect(writer).not.toHaveBeenCalled();
  });

  it("a fully-degraded run still logs one quality row (no snapshot, 8 degraded, calls from the error) before re-throwing", async () => {
    class ReportFullyDegradedError extends Error {
      constructor(readonly degradedSections: number, readonly calls: number) { super("report fully degraded"); }
    }
    orchestrateMock.mockRejectedValue(new ReportFullyDegradedError(8, 16));
    const writer = vi.fn();
    await expect(generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityWriter: writer })).rejects.toThrow("report fully degraded");
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0][0]).toMatchObject({ snapshotId: null, tier: "standard", calls: 16, degradedSections: 8, groundedShare: 0, pendingDims: 0, words: 0, pages: 0, providers_struck: [], deadline_hit_wave: null });
    // A plain failure (no degraded/calls fields) logs nothing.
    writer.mockClear();
    orchestrateMock.mockRejectedValue(new Error("agents down"));
    await expect(generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityWriter: writer })).rejects.toThrow("agents down");
    expect(writer).not.toHaveBeenCalled();
  });

  // G29-B: the strike ledger + wave timings leave with a failed run — as a
  // `run_diagnostics` event (the self-report script's degraded audit dump) and
  // on the quality row (providers_struck / deadline_hit_wave).
  it("G29-B: a degraded run emits run_diagnostics (ledger snapshot, per-wave timings, deadline wave) before re-throwing and stamps the quality row", async () => {
    class ReportFullyDegradedError extends Error {
      constructor(readonly degradedSections: number, readonly calls: number) { super("report fully degraded"); }
    }
    // Two DeepInfra worker timeouts + two Groq 429s reach the ledger through the aiCaller's `runStrikes` option; Gemini strikes once.
    callAIMock.mockImplementation(async (a: { runStrikes?: { note(p: string, e: unknown): unknown } }) => {
      a.runStrikes?.note("deepinfra", new Error("Worker timeout (120s)"));
      a.runStrikes?.note("deepinfra", new Error("Worker timeout (120s)"));
      a.runStrikes?.note("groq", new Error("429 Too Many Requests"));
      a.runStrikes?.note("groq", new Error("429 Too Many Requests"));
      a.runStrikes?.note("gemini", new Error("Worker timeout (120s)"));
      return { text: "ok" };
    });
    orchestrateMock.mockImplementation(async (i: { onEvent?: (e: unknown) => void; callAI: (s: string, u: string, m: number) => Promise<unknown> }) => {
      i.onEvent?.({ type: "progress", completed: 15, total: 100, phase: "wave1" });
      await i.callAI("s", "u", 100);
      i.onEvent?.({ type: "progress", completed: 80, total: 100, phase: "wave4" });
      i.onEvent?.({ type: "done", reportId: "rpt-1", totalMs: 480_000, calls: 16, costAud: 0.02, costUsd: 0.0123, costReportedCalls: 16, degradedSections: ["ftv"], deadlineHit: true, deadlineHitPhase: "wave1", budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
      throw new ReportFullyDegradedError(8, 16);
    });
    const writer = vi.fn();
    const events: Array<Record<string, unknown>> = [];
    await expect(generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityWriter: writer, onEvent: (e) => events.push(e as unknown as Record<string, unknown>) })).rejects.toThrow("report fully degraded");
    const diag = events.find((e) => e.type === "run_diagnostics")!;
    expect(diag).toMatchObject({ degraded: true, error: "report fully degraded", failedWave: "wave4", deadlineHit: true, deadlineHitWave: "wave1", calls: 16, totalMs: 480_000, providersStruck: ["deepinfra", "groq"] });
    expect(diag.strikes).toEqual({ deepinfra: { strikes: 2, timeout: 2, overloaded: 0 }, groq: { strikes: 2, timeout: 0, overloaded: 2 }, gemini: { strikes: 1, timeout: 1, overloaded: 0 } });
    expect((diag.waves as Array<{ phase: string }>).map((w) => w.phase)).toEqual(["wave1", "wave4"]);
    // The diagnostics event is the LAST thing the listener sees (after `done`).
    expect(events.at(-1)!.type).toBe("run_diagnostics");
    expect(writer.mock.calls[0][0]).toMatchObject({ calls: 16, degradedSections: 8, words: 0, providers_struck: ["deepinfra", "groq"], deadline_hit_wave: "wave1" });
    // A mid-wave throw (no `done`) still leaves the ledger + the wave it died in; a throwing listener never masks the error.
    events.length = 0;
    orchestrateMock.mockImplementation(async (i: { onEvent?: (e: unknown) => void; callAI: (s: string, u: string, m: number) => Promise<unknown> }) => {
      i.onEvent?.({ type: "progress", completed: 15, total: 100, phase: "wave1" });
      i.onEvent?.({ type: "progress", completed: 45, total: 100, phase: "wave2" });
      await i.callAI("s", "u", 100);
      throw new Error("W2 dispatcher crashed");
    });
    await expect(generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3, qualityWriter: writer, onEvent: (e) => { events.push(e as unknown as Record<string, unknown>); if ((e as { type: string }).type === "run_diagnostics") throw new Error("listener boom"); } })).rejects.toThrow("W2 dispatcher crashed");
    expect(events.at(-1)).toMatchObject({ type: "run_diagnostics", failedWave: "wave2", deadlineHit: false, deadlineHitWave: null, calls: null, providersStruck: ["deepinfra", "groq"] });
    callAIMock.mockReset();
    callAIMock.mockImplementation(async () => ({ text: "ok" }));
  });

  it("writes a failed row and re-throws when the orchestrator fails", async () => {
    orchestrateMock.mockRejectedValue(new Error("agents down"));
    await expect(generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3 })).rejects.toThrow("agents down");
    const failed = state.calls.find((c) => c.table === "assembled_reports" && c.op === "insert")!.payload as Record<string, unknown>;
    expect(failed).toMatchObject({ status: "failed", error_message: "agents down", credits_cost: 3 });
    expect(state.calls.some((c) => c.table === "agent_report_tasks")).toBe(false);
  });
});

describe("runTrustReportForProject (evaluator)", () => {
  it("synthesises account + analysis for a never-analysed startup, then snapshots with a share token", async () => {
    // owner email lookup
    state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
    // ensureAccount: none yet → insert
    findAccountMock.mockResolvedValueOnce(null);
    state.queue.push({ table: "svi_accounts", data: { ...ACCOUNT, current_svi: null, current_stage: null } });
    // first loadProjectReportContext → account ok, no analysis
    findAccountMock.mockResolvedValueOnce(ACCOUNT);
    findAnalysisMock.mockResolvedValueOnce(null);
    // synthesis: evaluations intake + evidence (empty) + svi_analyses insert
    state.queue.push({ table: "evaluations", data: { website: "https://acme.io", state: "NSW", notes: "demo day" } });
    state.queue.push({ table: "svi_analyses", data: null, error: null });
    // second load → account + analysis present
    findAccountMock.mockResolvedValueOnce(ACCOUNT);
    findAnalysisMock.mockResolvedValueOnce(ANALYSIS);
    // snapshot: no row today → insert
    state.queue.push({ table: "svi_snapshots", data: null }); // maybeSingle existing
    state.queue.push({ table: "svi_snapshots", data: { id: "snap-1" } }); // insert

    const qualityWriter = vi.fn();
    const run = await runTrustReportForProject({ projectId: "p-1", requestedByUserId: "u-1", creditsCost: 0, qualityWriter });
    expect(run).toMatchObject({ kind: "full", reportId: "rpt-1", snapshotId: "snap-1", shareToken: "k".repeat(24), svi: 118, stage: 3, synthesisedAnalysis: true });
    // G19-S46: the quality row carries the snapshot id and the persisted ReportV2's grounded share.
    expect(qualityWriter).toHaveBeenCalledTimes(1);
    expect(run.quality).toBe(qualityWriter.mock.calls[0][0]);
    expect(run.quality).toMatchObject({ snapshotId: "snap-1", tier: "standard", words: 2600, groundedShare: run.reportV2!.quality.groundedShare, pipelineVersion: run.reportV2!.pipelineVersion });
    expect(run.quality.projectId).not.toContain("p-1");

    const analysisInsert = state.calls.find((c) => c.table === "svi_analyses" && c.op === "insert")!.payload as Record<string, unknown>;
    expect(analysisInsert).toMatchObject({ id: "slug12345678", email: "scout@fund.vc", project_id: "p-1", svi_version: expect.any(String) });
    expect(String(analysisInsert.raw_input)).toContain("# Acme");
    expect(String(analysisInsert.raw_input)).toContain("Website: https://acme.io");

    const snapInsert = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "insert")!.payload as Record<string, unknown>;
    expect(snapInsert).toMatchObject({ account_id: "acc-1", project_id: "p-1", svi_total: 118, stage: 3, report_share_token: "k".repeat(24) });
    expect((snapInsert.analysis_json as Record<string, unknown>).source).toBe("evaluator_trust_report");
    expect((snapInsert.analysis_json as Record<string, unknown>).report_id).toBe("rpt-1");
    expect(Object.keys(snapInsert.dim_results as Record<string, unknown>)).toHaveLength(8);
    expect(orchestrateMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-1", projectId: "p-1" }));
    // G13-W1-R1: report_v2 written after the snapshot row exists (never inside the insert).
    expect(snapInsert.report_v2).toBeUndefined();
    const v2 = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "update" && (c.payload as Record<string, unknown>).report_v2)!;
    expect(v2.eqs).toEqual([{ col: "id", val: "snap-1" }]);
    const doc = (v2.payload as { report_v2: { schemaVersion: string; snapshotId: string; reportId: string } }).report_v2;
    expect(doc.schemaVersion).toBe("2.0");
    expect(doc.snapshotId).toBe("snap-1");
    expect(doc.reportId).toBe("rpt-1");
  });

  it("same-day re-run updates today's snapshot and keeps its share token", async () => {
    state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
    state.queue.push({ table: "svi_snapshots", data: { id: "snap-old", report_share_token: "existing-token" } });
    state.queue.push({ table: "svi_snapshots", data: null }); // update
    const run = await runTrustReportForProject({ projectId: "p-1", requestedByUserId: "u-1" });
    expect(run.snapshotId).toBe("snap-old");
    expect(run.shareToken).toBe("existing-token");
    expect(run.synthesisedAnalysis).toBe(false);
    const upd = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "update")!;
    expect(upd.eqs).toEqual([{ col: "id", val: "snap-old" }]);
    expect((upd.payload as Record<string, unknown>).report_share_token).toBeUndefined();
  });

  it("propagates an orchestrator failure (the route charges nothing)", async () => {
    state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
    orchestrateMock.mockRejectedValue(new Error("agents down"));
    await expect(runTrustReportForProject({ projectId: "p-1", requestedByUserId: "u-1" })).rejects.toThrow("agents down");
    expect(state.calls.some((c) => c.table === "svi_snapshots")).toBe(false);
  });

  it("throws project_not_found for an unknown project", async () => {
    getProjectByIdMock.mockResolvedValue(null);
    await expect(runTrustReportForProject({ projectId: "nope", requestedByUserId: "u-1" })).rejects.toThrow("project_not_found");
    expect(orchestrateMock).not.toHaveBeenCalled();
  });
});

describe("runRescoreForProject", () => {
  // G19-S46: the self-report seed hands in BlockID's own description.
  it("a rawInput override replaces the stored input on the new svi_analyses row", async () => {
    state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
    state.queue.push({ table: "svi_evidence", data: [] });
    state.queue.push({ table: "svi_analyses", data: null });
    state.queue.push({ table: "svi_snapshots", data: null });
    state.queue.push({ table: "svi_snapshots", data: { id: "snap-2" } });
    const run = await runRescoreForProject({ projectId: "p-1", requestedByUserId: "u-1", rawInput: "  # Acme\n\nAcme now sells to 12 mines.  " });
    expect(run.kind).toBe("rescore");
    const analysisInsert = state.calls.find((c) => c.table === "svi_analyses" && c.op === "insert")!.payload as Record<string, unknown>;
    expect(analysisInsert.raw_input).toBe("# Acme\n\nAcme now sells to 12 mines.");
  });

  it("computes SVI over stored input + evidence, inserts svi_analyses and a tokenised snapshot — no agents", async () => {
    state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
    state.queue.push({ table: "svi_evidence", data: [{ evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" }] });
    state.queue.push({ table: "svi_analyses", data: null });
    state.queue.push({ table: "svi_snapshots", data: null });
    state.queue.push({ table: "svi_snapshots", data: { id: "snap-2" } });

    const run = await runRescoreForProject({ projectId: "p-1", requestedByUserId: "u-1" });
    expect(run.kind).toBe("rescore");
    expect(run.snapshotId).toBe("snap-2");
    expect(run.shareToken).toBe("k".repeat(24));
    expect(run.analysisId).toBe("slug12345678");
    expect(Number.isFinite(run.svi)).toBe(true);
    expect(run.delta).toBe(run.svi - 118);
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
    // G14-S37: the owner's founder profile is consulted before computeSVI (owner email + project).
    expect(applyFounderExecutionMock).toHaveBeenCalledTimes(1);
    expect(applyFounderExecutionMock.mock.calls[0][1]).toMatchObject({ email: "scout@fund.vc", projectId: "p-1" });
    const snap = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "insert")!.payload as Record<string, unknown>;
    expect((snap.analysis_json as Record<string, unknown>).source).toBe("evaluator_rescore");
    expect(snap.dim_results).toBeUndefined();
    expect(Object.keys(snap.dimension_scores as Record<string, unknown>).length).toBeGreaterThan(0);
    // G13-W1-R1: even a rescore (no agents) gets a ReportV2 from its dimension scores.
    const v2 = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "update" && (c.payload as Record<string, unknown>).report_v2)!;
    expect(v2).toBeTruthy();
    const doc = (v2.payload as { report_v2: { dimensions: Array<{ dim: string; score: number }> } }).report_v2;
    expect(doc.dimensions).toHaveLength(8);
  });
});

describe("G19-S43 — the Evidence Hub (svi_dimension_evidence) reaches the pipeline and the engine", () => {
  const HUB = [
    { dimension: "tre", evidence_type: "revenue_proof", evidence_label: "Bank statements", evidence_value_or_url: "q2.pdf", confidence_level: "third_party_verified", is_verified: false, review_status: "pending", created_at: "2026-09-01T00:00:00.000Z" },
    { dimension: "lco", evidence_type: "ip_assignment", evidence_label: "IP deed", confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-05T00:00:00.000Z", review_status: "approved" },
    { dimension: "cgh", evidence_type: "board_minutes", evidence_label: "Minutes", review_status: "rejected" },
  ];

  it("loadProjectReportContext merges the project's hub rows into evidenceItems (origin-capped: founder upload ≤ document_uploaded, reviewer-signed keeps third_party_verified; rejected dropped)", async () => {
    state.queue.push({ table: "svi_evidence", data: [{ evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" }] });
    state.queue.push({ table: "svi_dimension_evidence", data: HUB });
    state.queue.push({ table: "evaluation_criteria", data: [] });
    const res = await loadProjectReportContext({ ownerEmail: "scout@fund.vc", projectId: "p-1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.evidenceItems).toEqual([
      { evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" },
      { evidence_type: "revenue_proof", confidence_level: "document_uploaded", dimension: "tre", label: "Bank statements", origin: "founder_upload" },
      { evidence_type: "ip_assignment", confidence_level: "third_party_verified", dimension: "lco", label: "IP deed", origin: "reviewer" },
    ]);
    const hubRead = state.calls.find((c) => c.table === "svi_dimension_evidence")!;
    expect(hubRead.eqs).toEqual([{ col: "project_id", val: "p-1" }]);
  });

  it("loadHubEvidenceItems is fail-soft (a query error reads as no rows) and runRescoreForProject scores the hub rows (TRE revenue proof lifts the total; evidenceCount includes them)", async () => {
    expect(await loadHubEvidenceItems("p-1")).toEqual([]);

    const runWith = async (hub: unknown[]) => {
      state.queue = [];
      state.calls = [];
      state.queue.push({ table: "app_users", data: { email: "scout@fund.vc" } });
      state.queue.push({ table: "svi_evidence", data: [] });
      state.queue.push({ table: "svi_dimension_evidence", data: hub });
      state.queue.push({ table: "svi_analyses", data: null });
      state.queue.push({ table: "svi_snapshots", data: null });
      state.queue.push({ table: "svi_snapshots", data: { id: "snap-3" } });
      return runRescoreForProject({ projectId: "p-1", requestedByUserId: "u-1" });
    };
    const without = await runWith([]);
    const withHub = await runWith(HUB);
    expect(withHub.svi).toBeGreaterThan(without.svi);
    const snap = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "insert")!.payload as Record<string, unknown>;
    expect((snap.analysis_json as Record<string, unknown>).evidenceCount).toBe(2);
    const analysisRow = state.calls.find((c) => c.table === "svi_analyses" && c.op === "insert")!.payload as { analysis_json: { subs: Array<{ key: string; breakdown?: Array<{ signal: string }> }>; signals: { hasRevenue: boolean; evidenceLevel: string } } };
    expect(analysisRow.analysis_json.signals.hasRevenue).toBe(true);
    expect(analysisRow.analysis_json.signals.evidenceLevel).toBe("third_party_verified");
    expect(analysisRow.analysis_json.subs.find((s) => s.key === "tre")?.breakdown?.some((b) => /revenue/i.test(b.signal))).toBe(true);
  });
});
