// G34-BT2 — the shared e-mail send log, the commercial (C-class) gate and
// recipient suppression (EM02 / EM03 / EM04 / EM05 / EM06).
//
//   * `email_sends` (pending-authority/0464_email_sends.sql) holds one row per
//     send attempt: sha256(lower(email)) — never the address —, the flow, the
//     class ('T' transactional | 'C' commercial), the template, the provider
//     message id and a status. `sendEmail` (lib/email.ts) writes it
//     best-effort: a missing table or a failed insert never blocks a send.
//   * C-class mail passes one gate before it may leave: not suppressed
//     (hard bounce / complaint), marketing consent on record (D24-e), and the
//     global frequency cap — ≤ 1 per 24 h, ≤ 3 per 7 days, ≤ 1 per flow per
//     72 h — read from `email_sends`. The gate FAILS CLOSED: when the log or
//     the preference row cannot be read, the commercial send is skipped.
//     T-class mail is never capped and only a hard bounce stops it.
//   * Consent (D24-e, 2026-09-25): an account created before
//     MARKETING_CONSENT_CUTOFF keeps inferred consent (existing active account
//     holders); anyone else — a new account, or a guest who only typed an
//     address for the free report — needs express consent, recorded as
//     `email_preferences.marketing_consent_at` by lib/consent.ts
//     (recordMarketingConsent) from an unticked checkbox.
//
// Every Supabase read here is wrapped: callers' colocated tests stub the
// client with partial fakes, and a thrown chain must read as "unreadable"
// (T: send, C: skip), never as an exception inside the send path.

import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import type { EmailCategory } from "./email-preferences";

export type EmailClass = "T" | "C";

/** sha256 hex of the trimmed, lower-cased address — the only recipient key `email_sends` stores. */
export function hashRecipient(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

// ── EM02 send log ────────────────────────────────────────────────────────────

export type EmailSendStatus = "sent" | "failed" | `blocked:${string}`;

export interface EmailSendLogInput {
  to: string;
  flow?: string | null;
  emailClass: EmailClass;
  template?: string | null;
  providerMessageId?: string | null;
  status: EmailSendStatus;
}

/** The row shape written to `email_sends` (exported for tests). */
export function emailSendRow(input: EmailSendLogInput): Record<string, unknown> {
  return {
    recipient_hash: hashRecipient(input.to),
    flow: (input.flow ?? "unspecified").slice(0, 120),
    class: input.emailClass,
    template: input.template ? input.template.slice(0, 120) : null,
    provider_message_id: input.providerMessageId ? String(input.providerMessageId).slice(0, 255) : null,
    status: input.status.slice(0, 64),
  };
}

const LOG_TIMEOUT_MS = 3_000;

/** Best-effort insert into `email_sends`. Never throws; bounded so a stuck DB cannot hold a send. */
export async function recordEmailSend(input: EmailSendLogInput): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const insert = Promise.resolve(sb.from("email_sends").insert(emailSendRow(input))).then(
      (res: { error?: { message?: string } | null } | undefined) => {
        if (res?.error) console.warn("[blockid:email-sends] log insert skipped", res.error.message ?? res.error);
      },
    );
    await Promise.race([insert, new Promise<void>((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS))]);
  } catch (err) {
    console.warn("[blockid:email-sends] log insert failed", err instanceof Error ? err.message : err);
  }
}

// ── EM03 frequency cap ───────────────────────────────────────────────────────

export const COMMERCIAL_FREQUENCY_CAP = {
  /** C-class sends per rolling 24 h. */
  perDay: 1,
  /** C-class sends per rolling 7 days. */
  perWeek: 3,
  /** Hours between two C-class sends of the same flow. */
  perFlowHours: 72,
} as const;

export interface RecentCommercialSend {
  created_at: string;
  flow: string | null;
}

export type CapDecision =
  | { ok: true }
  | { ok: false; reason: "cap_day" | "cap_week" | "cap_flow" | "log_unavailable" };

const HOUR_MS = 3_600_000;

