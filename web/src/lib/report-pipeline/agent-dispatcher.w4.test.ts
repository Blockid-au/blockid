// W4 dimension-chapter dispatch (G13-W2-R2, spec §C.1 / §C.9 / §C.11).
//
// Real callStructured (schema parse + ONE repair pass + ai_runs row) on a
// scripted transport: a valid chapter payload lands as a DimensionChapter;
// garbage twice → deterministic `degraded` card; an owner-proposed chart
// with untraceable numbers is rejected by the provenance pass; the
// per-report call budget stops owner calls without failing the wave.

import { beforeEach, describe, expect, it, vi } from "vitest";

type InsertedRow = Record<string, unknown>;
let inserted: InsertedRow[] = [];
let insertCounter = 0;

function fakeSupabase() {
  return {
    from(table: string) {
      if (table !== "ai_runs") throw new Error("unexpected table " + table);
      let payload: InsertedRow = {};
      const api = {
        insert(row: InsertedRow) {
          payload = row;
          return api;
        },
        select() {
          return api;
        },
        async single() {
          insertCounter += 1;
          const id = `run-${insertCounter}`;
          inserted.push({ id, ...payload });
          return { data: { id }, error: null };
        },
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeSupabase(),
}));

// prompt_versions lookup (only the TTL + G24-B tests reach it — every other case injects resolvePromptVersionId).
const registerCalls: Array<{ agent: string; defaults: { version: string; model: string; purpose: string } }> = [];
vi.mock("@/lib/ai/prompt-registry", () => ({
  readCurrentPrompt: async (agent: string) => ({ id: `pv-${agent}`, variables: {} }),
  readOrRegisterPrompt: async (agent: string, defaults: { version: string; model: string; purpose: string }) => {
    registerCalls.push({ agent, defaults });
    return { id: `pv-${agent}`, variables: {} };
  },
}));

import {
  DimensionChapterPayload,
  NIL_PROMPT_VERSION_ID,
  PROMPT_VERSION_CACHE_TTL_MS,
  peekPromptVersionCache,
  resetPromptVersionCache,
  buildEvidenceRows,
  deterministicDimensionChapters,
  dispatchDimensionChapters,
  ensureCitationSuffix,
  evidenceRowsForDim,
  taskClassForChapter,
  w4OutputContract,
  type CallBudget,
} from "./agent-dispatcher";
import { CHAPTER_CACHE_HIT_MODULE_ID, memoryChapterCache } from "./chapter-cache";
import { DIM_ORDER, DIMENSION_OWNERS, benchmarkFor, benchmarkStageForSvi, type DimKey } from "./dimension-owners";
import type { CriterionData, ReportContext } from "./types";
import type { StructuredModelCaller } from "@/lib/ai/call-structured";
import { CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { reportV2Schema } from "@/lib/report-v2/schema";

const RAW_TEXT =
  "Acme Rail is an Australian SaaS platform for freight scheduling. " +
  "Two co-founders, both ex-Atlassian engineers. Paying pilot customers in Sydney. MRR A$12,000.";

function makeContext(): ReportContext {
  const svi = computeSVI(extractSignals({ rawText: RAW_TEXT }));
  const criteriaData = {} as Record<CriterionKey, CriterionData>;
  CRITERION_KEYS.forEach((key) => {
    criteriaData[key] = { textInput: "", files: [], links: [], qualityLevel: "incomplete" };
  });
  criteriaData.code_git = { textInput: "Monorepo, 240 unit tests, CI runs on every push.", files: [], links: [{ url: "https://github.com/acme/rail", label: "GitHub" }], qualityLevel: "good" };
  criteriaData.revenue = { textInput: "MRR A$12,000 from 9 paying customers.", files: [], links: [], qualityLevel: "good" };
  return {
    accountId: "acc-1",
    userId: "user-1",
    startupName: "Acme Rail",
    rawText: RAW_TEXT,
    sviAnalysis: svi,
    evidenceItems: [],
    criteriaData,
    stage: svi.stage,
    locale: "en",
    gatherResults: {},
    criterionResults: new Map(),
  };
}

function validChapter(dim: DimKey, context: ReportContext, extra: Record<string, unknown> = {}): string {
  const rows = evidenceRowsForDim(context, dim);
  const id = rows[0]?.evidence_id ?? "none";
  const det = context.sviAnalysis.dimensionScores?.[dim] ?? 50;
  return JSON.stringify({
    dim,
    verdict: `${DIMENSION_OWNERS[dim].title} is developing with thin evidence [ev:${id}].`,
    score_adjustment: { proposed: Math.round(det) + 4, deterministic: Math.round(det), reason: "evidence supports a small lift" },
    strengths: [`Founders are ex-Atlassian engineers [ev:${id}]`, "Paying pilots exist [unevidenced]"],
    gaps: ["No cohort data yet [unevidenced]", `Only one connector [ev:${id}]`],
    next_action: { title: "Connect Stripe", window: "30d", expected_lift: 4, evidence_to_add: "stripe" },
    criterion_cards: [],
    frameworks_used: [DIMENSION_OWNERS[dim].frameworks[0]],
    confidence: 0.7,
    hallucination_risk: "low",
    ...extra,
  });
}

function scripted(responsesByDim: (dim: DimKey, n: number) => string): { caller: StructuredModelCaller; calls: number; byDim: Map<DimKey, number> } {
  const state = { calls: 0, byDim: new Map<DimKey, number>() };
  const caller: StructuredModelCaller = async ({ messages }) => {
    state.calls += 1;
    const user = messages[0].content;
    const m = user.match(/"dim": "(\w+)"/);
    const dim = (m?.[1] ?? "tre") as DimKey;
    const n = (state.byDim.get(dim) ?? 0) + 1;
    state.byDim.set(dim, n);
    return { ok: true, text: responsesByDim(dim, n), tokensIn: 100, tokensOut: 50 };
  };
  return { caller, get calls() { return state.calls; }, byDim: state.byDim };
}

const baseOpts = { resolvePromptVersionId: async () => NIL_PROMPT_VERSION_ID, resolvePromptTemplate: async () => null, knowledgeDb: null };

beforeEach(() => {
  inserted = [];
  insertCounter = 0;
  delete process.env.MODEL_AGENT_CEO;
  delete process.env.MODEL_AGENT_CFO;
});

describe("dispatchDimensionChapters — §C.8 chapter cache (S-R5)", () => {
  it("second run with unchanged evidence serves all 8 chapters from the cache (0 owner calls, hit marker); changed evidence misses; re-runs bypass", async () => {
    const cache = memoryChapterCache();
    const scope = { projectId: "proj-1", pipelineVersion: "pipeline-test" };
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context));
    const first = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, chapterCache: cache, chapterCacheScope: scope });
    expect(s.calls).toBe(8);
    expect(cache.size).toBe(8);
    expect(first.get("tre")!.modules.some((m) => m.id === CHAPTER_CACHE_HIT_MODULE_ID)).toBe(false);

    const again = makeContext();
    const second = await dispatchDimensionChapters(again, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, chapterCache: cache, chapterCacheScope: scope });
    expect(s.calls).toBe(8); // no new owner calls
    DIM_ORDER.forEach((dim) => {
      const c = second.get(dim)!;
      expect(c.verdict).toBe(first.get(dim)!.verdict);
      expect(c.modules.some((m) => m.id === CHAPTER_CACHE_HIT_MODULE_ID)).toBe(true);
    });

    // A changed evidence catalogue for one dimension → that chapter misses, the rest still hit.
    const changed = makeContext();
    changed.gatherEvidenceRows = [{ evidence_id: "ev-new-stripe", source: "stripe", label: "Stripe revenue (last sync)", status: "evidenced", value: "mrr_aud = 9000", dims: ["tre"] }];
    await dispatchDimensionChapters(changed, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, chapterCache: cache, chapterCacheScope: scope });
    expect(s.calls).toBe(9);
    expect(cache.size).toBe(9);

    // Per-dimension re-run bypasses the cache even with unchanged evidence.
    await dispatchDimensionChapters(makeContext(), "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, chapterCache: cache, chapterCacheScope: scope, chapterCacheBypass: true, dims: ["mpc"] });
    expect(s.calls).toBe(10);

    // No projectId → no caching at all.
    await dispatchDimensionChapters(makeContext(), "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, chapterCache: cache, chapterCacheScope: { projectId: null, pipelineVersion: "pipeline-test" } });
    expect(s.calls).toBe(18);
  });

  it("degraded cards are never cached", async () => {
    const cache = memoryChapterCache();
    const context = makeContext();
    const caller: StructuredModelCaller = async () => ({ ok: false, reason: "transport down" });
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: caller, chapterCache: cache, chapterCacheScope: { projectId: "proj-1", pipelineVersion: "v" } });
    expect(chapters.get("tre")!.degraded).toBe(true);
    expect(cache.size).toBe(0);
  });
});

