// G34-BT4 — the lifecycle flows (plan §9.2, EM12–EM20) as `email_drips`
// campaigns: id → class (T/C), preference category, flow key (the per-flow
// 72 h cap groups on it) and in-batch priority.
//
// Pure registry — no I/O. lib/email-drip.ts folds these ids into its
// `DripCampaign` union and delegates class / category / flow to the maps
// below; the DB CHECK on `email_drips.campaign` gains them in
// supabase/pending-authority/0466_email_drips_lifecycle_campaigns.sql (until
// that lands an insert of a lifecycle row is rejected and logged, never
// thrown).
//
// EM11 (save & resume) is not here: /analyze keeps no server-side draft (the
// hero → /analyze hand-off is an in-memory 60 s singleton, lib/analyze/
// pending-intake.ts) and signed-in onboarding progress already resumes from
// app_users.onboarding_state on login — there is nothing a signed, single-use
// resume link could point at yet.

import type { EmailCategory } from "@/lib/email-preferences";
import type { EmailClass } from "@/lib/email-sends";

export const LIFECYCLE_CAMPAIGNS = [
  /** EM12 — re-score finished: old → new score and what moved (T, factual). */
  "score_updated",
  /** EM14 — report seen, no evidence yet: first touch (+48 h) and follow-up (+7 d). */
  "evidence_gap_1",
  "evidence_gap_2",
  /** EM13 — onboarding started and left idle: +24 h and a follow-up ≥ 72 h later. */
  "intake_abandoned_1",
  "intake_abandoned_2",
  /** EM15 — evidence added since the last full analysis, no re-run (+24 h). */
  "rerun_prompt",
  /** EM16 — second (last) free report delivered, no purchase (+3 d). */
  "free_quota_used",
  /** EM19 — monthly digest (sent in quiet months too). */
  "monthly_digest",
  /** EM20 — 90 days without a sign-in: "keep or stop?" (one touch). */
  "sunset_check",
] as const;

export type LifecycleCampaign = (typeof LIFECYCLE_CAMPAIGNS)[number];

export function isLifecycleCampaign(c: string): c is LifecycleCampaign {
  return (LIFECYCLE_CAMPAIGNS as readonly string[]).includes(c);
}

interface CampaignMeta {
  emailClass: EmailClass;
  category: EmailCategory;
  flow: string;
  /** Lower sends first inside one worker batch (plan §9.1 EM03 priority). */
  priority: number;
}

/**
 * EM03 priority: re-run > evidence > intake > quota > digest; the sunset
 * question last. T-class (score_updated) is never capped, it simply goes
 * first.
 */
export const LIFECYCLE_META: Readonly<Record<LifecycleCampaign, CampaignMeta>> = Object.freeze({
  score_updated: { emailClass: "T", category: "svi_alerts", flow: "score-updated", priority: 0 },
  rerun_prompt: { emailClass: "C", category: "product_updates", flow: "rerun-prompt", priority: 10 },
  evidence_gap_1: { emailClass: "C", category: "product_updates", flow: "evidence-gap", priority: 20 },
  evidence_gap_2: { emailClass: "C", category: "product_updates", flow: "evidence-gap", priority: 20 },
  intake_abandoned_1: { emailClass: "C", category: "product_updates", flow: "intake-abandoned", priority: 30 },
  intake_abandoned_2: { emailClass: "C", category: "product_updates", flow: "intake-abandoned", priority: 30 },
  free_quota_used: { emailClass: "C", category: "promotions", flow: "free-quota", priority: 40 },
  // Same flow key as the weekly founder digest it replaces, so the two can
  // never both land inside 72 h while the weekly cron is being retired.
  monthly_digest: { emailClass: "C", category: "weekly_reports", flow: "founder-digest", priority: 60 },
  sunset_check: { emailClass: "C", category: "product_updates", flow: "sunset", priority: 70 },
});

/** Priority for any drip campaign (lifecycle or legacy) — used to order one batch. */
export function campaignPriority(campaign: string, emailClass: EmailClass): number {
  if (isLifecycleCampaign(campaign)) return LIFECYCLE_META[campaign].priority;
  if (emailClass === "T") return 0;
  // Onboarding tips, the A$3 unlock nudge, radar setup, NPS: between quota and digest.
  return 50;
}
