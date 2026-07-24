// Pure helpers for the ESIC Self-Assessment workspace form (P1e).
//
// Kept isolated from the React client so the form → API mapping and the
// result → UI banding can be unit-tested without a DOM.
//
// The wire shape (ESICInput / ESICResult) is owned by
// web/src/lib/compliance/esic-eligibility.ts. This module only carries UI
// state (all strings so <input> values are trivial), converts it to a
// numerically-clean ESICInput, and picks the traffic-light band for the
// result banner.

import type {
  ESICInput,
  ESICResult,
} from "@/lib/compliance/esic-eligibility";

/** Form state — every field is a string so <input> can round-trip. */
export interface EsicFormState {
  company_incorporated_year: string;
  company_incorporated_month: string;
  turnover_prior_year_aud: string;
  total_expenses_prior_year_aud: string;
  is_listed: boolean;
  has_r_and_d_expenditure: boolean;
  // 100-point limb
  points_australian_patent: boolean;
  points_innovation_patent: boolean;
  points_plant_breeder_rights: boolean;
  points_trademarks: boolean;
  points_accelerator_alumni: boolean;
  points_third_party_capital_raised_aud: string;
  points_r_and_d_expenditure_pct: string;
  points_licensed_technology_from_university: boolean;
  // Principles limb
  principles_new_or_improved: boolean;
  principles_high_growth: boolean;
  principles_scalable: boolean;
  principles_competitive_advantage: boolean;
  principles_broader_market: boolean;
}

export function makeEmptyFormState(): EsicFormState {
  const nowY = new Date().getUTCFullYear();
  return {
    company_incorporated_year: String(nowY),
    company_incorporated_month: "1",
    turnover_prior_year_aud: "0",
    total_expenses_prior_year_aud: "0",
    is_listed: false,
    has_r_and_d_expenditure: false,
    points_australian_patent: false,
    points_innovation_patent: false,
    points_plant_breeder_rights: false,
    points_trademarks: false,
    points_accelerator_alumni: false,
    points_third_party_capital_raised_aud: "0",
    points_r_and_d_expenditure_pct: "0",
    points_licensed_technology_from_university: false,
    principles_new_or_improved: false,
    principles_high_growth: false,
    principles_scalable: false,
    principles_competitive_advantage: false,
    principles_broader_market: false,
  };
}

function num(s: string, fallback = 0): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Convert form state → the ESICInput shape POSTed to /api/compliance/esic. */
export function toEsicInput(state: EsicFormState): ESICInput {
  return {
    company_incorporated_year: num(state.company_incorporated_year, new Date().getUTCFullYear()),
    company_incorporated_month: num(state.company_incorporated_month, 1),
    turnover_prior_year_aud: num(state.turnover_prior_year_aud),
    total_expenses_prior_year_aud: num(state.total_expenses_prior_year_aud),
    is_listed: state.is_listed,
    has_r_and_d_expenditure: state.has_r_and_d_expenditure,
    points_100_test: {
      australian_patent: state.points_australian_patent,
      innovation_patent: state.points_innovation_patent,
      plant_breeder_rights: state.points_plant_breeder_rights,
      trademarks: state.points_trademarks,
      accelerator_alumni: state.points_accelerator_alumni,
      third_party_capital_raised_aud: num(state.points_third_party_capital_raised_aud),
      r_and_d_expenditure_pct: num(state.points_r_and_d_expenditure_pct),
      licensed_technology_from_university: state.points_licensed_technology_from_university,
    },
    principles_test: {
      is_genuinely_focused_on_developing_new_or_improved: state.principles_new_or_improved,
      high_growth_potential: state.principles_high_growth,
      can_scale_broader_than_local_market: state.principles_scalable,
      has_competitive_advantage: state.principles_competitive_advantage,
      can_demonstrate_broader_than_local_market: state.principles_broader_market,
    },
  };
}

/** Rehydrate the form from a persisted ESICInput (GET /api/compliance/esic). */
export function fromEsicInput(input: ESICInput): EsicFormState {
  const empty = makeEmptyFormState();
  const p = input.points_100_test;
  const pr = input.principles_test;
  return {
    ...empty,
    company_incorporated_year: String(input.company_incorporated_year),
    company_incorporated_month: String(input.company_incorporated_month ?? 1),
    turnover_prior_year_aud: String(input.turnover_prior_year_aud),
    total_expenses_prior_year_aud: String(input.total_expenses_prior_year_aud),
    is_listed: input.is_listed,
    has_r_and_d_expenditure: input.has_r_and_d_expenditure,
    points_australian_patent: p?.australian_patent ?? false,
    points_innovation_patent: p?.innovation_patent ?? false,
    points_plant_breeder_rights: p?.plant_breeder_rights ?? false,
    points_trademarks: p?.trademarks ?? false,
    points_accelerator_alumni: p?.accelerator_alumni ?? false,
    points_third_party_capital_raised_aud: String(p?.third_party_capital_raised_aud ?? 0),
    points_r_and_d_expenditure_pct: String(p?.r_and_d_expenditure_pct ?? 0),
    points_licensed_technology_from_university: p?.licensed_technology_from_university ?? false,
    principles_new_or_improved: pr?.is_genuinely_focused_on_developing_new_or_improved ?? false,
    principles_high_growth: pr?.high_growth_potential ?? false,
    principles_scalable: pr?.can_scale_broader_than_local_market ?? false,
    principles_competitive_advantage: pr?.has_competitive_advantage ?? false,
    principles_broader_market: pr?.can_demonstrate_broader_than_local_market ?? false,
  };
}

export type ResultBand = "green" | "amber" | "red";

/**
 * Traffic-light band for the result banner.
 *   green — is_esic true (both limbs pass)
 *   amber — early-stage passes AND one innovation limb close (points ≥ 75 OR
 *           4-of-5 principles) but overall not eligible
 *   red   — everything else
 */
export function pickResultBand(result: ESICResult): ResultBand {
  if (result.is_esic) return "green";
  const near100 = result.eligible_innovation_100pt >= 75;
  const principlesNear = result.eligible_innovation_principles;
  if (result.eligible_early_stage && (near100 || principlesNear)) return "amber";
  return "red";
}
