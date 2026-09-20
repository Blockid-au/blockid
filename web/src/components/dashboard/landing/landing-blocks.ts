// Founder landing block catalogue (§B.1) — a plain module so BOTH server
// components (dashboard/page.tsx) and the client tracker can import it.
export type LandingBlockName = "where-you-stand" | "executive-synthesis" | "next-best-action" | "money-on-the-table" | "evidence-to-add" | "your-reports" | "what-investors-said";

/** The five always-on blocks in benefit order (phase 0 renders exactly these). */
export const LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze([
  "where-you-stand",
  "next-best-action",
  "money-on-the-table",
  "evidence-to-add",
  "your-reports",
]);

/**
 * Blocks that exist only when their data does. G14-S34 "What investors
 * said" renders once a founder_feedback_letters row exists for the founder
 * (k ≥ 3 assessors from ≥ 2 orgs). G19-S44 "Executive synthesis" renders
 * once a stored `svi_snapshots.report_v2` exists (right after "Where you
 * stand"). A founder with neither keeps the five-block landing.
 */
export const OPTIONAL_LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze(["executive-synthesis", "what-investors-said"]);

export interface LandingBlockFlags {
  /** A member (non-owner) never sees block 3 (§B.4). */
  isMember?: boolean;
  /** A feedback letter exists for the founder → block 6 is appended. */
  hasFeedbackLetter?: boolean;
  /** G19-S44: a stored report_v2 exists → the synthesis block follows block 1. */
  hasReportV2?: boolean;
}

/** The blocks the landing renders for this session, in order. */
export function landingBlocksFor(flags: LandingBlockFlags = {}): LandingBlockName[] {
  const base = flags.isMember ? LANDING_BLOCKS.filter((b) => b !== "money-on-the-table") : [...LANDING_BLOCKS];
  const withSynthesis = flags.hasReportV2 ? base.flatMap((b) => (b === "where-you-stand" ? [b, "executive-synthesis" as const] : [b])) : base;
  return flags.hasFeedbackLetter ? [...withSynthesis, "what-investors-said"] : withSynthesis;
}