/** Pure: may another C-class send of `flow` go out at `now`, given the sent C rows of the last 7 days? */
export function evaluateFrequencyCap(recent: readonly RecentCommercialSend[], flow: string, now: Date): CapDecision {
  const t = now.getTime();
  const within = (hours: number) =>
    recent.filter((r) => {
      const at = Date.parse(r.created_at);
      return Number.isFinite(at) && at > t - hours * HOUR_MS && at <= t + 60_000;
    });
  if (within(24).length >= COMMERCIAL_FREQUENCY_CAP.perDay) return { ok: false, reason: "cap_day" };
  if (within(7 * 24).length >= COMMERCIAL_FREQUENCY_CAP.perWeek) return { ok: false, reason: "cap_week" };
  if (within(COMMERCIAL_FREQUENCY_CAP.perFlowHours).some((r) => r.flow === flow)) return { ok: false, reason: "cap_flow" };
  return { ok: true };
}

/** Reads the last 7 days of sent C-class rows for `email`. Fails CLOSED (`log_unavailable`). */
export async function checkCommercialFrequencyCap(email: string, flow: string, now: Date = new Date()): Promise<CapDecision> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return { ok: false, reason: "log_unavailable" };
    const since = new Date(now.getTime() - 7 * 24 * HOUR_MS).toISOString();
    const { data, error } = await sb
      .from("email_sends")
      .select("created_at, flow")
      .eq("recipient_hash", hashRecipient(email))
      .eq("class", "C")
      .eq("status", "sent")
      .gte("created_at", since);
    if (error || !Array.isArray(data)) return { ok: false, reason: "log_unavailable" };
    return evaluateFrequencyCap(data as RecentCommercialSend[], flow, now);
  } catch {
    return { ok: false, reason: "log_unavailable" };
  }
}

// ── EM04 suppression ─────────────────────────────────────────────────────────

export type SuppressionReason = "hard_bounce" | "complaint";

export interface SuppressionState {
  /** false when the preference row could not be read (0464 not applied, DB down). */
  readable: boolean;
  reason: SuppressionReason | null;
}

export async function getSuppression(email: string): Promise<SuppressionState> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return { readable: false, reason: null };
    const { data, error } = await sb
      .from("email_preferences")
      .select("suppressed_reason")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (error) return { readable: false, reason: null };
    const r = (data as { suppressed_reason?: string | null } | null)?.suppressed_reason ?? null;
    return { readable: true, reason: r === "hard_bounce" || r === "complaint" ? r : null };
  } catch {
    return { readable: false, reason: null };
  }
}

/** Categories switched off on suppression (payment_receipts is transactional and stays). */
const COMMERCIAL_OFF = {
  weekly_reports: false,
  product_updates: false,
  promotions: false,
  digest_weekly: false,
  money_radar: false,
} as const;

/**
 * Suppress an address after a hard bounce or a complaint (Resend webhook).
 * Every commercial category goes false + `unsubscribed_all`; the reason and
 * time land in `suppressed_reason` / `suppressed_at` (0464). Before 0464 is
 * applied the update is retried without those two columns, so C-class mail
 * still stops. Creates the row when the address has none. Never throws.
 */
export async function suppressRecipient(email: string, reason: SuppressionReason): Promise<boolean> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return false;
    const norm = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const base = { ...COMMERCIAL_OFF, unsubscribed_all: true, updated_at: now };
    const full = { ...base, suppressed_reason: reason, suppressed_at: now };

    const { data: existing } = await sb.from("email_preferences").select("email").eq("email", norm).maybeSingle();
    if (!existing) {
      const ins = await sb.from("email_preferences").insert({ email: norm, ...full });
      if (!ins.error) return true;
      const insBase = await sb.from("email_preferences").insert({ email: norm, ...base });
      return !insBase.error;
    }
    const upd = await sb.from("email_preferences").update(full).eq("email", norm);
    if (!upd.error) return true;
    const updBase = await sb.from("email_preferences").update(base).eq("email", norm);
    return !updBase.error;
  } catch (err) {
    console.warn("[blockid:email-sends] suppressRecipient failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Best-effort status stamp on the logged row of a provider message (bounce / complaint). */
export async function markSendStatusByProviderId(providerMessageId: string, status: string): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb || !providerMessageId) return;
    await sb.from("email_sends").update({ status: status.slice(0, 64) }).eq("provider_message_id", providerMessageId);
  } catch {
    /* best-effort */
  }
}

