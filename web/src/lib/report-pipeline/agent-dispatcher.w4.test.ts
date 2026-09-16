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

import {
  DimensionChapterPayload,
  NIL_PROMPT_VERSION_ID,
  buildEvidenceRows,
  deterministicDimensionChapters,
  dispatchDimensionChapters,
  ensureCitationSuffix,
  evidenceRowsForDim,
  taskClassForChapter,
  w4OutputContract,
  type CallBudget,
} from "./agent-dispatcher";
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
  it("DimensionChapterPayload enforces the §C.11 constraints (verdict ≤ 80 words, 1–4 strengths / gaps, window enum)", () => {
    const context = makeContext();
    const ok = DimensionChapterPayload.safeParse(JSON.parse(validChapter("tre", context)));
    expect(ok.success).toBe(true);
    const longVerdict = JSON.parse(validChapter("tre", context, { verdict: Array.from({ length: 90 }, () => "word").join(" ") }));
    expect(DimensionChapterPayload.safeParse(longVerdict).success).toBe(false);
    const noGaps = JSON.parse(validChapter("tre", context, { gaps: [] }));
    expect(DimensionChapterPayload.safeParse(noGaps).success).toBe(false);
    const badWindow = JSON.parse(validChapter("tre", context, { next_action: { title: "x", window: "someday", expected_lift: 1 } }));
    expect(DimensionChapterPayload.safeParse(badWindow).success).toBe(false);
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
