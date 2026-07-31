// resolve-promo.ts — server-side lookup of a reseller promotion code.
//
// Single call site for the promotion-code lookup so every route (stripe
// checkout, reports checkout, admin console, sub-K4 wiring) uses the same
// case-insensitive normalisation, the same active-flags check, the same
// join to the reseller row for the slug/display name, and the same 60s
// in-memory cache. This deliberately lives beside attribution.ts so future
// routes never re-implement the query and drift on the check semantics.
//
// Returns null on any miss — unknown code, inactive code, inactive
// reseller, promotion code without a Stripe promotion_code_id (not yet
// synced by scripts/reseller/create-promo-codes.mjs), or hit against
// max_redemptions.
//
// See K3 of the reseller-promo v3 upgrade sub-tasks.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "./attribution";

export interface ResolvedPromo {
  resellerId: string;
  resellerCode: string; // resellers.code (e.g. INFOVISION)
  resellerSlug: string; // alias for resellerCode — matches K3 spec shape
  resellerDisplayName: string;
  discountPct: number; // 0, 10, 20, 30, or 40
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  code: string; // customer-typed code, normalised uppercase
  promoRowId: string; // reseller_promotion_codes.id — needed to atomically UPDATE redemption_count
}

interface CacheEntry {
  at: number;
  value: ResolvedPromo | null;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Test-only — clears the memo cache between test cases. */
export function __resetPromoCache(): void {
  cache.clear();
}

/**
 * Look up a reseller promotion code by its customer-typed value.
 *
 * The lookup is case-insensitive: the incoming code is uppercased and
 * stripped of non-alphanumerics (matching normaliseResellerCode / how the
 * DB stores it). Returns null for every miss so callers can 400 or
 * silently proceed depending on context.
 *
 * @param code    raw user-typed code (any case, may include padding)
 * @param client  optional Supabase admin client — the default resolves via
 *                getSupabaseAdmin(). Injected in tests so the pure lookup
 *                logic can be exercised without a live DB.
 */
export async function resolvePromoCode(
  code: string | null | undefined,
  client?: SupabaseClient | null,
): Promise<ResolvedPromo | null> {
  const normalised = normaliseResellerCode(code);
  if (!normalised) return null;

  const now = Date.now();
  const cached = cache.get(normalised);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  const supabase = client ?? getSupabaseAdmin();
  if (!supabase) return null;

  const { data: promo, error } = await supabase
    .from("reseller_promotion_codes")
    .select(
      "id, reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active, max_redemptions, redemption_count",
    )
    .eq("code", normalised)
    .eq("active", true)
    .maybeSingle();

  if (error || !promo) {
    cache.set(normalised, { at: now, value: null });
    return null;
  }

  // Enforce max_redemptions server-side when set. Stripe also enforces it,
  // but we do the check here so callers get a clean "expired" response
  // without a Stripe round-trip.
  if (
    typeof promo.max_redemptions === "number" &&
    promo.max_redemptions > 0 &&
    typeof promo.redemption_count === "number" &&
    promo.redemption_count >= promo.max_redemptions
  ) {
    cache.set(normalised, { at: now, value: null });
    return null;
  }

  // Tiers > 0 need a real Stripe promotion_code id to actually apply a
  // discount at Checkout. Rows still holding pending_* placeholders (the
  // provisioning script has not run yet) must not be surfaced as valid.
  if (promo.tier_pct > 0) {
    const pid = promo.stripe_promotion_code_id as string | null;
    if (!pid || pid.startsWith("promo_pending_")) {
      cache.set(normalised, { at: now, value: null });
      return null;
    }
  }

  const { data: reseller, error: resellerError } = await supabase
    .from("resellers")
    .select("id, code, display_name, status")
    .eq("id", promo.reseller_id)
    .maybeSingle();

  if (resellerError || !reseller || reseller.status !== "active") {
    cache.set(normalised, { at: now, value: null });
    return null;
  }

  const resolved: ResolvedPromo = {
    resellerId: promo.reseller_id as string,
    resellerCode: reseller.code as string,
    resellerSlug: reseller.code as string,
    resellerDisplayName: (reseller.display_name as string) ?? (reseller.code as string),
    discountPct: promo.tier_pct as number,
    stripeCouponId: (promo.stripe_coupon_id as string | null) ?? null,
    stripePromotionCodeId: (promo.stripe_promotion_code_id as string | null) ?? null,
    code: promo.code as string,
    promoRowId: promo.id as string,
  };

  cache.set(normalised, { at: now, value: resolved });
  return resolved;
}
