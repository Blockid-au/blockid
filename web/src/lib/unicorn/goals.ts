// web/src/lib/unicorn/goals.ts
//
// Phase 6 Batch J · sub-J2 — sub-goal decomposition + milestone
// templates + blocker predicates for the Day-0 unicorn framework
// (Master Upgrade Plan §17.4).
//
// Pure module — NO database, NO server-only imports.
//
// Design notes
// ------------
//   * `STAGE_GOALS` is a keyed catalogue of 3-5 customer outcomes per
//     stage (sub-goals). Each outcome maps to an owning C-Level agent
//     so the dashboard can render an avatar next to it.
//   * `STAGE_MILESTONE_TEMPLATES` seeds 3-5 dated deliverables per stage
//     (the `stage_milestones` rows are created from this template on the
//     first tick of a stage). Due offsets are days from stage entry.
//   * `computeStageBlockers` is a pure predicate that maps a business
//     snapshot to a list of hard-gate blockers per §17.4:
//         - missing ABN
//         - expired evidence > 180d
//         - unresolved critical AssessmentFinding severity ≥ high
//     Used by the nightly cron + rendered on the dashboard.

import type { UnicornStageId } from "./framework";

// ─── Sub-goal decomposition ─────────────────────────────────────────

export interface StageSubGoal {
  code: string;
  label: string;
  ownerAgent: string; // 'ceo' | 'cfo' | 'clo' | 'cpo' | 'cmo' | 'ciso' | 'cro' | 'cto' | 'chro' | 'cdo' | 'coo' | 'ir'
}

export const STAGE_GOALS: Record<UnicornStageId, StageSubGoal[]> = {
  S0: [
    { code: "verify_identity", label: "Verify founder identity + ABN", ownerAgent: "clo" },
    { code: "mint_business_id", label: "Mint Business ID + public slug", ownerAgent: "ceo" },
    { code: "publish_vision_v1", label: "Publish Vision v1 statement", ownerAgent: "cpo" },
  ],
  S1: [
    { code: "prove_rep_authority", label: "Prove representative authority", ownerAgent: "clo" },
    { code: "draft_cap_table", label: "Draft first cap table", ownerAgent: "cfo" },
    { code: "connect_bank_feed", label: "Connect first bank feed", ownerAgent: "cfo" },
    { code: "link_mvp", label: "Link MVP repo or product URL", ownerAgent: "cpo" },
    { code: "reach_l2", label: "Reach verification level L2", ownerAgent: "ceo" },
  ],
  S2: [
    { code: "prove_pull", label: "Prove pull: A$1k MRR or 100 users", ownerAgent: "cro" },
    { code: "instrument_funnel", label: "Instrument acquisition funnel", ownerAgent: "cmo" },
    { code: "baseline_unit_economics", label: "Baseline unit economics", ownerAgent: "cfo" },
    { code: "reach_l3", label: "Reach verification level L3", ownerAgent: "ceo" },
    { code: "publish_gtm_canvas", label: "Publish GTM canvas + retention cohort", ownerAgent: "cmo" },
  ],
  S3: [
    { code: "board_cadence_live", label: "Board cadence live (quarterly minutes)", ownerAgent: "clo" },
    { code: "esop_div_83a", label: "Div 83A ESOP live", ownerAgent: "chro" },
    { code: "modern_slavery_attest", label: "Modern-slavery attestation", ownerAgent: "clo" },
    { code: "ip_register", label: "IP register + assignment agreements", ownerAgent: "clo" },
    { code: "twelve_area_coverage", label: "All 13 areas covered with fresh evidence", ownerAgent: "ceo" },
  ],
  S4: [
    { code: "first_counterparty_share", label: "First verified counterparty share", ownerAgent: "ir" },
    { code: "procurement_ready_pack", label: "Procurement-ready pack export", ownerAgent: "coo" },
    { code: "series_a_valuation", label: "Series A valuation pack", ownerAgent: "cfo" },
    { code: "iso27001_gap_plan", label: "ISO27001 gap plan approved", ownerAgent: "ciso" },
    { code: "three_verified_counterparties", label: "3 verified counterparties", ownerAgent: "ir" },
  ],
  S5: [
    { code: "verified_network_10", label: "Verified network ≥ 10 counterparties", ownerAgent: "ir" },
    { code: "continuous_monitoring", label: "Continuous monitoring live", ownerAgent: "ciso" },
    { code: "tokenised_cap_table", label: "Tokenised cap table on-chain", ownerAgent: "cfo" },
    { code: "dividend_engine", label: "Dividend engine operational", ownerAgent: "cfo" },
    { code: "exit_ready_dataroom", label: "Exit-ready dataroom", ownerAgent: "ir" },
  ],
};

// ─── Milestone templates ────────────────────────────────────────────

export interface StageMilestoneTemplate {
  code: string;
  label: string;
  /** Days from stage entry — the seeder writes stage_milestones.due_at = entry + offset. */
  dueOffsetDays: number;
  ownerAgent: string;
}

export const STAGE_MILESTONE_TEMPLATES: Record<
  UnicornStageId,
  StageMilestoneTemplate[]
