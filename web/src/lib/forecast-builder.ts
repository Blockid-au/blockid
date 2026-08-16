/**
 * Revenue Forecast Builder - Core Calculation Engine
 *
 * Pure, deterministic functions for 36-month financial projections.
 * No external state, no randomness, all calculations based on sector benchmarks.
 *
 * Key features:
 * - S-curve growth decay model
 * - RDTI tax incentive support (AU-specific)
 * - Scenario-based OpEx escalation (bear/base/bull)
 * - Series A readiness gate calculation
 * - Runway and breakeven month detection
 */

import {
  ForecastBuilderInput,
  ForecastScenario,
  FinancialModelType,
  ProjectionMonth,
  ProjectionOutput,
  ProjectionSummary,
  SectorNorms,
} from '@/types/financial';

/**
 * Sector-specific base growth rates (annual, as percentages)
 * Used as foundation for scenario multipliers
 */
const SECTOR_BASE_GROWTH_PCT: Record<string, number> = {
  saas: 8,
  marketplace: 10,
  agency: 5,
  'hardware-iot': 4,
  'b2b-services': 6,
  fintech: 9,
  healthtech: 7,
  other: 6,
};

/**
 * Scenario multipliers applied to base growth
 * Bear: conservative, slower growth adoption
 * Base: typical/expected trajectory
 * Bull: aggressive, fast scaling
 */
const SCENARIO_MULTIPLIERS: Record<ForecastScenario, number> = {
  bear: 0.7,
  base: 1.0,
  bull: 1.4,
};

/**
 * Monthly OpEx escalation rate by scenario (as percentage)
 * Reflects hiring ramp: Bear=slow hiring, Bull=fast hiring
 */
const SCENARIO_OPEX_GROWTH: Record<ForecastScenario, number> = {
  bear: 1.0,   // +1% MoM (minimal hiring)
  base: 2.0,   // +2% MoM (typical team growth)
  bull: 3.5,   // +3.5% MoM (aggressive hiring)
};

/**
 * R&D spend intensity by sector (as % of OpEx)
 * Used for RDTI calculation if tax incentives enabled
 */
const SECTOR_RD_INTENSITY: Record<string, number> = {
  saas: 25,
  marketplace: 15,
  agency: 20,
  'hardware-iot': 35,
  'b2b-services': 15,
  fintech: 30,
  healthtech: 28,
  other: 20,
};

/**
 * RDTI (Research & Development Tax Incentive) constants
 * Australian tax incentive: 43.5% refund for R&D spend
 */
const RDTI_MIN_ANNUAL_SPEND = 20000; // A$20k minimum
const RDTI_REFUNDABLE_PREMIUM = 0.435; // 43.5% offset

/**
 * Series A gate constants
 * Trigger funding need when runway approaches these thresholds
 */
const SERIES_A_RUNWAY_THRESHOLD = 6; // months
const SERIES_A_EBITDA_THRESHOLD = 24; // if EBITDA still negative after month 24

/**
 * Normalize sector name to lowercase, handle variants
 *
 * @param sector - Raw sector string from project
 * @returns Normalized sector key matching SECTOR_BASE_GROWTH_PCT keys
 */
function normalizeSector(sector: string): string {
  const normalized = sector.toLowerCase().trim();

  // Exact matches
  if (normalized in SECTOR_BASE_GROWTH_PCT) {
    return normalized;
  }

  // Common aliases
  const aliases: Record<string, string> = {
    'software-as-a-service': 'saas',
    'saas app': 'saas',
    'software': 'saas',
    'b2b': 'saas',
    'marketplace platform': 'marketplace',
    'platform': 'marketplace',
    'service': 'agency',
    'consulting': 'agency',
    'hw': 'hardware-iot',
    'iot': 'hardware-iot',
    'finance': 'fintech',
    'banking': 'fintech',
    'health': 'healthtech',
    'medical': 'healthtech',
  };

  if (normalized in aliases) {
    return aliases[normalized];
  }

  // Default
  return 'other';
}

