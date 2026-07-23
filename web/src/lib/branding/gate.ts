// Pure gate for the PDF branding customisation surface.
//
// The paid tiers that may customise PDF branding are the founder Growth,
// Scale, and Enterprise plans (plus the annual Growth variant). Free /
// Starter / Founding-50 remain locked and see the upsell CTA. Investor /
// accelerator segments have their own gate posture and are handled outside
// this helper — see docs/plans/reseller-module-plan.md § F.
//
// This module is deliberately dependency-free so it can run in the client
// bundle, in Vitest without mocking, and in the report renderer when the
// wire-in ships. Compare it with `can(user, "pdf_branding")` on the server
// side — the entitlements engine is the authority; this helper is the
// hard-coded fallback for surfaces that only see a plan code.

export const PDF_BRANDING_PLANS = Object.freeze<readonly string[]>([
  // Legacy plan codes (the ones stored on user rows today).
  "growth",
  "growth_annual",
  "scale",
  "enterprise",
  // Canonical v2 plan IDs from 0074_plans_matrix.sql.
  "founder_growth",
  "founder_scale",
  "founder_enterprise",
]);

/** True when the plan code grants the PDF branding customisation surface. */
export function canUsePdfBranding(planCode: string | null | undefined): boolean {
  if (!planCode) return false;
  return PDF_BRANDING_PLANS.includes(planCode);
}
