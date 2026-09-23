// valuation-chapter — the ValuationChapter of ReportV2 built from the CFO
// valuation (`agents/cfo-valuation.ts buildVcValuationReport`) instead of
// the hardcoded stage band (`estimateValuationRange`) and the SVI-only
// three-case table (spec 12-product-ai-tbr-v2.md §C.5, S-R3; G19-S42).
//
// Pure and client-safe: no ai-client, no supabase, no fs, no cfo-valuation
// import. The server (report-pipeline/gather.ts) runs buildVcValuationReport
// with the inputs from loadProjectReportContext, reads the SVI backtest, and
// hands both in as `VcValuationLike`; this module only shapes them:
//
//   methods          7 rows — revenue_multiple / berkus / dcf_proxy /
//                    comparables / risk_factor_summation / scorecard /
//                    stage_baseline. Applicable rows carry the CFO weights
//                    (normalised to sum 1); non-applicable rows weigh 0 and
//                    keep their rationale ("Needs revenue: …").
//                    Pre-revenue (G19 D3): Berkus 0.5 + scorecard 0.3 +
//                    stage baseline 0.2; the four revenue methods are hidden.
//   inputs           what the model ran on (MRR/ARR + source, growth +
//                    whether assumed, ESIC / RDTI, Berkus pillars, stage,
//                    sector multiples, raise stated?).
//   derivation       one line per method ("ARR A$1.2M × 6.0–7.5 …").
//   crossChecks      SVI backtest quartile (median round / valuation, N) +
//                    the AU stage baseline.
//   consensus        the CFO blended range (never a single point).
//   ask              ONLY when the founder stated a cap / raise; cross-checked
//                    with `crossCheckStatedCap` (reported, never applied).
//   sectorMultiples  the resolved ARR band with `sourceLabel` + `sourceDate`.
//   comparables      N (+ with-multiples N) from lib/valuation/comparables-repo.
//   scenarios        bear / base / bull — the three-case model of the chapter.
//   consistencyNotes filled by consistency-gates (rendered, not just logged).
//
// cfo-advisor guardrail: always a range + method transparency; US multiples
// are discounted 20–40 % in the AU tables (`AU_MARKET_DATA`), which the
// narrative says out loud.

