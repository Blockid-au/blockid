// valuation-chapter (S-R3, spec §C.5; G19-S42): the 7-method ValuationChapter
// built from the CFO valuation — applicable weights sum to 1, non-applicable
// rows weigh 0 and keep their rationale, the founder's ask is cross-checked
// only when stated (never invented), inputs / derivation / cross-checks are
// filled (backtest quartile + stage baseline), sector multiples carry a dated
// source and the comparables N comes from the AU table.

import { describe, expect, it } from "vitest";
import { AU_COMPARABLES_COUNT, AU_COMPARABLES_WITH_MULTIPLES_COUNT } from "@/lib/data/au-comparables";
import { setComparablesForTests } from "@/lib/valuation/comparables-repo";
import { VALUATION_BASELINES_AUD } from "@/lib/valuation";
import { VALUATION_METHOD_KEYS, isReportV2 } from "@/lib/report-v2/schema";
import { fromSnapshot } from "@/lib/report-v2/adapter";
import { demoVcValuation, preRevenueVcValuation } from "@/lib/report-v2/fixtures";
import { backtestBucketFor, buildValuationChapter, isPreRevenue, revenueSourceFromLabel, sourceDateFromLabel, type BacktestLike, type VcValuationLike } from "./valuation-chapter";

/** A legacy (pre-S42) CFO row: 6 methods, no `applicable`, scorecard at 0. */
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

const backtest: BacktestLike = {
  generated_at: "2026-09-17T00:07:42.936Z",
  n: 49,
  n_with_round: 41,
  buckets: [
    { quartile: 1, label: "Q1 (lowest SVI)", n: 10, svi_min: 100, svi_max: 116, median_round_aud: 8_250_000, p25_round_aud: 5_000_000, p75_round_aud: 10_500_000, n_valuation: 3, median_valuation_aud: 36_000_000 },
    { quartile: 2, label: "Q2", n: 11, svi_min: 118, svi_max: 128, median_round_aud: 50_000_000, p25_round_aud: 30_000_000, p75_round_aud: 79_500_000, n_valuation: 1, median_valuation_aud: 250_000_000 },
    { quartile: 3, label: "Q3", n: 10, svi_min: 129, svi_max: 141, median_round_aud: 47_500_000, p25_round_aud: 22_500_000, p75_round_aud: 90_000_000, n_valuation: 0, median_valuation_aud: null },
    { quartile: 4, label: "Q4 (highest SVI)", n: 10, svi_min: 142, svi_max: 156, median_round_aud: 147_500_000, p25_round_aud: 114_750_000, p75_round_aud: 210_250_000, n_valuation: 8, median_valuation_aud: 1_550_000_000 },
  ],
};

const base = { stage: 3, stageLabel: "Early Traction", industry: "saas", at: "2026-09-16T00:00:00.000Z" };

