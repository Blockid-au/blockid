// Division 83A eligibility checker — AU Startup Concession.
//
// Reference: Income Tax Assessment Act 1997, Subdivision 83A-B / 83A-C
// (specifically s83A-33 — "Reducing amounts included for ESS interests
//  acquired under start-up concession").
//
// This is a **deterministic**, pure evaluator — no I/O, no network. Given
// a grant + project context, return a per-criterion breakdown and an
// overall status: eligible | ineligible | unsure.
//
// General information only. Not legal or tax advice.
//
// This module is pure — no I/O, no network — so it is safe to import from
// both server routes and vitest.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Div83AGrantInput {
  /** ISO date (YYYY-MM-DD) or full timestamp — the grant date. */
  grantDate: string;
  /** AUD strike price per option. 0 permitted (checked against market note). */
  strikePriceAud: number;
  /** Total vesting duration in years (1..6). */
  vestingYears: number;
  /** Cliff in months (0..24). */
  cliffMonths: number;
}

export interface Div83AProjectInput {
  /** Group aggregated turnover for the financial year of the grant, in AUD. */
  aggregatedTurnoverAud?: number;
  /** ISO date the company was incorporated. */
  incorporatedAt?: string;
  /** Whether the company (or a holding entity) is listed on a stock exchange. */
  isListed?: boolean;
  /** True if the company has an ESIC ruling / meets 83A-33 startup tests. */
  hasEsicRuling?: boolean;
  /**
   * True if the employer is an Australian resident-taxpayer for the income
   * year of the grant (s83A-33(6)(d)). Undefined = unknown → treated as
   * failing the test (fail-closed) in the qualifying-tests summary.
   */
  isAustralianResidentTaxpayer?: boolean;
}

/**
 * Structured summary of the five ATO qualifying tests for the Division 83A
 * start-up concession. Each test carries a boolean outcome, a plain-English
 * reason with the ITAA 1997 reference, and optional evidence pulled from the
 * request payload. `all_passed` and `concession_available` collapse the row
 * results into a single go / no-go answer for the CHRO surface.
 */
export interface QualifyingTest {
  passed: boolean;
  reason: string;
  evidence?: string;
}

export interface QualifyingTests {
  test_1_startup: QualifyingTest;
  test_2_unlisted: QualifyingTest;
  test_3_turnover_le_50m: QualifyingTest;
  test_4_australian_resident: QualifyingTest;
  test_5_holding_period: QualifyingTest;
  all_passed: boolean;
  concession_available: boolean;
}

export type Criterion = {
  key: string;
  label: string;
  /** true = met, false = failed, null = unknown / unsure */
  met: boolean | null;
  evidence: string;
};

export interface Div83ACheck {
  status: "eligible" | "ineligible" | "unsure";
  criteria: Criterion[];
  guidance: string;
  qualifying_tests: QualifyingTests;
}

// ---------------------------------------------------------------------------
// Constants (AU Startup Concession thresholds)
// ---------------------------------------------------------------------------

/** s83A-33(1)(a) — aggregated turnover cap for eligible start-up. */
const TURNOVER_CAP_AUD = 50_000_000;
/** s83A-33(1)(c) — maximum age since incorporation. */
const MAX_AGE_YEARS = 10;
/** s83A-45(4) — post-grant beneficial ownership cap. */
const MAX_OWNERSHIP_PCT = 10;
/** s83A-45(5) — minimum holding period for options. */
const MIN_HOLDING_YEARS = 3;

const AFSL_DISCLAIMER =
  "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  const ms = to - from;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Main checker
// ---------------------------------------------------------------------------

