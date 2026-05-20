import "server-only";
import { getSupabaseAdmin } from "./supabase";

export type EmailCategory =
  | "weekly_reports"
  | "product_updates"
  | "promotions"
  | "svi_alerts"
  | "payment_receipts";

export interface EmailPreferences {
  email: string;
  weekly_reports: boolean;
  product_updates: boolean;
  promotions: boolean;
  svi_alerts: boolean;
  payment_receipts: boolean;
  unsubscribed_all: boolean;
  unsubscribe_token: string;
}

// ---- Get or create preferences for an email --------------------------------

export async function getEmailPreferences(
  email: string,
): Promise<EmailPreferences | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from("email_preferences")
    .select(
      "email, weekly_reports, product_updates, promotions, svi_alerts, payment_receipts, unsubscribed_all, unsubscribe_token",
    )
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error("[blockid:email-prefs] getEmailPreferences failed", error);
    return null;
  }
  return data as EmailPreferences | null;
}

// ---- Ensure preferences exist (call on user creation / first email) --------
// Returns the unsubscribe_token. Upserts: creates if not exists.

export async function ensureEmailPreferences(
  email: string,
  userId?: string,
): Promise<string> {
  const sb = getSupabaseAdmin();
  if (!sb) return "";

  const normEmail = email.toLowerCase().trim();

  // Try to read existing row first
  const { data: existing } = await sb
    .from("email_preferences")
    .select("unsubscribe_token")
    .eq("email", normEmail)
    .maybeSingle();

  if (existing) return existing.unsubscribe_token as string;

  // Insert new row
  const { data: created, error } = await sb
    .from("email_preferences")
    .insert({
      email: normEmail,
      user_id: userId ?? null,
    })
    .select("unsubscribe_token")
    .single();

  if (error) {
    // Race condition: another request already inserted — read it back
    if (error.code === "23505") {
      const { data: retry } = await sb
        .from("email_preferences")
        .select("unsubscribe_token")
        .eq("email", normEmail)
        .maybeSingle();
      return (retry?.unsubscribe_token as string) ?? "";
    }
    console.error("[blockid:email-prefs] ensureEmailPreferences failed", error);
    return "";
  }

  return (created?.unsubscribe_token as string) ?? "";
}

// ---- Check if user wants to receive a category ----------------------------

export async function canSendEmail(
  email: string,
  category: EmailCategory,
): Promise<boolean> {
  // payment_receipts always true (transactional, legally required)
  if (category === "payment_receipts") return true;

  const prefs = await getEmailPreferences(email);
  // If no prefs exist yet, allow sending (first-time user)
  if (!prefs) return true;

  // Check global unsubscribe first
  if (prefs.unsubscribed_all) return false;

  // Check specific category
  return prefs[category] === true;
}

// ---- Update preferences ----------------------------------------------------

export async function updateEmailPreferences(
  email: string,
  updates: Partial<Record<EmailCategory | "unsubscribed_all", boolean>>,
): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  // Never allow unsubscribing from payment_receipts
  delete updates.payment_receipts;

  const { error } = await sb
    .from("email_preferences")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("email", email.toLowerCase().trim());

  if (error) {
    console.error("[blockid:email-prefs] updateEmailPreferences failed", error);
  }
}

// ---- Unsubscribe all via token (for one-click unsubscribe link) -----------

export async function unsubscribeByToken(
  token: string,
): Promise<{ ok: boolean; email?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false };

  const { data, error } = await sb
    .from("email_preferences")
    .update({
      unsubscribed_all: true,
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token)
    .select("email")
    .maybeSingle();

  if (error || !data) {
    console.error("[blockid:email-prefs] unsubscribeByToken failed", error);
    return { ok: false };
  }

  return { ok: true, email: data.email as string };
}

// ---- Unsubscribe specific category via token -------------------------------

export async function unsubscribeCategoryByToken(
  token: string,
  category: EmailCategory,
): Promise<{ ok: boolean }> {
  // Cannot unsubscribe from payment_receipts
  if (category === "payment_receipts") return { ok: false };

  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false };

  const { error } = await sb
    .from("email_preferences")
    .update({
      [category]: false,
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token);

  if (error) {
    console.error(
      "[blockid:email-prefs] unsubscribeCategoryByToken failed",
      error,
    );
    return { ok: false };
  }

  return { ok: true };
}

// ---- Get preferences by token (for unsubscribe page) -----------------------

export async function getPreferencesByToken(
  token: string,
): Promise<EmailPreferences | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from("email_preferences")
    .select(
      "email, weekly_reports, product_updates, promotions, svi_alerts, payment_receipts, unsubscribed_all, unsubscribe_token",
    )
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error) {
    console.error("[blockid:email-prefs] getPreferencesByToken failed", error);
    return null;
  }
  return data as EmailPreferences | null;
}

// ---- Get unsubscribe URL for embedding in emails ---------------------------

export function getUnsubscribeUrl(
  token: string,
  category?: EmailCategory,
): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"
  ).replace(/\/$/, "");
  if (category)
    return `${base}/unsubscribe?token=${token}&category=${category}`;
  return `${base}/unsubscribe?token=${token}`;
}

// ---- Get preferences management URL ----------------------------------------

export function getPreferencesUrl(token: string): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"
  ).replace(/\/$/, "");
  return `${base}/unsubscribe?token=${token}&manage=1`;
}