describe("buildValuationChapter — 7 methods", () => {
  it("lists the 7 methods in canonical order; on a legacy 6-row CFO report the 5 active weights sum to 1, scorecard is off, stage_baseline is a not-computed row", () => {
    const ch = buildValuationChapter({ ...base, vc: vc(), revenueEvidenceIds: ["ev-stripe"] });
    expect(ch.methods.map((m) => m.method)).toEqual([...VALUATION_METHOD_KEYS]);
    const applicable = ch.methods.filter((m) => m.applicable);
    expect(applicable.map((m) => m.method)).toEqual(["revenue_multiple", "berkus", "dcf_proxy", "comparables", "risk_factor_summation"]);
    expect(applicable.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 6);
    const sc = ch.methods.find((m) => m.method === "scorecard")!;
    expect(sc.weight).toBe(0);
    expect(sc.applicable).toBe(false);
    const sb = ch.methods.find((m) => m.method === "stage_baseline")!;
    expect(sb.applicable).toBe(false);
    expect(sb.rationale).toMatch(/not computed/);
  });

  it("normalises CFO weights that do not sum to 1 (defensive) and puts the rounding drift on the largest weight", () => {
    const skewed = vc({ methods: vc().methods.map((m) => (m.method === "scorecard" ? m : { ...m, weight: m.weight * 3 })) });
    const ch = buildValuationChapter({ ...base, vc: skewed });
    const active = ch.methods.filter((m) => m.applicable);
    expect(active.reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 9);
    expect(active.find((m) => m.method === "revenue_multiple")!.weight).toBeCloseTo(0.35, 3);
  });

  it("S42 pre-revenue: exactly Berkus + scorecard + stage_baseline applicable at 0.5 / 0.3 / 0.2; the 4 revenue rows keep their needs-revenue rationale at weight 0; narrative says which methods carry the band", () => {
    const pre = preRevenueVcValuation();
    expect(isPreRevenue(pre)).toBe(true);
    const ch = buildValuationChapter({ ...base, stage: 2, stageLabel: "MVP / Prototype", sviIndex: 104, vc: pre });
    const applicable = ch.methods.filter((m) => m.applicable);
    expect(applicable.map((m) => m.method)).toEqual(["berkus", "scorecard", "stage_baseline"]);
    expect(applicable.map((m) => m.weight)).toEqual([0.5, 0.3, 0.2]);
    for (const key of ["revenue_multiple", "dcf_proxy", "comparables", "risk_factor_summation"] as const) {
      const row = ch.methods.find((m) => m.method === key)!;
      expect(row.applicable).toBe(false);
      expect(row.weight).toBe(0);
      expect(row.rationale).toMatch(/Needs revenue/);
    }
    expect(ch.narrative).toMatch(/Pre-revenue: Berkus \(50 %\), the Bill Payne scorecard \(30 %\) and the AU stage baseline \(20 %\)/);
    expect(ch.narrative).toMatch(/4 methods need revenue/);
    expect(ch.audit.grounded).toBe(true);
    expect(ch.visuals[0].subtitle).toMatch(/3 applicable methods/);
    // Only applicable rows are drawn.
    expect((ch.visuals[0].data as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it("legacy pre-revenue row (no `applicable`): scorecard becomes a reference row at weight 0, stage_baseline stays off", () => {
    const pre = vc({ inputs: { mrrAud: 0, arrAud: 0, sector: "saas", stage: "pre-seed" }, methods: vc().methods.map((m) => (m.method === "revenue_multiple" ? { ...m, weight: 0.1 } : m.method === "berkus" ? { ...m, weight: 0.35 } : m)) });
    const ch = buildValuationChapter({ ...base, stage: 1, stageLabel: "Validated Idea", vc: pre });
    const sc = ch.methods.find((m) => m.method === "scorecard")!;
    expect(sc.applicable).toBe(true);
    expect(sc.weight).toBe(0);
    expect(ch.methods.filter((m) => m.weight > 0).reduce((a, m) => a + m.weight, 0)).toBeCloseTo(1, 9);
  });

  it("isPreRevenue prefers the S42 inputs record, then the raw inputs, then the revenue_multiple row", () => {
    expect(isPreRevenue(vc({ inputs: undefined }))).toBe(false);
    expect(isPreRevenue(vc({ inputs: undefined, methods: vc().methods.map((m) => (m.method === "revenue_multiple" ? { ...m, midAud: 0 } : m)) }))).toBe(true);
    expect(isPreRevenue(demoVcValuation())).toBe(false);
  });
});

describe("buildValuationChapter — S42 inputs, derivation, cross-checks", () => {
  it("fills the inputs table from the CFO record (revenue source connector, growth observed, pillars, stage, multiples, raise not stated)", () => {
    const ch = buildValuationChapter({ ...base, vc: demoVcValuation(), sviIndex: 74 });
    expect(ch.inputs).toMatchObject({ mrrAud: 100_000, arrAud: 1_200_000, revenueSource: "connector", monthlyGrowthRatePct: 4.5, growthAssumed: false, rdtiRefundAud: 87_000, stage: "seed", sviStage: 3, sector: "saas", sectorMultipleLow: 6, sectorMultipleHigh: 7.5, raiseStated: false });
    expect(ch.inputs?.raiseAud).toBeUndefined();
    expect(ch.derivation?.revenue_multiple).toMatch(/^ARR A\$1\.2M × 6–7\.5/);
    expect(Object.keys(ch.derivation ?? {})).toHaveLength(7);
    expect(ch.consistencyNotes).toEqual([]);
  });

  it("derives the inputs table from a legacy raw row when no CFO record exists (stripe label → connector, growth present → not assumed)", () => {
    const ch = buildValuationChapter({ ...base, vc: vc() });
    expect(ch.inputs).toMatchObject({ mrrAud: 100_000, arrAud: 1_200_000, revenueSource: "connector", monthlyGrowthRatePct: 8, growthAssumed: false, stage: "seed", sviStage: 3, sector: "saas", sectorMultipleLow: 3, sectorMultipleHigh: 7, raiseStated: false });
    const stated = buildValuationChapter({ ...base, vc: vc({ inputs: { mrrAud: 10_000, arrAud: 120_000, sector: "saas", stage: "seed", revenueSource: "founder-stated", raiseAud: 500_000 } }) });
    expect(stated.inputs).toMatchObject({ revenueSource: "founder_stated", growthAssumed: true, raiseStated: true, raiseAud: 500_000 });
    expect(revenueSourceFromLabel("xero (last sync 2026-09-01)", 1)).toBe("connector");
    expect(revenueSourceFromLabel("uploaded statement", 1)).toBe("document");
    expect(revenueSourceFromLabel("founder-stated (ARR)", 1)).toBe("founder_stated");
    expect(revenueSourceFromLabel("stripe", 0)).toBe("none");
    expect(ch.derivation).toEqual({});
  });

  it("backtest cross-check: the quartile bucket for the report's SVI with N, asOf = generated_at, plus the disclosed-valuation row and the stage baseline; the narrative carries one cross-check sentence", () => {
    const ch = buildValuationChapter({ ...base, vc: { ...demoVcValuation(), backtest }, sviIndex: 120 });
    const rows = ch.crossChecks ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ label: expect.stringContaining("Q2"), lowAud: 30_000_000, midAud: 50_000_000, highAud: 79_500_000, asOf: "2026-09-17", n: 11 });
    expect(rows[0].source).toMatch(/N=11/);
    expect(rows[1]).toMatchObject({ midAud: 250_000_000, n: 1, asOf: "2026-09-17" });
    expect(rows[2]).toMatchObject({ label: expect.stringContaining("AU stage baseline"), lowAud: 6_000_000, midAud: 10_000_000, highAud: 15_000_000 });
    expect(ch.narrative).toMatch(/Cross-check: startups in the same SVI quartile \(Q2\) raised at a median of A\$50,000,000 \(N=11; median post-money A\$250,000,000, N=1\)/);
  });

  it("backtest bucket selection: in range → that bucket; gap → nearest; outside → edge; no valuation row when the bucket has none; no backtest → stage baseline only", () => {
    expect(backtestBucketFor(backtest, 110)?.quartile).toBe(1);
    expect(backtestBucketFor(backtest, 117)?.quartile).toBe(2); // gap 116–118 → nearest midpoint (Q2 at 123 beats Q1 at 108)
    expect(backtestBucketFor(backtest, 200)?.quartile).toBe(4);
    expect(backtestBucketFor(backtest, 74)?.quartile).toBe(1);
    expect(backtestBucketFor(null, 120)).toBeNull();
    expect(backtestBucketFor(backtest, undefined)).toBeNull();
    const q3 = buildValuationChapter({ ...base, vc: { ...demoVcValuation(), backtest }, sviIndex: 135 });
    expect(q3.crossChecks).toHaveLength(2);
    expect(q3.crossChecks?.[0].n).toBe(10);
    const none = buildValuationChapter({ ...base, vc: { ...demoVcValuation(), backtest: null } });
    expect(none.crossChecks).toHaveLength(1);
    expect(none.crossChecks?.[0].midAud).toBe(VALUATION_BASELINES_AUD[3].mid);
    expect(none.narrative).toMatch(/Cross-check: the AU stage baseline/);
    expect(none.narrative).not.toMatch(/same SVI quartile/);
  });

  it("legacy vc without a stage baseline falls back to VALUATION_BASELINES_AUD[stage]", () => {
    const ch = buildValuationChapter({ ...base, stage: 5, vc: vc() });
    expect(ch.crossChecks?.at(-1)).toMatchObject({ lowAud: VALUATION_BASELINES_AUD[5].low, midAud: VALUATION_BASELINES_AUD[5].mid, highAud: VALUATION_BASELINES_AUD[5].high });
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
    // S42: the CFO injection raise is NOT a default any more — a legacy injection without `raiseStated` counts as unstated.
    expect(above.raiseAud).toBe(0);

    const below = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 2_000_000, statedCapKind: "valuation" } }).ask!;
    expect(below.verdict).toBe("below_consensus");
    expect(below.gapPct).toBe(-67);

    const post = buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 8_000_000, statedCapKind: "post_money", raiseAud: 2_000_000 } }).ask!;
    expect(post.preMoneyAud).toBe(6_000_000);
    expect(post.verdict).toBe("aligned");
    expect(post.gapPct).toBe(0);
  });

  it("a founder-stated raise on the CFO injection (raiseStated) is used when the ask carries none", () => {
    const withStated = vc({ injection: { raiseAud: 900_000, raiseStated: true, preMoneyAud: 6_000_000 } });
    const ask = buildValuationChapter({ ...base, vc: withStated, ask: { statedCapAud: 7_000_000, statedCapKind: "pre_money" } }).ask!;
    expect(ask.raiseAud).toBe(900_000);
  });

  it("no stated cap → no ask block (never invented from the CFO injection); a zero / NaN cap is ignored", () => {
    expect(buildValuationChapter({ ...base, vc: vc() }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: demoVcValuation() }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: 0 } }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: vc(), ask: { statedCapAud: Number.NaN } }).ask).toBeUndefined();
    expect(buildValuationChapter({ ...base, vc: vc(), ask: { raiseAud: 1_000_000 } }).ask).toBeUndefined();
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

  it("comparables N / with-multiples N fall back to lib/data/au-comparables (32 today, F5) with up to 5 anonymised rows", () => {
    const ch = buildValuationChapter({ ...base, vc: vc() });
    expect(ch.comparables.n).toBe(AU_COMPARABLES_COUNT);
    expect(ch.comparables.withMultiplesN).toBe(AU_COMPARABLES_WITH_MULTIPLES_COUNT);
    expect(ch.comparables.rows.length).toBeLessThanOrEqual(5);
    expect(ch.comparables.rows.every((r) => r.name === "anonymised" && r.source === "au-comparables.ts")).toBe(true);
  });

  it("S-R5: verified au_comparable_raises rows drive N / with-multiples N, the scatter subtitle and the sources window", () => {
    const row = (id: string, name: string, round_date: string, arr_multiple: number | null) => ({
      id, name, sector: "SaaS", stage: "seed", round_date, round_label: "Seed", amount_aud: 2_000_000, post_money_aud: null, arr_aud: null,
      arr_multiple, ebitda_multiple: null, founded_year: null, notable: false, note: null, source_name: "startup-daily", source_url: "https://www.startupdaily.net/x", source_date: round_date,
    });
    setComparablesForTests([row("a", "Alpha", "2025-02-01", 9), row("b", "Beta", "2026-01-15", null), row("c", "Gamma", "2024-09-09", 14)]);
    try {
      const ch = buildValuationChapter({ ...base, vc: vc({ sectorMultiples: null }) });
      expect(ch.comparables.n).toBe(3);
      expect(ch.comparables.withMultiplesN).toBe(2);
      expect(ch.comparables.rows.every((r) => r.name === "anonymised" && r.source === "au_comparable_raises")).toBe(true);
      expect(ch.sectorMultiples.sourceDate).toBe("2024–2026");
      expect(ch.sectorMultiples.sourceLabel).toMatch(/verified table/);
      const scatter = ch.visuals.find((v) => v.id === "valuation-comparables");
      expect(scatter?.subtitle).toBe("3 raises tracked, 2 with disclosed multiples (sources dated 2024–2026)");
    } finally {
      setComparablesForTests(null);
    }
  });

  it("narrative: range + method transparency + the AU discount line, never a single point; grounded only with a revenue evidence row", () => {
    const ch = buildValuationChapter({ ...base, vc: vc(), revenueEvidenceIds: ["ev-stripe"] });
    expect(ch.narrative).toMatch(/range A\$4,000,000–A\$9,000,000/);
    expect(ch.narrative).toMatch(/Consensus of the 5 weighted methods/);
    expect(ch.narrative).toMatch(/US multiples are discounted 20–40 %/);
    expect(ch.narrative).toMatch(/connector-evidenced: stripe \(last sync\)/);
    expect(ch.audit.grounded).toBe(true);
    expect(ch.visuals.map((v) => v.kind)).toEqual(["range_bars", "scatter"]);
    expect(ch.visuals[0].dataState).toBe("partial");
    const ungrounded = buildValuationChapter({ ...base, vc: vc() });
    expect(ungrounded.audit.grounded).toBe(false);
    expect(ungrounded.visuals[0].dataState).toBe("benchmark_only");
    const assumed = buildValuationChapter({ ...base, vc: vc({ inputs: { mrrAud: 10_000, arrAud: 120_000, sector: "saas", stage: "seed", revenueSource: "founder-stated" } }) });
    expect(assumed.narrative).toMatch(/Growth assumed at the saas sector median/);
    expect(assumed.narrative).toMatch(/founder-stated\); the revenue multiple carries the largest weight, halved/);
  });

  it("sourceDateFromLabel parses YYYY-MM and YYYY-MM-DD, else the fallback", () => {
    expect(sourceDateFromLabel("BlockID static table (2026-06) · x", "?")).toBe("2026-06");
    expect(sourceDateFromLabel("SaaS Capital Index, 2026-07-01", "?")).toBe("2026-07-01");
    expect(sourceDateFromLabel("no date here", "2021–2025")).toBe("2021–2025");
  });
});

