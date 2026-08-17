// SVI IRI/SVM boost from Exit Strategy planning.
//
// Awards bonus points on the IRI (Investor Readiness Index) and SVM
// (Startup Valuation Multiplier) dimensions when a founder has done the
// upfront work of modelling their exit — i.e., the roadmap explicitly
// rewards "planned an exit path" as a signal of investor sophistication.
//
// Bonus schedule (all caps enforced):
//   +5 IRI  if ≥ 1 exit scenario exists
//   +3 IRI  if Series A AND Series B are both planned in the primary scenario
//   +2 IRI  if the primary readiness score > 70
//   +3 SVM  if the primary scenario is exported to the investor pack
//
//   MAX +10 IRI, MAX +3 SVM
//
// Pure — no DB reads, no side effects. Callers pass scenarios + the
// current SVI dimension map. Wired into recomputeAndSnapshot() in
// startup-package/svi-recompute.ts (server-only) which is the canonical
// SVI updater.

import type { ExitScenario, ExitReadinessAssessment } from "@/types/exit-strategy";

export const EXIT_STRATEGY_IRI_MAX = 10;
export const EXIT_STRATEGY_SVM_MAX = 3;

export interface ExitStrategyBonusInput {
  scenarios: Array<Pick<ExitScenario, "is_primary" | "series_a_planned" | "series_b_planned" | "use_for_investor_pack">>;
  /** Primary scenario's readiness assessment, if any. */
  primaryReadiness?: Pick<ExitReadinessAssessment, "overall_readiness_score"> | null;
}

export interface ExitStrategyBonusResult {
  iriBonus: number;
  svmBonus: number;
  reasons: string[];
  narrativeLine: string;
}

/**
 * Compute the additive IRI/SVM bonus for a founder with exit scenarios.
 * Zero-safe: returns 0/0 with an empty narrative when no scenarios exist.
 */
export function computeExitStrategyBonusPoints(
  input: ExitStrategyBonusInput,
): ExitStrategyBonusResult {
  const { scenarios, primaryReadiness } = input;
  let iri = 0;
  let svm = 0;
  const reasons: string[] = [];

  if (!scenarios || scenarios.length === 0) {
    return {
      iriBonus: 0,
      svmBonus: 0,
      reasons: [],
      narrativeLine: "",
    };
  }

  // +5 IRI: at least one scenario exists
  iri += 5;
  reasons.push("+5 IRI: exit scenario defined");

  // Find the primary scenario (fallback to first) for the remaining checks
  const primary = scenarios.find((s) => s.is_primary) ?? scenarios[0];

  // +3 IRI: Series A + Series B both planned
  if (primary.series_a_planned && primary.series_b_planned) {
    iri += 3;
    reasons.push("+3 IRI: Series A + B both planned");
  }

  // +2 IRI: readiness > 70
  const readinessScore = primaryReadiness?.overall_readiness_score ?? 0;
  if (readinessScore > 70) {
    iri += 2;
    reasons.push("+2 IRI: exit readiness > 70");
  }

  // +3 SVM: primary scenario exported to investor pack
  if (primary.is_primary && primary.use_for_investor_pack === true) {
    svm += 3;
    reasons.push("+3 SVM: primary scenario in investor pack");
  }

  // Apply caps defensively
  iri = Math.min(iri, EXIT_STRATEGY_IRI_MAX);
  svm = Math.min(svm, EXIT_STRATEGY_SVM_MAX);

  const parts: string[] = [];
  if (iri > 0) parts.push(`+${iri} IRI`);
  if (svm > 0) parts.push(`+${svm} SVM`);
  const narrativeLine =
    parts.length > 0
      ? `Exit planning bonus: ${parts.join(", ")} (scenarios defined)`
      : "";

  return {
    iriBonus: iri,
    svmBonus: svm,
    reasons,
    narrativeLine,
  };
}

/**
 * Apply the bonus to an SVI dimension-score map in place-safe (returns
 * a new map). Caps each dimension at 100. Used by the SVI snapshot
 * updater to inject bonuses before persisting.
 */
export function applyExitStrategyBonusToDimensions(
  dimensions: Record<string, number>,
  bonus: ExitStrategyBonusResult,
): Record<string, number> {
  const out: Record<string, number> = { ...dimensions };
  if (bonus.iriBonus > 0) {
    out.iri = Math.min(100, (out.iri ?? 0) + bonus.iriBonus);
  }
  if (bonus.svmBonus > 0) {
    out.svm = Math.min(100, (out.svm ?? 0) + bonus.svmBonus);
  }
  return out;
}