> = {
  S0: [
    { code: "abn_verified", label: "ABN verified via ABR", dueOffsetDays: 3, ownerAgent: "clo" },
    { code: "business_id_minted", label: "Business ID minted", dueOffsetDays: 5, ownerAgent: "ceo" },
    { code: "founder_kyc", label: "Founder KYC complete", dueOffsetDays: 7, ownerAgent: "clo" },
    { code: "vision_v1", label: "Vision v1 published", dueOffsetDays: 14, ownerAgent: "cpo" },
  ],
  S1: [
    { code: "rep_authority_proven", label: "Representative authority proven", dueOffsetDays: 10, ownerAgent: "clo" },
    { code: "cap_table_draft", label: "Cap table draft", dueOffsetDays: 20, ownerAgent: "cfo" },
    { code: "bank_feed_connected", label: "First bank feed connected", dueOffsetDays: 30, ownerAgent: "cfo" },
    { code: "mvp_linked", label: "MVP linked", dueOffsetDays: 45, ownerAgent: "cpo" },
  ],
  S2: [
    { code: "mrr_or_users_target", label: "A$1k MRR or 100 users", dueOffsetDays: 60, ownerAgent: "cro" },
    { code: "gtm_canvas", label: "GTM canvas published", dueOffsetDays: 90, ownerAgent: "cmo" },
    { code: "retention_cohort", label: "Retention cohort published", dueOffsetDays: 120, ownerAgent: "cmo" },
    { code: "soc2_lite", label: "SOC2-lite self-assessment", dueOffsetDays: 150, ownerAgent: "ciso" },
  ],
  S3: [
    { code: "twelve_area_coverage", label: "13-area coverage complete", dueOffsetDays: 60, ownerAgent: "ceo" },
    { code: "board_cadence", label: "Board cadence live", dueOffsetDays: 90, ownerAgent: "clo" },
    { code: "esop_div_83a_live", label: "Div 83A ESOP live", dueOffsetDays: 120, ownerAgent: "chro" },
    { code: "modern_slavery_attest", label: "Modern-slavery attestation filed", dueOffsetDays: 180, ownerAgent: "clo" },
  ],
  S4: [
    { code: "first_counterparty_share", label: "First counterparty share", dueOffsetDays: 60, ownerAgent: "ir" },
    { code: "procurement_pack", label: "Procurement-ready pack", dueOffsetDays: 120, ownerAgent: "coo" },
    { code: "series_a_valuation", label: "Series A valuation", dueOffsetDays: 180, ownerAgent: "cfo" },
    { code: "iso27001_gap_plan", label: "ISO27001 gap plan", dueOffsetDays: 240, ownerAgent: "ciso" },
    { code: "three_verified_counterparties", label: "3 verified counterparties", dueOffsetDays: 300, ownerAgent: "ir" },
  ],
  S5: [
    { code: "verified_network_10", label: "Verified network ≥ 10", dueOffsetDays: 120, ownerAgent: "ir" },
    { code: "continuous_monitoring", label: "Continuous monitoring live", dueOffsetDays: 180, ownerAgent: "ciso" },
    { code: "tokenised_cap_table", label: "Tokenised cap table live", dueOffsetDays: 240, ownerAgent: "cfo" },
    { code: "dividend_engine", label: "Dividend engine live", dueOffsetDays: 300, ownerAgent: "cfo" },
    { code: "exit_ready_dataroom", label: "Exit-ready dataroom", dueOffsetDays: 360, ownerAgent: "ir" },
  ],
};

// ─── Blocker predicates ─────────────────────────────────────────────

/** Severity codes we treat as "critical" for the hard-gate check. */
const CRITICAL_SEVERITIES = new Set(["high", "critical"]);

/** Evidence older than this is treated as expired per §17.4. */
export const EVIDENCE_EXPIRY_DAYS = 180;

export interface BusinessSnapshot {
  abn: string | null;
  /** Most recent evidence timestamp, or null if the business has none. */
  mostRecentEvidenceAt: Date | null;
  /** Open AssessmentFinding rows for this business. */
  openFindings: readonly { severity: string }[];
  /** Reference "now" — injected for deterministic tests. */
  now?: Date;
}

export interface StageBlockerEntry {
  code:
    | "missing_abn"
    | "expired_evidence"
    | "open_critical_findings";
  message: string;
  detail?: Record<string, unknown>;
}

export function computeStageBlockers(
  snapshot: BusinessSnapshot,
): StageBlockerEntry[] {
  const blockers: StageBlockerEntry[] = [];
  const now = snapshot.now ?? new Date();

  if (!snapshot.abn || snapshot.abn.trim().length === 0) {
    blockers.push({
      code: "missing_abn",
      message: "ABN missing — required for S0 exit",
    });
  }

  if (snapshot.mostRecentEvidenceAt) {
    const ageMs = now.getTime() - snapshot.mostRecentEvidenceAt.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays > EVIDENCE_EXPIRY_DAYS) {
      blockers.push({
        code: "expired_evidence",
        message: `Most recent evidence is ${ageDays}d old (> ${EVIDENCE_EXPIRY_DAYS}d)`,
        detail: { ageDays, thresholdDays: EVIDENCE_EXPIRY_DAYS },
      });
    }
  }

  const criticalCount = snapshot.openFindings.filter((f) =>
    CRITICAL_SEVERITIES.has(f.severity),
  ).length;
  if (criticalCount > 0) {
    blockers.push({
      code: "open_critical_findings",
      message: `${criticalCount} open finding(s) with severity high/critical`,
      detail: { count: criticalCount },
    });
  }

  return blockers;
}
