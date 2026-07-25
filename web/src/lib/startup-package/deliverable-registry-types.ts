// Startup Package — types split out of deliverable-registry.ts so the
// registry itself has no runtime dependency on `lib/credits.ts` (server-only).
//
// FEATURE_COSTS keys used by the Package auto-fill flow. Kept as a union
// so the registry stays type-safe without pulling in the whole credits
// module (which is `"server-only"`).

export type FeatureCostKey =
  | "pitch_deck"
  | "svi_report"
  | "valuation_detailed"
  | "term_sheet"
  | "full_report_standard"
  | "full_report_premium";

/**
 * Client-safe default credit costs for the Package deliverables.
 *
 * Mirrors `FEATURE_COSTS` in `lib/credits.ts` (which is `"server-only"`).
 * The server still uses the canonical map — this snapshot is only for
 * pre-flight display in client components. Kept intentionally short so
 * drift is obvious in code review.
 */
export const PACKAGE_FEATURE_COST_DEFAULTS: Record<FeatureCostKey, number> = {
  pitch_deck: 1.0,
  svi_report: 0.5,
  valuation_detailed: 0.5,
  term_sheet: 1.0,
  full_report_standard: 2.0,
  full_report_premium: 5.0,
};
