// ESIC (Early Stage Innovation Company) eligibility self-check.
//
// Implements Division 360 of the Income Tax Assessment Act 1997 (ITAA97).
// Two-limb test:
//   Limb 1 — Early-stage test (ss 360-40(1)(a)-(e))
//     - Incorporated / registered in Australia within the last 3 income years
//       (or 6 years for R&D-heavy companies that meet the alternative test).
//     - Total prior-year expenses ≤ A$1,000,000.
//     - Total prior-year assessable income ≤ A$200,000 (excluding ARC or
//       AAERC grants).
//     - Not listed on any stock exchange.
//   Limb 2 — Innovation test (ss 360-40(1)(f)-(g))
//     - EITHER the 100-point objective test (s 360-45) — score ≥ 100.
//     - OR the principles-based test — five sub-tests all TRUE.
//
// Refs (retrieved 2026 — url per JSDoc):
//   ATO ESIC overview: https://www.ato.gov.au/business/tax-incentives-for-innovation/in-detail/tax-incentives-for-early-stage-investors/qualifying-as-an-early-stage-innovation-company/
//   100-point test:    https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/incentives-and-concessions/tax-incentives-for-early-stage-investors/qualifying-as-an-early-stage-innovation-company/100-point-innovation-test
//   Principles-based:  https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/incentives-and-concessions/tax-incentives-for-early-stage-investors/qualifying-as-an-early-stage-innovation-company/principles-based-innovation-test
//
// This module is a *self-assessment aid*, not tax advice. Every result
// returned includes the AFSL disclaimer. Founders must confirm with a
// registered tax agent before relying on ESIC status.

export const ESIC_DISCLAIMER =
  "Not tax or legal advice — this is an automated self-assessment aid based on Div 360 ITAA97. Confirm ESIC eligibility with a registered tax agent (AFSL/TPB) before issuing shares or relying on the tax offset.";

export interface ESIC100PointInput {
  /** ≥50 points if the company holds an eligible AU standard patent. */
  australian_patent: boolean;
  /** ≥25 points for an innovation patent / equivalent design right. */
  innovation_patent: boolean;
  /** ≥25 points for an eligible Plant Breeder's Right. */
  plant_breeder_rights: boolean;
  /**
   * Trademarks are NOT eligible under s 360-45(1). Included so the UI can
   * capture them and give the founder feedback rather than silently
   * ignoring the field.
   */
  trademarks: boolean;
  /**
   * 50 points if the company has completed an Australian accelerator
   * programme accredited by AusIndustry (see s 360-45(1)(e)).
   */
  accelerator_alumni: boolean;
  /**
   * 50 points if the company has raised ≥A$50,000 of third-party capital
   * in the current or prior income year (s 360-45(1)(d)).
   */
  third_party_capital_raised_aud?: number;
  /**
   * R&D expenditure as a percentage of prior-year total expenses. Scoring
   * per s 360-45(1)(b): 15-50% → 50 points; >50% → 75 points.
   */
  r_and_d_expenditure_pct?: number;
  /**
   * 25 points for a formal licensing agreement to commercialise a
   * technology developed by an Australian university or PFRA
   * (s 360-45(1)(g)).
   */
  licensed_technology_from_university?: boolean;
}

export interface ESICPrinciplesInput {
  is_genuinely_focused_on_developing_new_or_improved: boolean;
  high_growth_potential: boolean;
  can_scale_broader_than_local_market: boolean;
  has_competitive_advantage: boolean;
  can_demonstrate_broader_than_local_market: boolean;
}

export interface ESICInput {
  company_incorporated_year: number;
  company_incorporated_month?: number;
  turnover_prior_year_aud: number;
  total_expenses_prior_year_aud: number;
  is_listed: boolean;
  has_r_and_d_expenditure: boolean;
  points_100_test?: ESIC100PointInput;
  principles_test?: ESICPrinciplesInput;
}

export interface ESICResult {
  eligible_early_stage: boolean;
  eligible_innovation_100pt: number;
  eligible_innovation_principles: boolean;
  is_esic: boolean;
  gaps: string[];
  recommendations: string[];
  disclaimer: string;
}

