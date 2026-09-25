import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { checkCommercialFrequencyCap, commercialSendGate } from "./email-sends";

export type EmailCategory =
  | "weekly_reports"
  | "product_updates"
  | "promotions"
  | "svi_alerts"
  | "payment_receipts"
  /** T0245 Money Radar — grant deadlines, program intakes, new matches (G11 §4h). */
  | "money_radar";

export interface EmailPreferences {
  email: string;
  weekly_reports: boolean;
  product_updates: boolean;
  promotions: boolean;
  svi_alerts: boolean;
  payment_receipts: boolean;
  /**
   * Wave 28A — Founder Weekly Digest opt-in. Defaults TRUE at the DB layer
   * (see migration 20260904_wave28a_founder_digest.sql). Older rows without
   * the column read back as `undefined` — treat undefined as TRUE at the
   * call site until every row has been backfilled.
   */
  digest_weekly?: boolean;
  /**
   * T0245 — Money Radar emails (deadline drips, new-match nudges). Defaults
   * TRUE at the DB layer (migration 0318_funding_matches.sql); undefined on
   * rows read before the column existed → treat as TRUE.
   */
  money_radar?: boolean;
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
      "email, weekly_reports, product_updates, promotions, svi_alerts, payment_receipts, digest_weekly, money_radar, unsubscribed_all, unsubscribe_token",
    )
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error("[blockid:email-prefs] getEmailPreferences failed", error);
    return null;
  }
  return data as EmailPreferences | null;
}

/**
 * G34-BT2 EM05 (D24-e) — the commercial (C-class) preference columns. A row
 * created from now on starts with every one of them FALSE: they turn on
 * only through express consent (lib/consent.ts recordMarketingConsent, from
 * an unticked checkbox). Existing rows are never touched. `svi_alerts`,
 * `money_radar` and `payment_receipts` are service mail and keep the
 * column defaults.
 */
export const COMMERCIAL_PREFERENCE_COLUMNS = [
  "weekly_reports",
  "product_updates",
  "promotions",
  "digest_weekly",
] as const;

export function commercialPreferenceDefaults(granted: boolean): Record<(typeof COMMERCIAL_PREFERENCE_COLUMNS)[number], boolean> {
  return {
    weekly_reports: granted,
    product_updates: granted,
    promotions: granted,
    digest_weekly: granted,
  };
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
      // G34-BT2 EM05: no commercial mail without express consent.
      ...commercialPreferenceDefaults(false),
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

  // money_radar column arrived with migration 0318 — a row without it
  // (undefined) is opted in, matching the column default. Explicit false wins.
  if (category === "money_radar") return prefs.money_radar !== false;

  // Check specific category
  return prefs[category] === true;
}

// ---- Update preferences ----------------------------------------------------

export async function updateEmailPreferences(
  email: string,
  updates: Partial<
    Record<EmailCategory | "unsubscribed_all" | "digest_weekly", boolean>
  >,
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
      "email, weekly_reports, product_updates, promotions, svi_alerts, payment_receipts, digest_weekly, money_radar, unsubscribed_all, unsubscribe_token",
    )
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error) {
    console.error("[blockid:email-prefs] getPreferencesByToken failed", error);
    return null;
  }
  return data as EmailPreferences | null;
}

// ---- Commercial frequency cap (G34-BT2 EM03) --------------------------------
// ≤ 1 C-class email per 24 h, ≤ 3 per 7 days, ≤ 1 per flow per 72 h, read from
// the shared send log `email_sends` (lib/email-sends.ts). Fails CLOSED: an
// unreadable log means no commercial send. Transactional mail is exempt.

export async function canSendMarketingToday(email: string, flow = "unspecified"): Promise<boolean> {
  const cap = await checkCommercialFrequencyCap(email, flow);
  return cap.ok;
}

export type EmailChecklistReason =
  | "user_unsubscribed"
  | "suppressed"
  | "no_consent"
  | "frequency_capped"
  /** The send log / preference row could not be read — skip now, the row may be retried. */
  | "gate_unavailable"
  | "already_sent";

// ---- Pre-send checklist (call before ANY automated commercial email) --------
// Returns { ok, reason } — only send if ok === true. Order: category
// preference → suppression + consent + frequency cap (commercialSendGate)
// → optional svi_notifications dedup. `payment_receipts` bypasses the gate.

export async function emailSendChecklist(
  email: string,
  category: EmailCategory,
  notificationType?: string,
  opts: { flow?: string } = {},
): Promise<{ ok: boolean; reason?: EmailChecklistReason; detail?: string }> {
  // 1. Preference check
  const allowed = await canSendEmail(email, category);
  if (!allowed) return { ok: false, reason: "user_unsubscribed" };

  // 2. Suppression, consent, global frequency cap (skip for transactional)
  if (category !== "payment_receipts") {
    const gate = await commercialSendGate(email, opts.flow ?? notificationType ?? category);
    if (!gate.ok) {
      if (gate.reason === "suppression_unreadable" || gate.detail === "log_unavailable") {
        return { ok: false, reason: "gate_unavailable", detail: gate.detail ?? gate.reason };
      }
      return { ok: false, reason: gate.reason as EmailChecklistReason, ...(gate.detail ? { detail: gate.detail } : {}) };
    }
  }

  // 3. Dedup check (if notification type provided)
  if (notificationType) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { count } = await sb
        .from("svi_notifications")
        .select("id", { count: "exact", head: true })
        .eq("email", email.toLowerCase().trim())
        .eq("notification_type", notificationType);
      if ((count ?? 0) > 0) return { ok: false, reason: "already_sent" };
    }
  }

  return { ok: true };
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
