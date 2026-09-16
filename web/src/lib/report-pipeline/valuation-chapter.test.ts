// valuation-chapter (S-R3, spec §C.5): the 6-method ValuationChapter built
// from the CFO valuation — weights sum to 1 excluding the scorecard, the
// scorecard is a reference row only when pre-revenue, the founder's ask is
// cross-checked (never applied), sector multiples carry a dated source and
// the comparables N comes from the AU table.

import { describe, expect, it } from "vitest";
import { AU_COMPARABLES_COUNT, AU_COMPARABLES_WITH_MULTIPLES_COUNT } from "@/lib/data/au-comparables";
import { VALUATION_METHOD_KEYS, isReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { buildValuationChapter, isPreRevenue, sourceDateFromLabel, type VcValuationLike } from "./valuation-chapter";

function vc(overrides: Partial<VcValuationLike> = {}): VcValuationLike {
  return {
    blended: { lowAud: 4_000_000, midAud: 6_000_000, highAud: 9_000_000, confidence: 70 },
    methods: [
      { method: "revenue_multiple", lowAud: 3_600_000, midAud: 6_000_000, highAud: 8_400_000, weight: 0.35, rationale: "AU saas revenue multiples 3–7x ARR. Multiples: BlockID static table (2026-06) · SaaS Capital." },
      { method: "berkus", lowAud: 1_400_000, midAud: 2_000_000, highAud: 2_600_000, weight: 0.1, rationale: "Berkus milestone-based valuation." },
      { method: "dcf_proxy", lowAud: 3_360_000, midAud: 4_800_000, highAud: 6_720_000, weight: 0.25, rationale: "Simplified DCF." },
      { method: "comparables", lowAud: 4_500_000, midAud: 6_000_000, highAud: 8_100_000, weight: 0.15, rationale: "Comparable AU saas transactions." },
      { method: "risk_factor_summation", lowAud: 4_500_000, midAud: 6_000_000, highAud: 8_400_000, weight: 0.15, rationale: "Risk Factor Summation; au-tax: 20%." },
      { method: "scorecard", lowAud: 2_000_000, midAud: 2_800_000, highAud: 3_600_000, weight: 0, rationale: "Scorecard (Bill Payne) vs AU seed median." },
    ],
    scenarios: { bear: 2_800_000, base: 6_000_000, bull: 11_700_000 },
    unitEconomics: { cacAud: 900, ltvAud: 4200 },
    injection: { raiseAud: 1_200_000, preMoneyAud: 6_000_000 },
    sectorMultiples: { sector: "saas", low: 3, median: 5, high: 7, sourceLabel: "BlockID static table (2026-06) · SaaS Capital Index 2024", sourceDate: "2026-06" },
    inputs: { mrrAud: 100_000, arrAud: 1_200_000, monthlyGrowthRatePct: 8, sector: "saas", stage: "seed", revenueSource: "stripe (last sync)" },
    ...overrides,
  };
}

const base = { stage: 3, stageLabel: "Early Traction", industry: "saas", at: "2026-09-16T00:00:00.000Z" };

describe("buildValuationChapter — 6 methods", () => {
  it("lists exactly the 6 methods in canonical order with the 5 active weights summing to 1 and the scorecard at 0", () => {
    const ch = buildValuationChapter({ ...base, vc: vc(), revenueEvidenceIds: ["ev-stripe"] });
    expect(ch.methods.map((m) => m.method)).toEqual([...VALUATION_METHOD_KEYS]);
    const active = ch.methods.filter((m) => m.method !== "scorecard");
    expect(active.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 6);
    expect(active.every((m) => m.applicable)).toBe(true);
    const sc = ch.methods.find((m) => m.method === "scorecard")!;
    expect(sc.weight).toBe(0);
    expect(sc.applicable).toBe(false);
    expect(sc.rationale).toMatch(/weight 0/);
  });

  it("normalises CFO weights that do not sum to 1 (defensive) and puts the rounding drift on the largest weight", () => {
    const skewed = vc({ methods: vc().methods.map((m) => (m.method === "scorecard" ? m : { ...m, weight: m.weight * 3 })) });
    const ch = buildValuationChapter({ ...base, vc: skewed });
    const active = ch.methods.filter((m) => m.method !== "scorecard");
    expect(active.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 9);
    expect(active.find((m) => m.method === "revenue_multiple")!.weight).toBeCloseTo(0.35, 3);
  });

  it("pre-revenue path: the scorecard becomes a visible reference row (applicable, still weight 0) and the narrative says Berkus / RFS drive the band", () => {
    const pre = vc({ inputs: { mrrAud: 0, arrAud: 0, sector: "saas", stage: "pre-seed" }, methods: vc().methods.map((m) => (m.method === "revenue_multiple" ? { ...m, weight: 0.1 } : m.method === "berkus" ? { ...m, weight: 0.35 } : m)) });
    expect(isPreRevenue(pre)).toBe(true);
    const ch = buildValuationChapter({ ...base, stage: 1, stageLabel: "Validated Idea", vc: pre });
    const sc = ch.methods.find((m) => m.method === "scorecard")!;
    expect(sc.applicable).toBe(true);
    expect(sc.weight).toBe(0);
    expect(sc.rationale).toMatch(/pre-revenue/);
    expect(ch.narrative).toMatch(/Pre-revenue/);
    // Grounded by construction: no revenue claim to evidence.
    expect(ch.audit.grounded).toBe(true);
    expect(ch.visuals[0].subtitle).toMatch(/pre-revenue reference/);
  });

  it("isPreRevenue falls back to the revenue_multiple row when no inputs were recorded", () => {
    expect(isPreRevenue(vc({ inputs: undefined }))).toBe(false);
    expect(isPreRevenue(vc({ inputs: undefined, methods: vc().methods.map((m) => (m.method === "revenue_multiple" ? { ...m, midAud: 0 } : m)) }))).toBe(true);
  });
});

describe("buildValuationChapter — consensus, ask cross-check, multiples, comparables, scenarios", () => {
  it("consensus is the CFO blended range (confidence 0–1) and scenarios are the three cases", () => {
    const ch = buildValuationChapter({ ...base, vc: vc() });
    expect(ch.consensus).toEqual({ lowAud: 4_000_000, midAud: 6_000_000, highAud: 9_000_000, confidence: 0.7 });
    expect(ch.scenarios).toEqual({ bear: 2_800_000, base: 6_000_000, bull: 11_700_000 });
    expect(ch.consensus.lowAud).toBeLessThan(ch.consensus.highAud);
  });

  it("ask verdicts: aligned within 0.5×–2× of the consensus mid, above_consensus / below_consensus outside it; post-money is netted of the raise", () => {
    const aligned = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 7_000_000, statedCapKind: "pre_money", raiseAud: 1_000_000 } }).ask!;
    expect(aligned).toMatchObject({ preMoneyAud: 7_000_000, raiseAud: 1_000_000, verdict: "aligned", gapPct: 17 });

    const above = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 20_000_000, statedCapKind: "cap" } }).ask!;
    expect(above.verdict).toBe("above_consensus");
    expect(above.gapPct).toBe(233);
    expect(above.raiseAud).toBe(1_200_000); // CFO injection default

    const below = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 2_000_000, statedCapKind: "valuation" } }).ask!;
    expect(below.verdict).toBe("below_consensus");
    expect(below.gapPct).toBe(-67);

    const post = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 8_000_000, statedCapKind: "post_money", raiseAud: 2_000_000 } }).ask!;
    expect(post.preMoneyAud).toBe(6_000_000);
    expect(post.verdict).toBe("aligned");
    expect(post.gapPct).toBe(0);
  });

  it("no stated cap → no ask block; a zero / NaN cap is ignored", () => {
    expect(buildValuationChapter({ ...base, vc: vc() }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 0 } }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: Number.NaN } }).ask).toBeUndefined();
  });

  it("sector multiples carry the resolved sourceLabel + sourceDate (vcBenchmark) and the static table is the fallback", () => {
    const withBm = buildValuationChapter({ ...base, vc: vc() });
    expect(withBm.sectorMultiples).toEqual({ sector: "saas", low: 3, median: 5, high: 7, sourceLabel: "BlockID static table (2026-06) · SaaS Capital Index 2024", sourceDate: "2026-06" });
    const noDate = buildValuationChapter({ ...base, vc: vc({ sectorMultiples: { sector: "saas", low: 3, median: 5, high: 7, sourceLabel: "SaaS Capital Index, 2026-07-01", sourceDate: "" } }) });
    expect(noDate.sectorMultiples.sourceDate).toBe("2026-07-01");
    const fallback = buildValuationChapter({ ...base, vc: vc({ sectorMultiples: null }) });
    expect(fallback.sectorMultiples.sourceLabel).toMatch(/AU comparables/);
    expect(fallback.sectorMultiples.median).toBeGreaterThan(0);
  });

  it("comparables N / with-multiples N come from lib/data/au-comparables (33 today, F5) with up to 5 anonymised rows", () => {
    const ch = buildValuationChapter({ ...base, vc: vc() });
    expect(ch.comparables.n).toBe(AU_COMPARABLES_COUNT);
    expect(ch.comparables.withMultiplesN).toBe(AU_COMPARABLES_WITH_MULTIPLES_COUNT);
    expect(ch.comparables.rows.length).toBeLessThanOrEqual(5);
    expect(ch.comparables.rows.every((r) => r.name === "anonymised" && r.source === "au-comparables.ts")).toBe(true);
  });

  it("narrative: range + method transparency + the AU discount line, never a single point; grounded only with a revenue evidence row", () => {
    const ch = buildValuationChapter({ ...base, vc: vc(), revenueEvidenceIds: ["ev-stripe"] });
    expect(ch.narrative).toMatch(/range A\$4,000,000–A\$9,000,000/);
    expect(ch.narrative).toMatch(/five weighted methods/);
    expect(ch.narrative).toMatch(/US multiples are discounted 20–40 %/);
    expect(ch.narrative).toMatch(/stripe \(last sync\)/);
    expect(ch.audit.grounded).toBe(true);
    expect(ch.visuals.map((v) => v.kind)).toEqual(["range_bars", "scatter"]);
    expect(ch.visuals[0].dataState).toBe("partial");
    const ungrounded = buildValuationChapter({ ...base, vc: vc() });
    expect(ungrounded.audit.grounded).toBe(false);
    expect(ungrounded.visuals[0].dataState).toBe("benchmark_only");
  });

  it("sourceDateFromLabel parses YYYY-MM and YYYY-MM-DD, else the fallback", () => {
    expect(sourceDateFromLabel("BlockID static table (2026-06) · x", "?")).toBe("2026-06");
    expect(sourceDateFromLabel("SaaS Capital Index, 2026-07-01", "?")).toBe("2026-07-01");
    expect(sourceDateFromLabel("no date here", "2021–2025")).toBe("2021–2025");
  });
});