const EARLY_STAGE_TURNOVER_CAP_AUD = 200_000;
const EARLY_STAGE_EXPENSES_CAP_AUD = 1_000_000;
const AGE_CAP_YEARS_STANDARD = 3;
const AGE_CAP_YEARS_RD = 6;
const HUNDRED_POINT_PASS = 100;
const THIRD_PARTY_CAPITAL_MIN_AUD = 50_000;

function computeCompanyAgeYears(
  incYear: number,
  incMonth: number | undefined,
  now: Date,
): number {
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth() + 1;
  const m = incMonth ?? 1;
  const monthsDelta = (nowY - incYear) * 12 + (nowM - m);
  return monthsDelta / 12;
}

/**
 * Score the 100-point innovation test per s 360-45.
 *
 * Returns the total points (0..∞ — s 360-45 has no cap, but ≥100 passes).
 */
export function scoreEsic100Point(input: ESIC100PointInput): {
  points: number;
  breakdown: Array<{ item: string; points: number }>;
  notes: string[];
} {
  const breakdown: Array<{ item: string; points: number }> = [];
  const notes: string[] = [];

  if (input.australian_patent) {
    breakdown.push({ item: "Australian standard patent", points: 50 });
  }
  if (input.innovation_patent) {
    breakdown.push({ item: "Innovation patent / registered design", points: 25 });
  }
  if (input.plant_breeder_rights) {
    breakdown.push({ item: "Plant Breeder's Rights", points: 25 });
  }
  if (input.trademarks) {
    notes.push(
      "Trademarks are NOT eligible under s 360-45 — they score 0 points. Consider filing a standard patent for +50 points.",
    );
  }
  if (input.accelerator_alumni) {
    breakdown.push({
      item: "AusIndustry-accredited accelerator alumnus",
      points: 50,
    });
  }
  if (
    typeof input.third_party_capital_raised_aud === "number" &&
    input.third_party_capital_raised_aud >= THIRD_PARTY_CAPITAL_MIN_AUD
  ) {
    breakdown.push({
      item: `Third-party capital raised ≥A$${THIRD_PARTY_CAPITAL_MIN_AUD.toLocaleString("en-AU")}`,
      points: 50,
    });
  } else if (
    typeof input.third_party_capital_raised_aud === "number" &&
    input.third_party_capital_raised_aud > 0
  ) {
    notes.push(
      `Third-party capital A$${input.third_party_capital_raised_aud.toLocaleString("en-AU")} is below the A$50k s 360-45 threshold — 0 points until you cross A$50k.`,
    );
  }
  const rdPct = input.r_and_d_expenditure_pct;
  if (typeof rdPct === "number") {
    if (rdPct > 50) {
      breakdown.push({ item: "R&D >50% of prior-year expenses", points: 75 });
    } else if (rdPct >= 15) {
      breakdown.push({ item: "R&D 15-50% of prior-year expenses", points: 50 });
    } else if (rdPct > 0) {
      notes.push(
        `R&D at ${rdPct.toFixed(1)}% of expenses is below the 15% s 360-45 threshold — 0 points.`,
      );
    }
  }
  if (input.licensed_technology_from_university) {
    breakdown.push({
      item: "Licensed technology from AU university / PFRA",
      points: 25,
    });
  }

  const points = breakdown.reduce((sum, row) => sum + row.points, 0);
  return { points, breakdown, notes };
}

/**
 * Principles-based innovation test — all five sub-tests must pass
 * (s 360-40(1)(f) alt path).
 */
export function passesPrinciplesTest(input: ESICPrinciplesInput): boolean {
  return (
    input.is_genuinely_focused_on_developing_new_or_improved &&
    input.high_growth_potential &&
    input.can_scale_broader_than_local_market &&
    input.has_competitive_advantage &&
    input.can_demonstrate_broader_than_local_market
  );
}

/**
 * Assess ESIC eligibility. Pure function — no I/O. Callers persist the
 * input + result in `compliance_esic_assessments`.
 */
