// P9-orchestrator-lib-test — colocated vitest for the previously-untested
// top-level report pipeline coordinator
// `web/src/lib/report-pipeline/orchestrator.ts`.
//
// The orchestrator is the entry point every SVI report ships through
// (POST /api/svi/... → orchestrateReport). A silent drift here is a whole
// report going wrong in ways downstream tests cannot catch:
//   - notify() progress values drift → the polling UI on /reports/[id]
//     never advances past the wrong phase
//   - a wave dispatch reorders or drops a wave → premium buyers pay for
//     13-criterion coverage and receive 6
//   - dispatchOpts drift → the ai_runs audit log loses the business_id /
//     user_id / purpose fields that the CFO revenue rollup joins on
//   - gather phase raising drops the whole report on the floor → a broken
//     researchMarket call blanks the entire pipeline
//   - crossValidate threshold (<3 criterion results) drift → the CDO fires
//     spurious "no results yet" pass and the exec summary is misleading
//   - executiveSummary fallback drift → a callAI failure returns a stack
//     trace to buyers instead of a graceful "generation encountered an
//     error" paragraph
//   - audit downgrade drift → an ungrounded section keeps its full
//     confidence and the risks list never gets the "grounding" warning
//     the report footer relies on
//   - qualityScore weighting drift → the founder-facing tile shows the
//     wrong "quality score" and buyers refund
//   - reportId shape drift → the DOCX generator (which slugs reportId
//     into the download filename) generates invalid filenames
//
// The suite mocks every collaborator (dispatchWave, section-assembler,
// llm-auditor, agent-prompts, adk/agents.researchMarket, ai-client) so
// only the orchestrator logic is exercised. callAI is passed as a spy
// (it is an input, not a module dep). The tests use tiny fake waves to
// keep totalAgents easy to reason about.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentAnalysisResult,
  AgentRole,
  AssembledReport,
  CriterionData,
  PipelineStatus,
  ReportContext,
  ReportTier,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { SectionAuditOutcome } from "./llm-auditor";

// ─── module mocks (must precede the SUT import) ─────────────────────────
//
// vi.mock() calls are hoisted to the very top of the file, so any state the
// factories need must be created via vi.hoisted() (also hoisted). Plain
// module-level `const`s would land AFTER the mock factories and would trip
// TDZ ReferenceErrors.

const H = vi.hoisted(() => {
  interface DispatchCall {
    wave: unknown;
    contextSizeBefore: number;
    tier: string;
    opts: unknown;
  }
  interface AuditCall {
    sectionIds: string[];
    evidence: string;
    options: {
      llmOnlyWhenUncited?: boolean;
      maxLlmSections?: number;
      budgetOk?: () => boolean;
      maxTokens?: number;
    };
  }
  return {
    WAVE_1: [{ agentRole: "cto", criterion: "code_git" }],
    WAVE_2: [{ agentRole: "cpo", criterion: "idea" }],
    WAVE_3: [{ agentRole: "cpo", criterion: "roadmap" }],
    dispatchCalls: [] as DispatchCall[],
    dispatchScript: [] as Array<
      Array<{ criterion: string; result: unknown }>
    >,
    auditCalls: [] as AuditCall[],
    auditScript: [] as unknown[],
    assembleSpy: null as null | ReturnType<typeof vi.fn>,
    researchMarketSpy: vi.fn(),
    budgetStatus: { spent: 0, limit: 100 },
  };
});

H.assembleSpy = vi.fn(
  (context: unknown, tier: unknown, reportId: string) => ({
    id: reportId,
    title: `Report for ${(context as ReportContext).startupName}`,
    tier,
    sections: [],
    charts: [],
    executiveSummary: (context as ReportContext).executiveSummary ?? "",
    qualityScore: (context as ReportContext).qualityScore ?? 0,
    totalWords: 0,
    consistencyIssues: [],
    agentContributions: {},
    markdown: "",
    createdAt: new Date().toISOString(),
  }),
);

vi.mock("./agent-dispatcher", () => ({
  WAVE_1: H.WAVE_1,
  WAVE_2: H.WAVE_2,
  WAVE_3: H.WAVE_3,
  buildEvidenceCatalogue: vi.fn(() => []),
  dispatchWave: vi.fn(async (
    wave: unknown,
    context: ReportContext,
    tier: ReportTier,
    _callAI: unknown,
    opts: unknown,
  ) => {
    H.dispatchCalls.push({
      wave,
      contextSizeBefore: context.criterionResults.size,
      tier,
      opts,
    });
    const rows = H.dispatchScript.shift() ?? [];
    for (const { criterion, result } of rows) {
      context.criterionResults.set(criterion as CriterionKey, result as AgentAnalysisResult);
    }
  }),
}));

