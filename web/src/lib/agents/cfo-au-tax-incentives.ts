// src/lib/agents/cfo-au-tax-incentives.ts
//
// CFO domain helper — Australian R&D Tax Incentive (RDTI) + Early Stage
// Innovation Company (ESIC) qualification (T0110).
//
// Pure-logic library. Given a founder's turnover, R&D spend, incorporation
// history, and innovation signals it returns:
//   1. RDTI eligibility + estimated refundable/non-refundable offset (AUD).
//   2. ESIC qualification against the early-stage limbs and both the
//      principles-based and 100-point innovation tests, plus the investor
//      offset uplift ESIC status unlocks.
// Rates and thresholds mirror the current ATO / AusIndustry guidance and are
// centralised as constants below so they are easy to audit and update.
//
// Sources:
//   - AusIndustry — R&D Tax Incentive Program Guide 2024-25
//   - ATO — R&D Tax Offset Rates (income years 2021-22 onwards)
//   - ATO — Tax incentives for early stage investors (ESIC)
//   - Treasury Laws Amendment (Research and Development Tax Incentive) Act 2020
//
// No UI or network dependency — safe to import from CFO report pipeline,
// /tools/rd-tax-incentive, or the SVI report builder.

export type EsicInnovationTestResult = {
  passes: boolean;
  method: "principles" | "points" | null;
  pointsScored?: number;
  reasoning: string[];
};

export interface RdtiInput {
  /**
   * Aggregated turnover in AUD (company + connected/affiliated entities).
   * Threshold for the refundable offset is A$20,000,000.
   */
  aggregatedTurnoverAud: number;
  /**
   * Notional R&D expenditure the company plans to claim, in AUD.
   * The A$20,000 minimum threshold does not apply if the R&D is contracted
   * to a Registered Research Service Provider (RSP), but for the estimator
   * we surface a warning rather than silently zero the offset.
   */
  eligibleRdExpenditureAud: number;
  /** Corporate tax rate as a decimal (e.g. 0.25 for base-rate entities). */
  corporateTaxRate?: number;
  /**
   * R&D intensity — R&D expenditure as % of total expenses. Only used for
   * the non-refundable (large company) tier where the premium steps up
   * above 2% intensity.
   */
  rdIntensityPct?: number;
  /** True if the R&D is contracted to a Registered Research Service Provider. */
  contractedToRsp?: boolean;
}

export interface RdtiEstimate {
  /** True if the company clears the base gates (min spend, entity type). */
  eligible: boolean;
  tier: "refundable" | "non-refundable" | "ineligible";
  /** Effective offset rate applied (as decimal, e.g. 0.435). */
  offsetRate: number;
  /** Cash-equivalent estimated benefit in AUD. */
  estimatedOffsetAud: number;
  /**
   * Component of the offset above the corporate tax rate — this is the
   * "true" incentive after refund of tax already payable.
   */
  premiumComponentAud: number;
  notes: string[];
  sources: string[];
}

export interface EsicInput {
  /** Years since incorporation in Australia. */
  yearsSinceIncorporation: number;
  /** Total expenses claimed in prior income years (cumulative, AUD). */
  cumulativePriorYearExpensesAud: number;
  /** Assessable income in the prior income year (AUD). */
  priorYearAssessableIncomeAud: number;
  /** Total expenses in the prior income year (AUD). */
  priorYearTotalExpensesAud: number;
  /** True if the company is listed on any stock exchange. */
  listedOnExchange: boolean;
  /**
   * Optional 100-point test signals. If provided the estimator will run the
   * scoring pass; otherwise it falls back to the principles-based test only.
   */
  points?: Partial<Points100Signals>;
  /** Optional principles-based test signals (self-reported). */
  principles?: Partial<PrinciplesSignals>;
}

