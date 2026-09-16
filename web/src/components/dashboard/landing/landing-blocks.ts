// Founder landing block catalogue (§B.1) — a plain module so BOTH server
// components (dashboard/page.tsx) and the client tracker can import it.
export type LandingBlockName = "where-you-stand" | "next-best-action" | "money-on-the-table" | "evidence-to-add" | "your-reports";

export const LANDING_BLOCKS: readonly LandingBlockName[] = Object.freeze([
  "where-you-stand",
  "next-best-action",
  "money-on-the-table",
  "evidence-to-add",
  "your-reports",
]);