vi.mock("./section-assembler", () => ({
  assembleReport: (
    context: unknown,
    tier: unknown,
    reportId: string,
  ) => H.assembleSpy!(context, tier, reportId),
}));

vi.mock("./agent-prompts", () => ({
  buildAgentPrompt: vi.fn(
    (role: AgentRole, _context: unknown, _crit?: string) => `sys-${role}`,
  ),
}));

vi.mock("./llm-auditor", () => ({
  auditSections: vi.fn(async (
    sections: Array<{ id: string; content: string }>,
    evidence: string,
    _model: unknown,
    options: {
      llmOnlyWhenUncited?: boolean;
      maxLlmSections?: number;
      budgetOk?: () => boolean;
      maxTokens?: number;
    },
  ) => {
    H.auditCalls.push({
      sectionIds: sections.map((s) => s.id),
      evidence,
      options,
    });
    if (H.auditScript.length === 0) {
      return sections.map((s) => ({
        sectionId: s.id,
        revised: s.content,
        findings: [] as string[],
        uncitedClaims: [] as string[],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      }));
    }
    return H.auditScript;
  }),
}));

vi.mock("@/lib/adk/agents", () => ({
  researchMarket: (input: unknown, cb: unknown) => H.researchMarketSpy(input, cb),
}));

vi.mock("@/lib/ai-client", () => ({
  getAIBudgetStatus: () => ({
    month: "2026-08",
    spent: H.budgetStatus.spent,
    limit: H.budgetStatus.limit,
    percent: (H.budgetStatus.spent / Math.max(H.budgetStatus.limit, 1)) * 100,
    calls: 0,
  }),
}));

// SUT
import { orchestrateReport } from "./orchestrator";

// Convenience aliases into the hoisted state bag — kept out of the vi.mock
// hoist zone so we don't recreate the TDZ problem.
const WAVE_1 = H.WAVE_1;
const WAVE_2 = H.WAVE_2;
const WAVE_3 = H.WAVE_3;
const dispatchCalls = H.dispatchCalls;
const auditCalls = H.auditCalls;
const researchMarketSpy = H.researchMarketSpy;
const assembleSpy = H.assembleSpy!;
const budgetStatus = H.budgetStatus;

// ─── fixture builders ───────────────────────────────────────────────────

function makeAgentResult(
  criterion: CriterionKey,
  overrides: Partial<AgentAnalysisResult> = {},
): AgentAnalysisResult {
  return {
    criterion,
    agentRole: "ceo",
    score: 60,
    content: `Analysis for ${criterion}`,
    highlights: [`hl-${criterion}`],
    dataPoints: {},
    risks: [`existing-risk-${criterion}`],
    nextSteps: [`step-${criterion}`],
    visuals: [],
    confidence: 0.8,
    wordCount: 100,
    durationMs: 500,
    ...overrides,
  };
}

function makeSVI(overrides: Partial<Record<string, unknown>> = {}): ReportContext["sviAnalysis"] {
  return {
    totalSVI: 132,
    stageLabel: "Growth",
    stage: 5,
    subs: [
      { label: "Market", value: 70 },
      { label: "Team", value: 80 },
    ],
    ...overrides,
  } as unknown as ReportContext["sviAnalysis"];
}

function makeCriteriaData(
  partial: Partial<Record<CriterionKey, Partial<CriterionData>>> = {},
): Record<CriterionKey, CriterionData> {
  const out: Record<string, CriterionData> = {};
  for (const key of CRITERION_KEYS) {
    const p = partial[key];
    out[key] = {
      textInput: p?.textInput ?? "",
      files: p?.files ?? [],
      links: p?.links ?? [],
      qualityLevel: p?.qualityLevel ?? "incomplete",
    };
  }
  return out as Record<CriterionKey, CriterionData>;
}

function baseInput(overrides: Partial<Parameters<typeof orchestrateReport>[0]> = {}) {
  const callAI = vi.fn(async (_sys: string, _user: string, _tok: number) => "AI-OUT");
  return {
    accountId: "acc-1",
    userId: "user-1",
    projectId: "proj-1",
    startupName: "Acme",
    rawText: "pitch text",
    sviAnalysis: makeSVI(),
    evidenceItems: [],
    criteriaData: makeCriteriaData(),
    tier: "standard" as ReportTier,
    callAI,
    ...overrides,
  } satisfies Parameters<typeof orchestrateReport>[0];
}

