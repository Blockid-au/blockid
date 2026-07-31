// Canonical reseller promotion-code helpers.
//
// One place that names the tier ladder and the (prefix → codes) mapping so
// the provisioning script, the resolver, the admin console, and future
// reports never drift on the same conventions.
//
// Design decisions:
//   - Tier 0 uses the bare prefix ("IFV"); tiers 10-40 append their integer
//     percent ("IFV10", "IFV20", "IFV30", "IFV40"). This mirrors the existing
//     InfoVision convention (INFOVISION / INFOVISION20 / INFOVISION40 from
//     migration 0106) and is the shape founders type into Stripe Checkout.
//   - Codes are always uppercase in storage (matches normaliseResellerCode).
//   - The ladder is frozen: [0, 10, 20, 30, 40]. If a new tier is ever
//     introduced the DB CHECK constraint on reseller_promotion_codes.tier_pct
//     (migration 0091) has to be widened at the same time.
//
// See docs/plans/reseller-module-plan.md § C.2 and the K2/K3 sub-tasks of
// the v3 upgrade.

export const PROMO_TIER_LADDER = [0, 10, 20, 30, 40] as const;
export type PromoTier = (typeof PROMO_TIER_LADDER)[number];

export interface PromoCodeSpec {
  tier: PromoTier;
  code: string;
}

/** Uppercase, strip non-alphanumeric — matches normaliseResellerCode(). */
function normalisePrefix(raw: string): string {
  const cleaned = String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) throw new Error("codesForPrefix: prefix must be non-empty alphanumeric");
  return cleaned;
}

/**
 * Build the full 5-tier ladder of promotion codes for a reseller prefix.
 *
 *   codesForPrefix("ifv") →
 *     [{tier:0,code:"IFV"},{tier:10,code:"IFV10"}, ... {tier:40,code:"IFV40"}]
 */
export function codesForPrefix(prefix: string): PromoCodeSpec[] {
  const clean = normalisePrefix(prefix);
  return PROMO_TIER_LADDER.map((tier) => ({
    tier,
    code: tier === 0 ? clean : `${clean}${tier}`,
  }));
}
