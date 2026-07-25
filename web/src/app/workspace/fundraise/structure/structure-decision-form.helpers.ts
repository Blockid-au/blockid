// Pure helpers for the P10-structure-decision-ui founder quiz.
//
// Kept isolated from the React client so form state coercion + banner-band
// selection can be unit-tested without a DOM. Mirrors the sibling s708
// counter form (s708-counter-form.helpers.ts) so every workspace compliance
// form carries the same round-trip contract.
//
// Wire shape (StructureDecisionInput / StructureDecision) is owned by
// web/src/lib/fundraise/structure-decision.ts. This module carries UI state
// as strings for numeric fields and coerces on submit.

import type {
  StructureDecisionInput,
  StructureRecommendation,
} from "@/lib/fundraise/structure-decision";

export interface StructureDecisionFormState {
  wants_us_listing: boolean;
  wants_asx_listing: boolean;
  wants_founder_control_after_dilution: boolean;
  expects_2plus_venture_rounds: boolean;
  has_us_offshore_parent_appetite: boolean;
  has_specialist_counsel_engaged: boolean;
  annual_revenue_aud: string;
}

export function makeEmptyStructureDecisionFormState(): StructureDecisionFormState {
  return {
    wants_us_listing: false,
    wants_asx_listing: false,
    wants_founder_control_after_dilution: false,
    expects_2plus_venture_rounds: false,
    has_us_offshore_parent_appetite: false,
    has_specialist_counsel_engaged: false,
    annual_revenue_aud: "",
  };
}

export function toStructureDecisionInput(
  state: StructureDecisionFormState,
): StructureDecisionInput {
  const raw = state.annual_revenue_aud.trim();
  let revenue: number | null = null;
  if (raw !== "") {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) revenue = parsed;
  }
  return {
    wants_us_listing: state.wants_us_listing,
    wants_asx_listing: state.wants_asx_listing,
    wants_founder_control_after_dilution:
      state.wants_founder_control_after_dilution,
    expects_2plus_venture_rounds: state.expects_2plus_venture_rounds,
    has_us_offshore_parent_appetite: state.has_us_offshore_parent_appetite,
    has_specialist_counsel_engaged: state.has_specialist_counsel_engaged,
    annual_revenue_aud: revenue,
  };
}

export type StructureBand = "slate" | "emerald" | "amber" | "red";

/**
 * Banner band keyed on recommendation + blocked-paths.
 *
 *   slate   — insufficient_signal (no answers yet)
 *   emerald — single_class_default (the honest AU default)
 *   amber   — single_class_with_founder_protections (nuance needed)
 *   amber   — consider_dual_class_offshore (proceed with counsel)
 *   red     — any recommendation carrying a blocked_path (ASX rule 6.9 clash
 *             or direct-Delaware-without-counsel)
 */
export function pickStructureBand(
  recommendation: StructureRecommendation,
  blockedCount: number,
): StructureBand {
  if (blockedCount > 0) return "red";
  switch (recommendation) {
    case "insufficient_signal":
      return "slate";
    case "single_class_default":
      return "emerald";
    case "single_class_with_founder_protections":
    case "consider_dual_class_offshore":
      return "amber";
    default:
      return "slate";
  }
}

export const STRUCTURE_HEADLINE: Record<StructureRecommendation, string> = {
  insufficient_signal: "Answer at least one question to see a recommendation",
  single_class_default: "Single-class default — the standard AU pattern",
  single_class_with_founder_protections:
    "Single-class + founder-protections — most control benefit, least structural cost",
  consider_dual_class_offshore:
    "Consider dual-class via an offshore parent — proceed only with cross-border counsel",
};