export interface Points100Signals {
  /** At least 50% of expenses this year classified as R&D expenditure (75 pts). */
  rdExpenditure50pctOfExpenses: boolean;
  /** At least 15% of expenses this year classified as R&D expenditure (50 pts). */
  rdExpenditure15pctOfExpenses: boolean;
  /**
   * Received a Government grant of at least A$50,000 relating to development
   * or commercialisation of the innovation (75 pts).
   */
  eligibleGovernmentGrant50k: boolean;
  /** Enrolled in a qualifying accelerator program (50 pts). */
  qualifyingAccelerator: boolean;
  /**
   * Received at least A$50,000 in third-party capital from arm's-length
   * investors under specified conditions (50 pts).
   */
  qualifyingEquityFinance50k: boolean;
  /** Rights to a granted innovation patent or standard patent (50 pts). */
  grantedPatent: boolean;
  /** Rights to a granted plant breeder's right (50 pts). */
  plantBreedersRight: boolean;
  /** Written agreement with an Australian university to co-develop (25 pts). */
  universityCollaboration: boolean;
}

export interface PrinciplesSignals {
  /** Is the business genuinely developing new or significantly improved product/process. */
  genuinelyDevelopingInnovation: boolean;
  /** Innovation is targeted at global/broader-than-local markets. */
  broadCommercialisationScope: boolean;
  /** Innovation has clear high-growth potential. */
  highGrowthPotential: boolean;
  /** Business has demonstrated ability to scale beyond the local market. */
  scalable: boolean;
  /** Innovation has demonstrable competitive advantage. */
  competitiveAdvantage: boolean;
}

export interface EsicResult {
  /** Final ESIC qualification (both early-stage + innovation limbs pass). */
  qualifies: boolean;
  earlyStage: {
    passes: boolean;
    reasoning: string[];
  };
  innovation: EsicInnovationTestResult;
  investor: {
    /**
     * Sophisticated investor cap — 20% tax offset on investment up to
     * A$1,000,000 (i.e. max A$200,000 offset per year).
     */
    sophisticated: { offsetRate: number; maxOffsetAud: number; maxInvestmentAud: number };
    /**
     * Retail investor cap — 20% offset up to A$50,000 investment
     * (i.e. max A$10,000 offset per year).
     */
    retail: { offsetRate: number; maxOffsetAud: number; maxInvestmentAud: number };
    /** CGT exemption period for shares held >= 12 months, up to 10 years. */
    cgtExemptionMinYears: number;
    cgtExemptionMaxYears: number;
    notes: string[];
  };
  sources: string[];
}

// ─── Constants (audit-friendly) ──────────────────────────────────────────────

/** Minimum R&D spend (per year) to claim the offset, unless via an RSP. */
export const RDTI_MIN_SPEND_AUD = 20_000;
/** Refundable-offset turnover ceiling (aggregated turnover). */
export const RDTI_REFUNDABLE_TURNOVER_CAP_AUD = 20_000_000;
/** Notional R&D expenditure cap per income year. */
export const RDTI_EXPENDITURE_CAP_AUD = 150_000_000;
/** Refundable-tier premium above the base corporate tax rate. */
export const RDTI_REFUNDABLE_PREMIUM = 0.185;
/** Non-refundable tier 1 premium (R&D intensity <= 2%). */
export const RDTI_NON_REFUNDABLE_PREMIUM_LOW = 0.085;
/** Non-refundable tier 2 premium (R&D intensity > 2%). */
export const RDTI_NON_REFUNDABLE_PREMIUM_HIGH = 0.165;
/** Base-rate entity corporate tax rate (default assumption). */
export const DEFAULT_BASE_RATE_ENTITY_TAX = 0.25;

/** ESIC 100-point test qualifying threshold. */
export const ESIC_POINTS_THRESHOLD = 100;
/** Early-stage: max years since incorporation (extended limb if expenses <A$1M). */
export const ESIC_MAX_YEARS_INCORPORATION_EXTENDED = 6;
/** Early-stage: standard incorporation window. */
export const ESIC_MAX_YEARS_INCORPORATION_STANDARD = 3;
export const ESIC_EXTENDED_LIMB_EXPENSE_CEILING_AUD = 1_000_000;
export const ESIC_PRIOR_YEAR_INCOME_CEILING_AUD = 200_000;
export const ESIC_PRIOR_YEAR_EXPENSE_CEILING_AUD = 1_000_000;