describe("dispatchDimensionChapters — happy path", () => {
  it("runs the 8 owners once each and stores schema-valid chapters on the context", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    expect(chapters.size).toBe(8);
    expect(s.calls).toBe(8);
    expect(context.dimensionChapters).toBe(chapters);
    const dimSchema = reportV2Schema.shape.dimensions;
    const parsed = dimSchema.safeParse(DIM_ORDER.map((d) => chapters.get(d)));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 3))).toBe(true);
    DIM_ORDER.forEach((dim) => {
      const c = chapters.get(dim)!;
      expect(c.ownerAgent).toBe(DIMENSION_OWNERS[dim].primary);
      expect(c.degraded).toBeUndefined();
      expect(c.primaryVisual.svg).toContain("role=\"img\"");
      expect(c.runIds).toHaveLength(1);
      expect(c.renderAs).toBe("full");
      expect(c.modules.some((m) => m.id.includes("benchmarkFor"))).toBe(true);
    });
    // ai_runs rows: one per owner call, model label = the owner tier (CEO / CFO → opus-class label).
    expect(inserted).toHaveLength(8);
    expect(inserted.every((r) => r.purpose === "customer_report")).toBe(true);
    expect(inserted.filter((r) => r.model === "claude-opus-5")).toHaveLength(2);
  });

  it("clamps the owner score to ±10 of the deterministic score and records a scoreNote", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context, { score_adjustment: { proposed: 99, deterministic: 50, reason: "over-optimistic" } }));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const tre = chapters.get("tre")!;
    const det = Math.round(context.sviAnalysis.dimensionScores?.tre ?? 0);
    expect(tre.proposedScore).toBe(99);
    expect(tre.score).toBe(Math.min(100, det + 10));
    expect(tre.scoreNote).toMatch(/reconciled/);
  });

  // G19-S41 — the engine ledger travels with every chapter and into the owner's user turn.
  it("copies the SVI ledger onto each chapter (scoreBreakdown), hands scoreLedger to the owner prompt with the 'never invent a signal' rule, and renders an unassessed dimension as pending", async () => {
    const context = makeContext();
    const users: string[] = [];
    const caller: StructuredModelCaller = async ({ messages, system }) => {
      users.push(`${system ?? ""}\n${messages[0].content}`);
      const m = messages[0].content.match(/"dim": "(\w+)"/);
      return { ok: true, text: validChapter((m?.[1] ?? "tre") as DimKey, context), tokensIn: 100, tokensOut: 50 };
    };
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: caller });
    // Acme Rail: co-founders + MRR A$12,000 → FTV and TRE are assessed; the prose never mentions a cap table → CGH is a pure baseline.
    const ftv = chapters.get("ftv")!;
    const ftvSub = context.sviAnalysis.subs.find((s) => s.key === "ftv")!;
    expect(ftv.scoreBreakdown).toBeDefined();
    expect(ftv.scoreBreakdown!.assessed).toBe(true);
    expect(ftv.scoreBreakdown!.signals).toEqual(ftvSub.breakdown);
    expect(ftv.scoreBreakdown!.adjustment).toBe(ftvSub.adjustment);
    expect(ftv.scoreBreakdown!.confidenceMultiplier).toBe(context.sviAnalysis.confidenceMultiplier);
    expect(ftv.band).not.toBe("pending");
    const cgh = chapters.get("cgh")!;
    expect(context.sviAnalysis.subs.find((s) => s.key === "cgh")!.assessed).toBe(false);
    expect(cgh.scoreBreakdown).toMatchObject({ assessed: false, signals: [], base: 40 });
    expect(cgh.band).toBe("pending");
    expect(cgh.benchmark.percentile).toBeNull();
    // The owner turn carries the ledger (base, signals, confidence, adjustment, assessed) and the rule.
    const ftvTurn = users.find((u) => u.includes('"dim": "ftv"'))!;
    expect(ftvTurn).toContain('"scoreLedger"');
    expect(ftvTurn).toContain(ftvSub.breakdown![0].signal);
    expect(ftvTurn).toContain('"assessed": true');
    expect(ftvTurn).toMatch(/never invent a signal/i);
    expect(ftvTurn).toMatch(/Explain the score using scoreLedger/);
    const cghTurn = users.find((u) => u.includes('"dim": "cgh"'))!;
    expect(cghTurn).toContain('"assessed": false');
    // Schema-valid with the ledger on board.
    const parsed = reportV2Schema.shape.dimensions.safeParse(DIM_ORDER.map((d) => chapters.get(d)));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 3))).toBe(true);
  });

  it("streams every chapter through onChapter (SSE dimension_complete)", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context));
    const seen: DimKey[] = [];
    await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, onChapter: (dim) => seen.push(dim) });
    expect([...seen].sort()).toEqual([...DIM_ORDER].sort());
  });

  it("free tier: chapters 6–9 use the card contract (renderAs=card) and 2–5 stay full", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context, { strengths: ["one [unevidenced]"], gaps: ["one [unevidenced]"] }));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, tierV2: "free" });
    expect(DIM_ORDER.map((d) => chapters.get(d)!.renderAs)).toEqual(["full", "full", "full", "full", "card", "card", "card", "card"]);
  });
});