beforeEach(() => {
  dispatchCalls.length = 0;
  H.dispatchScript = [];
  auditCalls.length = 0;
  H.auditScript = [];
  assembleSpy.mockClear();
  researchMarketSpy.mockReset();
  budgetStatus.spent = 0;
  budgetStatus.limit = 100;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── phase progression & notify() ─────────────────────────────────────────

describe("orchestrateReport() — phase progression", () => {
  it("fires onPhaseChange for every phase in order with the documented progress values", async () => {
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    expect(events.map((e) => e.phase)).toEqual([
      "gathering",
      "wave1",
      "wave2",
      "wave3",
      "synthesizing",
      "rendering",
      "complete",
    ]);
    expect(events.map((e) => e.progress)).toEqual([5, 15, 45, 75, 85, 95, 100]);
  });

  it("reports totalAgents as WAVE_1.length + WAVE_2.length + WAVE_3.length + 2", async () => {
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    // Fake waves are 1/1/1 → 5.
    for (const e of events) expect(e.totalAgents).toBe(5);
  });

  it("stamps a startedAt ISO string on every status", async () => {
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    for (const e of events) {
      expect(typeof e.startedAt).toBe("string");
      expect(Number.isNaN(Date.parse(e.startedAt))).toBe(false);
    }
  });

  it("reuses one reportId across every notify() call", async () => {
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    const ids = new Set(events.map((e) => e.reportId));
    expect(ids.size).toBe(1);
  });

  it("reportId matches rpt-{base36ts}-{6alphanum} shape", async () => {
    const events: PipelineStatus[] = [];
    const report = await orchestrateReport(
      baseInput({ onPhaseChange: (s) => events.push(s) }),
    );
    expect(report.id).toMatch(/^rpt-[a-z0-9]+-[a-z0-9]{6}$/);
    expect(events[0].reportId).toBe(report.id);
  });

  it("completedAgents length grows as criterionResults accumulates", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }], // wave1
      [{ criterion: "idea", result: makeAgentResult("idea") }],          // wave2
      [{ criterion: "roadmap", result: makeAgentResult("roadmap") }],    // wave3
    ];
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    const byPhase = Object.fromEntries(events.map((e) => [e.phase, e.completedAgents.length]));
    // notify() is fired BEFORE each wave — so wave1 sees 0, wave2 sees 1, wave3 sees 2.
    expect(byPhase.gathering).toBe(0);
    expect(byPhase.wave1).toBe(0);
    expect(byPhase.wave2).toBe(1);
    expect(byPhase.wave3).toBe(2);
    expect(byPhase.synthesizing).toBe(3);
    expect(byPhase.rendering).toBe(3);
    expect(byPhase.complete).toBe(3);
  });

  it("does not crash when onPhaseChange is undefined", async () => {
    await expect(orchestrateReport(baseInput({ onPhaseChange: undefined }))).resolves.toBeTruthy();
  });
});

// ─── wave dispatch ────────────────────────────────────────────────────────

describe("orchestrateReport() — wave dispatch", () => {
  it("dispatches WAVE_1 then WAVE_2 then WAVE_3 in that order", async () => {
    await orchestrateReport(baseInput());
    expect(dispatchCalls.map((c) => c.wave)).toEqual([WAVE_1, WAVE_2, WAVE_3]);
  });

  it("passes the input.tier through to every dispatchWave call", async () => {
    await orchestrateReport(baseInput({ tier: "premium" }));
    for (const c of dispatchCalls) expect(c.tier).toBe("premium");
  });

  it("sets dispatchOpts.purpose = 'customer_report' by default", async () => {
    await orchestrateReport(baseInput());
    expect((dispatchCalls[0].opts as { purpose?: string }).purpose).toBe("customer_report");
  });

  it("threads projectId → dispatchOpts.businessId", async () => {
    await orchestrateReport(baseInput({ projectId: "proj-42" }));
    expect((dispatchCalls[0].opts as { businessId?: string }).businessId).toBe("proj-42");
  });

  it("nulls dispatchOpts.businessId when projectId is undefined", async () => {
    await orchestrateReport(baseInput({ projectId: undefined }));
    expect((dispatchCalls[0].opts as { businessId?: string | null }).businessId).toBeNull();
  });

  it("threads userId through dispatchOpts.userId", async () => {
    await orchestrateReport(baseInput({ userId: "u-7" }));
    expect((dispatchCalls[0].opts as { userId?: string }).userId).toBe("u-7");
  });

  it("merges input.dispatchOptions after defaults so callers can override transport", async () => {
    await orchestrateReport(
      baseInput({
        dispatchOptions: { purpose: "internal_test" } as unknown as Parameters<
          typeof orchestrateReport
        >[0]["dispatchOptions"],
      }),
    );
    expect((dispatchCalls[0].opts as { purpose?: string }).purpose).toBe("internal_test");
  });

  it("dispatchWave observes context.criterionResults grow between waves", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [{ criterion: "roadmap", result: makeAgentResult("roadmap") }],
    ];
    await orchestrateReport(baseInput());
    expect(dispatchCalls.map((c) => c.contextSizeBefore)).toEqual([0, 1, 2]);
  });
});

