import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getReferralCode, getReferralUrl } from "@/lib/referrals";
import { grantCredits } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const REFERRAL_CREDITS = 2;

// ---------------------------------------------------------------------------
// GET /api/referral — get logged-in user's referral code + stats
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable" },
      { status: 503 },
    );
  }

  // Ensure user has a referral code (lazy-generate if missing).
  const code = await getReferralCode(user.id);
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Could not generate referral code" },
      { status: 500 },
    );
  }

  const link = getReferralUrl(code);

  // Count referrals by status from the referrals table.
  const [pendingRes, signedUpRes, convertedRes, creditsRes] = await Promise.all(
    [
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("status", "pending"),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("status", "signed_up"),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("status", "converted"),
      supabase
        .from("referrals")
        .select("credits_awarded")
        .eq("referrer_id", user.id),
    ],
  );

  const creditsEarned = (creditsRes.data ?? []).reduce(
    (sum: number, r: { credits_awarded: number }) => sum + r.credits_awarded,
    0,
  );

  // Also include legacy referral_events stats for completeness.
  const { data: legacyUser } = await supabase
    .from("app_users")
    .select("referral_credits_earned")
    .eq("id", user.id)
    .single();

  const totalCreditsEarned =
    creditsEarned + ((legacyUser?.referral_credits_earned as number) ?? 0);

  // Legacy referral_events count (from the v1 system).
  const { count: legacyCount } = await supabase
    .from("referral_events")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", user.id);

  return NextResponse.json({
    ok: true,
    code,
    link,
    stats: {
      pending: pendingRes.count ?? 0,
      signedUp: (signedUpRes.count ?? 0) + (legacyCount ?? 0),
      converted: convertedRes.count ?? 0,
      creditsEarned: totalCreditsEarned,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/referral — record a referral signup
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { referralCode, email } = (body as {
    referralCode?: string;
    email?: string;
  }) ?? {};

  if (!referralCode || typeof referralCode !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing referralCode" },
      { status: 400 },
    );
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing email" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable" },
      { status: 503 },
    );
  }

  // Find the referrer by referral code.
  const { data: referrer } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("referral_code", referralCode)
    .maybeSingle();

  if (!referrer) {
    return NextResponse.json(
      { ok: false, error: "Invalid referral code" },
      { status: 404 },
    );
  }

  const normEmail = email.trim().toLowerCase();

  // Don't allow self-referral.
  if ((referrer.email as string).toLowerCase() === normEmail) {
    return NextResponse.json(
      { ok: false, error: "Cannot refer yourself" },
      { status: 400 },
    );
  }

  // Check if this email was already referred.
  const { data: existing } = await supabase
    .from("referrals")
    .select("id")
    .eq("referred_email", normEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Email already referred" },
      { status: 409 },
    );
  }

  // Create referral record with status signed_up.
  const { error: insertErr } = await supabase.from("referrals").insert({
    referrer_id: referrer.id,
    referrer_email: referrer.email,
    referred_email: normEmail,
    referral_code: referralCode,
    status: "signed_up",
    credits_awarded: REFERRAL_CREDITS,
  });

  if (insertErr) {
    console.error("[blockid:referral] insert failed", insertErr);
    return NextResponse.json(
      { ok: false, error: "Failed to record referral" },
      { status: 500 },
    );
  }

  // Award credits to referrer.
  await grantCredits(referrer.id, REFERRAL_CREDITS, "referral_bonus", {
    referred_email: normEmail,
  });

  return NextResponse.json({ ok: true, creditsAwarded: REFERRAL_CREDITS });
}
