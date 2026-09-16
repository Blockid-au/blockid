// Server helper: which plan ids can actually be billed annually.
//
// Reads the plans table (60 s cached) and returns the ids whose row carries
// `stripe_price_id_annual` + a positive annual price. Pricing surfaces pass
// the list to <PricingMatrix annualAvailable> so the Annual toggle only
// promises a yearly figure checkout can charge (2026-09-16 audit).

import { getPlansCached } from "@/lib/plans-db";

export async function annualAvailablePlanIds(): Promise<string[]> {
  try {
    const plans = await getPlansCached();
    return plans
      .filter((p) => Boolean(p.stripe_price_id_annual) && p.annual_price_aud_cents > 0)
      .map((p) => p.id);
  } catch {
    // No DB → promise nothing annual rather than something unbillable.
    return [];
  }
}

/**
 * Plan ids that can actually be bought today — a monthly Stripe price is
 * provisioned on the `plans` row. Cards for any other plan must render
 * "Contact sales": the trial CTA led to `/signup` with a disabled option and
 * a 500 `plan_not_provisioned` (W4 review P1: Fund / Intake link before the
 * founder mints STRIPE_PRICE_INVESTOR_FUND / STRIPE_PRICE_ACCEL_INTAKE).
 * Returns `undefined` when the DB is unreachable so the caller keeps the
 * catalogue's own `cta_kind` (never blanket-disables checkout on a DB blip).
 */
export async function purchasablePlanIds(): Promise<string[] | undefined> {
  try {
    const plans = await getPlansCached();
    return plans.filter((p) => Boolean(p.stripe_price_id)).map((p) => p.id);
  } catch {
    return undefined;
  }
}
