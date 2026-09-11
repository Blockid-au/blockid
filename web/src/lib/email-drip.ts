// Onboarding drip + NPS pulse + Money Radar deadline drips orchestrator.
//
// Server-only. Reused by:
//   - /api/svi/route.ts  → enqueueOnboardingDrip(...) after the first
//     report email is fired.
//   - lib/funding/radar-drips.ts → enqueueRadarDrip(...) for every
//     `funding_matches.last_notified.pending_email` entry the weekly
//     money-radar-sweep left behind (T0246, plan §4h).
//   - lib/funding/radar-sweep.ts → enqueueRadarSetupDrip(...) for every
//     Radar subscriber the sweep finds with zero targets (S11-A activation
//     nudge: `radar_setup`, then `radar_setup_2` 14 days later, never a
//     third — `listRadarSetupTouches` reads the cap off the rows).
//   - /api/cron/email-drip → walks due rows and sends via the shared
//     nodemailer/Resend transport in @/lib/email.
//
// Copy is direct and quiet (no exclamation marks, no emoji, no
// "Hey champion"). Every rendered body carries the Auschain footer
// and a working unsubscribe link.

import "server-only";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  canSendEmail,
  getUnsubscribeUrl,
  type EmailCategory,
} from "@/lib/email-preferences";

/**
 * Campaign ids. The DB CHECK on `email_drips.campaign` must list exactly
 * these — 0088 seeded the onboarding five, 0320 added the four radar ones,
 * 0327 the two activation nudges (S11-A). `ALL_DRIP_CAMPAIGNS` is the
 * runtime mirror the migration test compares.
 */
export type DripCampaign =
  | "onboarding_d1"
  | "onboarding_d3"
  | "onboarding_d7"
  | "onboarding_d14"
  | "nps_d30"
  | "radar_t30"
  | "radar_t14"
  | "radar_t3"
  | "radar_status_changed"
  | "radar_setup"
  | "radar_setup_2";

export const ONBOARDING_CAMPAIGNS = [
  "onboarding_d1",
  "onboarding_d3",
  "onboarding_d7",
  "onboarding_d14",
  "nps_d30",
] as const satisfies readonly DripCampaign[];

export const RADAR_CAMPAIGNS = [
  "radar_t30",
  "radar_t14",
  "radar_t3",
  "radar_status_changed",
] as const satisfies readonly DripCampaign[];

export type RadarDripCampaign = (typeof RADAR_CAMPAIGNS)[number];

/**
 * S11-A activation nudges for a Radar subscriber with no grant profile and
 * no Money Finder intake (the sweep finds zero targets). Two touches, ever:
 * `radar_setup` on the first sweep that finds them empty, `radar_setup_2`
 * 14 days later if still empty. The drip rows themselves are the cap.
 */
export const RADAR_SETUP_CAMPAIGNS = ["radar_setup", "radar_setup_2"] as const satisfies readonly DripCampaign[];

export type RadarSetupCampaign = (typeof RADAR_SETUP_CAMPAIGNS)[number];

export const ALL_DRIP_CAMPAIGNS: readonly DripCampaign[] = [
  ...ONBOARDING_CAMPAIGNS,
  ...RADAR_CAMPAIGNS,
  ...RADAR_SETUP_CAMPAIGNS,
];

export function isRadarCampaign(c: DripCampaign): c is RadarDripCampaign {
  return (RADAR_CAMPAIGNS as readonly string[]).includes(c);
}

export function isRadarSetupCampaign(c: string): c is RadarSetupCampaign {
  return (RADAR_SETUP_CAMPAIGNS as readonly string[]).includes(c);
}

export type DripStatus =
  | "pending"
  | "sent"
  | "cancelled"
  | "failed"
  | "expired";

export interface EmailDrip {
  id: string;
  user_id: string | null;
  email: string;
  campaign: DripCampaign;
  scheduled_for: string;
  sent_at: string | null;
  status: DripStatus;
  payload: DripPayload;
  last_error: string | null;
  created_at: string;
}

/** One of the "2 alternatives" on the radar_status_changed touch. */
export interface RadarAlternative {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  amount_max_aud?: number | null;
  official_url?: string | null;
  closes_at?: string | null;
}

export interface DripPayload {
  // Onboarding sequence.
  weakestDim?: string;
  weakestScore?: number;
  sector?: string | null;
  npsToken?: string;
  // Money Radar (radar_*). `ref_id` is also the dedupe key with (email,
  // campaign) — see enqueueRadarDrip.
  ref_kind?: "grant" | "program";
  ref_id?: string;
  ref_name?: string;
  /** ISO day the grant / intake closes (event date for program_type=event). */
  closes_at?: string | null;
  amount_max_aud?: number | null;
  official_url?: string | null;
  /** Latest Money Finder report, for the "See matches" link. */
  report_url?: string | null;
  /** radar_status_changed only: the status the row flipped to. */
  status?: string | null;
  /** radar_status_changed only: next two matches by score. */
  alternatives?: RadarAlternative[];
  /** Unsubscribe token (email_preferences.unsubscribe_token) when known. */
  unsubscribe_token?: string | null;
  // S11-A radar_setup / radar_setup_2: live catalogue counts so the body
  // never says "some grants" (D-3 "always show counts"), plus the startup
  // name when the sweep knows it.
  startup?: string | null;
  open_grants?: number | null;
  open_programs?: number | null;
}

