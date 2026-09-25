// G34 BT0 — investor-screening catalogue types (plan
// docs/plans/g34-biz-trust-report-v4-quality-2026-09-25.md §4.1, annex
// docs/research/2026-09-25-g34-investor-screening-research.md §3).
//
// Pure data contract. Not wired into scoring or the report pipeline yet (BT5).
// Public-repo rule (D24-f): the registry carries emphasis BANDS only. Numeric
// weights stay where they are today (evaluation-criteria.ts,
// dimension-owners.ts) and the registry never duplicates or moves them.

import type { AgentRole } from "@/lib/report-pipeline/types";
import type { InvestorSignalKey } from "@/lib/report-v2/investor-screening";

export type ScreeningDimension = "FTV" | "MPC" | "PTD" | "TRE" | "CGH" | "IRI" | "LCO" | "SVM";

/** PS pre-seed · S seed · A Series A · B+ Series B and later. */
export type ScreeningStage = "PS" | "S" | "A" | "B+";

/** Relative emphasis (§4.3). "VeryHigh" carries the plan's "Rất cao" cells. */
export type EmphasisBand = "VeryHigh" | "High" | "Medium" | "Low";

/**
 * T1 system of record (connector, bank, ASIC, IP Australia, ATO) ·
 * T2 counterparty-signed · T3 company-produced · T4 founder-stated.
 * Only T1–T2 may be labelled "verified".
 */
export type EvidenceTier = "T1" | "T2" | "T3" | "T4";

export type ScreeningSourceKind =
  | "stripe" | "xero" | "bank" | "crm" | "analytics" | "git" | "cloud_billing" | "payroll"
  | "asic" | "ip_australia" | "ato" | "ausindustry" | "court_search" | "sector_register"
  | "deck" | "document" | "contract" | "financial_model" | "data_room" | "cap_table"
  | "board_minutes" | "reference" | "public_url" | "founder_input";

export interface Bilingual { en: string; vi: string }

export interface ScreeningRedFlag {
  /** Stable machine key, `<dim>.<snake_case>`. */
  key: string;
  /** Short deterministic rule description (EN). */
  rule: string;
  /** Hard flags show on page 1 at every applicable stage (e.g. LCO-01). */
  hard?: true;
}

export interface ScreeningEvidencePolicy {
  acceptedTiers: readonly EvidenceTier[];
  sources: readonly ScreeningSourceKind[];
  /** Positive credit decays after this window; bad news does not expire. */
  freshnessDays: number;
}

export type ScreeningRubricVersion = "rubric@v1";

export interface ScreeningItem {
  /** Stable, never reused. `<DIM>-<nn>`. */
  id: string;
  dimension: ScreeningDimension;
  title: Bilingual;
  question: Bilingual;
  /** Stable ids from lib/reanalysis/scope.ts (`blockid:question:*`). */
  questionRefs: readonly string[];
  /** True when no existing guiding question maps here (new overlay item). */
  overlay: boolean;
  /** Scores and writes the item. Defaults to the dimension lead (D24-c). */
  ownerAgent: AgentRole;
  supporting: readonly AgentRole[];
  /** Judge panel size (policy, not model names; families come from the admitted ladder). */
  judges: 2;
  /** Roles that must sit on the judge panel for this item (§4.4, e.g. CFO on IRI-02/03/08). */
  requiredJudgeAgents: readonly AgentRole[];
  stages: readonly ScreeningStage[];
  emphasisBand: Readonly<Partial<Record<ScreeningStage, EmphasisBand>>>;
  evidence: ScreeningEvidencePolicy;
  /** Source + year, or null when no published benchmark applies. */
  benchmarkRef: string | null;
  redFlags: readonly ScreeningRedFlag[];
  signal: InvestorSignalKey | null;
  /** Page-1 or chapter key-metric slot, when the item feeds one. */
  metricsKey: string | null;
  rubricVersion: ScreeningRubricVersion;
  /** Mandatory screening rule carried from the plan (§4.2). */
  rule?: string;
}

/** Authoring shape for module files; `defineItems` fills the derived fields. */
export interface ScreeningItemInput {
  id: string;
  title: Bilingual;
  question: Bilingual;
  questionRefs?: readonly string[];
  ownerAgent?: AgentRole;
  supporting: readonly AgentRole[];
  requiredJudgeAgents?: readonly AgentRole[];
  stages: readonly ScreeningStage[];
  evidence: ScreeningEvidencePolicy;
  benchmarkRef?: string | null;
  redFlags: readonly ScreeningRedFlag[];
  signal: InvestorSignalKey | null;
  metricsKey?: string | null;
  rule?: string;
}