export function assessESIC(
  input: ESICInput,
  now: Date = new Date(),
): ESICResult {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // ---- Limb 1: early-stage ----
  const ageYears = computeCompanyAgeYears(
    input.company_incorporated_year,
    input.company_incorporated_month,
    now,
  );
  const ageCap = input.has_r_and_d_expenditure
    ? AGE_CAP_YEARS_RD
    : AGE_CAP_YEARS_STANDARD;

  const ageOk = ageYears >= 0 && ageYears <= ageCap;
  const turnoverOk = input.turnover_prior_year_aud <= EARLY_STAGE_TURNOVER_CAP_AUD;
  const expensesOk =
    input.total_expenses_prior_year_aud <= EARLY_STAGE_EXPENSES_CAP_AUD;
  const notListedOk = !input.is_listed;

  if (!ageOk) {
    gaps.push(
      `Company age ${ageYears.toFixed(1)}y exceeds the ${ageCap}-year Div 360 early-stage cap.`,
    );
  }
  if (!turnoverOk) {
    gaps.push(
      `Prior-year turnover A$${input.turnover_prior_year_aud.toLocaleString("en-AU")} exceeds the A$200,000 cap.`,
    );
  }
  if (!expensesOk) {
    gaps.push(
      `Prior-year expenses A$${input.total_expenses_prior_year_aud.toLocaleString("en-AU")} exceed the A$1,000,000 cap.`,
    );
  }
  if (!notListedOk) {
    gaps.push("Listed companies cannot qualify as an ESIC.");
  }

  const eligibleEarlyStage = ageOk && turnoverOk && expensesOk && notListedOk;

  // ---- Limb 2a: 100-point test ----
  let points100 = 0;
  if (input.points_100_test) {
    const scored = scoreEsic100Point(input.points_100_test);
    points100 = scored.points;
    for (const note of scored.notes) {
      recommendations.push(note);
    }
    if (points100 < HUNDRED_POINT_PASS) {
      const shortfall = HUNDRED_POINT_PASS - points100;
      recommendations.push(
        `100-point test: ${points100} pts — need ${shortfall} more. Consider filing an Australian standard patent (+50) or completing an AusIndustry-accredited accelerator (+50).`,
      );
    }
  } else {
    recommendations.push(
      "Run the 100-point self-check — patents, R&D spend, and accelerator alumni status are the fastest way to reach 100.",
    );
  }

  // ---- Limb 2b: principles-based test ----
  let eligiblePrinciples = false;
  if (input.principles_test) {
    eligiblePrinciples = passesPrinciplesTest(input.principles_test);
    if (!eligiblePrinciples) {
      const p = input.principles_test;
      const failed: string[] = [];
      if (!p.is_genuinely_focused_on_developing_new_or_improved)
        failed.push("genuinely focused on developing a new / improved product");
      if (!p.high_growth_potential) failed.push("high growth potential");
      if (!p.can_scale_broader_than_local_market)
        failed.push("scalable beyond the local market");
      if (!p.has_competitive_advantage) failed.push("competitive advantage");
      if (!p.can_demonstrate_broader_than_local_market)
        failed.push("addresses a broader-than-local market");
      recommendations.push(
        `Principles test: gather evidence for → ${failed.join(", ")}.`,
      );
    }
  }

  const passesInnovation =
    points100 >= HUNDRED_POINT_PASS || eligiblePrinciples;

  if (!eligibleEarlyStage && gaps.length === 0) {
    gaps.push("Early-stage test failed for an unknown reason.");
  }
  if (!passesInnovation) {
    gaps.push(
      "Innovation test not met — need 100-point score ≥100 OR all five principles-based sub-tests true.",
    );
  }

  const isEsic = eligibleEarlyStage && passesInnovation;

  return {
    eligible_early_stage: eligibleEarlyStage,
    eligible_innovation_100pt: points100,
    eligible_innovation_principles: eligiblePrinciples,
    is_esic: isEsic,
    gaps,
    recommendations,
    disclaimer: ESIC_DISCLAIMER,
  };
}