import { benchmarkLabel, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { getMultiplesBenchmark, mapSectorToAUIndustry, mapStageToAUStage } from "@/lib/data/au-comparables";
import { comparablesCounts, topComparables } from "@/lib/valuation/comparables-repo";
import { VALUATION_METHOD_KEYS, type AvailableValuationChapter, type ValuationCrossCheck, type ValuationInputsV2, type ValuationMethodKey } from "@/lib/report-v2/schema";
import { makeVisual } from "@/lib/report-visuals";
import { crossCheckStatedCap, VALUATION_BASELINES_AUD, type CapCrossCheck } from "@/lib/valuation";

// ── Inputs ──────────────────────────────────────────────────────────────────

/** Structural subset of `lib/backtest/run-backtest.ts:BucketRow` (no import — keeps this module client-safe). */
export interface BacktestBucketLike {
  quartile: number;
  label: string;
  n: number;
  svi_min: number;
  svi_max: number;
  median_round_aud: number | null;
  p25_round_aud: number | null;
  p75_round_aud: number | null;
  n_valuation: number;
  median_valuation_aud: number | null;
}

export interface BacktestLike {
  generated_at: string;
  n: number;
  n_with_round?: number;
  buckets: BacktestBucketLike[];
}

/** Structural subset of `agents/cfo-valuation.ts:VcValuationReport` (no import — keeps this module client-safe). */
export interface VcValuationLike {
  blended: { lowAud: number; midAud: number; highAud: number; confidence: number };
  methods: Array<{ method: string; lowAud: number; midAud: number; highAud: number; weight: number; rationale: string; applicable?: boolean }>;
  scenarios: { bear: number; base: number; bull: number };
  unitEconomics?: Record<string, unknown>;
  sources?: string[];
  /** Optional CFO injection block — `raiseAud` counts only when `raiseStated` (G19-S42: never invented). */
  injection?: { raiseAud?: number; raiseStated?: boolean; preMoneyAud?: number };
  /** Resolved sector multiples with a dated source (server: `vcBenchmark()`); absent → static comparables table. */
  sectorMultiples?: { sector: string; low: number; median: number; high: number; sourceLabel: string; sourceDate: string } | null;
  /** The raw inputs the CFO model ran on (gather.ts row) — kept for provenance / tests. */
  inputs?: { mrrAud?: number; arrAud?: number; monthlyGrowthRatePct?: number; sector?: string; stage?: string; sviStage?: number; esicQualifies?: boolean; estimatedRdtiRefundAud?: number; revenueSource?: string | null; raiseAud?: number; [key: string]: unknown };
  /** G19-S42: the normalised inputs record from `buildVcValuationReport().inputs`. */
  valuationInputs?: ValuationInputsV2 | null;
  /** G19-S42: per-method derivation lines from the CFO model. */
  derivation?: Partial<Record<string, string>> | null;
  /** G19-S42: the AU stage baseline the CFO model used. */
  stageBaseline?: { sviStage: number; stageLabel: string; lowAud: number; midAud: number; highAud: number; source: string } | null;
  /** G19-S42: the published SVI backtest (server: `readSviBacktestLatest()`), null when not published. */
  backtest?: BacktestLike | null;
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
  /** The open-ended SVI index (100 = baseline) — picks the backtest quartile. */
  sviIndex?: number | null;
  ask?: ValuationAskInput | null;
  /** Evidence ids behind the revenue figure (stripe / xero / founder). Empty → the chapter is unevidenced. */
  revenueEvidenceIds?: string[];
  /** ISO timestamp for the audit stamp. */
  at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export const METHOD_LABEL: Record<ValuationMethodKey, string> = {
  revenue_multiple: "Revenue multiple",
  berkus: "Berkus",
  dcf_proxy: "Adjusted ARR multiple (heuristic)",
  comparables: "Sector/growth ARR multiple",
  risk_factor_summation: "Tax-adjusted ARR multiple (heuristic)",
  scorecard: "Scorecard (Bill Payne)",
  stage_baseline: "AU stage baseline",
};

const PRE_REVENUE_HEURISTICS: readonly ValuationMethodKey[] = ["berkus", "scorecard", "stage_baseline"];

const SVI_STAGE_LABEL: Record<number, string> = {
  0: "Concept",
  1: "Validated idea",
  2: "MVP / pre-seed",
  3: "Traction / seed",
  4: "Revenue / Series A",
  5: "Growth",
  6: "Scale",
  7: "Corporation",
};

/** Source date parsed from a `vcBenchmark().sourceLabel` ("… (2026-06) …" / "…, 2026-07-01"). */
export function sourceDateFromLabel(label: string, fallback: string): string {
  const iso = label.match(/\d{4}-\d{2}(?:-\d{2})?/);
  return iso ? iso[0] : fallback;
}

export function isPreRevenue(vc: VcValuationLike): boolean {
  if (vc.valuationInputs) return vc.valuationInputs.arrAud <= 0;
  const arr = vc.inputs?.arrAud ?? (typeof vc.inputs?.mrrAud === "number" ? vc.inputs.mrrAud * 12 : undefined);
  if (typeof arr === "number") return arr <= 0;
  // No inputs recorded: a legacy CFO row with revenue_multiple mid 0 is pre-revenue.
  const rev = vc.methods.find((m) => m.method === "revenue_multiple");
  return !rev || rev.midAud <= 0;
}

/** Map a free-text revenue-source label (gather.ts) to the four-way enum. */
export function revenueSourceFromLabel(label: string | null | undefined, mrrAud: number): ValuationInputsV2["revenueSource"] {
  if (!(mrrAud > 0)) return "none";
  const s = (label ?? "").toLowerCase();
  if (s === "connector" || /stripe|xero|myob|quickbooks|connected|connector/.test(s)) return "connector";
  if (s === "document" || /document|upload|statement|financials/.test(s)) return "document";
  return "founder_stated";
}

/** The backtest quartile bucket whose SVI range contains `svi` (null when unpublished / out of range). */
export function backtestBucketFor(backtest: BacktestLike | null | undefined, svi: number | null | undefined): BacktestBucketLike | null {
  if (!backtest || !Array.isArray(backtest.buckets) || typeof svi !== "number" || !Number.isFinite(svi)) return null;
  const inRange = backtest.buckets.find((b) => svi >= b.svi_min && svi <= b.svi_max);
  if (inRange) return inRange;
  // Between two buckets (gap in the sample) → nearest by SVI midpoint; outside → edge bucket.
  const sorted = [...backtest.buckets].sort((a, b) => a.svi_min - b.svi_min);
  if (!sorted.length) return null;
  if (svi < sorted[0].svi_min) return sorted[0];
  if (svi > sorted[sorted.length - 1].svi_max) return sorted[sorted.length - 1];
  return sorted.reduce((best, b) => (Math.abs((b.svi_min + b.svi_max) / 2 - svi) < Math.abs((best.svi_min + best.svi_max) / 2 - svi) ? b : best), sorted[0]);
}

function aud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

function round0(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

/** The inputs table — the CFO record when present, else derived from the raw gather row. */
function inputsFor(vc: VcValuationLike, stage: number, sectorMultiples: AvailableValuationChapter["sectorMultiples"]): ValuationInputsV2 {
  if (vc.valuationInputs) return vc.valuationInputs;
  const raw = vc.inputs ?? {};
  const mrr = typeof raw.mrrAud === "number" ? raw.mrrAud : typeof raw.arrAud === "number" ? raw.arrAud / 12 : 0;
  const arr = typeof raw.arrAud === "number" ? raw.arrAud : mrr * 12;
  const growthObserved = typeof raw.monthlyGrowthRatePct === "number" && Number.isFinite(raw.monthlyGrowthRatePct);
  const raiseStated = typeof raw.raiseAud === "number" && raw.raiseAud > 0;
  return {
    mrrAud: round0(mrr),
    arrAud: round0(arr),
    revenueSource: revenueSourceFromLabel(raw.revenueSource, mrr),
    ...(growthObserved ? { monthlyGrowthRatePct: raw.monthlyGrowthRatePct as number } : {}),
    growthAssumed: arr > 0 && !growthObserved,
    esicQualifies: raw.esicQualifies === true,
    rdtiRefundAud: round0(typeof raw.estimatedRdtiRefundAud === "number" ? raw.estimatedRdtiRefundAud : 0),
    berkusPillars: {
      soundIdea: true,
      prototype: mrr > 0 || (typeof raw.customers === "number" && raw.customers > 0),
      qualityTeam: raw.hasFounderVesting === true,
      strategicRelationships: raw.hasShareholdersAgreement === true || raw.hasDataRoom === true,
      productRollout: mrr > 0,
    },
    stage: typeof raw.stage === "string" ? raw.stage : "pre-seed",
    sviStage: typeof raw.sviStage === "number" ? raw.sviStage : stage,
    sector: typeof raw.sector === "string" ? raw.sector : sectorMultiples.sector,
    sectorMultipleLow: sectorMultiples.low,
    sectorMultipleHigh: sectorMultiples.high,
    sectorMultipleMedian: sectorMultiples.median,
    raiseStated,
    ...(raiseStated ? { raiseAud: raw.raiseAud as number } : {}),
  };
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * The 7-method valuation chapter. Weights of the applicable methods always
 * sum to 1; non-applicable rows weigh 0 and keep their rationale so the
 * renderer can say "N methods need revenue".
 */
export function buildValuationChapter(input: ValuationChapterInput): AvailableValuationChapter {
  const { vc, at } = input;
  const preRevenue = isPreRevenue(vc);

  // Methods — applicability from the CFO row when it says so (S42+), else the
  // legacy rule (weight > 0; scorecard = pre-revenue reference at weight 0).
  const applicableOf = (key: ValuationMethodKey, row: VcValuationLike["methods"][number] | undefined): boolean => {
    if (!row) return false;
    if (typeof row.applicable === "boolean") return row.applicable;
    if (key === "scorecard") return preRevenue;
    return Number.isFinite(row.weight) && row.weight > 0;
  };
  const rows = VALUATION_METHOD_KEYS.map((key) => {
    const row = vc.methods.find((m) => m.method === key);
    const applicable = applicableOf(key, row);
    const legacyScorecardRef = key === "scorecard" && applicable && typeof row?.applicable !== "boolean";
    const rawWeight = applicable && !legacyScorecardRef && row && Number.isFinite(row.weight) ? Math.max(0, row.weight) : 0;
    return { key, row, applicable, rawWeight };
  });
  const weightSum = rows.reduce((a, r) => a + r.rawWeight, 0);
  const methods: AvailableValuationChapter["methods"] = rows.map(({ key, row, applicable, rawWeight }) => {
    const weight = weightSum > 0 ? rawWeight / weightSum : 0;
    const rationale = row?.rationale ? row.rationale : `${METHOD_LABEL[key]} — not computed for this snapshot.`;
    return {
      method: key,
      lowAud: round0(row?.lowAud ?? 0),
      midAud: round0(row?.midAud ?? 0),
      highAud: round0(row?.highAud ?? 0),
      weight: Math.round(weight * 10_000) / 10_000,
      rationale,
      applicable,
    };
  });
  // Rounding drift: put the remainder on the largest weight so the sum is exactly 1.
  const weighted = methods.filter((m) => m.weight > 0);
  if (weighted.length) {
    const drift = 1 - weighted.reduce((a, m) => a + m.weight, 0);
    if (Math.abs(drift) > 1e-9) {
      const biggest = weighted.reduce((a, b) => (b.weight > a.weight ? b : a), weighted[0]);
      biggest.weight = Math.round((biggest.weight + drift) * 10_000) / 10_000;
    }
  }
  const hiddenNeedRevenue = methods.filter((m) => !m.applicable && !PRE_REVENUE_HEURISTICS.includes(m.method)).length;

  const consensus = {
    lowAud: round0(vc.blended.lowAud),
    midAud: round0(vc.blended.midAud),
    highAud: round0(vc.blended.highAud),
    confidence: Math.max(0, Math.min(1, (vc.blended.confidence > 1 ? vc.blended.confidence / 100 : vc.blended.confidence) || 0)),
  };

  // Ask cross-check — only when the founder stated a cap; the raise is the
  // founder's number (or the CFO injection when it was founder-stated), never invented.
  let ask: AvailableValuationChapter["ask"];
  let askNote: string | null = null;
  const statedCap = input.ask?.statedCapAud;
  const statedRaise = typeof input.ask?.raiseAud === "number" && Number.isFinite(input.ask.raiseAud) && input.ask.raiseAud > 0
    ? input.ask.raiseAud
    : vc.injection?.raiseStated === true && typeof vc.injection.raiseAud === "number" && vc.injection.raiseAud > 0
      ? vc.injection.raiseAud
      : 0;
  if (typeof statedCap === "number" && Number.isFinite(statedCap) && statedCap > 0) {
    const kind = input.ask?.statedCapKind ?? "cap";
    const preMoney = kind === "post_money" ? Math.max(0, statedCap - statedRaise) : statedCap;
    const check = crossCheckStatedCap({ low: consensus.lowAud, mid: consensus.midAud, high: consensus.highAud }, preMoney, kind === "post_money" ? "pre_money" : kind);
    const verdict: NonNullable<AvailableValuationChapter["ask"]>["verdict"] =
      check?.verdict === "indicative_above" ? "below_consensus" : check?.verdict === "indicative_below" ? "above_consensus" : "aligned";
    ask = {
      preMoneyAud: round0(preMoney),
      raiseAud: round0(statedRaise),
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
  const comparables: AvailableValuationChapter["comparables"] = {
    n: live.n,
    withMultiplesN: live.withMultiplesN,
    rows: comps.map((cp) => ({ name: "anonymised", stage: cp.stage, industry: cp.industry, year: cp.founded_year, arrMultiple: cp.arr_multiple, source: live.sourceLabel })),
  };

  const scenarios = { bear: round0(vc.scenarios.bear), base: round0(vc.scenarios.base), bull: round0(vc.scenarios.bull) };

  // G19-S42: inputs, derivation, cross-checks. A raise stated on the ask
  // (gather.ts signals) counts as stated even when the CFO record ran without it.
  const rawInputs = inputsFor(vc, input.stage, sectorMultiples);
  const inputs: ValuationInputsV2 = statedRaise > 0 && !rawInputs.raiseStated ? { ...rawInputs, raiseStated: true, raiseAud: round0(statedRaise) } : rawInputs;
  const derivation: NonNullable<AvailableValuationChapter["derivation"]> = {};
  for (const key of VALUATION_METHOD_KEYS) {
    const line = vc.derivation?.[key];
    if (typeof line === "string" && line.trim()) derivation[key] = line;
  }
  const sviStage = Math.max(0, Math.min(7, Math.round(Number.isFinite(input.stage) ? input.stage : 0)));
  const baseline = vc.stageBaseline ?? {
    sviStage,
    stageLabel: SVI_STAGE_LABEL[sviStage] ?? input.stageLabel,
    lowAud: VALUATION_BASELINES_AUD[sviStage].low,
    midAud: VALUATION_BASELINES_AUD[sviStage].mid,
    highAud: VALUATION_BASELINES_AUD[sviStage].high,
    source: "Cut Through Venture — State of Australian Startup Funding 2024/25 medians",
  };
  const bucket = backtestBucketFor(vc.backtest, input.sviIndex);
  const backtestAsOf = vc.backtest?.generated_at ? vc.backtest.generated_at.slice(0, 10) : "";
  const crossChecks: ValuationCrossCheck[] = [
    ...(bucket && mayShowPercentile(bucket.n) && typeof bucket.median_round_aud === "number"
      ? [
          {
            label: `SVI backtest ${bucket.label} (SVI ${bucket.svi_min}–${bucket.svi_max}) — median round raised`,
            lowAud: round0(bucket.p25_round_aud ?? bucket.median_round_aud),
            midAud: round0(bucket.median_round_aud),
            highAud: round0(bucket.p75_round_aud ?? bucket.median_round_aud),
            source: `BlockID SVI backtest, N=${bucket.n} raises in quartile (${vc.backtest?.n ?? 0} scorable rows); rank calibration only, mostly seed–Series B`,
            asOf: backtestAsOf,
            n: bucket.n,
          },
          ...(typeof bucket.median_valuation_aud === "number" && bucket.median_valuation_aud > 0 && mayShowPercentile(bucket.n_valuation)
            ? [
                {
                  label: `SVI backtest ${bucket.label} — median post-money where disclosed`,
                  midAud: round0(bucket.median_valuation_aud),
                  source: `BlockID SVI backtest, N=${bucket.n_valuation} disclosed valuations in quartile`,
                  asOf: backtestAsOf,
                  n: bucket.n_valuation,
                },
              ]
            : []),
        ]
      : []),
    {
      label: `AU stage baseline — SVI stage ${baseline.sviStage} (${baseline.stageLabel}) pre-money`,
      lowAud: round0(baseline.lowAud),
      midAud: round0(baseline.midAud),
      highAud: round0(baseline.highAud),
      source: baseline.source,
      asOf: "2025",
    },
  ];

  // Visuals — deterministic renders of the numbers above.
  const shown = methods.filter((m) => m.applicable);
  const rangeBars = makeVisual({
    id: "valuation-range-bars",
    kind: "range_bars",
    agentId: "cfo",
    title: "Valuation methods and weighted range",
    subtitle: preRevenue
      ? `${shown.length} applicable methods (Berkus + scorecard + AU stage baseline); ${hiddenNeedRevenue} need revenue`
      : `${shown.length} weighted methods; scorecard and stage baseline shown as cross-checks`,
    dataState: (input.revenueEvidenceIds?.length ?? 0) > 0 ? "partial" : "benchmark_only",
    data: {
      rows: shown.map((m) => ({ label: METHOD_LABEL[m.method], low: m.lowAud, mid: m.midAud, high: m.highAud, applicable: m.applicable })),
      consensus: { low: consensus.lowAud, mid: consensus.midAud, high: consensus.highAud, label: "Weighted estimate" },
      currency: "AUD",
    },
    a11y: { tableFallback: [...shown.map((m) => ({ method: m.method, low: m.lowAud, mid: m.midAud, high: m.highAud, weight: m.weight })), { method: "bear", aud: scenarios.bear }, { method: "base", aud: scenarios.base }, { method: "bull", aud: scenarios.bull }] },
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

  const sourceWord = inputs.revenueSource === "connector" ? "connector-evidenced" : inputs.revenueSource === "document" ? "document-evidenced" : "founder-stated";
  const revenueLine = preRevenue
    ? `Pre-revenue: Berkus (50 %), the Bill Payne scorecard (30 %) and the AU stage baseline (20 %) carry the band; ${hiddenNeedRevenue} methods need revenue — connect Stripe or Xero, or state MRR, to unlock them.`
    : `Revenue input ${aud(inputs.arrAud)} ARR (${sourceWord}${vc.inputs?.revenueSource && typeof vc.inputs.revenueSource === "string" && !/^(connector|document|founder_stated|none)$/.test(vc.inputs.revenueSource) ? `: ${vc.inputs.revenueSource}` : ""}); the revenue multiple carries the largest weight${inputs.revenueSource === "founder_stated" ? ", halved until a connector or statement evidences the figure" : ""}.`;
  const growthLine = inputs.growthAssumed
    ? `Growth assumed at the ${inputs.sector} sector median ${inputs.assumedGrowthRatePct ?? "—"} %/mo — no observed rate; connect a revenue source with history to replace it.`
    : null;
  const crossCheckLine = bucket && mayShowPercentile(bucket.n) && typeof bucket.median_round_aud === "number"
    ? `Cross-check: startups in the same SVI quartile (${bucket.label}) raised at a median of ${aud(bucket.median_round_aud)} (N=${bucket.n}${typeof bucket.median_valuation_aud === "number" && mayShowPercentile(bucket.n_valuation) ? `; median post-money ${aud(bucket.median_valuation_aud)}, N=${bucket.n_valuation}` : ""}) — rank calibration only, not a valuation.`
    : `Cross-check: the AU stage baseline for ${baseline.stageLabel} is ${aud(baseline.midAud)} pre-money (${aud(baseline.lowAud)}–${aud(baseline.highAud)}).`;
  const narrative = [
    shown.length
      ? `Weighted estimate from ${shown.length} ${preRevenue ? "applicable" : "weighted"} methods is ${aud(consensus.midAud)} pre-money (range ${aud(consensus.lowAud)}–${aud(consensus.highAud)}, confidence ${Math.round(consensus.confidence * 100)} %).`
      : `Directional estimate (no valuation method ran) is ${aud(consensus.midAud)} pre-money (range ${aud(consensus.lowAud)}–${aud(consensus.highAud)}, confidence ${Math.round(consensus.confidence * 100)} %).`,
    shown.length ? revenueLine : null,
    !preRevenue && shown.length ? "Revenue-based methods share ARR and sector assumptions; they are not independent valuation confirmations. The adjusted multiple is not a discounted cash-flow model; the tax adjustment is a heuristic, not measured investment risk." : null,
    growthLine,
    `Sector multiples ${sectorMultiples.low}× / ${sectorMultiples.median}× / ${sectorMultiples.high}× ARR — ${sectorMultiples.sourceLabel} (${sectorMultiples.sourceDate}); US multiples are discounted 20–40 % for the AU market.`,
    `Scenarios: bear ${aud(scenarios.bear)} · base ${aud(scenarios.base)} · bull ${aud(scenarios.bull)}.`,
    crossCheckLine,
    bucket && !mayShowPercentile(bucket.n) ? `Round benchmark withheld: ${benchmarkLabel(bucket.n)}.` : null,
    bucket && !mayShowPercentile(bucket.n_valuation) ? `Post-money benchmark withheld: ${benchmarkLabel(bucket.n_valuation)}.` : null,
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
    inputs,
    derivation,
    crossChecks,
    consistencyNotes: [],
    sectorMultiples,
    comparables,
    unitEconomics: vc.unitEconomics,
    scenarios,
    visuals: [rangeBars, scatter],
    narrative,
    audit: { grounded: (input.revenueEvidenceIds?.length ?? 0) > 0 || preRevenue, uncited: 0, revised: false, auditor: "llm-auditor", at },
  };
}
