// GET /api/cron/reseller-stripe-sync
//
// Weekly reconciliation of reseller_promotion_codes against Stripe's
// promotion_codes + coupons catalogue. Per docs/plans/reseller-module-plan.md
// § D.5 (weekly `reseller-stripe-sync`).
//
// Behaviour:
//   1. Load every active `reseller_promotion_codes` row whose
//      `stripe_promotion_code_id` is not null.
//   2. For each, hit `stripe.promotionCodes.retrieve` and assert `active=true`.
//   3. Distinct `stripe_coupon_id` values are additionally verified via
//      `stripe.coupons.retrieve` — a missing coupon is drift too.
//   4. Any drift produces one email to `admin@blockid.au` and is returned in
//      the JSON summary. No DB mutation is performed — flipping `active` is
//      an admin decision.
//
// Auth: shared CRON_SECRET pattern used by every existing cron endpoint.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import { formatDriftEmail, type StripeDriftRow } from "@/lib/reseller/reconciliation";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

interface CodeRow {
  id: string;
  code: string;
  tier_pct: number;
  active: boolean;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  resellers: { code: string } | { code: string }[] | null;
}

function resellerCodeOf(row: CodeRow): string {
  if (!row.resellers) return "unknown";
  if (Array.isArray(row.resellers)) return row.resellers[0]?.code ?? "unknown";
  return row.resellers.code ?? "unknown";
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, reason: "stripe_not_configured" }, { status: 503 });
  }

  const runAt = new Date().toISOString();

  const { data: codes, error: codesErr } = await supabase
    .from("reseller_promotion_codes")
    .select(
      "id, code, tier_pct, active, stripe_coupon_id, stripe_promotion_code_id, resellers(code)",
    )
    .eq("active", true)
    .not("stripe_promotion_code_id", "is", null);

  if (codesErr) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: codesErr.message },
      { status: 500 },
    );
  }

  const rows = (codes ?? []) as unknown as CodeRow[];
  const drift: StripeDriftRow[] = [];
  let checkedPromotionCodes = 0;
  const checkedCouponIds = new Set<string>();

  for (const row of rows) {
    const promoId = row.stripe_promotion_code_id;
    if (!promoId) continue;
    checkedPromotionCodes++;
    try {
      const promo = await stripe.promotionCodes.retrieve(promoId);
      if (!promo.active) {
        drift.push({
          code: row.code,
          reseller_code: resellerCodeOf(row),
          tier_pct: row.tier_pct,
          stripe_promotion_code_id: promoId,
          reason: "inactive_in_stripe",
        });
      }
    } catch (e) {
      drift.push({
        code: row.code,
        reseller_code: resellerCodeOf(row),
        tier_pct: row.tier_pct,
        stripe_promotion_code_id: promoId,
        reason: `not_found: ${(e as Error).message.slice(0, 120)}`,
      });
    }
  }

  // Coupon check — dedupe across codes, since the same coupon (e.g. shared
  // 20% off) is often reused across multiple promotion codes.
  for (const row of rows) {
    const couponId = row.stripe_coupon_id;
    if (!couponId || checkedCouponIds.has(couponId)) continue;
    checkedCouponIds.add(couponId);
    try {
      const coupon = await stripe.coupons.retrieve(couponId);
      if (coupon.deleted || coupon.valid === false) {
        drift.push({
          code: row.code,
          reseller_code: resellerCodeOf(row),
          tier_pct: row.tier_pct,
          stripe_promotion_code_id: row.stripe_promotion_code_id ?? "",
          reason: `coupon_invalid: ${couponId}`,
        });
      }
    } catch (e) {
      drift.push({
        code: row.code,
        reseller_code: resellerCodeOf(row),
        tier_pct: row.tier_pct,
        stripe_promotion_code_id: row.stripe_promotion_code_id ?? "",
        reason: `coupon_not_found: ${couponId} (${(e as Error).message.slice(0, 80)})`,
      });
    }
  }

  if (drift.length > 0) {
    const html = formatDriftEmail(drift, runAt);
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller promo-code drift — ${drift.length} affected`,
      html,
    }).catch((e) => {
      console.error("[reseller-stripe-sync] alert email failed", e);
    });
  }

  return NextResponse.json({
    ok: true,
    ran_at: runAt,
    checked_promotion_codes: checkedPromotionCodes,
    checked_coupons: checkedCouponIds.size,
    drift_count: drift.length,
    drift,
  });
}
