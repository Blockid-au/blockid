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
    assembleSpy: null as null | ReturnType<typeof vi.fn<(context: unknown, tier: unknown, reportId: string) => unknown>>,
    researchMarketSpy: vi.fn(),
    budgetStatus: { spent: 0, limit: 100 },
    // G13-W2-R2: W4 capture. `chapterFactory` builds the 8 stub chapters the
    // mocked dispatchDimensionChapters stores; `w4Calls` records its options.
    w4Calls: [] as Array<{ tier: string; opts: Record<string, unknown> }>,
    deterministicCalls: [] as string[],
    chapterFactory: null as null | ((dim: string) => unknown),
    w4HangAfter: null as null | number,
    // G28-B: when set, the wave / W4 mocks route every task through the
    // metered `callAI` the orchestrator hands them (so a fake provider chain
    // with timeouts, the strike ledger and the stage hint are exercised).
    waveUseCallAI: false,
    w4UseCallAI: false,
    techAuditSpy: vi.fn(async (url: string) => ({ url, auditedAt: "2026-09-16T00:00:00.000Z", overallGrade: "B", evidenceLabels: [] })),
    repoAuditSpy: vi.fn(async (name: string) => ({ repoFullName: name, auditedAt: "2026-09-16T00:00:00.000Z", overallGrade: "A", evidenceLabels: [] })),
  };
});

/** §C.9 gate issues the orchestrator appends deterministically — filtered where a test pins the CDO output. */
const GATE_RE = /reconciled to the deterministic|stage \d+ band|\[unevidenced\] marker|phase blocker/i;
const nonGate = (issues: string[] | undefined) => (issues ?? []).filter((d) => !GATE_RE.test(d));
/** The summary before the deterministic "Phase blockers" block the gate appends. */
const beforeBlockers = (summary: string | undefined) => (summary ?? "").split("\n\n**Phase blockers")[0];
/** In-band CFO valuation stub for the Growth-stage fixture (stage 5 band A$25M–A$400M). */
const IN_BAND_VC = {
  blended: { lowAud: 60_000_000, midAud: 100_000_000, highAud: 160_000_000, confidence: 60 },
  methods: [],
  scenarios: { bear: 40_000_000, base: 100_000_000, bull: 200_000_000 },
  inputs: { mrrAud: 0, arrAud: 0 },
};

const DIMS = ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"] as const;
function stubChapter(dim: string, extra: Record<string, unknown> = {}) {
  return { dim, title: dim.toUpperCase(), score: 60, band: "developing", verdict: `${dim} verdict`, strengths: [], gaps: [], criteria: [], evidence: [], degraded: false, ...extra };
}

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
  buildEvidenceRows: vi.fn((context: ReportContext) => {
    context.evidenceRows = context.evidenceRows ?? [];
    return context.evidenceRows;
  }),
  // G24-D: the computed rows are re-stamped after the valuation chapter; the mock keeps the register as is.
  refreshComputedFactRows: vi.fn((context: ReportContext) => {
    context.evidenceRows = context.evidenceRows ?? [];
    return context.evidenceRows;
  }),
  deterministicDimensionChapters: vi.fn((context: ReportContext, _tier: string, reason: string) => {
    H.deterministicCalls.push(reason);
    const map = new Map();
    DIMS.forEach((d) => map.set(d, stubChapter(d, { degraded: true, degradeReason: reason })));
    context.dimensionChapters = map as ReportContext["dimensionChapters"];
    return map;
  }),
  dispatchDimensionChapters: vi.fn(async (context: ReportContext, tier: string, callAIArg: unknown, opts: Record<string, unknown>) => {
    H.w4Calls.push({ tier, opts });
    // S-R3: like the real dispatcher, write into the map the orchestrator
    // handed us (context.dimensionChapters) and honour `opts.dims`.
    const map = (context.dimensionChapters ?? new Map()) as Map<string, unknown>;
    context.dimensionChapters = map as ReportContext["dimensionChapters"];
    const dims = Array.isArray(opts.dims) && opts.dims.length ? (opts.dims as string[]) : [...DIMS];
    const emit = (d: string) => {
      const chapter = H.chapterFactory ? H.chapterFactory(d) : stubChapter(d);
      map.set(d, chapter);
      (opts.onChapter as ((dim: string, c: unknown) => void) | undefined)?.(d, chapter);
    };
    if (H.w4UseCallAI) {
      // G28-B: one metered call per chapter, in parallel; a throw = a degraded card.
      const callAI = callAIArg as (s: string, u: string, m: number) => Promise<string>;
      await Promise.all(dims.map(async (d) => {
        let chapter: unknown;
        try {
          await callAI(`sys-${d}`, "user", 1_500);
          chapter = stubChapter(d);
        } catch (err) {
          chapter = stubChapter(d, { degraded: true, degradeReason: `schema/model: ${err instanceof Error ? err.message : String(err)}` });
        }
        if ((opts.isExpired as (() => boolean) | undefined)?.()) return;
        map.set(d, chapter);
        (opts.onChapter as ((dim: string, c: unknown) => void) | undefined)?.(d, chapter);
      }));
      return map;
    }
    if (H.w4HangAfter !== null) {
      // A hung provider: the first N chapters land, the rest never resolve.
      dims.slice(0, H.w4HangAfter).forEach(emit);
      return new Promise<never>(() => {});
    }
    dims.forEach(emit);
    return map;
  }),
  dispatchWave: vi.fn(async (
    wave: unknown,
    context: ReportContext,
    tier: ReportTier,
    callAIArg: unknown,
    opts: unknown,
  ) => {
    H.dispatchCalls.push({
      wave,
      contextSizeBefore: context.criterionResults.size,
      tier,
      opts,
    });
    if (H.waveUseCallAI) {
      // G28-B: one metered call per task, in parallel, like the real dispatchWave.
      const callAI = callAIArg as (s: string, u: string, m: number) => Promise<string>;
      const tasks = wave as Array<{ criterion: string }>;
      const results = await Promise.all(tasks.map(async (t) => {
        try {
          const text = await callAI(`sys-${t.criterion}`, "user", 1_000);
          return { criterion: t.criterion, ok: true, text };
        } catch (err) {
          return { criterion: t.criterion, ok: false, text: err instanceof Error ? err.message : String(err) };
        }
      }));
      if ((opts as { isExpired?: () => boolean }).isExpired?.()) return;
      for (const r of results) {
        context.criterionResults.set(r.criterion as CriterionKey, { criterion: r.criterion, agentRole: "ceo", score: 60, content: r.text, highlights: [], dataPoints: {}, risks: [], nextSteps: [], visuals: [], confidence: 0.8, wordCount: 100, durationMs: 1, degraded: !r.ok } as unknown as AgentAnalysisResult);
      }
      return;
    }
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
  AUDITOR_CAP_BY_TIER: { free: 4, standard: 8, premium: 16, investor_memo: 16 },
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

// S-R3: GATHER is real now — its I/O is injected through `gatherDeps` in
// baseInput (no db, deterministic in-band valuation) and the audit modules
// are mocked so a test can never reach the network.
vi.mock("@/lib/rnd-input", () => ({ deepTechAudit: (url: string) => H.techAuditSpy(url) }));
vi.mock("@/lib/github-repo-audit", () => ({ auditGitHubRepo: (name: string, token: string) => H.repoAuditSpy(name, token) }));

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
import { orchestrateReport, assertReportUsable, moneyOnTableFromGather, PIPELINE_VERSION } from "./orchestrator";
import type { GatherDeps } from "./gather";

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
    recordSpend: false,
    gatherDeps: { db: null, buildValuation: () => IN_BAND_VC, githubToken: async () => "gh-token" },
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
  H.w4Calls.length = 0;
  H.deterministicCalls.length = 0;
  H.chapterFactory = null;
  H.w4HangAfter = null;
  H.waveUseCallAI = false;
  H.w4UseCallAI = false;
  delete process.env.REPORT_PIPELINE_W4;
  delete process.env.REPORT_DEADLINE_MS_STANDARD;
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
      "wave4",
      "synthesizing",
      "rendering",
      "complete",
    ]);
    expect(events.map((e) => e.progress)).toEqual([5, 15, 45, 75, 80, 85, 95, 100]);
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
    expect(byPhase.wave4).toBe(3);
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
    const capturedContext = assembleSpy.mock.calls[0][0] as ReportContext;
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
    expect(H.techAuditSpy).toHaveBeenCalledWith("https://x.io");
    expect(ctx.gatherResults.techAudit).toMatchObject({ url: "https://x.io", status: "audited", overallGrade: "B" });
    // (buildEvidenceRows is mocked here; the real one merges gatherEvidenceRows — see agent-dispatcher.test.)
    expect(ctx.gatherEvidenceRows?.some((r) => r.label === "Technical audit: https://x.io" && r.source === "url")).toBe(true);
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
    expect(H.repoAuditSpy).toHaveBeenCalledWith("a/b", "gh-token");
    expect(ctx.gatherResults.repoAudit).toMatchObject({ url: "https://github.com/a/b", repoFullName: "a/b", status: "audited" });
    expect(ctx.gatherEvidenceRows?.some((r) => r.label === "GitHub repository audit: a/b" && r.source === "github")).toBe(true);
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

