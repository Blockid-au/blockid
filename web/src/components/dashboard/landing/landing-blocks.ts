// Founder landing block catalogue (§B.1) — a plain module so BOTH server
// components (dashboard/page.tsx) and the client tracker can import it.
export type LandingBlockName = "where-you-stand" | "next-best-action" | "money-on-the-table" | "evidence-to-add" | "your-reports" | "what-investors-said";

/** The five always-on blocks in benefit order (phase 0 renders exactly these). */
export const LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze([
  "where-you-stand",
  "next-best-action",
  "money-on-the-table",
  "evidence-to-add",
  "your-reports",
]);

/**
 * G14-S34 — blocks that exist only when their data does. "What investors
 * said" renders once a founder_feedback_letters row exists for the founder
 * (k ≥ 3 assessors from ≥ 2 orgs); a founder without a letter keeps the
 * five-block landing.
 */
export const OPTIONAL_LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze(["what-investors-said"]);

export interface LandingBlockFlags {
  /** A member (non-owner) never sees block 3 (§B.4). */
  isMember?: boolean;
  /** A feedback letter exists for the founder → block 6 is appended. */
  hasFeedbackLetter?: boolean;
}

/** The blocks the landing renders for this session, in order. */
export function landingBlocksFor(flags: LandingBlockFlags = {}): LandingBlockName[] {
  const base = flags.isMember ? LANDING_BLOCKS.filter((b) => b !== "money-on-the-table") : [...LANDING_BLOCKS];
  return flags.hasFeedbackLetter ? [...base, "what-investors-said"] : base;
}
