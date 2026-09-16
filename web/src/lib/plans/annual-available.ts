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
