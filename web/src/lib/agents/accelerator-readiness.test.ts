import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

interface FakeQueryState {
  table: string;
  select: string | null;
  eq: Array<{ col: string; val: unknown }>;
  lte: Array<{ col: string; val: unknown }>;
  gte: Array<{ col: string; val: unknown }>;
}

let adminConfigured = true;
let lastQuery: FakeQueryState | null = null;
let nextRows: Array<Record<string, unknown>> | null | undefined = [];

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!adminConfigured) return null;
    return {
      from(table: string) {
        const state: FakeQueryState = {
          table,
          select: null,
          eq: [],
          lte: [],
          gte: [],
        };
        lastQuery = state;
        const chain: {
          select: (cols: string) => typeof chain;
          eq: (col: string, val: unknown) => typeof chain;
          lte: (col: string, val: unknown) => typeof chain;
          gte: (col: string, val: unknown) => typeof chain;
          then: (
            onFulfilled: (value: {
              data: typeof nextRows;
              error: null;
            }) => unknown,
          ) => Promise<unknown>;
        } = {
          select(cols: string) {
            state.select = cols;
            return chain;
          },
          eq(col: string, val: unknown) {
            state.eq.push({ col, val });
            return chain;
          },
          lte(col: string, val: unknown) {
            state.lte.push({ col, val });
            return chain;
          },
          gte(col: string, val: unknown) {
            state.gte.push({ col, val });
            return chain;
          },
          then(onFulfilled) {
            return Promise.resolve({ data: nextRows, error: null }).then(
              onFulfilled,
            );
          },
        };
        return chain;
      },
    };
  },
}));

import { evaluateAcceleratorReadiness } from "./accelerator-readiness";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import type {
  AntlerEvaluation,
  AntlerSignal,
  AntlerSignalKey,
} from "@/lib/agents/antler-signals";

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? "entry-1",
    source: overrides.source ?? "antler-au",
    source_name: overrides.source_name ?? "Antler Australia",
    topic: overrides.topic ?? "team",
    criterion: overrides.criterion ?? "team-strength",
    description: overrides.description ?? null,
    stage_min: overrides.stage_min ?? 0,
    stage_max: overrides.stage_max ?? 7,
    sector: overrides.sector ?? "any",
    evidence_required: overrides.evidence_required ?? ["founder-profile"],
    tactic: overrides.tactic ?? ["surface-ex-employers"],
    valuation_lift_pct: overrides.valuation_lift_pct ?? 0,
    citations: overrides.citations ?? [],
    ...overrides,
  };
}

function makeAntlerSignal(
  key: AntlerSignalKey,
  score: number,
): AntlerSignal {
  return {
    key,
    label: key,
    question: `question for ${key}`,
    score,
    strength: "developing",
    whatWeSee: [],
    gaps: [],
    howToLift: [],
    weight: 0.2,
  };
}

function makeAntler(
  entries: Array<[AntlerSignalKey, number]>,
): AntlerEvaluation {
  const signals = entries.map(([k, s]) => makeAntlerSignal(k, s));
  return {
    signals,
    progressionScore: 50,
    oneLine: "n/a",
    standout: null,
    weakestLink: null,
    sourceNote: "n/a",
  };
}

