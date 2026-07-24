// P11-acquisition-wizard-ui — form-state helpers for the /dashboard/exit-readiness
// wizard that runs a founder-supplied deal shape through assessAcquisitionPattern.
//
// The pure assessment lib lives at web/src/lib/exits/acquisition-pattern-check.ts
// and takes numeric/boolean input. This module owns the string-shaped UI state so
// <input> values round-trip cleanly, plus the coercer that snaps blank fields to
// the "null / unspecified" branches the checker distinguishes from zero.

import type {
  AcquisitionInput,
  AcquisitionSignal,
} from "@/lib/exits/acquisition-pattern-check";

/** Every numeric field is a string so <input type="number"> can hold "" cleanly. */
export interface AcquisitionWizardFormState {
  headline_value_aud: string;
  cash_pct: string;
  rsu_pct: string;
  earnout_pct: string;
  escrow_pct: string;
  escrow_months: string;
  rsu_cliff_months: string;
  rsu_vest_months: string;
  target_industry_keywords: string;
  buyer_is_foreign_govt_influenced: boolean;
  buyer_is_listed: boolean;
  change_of_control_consents_pct: string;
}

/**
 * Default state seeds the wizard with the textbook Atlassian ~90/10 template so
 * a founder sees a green baseline and can nudge fields off it to see what
 * flips amber / red. Values chosen to match the P11-acquisition-pattern
 * Chapter 11 body copy.
 */
export function makeEmptyAcquisitionWizardFormState(): AcquisitionWizardFormState {
  return {
    headline_value_aud: "",
    cash_pct: "90",
    rsu_pct: "10",
    earnout_pct: "",
    escrow_pct: "12",
    escrow_months: "15",
    rsu_cliff_months: "12",
    rsu_vest_months: "30",
    target_industry_keywords: "",
    buyer_is_foreign_govt_influenced: false,
    buyer_is_listed: false,
    change_of_control_consents_pct: "",
  };
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function requiredNumber(raw: string): number {
  const n = optionalNumber(raw);
  return n ?? 0;
}

export function parseKeywords(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Convert form state → AcquisitionInput. Blank optional fields collapse to
 * `null` (not 0) so the checker's "unspecified" branches fire correctly —
 * a founder who didn't fill in escrow_pct should not see a warning about
 * escrow structure being out of range.
 */
export function toAcquisitionInput(state: AcquisitionWizardFormState): AcquisitionInput {
  return {
    headline_value_aud: requiredNumber(state.headline_value_aud),
    cash_pct: optionalNumber(state.cash_pct),
    rsu_pct: optionalNumber(state.rsu_pct),
    earnout_pct: optionalNumber(state.earnout_pct),
    escrow_pct: optionalNumber(state.escrow_pct),
    escrow_months: optionalNumber(state.escrow_months),
    rsu_cliff_months: optionalNumber(state.rsu_cliff_months),
    rsu_vest_months: optionalNumber(state.rsu_vest_months),
    target_industry_keywords: parseKeywords(state.target_industry_keywords),
    buyer_is_foreign_govt_influenced: state.buyer_is_foreign_govt_influenced,
    buyer_is_listed: state.buyer_is_listed,
    change_of_control_consents_pct: optionalNumber(state.change_of_control_consents_pct),
  };
}

export type AcquisitionBand = "green" | "amber" | "red";

/** Traffic-light band mirrors AcquisitionSignal 1:1 so the tile colour matches
 * the pure checker's classification without a second layer of thresholds. */
export function pickAcquisitionBand(signal: AcquisitionSignal): AcquisitionBand {
  return signal;
}

/** Headline copy per signal — kept alongside the state helpers so the wizard
 * and any future test/snapshot pull from the same source of truth. */
export const ACQUISITION_HEADLINE: Record<AcquisitionSignal, string> = {
  green: "On the Atlassian ~90/10 template",
  amber: "Drifting from the Atlassian template",
  red: "Deal shape has a red flag",
};