describe("orchestrateReport() — CDO cross-validate (one LLM call at premium+; deterministic at standard / free)", () => {
  it("returns [] and never calls callAI when fewer than 3 criterion results exist", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [{ criterion: "idea", result: makeAgentResult("idea") }],
      [], // wave3 empty
    ];
    const input = baseInput({ tier: "premium" });
    await orchestrateReport(input);
    // callAI is only used by cross-validate + exec summary. With <3 results,
    // only exec-summary should fire, so exactly one callAI call.
    expect(input.callAI).toHaveBeenCalledTimes(1);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(nonGate(ctx.consistencyIssues)).toEqual([]);
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
    await orchestrateReport(baseInput({ callAI, tier: "premium" }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(nonGate(ctx.consistencyIssues)).toEqual([
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
    await orchestrateReport(baseInput({ callAI, tier: "premium" }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(nonGate(ctx.consistencyIssues)).toEqual([]);
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
    await orchestrateReport(baseInput({ callAI, tier: "premium" }));
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(nonGate(ctx.consistencyIssues)).toHaveLength(5);
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
    await orchestrateReport(baseInput({ callAI, tier: "premium" }));
    expect(cdoCallReached).toBe(true);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(nonGate(ctx.consistencyIssues)).toEqual([]);
    expect(beforeBlockers(ctx.executiveSummary)).toBe("exec-body");
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
    expect(beforeBlockers(ctx.executiveSummary)).toBe("The startup demonstrates strong traction...");
    // §C.9 gate 4: the phase blockers the summary omitted are appended deterministically.
    expect(ctx.executiveSummary).toMatch(/\*\*Phase blockers — /);
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
  it("G24-D: builds the critic evidence with startup name, stage, SVI index, the FULL description, every criterion's founder text, per-criterion scores and the citable id list", async () => {
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
        criteriaData: makeCriteriaData({ code_git: { textInput: "Monorepo with 240 unit tests" } }),
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
    expect(ev).toContain("SVI index: 210 (open-ended, base 100)");
    expect(ev).not.toContain("210/100"); // the index is uncapped — never "/100"
    expect(ev).toContain("- code_git: 42/100"); // criterion score
    // the whole description (the 4,000-char slice hid the raise / legal paragraphs from the critic)
    const descIdx = ev.indexOf("## Startup description (founder-submitted)\n");
    expect(descIdx).toBeGreaterThanOrEqual(0);
    const desc = ev.slice(descIdx + "## Startup description (founder-submitted)\n".length);
    expect(desc.startsWith("a".repeat(4100))).toBe(true);
    // the per-criterion founder text the writers were given
    expect(ev).toContain("## Founder evidence per criterion (founder-submitted)");
    expect(ev).toContain("### code_git\nMonorepo with 240 unit tests");
    // G28-A: the computed / knowledge rows with their provenance — the critic
    // is told where each platform figure comes from (module or source URL).
    expect(ev).toContain("## Platform knowledge and computed rows — PROVENANCE");
    expect(ev).toContain("SVI scores (computed by the platform)\n  provenance: computed by svi-analysis.ts");
    expect(ev).toMatch(/ASIC and IP Australia fees: [^\n]+\n  provenance: platform knowledge — https:\/\/asic\.gov\.au\//);
    expect(ev).toContain("content: ASIC annual review fee (proprietary company");
    // no market text in this fixture → no sector entity count row is ever shown to the critic
    expect(ev).not.toContain("Sector entity count:");
    // (the mocked dispatcher leaves the register empty, so no CITABLE IDS block here — criticEvidenceFor is pinned directly below)
  });

  it("uses llmOnlyWhenUncited=true and maxLlmSections=8 for the standard tier (cap raised 6 → 8 for the 8 chapters)", async () => {
    H.dispatchScript = [
      [{ criterion: "code_git", result: makeAgentResult("code_git") }],
      [],
      [],
    ];
    await orchestrateReport(baseInput({ tier: "standard" }));
    expect(auditCalls[0].options.llmOnlyWhenUncited).toBe(true);
    expect(auditCalls[0].options.maxLlmSections).toBe(8);
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
    // Wrapped with the per-report call budget (remaining ≥ 2) — the caller is consulted on every check.
    const bo = auditCalls[0].options.budgetOk!;
    caller.mockClear();
    expect(bo()).toBe(true);
    expect(caller).toHaveBeenCalledTimes(1);
    caller.mockReturnValue(false);
    expect(bo()).toBe(false);
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
    expect(beforeBlockers(ctx.executiveSummary)).toBe("revised-exec");
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
        llmAudited: false,
        hadIssues: undefined,
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
    // The §C.9 gate appends the phase-blockers issue here (incomplete criteria), so consistency = 0.7.
    const consistency = (ctx.consistencyIssues?.length ?? 0) === 0 ? 1 : 0.7;
    expect(nonGate(ctx.consistencyIssues)).toEqual([]);
    const expected = Math.round(1 * 30 + evidenceComplete * 25 + sectionComplete * 25 + consistency * 20);
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
        tier: "premium",
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

// ─── G13-W2-R2: W4 + call budget + events ────────────────────────────────

import { ReportCallBudget, TIER_CALL_MAX, meterCallAI, type PipelineEvent } from "./orchestrator";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

describe("orchestrateReport() — W4 dimension chapters", () => {
  it("runs dispatchDimensionChapters once with the tier, tierV2, callBudget and budgetOk threaded through", async () => {
    await orchestrateReport(baseInput({ tier: "standard" }));
    expect(H.w4Calls).toHaveLength(1);
    expect(H.w4Calls[0].tier).toBe("standard");
    const opts = H.w4Calls[0].opts;
    expect(opts.tierV2).toBe("standard");
    expect(typeof (opts.callBudget as { tryAcquire: unknown }).tryAcquire).toBe("function");
    expect(typeof opts.budgetOk).toBe("function");
    expect(typeof opts.onChapter).toBe("function");
  });

  it("REPORT_PIPELINE_W4=off skips W4 entirely (13-criteria assembly, no wave4 phase, no chapters)", async () => {
    process.env.REPORT_PIPELINE_W4 = "off";
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ onPhaseChange: (s) => events.push(s) }));
    expect(H.w4Calls).toHaveLength(0);
    expect(events.map((e) => e.phase)).not.toContain("wave4");
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.dimensionChapters).toBeUndefined();
  });

  it("degrades W4 to deterministic cards (zero owner calls) when the monthly budget is exhausted", async () => {
    await orchestrateReport(baseInput({ auditBudgetOk: () => false }));
    expect(H.w4Calls).toHaveLength(0);
    expect(H.deterministicCalls).toHaveLength(1);
    expect(H.deterministicCalls[0]).toMatch(/monthly AI cap/);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.dimensionChapters?.size).toBe(8);
  });

  it("degrades W4 to deterministic cards when the per-report call cap is already spent", async () => {
    // maxCalls = 0 → the very first wave call throws inside the metered callAI;
    // the mocked dispatchWave never calls it, so the cap is hit at W4.
    await orchestrateReport(baseInput({ maxCalls: 0 }));
    expect(H.w4Calls).toHaveLength(0);
    expect(H.deterministicCalls[0]).toMatch(/report call cap \(0\)/);
  });

  it("free tier: skips W2 (static waves) and W3, still runs the 8 owners as W4 with tierV2=free", async () => {
    const events: PipelineStatus[] = [];
    await orchestrateReport(baseInput({ tierV2: "free", onPhaseChange: (s) => events.push(s) }));
    expect(dispatchCalls).toHaveLength(1);
    expect(events.map((e) => e.phase)).toEqual(["gathering", "wave1", "wave4", "synthesizing", "rendering", "complete"]);
    expect(H.w4Calls[0].opts.tierV2).toBe("free");
  });

  it("attaches a ReportV2 projection with the 8 pipeline chapters and source=pipeline when the chapters validate", async () => {
    const demo = demoReportV2();
    H.chapterFactory = (dim) => demo.dimensions.find((d) => d.dim === dim)!;
    const report = await orchestrateReport(baseInput());
    expect(report.reportV2).toBeTruthy();
    expect(report.reportV2?.source).toBe("pipeline");
    expect(report.reportV2?.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(report.reportV2?.dimensions.map((d) => d.dim)).toEqual([...DIMS]);
    expect(report.reportV2?.quality.degradedSections).toEqual([]);
    expect(typeof report.llmCalls).toBe("number");
  });

  it("keeps the adapter projection (source=adapter) when the pipeline chapters fail schema validation — never a failed report", async () => {
    const report = await orchestrateReport(baseInput());
    expect(report.reportV2).toBeTruthy();
    expect(report.reportV2?.source).toBe("adapter");
    expect(report.reportV2?.dimensions).toHaveLength(8);
  });
});

describe("orchestrateReport() — per-report call counter (D7/D8/D9)", () => {
  it("TIER_CALL_MAX pins free 16 / standard 30 / premium 40 / investor_memo 48", () => {
    expect(TIER_CALL_MAX).toEqual({ free: 16, standard: 30, premium: 40, investor_memo: 48 });
  });

  it("ReportCallBudget hard-stops at max and reports used / remaining", () => {
    const b = new ReportCallBudget(2);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(false);
    expect(b.used).toBe(2);
    expect(b.remaining).toBe(0);
  });

  it("meterCallAI counts every call and throws CallBudgetExceededError past the max", async () => {
    const b = new ReportCallBudget(1);
    const inner = vi.fn(async () => "ok");
    const metered = meterCallAI(inner, b);
    await expect(metered("s", "u", 10)).resolves.toBe("ok");
    await expect(metered("s", "u", 10)).rejects.toThrow(/budget exhausted \(1\)/);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("the CEO summary degrades to the deterministic shell (never a failed report) once the cap is hit", async () => {
    const callAI = vi.fn(async () => "exec ok");
    const report = await orchestrateReport(baseInput({ callAI, maxCalls: 0 }));
    expect(callAI).not.toHaveBeenCalled();
    expect(report.executiveSummary).toContain("Executive summary generation encountered an error");
    expect(report.llmCalls).toBe(0);
  });

  it("W2 review P1: all 8 chapters degraded + placeholder summary → report.fullyDegraded (D9: the orchestrator still returns; assertReportUsable throws for the persisting callers)", async () => {
    H.chapterFactory = (d) => stubChapter(d, { degraded: true, degradeReason: "budget: cap" });
    const callAI = vi.fn(async () => "exec ok");
    const report = await orchestrateReport(baseInput({ callAI, maxCalls: 0 }));
    H.chapterFactory = null;
    expect(report.fullyDegraded).toBe(true);
    expect(() => assertReportUsable(report)).toThrow(/fully degraded/);
  });

  it("G15-R3.4: a fully degraded report records one {ts, project_hash, reason, llm_calls} event through the injected writer + one structured log line; a usable report records nothing", async () => {
    const { createHash } = await import("node:crypto");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    H.chapterFactory = (d) => stubChapter(d, { degraded: true, degradeReason: "budget: cap" });
    const degradedWriter = vi.fn();
    const callAI = vi.fn(async () => "exec ok");
    const report = await orchestrateReport(baseInput({ callAI, maxCalls: 0, projectId: "proj-1", degradedWriter }));
    H.chapterFactory = null;
    expect(report.fullyDegraded).toBe(true);
    expect(degradedWriter).toHaveBeenCalledTimes(1);
    const ev = degradedWriter.mock.calls[0][0] as { ts: string; project_hash: string; reason: string; llm_calls: number };
    expect(Object.keys(ev).sort()).toEqual(["llm_calls", "project_hash", "reason", "ts"]);
    expect(ev.project_hash).toBe(createHash("sha256").update("proj-1").digest("hex").slice(0, 12));
    expect(ev.reason).toBe("no_llm_calls");
    expect(ev.llm_calls).toBe(0);
    expect(Number.isNaN(Date.parse(ev.ts))).toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[report-pipeline] fully_degraded"))).toEqual([
      `[report-pipeline] fully_degraded project=${ev.project_hash} reason=no_llm_calls llm_calls=0`,
    ]);
    warn.mockRestore();

    const quietWriter = vi.fn();
    const ok = await orchestrateReport(baseInput({ degradedWriter: quietWriter }));
    expect(ok.fullyDegraded).toBe(false);
    expect(quietWriter).not.toHaveBeenCalled();
  });

  it("a placeholder summary alone (chapters fine) is still a usable report", async () => {
    // Chapters come from the mocked W4 (not degraded); only the CEO call fails.
    const callAI = vi.fn(async () => {
      throw new Error("model outage");
    });
    const report = await orchestrateReport(baseInput({ callAI }));
    expect(report.executiveSummary).toContain("encountered an error");
    expect(report.fullyDegraded).toBe(false);
    expect(() => assertReportUsable(report)).not.toThrow();
  });

  it("reports llmCalls = number of metered calls (CEO only on a clean standard run)", async () => {
    const report = await orchestrateReport(baseInput());
    expect(report.llmCalls).toBe(1);
  });
});

describe("orchestrateReport() — onEvent SSE vocabulary (§C.12)", () => {
  it("emits context → gather_complete → 8× dimension_start → 8× dimension_complete → criteria_synthesis → executive_complete → audit_complete → valuation_complete → done, with progress interleaved", async () => {
    const events: PipelineEvent[] = [];
    await orchestrateReport(baseInput({ onEvent: (e) => events.push(e) }));
    const types = events.map((e) => e.type).filter((t) => t !== "progress");
    expect(types.slice(0, 2)).toEqual(["context", "gather_complete"]);
    expect(types.filter((t) => t === "dimension_start")).toHaveLength(8);
    expect(types.filter((t) => t === "dimension_complete")).toHaveLength(8);
    expect(types.indexOf("criteria_synthesis")).toBeGreaterThan(types.lastIndexOf("dimension_complete"));
    expect(types.indexOf("executive_complete")).toBeGreaterThan(types.indexOf("criteria_synthesis"));
    expect(types.indexOf("audit_complete")).toBeGreaterThan(types.indexOf("executive_complete"));
    expect(types[types.length - 1]).toBe("done");
    expect(events.filter((e) => e.type === "progress").length).toBeGreaterThanOrEqual(7);
    const ctxEvent = events.find((e) => e.type === "context") as Extract<PipelineEvent, { type: "context" }>;
    expect(ctxEvent.tier).toBe("standard");
    expect(ctxEvent.estimatedCalls).toBeLessThanOrEqual(30);
    const done = events.find((e) => e.type === "done") as Extract<PipelineEvent, { type: "done" }>;
    expect(done.calls).toBe(1);
    expect(done.costAud).toBeGreaterThanOrEqual(0);
    // G23-A: the grounding counters ride on `done` (0 here — the mocked dispatcher never overruns, trims or auto-cites).
    expect(done).toMatchObject({ budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
  });

  it("emits an error event (degraded:true) for every degraded chapter and never throws on a listener error", async () => {
    H.chapterFactory = (dim) => stubChapter(dim, { degraded: true, degradeReason: "schema/model: boom" });
    const events: PipelineEvent[] = [];
    await expect(
      orchestrateReport(
        baseInput({
          onEvent: (e) => {
            events.push(e);
            if (e.type === "done") throw new Error("listener exploded");
          },
        }),
      ),
    ).resolves.toBeTruthy();
    expect(events.filter((e) => e.type === "error")).toHaveLength(8);
  });
});

// ─── S-R3: wall-clock deadline, cost telemetry, partial re-run, valuation ──

import { CostMeter, DEADLINE_GRACE_MS, TIER_DEADLINE_MS, callMaxForTier, deadlineMsForTier, estimateCalls, realCostAud } from "./orchestrator";

describe("orchestrateReport() — wall-clock deadline (W2 review a)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TIER_DEADLINE_MS pins free 90 s / standard 120 s / premium 240 s / investor_memo 240 s; REPORT_DEADLINE_MS_<TIER> overrides", () => {
    expect(TIER_DEADLINE_MS).toEqual({ free: 90_000, standard: 120_000, premium: 240_000, investor_memo: 240_000 });
    expect(deadlineMsForTier("standard")).toBe(120_000);
    process.env.REPORT_DEADLINE_MS_STANDARD = "45000";
    expect(deadlineMsForTier("standard")).toBe(45_000);
    process.env.REPORT_DEADLINE_MS_STANDARD = "garbage";
    expect(deadlineMsForTier("standard")).toBe(120_000);
    // Every tier finishes inside nginx's 300 s cap for /api/ with the grace budget.
    Object.values(TIER_DEADLINE_MS).forEach((ms) => expect(ms + DEADLINE_GRACE_MS).toBeLessThanOrEqual(300_000));
  });

  // G19-S46: the offline self-report widens the cap through the environment; the interactive default is untouched.
  it("TIER_CALL_MAX pins free 16 / standard 30 / premium 40 / investor_memo 48; REPORT_CALL_MAX_<TIER> overrides (positive integers only)", () => {
    expect(TIER_CALL_MAX).toEqual({ free: 16, standard: 30, premium: 40, investor_memo: 48 });
    expect(callMaxForTier("standard")).toBe(30);
    process.env.REPORT_CALL_MAX_STANDARD = "48";
    expect(callMaxForTier("standard")).toBe(48);
    expect(callMaxForTier("free")).toBe(16);
    process.env.REPORT_CALL_MAX_STANDARD = "0";
    expect(callMaxForTier("standard")).toBe(30);
    process.env.REPORT_CALL_MAX_STANDARD = "garbage";
    expect(callMaxForTier("standard")).toBe(30);
    delete process.env.REPORT_CALL_MAX_STANDARD;
  });

  it("a hung provider mid-W4: the landed chapters stay, the rest degrade deterministically, the summary is deterministic (no LLM), the auditor LLM pass is off and `done` fires before deadline + grace", async () => {
    vi.useFakeTimers();
    H.w4HangAfter = 3;
    const events: PipelineEvent[] = [];
    let doneAt = 0;
    const hungCallAI = vi.fn(() => new Promise<string>(() => {}));
    const t0 = Date.now();
    const run = orchestrateReport(
      baseInput({
        callAI: hungCallAI,
        deadlineMs: 1_000,
        onEvent: (e) => {
          events.push(e);
          if (e.type === "done") doneAt = Date.now();
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(1_050);
    const report = await run;

    expect(doneAt - t0).toBeGreaterThanOrEqual(1_000);
    expect(doneAt - t0).toBeLessThanOrEqual(1_000 + DEADLINE_GRACE_MS);
    const completes = events.filter((e): e is Extract<PipelineEvent, { type: "dimension_complete" }> => e.type === "dimension_complete");
    expect(completes).toHaveLength(8);
    expect(completes.filter((e) => !e.chapter.degraded).map((e) => e.dim)).toEqual(["tre", "mpc", "ftv"]);
    const degraded = completes.filter((e) => e.chapter.degraded);
    expect(degraded).toHaveLength(5);
    expect(degraded.every((e) => /deadline: wall-clock budget \(1 s\) reached during W4/.test(e.chapter.degradeReason ?? ""))).toBe(true);
    expect(events.filter((e) => e.type === "error")).toHaveLength(5);
    // The CEO summary never waited on the hung provider.
    expect(hungCallAI).not.toHaveBeenCalled();
    expect(report.executiveSummary).toContain("Deterministic summary (deadline)");
    expect(report.executiveSummary).not.toContain("encountered an error");
    expect(report.fullyDegraded).toBe(false);
    // Auditor: only the free citation gate — the LLM pass is switched off by the budget predicate.
    expect(auditCalls[0].options.budgetOk?.()).toBe(false);
    const done = events.find((e): e is Extract<PipelineEvent, { type: "done" }> => e.type === "done")!;
    expect(done.deadlineHit).toBe(true);
    // G29-B: the wave whose race the deadline won.
    expect(done.deadlineHitPhase).toBe("wave4");
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect([...ctx.dimensionChapters!.values()].filter((c) => c.degraded).map((c) => c.dim)).toEqual(["ptd", "cgh", "iri", "lco", "svm"]);
    const ctxEvent = events.find((e): e is Extract<PipelineEvent, { type: "context" }> => e.type === "context")!;
    expect(ctxEvent.estimatedSeconds).toBe(1);
  });

  it("a deadline before W4 degrades every chapter → fully degraded (never charged)", async () => {
    vi.useFakeTimers();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    H.researchMarketSpy.mockImplementationOnce(() => gate.then(() => null));
    const events: PipelineEvent[] = [];
    const run = orchestrateReport(baseInput({ deadlineMs: 500, onEvent: (e) => events.push(e), gatherDeps: { db: null, buildValuation: () => IN_BAND_VC, timeoutMs: 20_000 } }));
    await vi.advanceTimersByTimeAsync(600);
    const report = await run;
    release!();
    expect(H.deterministicCalls[0]).toMatch(/deadline: wall-clock budget \(1 s\) reached before W4/);
    expect(events.filter((e) => e.type === "dimension_complete")).toHaveLength(8);
    expect(events.filter((e) => e.type === "error")).toHaveLength(8);
    // W3 review P1: a deadline that degraded EVERY chapter is a fully degraded
    // report even though the deterministic summary is not the placeholder —
    // the persisting callers must not charge for it.
    expect(report.fullyDegraded).toBe(true);
    expect((events.at(-1) as Extract<PipelineEvent, { type: "done" }>).deadlineHit).toBe(true);
    // G29-B: the deadline fired while GATHER was still racing the hung research call.
    expect((events.at(-1) as Extract<PipelineEvent, { type: "done" }>).deadlineHitPhase).toBe("gathering");
  });

  it("the deadline timer is disposed — no open handle keeps the process alive after a fast report", async () => {
    vi.useFakeTimers();
    await orchestrateReport(baseInput({ deadlineMs: 60_000 }));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("orchestrateReport() — cost telemetry (W2 review b)", () => {
  it("sums the real cost_usd / provider the transport reports into the done event (AUD at AI_USD_AUD_RATE)", async () => {
    const callAI = vi.fn(async () => ({ text: "exec", costUsd: 0.02, provider: "deepinfra", model: "m" }));
    const events: PipelineEvent[] = [];
    process.env.AI_USD_AUD_RATE = "1.5";
    try {
      await orchestrateReport(baseInput({ callAI, onEvent: (e) => events.push(e) }));
    } finally {
      delete process.env.AI_USD_AUD_RATE;
    }
    const done = events.find((e): e is Extract<PipelineEvent, { type: "done" }> => e.type === "done")!;
    expect(done.calls).toBe(1);
    expect(done.costReportedCalls).toBe(1);
    expect(done.costUsd).toBe(0.02);
    expect(done.costAud).toBe(0.03);
  });

  it("a plain-string transport keeps the per-call estimate for the unreported calls", () => {
    const meter = new CostMeter();
    expect(realCostAud(meter, 3, true, "standard")).toEqual({ usd: expect.any(Number), aud: 0.003 });
    meter.record({ text: "", costUsd: 0.01, provider: "claude-apikey" });
    meter.record({ text: "", costUsd: 0.005, provider: "deepinfra" });
    meter.record({ text: "" }); // no cost reported — not counted as reported
    expect(meter.reported).toBe(2);
    expect(meter.byProvider).toEqual({ "claude-apikey": 0.01, deepinfra: 0.005 });
    const mixed = realCostAud(meter, 3, false, "free");
    expect(mixed.usd).toBeCloseTo(0.015 + 0.001 / 1.55, 4);
    expect(mixed.aud).toBeCloseTo(0.015 * 1.55 + 0.001, 3);
  });

  it("estimatedCalls includes the 2 GATHER research calls (W2 review e) and is just the chapters on a partial run", () => {
    expect(estimateCalls({ waves: 13, w4Chapters: 8, tierV2: "standard", partial: false })).toBe(2 + 13 + 8 + 1);
    expect(estimateCalls({ waves: 13, w4Chapters: 8, tierV2: "premium", partial: false })).toBe(2 + 13 + 8 + 1 + 1);
    expect(estimateCalls({ waves: 0, w4Chapters: 1, tierV2: "standard", partial: true })).toBe(1);
    // Free: W1 (6) + W4 (8) + CEO (1) = 15 ≤ 16 — the research agent does not run on the free tier.
    expect(estimateCalls({ waves: 6, w4Chapters: 8, tierV2: "free", partial: false })).toBe(15);
  });

  it("the free tier skips the GATHER research agent so the 16-call cap leaves the CEO summary its unit", async () => {
    await orchestrateReport(baseInput({ tierV2: "free" }));
    expect(researchMarketSpy).not.toHaveBeenCalled();
    await orchestrateReport(baseInput({ tierV2: "standard" }));
    expect(researchMarketSpy).toHaveBeenCalledTimes(1);
  });
});

describe("orchestrateReport() — per-dimension re-run (dims) + valuation event", () => {
  it("dims:['cgh'] skips W1–W3 and the CEO / auditor LLM calls, seeds the stored criterion cards, runs W4 for one dim only", async () => {
    const demo = demoReportV2();
    const seed = demo.dimensions.flatMap((d) => d.criteria);
    const callAI = vi.fn(async () => "never");
    const events: PipelineEvent[] = [];
    const report = await orchestrateReport(baseInput({ dims: ["cgh"], seedCriteria: seed, callAI, onEvent: (e) => events.push(e) }));
    expect(dispatchCalls).toHaveLength(0);
    expect(researchMarketSpy).not.toHaveBeenCalled();
    expect(callAI).not.toHaveBeenCalled();
    expect(H.w4Calls[0].opts.dims).toEqual(["cgh"]);
    expect(events.filter((e) => e.type === "dimension_start")).toHaveLength(1);
    expect(events.filter((e) => e.type === "dimension_complete").map((e) => (e as Extract<PipelineEvent, { type: "dimension_complete" }>).dim)).toEqual(["cgh"]);
    const ctxEvent = events.find((e): e is Extract<PipelineEvent, { type: "context" }> => e.type === "context")!;
    expect(ctxEvent.dims).toEqual(["cgh"]);
    expect(ctxEvent.estimatedCalls).toBe(1);
    const ctx = assembleSpy.mock.calls[0][0] as ReportContext;
    expect(ctx.criterionResults.size).toBe(new Set(seed.map((c) => c.key)).size);
    expect(ctx.dimsFilter).toEqual(["cgh"]);
    expect(report.executiveSummary).toContain("partial re-run");
    expect(auditCalls[0].options.budgetOk?.()).toBe(false);
  });

  it("missing revenue emits an unavailable valuation without failing the report", async () => {
    const events: PipelineEvent[] = [];
    const buildValuation = vi.fn(() => IN_BAND_VC);
    const report = await orchestrateReport(baseInput({
      sviAnalysis: { ...makeSVI(), signals: {} },
      gatherDeps: { db: null, buildValuation },
      onEvent: (event) => events.push(event),
    }));
    expect(buildValuation).not.toHaveBeenCalled();
    expect(events.find((event) => event.type === "valuation_complete")).toMatchObject({ chapter: { status: "unavailable" } });
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(report.reportV2).not.toBeNull();
    expect(report.reportV2?.valuation).toMatchObject({ status: "unavailable", visuals: [] });
    expect(report.reportV2?.valuation).not.toHaveProperty("consensus");
    expect(report.reportV2?.cover.threeQuestions.worth).not.toContain("A$");
  });

  it("valuation_complete (the §C.5 chapter from GATHER's CFO model) is emitted after the 8 chapters and before criteria_synthesis, and lands on report.reportV2.valuation", async () => {
    const demo = demoReportV2();
    H.chapterFactory = (dim) => demo.dimensions.find((d) => d.dim === dim)!;
    const events: PipelineEvent[] = [];
    // This event fixture requires an actual supplied revenue input. Missing
    // revenue must not invoke the CFO builder through its zero default.
    const sviAnalysis = { ...makeSVI(), signals: { mrrAud: 8000 } };
    const report = await orchestrateReport(baseInput({ sviAnalysis, onEvent: (e) => events.push(e) }));
    const types = events.map((e) => e.type).filter((t) => t !== "progress");
    expect(types.indexOf("valuation_complete")).toBeGreaterThan(types.lastIndexOf("dimension_complete"));
    expect(types.indexOf("valuation_complete")).toBeLessThan(types.indexOf("criteria_synthesis"));
    const val = events.find((e): e is Extract<PipelineEvent, { type: "valuation_complete" }> => e.type === "valuation_complete")!;
    expect(val.chapter.methods).toHaveLength(7);
    expect(val.chapter.consensus.midAud).toBe(100_000_000);
    expect(report.reportV2?.valuation.consensus.midAud).toBe(100_000_000);
    // G19-S42: the stub CFO row carries no method rows, so the chapter says so instead of claiming five.
    expect(report.reportV2?.valuation.narrative).toMatch(/^Directional consensus \(no valuation method ran\)/);
    expect(report.reportV2?.valuation.crossChecks?.length).toBeGreaterThanOrEqual(1);
  });
});

describe("orchestrateReport() — Money on the Table from GATHER (G19-S43)", () => {
  it("gathered grants / programs land on report.reportV2.moneyOnTable (pipeline and adapter projections); no grant profile → empty with the profile CTA subtitle", async () => {
    const demo = demoReportV2();
    H.chapterFactory = (dim) => demo.dimensions.find((d) => d.dim === dim)!;
    // Every loader is injected, so the db only has to be non-null (gather gates its sources on it).
    const db = { from: () => ({ select: () => { throw new Error("no db in this test"); }, upsert: async () => ({ error: null }) }) } as unknown as NonNullable<GatherDeps["db"]>;
    const withGrants = await orchestrateReport(
      baseInput({
        gatherDeps: {
          db,
          buildValuation: () => IN_BAND_VC,
          githubToken: async () => "gh-token",
          loadConnectorSignals: async () => [],
          loadConnectedRevenue: async () => [],
          loadCapTable: async () => null,
          loadFounderSignals: async () => null,
          loadFounderExecution: async () => null,
          loadGa4Snapshot: async () => null,
          loadExternalSignals: async () => ({ abn: null, rows: [] }),
          loadDimensionEvidence: async () => [],
          loadGrants: async () => ({ grants: [{ id: "rdti", name: "R&D Tax Incentive", amountAud: 87_000, fit: 84, url: "https://business.gov.au/rdti" }], programs: [{ id: "startmate", name: "Startmate", amountAud: 120_000, deadline: "2026-10-15", fit: 58 }], profileState: "NSW", rdSpendAud: 200_000 }),
        },
      }),
    );
    expect(withGrants.reportV2?.source).toBe("pipeline");
    expect(withGrants.reportV2?.moneyOnTable.grants).toEqual([{ id: "rdti", name: "R&D Tax Incentive", amountAud: 87_000, fit: 84, url: "https://business.gov.au/rdti" }]);
    expect(withGrants.reportV2?.moneyOnTable.programs[0]).toMatchObject({ id: "startmate", deadline: "2026-10-15" });
    expect(withGrants.reportV2?.moneyOnTable.totalAud).toBe(207_000);
    expect(withGrants.reportV2?.moneyOnTable.visuals[0].dataState).toBe("real");
    // GATHER minted the partial grants row (the "grant profile" CTA never appears when matched); buildEvidenceRows is mocked here, so read the gather rows.
    const ctx = assembleSpy.mock.calls[assembleSpy.mock.calls.length - 1][0] as ReportContext;
    expect(ctx.gatherEvidenceRows?.some((r) => r.label.startsWith("Grants & programs match") && r.status === "partial")).toBe(true);
    expect(ctx.gatherEvidenceRows?.some((r) => r.label === "Grant profile")).toBe(false);

    const none = await orchestrateReport(baseInput());
    expect(none.reportV2?.moneyOnTable.grants).toEqual([]);
    expect(none.reportV2?.moneyOnTable.visuals[0].subtitle).toMatch(/No grant profile yet/);
    expect(moneyOnTableFromGather({ gatherResults: {} })).toBeNull();
    expect(moneyOnTableFromGather({ gatherResults: { grants: { grants: [{ id: "x", name: "X", amountAud: "n/a", fit: "7" }], programs: "nope" } } })).toEqual({ grants: [{ id: "x", name: "X", amountAud: null, fit: 0 }], programs: [] });
  });
});

// ─── G28-B — provider resilience: per-stage timeouts, run-scoped strikes, W4 reserve ───

import { createRunStrikeLedger, type RunStrikeLedger } from "@/lib/ai/run-strikes";
import { pipelineCallTimeouts, type PipelineCallHint } from "./pipeline-timeouts";
import type { AICallerInput } from "./orchestrator";

/**
 * A fake provider chain shaped like ai-client's: the primary is dead (every
 * attempt ends in a worker timeout after the caller's per-model timeout), the
 * secondary answers after `answerMs`. It honours the strike ledger exactly as
 * callAI does — a struck provider is not dialled again in this run — and the
 * call budget the hint carries (no attempt outlives the run's wall clock).
 */
function fakeProviderChain(ledger: RunStrikeLedger, opts: { answerMs?: number } = {}) {
  const answerMs = opts.answerMs ?? 2_000;
  const dialed: string[] = [];
  const hints: PipelineCallHint[] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const callAI: AICallerInput = async (_sys, _user, _max, _cls, hint) => {
    hints.push(hint!);
    const { timeoutMs, budgetMs } = pipelineCallTimeouts(hint);
    const deadlineAt = Date.now() + (budgetMs ?? Number.POSITIVE_INFINITY);
    let lastErr: Error | null = null;
    for (const provider of ["deepinfra", "gemini"]) {
      if (ledger.struck(provider)) continue;
      if (Date.now() >= deadlineAt) { lastErr = new Error("AI call budget exhausted"); break; }
      dialed.push(provider);
      const attemptMs = Math.min(timeoutMs, Math.max(1_000, deadlineAt - Date.now()));
      if (provider === "deepinfra") {
        await sleep(attemptMs);
        lastErr = new Error(`Worker timeout (${Math.round(attemptMs / 1000)}s)`);
        ledger.note(provider, lastErr);
        continue;
      }
      await sleep(Math.min(answerMs, attemptMs));
      return { text: "prose from gemini", provider, costUsd: 0.001 };
    }
    throw lastErr ?? new Error("All AI providers failed");
  };
  return { callAI, dialed, hints };
}

describe("orchestrateReport() — G28-B provider resilience (fake clock, dead primary provider)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dead primary: ≥ 7 prose chapters land inside a 480 s budget, the primary is dialled exactly twice (run-scoped strike) and every W1–W3 call ran on the 60 s criterion timeout", async () => {
    vi.useFakeTimers();
    H.waveUseCallAI = true;
    H.w4UseCallAI = true;
    const ledger = createRunStrikeLedger();
    const chain = fakeProviderChain(ledger);
    const events: PipelineEvent[] = [];
    const degradedWriter = vi.fn();
    const run = orchestrateReport(baseInput({ callAI: chain.callAI, deadlineMs: 480_000, maxCalls: 48, degradedWriter, onEvent: (e) => events.push(e) }));
    await vi.advanceTimersByTimeAsync(480_000 + DEADLINE_GRACE_MS);
    const report = await run;

    const done = events.find((e): e is Extract<PipelineEvent, { type: "done" }> => e.type === "done")!;
    expect(done.deadlineHit).toBe(false);
    // W1 45 s + 2 s, W2 45 s + 2 s (second strike), W3 2 s, W4 2 s, summary 2 s — nowhere near 480 s.
    expect(done.totalMs).toBeLessThan(200_000);
    const chapters = [...(assembleSpy.mock.calls[0][0] as ReportContext).dimensionChapters!.values()];
    expect(chapters.filter((c) => !c.degraded)).toHaveLength(8);
    expect(report.fullyDegraded).toBe(false);
    expect(degradedWriter).not.toHaveBeenCalled();
    // Run-scoped strike: two worker timeouts → deepinfra skipped for the rest of the run.
    expect(chain.dialed.filter((p) => p === "deepinfra")).toHaveLength(2);
    expect(ledger.struck("deepinfra")).toBe(true);
    expect(ledger.snapshot().deepinfra).toEqual({ strikes: 2, timeout: 2, overloaded: 0 });
    // Stage hints: 3 criterion calls (W1–W3), 8 chapter calls, then synthesis.
    const stages = chain.hints.map((h) => h.stage);
    expect(stages.slice(0, 3)).toEqual(["criterion", "criterion", "criterion"]);
    expect(stages.filter((s) => s === "chapter")).toHaveLength(8);
    expect(stages.at(-1)).toBe("synthesis");
    // Criterion calls carry the SOFT remaining clock (deadline − W4 reserve), chapters the hard one.
    expect(chain.hints[0].remainingMs).toBeLessThanOrEqual(480_000 - 120_000);
    expect(chain.hints.find((h) => h.stage === "chapter")!.remainingMs).toBeGreaterThan(480_000 - 120_000 - 100_000);
    // Criterion attempts cap at 60 s; chapter / synthesis keep 120 s while the remaining clock is wide.
    expect(chain.hints.every((h) => pipelineCallTimeouts(h).timeoutMs === (h.stage === "criterion" ? 60_000 : 120_000))).toBe(true);
  });

  it("strikes reset per run: a fresh ledger dials the primary again", async () => {
    vi.useFakeTimers();
    H.waveUseCallAI = true;
    H.w4UseCallAI = true;
    for (let run = 0; run < 2; run += 1) {
      const ledger = createRunStrikeLedger();
      const chain = fakeProviderChain(ledger);
      const p = orchestrateReport(baseInput({ callAI: chain.callAI, deadlineMs: 480_000, maxCalls: 48 }));
      await vi.advanceTimersByTimeAsync(480_000 + DEADLINE_GRACE_MS);
      await p;
      expect(chain.dialed.filter((x) => x === "deepinfra")).toHaveLength(2);
      expect(ledger.strikes("deepinfra")).toBe(2);
    }
  });

  it("W4 reserve: a hung W1 stops at deadline − reserve, W4 still lands 8 prose chapters and the run is not fully degraded", async () => {
    vi.useFakeTimers();
    H.waveUseCallAI = true;
    H.w4UseCallAI = true;
    const ledger = createRunStrikeLedger();
    // Primary dead AND the secondary hangs for criterion calls only — nothing W1 can do.
    let hang = true;
    const inner = fakeProviderChain(ledger, { answerMs: 1_000 });
    const callAI: AICallerInput = async (sys, user, max, cls, hint) => {
      if (hint?.stage === "criterion" && hang) return new Promise<never>(() => {});
      return inner.callAI(sys, user, max, cls, hint);
    };
    const events: PipelineEvent[] = [];
    const run = orchestrateReport(baseInput({ callAI, deadlineMs: 100_000, w4ReserveMs: 50_000, maxCalls: 48, onEvent: (e) => events.push(e) }));
    // W1 hangs; the soft deadline (50 s) hands the run to W4.
    await vi.advanceTimersByTimeAsync(50_500);
    hang = false;
    expect(events.some((e) => e.type === "dimension_start")).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    const report = await run;
    const done = events.find((e): e is Extract<PipelineEvent, { type: "done" }> => e.type === "done")!;
    expect(done.deadlineHit).toBe(false);
    // G29-B: the SOFT deadline (W4 reserve) won W1's race — named even though the hard deadline never fired.
    expect(done.deadlineHitPhase).toBe("wave1");
    expect(done.totalMs).toBeGreaterThanOrEqual(50_000);
    expect(done.totalMs).toBeLessThan(100_000);
    const chapters = [...(assembleSpy.mock.calls[0][0] as ReportContext).dimensionChapters!.values()];
    expect(chapters.filter((c) => !c.degraded)).toHaveLength(8);
    expect(report.fullyDegraded).toBe(false);
    // The hung W1 call never wrote a criterion result (isExpired = soft deadline).
    expect((assembleSpy.mock.calls[0][0] as ReportContext).criterionResults.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("≥ 7 degraded chapters → fullyDegraded (`mostly_degraded`), ONE digest event; 6 degraded → a usable report", async () => {
    const seven = vi.fn();
    H.chapterFactory = (dim) => (dim === "svm" ? stubChapter(dim) : stubChapter(dim, { degraded: true, degradeReason: "schema/model: timeout" }));
    const report7 = await orchestrateReport(baseInput({ degradedWriter: seven }));
    expect(report7.fullyDegraded).toBe(true);
    expect(() => assertReportUsable(report7)).toThrow(/report fully degraded/);
    expect(seven).toHaveBeenCalledTimes(1);
    expect((seven.mock.calls[0][0] as { reason: string }).reason).toBe("mostly_degraded");

    const six = vi.fn();
    H.chapterFactory = (dim) => (dim === "svm" || dim === "lco" ? stubChapter(dim) : stubChapter(dim, { degraded: true, degradeReason: "schema/model: timeout" }));
    const report6 = await orchestrateReport(baseInput({ degradedWriter: six }));
    expect(report6.fullyDegraded).toBe(false);
    expect(six).not.toHaveBeenCalled();
  });

  it("meterCallAI: inside the W4 reserve a late criterion call (W1 repair) is refused, a chapter / synthesis call is not; hints carry soft vs hard remaining clocks", async () => {
    vi.useFakeTimers();
    const { meterCallAI, ReportCallBudget, ReportDeadline } = await import("./orchestrator");
    const budget = new ReportCallBudget(10);
    const deadline = new ReportDeadline(100_000, Date.now(), 40_000);
    const seen: PipelineCallHint[] = [];
    const inner: AICallerInput = async (_s, _u, _m, _c, hint) => { seen.push(hint!); return "ok"; };
    const criterion = meterCallAI(inner, budget, { deadline, stage: "criterion" });
    const chapter = meterCallAI(inner, budget, { deadline, stage: "chapter" });
    const synthesis = meterCallAI(inner, budget, { deadline, stage: "synthesis" });
    await vi.advanceTimersByTimeAsync(10_000);
    await criterion("s", "u", 100);
    expect(seen[0]).toEqual({ stage: "criterion", remainingMs: 50_000 });
    await vi.advanceTimersByTimeAsync(50_500);
    expect(deadline.softExpired()).toBe(true);
    expect(deadline.expired()).toBe(false);
    await expect(criterion("s", "u", 100)).rejects.toThrow(/deadline exceeded \(60000 ms\)/);
    await chapter("s", "u", 100);
    await synthesis("s", "u", 100);
    expect(seen.slice(1).map((h) => h.stage)).toEqual(["chapter", "synthesis"]);
    expect(seen[1].remainingMs).toBe(39_500);
    // The refused call did not consume the call budget.
    expect(budget.used).toBe(3);
    deadline.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the W4 reserve defaults to min(120 s, deadline / 2) and can be overridden per run", async () => {
    vi.useFakeTimers();
    H.waveUseCallAI = true;
    const ledger = createRunStrikeLedger();
    const chain = fakeProviderChain(ledger, { answerMs: 10 });
    const p1 = orchestrateReport(baseInput({ callAI: chain.callAI, deadlineMs: 480_000 }));
    await vi.advanceTimersByTimeAsync(200_000);
    await p1;
    expect(chain.hints[0].remainingMs).toBeLessThanOrEqual(360_000);
    expect(chain.hints[0].remainingMs).toBeGreaterThan(300_000);
    const ledger2 = createRunStrikeLedger();
    const chain2 = fakeProviderChain(ledger2, { answerMs: 10 });
    const p2 = orchestrateReport(baseInput({ callAI: chain2.callAI, deadlineMs: 120_000 }));
    await vi.advanceTimersByTimeAsync(120_000);
    await p2;
    // 120 s deadline → reserve capped at 60 s.
    expect(chain2.hints[0].remainingMs).toBeLessThanOrEqual(60_000);
    expect(chain2.hints[0].remainingMs).toBeGreaterThan(50_000);
  });
});