/** ESIC investor tax offset rate. */
export const ESIC_INVESTOR_OFFSET_RATE = 0.20;
/** Sophisticated investor maximum offset per year. */
export const ESIC_SOPHISTICATED_MAX_OFFSET_AUD = 200_000;
/** Retail investor maximum offset per year. */
export const ESIC_RETAIL_MAX_OFFSET_AUD = 10_000;

const RDTI_SOURCES = [
  "AusIndustry — R&D Tax Incentive Program Guide 2024-25",
  "ATO — R&D Tax Offset Rates (income years 2021-22 onwards)",
  "Treasury Laws Amendment (R&D Tax Incentive) Act 2020",
];

const ESIC_SOURCES = [
  "ATO — Tax incentives for early stage investors (ESIC)",
  "Income Tax Assessment Act 1997 — Subdivision 360-A",
];

// ─── R&D Tax Incentive ───────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round0(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Estimate the R&D Tax Incentive offset for the given input. Returns the
 * cash-equivalent estimated benefit plus the premium above the base tax
 * rate (the "true" incentive after refund of tax already payable).
 */
export function estimateRdti(input: RdtiInput): RdtiEstimate {
  const notes: string[] = [];
  const baseRate = clamp(input.corporateTaxRate ?? DEFAULT_BASE_RATE_ENTITY_TAX, 0, 0.5);
  const spend = Math.max(0, input.eligibleRdExpenditureAud);
  const cappedSpend = Math.min(spend, RDTI_EXPENDITURE_CAP_AUD);
  if (cappedSpend < spend) {
    notes.push(
      `Notional R&D spend capped at A$${RDTI_EXPENDITURE_CAP_AUD.toLocaleString()} per income year.`,
    );
  }

  const belowMinSpend = spend < RDTI_MIN_SPEND_AUD;
  if (belowMinSpend && !input.contractedToRsp) {
    notes.push(
      `R&D spend below the A$${RDTI_MIN_SPEND_AUD.toLocaleString()} minimum. The minimum is waived if the R&D is contracted to a Registered Research Service Provider (RSP).`,
    );
    return {
      eligible: false,
      tier: "ineligible",
      offsetRate: 0,
      estimatedOffsetAud: 0,
      premiumComponentAud: 0,
      notes,
      sources: RDTI_SOURCES,
    };
  }

  const turnover = Math.max(0, input.aggregatedTurnoverAud);
  const isRefundable = turnover < RDTI_REFUNDABLE_TURNOVER_CAP_AUD;
  let premium: number;
  let tier: RdtiEstimate["tier"];
  if (isRefundable) {
    premium = RDTI_REFUNDABLE_PREMIUM;
    tier = "refundable";
    notes.push("Refundable offset — full cash benefit even if the company is in tax loss.");
  } else {
    const intensity = clamp(input.rdIntensityPct ?? 0, 0, 100);
    premium = intensity > 2 ? RDTI_NON_REFUNDABLE_PREMIUM_HIGH : RDTI_NON_REFUNDABLE_PREMIUM_LOW;
    tier = "non-refundable";
    notes.push(
      intensity > 2
        ? "Non-refundable tier 2 — R&D intensity above 2% attracts the higher premium."
        : "Non-refundable tier 1 — R&D intensity at or below 2%.",
    );
  }

  const offsetRate = baseRate + premium;
  const estimatedOffsetAud = round0(cappedSpend * offsetRate);
  const premiumComponentAud = round0(cappedSpend * premium);

  return {
    eligible: true,
    tier,
    offsetRate,
    estimatedOffsetAud,
    premiumComponentAud,
    notes,
    sources: RDTI_SOURCES,
  };
}

// ─── ESIC — Early Stage limb ─────────────────────────────────────────────────

