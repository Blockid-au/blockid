// P12d-redomicile-wizard — form-state helpers for the /dashboard/exit-readiness
// wizard that runs a founder-supplied scenario through assessRedomicile.
//
// The pure lib lives at web/src/lib/exits/redomicile-decision-check.ts and
// takes numeric/boolean input. This module owns the string-shaped UI state so
// <input> values round-trip cleanly.

import type {
  RedomicileInput,
  RedomicileRecommendation,
} from "@/lib/exits/redomicile-decision-check";

export interface RedomicileWizardFormState {
  has_delaware_acquirer_signal: boolean;
  plans_us_listing: boolean;
  wants_dual_class_founder_control: boolean;
  us_resident_cap_table_pct: string;
  annual_burn_aud: string;
  is_pre_series_a: boolean;
  has_scrip_only_offer: boolean;
  ip_already_in_delaware: boolean;
}

/**
 * Default state = "conservative AU founder, no triggers" so the wizard opens
 * on the honest baseline ("hold") rather than pre-selling redomicile.
 */
export function makeEmptyRedomicileWizardFormState(): RedomicileWizardFormState {
  return {
    has_delaware_acquirer_signal: false,
    plans_us_listing: false,
    wants_dual_class_founder_control: false,
    us_resident_cap_table_pct: "",
    annual_burn_aud: "",
    is_pre_series_a: false,
    has_scrip_only_offer: false,
    ip_already_in_delaware: false,
  };
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function toRedomicileInput(
  state: RedomicileWizardFormState,
): RedomicileInput {
  return {
    has_delaware_acquirer_signal: state.has_delaware_acquirer_signal,
    plans_us_listing: state.plans_us_listing,
    wants_dual_class_founder_control: state.wants_dual_class_founder_control,
    us_resident_cap_table_pct: optionalNumber(state.us_resident_cap_table_pct),
    annual_burn_aud: optionalNumber(state.annual_burn_aud),
    is_pre_series_a: state.is_pre_series_a,
    has_scrip_only_offer: state.has_scrip_only_offer,
    ip_already_in_delaware: state.ip_already_in_delaware,
  };
}

export type RedomicileBand = "green" | "amber" | "red" | "grey";

/**
 * Band mapping. "hold" is the default answer and reads best as neutral green
 * (nothing to do). "proceed" is amber (this is a project) — deliberately NOT
 * green even when triggered because the honest founder-facing answer is "make
 * sure you've engaged a lawyer first". "reconsider" is the red — you have
 * triggers but not the runway. "prepare" is amber (worth a call). If the
 * founder has typed nothing at all yet, band = grey to invite input.
 */
export function pickRedomicileBand(
  recommendation: RedomicileRecommendation,
  state: RedomicileWizardFormState,
): RedomicileBand {
  const hasAnyInput =
    state.has_delaware_acquirer_signal ||
    state.plans_us_listing ||
    state.wants_dual_class_founder_control ||
    state.is_pre_series_a ||
    state.has_scrip_only_offer ||
    state.ip_already_in_delaware ||
    optionalNumber(state.us_resident_cap_table_pct) !== null ||
    optionalNumber(state.annual_burn_aud) !== null;
  if (!hasAnyInput) return "grey";
  if (recommendation === "reconsider") return "red";
  if (recommendation === "proceed" || recommendation === "prepare") return "amber";
  return "green";
}

export const REDOMICILE_HEADLINE: Record<RedomicileRecommendation, string> = {
  hold: "Redomicile is not the right project for you today",
  prepare: "Book a preliminary call before you spend the legal budget",
  proceed: "Triggers + runway both present — a scheme is defensible",
  reconsider: "Triggers present but the runway can't fund the scheme yet",
};

export const REDOMICILE_MECHANISM_LABEL: Record<
  "scheme_of_arrangement_s411" | "takeover_bid" | "direct_asset_transfer",
  string
> = {
  scheme_of_arrangement_s411:
    "Scheme of Arrangement (Corps Act 2001 (Cth) Part 5.1 s411)",
  takeover_bid: "Takeover-bid restructure (Corps Act 2001 (Cth) s657A / s658A)",
  direct_asset_transfer:
    "Direct asset transfer + winding-up (rarely correct for an operating co)",
};