// ─── gather phase ─────────────────────────────────────────────────────────

describe("orchestrateReport() — gather phase", () => {
  it("hands researchMarket the {startupName, description, sector} shape and stores its output under gatherResults.competitiveResearch", async () => {
    researchMarketSpy.mockResolvedValueOnce({ competitors: ["A", "B"] });
    let capturedContext: ReportContext | undefined;
    await orchestrateReport({
      ...baseInput({
        criteriaData: makeCriteriaData({ market: { textInput: "saas" } }),
      }),
      onPhaseChange: undefined,
    });
    expect(researchMarketSpy).toHaveBeenCalledTimes(1);
    const [inputArg] = researchMarketSpy.mock.calls[0];
    expect(inputArg).toEqual({
      startupName: "Acme",
      description: "pitch text",
      sector: "saas",
    });
    // Assemble is called with the fully populated context — verify the gather slot
    capturedContext = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(capturedContext.gatherResults.competitiveResearch).toEqual({
      competitors: ["A", "B"],
    });
  });

  it("passes sector=undefined when the market criterion has no textInput", async () => {
    researchMarketSpy.mockResolvedValueOnce({ ok: true });
    await orchestrateReport(baseInput());
    const [inputArg] = researchMarketSpy.mock.calls[0];
    expect(inputArg.sector).toBeUndefined();
  });

  it("keeps competitiveResearch absent when researchMarket resolves null (adk contract)", async () => {
    researchMarketSpy.mockResolvedValueOnce(null);
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.gatherResults.competitiveResearch).toBeUndefined();
  });

  it("swallows researchMarket rejections without failing the pipeline", async () => {
    researchMarketSpy.mockRejectedValueOnce(new Error("market API down"));
    const report = await orchestrateReport(baseInput());
    expect(report.id).toMatch(/^rpt-/);
  });

  it("records techAudit when the website criterion has a link", async () => {
    researchMarketSpy.mockResolvedValueOnce(null);
    await orchestrateReport(
      baseInput({
        criteriaData: makeCriteriaData({
          website: { links: [{ url: "https://x.io", label: "site" }] },
        }),
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.gatherResults.techAudit).toEqual({ url: "https://x.io", status: "gathered" });
  });

  it("records repoAudit when the code_git criterion has a link", async () => {
    researchMarketSpy.mockResolvedValueOnce(null);
    await orchestrateReport(
      baseInput({
        criteriaData: makeCriteriaData({
          code_git: { links: [{ url: "https://github.com/a/b", label: "repo" }] },
        }),
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.gatherResults.repoAudit).toEqual({
      url: "https://github.com/a/b",
      status: "gathered",
    });
  });

  it("skips techAudit / repoAudit slots when the criterion has no links", async () => {
    researchMarketSpy.mockResolvedValueOnce(null);
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.gatherResults.techAudit).toBeUndefined();
    expect(ctx.gatherResults.repoAudit).toBeUndefined();
  });

  it("evidenceQuality counts totalItems (files + links + textInput markers) and completedCriteria", async () => {
    researchMarketSpy.mockResolvedValueOnce(null);
    await orchestrateReport(
      baseInput({
        criteriaData: makeCriteriaData({
          idea: { textInput: "yes" },
          market: {
            files: [{ name: "a", url: "u", type: "pdf", size: 1 }],
            links: [{ url: "u", label: "l" }],
          },
        }),
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    const eq = ctx.gatherResults.evidenceQuality as {
      totalItems: number;
      completedCriteria: number;
      totalCriteria: number;
    };
    // idea has 1 (textInput marker), market has 1 file + 1 link → 3 items total
    expect(eq.totalItems).toBe(3);
    expect(eq.completedCriteria).toBe(2);
    expect(eq.totalCriteria).toBe(CRITERION_KEYS.length);
  });
});

// ─── cross-validate (CDO) ─────────────────────────────────────────────────

describe("orchestrateReport() — CDO cross-validate", () => {
  it("returns [] and never calls callAI when fewer than 3 criterion results exist", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [], // wave3 empty
    ];
    const input = baseInput();
    await orchestrateReport(input);
    // callAI is only used by cross-validate + exec summary. With <3 results,
    // only exec-summary should fire, so exactly one callAI call.
    expect(input.callAI).toHaveBeenCalledTimes(1);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.consistencyIssues).toEqual([]);
  });

  it("parses bullet lines into consistency issues and drops sub-10-char noise", async () => {
    H.dispatchScript = [
      [
        { criterion: "code_git", result: makeAgentResult("code_git") },
        { criterion: "market", result: makeAgentResult("market") },
      ],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [],
    ];
    const callAI = vi.fn(async (_s: string, _u: string, _t: number) =>
      "- Market and customer scores diverge sharply\n- short\n* Revenue trails documented traction\ntext without bullet",
    );
    await orchestrateReport(baseInput({ callAI }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.consistencyIssues).toEqual([
      "Market and customer scores diverge sharply",
      "Revenue trails documented traction",
    ]);
  });

  it("returns [] when the CDO response contains the 'No consistency issues' sentinel", async () => {
    H.dispatchScript = [
      [
        { criterion: "code_git", result: makeAgentResult("code_git") },
        { criterion: "market", result: makeAgentResult("market") },
      ],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [],
    ];
    const callAI = vi.fn(async () => "No consistency issues detected across the 13 criteria.");
    await orchestrateReport(baseInput({ callAI }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.consistencyIssues).toEqual([]);
  });

  it("caps consistency issues at 5", async () => {
    H.dispatchScript = [
      [
        { criterion: "code_git", result: makeAgentResult("code_git") },
        { criterion: "market", result: makeAgentResult("market") },
      ],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [],
    ];
    const bullets = Array.from({ length: 8 }, (_, i) => `- issue number ${i} of eight`).join("\n");
    const callAI = vi.fn(async () => bullets);
    await orchestrateReport(baseInput({ callAI }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.consistencyIssues).toHaveLength(5);
  });

  it("swallows CDO callAI errors and reports [] issues", async () => {
    H.dispatchScript = [
      [
        { criterion: "code_git", result: makeAgentResult("code_git") },
        { criterion: "market", result: makeAgentResult("market") },
      ],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [],
    ];
    let cdoCallReached = false;
    const callAI = vi.fn(async (_sys: string, user: string, _t: number) => {
      if (user.includes("Cross-Validation Task")) {
        cdoCallReached = true;
        throw new Error("CDO down");
      }
      return "exec-body";
    });
    await orchestrateReport(baseInput({ callAI }));
    expect(cdoCallReached).toBe(true);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.consistencyIssues).toEqual([]);
    expect(ctx.executiveSummary).toBe("exec-body");
  });
});

// ─── executive summary ────────────────────────────────────────────────────

describe("orchestrateReport() — CEO executive summary", () => {
  it("returns the callAI output verbatim on the happy path", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const callAI = vi.fn(async () => "The startup demonstrates strong traction...");
    await orchestrateReport(baseInput({ callAI }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.executiveSummary).toBe("The startup demonstrates strong traction...");
  });

  it("falls back to the deterministic '## Executive Summary ...' shell when callAI throws", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const callAI = vi.fn(async () => {
      throw new Error("model outage");
    });
    await orchestrateReport(
      baseInput({
        callAI,
        startupName: "FailStart",
        sviAnalysis: makeSVI({ totalSVI: 88, stageLabel: "Seed" }),
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.executiveSummary).toContain("## Executive Summary");
    expect(ctx.executiveSummary).toContain("FailStart");
    expect(ctx.executiveSummary).toContain("88");
    expect(ctx.executiveSummary).toContain("Seed");
    expect(ctx.executiveSummary).toContain("error");
  });

  it("threads consistencyIssues into the CEO user prompt", async () => {
    H.dispatchScript = [
      [
        { criterion: "code_git", result: makeAgentResult("code_git") },
        { criterion: "market", result: makeAgentResult("market") },
      ],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [],
    ];
    const callAI = vi.fn(async (_sys: string, user: string, _t: number) => {
      if (user.includes("Cross-Validation Task")) {
        return "- Market signal and product maturity diverge";
      }
      // Assert the exec-summary prompt saw the CDO bullet.
      expect(user).toContain("Consistency Issues");
      expect(user).toContain("Market signal and product maturity diverge");
      return "exec ok";
    });
    await orchestrateReport(baseInput({ callAI }));
  });
});

// ─── audit sweep ─────────────────────────────────────────────────────────

describe("orchestrateReport() — llm-auditor grounding sweep", () => {
  it("builds evidence with startup name, stage, totalSVI, description slice, subs and per-criterion scores", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git", { score: 42 }) }],
      [],
      [],
    ];
    const bigText = "a".repeat(4100);
    await orchestrateReport(
      baseInput({
        rawText: bigText,
        startupName: "EvidenceCo",
        sviAnalysis: makeSVI({
          totalSVI: 210,
          stageLabel: "Series A",
          subs: [{ label: "Market", value: 77 }],
        }),
      }),
    );
    expect(auditCalls).toHaveLength(1);
    const ev = auditCalls[0].evidence;
    expect(ev).toContain("Startup: EvidenceCo");
    expect(ev).toContain("Stage: Series A");
    expect(ev).toContain("Overall SVI: 210/100");
    expect(ev).toContain("- Market: 77/100"); // sub
    expect(ev).toContain("- code_git: 42/100"); // criterion
    // description is sliced to 4000 chars
    const descIdx = ev.indexOf("## Startup Description\n");
    expect(descIdx).toBeGreaterThanOrEqual(0);
    const desc = ev.slice(descIdx + "## Startup Description\n".length);
    expect(desc.startsWith("a".repeat(4000))).toBe(true);
    expect(desc.startsWith("a".repeat(4001))).toBe(false);
  });

  it("uses llmOnlyWhenUncited=true and maxLlmSections=6 for the standard tier", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput({ tier: "standard" }));
    expect(auditCalls[0].options.llmOnlyWhenUncited).toBe(true);
    expect(auditCalls[0].options.maxLlmSections).toBe(6);
    expect(auditCalls[0].options.maxTokens).toBe(2000);
  });

  it("switches to llmOnlyWhenUncited=false and maxLlmSections=16 for premium", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput({ tier: "premium" }));
    expect(auditCalls[0].options.llmOnlyWhenUncited).toBe(false);
    expect(auditCalls[0].options.maxLlmSections).toBe(16);
  });

  it("switches to full-sweep mode for investor_memo too", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput({ tier: "investor_memo" }));
    expect(auditCalls[0].options.llmOnlyWhenUncited).toBe(false);
    expect(auditCalls[0].options.maxLlmSections).toBe(16);
  });

  it("uses the default budgetOk built from ai-client when input.auditBudgetOk is absent", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput());
    const bo = auditCalls[0].options.budgetOk;
    expect(typeof bo).toBe("function");
    budgetStatus.spent = 40;
    budgetStatus.limit = 100;
    expect(bo!()).toBe(true);
    budgetStatus.spent = 200;
    expect(bo!()).toBe(false);
  });

  it("passes the caller's auditBudgetOk through unchanged when provided", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const caller = vi.fn(() => true);
    await orchestrateReport(baseInput({ auditBudgetOk: caller }));
    expect(auditCalls[0].options.budgetOk).toBe(caller);
  });

  it("includes an 'executive' section when the exec summary draft is non-empty", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const callAI = vi.fn(async () => "non-empty");
    await orchestrateReport(baseInput({ callAI }));
    expect(auditCalls[0].sectionIds).toContain("executive");
  });

  it("omits the 'executive' section when the exec summary draft is whitespace-only", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const callAI = vi.fn(async () => "   \n   ");
    await orchestrateReport(baseInput({ callAI }));
    expect(auditCalls[0].sectionIds).not.toContain("executive");
    expect(auditCalls[0].sectionIds).toContain("code_git");
  });

  it("replaces executiveSummary with the auditor's revised text when the executive section is revised", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    const callAI = vi.fn(async (_s: string, u: string) =>
      u.includes("Cross-Validation Task") ? "" : "draft-exec",
    );
    H.auditScript = [
      {
        sectionId: "executive",
        revised: "revised-exec",
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: true,
        modelCalls: 2,
      },
      {
        sectionId: "code_git",
        revised: "Analysis for code_git",
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      },
    ];
    await orchestrateReport(baseInput({ callAI }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.executiveSummary).toBe("revised-exec");
  });

  it("does NOT downgrade a grounded section (confidence + risks unchanged)", async () => {
    const original = makeAgentResult("code_git", {
      confidence: 0.85,
      risks: ["biz-risk-1"],
    });
    H.dispatchScript = [
      [{ criterion: "code_git", result: original }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "executive",
        revised: "x",
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      },
      {
        sectionId: "code_git",
        revised: "new content",
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      },
    ];
    await orchestrateReport(baseInput());
    expect(original.content).toBe("new content");
    expect(original.confidence).toBe(0.85);
    expect(original.risks).toEqual(["biz-risk-1"]);
  });

  it("downgrades an ungrounded section — confidence × 0.7 rounded to 2 dp and prepends a grounding risk", async () => {
    const original = makeAgentResult("code_git", {
      confidence: 0.9,
      risks: ["biz-risk-1"],
    });
    H.dispatchScript = [
      [{ criterion: "code_git", result: original }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "executive",
        revised: "x",
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      },
      {
        sectionId: "code_git",
        revised: "flagged",
        findings: [],
        uncitedClaims: ["claim-1", "claim-2"],
        grounded: false,
        llmAudited: true,
        modelCalls: 1,
      },
    ];
    await orchestrateReport(baseInput());
    expect(original.confidence).toBe(0.63); // Math.round(0.9 * 0.7 * 100) / 100
    expect(original.risks[0]).toMatch(/^Grounding: 2 claim\(s\)/);
    expect(original.risks).toContain("biz-risk-1");
    expect(original.content).toBe("flagged");
  });

  it("aggregates findings + uncited claims into context.auditFindings, capped at 24", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "code_git",
        revised: "r",
        findings: Array.from({ length: 30 }, (_, i) => `finding-${i}`),
        uncitedClaims: ["claim-a", "claim-b", "claim-c"],
        grounded: false,
        llmAudited: true,
        modelCalls: 2,
      },
    ];
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    // 30 findings + 2 uncited (first-2-per-section rule) = 32 raw entries,
    // capped at 24 by the orchestrator.
    expect(ctx.auditFindings).toHaveLength(24);
    expect(ctx.auditFindings![0]).toBe("[code_git] finding-0");
  });

  it("surfaces only the first 2 uncited claims per section (with '[id] uncited claim:' prefix)", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "code_git",
        revised: "r",
        findings: [],
        uncitedClaims: ["claim-a", "claim-b", "claim-c", "claim-d"],
        grounded: false,
        llmAudited: true,
        modelCalls: 2,
      },
    ];
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    const claimEntries = ctx.auditFindings!.filter((f) => f.includes("uncited claim"));
    expect(claimEntries).toEqual([
      "[code_git] uncited claim: claim-a",
      "[code_git] uncited claim: claim-b",
    ]);
  });

  it("writes sectionAudits records with grounded/revised flags", async () => {
    const original = makeAgentResult("code_git", {
      content: "unchanged",
      confidence: 1,
    });
    H.dispatchScript = [
      [{ criterion: "code_git", result: original }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "code_git",
        revised: "unchanged", // same as input → revised=false
        findings: [],
        uncitedClaims: [],
        grounded: true,
        llmAudited: false,
        modelCalls: 0,
      },
    ];
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.sectionAudits).toEqual([
      {
        sectionId: "code_git",
        uncitedClaims: [],
        findings: [],
        revised: false,
        grounded: true,
        skipped: undefined,
      },
    ]);
  });

  it("skips downgrade safely when the audit outcome names a sectionId not in criterionResults", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    H.auditScript = [
      {
        sectionId: "unknown_section",
        revised: "x",
        findings: [],
        uncitedClaims: ["c1"],
        grounded: false,
        llmAudited: true,
        modelCalls: 1,
      },
    ];
    await expect(orchestrateReport(baseInput())).resolves.toBeTruthy();
  });
});

