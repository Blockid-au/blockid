// src/lib/agents/cfo-projection-norms.ts
//
// CFO domain helper — Financial Projection Norms Calculator (T0033).
//
// Pure-logic library that turns a founder's current numbers into stage-aware
// projection norms: monthly revenue growth, churn, gross margin, Rule of 40,
// NRR, CAC payback months, LTV/CAC ratio. Each metric is scored against AU
// startup benchmarks (src/lib/benchmarks.ts → BENCHMARKS) and tagged with a
// verdict and a short coaching note so founders know exactly what "good" looks
// like for their stage.
//
// Designed to be importable from /tools/financial-projections (T0086) and from
// the CFO report pipeline without any UI or network dependency.

import { BENCHMARKS, type StageBenchmarks } from "../benchmarks";

export type Stage = "pre-seed" | "seed" | "series-a" | "series-b";

export type Verdict = "strong" | "healthy" | "watch" | "weak";

export interface ProjectionInput {
  stage: Stage;
  /** Monthly recurring revenue in AUD (use 0 for pre-revenue). */
  mrrAud: number;
  /** Self-reported month-over-month revenue growth %. */
  monthlyGrowthRatePct: number;
  /** Self-reported monthly customer/logo churn %. */
  monthlyChurnPct: number;
  /** Gross margin %. */
  grossMarginPct: number;
  /** Net revenue retention % (expansion - contraction - churn). */
  nrrPct?: number;
  /** Fully loaded blended CAC in AUD. */
  cacAud?: number;
  /** Average revenue per user per month, AUD. */
  arpuAud?: number;
  /** Operating margin % (positive for profitable). */
  operatingMarginPct?: number;
}

export interface NormScore {
  metric: string;
  label: string;
  unit: "pct" | "ratio" | "months" | "aud";
  value: number;
  /** Stage median for the same metric. */
  targetP50: number;
  /** Top-quartile (p75) value — what "strong" looks like at this stage. */
  targetP75: number;
  /** 0-100 score relative to the AU stage band. */
  score: number;
  verdict: Verdict;
  coachingNote: string;
}

export interface ProjectionNorms {
  stage: Stage;
  arrAud: number;
  scores: NormScore[];
  /** Weighted 0-100 health score across all available metrics. */
  overall: number;
  overallVerdict: Verdict;
  summary: string;
  sources: string[];
}

const SOURCES = [
  "AVCAL / Cut Through Venture — Australian Venture Capital Report 2025",
  "SaaS Capital — Spending Benchmarks for Private B2B SaaS 2024",
  "Bessemer Venture Partners — State of the Cloud 2024",
  "OpenView — SaaS Benchmarks 2024",
];

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

/**
 * Score a value against a "higher is better" percentile band (p25/p50/p75).
 * Mirrors getPercentile() in benchmarks.ts but inlined so this module stays
 * decoupled from the dashboard's metric-name conventions.
 */
function scoreHigherBetter(value: number, p25: number, p50: number, p75: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0 && p25 <= 0) return 0;
  if (value <= p25) {
    if (p25 === 0) return 0;
    return clamp(Math.round((value / p25) * 25), 0, 25);
  }
  if (value <= p50) {
    const range = p50 - p25;
    if (range === 0) return 37;
    return Math.round(25 + ((value - p25) / range) * 25);
  }
  if (value <= p75) {
    const range = p75 - p50;
    if (range === 0) return 62;
    return Math.round(50 + ((value - p50) / range) * 25);
  }
  const extra = p75 - p50;
  if (extra === 0) return 100;
  const overshoot = (value - p75) / extra;
  return clamp(Math.round(75 + overshoot * 25), 0, 100);
}

/**
 * Score a value against a "lower is better" band (churn, CAC, payback).
 * Bands are passed in the natural "higher is better at p75" orientation that
 * benchmarks.ts uses — here we invert internally so a lower input scores higher.
 */
