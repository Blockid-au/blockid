// G34-BT4 — the `email_drips.payload.lifecycle` shapes. Everything a
// renderer needs is captured at enqueue time (the drip worker renders
// synchronously and must not re-query), and every field is optional on read:
// a row written by an older build still renders.

/** One dimension that moved in a re-score (EM12). */
export interface DimensionChange {
  key: string;
  label: string;
  before: number;
  after: number;
  /** Evidence on file for that dimension (labels, newest first, ≤ 3). */
  evidence: string[];
}

export interface ScoreUpdatedData {
  previous_svi: number;
  new_svi: number;
  changes: DimensionChange[];
  /** "rescore" (Re-score button) | "evidence" (evidence vault re-score). */
  source: "rescore" | "evidence";
  scored_at: string;
}

export interface EvidenceGapData {
  dimension_key: string;
  dimension_title: string;
  short_label: string;
  /** Upper-case C-level role that leads the dimension, e.g. "CRO". */
  lead_agent: string;
  score: number | null;
  /** Catalogue items still missing for the dimension, highest impact first (≤ 3). */
  missing: string[];
  missing_count: number;
  /** "nothing on file" → the rung one item reaches, e.g. "public URL". */
  confidence_to: string | null;
  /** Relative path of the dimension's evidence page. */
  cta_path: string;
  analysed_at: string;
}

export interface IntakeAbandonedData {
  steps_done: number;
  steps_total: number;
  next_step_label: string;
  /** `onboarding_state.updated_at` when the row was queued — a newer save cancels it. */
  idle_since: string;
}

export interface RerunPromptData {
  new_evidence_count: number;
  /** `svi_analyses.created_at` of the analysis the evidence post-dates. */
  last_scored_at: string;
  evidence_labels: string[];
}

export interface FreeQuotaData {
  reports_used: number;
  delivered_at: string;
}

export interface DigestMissingItem {
  title: string;
  cta_url: string;
}

export interface MonthlyDigestData {
  /** "September 2026" */
  period_label: string;
  /** "2026-09" — the dedupe key (one digest per address per month). */
  period_key: string;
  svi_current: number | null;
  svi_previous: number | null;
  views: number;
  leads: number;
  missing_top3: DigestMissingItem[];
  next_action: DigestMissingItem | null;
  /** Share of the stage cohort scoring below this startup, 0–100 — only when cohort_n ≥ 10. */
  percentile: number | null;
  cohort_n: number;
  stage_label: string | null;
  quiet: boolean;
}

export interface SunsetData {
  last_seen_at: string | null;
  days_inactive: number;
}

export interface LifecyclePayload {
  score?: ScoreUpdatedData;
  gap?: EvidenceGapData;
  intake?: IntakeAbandonedData;
  rerun?: RerunPromptData;
  quota?: FreeQuotaData;
  digest?: MonthlyDigestData;
  sunset?: SunsetData;
}