describe("dispatchDimensionChapters — repair then degraded card", () => {
  it("garbage twice → ONE repair pass, then a deterministic degraded card (report never fails)", async () => {
    const context = makeContext();
    const s = scripted((dim) => (dim === "cgh" ? "this is not json at all" : validChapter(dim, context)));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    expect(s.byDim.get("cgh")).toBe(2); // first + repair
    const cgh = chapters.get("cgh")!;
    expect(cgh.degraded).toBe(true);
    expect(cgh.degradeReason).toMatch(/schema|model/);
    expect(cgh.primaryVisual.kind).toBe("donut");
    expect(cgh.primaryVisual.svg).toContain("<title");
    expect(cgh.verdict.length).toBeGreaterThan(10);
    // Non-degraded siblings are untouched.
    expect(chapters.get("tre")!.degraded).toBeUndefined();
    expect(chapters.size).toBe(8);
  });

  it("a transport error yields a degraded card and the wave still completes", async () => {
    const context = makeContext();
    const caller: StructuredModelCaller = async () => ({ ok: false, status: "model_error", reason: "provider down" });
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: caller });
    expect(chapters.size).toBe(8);
    DIM_ORDER.forEach((d) => expect(chapters.get(d)!.degraded).toBe(true));
  });
});

describe("dispatchDimensionChapters — budget guards", () => {
  it("callBudget: every model call (first + repair) draws from the counter; past the cap → degraded, zero further calls", async () => {
    const context = makeContext();
    let used = 0;
    const budget: CallBudget = { max: 3, get used() { return used; }, tryAcquire: () => (used < 3 ? (used += 1, true) : false) };
    const s = scripted((dim) => validChapter(dim, context));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, callBudget: budget });
    // One unit is always held back for the CEO summary → 2 chapter calls on a cap of 3.
    expect(s.calls).toBe(2);
    const degraded = DIM_ORDER.filter((d) => chapters.get(d)!.degraded);
    expect(degraded).toHaveLength(6);
    expect(chapters.get(degraded[0])!.degradeReason).toMatch(/budget/);
  });

  it("orchestrator path: an already-metered callAI is NOT metered a second time — 8 chapters cost exactly 8 budget units (W2 review P0)", async () => {
    const context = makeContext();
    const { ReportCallBudget, meterCallAI } = await import("./orchestrator");
    const budget = new ReportCallBudget(30);
    let raw = 0;
    const callAI = meterCallAI(async (_system: string, user: string) => {
      raw += 1;
      const m = user.match(/"dim": "(\w+)"/);
      return validChapter((m?.[1] ?? "tre") as DimKey, context);
    }, budget);
    const chapters = await dispatchDimensionChapters(context, "standard", callAI, { ...baseOpts, callBudget: budget });
    expect(raw).toBe(8);
    expect(budget.used).toBe(8);
    expect(DIM_ORDER.filter((d) => chapters.get(d)!.degraded)).toHaveLength(0);
  });

  it("budgetOk=false: no owner call at all, 8 deterministic cards", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller, budgetOk: () => false });
    expect(s.calls).toBe(0);
    DIM_ORDER.forEach((d) => expect(chapters.get(d)!.degradeReason).toMatch(/monthly/));
  });

  it("deterministicDimensionChapters builds 8 schema-valid degraded cards with zero calls", () => {
    const context = makeContext();
    const chapters = deterministicDimensionChapters(context, "standard", "W4 off");
    const parsed = reportV2Schema.shape.dimensions.safeParse(DIM_ORDER.map((d) => chapters.get(d)));
    expect(parsed.success).toBe(true);
    expect(chapters.get("svm")!.degradeReason).toBe("W4 off");
  });
});