function scoreLowerBetter(value: number, p25Worst: number, p50: number, p75Best: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= p75Best) return 100;
  if (value <= p50) {
    const range = p50 - p75Best;
    if (range === 0) return 75;
    return clamp(Math.round(100 - ((value - p75Best) / range) * 25), 50, 100);
  }
  if (value <= p25Worst) {
    const range = p25Worst - p50;
    if (range === 0) return 50;
    return clamp(Math.round(75 - ((value - p50) / range) * 25), 25, 75);
  }
  // Worse than p25 — degrade linearly until 2x worst, floor at 0.
  const overshoot = (value - p25Worst) / Math.max(p25Worst, 1);
  return clamp(Math.round(25 - overshoot * 25), 0, 25);
}

function verdictFromScore(score: number): Verdict {
  if (score >= 75) return "strong";
  if (score >= 50) return "healthy";
  if (score >= 25) return "watch";
  return "weak";
}

function pickStage(input: ProjectionInput): { stage: Stage; bm: StageBenchmarks } {
  const bm = BENCHMARKS[input.stage];
  if (bm) return { stage: input.stage, bm };
  // Fallback: never throw — choose the closest band by MRR.
  if (input.mrrAud >= 200000) return { stage: "series-b", bm: BENCHMARKS["series-b"] };
  if (input.mrrAud >= 30000) return { stage: "series-a", bm: BENCHMARKS["series-a"] };
  if (input.mrrAud >= 2000) return { stage: "seed", bm: BENCHMARKS.seed };
  return { stage: "pre-seed", bm: BENCHMARKS["pre-seed"] };
}

/** Stage-appropriate gross margin targets (% revenue). */
const GROSS_MARGIN_BAND: Record<Stage, { p25: number; p50: number; p75: number }> = {
  "pre-seed": { p25: 40, p50: 60, p75: 75 },
  seed: { p25: 50, p50: 70, p75: 80 },
  "series-a": { p25: 60, p50: 75, p75: 85 },
  "series-b": { p25: 65, p50: 78, p75: 88 },
};

/** Rule of 40 target by stage (growth% + operating margin%). Higher is better. */
const RULE_OF_40_BAND: Record<Stage, { p25: number; p50: number; p75: number }> = {
  "pre-seed": { p25: 20, p50: 40, p75: 70 },
  seed: { p25: 25, p50: 40, p75: 60 },
  "series-a": { p25: 30, p50: 40, p75: 55 },
  "series-b": { p25: 30, p50: 40, p75: 50 },
};

/** CAC payback months (lower is better) — used when CAC + ARPU + gross margin available. */
const CAC_PAYBACK_BAND: Record<Stage, { worst: number; mid: number; best: number }> = {
  "pre-seed": { worst: 24, mid: 18, best: 12 },
  seed: { worst: 20, mid: 15, best: 10 },
  "series-a": { worst: 18, mid: 12, best: 8 },
  "series-b": { worst: 15, mid: 10, best: 6 },
};

