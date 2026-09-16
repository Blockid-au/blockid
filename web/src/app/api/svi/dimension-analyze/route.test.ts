// Colocated tests for POST /api/svi/dimension-analyze — S18-A member access
// + S-R3: the route is a thin per-dimension re-run of the ONE generator
// (runReportPipeline dims:[key]) instead of its own prompt.
//
// Pins:
//   - viewer → 403 before any pipeline run or credit spend
//   - editor → account/analysis resolved under the OWNER's email with the
//     legacy fallback bound to the caller; credits spent from the CALLER's
//     wallet AFTER a usable chapter; response carries the member creditNote
//   - owner / no project → unchanged (caller's own key)
//   - the pipeline is called with dims:[dim] and persist:false; the legacy
//     `analysis` JSON (report / score / strengths / gaps / recommendations /
//     benchmarkComparison / nextMilestone) is derived from the chapter and the
//     evidence_analyses row keeps the same shape
//   - a degraded (deterministic) chapter is never charged (429, retryable)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeScopeState } from "@/test/project-scope-mock";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

const scopeState = vi.hoisted(() => ({
  projectId: "proj-1" as string | null,
  role: "owner" as "owner" | "admin" | "editor" | "viewer",
  nonMember: false,
  callerEmail: "caller@x.test",
  callerId: "user-caller",
  ownerEmail: "owner@x.test",
  ownerId: "user-owner",
  calls: [] as Array<{ fn: string; email?: string; projectId: string | null; opts?: unknown }>,
  accountId: "acct-1" as string | null,
  account: { id: "acct-1", startup_name: "P" } as Record<string, unknown> | null,
  analysis: { raw_input: "x", analysis_json: { dimensionScores: {} } } as Record<string, unknown> | null,
  lastMinRole: undefined as string | undefined,
}));

vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as { id: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const ai = vi.hoisted(() => ({ callAI: vi.fn(), configured: true }));
vi.mock("@/lib/ai-client", () => ({
  callAI: (...a: unknown[]) => ai.callAI(...a),
  isAIConfigured: () => ai.configured,
}));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  FEATURE_COSTS: new Proxy({}, { get: () => 2 }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

// The generator itself is mocked: it emits one chapter per requested dim.
const orch = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  degraded: false,
}));
vi.mock("@/lib/report-pipeline/orchestrator", async () => {
  const { demoReportV2 } = await import("@/lib/report-v2/fixtures");
  return {
    PIPELINE_VERSION: "test-pipeline",
    assertReportUsable: () => undefined,
    orchestrateReport: async (input: Record<string, unknown>) => {
      orch.calls.push(input);
      const demo = demoReportV2();
      const dims = (input.dims as string[] | undefined) ?? demo.dimensions.map((d) => d.dim);
      const onEvent = input.onEvent as ((e: unknown) => void) | undefined;
      onEvent?.({ type: "context", industry: "SaaS", stage: 3, stageLabel: "Seed", phaseId: "validation", tier: "standard", estimatedCalls: dims.length, estimatedSeconds: 120, dims });
      for (const dim of dims) {
        const chapter = { ...demo.dimensions.find((d) => d.dim === dim)!, ...(orch.degraded ? { degraded: true, degradeReason: "budget: monthly AI cap reached — deterministic card" } : {}) };
        onEvent?.({ type: "dimension_start", dim, ownerAgent: chapter.ownerAgent });
        onEvent?.({ type: "dimension_complete", dim, chapter });
      }
      onEvent?.({ type: "done", reportId: "rpt-test", totalMs: 10, calls: dims.length, costAud: 0.001, costUsd: 0, costReportedCalls: 0, degradedSections: [], deadlineHit: false });
      return { id: "rpt-test", title: "t", tier: "standard", sections: [], charts: [], executiveSummary: "", qualityScore: 50, totalWords: 0, consistencyIssues: [], agentContributions: {}, markdown: "", createdAt: new Date().toISOString(), llmCalls: dims.length };
    },
  };
});