/**
 * Calculate sector-specific benchmarks
 *
 * @param input - Forecast builder input
 * @returns Sector norms used for projection
 */
function getSectorNorms(input: ForecastBuilderInput): SectorNorms {
  const normalizedSector = normalizeSector(input.sector);
  const baseGrowth = SECTOR_BASE_GROWTH_PCT[normalizedSector] || 6;
  const multiplier = SCENARIO_MULTIPLIERS[input.scenario];

  return {
    sector: normalizedSector,
    baseMonthlyGrowthPct: (baseGrowth / 12) * multiplier,
    grossMarginPct: Math.min(90, Math.max(40, 100 - input.cogsPercent)),
    rdIntensityPct: SECTOR_RD_INTENSITY[normalizedSector] || 20,
    arrMultipleMidYr3: normalizedSector === 'saas' ? 15 : 10,
  };
}

/**
 * Calculate monthly growth rate with S-curve decay
 * Growth decelerates over time as market saturation approaches
 *
 * @param baseGrowthPct - Base growth rate as percentage (e.g., 8 for 8%)
 * @param monthIndex - Month number (0-35)
 * @returns Adjusted monthly growth rate as decimal (0.08 = 8%)
 */
function calculateMonthlyGrowthRate(
  baseGrowthPct: number,
  monthIndex: number
): number {
  // S-curve decay: -0.5% per 6-month block (slower decay), floor at 1%
  // This keeps growth positive and realistic for early-stage companies
  const decayFactor = Math.floor(monthIndex / 6) * 0.5;
  const adjustedGrowth = Math.max(1, baseGrowthPct - decayFactor);

  return adjustedGrowth / 100;
}

/**
 * Calculate RDTI tax offset for a given month
 * Returns monthly R&D tax refund if spend qualifies
 *
 * @param opexAud - Operating expenses for month
 * @param rdIntensityPct - R&D as % of OpEx for sector
 * @returns Monthly RDTI tax offset in AUD
 */
function calculateRdtiOffset(opexAud: number, rdIntensityPct: number): number {
  const monthlyRdSpend = opexAud * (rdIntensityPct / 100);
  const annualRdSpend = monthlyRdSpend * 12;

  if (annualRdSpend < RDTI_MIN_ANNUAL_SPEND) {
    return 0;
  }

  return monthlyRdSpend * RDTI_REFUNDABLE_PREMIUM;
}

/**
 * Generate 36-month financial projection
 * Deterministic calculation based on input assumptions and sector benchmarks
 *
 * @param input - Forecast builder input parameters
 * @returns Complete projection output with monthly breakdown and summary metrics
 */
