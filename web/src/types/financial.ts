/**
 * Financial forecast builder types
 * Covers forecast generation, storage, and API contracts
 */

/**
 * Model type determines sector-specific benchmarks and growth assumptions
 */
export type FinancialModelType = 'saas' | 'marketplace' | 'agency' | 'other';

/**
 * Scenario variants: bear/base/bull with different growth/cost assumptions
 */
export type ForecastScenario = 'bear' | 'base' | 'bull';

/**
 * Input to forecast builder calculation engine
 * All financial values in AUD unless otherwise noted
 */
export interface ForecastBuilderInput {
  /** Model type for sector-specific benchmarks */
  modelType: FinancialModelType;

  /** Current ARR (Annual Recurring Revenue) in AUD */
  currentArrAud: number;

  /** Monthly growth rate as percentage (e.g., 8 for 8% MoM) */
  monthlyGrowthPct: number;

  /** Monthly churn rate as percentage (0-100) */
  churnPct: number;

  /** Cost of goods sold as % of revenue (0-100) */
  cogsPercent: number;

  /** Monthly operating expenses in AUD */
  opexMonthlyAud: number;

  /** Fixed monthly costs (rent, servers, etc.) in AUD */
  fixedCostsAud: number;

  /** Growth scenario: bear (0.7x), base (1.0x), or bull (1.4x) */
  scenario: ForecastScenario;

  /** Enable RDTI/ESIC tax incentive calculations */
  includeTaxIncentives: boolean;

  /** Sector/industry for benchmarks (auto-detected from project) */
  sector: string;
}

/**
 * Single month in projection
 */
export interface ProjectionMonth {
  /** Month number (1-36) */
  month: number;

  /** ISO date string (YYYY-MM-01) */
  date: string;

  /** Revenue for the month in AUD */
  revenueAud: number;

  /** COGS for the month in AUD */
  cogsAud: number;

  /** Gross margin (revenue - COGS) in AUD */
  grossMarginAud: number;

  /** Operating expenses for the month in AUD */
  opexAud: number;

  /** EBITDA (gross margin - OpEx) in AUD */
  ebitdaAud: number;

  /** Cash outflow (max(0, OpEx - gross margin)) in AUD */
  cashOutflowAud: number;

  /** Cumulative cash burn from month 1 in AUD */
  cumCashAud: number;

  /** Estimated headcount for the month */
  headcount: number;

  /** Monthly RDTI tax offset if enabled in AUD */
  taxOffsetAud: number;
}

/**
 * Summary metrics derived from 36-month projection
 */
export interface ProjectionSummary {
  /** Total revenue in year 1 (months 1-12) */
  revenueYear1: number;

  /** Total revenue in year 2 (months 13-24) */
  revenueYear2: number;

  /** Total revenue in year 3 (months 25-36) */
  revenueYear3: number;

  /** Total cash burn in year 1 */
  burnYear1: number;

  /** EBITDA in month 36 */
  ebitdaYear3: number;

  /** Month when EBITDA first becomes positive (null if never in 36mo) */
  monthBreakeven: number | null;

  /** Month when Series A funding recommended (null if not needed) */
  monthsToSeriesA: number | null;

  /** Peak monthly burn rate in AUD */
  peakBurnAud: number;

  /** Runway in months before cash depletion (null if positive cash flow indefinite) */
  runwayMonths: number | null;

  /** Explanatory note for the scenario */
  scenarioNote: string;

  /** Investor readiness guidance */
  investorReadinessNote: string;
}

/**
 * Sector benchmarks and norms used in calculation
 */
export interface SectorNorms {
  /** Normalized sector name */
  sector: string;

  /** Base monthly growth rate for scenario */
  baseMonthlyGrowthPct: number;

  /** Typical gross margin for sector */
  grossMarginPct: number;

  /** R&D spend as % of OpEx for sector */
  rdIntensityPct: number;

  /** Typical ARR multiple at year 3 */
  arrMultipleMidYr3: number;
}

/**
 * Complete projection output from forecast builder
 */
export interface ProjectionOutput {
  /** Input parameters used (for auditability) */
  input: ForecastBuilderInput;

  /** 36-month month-by-month breakdown */
  months: ProjectionMonth[];

  /** High-level summary metrics */
  summary: ProjectionSummary;

  /** Sector benchmarks used */
  sectorNormsUsed: SectorNorms;

  /** ISO timestamp of generation */
  generatedAt: string;

  /** AFSL/disclaimer text */
  disclaimer: string;
}

/**
 * Database record for saved financial model
 */
export interface FinancialModelRecord {
  id: string;
  project_id: string;
  user_id: string;

  name: string;
  model_type: FinancialModelType;
  description?: string;

  current_arr_aud: number;
  monthly_growth_pct: number;
  churn_pct: number;
  cogs_pct: number;
  opex_monthly_aud: number;
  fixed_costs_aud: number;

  include_tax_incentives: boolean;
  scenario: ForecastScenario;

  month_breakeven?: number;
  months_to_series_a?: number;
  peak_monthly_burn_aud?: number;
  arr_month_12_aud?: number;
  arr_month_24_aud?: number;
  arr_month_36_aud?: number;
  runway_months?: number;

  projection_data: ProjectionOutput;

  use_for_investor_pack: boolean;
  investor_pack_version?: number;

  version: number;
  is_deleted: boolean;
  replaced_by_id?: string;

  created_at: string;
  updated_at: string;
  published_at?: string;
}

/**
 * Forecast scenario variant (for multi-scenario comparison)
 */
export interface ForecastScenarioRecord {
  id: string;
  financial_model_id: string;
  scenario_name: string;
  scenario_type: ForecastScenario | 'custom';
  cached_projection_json: ProjectionOutput;
  arr_month_12_aud?: number;
  arr_month_24_aud?: number;
  arr_month_36_aud?: number;
  month_breakeven?: number;
  runway_months?: number;
  created_at: string;
}

/**
 * API request to generate projection (preview, no save)
 */
export interface GenerateForecastRequest {
  projectId: string;
  modelType: FinancialModelType;
  currentArrAud: number;
  monthlyGrowthPct: number;
  churnPct: number;
  cogsPercent: number;
  opexMonthlyAud: number;
  fixedCostsAud: number;
  scenario: ForecastScenario;
  includeTaxIncentives: boolean;
}

/**
 * API response from generate projection
 */
export interface GenerateForecastResponse {
  ok: boolean;
  error?: string;
  projection?: ProjectionOutput;
  creditsCharged: number;
  creditsRemaining?: number;
  disclaimer?: string;
}

/**
 * API request to save model to database
 */
export interface SaveForecastRequest {
  projectId: string;
  name: string;
  projection: ProjectionOutput;
  notes?: string;
  useForInvestorPack: boolean;
}

/**
 * API response from save forecast
 */
export interface SaveForecastResponse {
  ok: boolean;
  error?: string;
  model?: FinancialModelRecord;
  creditsCharged: number;
  creditsRemaining?: number;
}

/**
 * API response from fetch single model
 */
export interface FetchForecastResponse {
  ok: boolean;
  error?: string;
  model?: FinancialModelRecord;
}

/**
 * API response from list models
 */
export interface ListForecastsResponse {
  ok: boolean;
  error?: string;
  models?: Omit<FinancialModelRecord, 'projection_data'>[];
}

/**
 * API request to update model metadata
 */
export interface UpdateForecastRequest {
  name?: string;
  useForInvestorPack?: boolean;
  notes?: string;
}

/**
 * API response from update model
 */
export interface UpdateForecastResponse {
  ok: boolean;
  error?: string;
  model?: FinancialModelRecord;
}
