import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/coupon/validate
// Body: { code }
// Returns: { ok, discount_pct, description } or { ok: false, reason }
//
// Validates that a coupon exists, is active, not expired, and under max_uses.
// Does NOT require authentication — validation is informational.

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { code } = (body as { code?: string }) ?? {};
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json(
      { ok: false, reason: "Coupon code is required" },
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

  // Look up the coupon.
  const { data: coupon, error: couponErr } = await supabase
    .from("coupons")
    .select("code, discount_pct, description, active, valid_until, max_uses, current_uses")
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
    return NextResponse.json({ ok: false, reason: "Coupon is no longer active" });
  }

  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, reason: "Coupon has expired" });
  }

  if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
    return NextResponse.json({
      ok: false,
      reason: "Coupon has reached its usage limit",
    });
  }

  return NextResponse.json({
    ok: true,
    discount_pct: coupon.discount_pct,
    description: coupon.description ?? null,
  });
}

export const dynamic = "force-dynamic";