export function computeProjection(input: ForecastBuilderInput): ProjectionOutput {
  const sectorNorms = getSectorNorms(input);
  const months: ProjectionMonth[] = [];

  // State tracking
  let arr = input.currentArrAud;
  let opex = input.opexMonthlyAud;
  let cumCash = 0;
  let peakBurn = 0;
  let monthBreakeven: number | null = null;
  let monthsToSeriesA: number | null = null;

  const startDate = new Date();
  startDate.setDate(1); // Always start on 1st of month

  // Month-by-month calculation loop (36 months)
  for (let monthIndex = 0; monthIndex < 36; monthIndex++) {
    // Calculate revenue for this month
    if (monthIndex > 0) {
      // Apply growth rate to ARR (not monthly revenue)
      const growthRate = calculateMonthlyGrowthRate(
        sectorNorms.baseMonthlyGrowthPct * 100,
        monthIndex
      );
      arr = arr * (1 + growthRate);

      // Apply churn to ARR
      if (input.churnPct > 0) {
        arr = arr * (1 - input.churnPct / 100);
      }

      // Escalate OpEx by scenario
      const opexGrowth = SCENARIO_OPEX_GROWTH[input.scenario];
      opex = opex * (1 + opexGrowth / 100);
    }

    // Monthly revenue from ARR
    const monthlyRevenue = arr / 12;

    // Cost of goods sold
    const cogs = monthlyRevenue * (input.cogsPercent / 100);

    // Gross margin
    const grossMargin = monthlyRevenue - cogs;

    // Total OpEx (operating + fixed)
    const totalOpex = opex + input.fixedCostsAud;

    // EBITDA
    const ebitda = grossMargin - totalOpex;

    // RDTI tax offset (if enabled)
    const taxOffset = input.includeTaxIncentives
      ? calculateRdtiOffset(totalOpex, sectorNorms.rdIntensityPct)
      : 0;

    // Cash flow (amount spent/saved this month)
    const cashOutflow = Math.max(0, totalOpex - grossMargin - taxOffset);

    // Cumulative cash position
    cumCash += cashOutflow;
    peakBurn = Math.max(peakBurn, cashOutflow);

    // Track breakeven (first month with positive EBITDA)
    if (ebitda >= 0 && monthBreakeven === null) {
      monthBreakeven = monthIndex + 1;
    }

    // Track Series A gate (needs funding around month 20+ if still burning)
    if (monthsToSeriesA === null && monthIndex >= SERIES_A_EBITDA_THRESHOLD) {
      if (ebitda < 0 && monthIndex >= 20) {
        monthsToSeriesA = monthIndex + 1;
      }
    }

    // Estimated headcount (2 founders + 1 hire per 6 months per scenario)
    const hiresPerScenario = input.scenario === 'bear' ? 0.5 : input.scenario === 'bull' ? 1.5 : 1;
    const headcount = 2 + Math.floor((monthIndex / 6) * hiresPerScenario);

    // Build month record
    const monthDate = new Date(startDate);
    monthDate.setMonth(monthDate.getMonth() + monthIndex);

    const month: ProjectionMonth = {
      month: monthIndex + 1,
      date: monthDate.toISOString().split('T')[0],
      revenueAud: Math.round(monthlyRevenue),
      cogsAud: Math.round(cogs),
      grossMarginAud: Math.round(grossMargin),
      opexAud: Math.round(totalOpex),
      ebitdaAud: Math.round(ebitda),
      cashOutflowAud: Math.round(cashOutflow),
      cumCashAud: Math.round(cumCash),
      headcount,
      taxOffsetAud: Math.round(taxOffset),
    };

    months.push(month);
  }

  // Calculate runway (months before cash depletes)
  let runwayMonths: number | null = null;
  if (cumCash > 0 && peakBurn > 0) {
    runwayMonths = Math.ceil(cumCash / (peakBurn / 30)); // Convert daily burn to monthly
  }

  // Calculate summary metrics
  const summary: ProjectionSummary = {
    revenueYear1: months
      .slice(0, 12)
      .reduce((sum, m) => sum + m.revenueAud, 0),
    revenueYear2: months
      .slice(12, 24)
      .reduce((sum, m) => sum + m.revenueAud, 0),
    revenueYear3: months
      .slice(24, 36)
      .reduce((sum, m) => sum + m.revenueAud, 0),
    burnYear1: months
      .slice(0, 12)
      .reduce((sum, m) => sum + m.cashOutflowAud, 0),
    ebitdaYear3: months[35]?.ebitdaAud ?? 0,
    monthBreakeven,
    monthsToSeriesA,
    peakBurnAud: Math.round(peakBurn),
    runwayMonths,
    scenarioNote: getScenarioNote(input.scenario),
    investorReadinessNote: getInvestorReadinessNote(monthsToSeriesA, runwayMonths),
  };

  // Get ARR at key months
  const arrMonth12 = months[11]?.revenueAud
    ? (months[11].revenueAud * 12) / input.currentArrAud
      ? months[11].revenueAud * 12
      : arr
    : arr;
  const arrMonth24 = months[23]?.revenueAud ? months[23].revenueAud * 12 : arr;
  const arrMonth36 = months[35]?.revenueAud ? months[35].revenueAud * 12 : arr;

  return {
    input,
    months,
    summary,
    sectorNormsUsed: sectorNorms,
    generatedAt: new Date().toISOString(),
    disclaimer: getAfslDisclaimer(),
  };
}