// ── EM05 consent ─────────────────────────────────────────────────────────────

/**
 * D24-e cut-over. Accounts created before this instant keep inferred consent;
 * later accounts and guests need express consent (`marketing_consent_at`).
 */
export const MARKETING_CONSENT_CUTOFF = "2026-09-25T00:00:00Z";

export async function hasCommercialConsent(email: string): Promise<boolean> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return false;
    const norm = email.trim().toLowerCase();
    const { data: user, error: userErr } = await sb
      .from("app_users")
      .select("created_at")
      .eq("email", norm)
      .maybeSingle();
    if (!userErr) {
      const created = Date.parse((user as { created_at?: string } | null)?.created_at ?? "");
      if (Number.isFinite(created) && created < Date.parse(MARKETING_CONSENT_CUTOFF)) return true;
    }
    const { data: prefs, error: prefErr } = await sb
      .from("email_preferences")
      .select("marketing_consent_at")
      .eq("email", norm)
      .maybeSingle();
    if (prefErr) return false;
    return Boolean((prefs as { marketing_consent_at?: string | null } | null)?.marketing_consent_at);
  } catch {
    return false;
  }
}

// ── The C-class gate ─────────────────────────────────────────────────────────

export type CommercialBlockReason =
  | "suppressed"
  | "suppression_unreadable"
  | "no_consent"
  | "frequency_capped";

export type CommercialGate = { ok: true } | { ok: false; reason: CommercialBlockReason; detail?: string };

/**
 * Everything a C-class send must pass besides the per-category preference
 * (which callers check with canSendEmail / emailSendChecklist): suppression,
 * consent, frequency cap. Fails closed at every step.
 */
export async function commercialSendGate(email: string, flow: string, now: Date = new Date()): Promise<CommercialGate> {
  const sup = await getSuppression(email);
  if (!sup.readable) return { ok: false, reason: "suppression_unreadable" };
  if (sup.reason) return { ok: false, reason: "suppressed", detail: sup.reason };
  if (!(await hasCommercialConsent(email))) return { ok: false, reason: "no_consent" };
  const cap = await checkCommercialFrequencyCap(email, flow, now);
  if (!cap.ok) return { ok: false, reason: "frequency_capped", detail: cap.reason };
  return { ok: true };
}

// ── EM06 one-click unsubscribe (RFC 8058) ────────────────────────────────────

function unsubscribeBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

/** The List-Unsubscribe target: the API route, which accepts the RFC 8058 one-click POST without login. */
export function oneClickUnsubscribeUrl(token: string, category?: EmailCategory): string {
  const q = `token=${encodeURIComponent(token)}${category ? `&category=${encodeURIComponent(category)}` : ""}`;
  return `${unsubscribeBase()}/api/unsubscribe?${q}`;
}

/**
 * Map a body-link unsubscribe URL (`…/unsubscribe?token=…`, the confirmation
 * page) onto the one-click API route for the header. Returns null when the
 * URL carries no token (e.g. the address-keyed `?email=` page), since that
 * form cannot honour a one-click POST.
 */
export function toOneClickUnsubscribeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const token = u.searchParams.get("token");
    if (!token) return null;
    if (u.pathname === "/api/unsubscribe") return u.toString();
    if (u.pathname !== "/unsubscribe") return null;
    const out = new URL("/api/unsubscribe", u.origin);
    out.searchParams.set("token", token);
    const category = u.searchParams.get("category");
    if (category) out.searchParams.set("category", category);
    return out.toString();
  } catch {
    return null;
  }
}