describe("adapter integration", () => {
  it("fromSnapshot with a `vc` input renders the 7-method chapter (schema-valid) — the TBR three-case table is retired for pipeline rows", () => {
    const report = fromSnapshot({
      snapshotId: "snap-1",
      startupName: "Acme",
      industry: "saas",
      stageLabel: "Early Traction",
      stage: 3,
      sviTotal: 120,
      dimStates: { tre: { score: 55 }, mpc: { score: 60 } },
      vc: { ...demoVcValuation(), backtest },
      valuationAsk: { statedCapAud: 7_000_000, statedCapKind: "pre_money", raiseAud: 1_000_000 },
      revenueEvidenceIds: ["ev-stripe"],
    });
    expect(isReportV2(report)).toBe(true);
    expect(report.valuation.methods).toHaveLength(7);
    expect(report.valuation.methods.filter((m) => m.applicable)).toHaveLength(5);
    expect(report.valuation.ask?.verdict).toBe("aligned");
    expect(report.valuation.inputs?.revenueSource).toBe("connector");
    expect(report.valuation.crossChecks?.[0].n).toBe(11);
    expect(report.appendix.sourcesDated.some((s) => /SVI backtest quartiles \(N=49/.test(s.label) && s.date === "2026-09-17")).toBe(true);
    expect(report.valuation.visuals[0].title).toBe("Valuation methods and consensus band");
    expect(report.valuation.narrative).not.toMatch(/three-case/i);
  });

  it("fromSnapshot without a `vc` keeps the directional three-case fallback: all 7 methods non-applicable, no inputs, stage baseline as the only cross-check, one honest line, no ask", () => {
    const report = fromSnapshot({ snapshotId: "snap-2", stageLabel: "Seed", stage: 2, sviTotal: 100, dimStates: { tre: { score: 40 } } });
    expect(isReportV2(report)).toBe(true);
    expect(report.valuation.methods).toHaveLength(7);
    expect(report.valuation.methods.every((m) => !m.applicable && m.weight === 0)).toBe(true);
    expect(report.valuation.inputs).toBeUndefined();
    expect(report.valuation.ask).toBeUndefined();
    expect(report.valuation.crossChecks).toHaveLength(1);
    expect(report.valuation.crossChecks?.[0]).toMatchObject({ midAud: VALUATION_BASELINES_AUD[2].mid });
    expect(report.valuation.narrative).toMatch(/No CFO method ran on this snapshot/);
    expect(report.valuation.visuals[0].title).toMatch(/three cases/);
  });
});
