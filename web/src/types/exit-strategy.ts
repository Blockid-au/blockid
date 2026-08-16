/**
 * Exit Strategy Types
 * Covers scenario modeling, dilution calculation, founder payouts, and exit readiness
 */

/**
 * Exit type options
 */
export type ExitType = 'acquisition' | 'ipo' | 'other';

/**
 * Readiness band classification
 */
export type ReadinessBand = 'not_ready' | 'developing' | 'ready' | 'exceptional';

/**
 * Exit scenario (founder's exit model)
 */
export interface ExitScenario {
  id: string;
  account_id: string;

  // Scenario metadata
  scenario_name: string;
  exit_type: ExitType;
  exit_timeline_years: number; // 1–20 years

  // Exit valuation target (A$)
  target_exit_valuation_aud: number;

  // Series A assumptions
  series_a_planned: boolean;
  series_a_target_raise_aud?: number;
  series_a_target_valuation_aud?: number;
  series_a_year_relative?: number; // e.g., 2 = Year 2
  series_a_investor_name?: string;

  // Series B assumptions
  series_b_planned: boolean;
  series_b_target_raise_aud?: number;
  series_b_target_valuation_aud?: number;
  series_b_year_relative?: number;
  series_b_investor_name?: string;

  // Narrative
  narrative?: string;
  assumptions?: Record<string, unknown>;

  // Primary flag
  is_primary: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Cap table projection for a single round
 */
export interface CapTableProjection {
  id: string;
  exit_scenario_id: string;

  // Round identifier
  round_num: number; // 0=seed, 1=A, 2=B, 3=exit
  round_type: 'current_cap_table' | 'series_a' | 'series_b' | 'exit';
  round_year_relative?: number;

  // Funding details
  round_size_aud?: number;
  post_money_valuation_aud?: number;
  pre_money_valuation_aud?: number;
  new_investor_name?: string;

  // Ownership percentages (after round)
  founder_stake_pct_after: number; // 0–100
  investor_stake_pct?: number;
  esop_stake_pct?: number;

  // Share counts
  total_shares_issued?: number;
  founder_shares?: number;
  investor_shares?: number;

  // Timestamps
  created_at: string;
}

/**
 * Exit readiness assessment
 */
export interface ExitReadinessAssessment {
  id: string;
  exit_scenario_id: string;

  // Dimension scores (0–100)
  product_maturity_score: number;
  revenue_scale_score: number;
  team_stability_score: number;
  market_fit_score: number;

  // Overall readiness
  overall_readiness_score: number;
  readiness_band: ReadinessBand;

  // Gaps to address
  critical_gaps: string[];

  // Narrative
  narrative?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Dilution progression (seed → A → B → exit)
 */
export interface DilutionProgression {
  projections: CapTableProjection[];
  founderStakeEvolution: {
    seed: number; // %
    seriesA?: number; // %
    seriesB?: number; // %
    exit: number; // %
  };
}

/**
 * Founder exit payout
 */
export interface FounderExitPayout {
  name: string;
  stake_at_exit_pct: number; // Founder's % at exit
  stake_value_gross_aud: number; // Gross payout (stake% × exit valuation)
  cgt_estimated_aud: number; // Estimated capital gains tax (50% discount + 47% rate)
  net_estimate_aud: number; // Gross - CGT
  disclaimer: string; // Tax disclaimer
}

/**
 * Acquirer profile (anonymized)
 */
export interface AcquirerProfile {
  label: string; // e.g., "AU SaaS Strategic Acquirer (2016–2024)"
  exit_value_range_aud: {
    low: number;
    high: number;
  };
  typical_multiple: {
    low: number;
    high: number;
  };
  exit_count: number; // Number of transactions in category
  sector: string; // e.g., "saas", "fintech"
}

/**
 * Exit scenario input (API request)
 */
export interface CreateExitScenarioRequest {
  account_id: string;
  scenario_name: string;
  exit_type: ExitType;
  exit_timeline_years: number;
  target_exit_valuation_aud: number;

  // Series A
  series_a_planned: boolean;
  series_a_target_raise_aud?: number;
  series_a_target_valuation_aud?: number;
  series_a_year_relative?: number;
  series_a_investor_name?: string;

  // Series B
  series_b_planned: boolean;
  series_b_target_raise_aud?: number;
  series_b_target_valuation_aud?: number;
  series_b_year_relative?: number;
  series_b_investor_name?: string;

  // Narrative
  narrative?: string;
}

/**
 * Exit scenario response (API response)
 */
export interface ExitScenarioResponse {
  ok: boolean;
  error?: string;
  scenario?: ExitScenario;
  projections?: CapTableProjection[];
  dilution_progression?: DilutionProgression;
  founder_payouts?: FounderExitPayout[];
  acquirer_landscape?: AcquirerProfile[];
  readiness?: ExitReadinessAssessment;
}

/**
 * List scenarios response
 */
export interface ListExitScenariosResponse {
  ok: boolean;
  error?: string;
  scenarios?: ExitScenario[];
}

/**
 * Fetch single scenario response
 */
export interface FetchExitScenarioResponse {
  ok: boolean;
  error?: string;
  scenario?: ExitScenario;
  projections?: CapTableProjection[];
  dilution?: DilutionProgression;
  payouts?: FounderExitPayout[];
  acquirers?: AcquirerProfile[];
  readiness?: ExitReadinessAssessment;
}

/**
 * Exit readiness checkpoint
 */
export interface ReadinessCheckpoint {
  name: string; // e.g., "Product Maturity"
  current_score: number;
  target_score: number;
  gap: number;
  critical?: boolean;
}

/**
 * SVI boost from exit strategy
 */
export interface ExitStrategySVIBoost {
  iri_bonus: number; // +0 to +10 points
  svm_bonus: number; // +0 to +3 points
  reasoning: string;
  award_date: string;
}