function checkEarlyStage(input: EsicInput): { passes: boolean; reasoning: string[] } {
  const reasoning: string[] = [];
  if (input.listedOnExchange) {
    reasoning.push("Fails: company is listed on a stock exchange (must be unlisted).");
    return { passes: false, reasoning };
  }

  const withinStandard = input.yearsSinceIncorporation <= ESIC_MAX_YEARS_INCORPORATION_STANDARD;
  const withinExtended =
    input.yearsSinceIncorporation <= ESIC_MAX_YEARS_INCORPORATION_EXTENDED &&
    input.cumulativePriorYearExpensesAud < ESIC_EXTENDED_LIMB_EXPENSE_CEILING_AUD;
  const incorporationOk = withinStandard || withinExtended;

  if (!incorporationOk) {
    reasoning.push(
      `Fails: incorporated ${input.yearsSinceIncorporation} yrs ago. Must be within 3 yrs (or within 6 yrs if cumulative prior-year expenses < A$1M).`,
    );
  } else if (withinExtended && !withinStandard) {
    reasoning.push(
      `Passes via extended limb — within 6 yrs of incorporation and cumulative expenses A$${input.cumulativePriorYearExpensesAud.toLocaleString()} < A$1M.`,
    );
  } else {
    reasoning.push(
      `Passes: incorporated ${input.yearsSinceIncorporation} yr(s) ago (within 3-yr window).`,
    );
  }

  const incomeOk = input.priorYearAssessableIncomeAud <= ESIC_PRIOR_YEAR_INCOME_CEILING_AUD;
  if (!incomeOk) {
    reasoning.push(
      `Fails: prior-year assessable income A$${input.priorYearAssessableIncomeAud.toLocaleString()} exceeds A$${ESIC_PRIOR_YEAR_INCOME_CEILING_AUD.toLocaleString()}.`,
    );
  } else {
    reasoning.push(
      `Passes income test: A$${input.priorYearAssessableIncomeAud.toLocaleString()} <= A$${ESIC_PRIOR_YEAR_INCOME_CEILING_AUD.toLocaleString()}.`,
    );
  }

  const expenseOk = input.priorYearTotalExpensesAud <= ESIC_PRIOR_YEAR_EXPENSE_CEILING_AUD;
  if (!expenseOk) {
    reasoning.push(
      `Fails: prior-year total expenses A$${input.priorYearTotalExpensesAud.toLocaleString()} exceed A$${ESIC_PRIOR_YEAR_EXPENSE_CEILING_AUD.toLocaleString()}.`,
    );
  } else {
    reasoning.push(
      `Passes expense test: A$${input.priorYearTotalExpensesAud.toLocaleString()} <= A$${ESIC_PRIOR_YEAR_EXPENSE_CEILING_AUD.toLocaleString()}.`,
    );
  }

  return { passes: incorporationOk && incomeOk && expenseOk, reasoning };
}

// ─── ESIC — Innovation limb ──────────────────────────────────────────────────

function runPointsTest(signals: Partial<Points100Signals> | undefined):
  { points: number; reasoning: string[] } {
  const reasoning: string[] = [];
  if (!signals) return { points: 0, reasoning };
  let total = 0;
  const add = (condition: boolean | undefined, pts: number, label: string) => {
    if (condition) {
      total += pts;
      reasoning.push(`+${pts} pts — ${label}`);
    }
  };
  // Order matters: the 50%-of-expenses signal supersedes the 15% signal —
  // only claim the higher tier.
  if (signals.rdExpenditure50pctOfExpenses) {
    add(true, 75, "R&D expenditure ≥ 50% of total expenses");
  } else {
    add(signals.rdExpenditure15pctOfExpenses, 50, "R&D expenditure ≥ 15% of total expenses");
  }
  add(signals.eligibleGovernmentGrant50k, 75, "Eligible Government grant ≥ A$50k");
  add(signals.qualifyingAccelerator, 50, "Qualifying accelerator programme");
  add(signals.qualifyingEquityFinance50k, 50, "Qualifying third-party equity ≥ A$50k");
  add(signals.grantedPatent, 50, "Granted innovation or standard patent");
  add(signals.plantBreedersRight, 50, "Granted plant breeder's right");
  add(signals.universityCollaboration, 25, "Written agreement to co-develop with an Australian university");
  return { points: total, reasoning };
}

