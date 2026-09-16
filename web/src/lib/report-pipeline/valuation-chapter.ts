// valuation-chapter — the ValuationChapter of ReportV2 built from the CFO
// 5-method valuation (`agents/cfo-valuation.ts buildVcValuationReport`)
// instead of the hardcoded stage band (`estimateValuationRange`) and the
// SVI-only three-case table (spec 12-product-ai-tbr-v2.md §C.5, S-R3).
//
// Pure and client-safe: no ai-client, no supabase, no cfo-valuation import.
// The server (report-pipeline/gather.ts) runs buildVcValuationReport with the
// inputs from loadProjectReportContext and hands the result in as
// `VcValuationLike`; this module only shapes it:
//
//   methods          6 rows — revenue_multiple / berkus / dcf_proxy /
//                    comparables / risk_factor_summation carry the CFO weights
//                    (normalised to sum 1); scorecard is weight 0 and
//                    `applicable:false` unless the startup is pre-revenue,
//                    where it is shown as a reference row.
//   consensus        the CFO blended range (never a single point).
//   ask              founder-stated cap / pre-money cross-checked against the
//                    consensus with `crossCheckStatedCap` (reported, never applied).
//   sectorMultiples  the resolved ARR band with `sourceLabel` + `sourceDate`
//                    (`vcBenchmark()` — approved override or the static table).
//   comparables      N (+ with-multiples N) from lib/valuation/comparables-repo
//                    (S-R5: verified `au_comparable_raises` rows, static 32 fallback).
//   scenarios        bear / base / bull — the three-case model of the chapter.
//
// cfo-advisor guardrail: always a range + method transparency; US multiples
// are discounted 20–40 % in the AU tables (`AU_MARKET_DATA`), which the
// narrative says out loud.

import { getMultiplesBenchmark, mapSectorToAUIndustry, mapStageToAUStage } from "@/lib/data/au-comparables";
import { comparablesCounts, topComparables } from "@/lib/valuation/comparables-repo";
import { VALUATION_METHOD_KEYS, type ValuationChapter, type ValuationMethodKey } from "@/lib/report-v2/schema";
import { makeVisual } from "@/lib/report-visuals";
import { crossCheckStatedCap, type CapCrossCheck } from "@/lib/valuation";

// ── Inputs ──────────────────────────────────────────────────────────────────

/** Structural subset of `agents/cfo-valuation.ts:VcValuationReport` (no import — keeps this module client-safe). */
export interface VcValuationLike {
  blended: { lowAud: number; midAud: number; highAud: number; confidence: number };
  methods: Array<{ method: string; lowAud: number; midAud: number; highAud: number; weight: number; rationale: string }>;
  scenarios: { bear: number; base: number; bull: number };
  unitEconomics?: Record<string, unknown>;
  sources?: string[];
  /** Optional CFO injection block — `raiseAud` is the default ask when the founder stated none. */
  injection?: { raiseAud?: number; preMoneyAud?: number };
  /** Resolved sector multiples with a dated source (server: `vcBenchmark()`); absent → static comparables table. */
  sectorMultiples?: { sector: string; low: number; median: number; high: number; sourceLabel: string; sourceDate: string } | null;
  /** The inputs the CFO model ran on (surfaced in the narrative + provenance). */
  inputs?: { mrrAud?: number; arrAud?: number; monthlyGrowthRatePct?: number; sector?: string; stage?: string; esicQualifies?: boolean; estimatedRdtiRefundAud?: number; revenueSource?: string | null };
}

export interface ValuationAskInput {
  /** Founder-stated SAFE cap / pre-money / post-money / valuation, AUD. */
  statedCapAud?: number | null;
  statedCapKind?: CapCrossCheck["kind"] | null;
  /** The round the founder says they are raising, AUD. */
  raiseAud?: number | null;
}