describe("dispatchDimensionChapters — visuals from module outputs, never from prose", () => {
  it("rejects an owner-proposed chart whose numbers are not traceable (deterministic chart + provenance note)", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context, { primary_visual: { kind: "bar", data_state: "real", title: "Made-up bars", series: [{ label: "Commits", value: 4242 }, { label: "Tests", value: 9999 }] } }));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const ptd = chapters.get("ptd")!;
    expect(ptd.primaryVisual.title).not.toBe("Made-up bars");
    expect(ptd.primaryVisual.dataState).not.toBe("real");
    expect(ptd.scoreNote).toMatch(/provenance/);
  });

  it("accepts an owner-proposed chart when its kind is allowed and every number is in the inputs", async () => {
    const context = makeContext();
    const s = scripted((dim) => {
      if (dim !== "ptd") return validChapter(dim, context);
      const bench = benchmarkFor("ptd", benchmarkStageForSvi(context.stage));
      return validChapter(dim, context, { primary_visual: { kind: "bar", data_state: "benchmark_only", title: "Score vs p50", series: [{ label: "p25", value: bench.p25 }, { label: "p50", value: bench.p50 }] } });
    });
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const ptd = chapters.get("ptd")!;
    expect(ptd.primaryVisual.title).toBe("Score vs p50");
    expect(ptd.primaryVisual.kind).toBe("bar");
    expect(ptd.primaryVisual.dataState).toBe("benchmark_only");
    expect(ptd.scoreNote).toBeUndefined();
  });

  it("rejects a kind outside DIMENSION_OWNERS[dim].allowedVisuals", async () => {
    const context = makeContext();
    const s = scripted((dim) => validChapter(dim, context, { primary_visual: { kind: "donut", data_state: "partial", series: [{ label: "x", value: 50 }] } }));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    expect(chapters.get("tre")!.primaryVisual.kind).toBe("sparkline");
  });
});

