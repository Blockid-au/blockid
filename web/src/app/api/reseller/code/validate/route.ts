// POST /api/reseller/code/validate — validate a reseller code and return
// the display metadata the onboarding UI needs to render the pill and
// consent modal.
//
// Per docs/plans/reseller-module-plan.md § C.2 (redemption UX). Public
// endpoint — no auth required, since the code is applied pre-signup.
//
// Response shape:
//   { ok: true, reseller: {code, display_name, logo_url, primary_color,
//                          billing_model},
//              tier_pct, promotion_code_id_present: boolean }
//   { ok: false, reason: "invalid" | "inactive" | "not_configured" }
//
// The `stripe_promotion_code_id` itself is NEVER returned to the client —
// the checkout server route looks it up when creating the Session. This
// prevents brute-force enumeration of promotion codes from public traffic.
//
// r-01-exempt: public unauthenticated promotion-code lookup; no viewer identity exists to scope on and the response is redacted (no stripe_promotion_code_id, no reseller_id).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";

export const dynamic = "force-dynamic";

interface ValidateBody {
  code?: string;
}

export async function POST(req: Request) {
  let body: ValidateBody = {};
  try {
    body = (await req.json()) as ValidateBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" as const }, { status: 400 });
  }

  const code = normaliseResellerCode(body.code);
  if (!code) {
    return NextResponse.json({ ok: false, reason: "invalid" as const }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" as const }, { status: 503 });
  }

  // Look up the promotion code (case-insensitive lookup already handled by
  // uppercase normalisation above).
  const { data: promo, error: promoErr } = await supabase
    .from("reseller_promotion_codes")
    .select("id, tier_pct, code, stripe_promotion_code_id, active, reseller_id")
    .eq("code", code)
    .maybeSingle();

  if (promoErr) {
    // Silent — do not leak DB errors.
    return NextResponse.json({ ok: false, reason: "not_configured" as const }, { status: 503 });
  }

  if (!promo || !promo.active) {
    return NextResponse.json({ ok: false, reason: "invalid" as const }, { status: 404 });
  }

  // Fetch reseller org for display fields.
  const { data: reseller } = await supabase
    .from("resellers")
    .select("id, code, display_name, logo_url, primary_color, billing_model, status")
    .eq("id", promo.reseller_id)
    .maybeSingle();

  if (!reseller || reseller.status !== "active") {
    return NextResponse.json({ ok: false, reason: "inactive" as const }, { status: 404 });
  }

  return NextResponse.json({
    ok: true as const,
    tier_pct: promo.tier_pct,
    promotion_code_id_present: promo.stripe_promotion_code_id !== null,
    reseller: {
      code: reseller.code,
      display_name: reseller.display_name,
      logo_url: reseller.logo_url,
      primary_color: reseller.primary_color,
      billing_model: reseller.billing_model,
    },
  });
}
