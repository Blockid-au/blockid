// SVI Engine — Centralised config for all tunable parameters.
// Numbers here are the single source of truth. Change via admin panel,
// not by editing scoring.ts directly.
//
// To override at runtime: load from DB (e.g. Supabase `svi_config` table)
// and call mergeSVIConfig(dbOverrides) before computing scores.

export interface SVIMetricsThresholds {
  mrr_high: number;    // MRR above this → +15 pts
  mrr_mid: number;     // MRR above this → +10 pts
  mrr_low: number;     // MRR above 0 → +5 pts
  users_high: number;  // Users above this → +15 pts
  users_mid: number;   // Users above this → +10 pts
  users_low: number;   // Users above this → +5 pts
  churn_good: number;  // Churn below this → +10 pts
  churn_ok: number;    // Churn below this → +5 pts
  nps_good: number;    // NPS above this → +10 pts
  nps_ok: number;      // NPS above this → +5 pts
  metrics_bonus_cap: number;
}

export interface SVIDimensionWeights {
  ftv: number;  // Founder & Team Value
  mpc: number;  // Market & Problem Clarity
  ptd: number;  // Product & Technical Depth
  tre: number;  // Traction & Revenue Evidence
  cgh: number;  // Cap Table & Governance Health
  iri: number;  // Investor Readiness Index
  lco: number;  // Legal & Compliance
  svm: number;  // Strategic Vision & Moat
}

export interface SVIDimensionBaseScores {
  ftv_base: number;
  mpc_base: number;
  ptd_base: number;
  tre_base: number;  // Lower start — traction must be earned
  cgh_base: number;
  iri_base: number;
  lco_base: number;
  svm_base: number;
}

export interface SVIRiskPenalties {
  ai_wrapper_no_moat: number;
  no_founder_background: number;
  undefined_market: number;
  no_cap_table: number;
  unverified_claims: number;
  solo_founder_growth_stage: number;
  no_legal_docs: number;
  vague_problem: number;
  no_product_at_validated: number;
  no_revenue_model: number;
  concentrated_cap_table: number;
  no_advisors_at_scale: number;
  no_analytics_at_traction: number;
  no_pitch_deck_investor_ready: number;
  undefined_competitive_advantage: number;
}

export interface SVIEvidenceImpacts {
  first_revenue: number;
  upgrade_evidence_level: number;
  create_cap_table: number;
  register_abn: number;
  link_source_code: number;
  create_website: number;
  upload_pitch_deck: number;
  secure_ip: number;
  upload_financial_model: number;
  connect_analytics: number;
  add_advisors: number;
}

export interface SVICampaignConfig {
  // Founding campaign
  founding_slots_total: number;       // was 50, now 100
  founding_price_aud: number;         // A$1 early access
  founding_price_label: string;       // display string
  founding_urgency_threshold: number; // show "X slots left" when below this
  // General pricing
  standard_monthly_aud: number;
  standard_annual_aud: number;
  pro_monthly_aud: number;
  pro_annual_aud: number;
}

export interface SVIConfig {
  version: string;
  metrics: SVIMetricsThresholds;
  weights: SVIDimensionWeights;
  bases: SVIDimensionBaseScores;
  penalties: SVIRiskPenalties;
  evidence_impacts: SVIEvidenceImpacts;
  campaign: SVICampaignConfig;
}

// ─── Default config ───────────────────────────────────────────────────────────
// Edit these to change SVI behaviour globally. Overrides come from DB.

export const DEFAULT_SVI_CONFIG: SVIConfig = {
  version: "2.0.0",

  metrics: {
    mrr_high: 10_000,
    mrr_mid: 1_000,
    mrr_low: 1,
    users_high: 1_000,
    users_mid: 100,
    users_low: 10,
    churn_good: 3,
    churn_ok: 5,
    nps_good: 50,
    nps_ok: 30,
    metrics_bonus_cap: 50,
  },

  weights: {
    ftv: 0.15,
    mpc: 0.18,
    ptd: 0.12,
    tre: 0.20,
    cgh: 0.12,
    iri: 0.10,
    lco: 0.08,
    svm: 0.05,
  },

  bases: {
    ftv_base: 50,
    mpc_base: 50,
    ptd_base: 50,
    tre_base: 30,
    cgh_base: 40,
    iri_base: 40,
    lco_base: 40,
    svm_base: 35,
  },

  penalties: {
    ai_wrapper_no_moat: 15,
    no_founder_background: 8,
    undefined_market: 10,
    no_cap_table: 12,
    unverified_claims: 8,
    solo_founder_growth_stage: 5,
    no_legal_docs: 10,
    vague_problem: 8,
    no_product_at_validated: 5,
    no_revenue_model: 7,
    concentrated_cap_table: 8,
    no_advisors_at_scale: 5,
    no_analytics_at_traction: 6,
    no_pitch_deck_investor_ready: 8,
    undefined_competitive_advantage: 6,
  },

  evidence_impacts: {
    first_revenue: 18,
    upgrade_evidence_level: 15,
    create_cap_table: 12,
    register_abn: 10,
    link_source_code: 10,
    create_website: 8,
    upload_pitch_deck: 8,
    secure_ip: 7,
    upload_financial_model: 6,
    connect_analytics: 8,
    add_advisors: 5,
  },

  campaign: {
    founding_slots_total: 100,
    founding_price_aud: 1,
    founding_price_label: "A$1",
    founding_urgency_threshold: 20,
    standard_monthly_aud: 49,
    standard_annual_aud: 39,
    pro_monthly_aud: 149,
    pro_annual_aud: 119,
  },
};

// ─── Runtime singleton ────────────────────────────────────────────────────────
// Loaded once at startup; admin patches override specific keys.

let _activeConfig: SVIConfig = { ...DEFAULT_SVI_CONFIG };

export function getSVIConfig(): SVIConfig {
  return _activeConfig;
}

/** Shallow-merge admin overrides into the active config. */
export function mergeSVIConfig(overrides: Partial<SVIConfig>): void {
  _activeConfig = {
    ..._activeConfig,
    ...overrides,
    metrics: { ..._activeConfig.metrics, ...(overrides.metrics ?? {}) },
    weights: { ..._activeConfig.weights, ...(overrides.weights ?? {}) },
    bases: { ..._activeConfig.bases, ...(overrides.bases ?? {}) },
    penalties: { ..._activeConfig.penalties, ...(overrides.penalties ?? {}) },
    evidence_impacts: { ..._activeConfig.evidence_impacts, ...(overrides.evidence_impacts ?? {}) },
    campaign: { ..._activeConfig.campaign, ...(overrides.campaign ?? {}) },
  };
}

/** Reset to defaults (for tests). */
export function resetSVIConfig(): void {
  _activeConfig = { ...DEFAULT_SVI_CONFIG };
}