export interface SviAnalysisSummary {
  weakestDim: string;
  weakestScore: number;
  sector: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(
    /\/$/,
    "",
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Insert the full 5-touch drip (D1, D3, D7, D14 + D30 NPS) for one
 * founder. De-duped by campaign: if any onboarding_d1 was scheduled in
 * the last 7 days for this email we short-circuit — a re-analysis or
 * repeat visit should not re-arm the sequence.
 */
export async function enqueueOnboardingDrip(
  email: string,
  userId: string | null,
  summary: SviAnalysisSummary,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const normEmail = email.toLowerCase().trim();
  if (!normEmail || !normEmail.includes("@")) return;

  // Dedupe — did we start a drip for this email in the last week?
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data: existing, error: existingErr } = await supabase
    .from("email_drips")
    .select("id")
    .eq("email", normEmail)
    .eq("campaign", "onboarding_d1")
    .gt("scheduled_for", sevenDaysAgo)
    .limit(1);
  if (existingErr) {
    console.warn("[email-drip] dedupe lookup failed", existingErr);
    return;
  }
  if (existing && existing.length > 0) return;

  const now = Date.now();
  const basePayload: DripPayload = {
    weakestDim: summary.weakestDim,
    weakestScore: summary.weakestScore,
    sector: summary.sector,
  };

  const rows: Array<{
    email: string;
    user_id: string | null;
    campaign: DripCampaign;
    scheduled_for: string;
    payload: DripPayload;
  }> = [
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d1",
      scheduled_for: new Date(now + 1 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d3",
      scheduled_for: new Date(now + 3 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d7",
      scheduled_for: new Date(now + 7 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d14",
      scheduled_for: new Date(now + 14 * DAY_MS).toISOString(),
      payload: basePayload,
    },
  ];

  // NPS row — pre-create the nps_responses stub so the token is stable
  // between the drip email and the /nps landing page.
  const npsToken = newToken();
  const { error: npsErr } = await supabase.from("nps_responses").insert({
    user_id: userId,
    email: normEmail,
    token: npsToken,
  });
  if (npsErr) {
    console.warn("[email-drip] failed to create nps stub", npsErr);
    // Still continue — send the drip without the NPS touch.
  } else {
    rows.push({
      email: normEmail,
      user_id: userId,
      campaign: "nps_d30",
      scheduled_for: new Date(now + 30 * DAY_MS).toISOString(),
      payload: { ...basePayload, npsToken },
    });
  }

  const { error: insertErr } = await supabase.from("email_drips").insert(rows);
  if (insertErr) console.warn("[email-drip] insert failed", insertErr);
}

// ── Money Radar drips (T0246) ────────────────────────────────────────────────

/**
 * A radar touch for the same (email, campaign, ref_id) inside this window is
 * a duplicate. 45 days > the widest tier gap (T-30 → close), so a deadline
 * that legitimately re-fires next round (the sweep clears the tier stamps
 * when `closes_at` moves forward) is not swallowed.
 */
export const RADAR_DRIP_DEDUPE_DAYS = 45;

export type EnqueueRadarDripResult = "queued" | "duplicate" | "invalid" | "error";

/** Minimal client surface so the radar enqueuer can inject the sweep's `db`. */
export interface DripDbLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EnqueueRadarDripOptions {
  now?: Date;
  db?: DripDbLike | null;
}

/**
 * Insert ONE radar drip, due immediately (the hourly worker picks it up).
 * De-duped on `(email, campaign, payload->>ref_id)` within
 * RADAR_DRIP_DEDUPE_DAYS — same shape as the onboarding dedupe (email +
 * campaign + a `scheduled_for` window) with the matched row's id added, so
 * two grants closing the same week each get their own T-14 while a re-run
 * of the sweep on the same row never queues a second copy.
 *
 * Suppression (`canSendEmail(email, "money_radar")`) is the caller's job —
 * the worker re-checks it before the send anyway.
 */
export async function enqueueRadarDrip(
  email: string,
  userId: string | null,
  campaign: RadarDripCampaign,
  payload: DripPayload,
  opts: EnqueueRadarDripOptions = {},
): Promise<EnqueueRadarDripResult> {
  const supabase = opts.db === undefined ? getSupabaseAdmin() : opts.db;
  if (!supabase) return "error";

  const normEmail = email.toLowerCase().trim();
  if (!normEmail || !normEmail.includes("@")) return "invalid";
  if (!isRadarCampaign(campaign)) return "invalid";
  const refId = typeof payload.ref_id === "string" ? payload.ref_id.trim() : "";
  if (!refId) return "invalid";

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - RADAR_DRIP_DEDUPE_DAYS * DAY_MS).toISOString();
  const { data: existing, error: existingErr } = await supabase
    .from("email_drips")
    .select("id")
    .eq("email", normEmail)
    .eq("campaign", campaign)
    .eq("payload->>ref_id", refId)
    .gt("scheduled_for", since)
    .limit(1);
  if (existingErr) {
    console.warn("[email-drip] radar dedupe lookup failed", existingErr);
    return "error";
  }
  if (existing && existing.length > 0) return "duplicate";

  const { error: insertErr } = await supabase.from("email_drips").insert([
    {
      email: normEmail,
      user_id: userId,
      campaign,
      scheduled_for: now.toISOString(),
      payload: { ...payload, ref_id: refId },
    },
  ]);
  if (insertErr) {
    console.warn("[email-drip] radar insert failed", insertErr);
    return "error";
  }
  return "queued";
}

// ── Founder Radar activation nudges (S11-A) ─────────────────────────────────

/**
 * A setup touch for the same (email, campaign) inside this window is a
 * duplicate. The sweep only ever asks for `radar_setup` when no such row
 * exists and `radar_setup_2` 14 days after it, so this is the belt to that
 * brace: a re-run, a crash between insert and summary, or an overlapping
 * tick cannot queue a second copy.
 */
export const RADAR_SETUP_DEDUPE_DAYS = 30;

/** Days after the first touch before the follow-up may go. */
export const RADAR_SETUP_FOLLOWUP_DAYS = 14;

/**
 * Insert ONE activation nudge, due immediately. De-duped on
 * `(email, campaign)` within RADAR_SETUP_DEDUPE_DAYS. Suppression
 * (`canSendEmail(email, "money_radar")`) is the caller's job — the worker
 * re-checks it before the send anyway.
 */
export async function enqueueRadarSetupDrip(
  email: string,
  userId: string | null,
  campaign: RadarSetupCampaign,
  payload: DripPayload,
  opts: EnqueueRadarDripOptions = {},
): Promise<EnqueueRadarDripResult> {
  const supabase = opts.db === undefined ? getSupabaseAdmin() : opts.db;
  if (!supabase) return "error";

  const normEmail = email.toLowerCase().trim();
  if (!normEmail || !normEmail.includes("@")) return "invalid";
  if (!isRadarSetupCampaign(campaign)) return "invalid";

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - RADAR_SETUP_DEDUPE_DAYS * DAY_MS).toISOString();
  const { data: existing, error: existingErr } = await supabase
    .from("email_drips")
    .select("id")
    .eq("email", normEmail)
    .eq("campaign", campaign)
    .gt("scheduled_for", since)
    .limit(1);
  if (existingErr) {
    console.warn("[email-drip] radar setup dedupe lookup failed", existingErr);
    return "error";
  }
  if (existing && existing.length > 0) return "duplicate";

  const { error: insertErr } = await supabase.from("email_drips").insert([
    {
      email: normEmail,
      user_id: userId,
      campaign,
      scheduled_for: now.toISOString(),
      payload,
    },
  ]);
  if (insertErr) {
    console.warn("[email-drip] radar setup insert failed", insertErr);
    return "error";
  }
  return "queued";
}

/** One prior activation touch, as the sweep reads it back from `email_drips`. */
export interface RadarSetupTouch {
  campaign: RadarSetupCampaign;
  scheduled_for: string;
}

/**
 * Every activation touch ever queued for this address (any status — a
 * cancelled or expired row still counts, so an opted-out or lapsed
 * subscriber is never nudged a third time). Newest first.
 */
export async function listRadarSetupTouches(
  email: string,
  opts: { db?: DripDbLike | null } = {},
): Promise<RadarSetupTouch[]> {
  const supabase = opts.db === undefined ? getSupabaseAdmin() : opts.db;
  if (!supabase) return [];
  const normEmail = email.toLowerCase().trim();
  if (!normEmail) return [];
  const { data, error } = await supabase
    .from("email_drips")
    .select("campaign, scheduled_for")
    .eq("email", normEmail)
    .in("campaign", [...RADAR_SETUP_CAMPAIGNS])
    .order("scheduled_for", { ascending: false })
    .limit(10);
  if (error) {
    console.warn("[email-drip] radar setup touch lookup failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ campaign: string; scheduled_for: string }>)
    .filter((r) => isRadarSetupCampaign(r.campaign) && typeof r.scheduled_for === "string")
    .map((r) => ({ campaign: r.campaign as RadarSetupCampaign, scheduled_for: r.scheduled_for }));
}

// ── Expiry guard ─────────────────────────────────────────────────────────────

/**
 * A pending row more than this many days past its `scheduled_for` is
 * expired, never sent.
 *
 * Chosen from the queue itself, not from a guess. When the worker was first
 * scheduled the 60-row backlog split cleanly: a recent cluster 0–13 days
 * overdue and a stale tail 16–50 days overdue, with nothing in between. 14
 * sits in that gap, and it is also the D14 touch interval — past it a
 * founder has been overtaken by the next step of their own sequence, so the
 * time-anchored copy ("Day 1 — your report is ready", "you have been on the
 * free tier for two weeks") is no longer true. Sending it would be a cold
 * blast from a domain whose deliverability transactional mail depends on.
 */
export const DRIP_EXPIRY_DAYS = 14;

/**
 * Mark every pending, unsent row more than `maxOverdueDays` past its
 * scheduled_for as `expired`.
 *
 * Runs BEFORE any send in the cron worker so a stale row can never reach
 * the transport. Idempotent: the `status = pending` filter means a second
 * pass matches zero rows. Returns the number of rows expired.
 */
export async function expireStaleDrips(
  now: Date,
  maxOverdueDays: number = DRIP_EXPIRY_DAYS,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const cutoff = new Date(
    now.getTime() - maxOverdueDays * DAY_MS,
  ).toISOString();
  const { data, error } = await supabase
    .from("email_drips")
    .update({
      status: "expired",
      last_error: `expired: more than ${maxOverdueDays} days past scheduled_for`,
    })
    .eq("status", "pending")
    .is("sent_at", null)
    .lt("scheduled_for", cutoff)
    .select("id");
  if (error) {
    console.warn("[email-drip] expireStaleDrips failed", error);
    return 0;
  }
  return (data ?? []).length;
}

// ── Suppression ──────────────────────────────────────────────────────────────

/**
 * Which `email_preferences` category a campaign belongs to. The D14 touch is
 * a pricing pitch, so it rides `promotions`; the tips and the NPS pulse are
 * product mail. There is no second suppression list — this only maps a
 * campaign onto the existing categories so `canSendEmail` can decide.
 */
export function dripCategory(campaign: DripCampaign): EmailCategory {
  if (isRadarCampaign(campaign) || isRadarSetupCampaign(campaign)) return "money_radar";
  return campaign === "onboarding_d14" ? "promotions" : "product_updates";
}

/** Thin delegate to the single suppression mechanism, `canSendEmail`. */
export async function canSendDrip(
  email: string,
  campaign: DripCampaign,
): Promise<boolean> {
  return canSendEmail(email, dripCategory(campaign));
}

/**
 * Retire a row the recipient has opted out of. `sent_at` is deliberately
 * left null and the row goes to `cancelled`, not `sent` — an unsubscribed
 * address must never be recorded as having been mailed.
 */
export async function suppressDrip(id: string, reason: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_drips")
    .update({ status: "cancelled", last_error: reason.slice(0, 500) })
    .eq("id", id)
    .is("sent_at", null);
}

// ── Once-only claim ──────────────────────────────────────────────────────────

/**
 * Claim a row for sending by stamping `sent_at` under a conditional
 * `WHERE sent_at IS NULL AND status = 'pending'`.
 *
 * Returns true only when this call is the one that won the row. A retry, an
 * overlapping cron tick, or a re-run after a crash matches zero rows and
 * gets false — the caller must not send. `markFailed` afterwards leaves
 * `sent_at` stamped on purpose, so a transport failure is recorded once and
 * never silently re-fired at the recipient.
 */
export async function claimDrip(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("email_drips")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .is("sent_at", null)
    .select("id");
  if (error) {
    console.warn("[email-drip] claimDrip failed", error);
    return false;
  }
  return (data ?? []).length === 1;
}

// ── Cron helpers ─────────────────────────────────────────────────────────────

export async function dueDrips(now: Date, limit: number): Promise<EmailDrip[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("email_drips")
    .select("*")
    .eq("status", "pending")
    .is("sent_at", null)
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[email-drip] dueDrips lookup failed", error);
    return [];
  }
  return (data ?? []) as EmailDrip[];
}

export async function markSent(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_drips")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markFailed(id: string, err: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_drips")
    .update({ status: "failed", last_error: err.slice(0, 500) })
    .eq("id", id);
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const ONBOARDING_REASON = "Sent because you generated an SVI report on BlockID.au.";
const RADAR_REASON = "Sent because Founder Radar is watching this deadline for you.";

/**
 * Unsubscribe link. Radar touches carry the recipient's
 * `email_preferences.unsubscribe_token` when the enqueuer could read it, so
 * the link is the category-scoped `getUnsubscribeUrl(token, "money_radar")`
 * (one click stops radar mail, keeps receipts + digest); without a token
 * the address-keyed page is the fallback every other touch already uses.
 */
function unsubscribeUrl(email: string, token?: string | null, category?: EmailCategory): string {
  if (token) return getUnsubscribeUrl(token, category);
  return `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
}

function footer(email: string, opts: { reason?: string; token?: string | null; category?: EmailCategory } = {}): string {
  const unsub = unsubscribeUrl(email, opts.token, opts.category);
  return `
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0 16px 0;">
    <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;line-height:1.6;">
      Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111
    </p>
    <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">
      ${escapeHtml(opts.reason ?? ONBOARDING_REASON)}
      <a href="${escapeHtml(unsub)}" style="color:#64748B;text-decoration:underline;">Unsubscribe</a>.
    </p>`;
}

function footerText(email: string, opts: { reason?: string; token?: string | null; category?: EmailCategory } = {}): string {
  const unsub = unsubscribeUrl(email, opts.token, opts.category);
  return `\n\n—\nAuschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111\n${opts.reason ?? ONBOARDING_REASON}\nUnsubscribe: ${unsub}`;
}

function shell(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:#F8FAFC;color:#0F172A;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
        <tr><td style="font-size:15px;color:#0F172A;line-height:1.6;">${inner}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0;text-align:left;">
    <a href="${href}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">${escapeHtml(label)}</a>
  </p>`;
}

function d1Copy(email: string, p: DripPayload): RenderedEmail {
  const dim = p.weakestDim ?? "your investor readiness signal";
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const subject = `Your SVI report is ready — three next steps for ${dim}`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 1</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">Three next steps on your SVI</h1>
    <p>Your first Startup Value Index report is generated. The lowest scoring dimension right now is <strong>${escapeHtml(dim)}</strong>${p.weakestScore != null ? ` at ${p.weakestScore}/100` : ""}, so that is where a small amount of work will move the SVI the most.</p>
    <p style="margin:16px 0 8px 0;font-weight:600;">Do these three things today:</p>
    <ol style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Open your dashboard and read the ${escapeHtml(dim)} section end to end.</li>
      <li style="margin-bottom:6px;">Add one piece of evidence against it in the Evidence Vault (a link, a screenshot, a PDF is enough).</li>
      <li style="margin-bottom:6px;">Re-score. Investors want to see movement, not perfection.</li>
    </ol>
    ${ctaButton(dashUrl, "Open dashboard")}
    <p style="color:#64748B;font-size:13px;">Or jump straight to <a href="${evidenceUrl}" style="color:#2563EB;">Evidence Vault</a>.</p>
    ${footer(email)}`);
  const text = `Your SVI report is ready.\n\nWeakest dimension: ${dim}${p.weakestScore != null ? ` (${p.weakestScore}/100)` : ""}.\n\nThree next steps:\n1. Read the ${dim} section in your dashboard.\n2. Add one piece of evidence in the Evidence Vault.\n3. Re-score.\n\nDashboard: ${dashUrl}\nEvidence Vault: ${evidenceUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d3Copy(email: string, p: DripPayload): RenderedEmail {
  const lift = Math.max(4, Math.min(12, Math.round((100 - (p.weakestScore ?? 50)) / 8)));
  const teamUrl = `${siteUrl()}/workspace/team`;
  const subject = `Add your team to lift your SVI Team score by ~${lift} points`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 3</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">Bring your team into the workspace</h1>
    <p>Your SVI weights the Founder and Team dimension heavily. Adding co-founders, advisors and early hires with LinkedIn URLs typically lifts the Team component by <strong>${lift} points</strong> and the total SVI along with it.</p>
    <p>It also unlocks role-based dashboards so each person sees the report slice that matters to them.</p>
    ${ctaButton(teamUrl, "Invite team")}
    <p style="color:#64748B;font-size:13px;">Invites are free. Team members do not consume your credit balance.</p>
    ${footer(email)}`);
  const text = `Adding your team lifts the SVI Team component by roughly ${lift} points and pulls the headline number up.\n\nInvite team: ${teamUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d7Copy(email: string, p: DripPayload): RenderedEmail {
  const sectorLabel = (p.sector ?? "your sector").replace(/[_-]/g, " ");
  const dim = p.weakestDim ?? "traction";
  const insightsUrl = `${siteUrl()}/insights`;
  const subject = `How founders in ${sectorLabel} are unblocking ${dim}`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 7</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">A pattern we see in ${escapeHtml(sectorLabel)}</h1>
    <p>Across recent BlockID scores, the founders in ${escapeHtml(sectorLabel)} who lifted <strong>${escapeHtml(dim)}</strong> fastest did three things in the first month.</p>
    <ol style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Wrote a one-page problem statement and posted it publicly to invite critique.</li>
      <li style="margin-bottom:6px;">Ran five 20-minute customer conversations and uploaded the notes as evidence.</li>
      <li style="margin-bottom:6px;">Attached one hard number (waitlist size, LOI, pilot revenue) even if small.</li>
    </ol>
    <p>None of it is glamorous. All of it is what investors want to see when they open your BlockID share link.</p>
    ${ctaButton(insightsUrl, "Read the full playbook")}
    ${footer(email)}`);
  const text = `Founders in ${sectorLabel} who lifted ${dim} did three things in the first month:\n1. Public one-page problem statement.\n2. Five 20-minute customer conversations, uploaded as evidence.\n3. One hard number (waitlist, LOI, pilot revenue).\n\nMore: ${insightsUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d14Copy(email: string): RenderedEmail {
  const pricingUrl = `${siteUrl()}/pricing`;
  const subject = "Ready for the full report? Founder plan is A$29/mo";
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 14</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">The full report unlocks the next 90 days</h1>
    <p>You have been on the free tier for two weeks. The Founder plan (A$29/mo, GST included) unlocks:</p>
    <ul style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Your score tracked over time, with 20 AI credits a month to re-run it.</li>
      <li style="margin-bottom:6px;">A data room that fills up in the order investors ask.</li>
      <li style="margin-bottom:6px;">A live link you share with an investor instead of a PDF.</li>
    </ul>
    <p>No lock-in. Cancel from the billing page any time.</p>
    ${ctaButton(pricingUrl, "See plans")}
    ${footer(email)}`);
  const text = `The Founder plan is A$29/mo (GST included): your score tracked over time with 20 AI credits a month, a data room, and a live investor link.\n\nSee plans: ${pricingUrl}${footerText(email)}`;
  return { subject, html, text };
}

function npsCopy(email: string, p: DripPayload): RenderedEmail {
  const token = p.npsToken ?? "";
  const npsUrl = `${siteUrl()}/nps?token=${encodeURIComponent(token)}`;
  const subject = "How likely are you to recommend BlockID?";
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; 30-day check-in</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">One question</h1>
    <p>On a scale of 0 to 10, how likely are you to recommend BlockID to another founder?</p>
    <p>One click, no login. If the number is low, we would rather hear about it now than guess later.</p>
    ${ctaButton(npsUrl, "Give a score")}
    ${footer(email)}`);
  const text = `On a scale of 0 to 10, how likely are you to recommend BlockID to another founder?\n\nOne click: ${npsUrl}${footerText(email)}`;
  return { subject, html, text };
}

// ── Money Radar copy (T0246, plan §4i D-3 email subjects) ───────────────────

/** "up to A$50,000" / "A$5,000" — never invents a number when none is known. */
function audRange(max: number | null | undefined): string | null {
  if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) return null;
  return `up to A$${Math.round(max).toLocaleString("en-AU")}`;
}

function refNoun(p: DripPayload): string {
  return p.ref_kind === "grant" ? "grant" : "program";
}

function closesLine(p: DripPayload): string {
  const noun = p.ref_kind === "grant" ? "Closes" : "Applications close";
  return p.closes_at ? `${noun} ${p.closes_at}.` : "";
}

interface RadarCopyBits {
  kicker: string;
  subject: string;
  heading: string;
  lead: string;
  steps: string[];
}

/**
 * Shared body for the three deadline tiers: what it is, the A$ range, the
 * official link, "Draft application" → /workspace/funding, radar footer.
 */
function radarCopy(email: string, p: DripPayload, bits: RadarCopyBits): RenderedEmail {
  const name = p.ref_name?.trim() || "your matched program";
  const range = audRange(p.amount_max_aud);
  const noun = refNoun(p);
  const closes = closesLine(p);
  const official = p.official_url?.trim() || null;
  const draftUrl = `${siteUrl()}/workspace/funding`;
  const reportUrl = p.report_url?.trim() || null;
  const footerOpts = { reason: RADAR_REASON, token: p.unsubscribe_token ?? null, category: "money_radar" as const };

  const whatIs = `<p><strong>${escapeHtml(name)}</strong> is a ${noun} matched to your startup by Founder Radar${range ? `, worth <strong>${escapeHtml(range)}</strong>` : ""}. ${escapeHtml(closes)}</p>`;
  const stepsHtml = bits.steps.length
    ? `<ol style="padding-left:20px;margin:0 0 16px 0;">${bits.steps.map((s) => `<li style="margin-bottom:6px;">${escapeHtml(s)}</li>`).join("")}</ol>`
    : "";
  const links = [
    official ? `<a href="${escapeHtml(official)}" style="color:#2563EB;">Official page</a>` : null,
    reportUrl ? `<a href="${escapeHtml(reportUrl)}" style="color:#2563EB;">Your Money Finder report</a>` : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; ${escapeHtml(bits.kicker)}</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">${escapeHtml(bits.heading)}</h1>
    ${whatIs}
    <p>${escapeHtml(bits.lead)}</p>
    ${stepsHtml}
    ${ctaButton(draftUrl, "Draft application")}
    ${links ? `<p style="color:#64748B;font-size:13px;">${links}</p>` : ""}
    <p style="color:#64748B;font-size:12px;">Dates come from the official source and are re-checked weekly. Confirm on the official page before you rely on one.</p>
    ${footer(email, footerOpts)}`);

  const text = [
    bits.heading,
    "",
    `${name} is a ${noun} matched to your startup by Founder Radar${range ? `, worth ${range}` : ""}. ${closes}`.trim(),
    "",
    bits.lead,
    ...(bits.steps.length ? ["", ...bits.steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    "",
    `Draft application: ${draftUrl}`,
    ...(official ? [`Official page: ${official}`] : []),
    ...(reportUrl ? [`Your Money Finder report: ${reportUrl}`] : []),
    "",
    "Dates come from the official source and are re-checked weekly. Confirm on the official page before you rely on one.",
  ].join("\n");

  return { subject: bits.subject, html, text: `${text}${footerText(email, footerOpts)}` };
}

function radarT30Copy(email: string, p: DripPayload): RenderedEmail {
  const name = p.ref_name?.trim() || "your matched program";
  return radarCopy(email, p, {
    kicker: "Founder Radar · 30 days",
    subject: `30 days to ${name}: your eligibility checklist`,
    heading: `30 days to ${name}`,
    lead: "A month is enough to apply well. Work through the checklist now so the last fortnight is polish, not panic.",
    steps: [
      "Read the eligibility criteria on the official page and tick each one against your ABN, location and stage.",
      "List the evidence they ask for (financials, letters of support, quotes) and drop what you already have into your data room.",
      "Open a draft on BlockID — the answers are pre-filled from your profile and Money Finder report.",
    ],
  });
}

function radarT14Copy(email: string, p: DripPayload): RenderedEmail {
  const name = p.ref_name?.trim() || "your matched program";
  return radarCopy(email, p, {
    kicker: "Founder Radar · 14 days",
    subject: `${name} closes in 2 weeks — draft ready?`,
    heading: `${name} closes in two weeks`,
    lead: "If the draft is not written yet, write it this week. Reviewers reward a clear, specific answer over a long one.",
    steps: [
      "Finish the draft and read it once as the assessor would: is the outcome measurable and the budget itemised?",
      "Ask one person outside the company to read the summary — if they cannot repeat what you do in a sentence, rewrite it.",
      "Book time for the submission portal a few days early; most rejections we see are late uploads, not weak ideas.",
    ],
  });
}

function radarT3Copy(email: string, p: DripPayload): RenderedEmail {
  const name = p.ref_name?.trim() || "your matched program";
  return radarCopy(email, p, {
    kicker: "Founder Radar · final 72 hours",
    subject: `Final 72 hours for ${name}`,
    heading: `Final 72 hours for ${name}`,
    lead: "Submit today if you can. Portals slow down on the closing day and a late upload is not assessed.",
    steps: [
      "Check every attachment opens and the file names match what the form asks for.",
      "Confirm the closing time and time zone on the official page — many close at 17:00 AEST, not midnight.",
      "Submit, save the confirmation, and file it in your data room.",
    ],
  });
}

function radarStatusChangedCopy(email: string, p: DripPayload): RenderedEmail {
  const name = p.ref_name?.trim() || "A matched program";
  const status = p.status === "closed" ? "closed" : "paused";
  const alternatives = (p.alternatives ?? []).slice(0, 2);
  const draftUrl = `${siteUrl()}/workspace/funding`;
  const footerOpts = { reason: RADAR_REASON, token: p.unsubscribe_token ?? null, category: "money_radar" as const };
  const subject = `${name} ${status} — here are 2 alternatives`;

  const altHtml = alternatives.length
    ? `<ol style="padding-left:20px;margin:0 0 16px 0;">${alternatives
        .map((a) => {
          const range = audRange(a.amount_max_aud);
          const url = a.official_url?.trim() || null;
          const title = url ? `<a href="${escapeHtml(url)}" style="color:#2563EB;">${escapeHtml(a.name)}</a>` : `<strong>${escapeHtml(a.name)}</strong>`;
          return `<li style="margin-bottom:6px;">${title}${range ? ` — ${escapeHtml(range)}` : ""}${a.closes_at ? ` · closes ${escapeHtml(a.closes_at)}` : ""}</li>`;
        })
        .join("")}</ol>`
    : `<p>No other match is open this week. We re-check the catalogue every Sunday and will tell you when one opens.</p>`;

  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Founder Radar</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">${escapeHtml(name)} is now ${status}</h1>
    <p>The official page for <strong>${escapeHtml(name)}</strong> now shows it as ${status}${p.official_url ? ` (<a href="${escapeHtml(p.official_url)}" style="color:#2563EB;">check it</a>)` : ""}. If you had started an application, keep the draft — rounds often reopen.</p>
    <p style="margin:16px 0 8px 0;font-weight:600;">Two alternatives from your match list, by score:</p>
    ${altHtml}
    ${ctaButton(draftUrl, "Draft application")}
    ${footer(email, footerOpts)}`);

  const text = [
    `${name} is now ${status}`,
    "",
    `The official page for ${name} now shows it as ${status}.${p.official_url ? ` Check it: ${p.official_url}` : ""} If you had started an application, keep the draft — rounds often reopen.`,
    "",
    "Two alternatives from your match list, by score:",
    ...(alternatives.length
      ? alternatives.map((a, i) => {
          const range = audRange(a.amount_max_aud);
          return `${i + 1}. ${a.name}${range ? ` — ${range}` : ""}${a.closes_at ? ` · closes ${a.closes_at}` : ""}${a.official_url ? ` · ${a.official_url}` : ""}`;
        })
      : ["No other match is open this week. We re-check the catalogue every Sunday and will tell you when one opens."]),
    "",
    `Draft application: ${draftUrl}`,
  ].join("\n");

  return { subject, html, text: `${text}${footerText(email, footerOpts)}` };
}

// ── Founder Radar activation nudges (S11-A, D-3 re-engagement voice) ───────

const RADAR_SETUP_REASON = "Sent because Founder Radar is included in your BlockID plan.";

/** Approved subjects — the sweep's in-app title and this line say the same thing. */
export const RADAR_SETUP_SUBJECTS: Record<RadarSetupCampaign, string> = {
  radar_setup: "Your Founder Radar is on — tell us 3 things to start matching",
  radar_setup_2: "Still want grant alerts? 60 seconds sets them up",
};

/** The one CTA on both touches: the intake, open and focused. */
export function radarSetupCtaUrl(): string {
  return `${siteUrl()}/workspace/funding?from=radar_setup`;
}

/** "14 grants and 6 programs are open today" — counts only when the sweep supplied them. */
function openCountsLine(p: DripPayload): string | null {
  const g = typeof p.open_grants === "number" && Number.isFinite(p.open_grants) ? Math.max(0, Math.round(p.open_grants)) : null;
  const pr = typeof p.open_programs === "number" && Number.isFinite(p.open_programs) ? Math.max(0, Math.round(p.open_programs)) : null;
  if (g === null || pr === null || g + pr === 0) return null;
  return `${g} grant${g === 1 ? "" : "s"} and ${pr} program${pr === 1 ? "" : "s"} are open today`;
}

function radarSetupShell(email: string, p: DripPayload, bits: { kicker: string; subject: string; heading: string; paragraphs: string[]; cta: string }): RenderedEmail {
  const ctaUrl = radarSetupCtaUrl();
  const footerOpts = { reason: RADAR_SETUP_REASON, token: p.unsubscribe_token ?? null, category: "money_radar" as const };
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; ${escapeHtml(bits.kicker)}</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">${escapeHtml(bits.heading)}</h1>
    ${bits.paragraphs.map((t) => `<p>${escapeHtml(t)}</p>`).join("\n    ")}
    ${ctaButton(ctaUrl, bits.cta)}
    ${footer(email, footerOpts)}`);
  const text = [bits.heading, "", ...bits.paragraphs.flatMap((t) => [t, ""]), `${bits.cta}: ${ctaUrl}`].join("\n");
  return { subject: bits.subject, html, text: `${text}${footerText(email, footerOpts)}` };
}

function radarSetupCopy(email: string, p: DripPayload): RenderedEmail {
  const startup = p.startup?.trim() || "your startup";
  const counts = openCountsLine(p);
  return radarSetupShell(email, p, {
    kicker: "Founder Radar",
    subject: RADAR_SETUP_SUBJECTS.radar_setup,
    heading: "Founder Radar is on. It has nothing to watch yet.",
    paragraphs: [
      `Founder Radar re-checks every Australian grant, program and event each Sunday and alerts you 30, 14 and 3 days before a deadline. Right now it has nothing to match against: we do not know what ${startup} builds, where it is based or what stage it is at.`,
      `${counts ? `${counts}. ` : ""}Answer three questions — what, where, stage — and the first match list is ready in about 60 seconds. Everything else is prefilled from your profile.`,
    ],
    cta: "Answer 3 questions",
  });
}

function radarSetup2Copy(email: string, p: DripPayload): RenderedEmail {
  const counts = openCountsLine(p);
  return radarSetupShell(email, p, {
    kicker: "Founder Radar · follow-up",
    subject: RADAR_SETUP_SUBJECTS.radar_setup_2,
    heading: "Still want grant alerts?",
    paragraphs: [
      `Two weeks ago we asked three questions so Founder Radar could start matching. Nothing has come through, so your Radar is still watching an empty list${counts ? ` while ${counts}` : ""}.`,
      "If grant alerts are not useful to you, ignore this — we will not ask again. If they are, the three questions take about 60 seconds and the first match list is ready straight after.",
    ],
    cta: "Set up matching",
  });
}

export function renderDripBody(
  campaign: DripCampaign,
  email: string,
  payload: DripPayload,
): RenderedEmail {
  switch (campaign) {
    case "radar_setup":
      return radarSetupCopy(email, payload);
    case "radar_setup_2":
      return radarSetup2Copy(email, payload);
    case "onboarding_d1":
      return d1Copy(email, payload);
    case "onboarding_d3":
      return d3Copy(email, payload);
    case "onboarding_d7":
      return d7Copy(email, payload);
    case "onboarding_d14":
      return d14Copy(email);
    case "nps_d30":
      return npsCopy(email, payload);
    case "radar_t30":
      return radarT30Copy(email, payload);
    case "radar_t14":
      return radarT14Copy(email, payload);
    case "radar_t3":
      return radarT3Copy(email, payload);
    case "radar_status_changed":
      return radarStatusChangedCopy(email, payload);
  }
}
