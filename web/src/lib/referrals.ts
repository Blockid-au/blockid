import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { grantCredits } from "./credits";

const REFERRAL_CREDITS = 2;

// ---------------------------------------------------------------------------
// Get user's referral code (auto-generated on signup via migration trigger,
// or lazily populated here if somehow missing).
// ---------------------------------------------------------------------------

export async function getReferralCode(
  userId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("app_users")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (data?.referral_code) return data.referral_code as string;

  // Lazily generate if missing (shouldn't happen after migration, but safe).
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const { error } = await supabase
    .from("app_users")
    .update({ referral_code: code })
    .eq("id", userId);

  if (error) {
    console.error("[blockid:referrals] lazy code generation failed", error);
    return null;
  }
  return code;
}

// ---------------------------------------------------------------------------
// Build the referral URL from a code.
// ---------------------------------------------------------------------------

export function getReferralUrl(code: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"}/?ref=${code}`;
}

// ---------------------------------------------------------------------------
// Process a referral (called during signup when ?ref= param exists).
//
//   1. Find referrer by referral_code
//   2. Set referred_by on new user
//   3. Grant credits to referrer
//   4. Log referral event
//   5. Return success
// ---------------------------------------------------------------------------

export async function processReferral(
  newUserId: string,
  referralCode: string,
): Promise<{ ok: boolean; referrerEmail?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false };

  // 1. Find referrer
  const { data: referrer } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("referral_code", referralCode)
    .maybeSingle();

  if (!referrer) return { ok: false };

  // Don't allow self-referral
  if (referrer.id === newUserId) return { ok: false };

  // 2. Set referred_by on new user
  const { error: updateErr } = await supabase
    .from("app_users")
    .update({ referred_by: referrer.id })
    .eq("id", newUserId)
    .is("referred_by", null); // only set once

  if (updateErr) {
    console.error("[blockid:referrals] set referred_by failed", updateErr);
    return { ok: false };
  }

  // 3. Grant credits to referrer
  await grantCredits(referrer.id, REFERRAL_CREDITS, "referral_bonus", {
    referred_user_id: newUserId,
  });

  // Update referral_credits_earned counter
  const { data: referrerRow } = await supabase
    .from("app_users")
    .select("referral_credits_earned")
    .eq("id", referrer.id)
    .single();

  const currentEarned = (referrerRow?.referral_credits_earned as number) ?? 0;
  await supabase
    .from("app_users")
    .update({ referral_credits_earned: currentEarned + REFERRAL_CREDITS })
    .eq("id", referrer.id);

  // 4. Log referral event
  const { error: eventErr } = await supabase
    .from("referral_events")
    .insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
      credits_awarded: REFERRAL_CREDITS,
    });

  if (eventErr) {
    // Unique constraint violation means this user was already referred — that's OK.
    console.warn("[blockid:referrals] referral_events insert", eventErr.message);
  }

  return { ok: true, referrerEmail: referrer.email as string };
}

// ---------------------------------------------------------------------------
// Get referral stats for a user.
// ---------------------------------------------------------------------------

export async function getReferralStats(userId: string): Promise<{
  code: string;
  url: string;
  totalReferred: number;
  creditsEarned: number;
}> {
  const code = (await getReferralCode(userId)) ?? "";
  const url = code ? getReferralUrl(code) : "";

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { code, url, totalReferred: 0, creditsEarned: 0 };
  }

  const { data: user } = await supabase
    .from("app_users")
    .select("referral_credits_earned")
    .eq("id", userId)
    .single();

  const { count } = await supabase
    .from("referral_events")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId);

  return {
    code,
    url,
    totalReferred: count ?? 0,
    creditsEarned: (user?.referral_credits_earned as number) ?? 0,
  };
}
