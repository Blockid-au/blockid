import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlanPrice, getPlan, buildPlansFromConfig } from "@/lib/plans";
import { getPlatformConfig } from "@/lib/platform-config";

// POST /api/coupon/redeem
// Body: { code, plan }
// Requires: authenticated user (session cookie).

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { code, plan: planId } =
    (body as { code?: string; plan?: string }) ?? {};

  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json(
      { ok: false, reason: "Coupon code is required" },
      { status: 400 },
    );
  }
  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "Plan ID is required" },
      { status: 400 },
    );
  }

  const [cfg] = await Promise.all([getPlatformConfig()]);
  const plans = buildPlansFromConfig(cfg);
  const plan = getPlan(planId, plans);
  if (!plan) {
    return NextResponse.json(
      { ok: false, reason: "Unknown plan" },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Service unavailable" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const normalisedCode = code.trim().toUpperCase();

  // Re-validate coupon server-side.
  const { data: coupon, error: couponErr } = await supabase
    .from("coupons")
    .select("code, discount_pct, active, valid_until, max_uses, current_uses")
    .eq("code", normalisedCode)
    .maybeSingle();

  if (couponErr) {
    console.error("[blockid:coupon] coupons read failed", couponErr);
    return NextResponse.json(
      { ok: false, reason: "Database error" },
      { status: 500 },
    );
  }

  if (!coupon) {
    return NextResponse.json({ ok: false, reason: "Coupon not found" });
  }

  if (!coupon.active) {
    return NextResponse.json({
      ok: false,
      reason: "Coupon is no longer active",
    });
  }

  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, reason: "Coupon has expired" });
  }

  // Check if user already redeemed this coupon.
  const { data: existing } = await supabase
    .from("coupon_redemptions")
    .select("id")
    .eq("coupon_code", normalisedCode)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: false,
      reason: "You have already redeemed this coupon",
    });
  }

  // Atomic increment — only succeeds if coupon is still under max_uses
  const { data: updatedCoupon, error: incErr } = await supabase
    .from("coupons")
    .update({ current_uses: (coupon.current_uses ?? 0) + 1 })
    .eq("code", normalisedCode)
    .or(`max_uses.is.null,current_uses.lt.${coupon.max_uses ?? 999999}`)
    .select("current_uses")
    .maybeSingle();

  if (incErr || !updatedCoupon) {
    return NextResponse.json({
      ok: false,
      reason: "Coupon has reached its usage limit",
    });
  }

  // Calculate pricing using config-derived prices.
  const pricing = getPlanPrice(planId, coupon.discount_pct, plans);
  const originalCents = pricing?.original ?? 0;
  const discountedCents = pricing?.discounted ?? 0;

  // Record redemption.
  const { error: redeemErr } = await supabase
    .from("coupon_redemptions")
    .insert({
      coupon_code: normalisedCode,
      user_id: user.id,
      plan: planId,
      original_price_aud: originalCents,
      discounted_price_aud: discountedCents,
    });

  if (redeemErr) {
    console.error("[blockid:coupon] redemption insert failed", redeemErr);
    return NextResponse.json(
      { ok: false, reason: "Database error" },
      { status: 500 },
    );
  }

  // Update user plan.
  const { error: updateErr } = await supabase
    .from("app_users")
    .update({
      plan: planId,
      coupon_code: normalisedCode,
      discount_pct: coupon.discount_pct,
      plan_started_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateErr) {
    console.error("[blockid:coupon] user update failed", updateErr);
    return NextResponse.json(
      { ok: false, reason: "Database error" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    plan: planId,
    originalPrice: originalCents,
    discountedPrice: discountedCents,
  });
}

export const dynamic = "force-dynamic";
