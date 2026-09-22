// Server-safe helpers for the /pricing Founder | Evaluator | Programs switch.
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

// Pricing v4 (2026-09-16, plan §3.2): a third tab, Programs, sells the
// annual-first cohort ladder (Intake link / Cohort 25 / Cohort 100).
export type PricingTab = "founder" | "evaluator" | "programs";

export const PRICING_TABS: readonly PricingTab[] = ["founder", "evaluator", "programs"];

/** Map the three public tabs onto the plans-v2 catalogue segments. */
export const TAB_TO_SEGMENT: Record<PricingTab, Segment> = {
  founder: "founder",
  evaluator: "investor",
  programs: "accelerator",
};

/**
 * Resolve a `?segment=` / `?persona=` / `?tab=` / legacy `?tier=` query
 * value to a tab. Investor-shaped values (investor, advisor, fund, vc,
 * evaluator) land on Evaluator; program-shaped values (accelerator,
 * program, incubator, university) land on Programs; everything else —
 * including nothing — uses the Evaluator default. Explicit Founder links remain Founder.
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
    case "fund":
    case "funds":
    case "vc":
      return "evaluator";
    case "programs":
    case "program":
    case "programme":
    case "programmes":
    case "accelerator":
    case "accelerators":
    case "incubator":
    case "incubators":
    case "university":
    case "universities":
    case "cohort":
      return "programs";
    case "free":
    case "starter":
    case "growth":
    case "pro":
    case "startup":
    case "founder_free":
    case "founder_starter":
    case "founder_growth":
    case "founder":
    case "founders":
      return "founder";
    default:
      return "evaluator";
  }
}

/** Keep copyable tab URLs deterministic after switching away from a legacy alias. */
export function pricingTabSearch(search: string, tab: PricingTab): string {
 const params = new URLSearchParams(search);
 for (const key of ["segment", "persona", "tab", "tier"]) params.delete(key);
 if (tab !== "evaluator") params.set("segment", tab);
 return params.toString();
}
