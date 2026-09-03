// Valuation method selector for the Business SVI done-state.
// Picks the most appropriate methodology based on stage + traction signals,
// matching how AU/NZ angels and early-stage VCs actually value startups.
//
// Precedence (highest to lowest):
//   1. DCF      — Series A+ with verified revenue & growth rate
//   2. Comparable — seed/Series A with measurable ARR or GMV
//   3. Scorecard — pre-seed/angel, team + market signals present
//   4. Berkus   — pre-revenue idea/pre-seed (5 value drivers)

import { type Stage } from "./three-case-valuation";

export type ValuationMethod = "berkus" | "scorecard" | "comparable" | "dcf";

export interface MethodMeta {
  method: ValuationMethod;
  label: string;
  shortLabel: string;
  description: string;
  auBenchmark: string;
  limitations: string;
}

export const METHOD_META: Record<ValuationMethod, MethodMeta> = {
  berkus: {
    method: "berkus",
    label: "Berkus Method",
    shortLabel: "Berkus",
    description:
      "Pre-revenue valuation across 5 risk drivers: sound idea, prototype, quality management, " +
      "strategic relationships, product rollout / sales. Each driver adds up to A$500k " +
      "(AU-adjusted from the original US$500k).",
    auBenchmark: "AU idea-stage cap: ~A$2M–2.5M pre-money per PitchBook AU 2025.",
    limitations:
      "Max valuation is capped (~A$2.5M) and ignores market size — use as a floor check, " +
      "not a ceiling.",
  },
  scorecard: {
    method: "scorecard",
    label: "Scorecard Method",
    shortLabel: "Scorecard",
    description:
      "Adjusts a comparable pre-money median by weighted factors: team (30%), market " +
      "opportunity (25%), product (15%), competitive environment (10%), marketing/sales " +
      "channels (10%), need for additional funding (5%), other (5%).",
    auBenchmark:
      "AU pre-seed median ~A$3M–4M pre-money (AFR 2026 angel cohort). " +
      "Seed median ~A$6M–8M.",
    limitations:
      "Highly sensitive to the comparable median chosen — your cohort selection matters.",
  },
  comparable: {
    method: "comparable",
    label: "Comparable Transactions",
    shortLabel: "Comparables",
    description:
      "Values using revenue multiples from comparable AU/NZ transactions. " +
      "SaaS: 5-8× ARR at seed, 8-12× at Series A. Marketplace: 3-5× GMV. " +
      "Adjusted for sector, growth rate, and gross margin.",
    auBenchmark:
      "AU SaaS seed median: 6× ARR (PitchBook AU H1 2026). " +
      "Fintech seed: 5× ARR. AI/ML: 9× ARR.",
    limitations:
      "Requires verified revenue figures — directional without audited numbers.",
  },
  dcf: {
    method: "dcf",
    label: "Discounted Cash Flow",
    shortLabel: "DCF",
    description:
      "Projects free cash flows 5 years out, discounts at a venture-adjusted WACC " +
      "(typically 30-50% for early-stage AU startups), plus a terminal value using " +
      "a conservative exit multiple.",
    auBenchmark:
      "AU Series A discount rate: 35-45%. Series B: 25-35% (KPMG AU VC Survey 2026).",
    limitations:
      "Sensitive to growth assumptions — treat as a sanity check alongside comparables.",
  },
};

export interface MethodSelection {
  primary: ValuationMethod;
  secondary: ValuationMethod | null;
  rationale: string;
  meta: MethodMeta;
}

export interface TractionSignals {
  /** ARR or monthly revenue in AUD; null if pre-revenue */
  hasRevenue: boolean;
  /** Whether a verifiable MoM growth rate was supplied */
  hasGrowthRate: boolean;
  /** Whether paying-customer count was mentioned */
  hasCustomers: boolean;
}

/**
 * Select the primary valuation method for this startup given stage + traction.
 * Pure function — safe to call during SSE streaming.
 */
export function selectValuationMethod(
  stage: Stage,
  svi: number,
  traction: TractionSignals,
): MethodSelection {
  const { hasRevenue, hasGrowthRate, hasCustomers } = traction;

  // DCF: Series A+ and enough evidence to model cash flows
  if (
    (stage === "series_a" || stage === "series_b" || stage === "growth") &&
    hasRevenue &&
    hasGrowthRate
  ) {
    return {
      primary: "dcf",
      secondary: "comparable",
      rationale:
        "Series A+ with verified revenue and growth rate — DCF with comparable cross-check.",
      meta: METHOD_META.dcf,
    };
  }

  // Comparable: seed/Series A with measurable revenue
  if (
    (stage === "seed" || stage === "series_a") &&
    hasRevenue &&
    hasCustomers
  ) {
    return {
      primary: "comparable",
      secondary: "scorecard",
      rationale:
        "Seed/Series A with paying customers — revenue multiples from AU comparables.",
      meta: METHOD_META.comparable,
    };
  }

  // Scorecard: pre-seed/seed with team + market signals (even without revenue)
  if (
    (stage === "pre_seed" || stage === "seed") &&
    svi >= 35
  ) {
    return {
      primary: "scorecard",
      secondary: hasRevenue ? "comparable" : "berkus",
      rationale:
        "Pre-seed/seed with team and market signals — scorecard vs AU angel median.",
      meta: METHOD_META.scorecard,
    };
  }

  // Berkus: idea/pre-seed or very low SVI (pre-revenue, pre-traction)
  return {
    primary: "berkus",
    secondary: "scorecard",
    rationale:
      "Pre-revenue stage — Berkus 5-driver risk-adjusted ceiling.",
    meta: METHOD_META.berkus,
  };
}

/**
 * Infer traction signals from the raw TRE dimension score.
 * Used when the caller doesn't have structured traction data — converts
 * the AI-assigned TRE score into a best-guess traction signal set.
 */
export function inferTractionFromTreScore(treScore: number | null): TractionSignals {
  if (treScore === null) {
    return { hasRevenue: false, hasGrowthRate: false, hasCustomers: false };
  }
  return {
    hasRevenue: treScore >= 40,
    hasCustomers: treScore >= 35,
    hasGrowthRate: treScore >= 55,
  };
}
