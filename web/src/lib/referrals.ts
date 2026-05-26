import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { grantCredits } from "./credits";

// ── Softlaunch promo: boosted referral rewards until July 31, 2026 ──
const PROMO_DEADLINE = new Date("2026-08-01T00:00:00+10:00");
const isPromo = () => new Date() < PROMO_DEADLINE;

const REFERRER_CREDITS = isPromo() ? 5 : 2;   // 5 during promo (normally 2)
const REFEREE_BONUS_CREDITS = isPromo() ? 3 : 1; // 3 during promo (normally 1)

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
// Two-sided rewards:
//   1. Find referrer by referral_code
//   2. Set referred_by on new user
//   3. Prevent double grants via svi_notifications (referral_bonus_given)
//   4. Grant credits to referrer (2 credits)
//   5. Grant bonus credit to referee (1 credit on top of free 2 = 3 total)
//   6. Log referral event
//   7. Return success
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

  // 3. Prevent double grants — check svi_notifications for existing bonus
  const { data: existingBonus } = await supabase
    .from("svi_notifications")
    .select("id")
    .eq("notification_type", "referral_bonus_given")
    .filter("payload->>referred_user_id", "eq", newUserId)
    .limit(1);

  if (existingBonus && existingBonus.length > 0) {
    // Already processed — skip credit grants but return success
    return { ok: true, referrerEmail: referrer.email as string };
  }

  // 4. Grant credits to referrer (2 credits)
  await grantCredits(referrer.id, REFERRER_CREDITS, "referral_bonus", {
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
    .update({ referral_credits_earned: currentEarned + REFERRER_CREDITS })
    .eq("id", referrer.id);

  // 5. Grant bonus credit to referee (1 credit on top of free 2 = 3 total)
  await grantCredits(newUserId, REFEREE_BONUS_CREDITS, "referee_welcome_bonus", {
    referrer_id: referrer.id,
    referral_code: referralCode,
  });

  // Log the double-grant prevention marker in svi_notifications
  await supabase.from("svi_notifications").insert({
    notification_type: "referral_bonus_given",
    subject: "Referral bonus granted (2-sided)",
    payload: {
      referrer_id: referrer.id,
      referred_user_id: newUserId,
      referrer_credits: REFERRER_CREDITS,
      referee_credits: REFEREE_BONUS_CREDITS,
    },
  });

  // 6. Log referral event
  const { error: eventErr } = await supabase
    .from("referral_events")
    .insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
      credits_awarded: REFERRER_CREDITS,
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