/**
 * Get explanatory note for scenario variant
 *
 * @param scenario - Scenario type
 * @returns Descriptive text
 */
function getScenarioNote(scenario: ForecastScenario): string {
  const notes: Record<ForecastScenario, string> = {
    bear: 'Conservative case assumes slower growth adoption and minimal hiring. Reflects cautious market conditions.',
    base: 'Base case assumes typical growth trajectory with moderate team expansion. Aligns with sector benchmarks.',
    bull: 'Aggressive case assumes rapid growth and fast hiring. Requires successful product-market fit and strong sales execution.',
  };

  return notes[scenario];
}

/**
 * Get investor readiness guidance based on projection
 *
 * @param monthsToSeriesA - Month when Series A funding recommended
 * @param runwayMonths - Current runway in months
 * @returns Investor readiness note
 */
function getInvestorReadinessNote(
  monthsToSeriesA: number | null,
  runwayMonths: number | null
): string {
  if (monthsToSeriesA === null && (runwayMonths === null || runwayMonths > 24)) {
    return 'Strong projection: positive cash flow sustained. No immediate funding need.';
  }

  if (monthsToSeriesA !== null) {
    return `Series A funding recommended by month ${monthsToSeriesA} to extend runway beyond cash position.`;
  }

  if (runwayMonths && runwayMonths < 12) {
    return `Limited runway (${runwayMonths} months). Consider pre-Series A bridge or revenue acceleration.`;
  }

  return 'Moderate cash position. Monitor burn rate and plan funding strategy accordingly.';
}

/**
 * Get AFSL-compliant disclaimer for all financial projections
 *
 * @returns Disclaimer text
 */
export function getAfslDisclaimer(): string {
  return 'General information only. Not financial advice. Projections are illustrative estimates based on Australian sector benchmarks and may differ materially from actual outcomes. BlockID does not provide personal financial product advice. Past performance is not a guarantee of future results. For financial advice, consult a licensed Australian financial adviser.';
}

/**
 * Validate forecast builder input
 * Checks for out-of-range values, missing required fields
 *
 * @param input - Forecast builder input to validate
 * @returns { isValid: boolean; errors: string[] }
 */
export function validateForecastInput(
  input: Partial<ForecastBuilderInput>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.modelType) errors.push('modelType is required');
  if (input.currentArrAud === undefined || input.currentArrAud < 0) {
    errors.push('currentArrAud must be >= 0');
  }
  if (input.monthlyGrowthPct === undefined || input.monthlyGrowthPct < -100 || input.monthlyGrowthPct > 500) {
    errors.push('monthlyGrowthPct must be between -100 and 500');
  }
  if (input.churnPct === undefined || input.churnPct < 0 || input.churnPct > 100) {
    errors.push('churnPct must be between 0 and 100');
  }
  if (input.cogsPercent === undefined || input.cogsPercent < 0 || input.cogsPercent > 100) {
    errors.push('cogsPercent must be between 0 and 100');
  }
  if (input.opexMonthlyAud === undefined || input.opexMonthlyAud < 0) {
    errors.push('opexMonthlyAud must be >= 0');
  }
  if (input.fixedCostsAud === undefined || input.fixedCostsAud < 0) {
    errors.push('fixedCostsAud must be >= 0');
  }
  if (!input.scenario || !['bear', 'base', 'bull'].includes(input.scenario)) {
    errors.push('scenario must be bear, base, or bull');
  }
  if (input.includeTaxIncentives === undefined) {
    errors.push('includeTaxIncentives is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