function noteFor(metric: string, verdict: Verdict, stage: Stage): string {
  const stageLabel = stage.replace("-", " ");
  const notes: Record<string, Record<Verdict, string>> = {
    monthlyGrowth: {
      strong: `Top-quartile growth for ${stageLabel}. Sustain by protecting retention and onboarding velocity.`,
      healthy: `On the AU median for ${stageLabel} — keep weekly cohort reviews to lift toward p75.`,
      watch: `Below median for ${stageLabel}. Investigate funnel drop-off and activation rate.`,
      weak: `Materially below benchmark. Re-test ICP and pricing before adding paid acquisition.`,
    },
    churn: {
      strong: `Best-in-class retention for ${stageLabel}. Strong signal to investors that you can compound revenue.`,
      healthy: `Acceptable churn for ${stageLabel}. Run a quarterly cancellation interview to tighten further.`,
      watch: `Churn is dragging growth. Identify the top 3 churn reasons before scaling acquisition spend.`,
      weak: `Churn this high will cap growth no matter how much you raise. Prioritise retention fixes now.`,
    },
    grossMargin: {
      strong: `Software-grade margins. Confirms unit economics are intact for scaling.`,
      healthy: `Healthy gross margin for ${stageLabel}. Hosting and support cost reviews can push toward p75.`,
      watch: `Margin is thin for ${stageLabel}. Audit COGS — hosting, fulfilment, support, third-party APIs.`,
      weak: `Margin too low for a software valuation. Renegotiate vendor costs or reprice plans.`,
    },
    ruleOf40: {
      strong: `Rule of 40 in the top quartile — the metric most cited by VCs for sustainability.`,
      healthy: `Rule of 40 at AU median. Either grow faster or improve margin to break into p75.`,
      watch: `Below Rule of 40 threshold. Cut discretionary spend or accelerate revenue growth.`,
      weak: `Failing Rule of 40. Expect investor pushback — model a 2-quarter path back above 40.`,
    },
    nrr: {
      strong: `Best-in-class net revenue retention — your existing base is a growth engine on its own.`,
      healthy: `On-target NRR for ${stageLabel}. Layer in modest expansion pricing to lift toward p75.`,
      watch: `NRR is under 100 — contraction is offsetting expansion. Investigate downgrade triggers.`,
      weak: `NRR low enough to alarm investors. Likely indicates pricing/packaging misalignment.`,
    },
    cacPayback: {
      strong: `CAC payback inside best-practice window. Pour fuel on this channel — efficiency is proven.`,
      healthy: `Healthy payback for ${stageLabel}. Track by channel to spot which to scale and which to cut.`,
      watch: `Payback is stretched. Tighten lead qualification and revisit free-trial conversion.`,
      weak: `Payback too long to scale spend safely. Pause paid channels until economics improve.`,
    },
    ltvCac: {
      strong: `LTV/CAC > 3x — the classic green light to scale acquisition spend.`,
      healthy: `LTV/CAC in the healthy band. Improving retention has higher leverage than cutting CAC.`,
      watch: `LTV/CAC below 3x. Acquisition is breaking even — not yet a profitable growth engine.`,
      weak: `LTV/CAC below 1x. Every customer is unprofitable; rebuild pricing or channel mix.`,
    },
  };
  return notes[metric]?.[verdict] ?? `Track ${metric} weekly against your ${stageLabel} cohort.`;
}