function runPrinciplesTest(signals: Partial<PrinciplesSignals> | undefined):
  { passes: boolean; reasoning: string[] } {
  const reasoning: string[] = [];
  if (!signals) return { passes: false, reasoning };
  const checks: Array<[keyof PrinciplesSignals, string]> = [
    ["genuinelyDevelopingInnovation", "Genuinely developing new or significantly improved product/service/process"],
    ["broadCommercialisationScope", "Innovation targets broader-than-local markets"],
    ["highGrowthPotential", "Innovation has high-growth potential"],
    ["scalable", "Business is scalable"],
    ["competitiveAdvantage", "Demonstrable competitive advantage"],
  ];
  let met = 0;
  for (const [key, label] of checks) {
    if (signals[key]) {
      met += 1;
      reasoning.push(`✓ ${label}`);
    } else {
      reasoning.push(`✗ ${label} — self-report missing`);
    }
  }
  // All five limbs are gating criteria. The principles-based test does not
  // have a documented "3-of-5" pass mark — the ATO expects each limb to be
  // demonstrated with supporting evidence.
  return { passes: met === checks.length, reasoning };
}

function checkInnovation(input: EsicInput): EsicInnovationTestResult {
  const points = runPointsTest(input.points);
  const principles = runPrinciplesTest(input.principles);

  if (points.points >= ESIC_POINTS_THRESHOLD) {
    return {
      passes: true,
      method: "points",
      pointsScored: points.points,
      reasoning: [`100-point test scored ${points.points} (threshold ${ESIC_POINTS_THRESHOLD}).`, ...points.reasoning],
    };
  }
  if (principles.passes) {
    return {
      passes: true,
      method: "principles",
      pointsScored: points.points,
      reasoning: [
        "Principles-based test passed — all five limbs met.",
        ...principles.reasoning,
      ],
    };
  }
  return {
    passes: false,
    method: null,
    pointsScored: points.points,
    reasoning: [
      points.points > 0
        ? `100-point test: ${points.points} / ${ESIC_POINTS_THRESHOLD}.`
        : "100-point test: no qualifying signals supplied.",
      principles.reasoning.length
        ? "Principles-based test did not clear all five limbs."
        : "Principles-based test: no signals supplied.",
    ],
  };
}

/**
 * Evaluate ESIC qualification for the given company snapshot. Combines the
 * early-stage limb + the innovation limb (100-point OR principles-based) and
 * surfaces the investor offset uplift ESIC status unlocks.
 */
export function evaluateEsic(input: EsicInput): EsicResult {
  const earlyStage = checkEarlyStage(input);
  const innovation = checkInnovation(input);
  return {
    qualifies: earlyStage.passes && innovation.passes,
    earlyStage,
    innovation,
    investor: {
      sophisticated: {
        offsetRate: ESIC_INVESTOR_OFFSET_RATE,
        maxOffsetAud: ESIC_SOPHISTICATED_MAX_OFFSET_AUD,
        maxInvestmentAud: ESIC_SOPHISTICATED_MAX_OFFSET_AUD / ESIC_INVESTOR_OFFSET_RATE,
      },
      retail: {
        offsetRate: ESIC_INVESTOR_OFFSET_RATE,
        maxOffsetAud: ESIC_RETAIL_MAX_OFFSET_AUD,
        maxInvestmentAud: ESIC_RETAIL_MAX_OFFSET_AUD / ESIC_INVESTOR_OFFSET_RATE,
      },
      cgtExemptionMinYears: 1,
      cgtExemptionMaxYears: 10,
      notes: [
        "20% carry-forward, non-refundable tax offset on qualifying investments.",
        "Modified CGT treatment: shares held ≥ 12 months and < 10 years may qualify for CGT exemption on capital gain.",
        "Sophisticated investor cap: A$200,000 combined offset per year (equating to A$1M invested at 20%).",
        "Retail (non-sophisticated) investor cap: A$50,000 invested per year — hard cap, not a phase-out.",
      ],
    },
    sources: ESIC_SOURCES,
  };
}