function makeAnalysis(overrides: Partial<SVIAnalysis> = {}): SVIAnalysis {
  return {
    version: "test",
    totalSVI: 100,
    baselineSVI: 100,
    netAdjustment: 0,
    confidenceMultiplier: 1,
    subs: [],
    riskPenalties: [],
    evidenceGaps: [],
    nextActions: [],
    signals: {} as SVIAnalysis["signals"],
    summary: "",
    stage: 3,
    stageLabel: "Early",
    stageBonus: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("evaluateAcceleratorReadiness", () => {
  beforeEach(() => {
    adminConfigured = true;
    lastQuery = null;
    nextRows = [];
  });

  it("returns null when Supabase admin is not configured", async () => {
    adminConfigured = false;
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "raw");
    expect(result).toBeNull();
    expect(lastQuery).toBeNull();
  });

  it("returns null when there are zero active knowledge_entries for the stage", async () => {
    nextRows = [];
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "raw");
    expect(result).toBeNull();
  });

  it("returns null when Supabase returns null data", async () => {
    nextRows = null;
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "raw");
    expect(result).toBeNull();
  });

  it("filters knowledge_entries by active=true and the current stage bounds", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    await evaluateAcceleratorReadiness(makeAnalysis({ stage: 4 }), "raw");
    expect(lastQuery?.table).toBe("knowledge_entries");
    expect(lastQuery?.eq).toEqual([{ col: "active", val: true }]);
    expect(lastQuery?.lte).toEqual([{ col: "stage_min", val: 4 }]);
    expect(lastQuery?.gte).toEqual([{ col: "stage_max", val: 4 }]);
    expect(lastQuery?.select).toBe("*");
  });

  it("defaults stage to 0 when analysis.stage is undefined", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    await evaluateAcceleratorReadiness(
      makeAnalysis({ stage: undefined as unknown as number }),
      "raw",
    );
    expect(lastQuery?.lte).toEqual([{ col: "stage_min", val: 0 }]);
    expect(lastQuery?.gte).toEqual([{ col: "stage_max", val: 0 }]);
  });

  it("detects met for team topic when a brand-name employer keyword appears in the raw input", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "The CTO is ex-Stripe with 8 years shipping payments infra",
    );
    expect(result?.totalMet).toBe(1);
    expect(result?.totalPartial).toBe(0);
    expect(result?.sources[0].topCriteria).toHaveLength(0);
  });

  it("detects partial for team topic on 'co-founder' mention without brand-name evidence", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "Two co-founders working part-time",
    );
    expect(result?.totalMet).toBe(0);
    expect(result?.totalPartial).toBe(1);
  });

  it("prefers a high Antler team signal (>=70) over raw-input keyword scan", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const analysis = makeAnalysis({
      antlerSignals: makeAntler([["team", 82]]),
    });
    const result = await evaluateAcceleratorReadiness(analysis, "");
    expect(result?.totalMet).toBe(1);
    expect(result?.sources[0].topCriteria[0]?.reasoning ?? "").toBe("");
  });

  it("classifies mid-band Antler team signal (45..69) as partial", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const analysis = makeAnalysis({
      antlerSignals: makeAntler([["team", 55]]),
    });
    const result = await evaluateAcceleratorReadiness(analysis, "");
    expect(result?.totalPartial).toBe(1);
    expect(result?.totalMet).toBe(0);
  });

  it("classifies the team topic as gap when neither Antler nor keyword evidence is present", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "just a landing page",
    );
    const source = result?.sources[0];
    expect(source?.gap).toBe(1);
    expect(source?.met).toBe(0);
    expect(source?.partial).toBe(0);
  });

  it("uses the TRE sub-score for the progress topic when Antler is absent", async () => {
    nextRows = [makeEntry({ topic: "progress" })];
    const analysis = makeAnalysis({
      subs: [
        {
          label: "TRE",
          key: "tre",
          value: 65,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
      ],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "raw");
    expect(result?.totalMet).toBe(1);
  });

  it("classifies progress topic as partial when TRE is 40..59", async () => {
    nextRows = [makeEntry({ topic: "progress" })];
    const analysis = makeAnalysis({
      subs: [
        {
          label: "TRE",
          key: "tre",
          value: 42,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
      ],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "raw");
    expect(result?.totalPartial).toBe(1);
    expect(result?.totalMet).toBe(0);
  });

  it("detects met for invention topic on 'patent' keyword", async () => {
    nextRows = [makeEntry({ topic: "invention" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "We hold a granted patent on the encoder pipeline",
    );
    expect(result?.totalMet).toBe(1);
  });

  it("classifies invention as gap when no IP keyword and no Antler score", async () => {
    nextRows = [makeEntry({ topic: "invention" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "small landing page for a to-do app",
    );
    expect(result?.sources[0].gap).toBe(1);
  });

  it("detects partial for vision topic on 'category-defining' language", async () => {
    nextRows = [makeEntry({ topic: "vision" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "We are building the category-defining platform for AU founders",
    );
    expect(result?.totalPartial).toBe(1);
  });

  it("detects partial for product_10x topic on '10x' claim without benchmark", async () => {
    nextRows = [makeEntry({ topic: "product_10x" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "Our engine is 10x faster than the legacy stack",
    );
    expect(result?.totalPartial).toBe(1);
  });

  it("classifies governance as met when CGH>=70 AND IRI>=60", async () => {
    nextRows = [makeEntry({ topic: "governance" })];
    const analysis = makeAnalysis({
      subs: [
        {
          label: "CGH",
          key: "cgh",
          value: 72,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
        {
          label: "IRI",
          key: "iri",
          value: 61,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
      ],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "");
    expect(result?.totalMet).toBe(1);
  });

  it("classifies governance as partial when CGH>=50 but IRI<60", async () => {
    nextRows = [makeEntry({ topic: "governance" })];
    const analysis = makeAnalysis({
      subs: [
        {
          label: "CGH",
          key: "cgh",
          value: 55,
          adjustment: 0,
          rationale: "",
          evidence: [],
          gaps: [],
        },
      ],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "");
    expect(result?.totalPartial).toBe(1);
    expect(result?.totalMet).toBe(0);
  });

  it("classifies an unknown topic as gap", async () => {
    nextRows = [makeEntry({ topic: "totally-new-topic" })];
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "raw");
    expect(result?.sources[0].gap).toBe(1);
    expect(result?.sources[0].topCriteria[0]?.reasoning).toBe(
      "No matching signal",
    );
  });

  it("computes source pct as (met + 0.5*partial) / total, rounded", async () => {
    nextRows = [
      // 1 met (patent keyword), 1 partial (10x claim), 2 gaps
      makeEntry({ id: "a", topic: "invention", source: "src", source_name: "S" }),
      makeEntry({ id: "b", topic: "product_10x", source: "src", source_name: "S" }),
      makeEntry({ id: "c", topic: "vision", source: "src", source_name: "S" }),
      makeEntry({ id: "d", topic: "team", source: "src", source_name: "S" }),
    ];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "our patent-heavy platform is 10x faster",
    );
    const source = result?.sources.find((s) => s.source === "src");
    // met=1, partial=1, total=4 → (1 + 0.5) / 4 = 0.375 → 38
    expect(source?.met).toBe(1);
    expect(source?.partial).toBe(1);
    expect(source?.gap).toBe(2);
    expect(source?.pct).toBe(38);
  });

  it("sorts sources by pct descending", async () => {
    nextRows = [
      // src-a: 1 met → 100%
      makeEntry({ id: "a", topic: "invention", source: "src-a", source_name: "A" }),
      // src-b: 1 gap → 0%
      makeEntry({ id: "b", topic: "team", source: "src-b", source_name: "B" }),
    ];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "we hold a patent",
    );
    expect(result?.sources.map((s) => s.source)).toEqual(["src-a", "src-b"]);
    expect(result?.sources[0].pct).toBe(100);
    expect(result?.sources[1].pct).toBe(0);
  });

  it("caps topCriteria per source at 3 rows and excludes met status", async () => {
    nextRows = [
      makeEntry({ id: "1", topic: "team", source: "src", valuation_lift_pct: 5 }),
      makeEntry({ id: "2", topic: "vision", source: "src", valuation_lift_pct: 20 }),
      makeEntry({ id: "3", topic: "product_10x", source: "src", valuation_lift_pct: 10 }),
      makeEntry({ id: "4", topic: "progress", source: "src", valuation_lift_pct: 30 }),
      // met — must be excluded from topCriteria
      makeEntry({ id: "5", topic: "invention", source: "src", valuation_lift_pct: 99 }),
    ];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "we hold a patent",
    );
    const source = result?.sources.find((s) => s.source === "src");
    expect(source?.topCriteria).toHaveLength(3);
    expect(source?.topCriteria.map((c) => c.entry.id)).toEqual(["4", "2", "3"]);
    expect(source?.topCriteria.every((c) => c.status !== "met")).toBe(true);
  });

  it("computes highLeverageGaps across all sources, sorted by lift desc, capped at 5", async () => {
    nextRows = [
      makeEntry({ id: "1", source: "a", topic: "team", valuation_lift_pct: 4 }),
      makeEntry({ id: "2", source: "a", topic: "vision", valuation_lift_pct: 12 }),
      makeEntry({ id: "3", source: "b", topic: "product_10x", valuation_lift_pct: 8 }),
      makeEntry({ id: "4", source: "b", topic: "progress", valuation_lift_pct: 25 }),
      makeEntry({ id: "5", source: "c", topic: "governance", valuation_lift_pct: 18 }),
      makeEntry({ id: "6", source: "c", topic: "team", valuation_lift_pct: 40 }),
      makeEntry({ id: "7", source: "d", topic: "vision", valuation_lift_pct: 2 }),
    ];
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "");
    expect(result?.highLeverageGaps).toHaveLength(5);
    expect(result?.highLeverageGaps.map((g) => g.entry.id)).toEqual([
      "6",
      "4",
      "5",
      "2",
      "3",
    ]);
  });

  it("applies estLiftAud as blendedMid * lift/100 rounded to nearest A$1,000, only for non-met rows", async () => {
    nextRows = [
      makeEntry({ id: "gap-row", topic: "team", valuation_lift_pct: 12 }),
      makeEntry({ id: "met-row", topic: "invention", valuation_lift_pct: 25 }),
    ];
    const analysis = makeAnalysis({
      deepValuation: {
        blendedValuation: {
          midAud: 1_234_567,
        },
      } as unknown as SVIAnalysis["deepValuation"],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "we hold a patent");
    const gap = result?.sources[0].topCriteria[0];
    // 1_234_567 * 0.12 = 148,148.04 → round(148.148) * 1000 = 148,000
    expect(gap?.estLiftAud).toBe(148_000);
    // met rows do not receive estLiftAud in the topCriteria list (they are excluded)
    // but check the overall shape: no met row in highLeverageGaps either
    expect(
      result?.highLeverageGaps.some((g) => g.entry.id === "met-row"),
    ).toBe(false);
  });

  it("leaves estLiftAud undefined when blended valuation is missing", async () => {
    nextRows = [
      makeEntry({ id: "no-val", topic: "team", valuation_lift_pct: 30 }),
    ];
    const result = await evaluateAcceleratorReadiness(makeAnalysis(), "");
    const gap = result?.sources[0].topCriteria[0];
    expect(gap?.estLiftAud).toBeUndefined();
  });

  it("leaves estLiftAud undefined when valuation_lift_pct is 0", async () => {
    nextRows = [
      makeEntry({ id: "zero", topic: "team", valuation_lift_pct: 0 }),
    ];
    const analysis = makeAnalysis({
      deepValuation: {
        blendedValuation: { midAud: 5_000_000 },
      } as unknown as SVIAnalysis["deepValuation"],
    });
    const result = await evaluateAcceleratorReadiness(analysis, "");
    const gap = result?.sources[0].topCriteria[0];
    expect(gap?.estLiftAud).toBeUndefined();
  });

  it("returns generatedAt as a valid ISO-8601 timestamp", async () => {
    nextRows = [makeEntry({ topic: "team" })];
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "ex-Stripe founder",
    );
    expect(result?.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    );
    expect(Number.isFinite(Date.parse(result!.generatedAt))).toBe(true);
  });

  it("blends inputSummary.snippet + keyFindings into the detection blob", async () => {
    nextRows = [makeEntry({ topic: "invention" })];
    const analysis = makeAnalysis({
      inputSummary: {
        projectName: "P",
        projectNameSource: "test",
        projectNameConfidence: "high",
        sourceType: "url",
        snippet: "novel algorithm for encoding",
        keyFindings: ["proprietary tech stack"],
      },
    });
    // rawInput carries no IP keywords; blob must inherit them from inputSummary
    const result = await evaluateAcceleratorReadiness(analysis, "");
    expect(result?.totalMet).toBe(1);
  });

  it("computes overallPct across a mixed cohort of sources", async () => {
    nextRows = [
      makeEntry({ id: "1", source: "a", topic: "invention" }),
      makeEntry({ id: "2", source: "a", topic: "team" }),
      makeEntry({ id: "3", source: "b", topic: "product_10x" }),
      makeEntry({ id: "4", source: "b", topic: "vision" }),
    ];
    // patent → met (invention); 10x → partial; ex-Stripe → met (team); no vision hit → gap
    const result = await evaluateAcceleratorReadiness(
      makeAnalysis(),
      "ex-Stripe founder; we hold a patent; our engine is 10x faster",
    );
    expect(result?.totalCriteria).toBe(4);
    expect(result?.totalMet).toBe(2);
    expect(result?.totalPartial).toBe(1);
    // (2 + 0.5) / 4 = 0.625 → 63
    expect(result?.overallPct).toBe(63);
  });
});