export function computeProjectionNorms(input: ProjectionInput): ProjectionNorms {
  const { stage, bm } = pickStage(input);
  const arrAud = Math.max(0, input.mrrAud * 12);
  const scores: NormScore[] = [];

  // Monthly revenue growth — higher is better.
  {
    const v = input.monthlyGrowthRatePct;
    const score = scoreHigherBetter(v, bm.revenue_growth_pct.p25, bm.revenue_growth_pct.p50, bm.revenue_growth_pct.p75);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "monthlyGrowth",
      label: "Monthly revenue growth",
      unit: "pct",
      value: round1(v),
      targetP50: bm.revenue_growth_pct.p50,
      targetP75: bm.revenue_growth_pct.p75,
      score,
      verdict,
      coachingNote: noteFor("monthlyGrowth", verdict, stage),
    });
  }

  // Monthly churn — lower is better. benchmarks.ts stores band inverted (p25=worst).
  {
    const v = input.monthlyChurnPct;
    const score = scoreLowerBetter(v, bm.monthly_churn_pct.p25, bm.monthly_churn_pct.p50, bm.monthly_churn_pct.p75);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "churn",
      label: "Monthly churn",
      unit: "pct",
      value: round1(v),
      targetP50: bm.monthly_churn_pct.p50,
      targetP75: bm.monthly_churn_pct.p75,
      score,
      verdict,
      coachingNote: noteFor("churn", verdict, stage),
    });
  }

  // Gross margin — stage-aware band, higher is better.
  {
    const band = GROSS_MARGIN_BAND[stage];
    const v = input.grossMarginPct;
    const score = scoreHigherBetter(v, band.p25, band.p50, band.p75);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "grossMargin",
      label: "Gross margin",
      unit: "pct",
      value: round1(v),
      targetP50: band.p50,
      targetP75: band.p75,
      score,
      verdict,
      coachingNote: noteFor("grossMargin", verdict, stage),
    });
  }

  // Rule of 40 — annualised growth + operating margin.
  {
    const annualisedGrowth = (Math.pow(1 + input.monthlyGrowthRatePct / 100, 12) - 1) * 100;
    const operatingMargin = input.operatingMarginPct ?? -50; // assume burning at -50% if unknown
    const rule = annualisedGrowth + operatingMargin;
    const band = RULE_OF_40_BAND[stage];
    const score = scoreHigherBetter(rule, band.p25, band.p50, band.p75);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "ruleOf40",
      label: "Rule of 40 (growth + margin)",
      unit: "pct",
      value: round1(rule),
      targetP50: band.p50,
      targetP75: band.p75,
      score,
      verdict,
      coachingNote: noteFor("ruleOf40", verdict, stage),
    });
  }

  // NRR — higher is better; only score if provided.
  if (typeof input.nrrPct === "number") {
    const v = input.nrrPct;
    const score = scoreHigherBetter(v, bm.nrr_pct.p25, bm.nrr_pct.p50, bm.nrr_pct.p75);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "nrr",
      label: "Net revenue retention",
      unit: "pct",
      value: round1(v),
      targetP50: bm.nrr_pct.p50,
      targetP75: bm.nrr_pct.p75,
      score,
      verdict,
      coachingNote: noteFor("nrr", verdict, stage),
    });
  }

  // CAC payback (months) — requires ARPU + CAC + gross margin > 0.
  if (input.cacAud && input.arpuAud && input.arpuAud > 0 && input.grossMarginPct > 0) {
    const grossProfitPerMonth = input.arpuAud * (input.grossMarginPct / 100);
    const payback = grossProfitPerMonth > 0 ? input.cacAud / grossProfitPerMonth : Number.POSITIVE_INFINITY;
    const band = CAC_PAYBACK_BAND[stage];
    const score = scoreLowerBetter(payback, band.worst, band.mid, band.best);
    const verdict = verdictFromScore(score);
    scores.push({
      metric: "cacPayback",
      label: "CAC payback",
      unit: "months",
      value: Number.isFinite(payback) ? round1(payback) : 99,
      targetP50: band.mid,
      targetP75: band.best,
      score,
      verdict,
      coachingNote: noteFor("cacPayback", verdict, stage),
    });

    // LTV/CAC — only computable if churn > 0.
    if (input.monthlyChurnPct > 0) {
      const ltv = grossProfitPerMonth / (input.monthlyChurnPct / 100);
      const ratio = ltv / input.cacAud;
      // LTV/CAC band: 1x worst, 3x mid, 5x best (industry-standard).
      const score2 = scoreHigherBetter(ratio, 1, 3, 5);
      const verdict2 = verdictFromScore(score2);
      scores.push({
        metric: "ltvCac",
        label: "LTV / CAC ratio",
        unit: "ratio",
        value: round1(ratio),
        targetP50: 3,
        targetP75: 5,
        score: score2,
        verdict: verdict2,
        coachingNote: noteFor("ltvCac", verdict2, stage),
      });
    }
  }

  const overall = scores.length
    ? Math.round(scores.reduce((s, n) => s + n.score, 0) / scores.length)
    : 0;
  const overallVerdict = verdictFromScore(overall);

  const weakest = scores.slice().sort((a, b) => a.score - b.score)[0];
  const strongest = scores.slice().sort((a, b) => b.score - a.score)[0];
  const summary = weakest && strongest
    ? `Overall ${overallVerdict} for ${stage.replace("-", " ")}. Strongest: ${strongest.label} (${strongest.score}/100). Focus next on ${weakest.label} (${weakest.score}/100).`
    : `Insufficient data to score — provide MRR, growth, churn, and gross margin.`;

  return {
    stage,
    arrAud,
    scores,
    overall,
    overallVerdict,
    summary,
    sources: SOURCES,
  };
}
