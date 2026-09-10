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
vi.mock("@/lib/report-pipeline/orchestrator", () => ({ orchestrateReport: (i: unknown) => orchestrateMock(i) }));

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
  title: "Acme — Trust BizReport",
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
    const report = await generateAndPersistReport({ ctx: ctx(), userId: "u-1", tier: "standard", locale: "en", creditsCost: 3 });
    expect(report.id).toBe("rpt-1");
    expect(orchestrateMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-1", userId: "u-1", projectId: "p-1", startupName: "Acme", tier: "standard", locale: "en" }));
    const inserted = state.calls.filter((c) => c.op === "insert").map((c) => c.table);
    expect(inserted).toEqual(["assembled_reports", "agent_report_tasks"]);
    const ar = state.calls.find((c) => c.table === "assembled_reports")!.payload as Record<string, unknown>;
    expect(ar).toMatchObject({ id: "rpt-1", account_id: "acc-1", user_id: "u-1", project_id: "p-1", analysis_id: "an-1", status: "complete", credits_cost: 3, sections_count: 3 });
    const tasks = state.calls.find((c) => c.table === "agent_report_tasks")!.payload as Array<Record<string, unknown>>;
    expect(tasks.map((t) => t.criterion_key)).toEqual(["idea", "team"]);
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

    const run = await runTrustReportForProject({ projectId: "p-1", requestedByUserId: "u-1", creditsCost: 0 });
    expect(run).toMatchObject({ kind: "full", reportId: "rpt-1", snapshotId: "snap-1", shareToken: "k".repeat(24), svi: 118, stage: 3, synthesisedAnalysis: true });

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
    const snap = state.calls.find((c) => c.table === "svi_snapshots" && c.op === "insert")!.payload as Record<string, unknown>;
    expect((snap.analysis_json as Record<string, unknown>).source).toBe("evaluator_rescore");
    expect(snap.dim_results).toBeUndefined();
    expect(Object.keys(snap.dimension_scores as Record<string, unknown>).length).toBeGreaterThan(0);
  });
});
