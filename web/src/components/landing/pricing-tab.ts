// Server-safe helpers for the /pricing Founder | Evaluator switch.
//
// Why a separate file: `pricing-segment-switch.tsx` is a "use client" module.
// Next.js turns every export of a client module into a client reference, so
// calling `resolvePricingTab()` from the server page threw
// "Attempted to call resolvePricingTab() from the server but resolvePricingTab
// is on the client" and /pricing rendered the marketing error boundary
// (caught by deploy Gate 12 on 2026-09-10, release aJYtQWRVfzGBpuNE8ZcVi,
// rolled back). Pure helpers live here; the client component re-exports them
// for its tests.
import type { Segment } from "@/lib/plans-v2";

export type PricingTab = "founder" | "evaluator";

/** Map the two public tabs onto the plans-v2 catalogue segments. */
export const TAB_TO_SEGMENT: Record<PricingTab, Segment> = {
  founder: "founder",
  evaluator: "investor",
};

/**
 * Resolve a `?segment=` / `?tab=` / legacy `?tier=` query value to a tab.
 * Anything evaluator-shaped (investor, advisor, accelerator, evaluator)
 * lands on Evaluator; everything else — including nothing — is Founder.
 */
export function resolvePricingTab(
  raw: string | string[] | null | undefined,
): PricingTab {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase().trim();
  switch (v) {
    case "evaluator":
    case "evaluators":
    case "investor":
    case "investors":
    case "advisor":
    case "advisors":
    case "accelerator":
    case "accelerators":
    case "program":
      return "evaluator";
    default:
      return "founder";
  }
}