import { POST } from "./route";

function req(dimension = "ftv") {
  return new Request("http://x/api/svi/dimension-analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimension }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", startup_name: "P", email: "owner@x.test" }, analysis: { id: "an-1", raw_input: "x", analysis_json: {} } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  ai.callAI.mockReset().mockResolvedValue({ text: "unused", cost_usd: 0 });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  db.sb = fakeSupabase({ svi_evidence: [{ id: "ev-1", account_id: "acct-1", dimension: "ftv" }], evaluation_criteria: [], svi_snapshots: [] });
  orch.calls.length = 0;
  orch.degraded = false;
}

beforeEach(reset);

describeMemberAccess("POST /api/svi/dimension-analyze", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findSVIAccountWithFallback", "findLatestAnalysisWithFallback"],
});

describe("POST /api/svi/dimension-analyze — credits + pipeline gating", () => {
  it("viewer: 403 and neither the pipeline nor the wallet is touched", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(orch.calls).toHaveLength(0);
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("editor: spends the CALLER's credits after the chapter and returns the member creditNote", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "dim_ftv_analysis", expect.objectContaining({ dimension: "ftv", reportId: "rpt-test" }));
    const body = await res.json();
    expect(body.creditNote).toMatch(/not the project owner/);
    // evidence for the dimension is read off the OWNER's account
    expect(db.sb!.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
  });

  it("owner: creditNote is the plain wallet copy", async () => {
    const res = await POST(req());
    const body = await res.json();
    expect(body.creditNote).toBe("Charged to your credits.");
  });

  it("runs the ONE generator as a per-dimension re-run (dims:[dim], persist:false) and derives the legacy analysis JSON from the chapter", async () => {
    const res = await POST(req("cgh"));
    expect(res.status).toBe(200);
    expect(orch.calls).toHaveLength(1);
    expect(orch.calls[0]).toMatchObject({ dims: ["cgh"], tierV2: "standard", accountId: "acct-1", userId: "user-caller" });
    const body = await res.json();
    const demoChapter = demoReportV2().dimensions.find((d) => d.dim === "cgh")!;
    expect(body.dimension).toBe("cgh");
    expect(body.dimensionLabel).toBe("Cap Table & Governance Health");
    expect(body.analysis.score).toBe(demoChapter.score);
    expect(body.analysis.report).toContain("**Strengths (with evidence):**");
    expect(body.analysis.report).toContain(demoChapter.strengths[0]);
    expect(body.analysis.nextMilestone).toBe(demoChapter.nextAction.title);
    expect(body.analysis.recommendations[0].action).toBe(demoChapter.nextAction.title);
    expect(body.analysis.benchmarkComparison).toMatch(/CGH \d+\/100 vs stage/);
    expect(body.chapter.dim).toBe("cgh");
    expect(body.reportId).toBe("rpt-test");
    // Stored as an evidence_analyses row with the same feature key / dimension.
    const inserts = db.sb!.find("evidence_analyses", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toMatchObject({ dimension: "cgh", feature_key: "dim_cgh_analysis", account_id: "acct-1", tier: "standard" });
    // The route never calls the model itself.
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  it("a degraded (deterministic) chapter is not a paid deep dive: 429 retryable, nothing charged, nothing stored", async () => {
    orch.degraded = true;
    const res = await POST(req());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryable).toBe(true);
    expect(body.error).toMatch(/no credits charged/);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("evidence_analyses", "insert")).toHaveLength(0);
  });

  it("rejects an unknown dimension with 400 and lists the valid keys", async () => {
    const res = await POST(req("xyz"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tre, mpc, ftv, ptd, cgh, iri, lco, svm/);
  });

  it("402 when the caller cannot afford the deep dive — no pipeline run", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 2 });
    const res = await POST(req());
    expect(res.status).toBe(402);
    expect(orch.calls).toHaveLength(0);
  });
});