export function checkDiv83A(
  grant: Div83AGrantInput,
  project: Div83AProjectInput = {},
  granteePostGrantOwnershipPct?: number,
): Div83ACheck {
  const criteria: Criterion[] = [];

  // 1. ESIC-eligible startup / meets 83A-33 tests.
  if (project.hasEsicRuling === true) {
    criteria.push({
      key: "esic_eligible",
      label: "Company is an ESIC-eligible start-up (s83A-33 tests met)",
      met: true,
      evidence: "Project marked as holding an ESIC ruling / self-assessment.",
    });
  } else if (project.hasEsicRuling === false) {
    criteria.push({
      key: "esic_eligible",
      label: "Company is an ESIC-eligible start-up (s83A-33 tests met)",
      met: false,
      evidence:
        "Project is not ESIC-eligible — the start-up concession under s83A-33 does not apply.",
    });
  } else {
    criteria.push({
      key: "esic_eligible",
      label: "Company is an ESIC-eligible start-up (s83A-33 tests met)",
      met: null,
      evidence:
        "ESIC status unknown. Confirm via ATO ESIC self-assessment or private ruling.",
    });
  }

  // 2. Company is unlisted at the grant time (s83A-33(1)(b)).
  if (project.isListed === false) {
    criteria.push({
      key: "unlisted",
      label: "Company (and holding entities) unlisted at grant date",
      met: true,
      evidence: "Recorded as unlisted.",
    });
  } else if (project.isListed === true) {
    criteria.push({
      key: "unlisted",
      label: "Company (and holding entities) unlisted at grant date",
      met: false,
      evidence: "Company is listed — start-up concession not available.",
    });
  } else {
    criteria.push({
      key: "unlisted",
      label: "Company (and holding entities) unlisted at grant date",
      met: null,
      evidence: "Listing status unknown — confirm no shares are quoted on an approved exchange.",
    });
  }

  // 3. Aggregated turnover ≤ A$50m for financial year of grant (s83A-33(1)(a)).
  if (typeof project.aggregatedTurnoverAud === "number") {
    if (project.aggregatedTurnoverAud <= TURNOVER_CAP_AUD) {
      criteria.push({
        key: "turnover_cap",
        label: "Aggregated turnover ≤ A$50m (financial year of grant)",
        met: true,
        evidence: `Aggregated turnover A$${project.aggregatedTurnoverAud.toLocaleString()} is within the A$50m cap.`,
      });
    } else {
      criteria.push({
        key: "turnover_cap",
        label: "Aggregated turnover ≤ A$50m (financial year of grant)",
        met: false,
        evidence: `Aggregated turnover A$${project.aggregatedTurnoverAud.toLocaleString()} exceeds the A$50m cap.`,
      });
    }
  } else {
    criteria.push({
      key: "turnover_cap",
      label: "Aggregated turnover ≤ A$50m (financial year of grant)",
      met: null,
      evidence: "Aggregated turnover not provided — required to confirm the s83A-33(1)(a) test.",
    });
  }

  // 4. Company incorporated < 10 years ago (s83A-33(1)(c)).
  if (project.incorporatedAt) {
    const ageYears = yearsBetween(project.incorporatedAt, grant.grantDate);
    if (Number.isNaN(ageYears)) {
      criteria.push({
        key: "age_lt_10y",
        label: "Company incorporated less than 10 years before grant",
        met: null,
        evidence: "Could not parse incorporation date.",
      });
    } else if (ageYears < MAX_AGE_YEARS) {
      criteria.push({
        key: "age_lt_10y",
        label: "Company incorporated less than 10 years before grant",
        met: true,
        evidence: `Company age at grant: ${ageYears.toFixed(1)} years (< 10).`,
      });
    } else {
      criteria.push({
        key: "age_lt_10y",
        label: "Company incorporated less than 10 years before grant",
        met: false,
        evidence: `Company age at grant: ${ageYears.toFixed(1)} years (≥ 10). Start-up test fails.`,
      });
    }
  } else {
    criteria.push({
      key: "age_lt_10y",
      label: "Company incorporated less than 10 years before grant",
      met: null,
      evidence: "Incorporation date not provided — required to confirm the 10-year test.",
    });
  }

  // 5. Grantee is an employee (not a contractor) — s83A-105(1)(a).
  // We use grantee_email presence as a weak proxy; treat as unsure to force the
  // founder to confirm. If explicitly known, override via note.
  criteria.push({
    key: "grantee_is_employee",
    label: "Grantee is an employee (not contractor) of the company",
    met: null,
    evidence:
      "Confirm the grantee is on PAYG payroll (not a contractor / ABN invoicer) at the grant date.",
  });

  // 6. Options issued for consideration ≥ market value (s83A-33(4)).
  // For options: strike must equal (or exceed) market value at grant.
  // We can only confirm the strike is > 0; the founder must verify FMV.
  if (grant.strikePriceAud > 0) {
    criteria.push({
      key: "market_value",
      label: "Options issued with strike ≥ market value at grant",
      met: null,
      evidence: `Strike A$${grant.strikePriceAud.toFixed(4)} recorded. Confirm this is at or above FMV determined by a s960-410 safe-harbour method or independent valuation.`,
    });
  } else {
    criteria.push({
      key: "market_value",
      label: "Options issued with strike ≥ market value at grant",
      met: false,
      evidence:
        "Strike price is zero — options must be issued at strike ≥ market value to qualify (s83A-33(4)).",
    });
  }

  // 7. Post-grant beneficial ownership ≤ 10% (s83A-45(4)).
  if (typeof granteePostGrantOwnershipPct === "number") {
    if (granteePostGrantOwnershipPct <= MAX_OWNERSHIP_PCT) {
      criteria.push({
        key: "ownership_cap",
        label: "Grantee's post-grant beneficial ownership + voting power ≤ 10%",
        met: true,
        evidence: `Recorded post-grant ownership ${granteePostGrantOwnershipPct.toFixed(2)}% is within cap.`,
      });
    } else {
      criteria.push({
        key: "ownership_cap",
        label: "Grantee's post-grant beneficial ownership + voting power ≤ 10%",
        met: false,
        evidence: `Recorded post-grant ownership ${granteePostGrantOwnershipPct.toFixed(2)}% exceeds the 10% cap.`,
      });
    }
  } else {
    criteria.push({
      key: "ownership_cap",
      label: "Grantee's post-grant beneficial ownership + voting power ≤ 10%",
      met: null,
      evidence:
        "Post-grant ownership percentage not provided — required to confirm the 10% cap.",
    });
  }

  // 8. Real risk of forfeiture OR ≥ 3-year holding period (s83A-45(5)).
  // vestingYears ≥ 3 → satisfies holding-period test.
  // Otherwise, if cliff_months ≥ 12 we consider real risk of forfeiture met.
  if (grant.vestingYears >= MIN_HOLDING_YEARS) {
    criteria.push({
      key: "holding_or_forfeiture",
      label: "≥ 3-year holding period OR real risk of forfeiture",
      met: true,
      evidence: `Vesting schedule of ${grant.vestingYears} years satisfies the 3-year holding requirement.`,
    });
  } else if (grant.cliffMonths >= 12) {
    criteria.push({
      key: "holding_or_forfeiture",
      label: "≥ 3-year holding period OR real risk of forfeiture",
      met: true,
      evidence: `${grant.cliffMonths}-month cliff creates a real risk of forfeiture under s83A-105(6).`,
    });
  } else {
    criteria.push({
      key: "holding_or_forfeiture",
      label: "≥ 3-year holding period OR real risk of forfeiture",
      met: false,
      evidence: `Vesting is ${grant.vestingYears} year(s) with a ${grant.cliffMonths}-month cliff — neither the 3-year holding test nor a real risk of forfeiture is satisfied.`,
    });
  }

  // ── Overall status ──────────────────────────────────────────────────
  const anyFailed = criteria.some((c) => c.met === false);
  const anyUnknown = criteria.some((c) => c.met === null);
  const status: Div83ACheck["status"] = anyFailed
    ? "ineligible"
    : anyUnknown
      ? "unsure"
      : "eligible";

  const failedKeys = criteria.filter((c) => c.met === false).map((c) => c.key);
  const unknownKeys = criteria.filter((c) => c.met === null).map((c) => c.key);

  let guidance = "";
  if (status === "eligible") {
    guidance = `All eight AU start-up concession criteria are satisfied on the data provided. ${AFSL_DISCLAIMER}`;
  } else if (status === "ineligible") {
    guidance = `Grant does not qualify for the AU Startup Concession — failing criteria: ${failedKeys.join(", ")}. ${AFSL_DISCLAIMER}`;
  } else {
    guidance = `Cannot confirm eligibility — resolve the following before relying on the start-up concession: ${unknownKeys.join(", ")}. ${AFSL_DISCLAIMER}`;
  }

  return { status, criteria, guidance };
}

export const DIV83A_DISCLAIMER = AFSL_DISCLAIMER;