export interface ValuationChapterInput {
  vc: VcValuationLike;
  /** SVI stage 0–7 (Concept … Corporation). */
  stage: number;
  stageLabel: string;
  industry: string | null;
  ask?: ValuationAskInput | null;
  /** Evidence ids behind the revenue figure (stripe / xero / founder). Empty → the chapter is unevidenced. */
  revenueEvidenceIds?: string[];
  /** ISO timestamp for the audit stamp. */
  at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<ValuationMethodKey, string> = {
  revenue_multiple: "Revenue multiple",
  berkus: "Berkus",
  dcf_proxy: "DCF proxy",
  comparables: "AU comparables",
  risk_factor_summation: "Risk-factor summation",
  scorecard: "Scorecard (reference)",
};

/** Source date parsed from a `vcBenchmark().sourceLabel` ("… (2026-06) …" / "…, 2026-07-01"). */
export function sourceDateFromLabel(label: string, fallback: string): string {
  const iso = label.match(/\d{4}-\d{2}(?:-\d{2})?/);
  return iso ? iso[0] : fallback;
}

export function isPreRevenue(vc: VcValuationLike): boolean {
  const arr = vc.inputs?.arrAud ?? (typeof vc.inputs?.mrrAud === "number" ? vc.inputs.mrrAud * 12 : undefined);
  if (typeof arr === "number") return arr <= 0;
  // No inputs recorded: the CFO gives revenue_multiple weight 0.1 (normalised) when ARR is 0.
  const rev = vc.methods.find((m) => m.method === "revenue_multiple");
  return !rev || rev.midAud <= 0;
}

function aud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

function round0(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * The 6-method valuation chapter. Weights of the five applicable methods
 * always sum to 1 (scorecard excluded); pre-revenue startups see the
 * scorecard as a reference row (`applicable:true`, weight 0).
 */
export function buildValuationChapter(input: ValuationChapterInput): ValuationChapter {
  const { vc, at } = input;
  const preRevenue = isPreRevenue(vc);

  // Methods — normalise the five active weights so they sum to exactly 1.
  const active = VALUATION_METHOD_KEYS.filter((k) => k !== "scorecard");
  const rawWeights = active.map((k) => {
    const row = vc.methods.find((m) => m.method === k);
    return row && Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 0;
  });
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const methods: ValuationChapter["methods"] = VALUATION_METHOD_KEYS.map((key) => {
    const row = vc.methods.find((m) => m.method === key);
    if (key === "scorecard") {
      return {
        method: key,
        lowAud: round0(row?.lowAud ?? 0),
        midAud: round0(row?.midAud ?? 0),
        highAud: round0(row?.highAud ?? 0),
        weight: 0,
        rationale: preRevenue
          ? `${row?.rationale ?? "Scorecard (Bill Payne) against the AU stage median"} — reference only (weight 0): shown because the startup is pre-revenue.`
          : `${row?.rationale ?? "Scorecard (Bill Payne)"} — weight 0; not applicable once revenue multiples apply.`,
        applicable: preRevenue && Boolean(row),
      };
    }
    const idx = active.indexOf(key);
    const weight = weightSum > 0 ? rawWeights[idx] / weightSum : 1 / active.length;
    return {
      method: key,
      lowAud: round0(row?.lowAud ?? 0),
      midAud: round0(row?.midAud ?? 0),
      highAud: round0(row?.highAud ?? 0),
      weight: Math.round(weight * 10_000) / 10_000,
      rationale: row?.rationale ?? `${METHOD_LABEL[key]} — not computed for this snapshot.`,
      applicable: Boolean(row) && weight > 0,
    };
  });
  // Rounding drift: put the remainder on the largest active weight so the sum is 1.
  const activeRows = methods.filter((m) => m.method !== "scorecard");
  const drift = 1 - activeRows.reduce((a, m) => a + m.weight, 0);
  if (Math.abs(drift) > 1e-9) {
    const biggest = activeRows.reduce((a, b) => (b.weight > a.weight ? b : a), activeRows[0]);
    biggest.weight = Math.round((biggest.weight + drift) * 10_000) / 10_000;
  }

  const consensus = {
    lowAud: round0(vc.blended.lowAud),
    midAud: round0(vc.blended.midAud),
    highAud: round0(vc.blended.highAud),
    confidence: Math.max(0, Math.min(1, (vc.blended.confidence > 1 ? vc.blended.confidence / 100 : vc.blended.confidence) || 0)),
  };

  // Ask cross-check — the founder's number is reported and flagged, never applied.
  let ask: ValuationChapter["ask"];
  let askNote: string | null = null;
  const statedCap = input.ask?.statedCapAud;
  if (typeof statedCap === "number" && Number.isFinite(statedCap) && statedCap > 0) {
    const kind = input.ask?.statedCapKind ?? "cap";
    const raise = input.ask?.raiseAud ?? vc.injection?.raiseAud ?? 0;
    const preMoney = kind === "post_money" ? Math.max(0, statedCap - (raise ?? 0)) : statedCap;
    const check = crossCheckStatedCap({ low: consensus.lowAud, mid: consensus.midAud, high: consensus.highAud }, preMoney, kind === "post_money" ? "pre_money" : kind);
    const verdict: NonNullable<ValuationChapter["ask"]>["verdict"] =
      check?.verdict === "indicative_above" ? "below_consensus" : check?.verdict === "indicative_below" ? "above_consensus" : "aligned";
    ask = {
      preMoneyAud: round0(preMoney),
      raiseAud: round0(raise ?? 0),
      verdict,
      gapPct: consensus.midAud > 0 ? Math.round(((preMoney - consensus.midAud) / consensus.midAud) * 100) : 0,
    };
    askNote = check?.note ?? null;
  }

  // Sector multiples — dated source from vcBenchmark() when the server passed it.
  const auIndustry = mapSectorToAUIndustry(input.industry ?? vc.inputs?.sector ?? undefined);
  const auStage = mapStageToAUStage(input.stageLabel || input.stage);
  const staticMult = getMultiplesBenchmark(auIndustry, auStage);
  // S-R5: live pool (verified table rows, static fallback) — counts + window + rows.
  const live = comparablesCounts();
  const sectorMultiples = vc.sectorMultiples
    ? { ...vc.sectorMultiples, sourceDate: vc.sectorMultiples.sourceDate || sourceDateFromLabel(vc.sectorMultiples.sourceLabel, live.sourceWindow) }
    : { sector: auIndustry, low: staticMult.low, median: staticMult.median, high: staticMult.high, sourceLabel: live.source === "table" ? "BlockID AU comparables (verified table)" : "BlockID AU comparables (code table)", sourceDate: live.sourceWindow };

  const comps = topComparables(auIndustry, auStage, 5);
  const comparables: ValuationChapter["comparables"] = {
    n: live.n,
    withMultiplesN: live.withMultiplesN,
    rows: comps.map((cp) => ({ name: "anonymised", stage: cp.stage, industry: cp.industry, year: cp.founded_year, arrMultiple: cp.arr_multiple, source: live.sourceLabel })),
  };

  const scenarios = { bear: round0(vc.scenarios.bear), base: round0(vc.scenarios.base), bull: round0(vc.scenarios.bull) };

  // Visuals — deterministic renders of the numbers above.
  const rangeBars = makeVisual({
    id: "valuation-range-bars",
    kind: "range_bars",
    agentId: "cfo",
    title: "Valuation methods and consensus band",
    subtitle: preRevenue ? "5 weighted methods; scorecard shown as a pre-revenue reference at weight 0" : "5 weighted methods; scorecard shown at weight 0",
    dataState: (input.revenueEvidenceIds?.length ?? 0) > 0 ? "partial" : "benchmark_only",
    data: {
      rows: methods.map((m) => ({ label: METHOD_LABEL[m.method], low: m.lowAud, mid: m.midAud, high: m.highAud, applicable: m.applicable })),
      consensus: { low: consensus.lowAud, mid: consensus.midAud, high: consensus.highAud, label: "Consensus" },
      currency: "AUD",
    },
    a11y: { tableFallback: [...methods.map((m) => ({ method: m.method, low: m.lowAud, mid: m.midAud, high: m.highAud, weight: m.weight })), { method: "bear", aud: scenarios.bear }, { method: "base", aud: scenarios.base }, { method: "bull", aud: scenarios.bull }] },
  });
  const scatter = makeVisual({
    id: "valuation-comparables",
    kind: "scatter",
    agentId: "cfo",
    title: `AU comparables — ${comps.length} nearest by sector / stage (ARR multiple)`,
    subtitle: `${live.n} raises tracked, ${live.withMultiplesN} with disclosed multiples (sources dated ${live.sourceWindow})`,
    dataState: "partial",
    data: { xLabel: "Founded year", yLabel: "ARR multiple (×)", points: comps.map((cp) => ({ label: cp.industry, x: cp.founded_year - 2000, y: cp.arr_multiple })) },
    a11y: { tableFallback: comps.map((cp) => ({ industry: cp.industry, stage: cp.stage, year: cp.founded_year, arr_multiple: cp.arr_multiple })) },
  });

  const mrr = vc.inputs?.mrrAud;
  const revenueLine = preRevenue
    ? "Pre-revenue: Berkus and the risk-factor summation drive the band; the scorecard row is a reference only."
    : `Revenue input ${aud((mrr ?? 0) * 12)} ARR${vc.inputs?.revenueSource ? ` (${vc.inputs.revenueSource})` : ""}; the revenue multiple carries the largest weight.`;
  const narrative = [
    `Consensus of the five weighted methods is ${aud(consensus.midAud)} pre-money (range ${aud(consensus.lowAud)}–${aud(consensus.highAud)}, confidence ${Math.round(consensus.confidence * 100)} %).`,
    revenueLine,
    `Sector multiples ${sectorMultiples.low}× / ${sectorMultiples.median}× / ${sectorMultiples.high}× ARR — ${sectorMultiples.sourceLabel} (${sectorMultiples.sourceDate}); US multiples are discounted 20–40 % for the AU market.`,
    `Scenarios: bear ${aud(scenarios.bear)} · base ${aud(scenarios.base)} · bull ${aud(scenarios.bull)}.`,
    askNote ? `Ask cross-check: ${askNote}.` : null,
    "Directional, not a formal valuation — a range with method transparency, never a single point.",
  ]
    .filter((s): s is string => Boolean(s))
    .join(" ");

  return {
    currency: "AUD",
    methods,
    consensus,
    ...(ask ? { ask } : {}),
    sectorMultiples,
    comparables,
    unitEconomics: vc.unitEconomics,
    scenarios,
    visuals: [rangeBars, scatter],
    narrative,
    audit: { grounded: (input.revenueEvidenceIds?.length ?? 0) > 0 || preRevenue, uncited: 0, revised: false, auditor: "llm-auditor", at },
  };
}