describe("W4 helpers", () => {
  it("DimensionChapterPayload enforces the §C.11 constraints (1–4 strengths / gaps, window enum); a > 80-word verdict now parses and is trimmed by the chapter builder (G23-A)", () => {
    const context = makeContext();
    const ok = DimensionChapterPayload.safeParse(JSON.parse(validChapter("tre", context)));
    expect(ok.success).toBe(true);
    const longVerdict = JSON.parse(validChapter("tre", context, { verdict: Array.from({ length: 90 }, () => "word").join(" ") }));
    expect(DimensionChapterPayload.safeParse(longVerdict).success).toBe(true);
    const noGaps = JSON.parse(validChapter("tre", context, { gaps: [] }));
    expect(DimensionChapterPayload.safeParse(noGaps).success).toBe(false);
    const badWindow = JSON.parse(validChapter("tre", context, { next_action: { title: "x", window: "someday", expected_lift: 1 } }));
    expect(DimensionChapterPayload.safeParse(badWindow).success).toBe(false);
    // G19-S46: owners echo the input's `phaseLens.floor: null` — a null floor / floor_met must not fail the chapter.
    const nullFloor = JSON.parse(validChapter("tre", context, { phase_lens: { phase_id: "go_to_market", what_matters_now: "x", floor: null, floor_met: null } }));
    expect(DimensionChapterPayload.safeParse(nullFloor).success).toBe(true);
  });

  it("ensureCitationSuffix keeps valid citations and marks everything else [unevidenced]", () => {
    const allowed = new Set(["id-1"]);
    expect(ensureCitationSuffix(["Real claim [ev:id-1]", "Fake claim [ev:id-9]", "Bare claim", "Already [unevidenced]"], allowed)).toEqual([
      "Real claim [ev:id-1]",
      "Fake claim [unevidenced]",
      "Bare claim [unevidenced]",
      "Already [unevidenced]",
    ]);
  });

  it("buildEvidenceRows mints the same ids as the W1–W3 catalogue and tags every dim a criterion maps to", () => {
    const context = makeContext();
    const rows = buildEvidenceRows(context);
    const link = rows.find((r) => r.label === "Link: GitHub");
    expect(link?.source).toBe("url");
    expect(link?.dims).toEqual(["ptd"]);
    const revenue = rows.find((r) => r.label === "Founder evidence: revenue");
    expect(revenue?.dims).toEqual(expect.arrayContaining(["tre", "iri"]));
    expect(evidenceRowsForDim(context, "tre").every((r) => r.dims.includes("tre"))).toBe(true);
  });

  // S-R3 §C.3: GATHER rows (audits, connectors, cap table, grants) join the register.
  it("buildEvidenceRows merges context.gatherEvidenceRows (dims unioned on a shared id, ids kept)", () => {
    const context = makeContext();
    context.gatherEvidenceRows = [
      { evidence_id: "11111111-1111-4111-8111-111111111111", source: "stripe", label: "Stripe revenue (last sync)", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z", value: "mrr_aud = 12400", dims: ["tre", "iri"] },
    ];
    const rows = buildEvidenceRows(context);
    const stripe = rows.find((r) => r.evidence_id === "11111111-1111-4111-8111-111111111111")!;
    expect(stripe).toMatchObject({ source: "stripe", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z" });
    expect(evidenceRowsForDim(context, "iri").some((r) => r.evidence_id === stripe.evidence_id)).toBe(true);
    // Merging is idempotent (the rows are memoised on the context).
    expect(buildEvidenceRows(context)).toBe(rows);
  });

  // W2 review (e): the prompt_versions memo expires after 10 minutes.
  it("the prompt_versions lookup is memoised for 10 min, not for the process lifetime", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
      resetPromptVersionCache();
      expect(PROMPT_VERSION_CACHE_TTL_MS).toBe(10 * 60_000);
      const dispatcher = await import("./agent-dispatcher");
      const budget = { max: 40, used: 0, tryAcquire: () => true };
      const context = makeContext();
      const modelCaller = async () => ({ ok: false as const, status: "model_error" as const, reason: "n/a" });
      await dispatcher.dispatchDimensionChapters(context, "standard", async () => "", { modelCaller, callBudget: budget, knowledgeDb: null, dims: ["tre"] });
      const first = peekPromptVersionCache("cro");
      expect(first?.at).toBe(Date.parse("2026-09-16T00:00:00.000Z"));
      vi.setSystemTime(new Date("2026-09-16T00:05:00.000Z"));
      await dispatcher.dispatchDimensionChapters(makeContext(), "standard", async () => "", { modelCaller, callBudget: budget, knowledgeDb: null, dims: ["tre"] });
      expect(peekPromptVersionCache("cro")?.at).toBe(first?.at); // still cached
      vi.setSystemTime(new Date("2026-09-16T00:11:00.000Z"));
      await dispatcher.dispatchDimensionChapters(makeContext(), "standard", async () => "", { modelCaller, callBudget: budget, knowledgeDb: null, dims: ["tre"] });
      expect(peekPromptVersionCache("cro")?.at).toBe(Date.parse("2026-09-16T00:11:00.000Z")); // refreshed
    } finally {
      vi.useRealTimers();
    }
  });

  // G24-B: the default resolver registers the code-default prompt (agent
  // report-<role>, CODE_PROMPT_VERSION) so ai_runs never carries the NIL id.
  it("the default prompt resolver goes through readOrRegisterPrompt with the pipeline defaults (G24-B)", async () => {
    resetPromptVersionCache();
    registerCalls.length = 0;
    const dispatcher = await import("./agent-dispatcher");
    const { CODE_PROMPT_VERSION } = await import("./version");
    const budget = { max: 40, used: 0, tryAcquire: () => true };
    const modelCaller = async () => ({ ok: false as const, status: "model_error" as const, reason: "n/a" });
    await dispatcher.dispatchDimensionChapters(makeContext(), "standard", async () => "", { modelCaller, callBudget: budget, knowledgeDb: null, dims: ["tre"] });
    expect(registerCalls.length).toBeGreaterThanOrEqual(1);
    expect(registerCalls[0]).toEqual({ agent: "report-cro", defaults: { version: CODE_PROMPT_VERSION, model: expect.any(String), purpose: "customer_report" } });
    expect(peekPromptVersionCache("cro")?.id).toBe("pv-report-cro");
    expect(peekPromptVersionCache("cro")?.id).not.toBe(NIL_PROMPT_VERSION_ID);
    expect(dispatcher.pipelinePromptDefaults("cfo")).toMatchObject({ version: CODE_PROMPT_VERSION, purpose: "customer_report" });
  });

  it("w4OutputContract names the allowed visual kinds and the chapter template for the dim", () => {
    const full = w4OutputContract("cgh", "full");
    expect(full).toContain("donut, line, bar");
    expect(full).toContain(DIMENSION_OWNERS.cgh.outputTemplate);
    expect(w4OutputContract("cgh", "card")).toContain("chapter CARD");
  });

  it("taskClassForChapter (F4): CEO/CFO get the report class only when MODEL_AGENT_* is set and the tier is paid", () => {
    expect(taskClassForChapter("ceo", "standard")).toBeUndefined();
    process.env.MODEL_AGENT_CEO = "claude-sonnet-5";
    expect(taskClassForChapter("ceo", "standard")).toBe("report");
    expect(taskClassForChapter("ceo", "free")).toBeUndefined();
    expect(taskClassForChapter("cro", "standard")).toBeUndefined();
    process.env.MODEL_AGENT_CFO = "claude-sonnet-5";
    expect(taskClassForChapter("cfo", "premium")).toBe("report");
  });
});

// ── G23-A: grounding fixes on the W4 path ────────────────────────────────────
describe("dispatchDimensionChapters — G23-A grounding (trim, auto-cite, salvage)", () => {
  it("(c) a 95-word verdict is trimmed to the last full sentence ≤ 80 words — chapter NOT degraded, one call, verdictTrimmed counted, ReportV2 refine satisfied", async () => {
    const context = makeContext();
    const long = `${Array.from({ length: 40 }, (_, i) => `Word${i}`).join(" ")}. ${Array.from({ length: 30 }, (_, i) => `Next${i}`).join(" ")}. ${Array.from({ length: 25 }, (_, i) => `Tail${i}`).join(" ")}.`;
    const s = scripted((dim) => validChapter(dim, context, dim === "tre" ? { verdict: long } : {}));
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const tre = chapters.get("tre")!;
    expect(s.byDim.get("tre")).toBe(1);
    expect(tre.degraded).toBeUndefined();
    expect(tre.verdict.split(/\s+/).length).toBeLessThanOrEqual(80);
    expect(tre.verdict.startsWith("Word0 Word1")).toBe(true);
    expect(tre.verdict.endsWith("Next29.")).toBe(true);
    expect(context.qualityCounters?.verdictTrimmed).toBe(1);
    expect(reportV2Schema.shape.dimensions.element.safeParse(tre).success).toBe(true);
  });

  it("(a) a strength / verdict whose number is in the chapter evidence rows gets that row id instead of [unevidenced]; an unmatched number stays [unevidenced]; autoCited counted", async () => {
    const context = makeContext();
    const revenueRow = evidenceRowsForDim(context, "tre").find((r) => r.label === "Founder evidence: revenue")!;
    expect(revenueRow.value).toContain("A$12,000");
    const s = scripted((dim) =>
      validChapter(dim, context, dim === "tre" ? { verdict: "Revenue evidence shows MRR of A$12,000 from 9 paying customers. Growth is steady.", strengths: ["MRR A$12,000 from 9 paying customers", "Pipeline worth A$500,000 claimed"], gaps: ["No cohort data yet"] } : {}),
    );
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const tre = chapters.get("tre")!;
    expect(tre.verdict).toBe(`Revenue evidence shows MRR of A$12,000 from 9 paying customers [ev:${revenueRow.evidence_id}]. Growth is steady.`);
    expect(tre.strengths[0]).toBe(`MRR A$12,000 from 9 paying customers [ev:${revenueRow.evidence_id}]`);
    expect(tre.strengths[1]).toBe("Pipeline worth A$500,000 claimed [unevidenced]");
    expect(tre.audit.grounded).toBe(true);
    expect(context.qualityCounters?.autoCited).toBe(2);
  });

  it("(b) an owner answer cut mid-JSON by its budget is salvaged: chapter built from the complete part, ONE call, budgetOverruns counted, not degraded", async () => {
    const context = makeContext();
    const s = scripted((dim) => {
      const full = validChapter(dim, context, { frameworks_used: ["AARRR (Acquisition → Referral)", "cohort retention (M1 / M3 / M6)"] });
      return dim === "mpc" ? full.slice(0, full.lastIndexOf(`"frameworks_used"`) + 30) : full;
    });
    const chapters = await dispatchDimensionChapters(context, "standard", async () => "unused", { ...baseOpts, modelCaller: s.caller });
    const mpc = chapters.get("mpc")!;
    expect(s.byDim.get("mpc")).toBe(1);
    expect(mpc.degraded).toBeUndefined();
    expect(mpc.verdict).toContain("Market Pull & Category is developing");
    expect(context.qualityCounters?.budgetOverruns).toBe(1);
  });
});
