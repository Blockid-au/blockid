// Pure builders for reseller code-request approval (P9.3 follow-up item #6).
//
// When an admin approves a reseller_requests row of type `code_request`, we
// need to mint the customer-facing promotion code deterministically. For
// tier > 0 that means a Stripe coupon + promotion_code pair; for tier 0 the
// row is attribution-only and no Stripe objects exist (enforced by
// reseller_promotion_codes.ck_stripe_objects_by_tier).
//
// This module keeps the naming rules + Stripe-spec composition dependency-
// free so the PATCH route in
// web/src/app/api/admin/resellers/requests/[id]/route.ts can unit-test the
// shape without hitting Stripe/Supabase.

import { normaliseResellerCode } from "./attribution";

const CODE_MAX_LEN = 40;
const ALLOWED_TIERS = new Set([0, 10, 20, 30, 40]);
const SUFFIX_RE = /^[A-Z0-9]{1,16}$/;

export interface BuildPromoCodeNameInput {
  resellerCode: string;
  tierPct: number;
  suggestedSuffix?: string | null;
}

export type PromoCodeNameError =
  | "reseller_code_required"
  | "invalid_tier_pct"
  | "suffix_bad_format";

export type PromoCodeNameResult =
  | { ok: true; code: string }
  | { ok: false; reason: PromoCodeNameError };

/**
 * Build the customer-facing promotion code text. Uppercase, alphanumeric,
 * capped at 40 chars. Defaults to `<RESELLERCODE><tier>` (e.g. INFOVISION20).
 * A tier-0 attribution-only code with no suffix falls back to `<RESELLERCODE>`
 * itself since "INFOVISION0" would read as a discount to users.
 */
export function buildPromoCodeName(input: BuildPromoCodeNameInput): PromoCodeNameResult {
  const reseller = normaliseResellerCode(input.resellerCode);
  if (!reseller) return { ok: false, reason: "reseller_code_required" };
  if (!ALLOWED_TIERS.has(input.tierPct)) {
    return { ok: false, reason: "invalid_tier_pct" };
  }
  let suffix: string | null = null;
  if (input.suggestedSuffix != null && input.suggestedSuffix !== "") {
    const s = String(input.suggestedSuffix).trim().toUpperCase();
    if (!SUFFIX_RE.test(s)) return { ok: false, reason: "suffix_bad_format" };
    suffix = s;
  } else if (input.tierPct > 0) {
    suffix = String(input.tierPct);
  }
  const raw = suffix ? `${reseller}${suffix}` : reseller;
  const code = raw.slice(0, CODE_MAX_LEN);
  return { ok: true, code };
}

export interface StripeCouponSpec {
  id: string;
  percent_off: number;
  duration: "forever";
  metadata: Record<string, string>;
}

export interface BuildStripeCouponSpecInput {
  resellerId: string;
  resellerCode: string;
  tierPct: number;
}

/**
 * Deterministic Stripe coupon spec keyed on (reseller_id, tier). Re-approving
 * the same code_request row (or an accidental double-tap) mints the same
 * coupon id — Stripe returns 409/idempotent create — so we never end up with
 * two coupons for the same commission tier under one reseller.
 *
 * Duration is `forever` per H.1 (reseller discount stays for lifetime of the
 * subscription).
 */
export function buildStripeCouponSpec(
  input: BuildStripeCouponSpecInput,
): StripeCouponSpec | null {
  if (!ALLOWED_TIERS.has(input.tierPct)) return null;
  if (input.tierPct === 0) return null;
  const reseller = normaliseResellerCode(input.resellerCode);
  if (!reseller) return null;
  const uuidPrefix = input.resellerId.replace(/-/g, "").slice(0, 8);
  if (!uuidPrefix) return null;
  return {
    id: `res_${uuidPrefix}_t${input.tierPct}`,
    percent_off: input.tierPct,
    duration: "forever",
    metadata: {
      reseller_id: input.resellerId,
      reseller_code: reseller,
      tier_pct: String(input.tierPct),
      source: "reseller_module_p9.3",
    },
  };
}

export interface StripePromotionCodeSpec {
  promotion: { coupon: string; type: "coupon" };
  code: string;
  metadata: Record<string, string>;
}

export interface BuildStripePromotionCodeSpecInput {
  couponId: string;
  code: string;
  resellerId: string;
  resellerRequestId: string;
}

/**
 * The visible promotion_code the customer types at checkout. `code` MUST
 * match reseller_promotion_codes.code so cron/reseller-stripe-sync can
 * reconcile. Stripe wraps the coupon in `promotion: {coupon, type}` per the
 * pinned SDK shape.
 */
export function buildStripePromotionCodeSpec(
  input: BuildStripePromotionCodeSpecInput,
): StripePromotionCodeSpec {
  return {
    promotion: { coupon: input.couponId, type: "coupon" },
    code: input.code,
    metadata: {
      reseller_id: input.resellerId,
      reseller_request_id: input.resellerRequestId,
      source: "reseller_module_p9.3",
    },
  };
}

export interface DecideCodeMintInput {
  reseller: { id: string; code: string };
  tierPct: number;
  suggestedSuffix?: string | null;
  resellerRequestId: string;
}

export type DecideCodeMintError = PromoCodeNameError;

export type DecideCodeMintPlan =
  | {
      kind: "attribution_only";
      code: string;
      row: {
        reseller_id: string;
        tier_pct: number;
        code: string;
        stripe_coupon_id: null;
        stripe_promotion_code_id: null;
        active: true;
      };
    }
  | {
      kind: "stripe_mint";
      code: string;
      coupon: StripeCouponSpec;
      promotionCode: StripePromotionCodeSpec;
      row: {
        reseller_id: string;
        tier_pct: number;
        code: string;
        active: true;
        // stripe_coupon_id + stripe_promotion_code_id filled after Stripe call
      };
    };

export type DecideCodeMintResult =
  | { ok: true; plan: DecideCodeMintPlan }
  | { ok: false; reason: DecideCodeMintError };

/**
 * Compose the full mint plan for the PATCH approval route. The route feeds
 * the plan into Stripe (when kind='stripe_mint') and then INSERTs into
 * reseller_promotion_codes with the returned IDs. Tier 0 skips Stripe.
 */
export function decideCodeMint(input: DecideCodeMintInput): DecideCodeMintResult {
  const name = buildPromoCodeName({
    resellerCode: input.reseller.code,
    tierPct: input.tierPct,
    suggestedSuffix: input.suggestedSuffix ?? null,
  });
  if (!name.ok) return { ok: false, reason: name.reason };

  if (input.tierPct === 0) {
    return {
      ok: true,
      plan: {
        kind: "attribution_only",
        code: name.code,
        row: {
          reseller_id: input.reseller.id,
          tier_pct: 0,
          code: name.code,
          stripe_coupon_id: null,
          stripe_promotion_code_id: null,
          active: true,
        },
      },
    };
  }

  const coupon = buildStripeCouponSpec({
    resellerId: input.reseller.id,
    resellerCode: input.reseller.code,
    tierPct: input.tierPct,
  });
  if (!coupon) return { ok: false, reason: "invalid_tier_pct" };

  const promotionCode = buildStripePromotionCodeSpec({
    couponId: coupon.id,
    code: name.code,
    resellerId: input.reseller.id,
    resellerRequestId: input.resellerRequestId,
  });

  return {
    ok: true,
    plan: {
      kind: "stripe_mint",
      code: name.code,
      coupon,
      promotionCode,
      row: {
        reseller_id: input.reseller.id,
        tier_pct: input.tierPct,
        code: name.code,
        active: true,
      },
    },
  };
}
