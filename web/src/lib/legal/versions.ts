// Legal disclaimer version registry.
//
// Every disclaimer surface has a pinned version string. Bumping a version
// forces re-consent because consent_events.disclaimer_version is part of the
// row and the DisclaimerBlock UI compares stored ack version to current.
//
// Keep in sync with the disclaimer_registry table (migration 0076_compliance_and_equity.sql)
// and the on-disk MDX bodies under web/content/legal/disclaimers/. When
// changing a body_md, always mint a NEW version string here — never edit an
// existing version's copy in place, or the hash chain in consent_events will
// silently drift from what users actually saw.
//
// Format: `v<major>.<minor>-<YYYY-MM-DD>`.

export type DisclaimerKind =
  | "tos"
  | "privacy"
  | "general_advice_warning"
  | "wholesale_certification"
  | "equity_offer_disclaimer"
  | "not_financial_advice"
  | "marketing";

export const DISCLAIMER_VERSIONS: Record<DisclaimerKind, string> = {
  // v2.1 (QA-3 commercial audit, 2026-09-12): one canonical Terms at
  // /legal/terms (legacy /terms 301s there); new clause 3A {#refunds} —
  // 7-day money-back on the first monthly payment, annual pro-rata within
  // 14 days, A$3 reports + credit packs non-refundable once delivered
  // except where the ACL requires, ACL guarantees never excluded; clause 3
  // trial length per plan (7 days founder/evaluator, 14 days Cohort).
  // Registry row: supabase/migrations/0343_terms_v2_1_registry.sql.
  tos: "v2.1-2026-09-12",
  // v2.1 (T0275, 2026-09-10): one canonical policy at /legal/privacy; AI
  // provider chain listed as actually run (groq → cerebras → sambanova →
  // deepinfra → anthropic → ollama → openrouter); founder-approved data
  // principle added; the "never train third-party models" sentence removed.
  // Registry row: supabase/migrations/0313_privacy_v2_1_registry.sql.
  // v2.2 (S14-A, 2026-09-11): Money Finder intake + optional demographic
  // flags (eligibility only), guest A$3 purchases, Founder Radar emails
  // (money_radar opt-out) + calendar tokens, evaluator-entered startup data
  // (claim, consent tiers, founder removal route), investor discoverability,
  // per-table retention. Registry row: 0328_privacy_v2_2_registry.sql.
  // v2.3 (S21-A review, 2026-09-12): investor data-room NDA acceptance
  // record + engagement telemetry listed in clause 1, with clause-4
  // retention rows (acceptances: life of the room + 7 years, no sweep;
  // engagement: 12 months, swept). Registry row: 0342_privacy_v2_3_registry.sql.
  privacy: "v2.3-2026-09-12",
  general_advice_warning: "v1.0-2026-07-16",
  wholesale_certification: "v1.0-2026-07-16",
  equity_offer_disclaimer: "v1.0-2026-07-16",
  not_financial_advice: "v1.0-2026-07-16",
  marketing: "v1.0-2026-07-16",
};

export function getCurrentVersion(kind: string): string {
  const v = (DISCLAIMER_VERSIONS as Record<string, string | undefined>)[kind];
  if (!v) {
    throw new Error(`getCurrentVersion: unknown disclaimer kind '${kind}'`);
  }
  return v;
}

export function isKnownDisclaimerKind(kind: string): kind is DisclaimerKind {
  return kind in DISCLAIMER_VERSIONS;
}