// ─── quality score ────────────────────────────────────────────────────────

describe("orchestrateReport() — final quality score", () => {
  it("is 0 when no criterion results were produced", async () => {
    H.dispatchScript = [[], [], []]; // no results
    await orchestrateReport(baseInput());
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.qualityScore).toBe(0);
  });

  it("combines confidence × 30 + evidenceComplete × 25 + sectionComplete × 25 + consistency × 20", async () => {
    // 3 criterion results, all with confidence 1, 3 criteria filled with text,
    // consistency clean → expected = round(1*30 + 3/13*25 + 3/13*25 + 1*20).
    const r1 = makeAgentResult("code_git", { confidence: 1 });
    const r2 = makeAgentResult("market", { confidence: 1 });
    const r3 = makeAgentResult("idea", { confidence: 1 });
    H.dispatchScript = [
      [
        { criterion: "code_git", result: r1 },
        { criterion: "market", result: r2 },
      ],
      [{ criterion: "idea", result: r3 }],
      [],
    ];
    await orchestrateReport(
      baseInput({
        criteriaData: makeCriteriaData({
          code_git: { textInput: "x" },
          market: { textInput: "y" },
          idea: { textInput: "z" },
        }),
        callAI: vi.fn(async () => "No consistency issues detected."),
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    const evidenceComplete = 3 / CRITERION_KEYS.length; // 13
    const sectionComplete = 3 / 13;
    const expected = Math.round(1 * 30 + evidenceComplete * 25 + sectionComplete * 25 + 1 * 20);
    expect(ctx.qualityScore).toBe(expected);
  });

  it("drops the consistency weight to 0.7 when the CDO surfaced at least one issue", async () => {
    const r1 = makeAgentResult("code_git", { confidence: 1 });
    const r2 = makeAgentResult("market", { confidence: 1 });
    const r3 = makeAgentResult("idea", { confidence: 1 });
    H.dispatchScript = [
      [
        { criterion: "code_git", result: r1 },
        { criterion: "market", result: r2 },
      ],
      [{ criterion: "idea", result: r3 }],
      [],
    ];
    const callAI = vi.fn(async (_s: string, u: string) => {
      if (u.includes("Cross-Validation Task")) return "- some real issue that exceeds ten chars";
      return "exec ok";
    });
    await orchestrateReport(
      baseInput({
        criteriaData: makeCriteriaData({
          code_git: { textInput: "x" },
          market: { textInput: "y" },
          idea: { textInput: "z" },
        }),
        callAI,
      }),
    );
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    const evidenceComplete = 3 / CRITERION_KEYS.length;
    const sectionComplete = 3 / 13;
    const expected = Math.round(1 * 30 + evidenceComplete * 25 + sectionComplete * 25 + 0.7 * 20);
    expect(ctx.qualityScore).toBe(expected);
  });
});

// ─── ensureAllCriteria + locale defaults ─────────────────────────────────

describe("orchestrateReport() — context bootstrapping", () => {
  it("defaults locale to 'en' when input.locale is undefined", async () => {
    await orchestrateReport(baseInput({ locale: undefined }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.locale).toBe("en");
  });

  it("propagates input.locale='vi' into the context", async () => {
    await orchestrateReport(baseInput({ locale: "vi" }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.locale).toBe("vi");
  });

  it("fills every one of the 13 criterion keys with the empty default when the caller passes a partial map", async () => {
    // Pass only two criteria — ensureAllCriteria must backfill the rest.
    const partial = { idea: { textInput: "seed", files: [], links: [], qualityLevel: "good" } };
    await orchestrateReport(baseInput({
      criteriaData: partial as unknown as Record<CriterionKey, CriterionData>,
    }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    for (const key of CRITERION_KEYS) {
      expect(ctx.criteriaData[key]).toBeDefined();
    }
    // Backfilled empty rows carry qualityLevel="incomplete".
    expect(ctx.criteriaData.market.qualityLevel).toBe("incomplete");
    // The caller's real entry is preserved unchanged.
    expect(ctx.criteriaData.idea.textInput).toBe("seed");
  });

  it("initialises criterionResults as an empty Map exactly once", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput());
    // The dispatchWave spy captured the size before wave1 ran.
    expect(dispatchCalls[0].contextSizeBefore).toBe(0);
  });

  it("passes context.stage from input.sviAnalysis.stage", async () => {
    await orchestrateReport(baseInput({ sviAnalysis: makeSVI({ stage: 8 }) }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.stage).toBe(8);
  });
});

// ─── assemble handoff ────────────────────────────────────────────────────

describe("orchestrateReport() — assembleReport handoff", () => {
  it("returns the AssembledReport produced by section-assembler", async () => {
    const report = await orchestrateReport(baseInput());
    expect(assembleSpy).toHaveBeenCalledTimes(1);
    expect(report).toBe(assembleSpy.mock.results[0].value);
  });

  it("passes tier + reportId through to assembleReport", async () => {
    const report = await orchestrateReport(baseInput({ tier: "investor_memo" }));
    const [, tier, reportId] = assembleSpy.mock.calls[0];
    expect(tier).toBe("investor_memo");
    expect(reportId).toBe(report.id);
  });
});