describe("adapter integration", () => {
  it("fromSnapshot with a `vc` input renders the 6-method chapter (schema-valid) — the TBR three-case table is retired for pipeline rows", () => {
    const report = fromSnapshot({
      snapshotId: "snap-1",
      startupName: "Acme",
      industry: "saas",
      stageLabel: "Early Traction",
      stage: 3,
      sviTotal: 120,
      dimStates: { tre: { score: 55 }, mpc: { score: 60 } },
      vc: vc(),
      valuationAsk: { statedCapAud: 7_000_000, statedCapKind: "pre_money", raiseAud: 1_000_000 },
      revenueEvidenceIds: ["ev-stripe"],
    });
    expect(isReportV2(report)).toBe(true);
    expect(report.valuation.methods.filter((m) => m.applicable)).toHaveLength(5);
    expect(report.valuation.ask?.verdict).toBe("aligned");
    expect(report.valuation.visuals[0].title).toBe("Valuation methods and consensus band");
    expect(report.valuation.narrative).not.toMatch(/three-case/i);
  });

  it("fromSnapshot without a `vc` keeps the directional three-case fallback (all 6 methods not applicable)", () => {
    const report = fromSnapshot({ snapshotId: "snap-2", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 } } });
    expect(isReportV2(report)).toBe(true);
    expect(report.valuation.methods.every((m) => !m.applicable && m.weight === 0)).toBe(true);
    expect(report.valuation.visuals[0].title).toMatch(/three cases/);
  });
});
