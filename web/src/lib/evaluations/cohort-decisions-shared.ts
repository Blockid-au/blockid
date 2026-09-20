// cohort-decisions-shared — client-safe vocabulary for cohort decisions
// (G21 P2-B). The bulk-decision toolbar in CohortTable reads the reason
// codes from here; the server write path (./cohort-decisions.ts) re-exports
// them for the Zod schema. Reason codes travel on the audit row and the FI
// `decision_recorded` event only — never on the assessment row.

export const DECISION_REASON_CODES = [
  "thesis_fit",
  "traction_evidence",
  "team_strength",
  "market_size",
  "evidence_gap",
  "stage_mismatch",
  "sector_mismatch",
  "duplicate",
  "other",
] as const;
export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];

export const DECISION_REASON_LABELS: Record<DecisionReasonCode, string> = {
  thesis_fit: "Thesis fit",
  traction_evidence: "Traction evidence",
  team_strength: "Team strength",
  market_size: "Market size",
  evidence_gap: "Evidence gap",
  stage_mismatch: "Stage mismatch",
  sector_mismatch: "Sector mismatch",
  duplicate: "Duplicate",
  other: "Other",
};
