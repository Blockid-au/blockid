// Server-side lifecycle of a `funding_reports` row (T0242, plan §4a / §4e).
//
//   createPendingGuestReport()      guest A$3 — row BEFORE Stripe (pending_payment)
//   handleFundingReportCompleted()  Stripe webhook branch: paid → generate → email
//   generateAndStoreFundingReport() shared generator (guest + signed-in)
//   getFundingReport()              raw row by id (service role)
//   canViewFundingReport()          owner, `?t=` access token, or Stripe session id
//   publicFundingReport()           row → JSON safe for the browser
//
// Status ladder: pending_payment → paid → generating → ready | failed.
// Idempotency: `stripe_session_id` is UNIQUE and the webhook only advances a
// row that is still `pending_payment`; a replayed event finds `ready` and
// returns without generating or emailing again.
//
// Columns `access_token`, `meta`, `error_message` arrive with migration
// 0315_funding_reports_access_token.sql. Colocated tests: reports.test.ts.

import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  FUNDING_DISCLAIMER,
  generateFundingReport,
  type FundingReport,
  type ScoredGrant,
  type ScoredProgram,
  type TimelineItem,
} from "@/lib/agents/grant-advisor";
import { listGrants, listPrograms } from "./data";
import { catalogueForIntake } from "./preview";
import { intakeToGrantProfile, parseFundingIntake, type FundingIntake } from "./intake";

export type FundingReportStatus =
  | "pending_payment"
  | "paid"
  | "generating"
  | "ready"
  | "failed"
  | "spend_failed";

export interface FundingReportRow {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  project_id: string | null;
  intake: FundingIntake | Record<string, unknown>;
  grant_matches: ScoredGrant[];
  program_matches: ScoredProgram[];
  timeline: TimelineItem[];
  narrative_md: string | null;
  credits_cost: number;
  paid_via: "one_off" | "credits" | "plan" | null;
  stripe_session_id: string | null;
  status: FundingReportStatus | string;
  access_token?: string | null;
  meta?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FundingReportMeta {
  today: string;
  generated_at: string;
  summary: FundingReport["summary"];
  tax: FundingReport["tax"];
  actions: string[];
  narrative_source: string | null;
  excluded: { grants: number; programs: number };
  disclaimer: string;
}

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://blockid.au").replace(/\/$/, "");

export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export function reportUrl(id: string, token?: string | null): string {
  return token ? `${SITE()}/funding/report/${id}?t=${encodeURIComponent(token)}` : `${SITE()}/funding/report/${id}`;
}

// ─── Create (guest) ──────────────────────────────────────────────────────────

export async function createPendingGuestReport(args: {
  email: string;
  intake: FundingIntake;
  amountCents: number;
}): Promise<{ id: string; access_token: string } | { error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "Database not configured" };
  const access_token = newAccessToken();
  const { data, error } = await supabase
    .from("funding_reports")
    .insert({
      guest_email: args.email,
      intake: args.intake,
      status: "pending_payment",
      paid_via: "one_off",
      credits_cost: 0,
      access_token,
      meta: { amount_cents: args.amountCents },
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "insert failed" };
  return { id: String(data.id), access_token };
}

// ─── Generate ────────────────────────────────────────────────────────────────

/** Turn a stored intake back into the shapes the agent needs. */
export async function buildReportFromIntake(
  intake: FundingIntake,
  opts: { withNarrative: boolean; today?: Date } = { withNarrative: true },
): Promise<FundingReport> {
  const [allGrants, allPrograms] = await Promise.all([
    listGrants({ excludeNonMatching: true }),
    listPrograms({}),
  ]);
  const { grants, programs } = catalogueForIntake(intake, allGrants, allPrograms);
  return generateFundingReport({
    profile: intakeToGrantProfile(intake),
    grants,
    programs,
    today: opts.today,
    withNarrative: opts.withNarrative,
  });
}

export function reportMeta(report: FundingReport): FundingReportMeta {
  return {
    today: report.today,
    generated_at: report.generated_at,
    summary: report.summary,
    tax: report.tax,
    actions: report.actions ?? [],
    narrative_source: report.narrative_source ?? null,
    excluded: { grants: report.excluded.grants.length, programs: report.excluded.programs.length },
    disclaimer: FUNDING_DISCLAIMER,
  };
}

/** Columns written when a report is generated — shared by guest + member paths. Existing meta (Stripe ids) is preserved. */
export function reportColumns(report: FundingReport, existingMeta?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    grant_matches: report.grants,
    program_matches: report.programs,
    timeline: report.timeline,
    narrative_md: report.narrative_md ?? null,
    meta: { ...(existingMeta ?? {}), ...reportMeta(report) },
    status: "ready",
    error_message: null,
  };
}

/**
 * Load the row's intake, run the agent, and write the result back. Returns
 * the generated report, or null when the row is missing / has no valid intake.
 */
export async function generateAndStoreFundingReport(
  reportId: string,
  opts: { withNarrative?: boolean } = {},
): Promise<FundingReport | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const row = await getFundingReport(reportId);
  if (!row) return null;
  const parsed = parseFundingIntake(row.intake);
  if (!parsed.ok) {
    await supabase
      .from("funding_reports")
      .update({ status: "failed", error_message: `intake: ${parsed.error}` })
      .eq("id", reportId);
    return null;
  }

  await supabase.from("funding_reports").update({ status: "generating" }).eq("id", reportId);
  try {
    const report = await buildReportFromIntake(parsed.intake, { withNarrative: opts.withNarrative ?? true });
    // `row.meta` already carries the Stripe ids the webhook stamped — keep them.
    const { error } = await supabase
      .from("funding_reports")
      .update(reportColumns(report, row.meta ?? null))
      .eq("id", reportId);
    if (error) throw new Error(error.message);
    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("funding_reports")
      .update({ status: "failed", error_message: message.slice(0, 500) })
      .eq("id", reportId);
    console.error("[funding/reports] generate failed", { reportId, message });
    return null;
  }
}

// ─── Stripe webhook branch ───────────────────────────────────────────────────

/**
 * `checkout.session.completed` with `metadata.scope === "funding_report"`.
 * Marks the row paid (only from pending_payment — replay-safe), generates the
 * report with the LLM narrative and emails the tokenised link.
 */
export async function handleFundingReportCompleted(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata" | "amount_total" | "payment_intent" | "customer_email">,
  eventId?: string,
): Promise<{ ok: boolean; reportId: string | null; skipped?: string }> {
  const supabase = getSupabaseAdmin();
  const reportId = session.metadata?.funding_report_id;
  if (!supabase) return { ok: false, reportId: null, skipped: "no_db" };
  if (!reportId || typeof reportId !== "string") {
    console.warn("[funding/reports] webhook missing funding_report_id", { session_id: session.id });
    return { ok: false, reportId: null, skipped: "missing_report_id" };
  }

  const existing = await getFundingReport(reportId);
  if (!existing) return { ok: false, reportId, skipped: "row_missing" };
  if (existing.status !== "pending_payment") {
    console.info(`[funding/reports] ${reportId} already ${existing.status} — replay ignored (session ${session.id})`);
    return { ok: true, reportId, skipped: "already_processed" };
  }

  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const { error: updErr } = await supabase
    .from("funding_reports")
    .update({
      status: "paid",
      stripe_session_id: session.id,
      meta: {
        ...(existing.meta ?? {}),
        paid_amount_cents: session.amount_total ?? null,
        stripe_payment_intent: paymentIntent,
        stripe_event_id: eventId ?? null,
        paid_at: new Date().toISOString(),
      },
    })
    .eq("id", reportId)
    .eq("status", "pending_payment");
  if (updErr) {
    console.warn("[funding/reports] paid update failed", { reportId, message: updErr.message });
    return { ok: false, reportId, skipped: "update_failed" };
  }

  const report = await generateAndStoreFundingReport(reportId, { withNarrative: true });
  const to = existing.guest_email ?? session.customer_email ?? session.metadata?.email ?? null;
  if (to) {
    const url = reportUrl(reportId, existing.access_token ?? null);
    sendEmail({
      to,
      subject: report
        ? `Your Money Finder report — ${report.summary.grant_count} grants, ${report.summary.program_count} programs`
        : "Your Money Finder report is being prepared",
      html: fundingReportEmailHtml({ url, report }),
    }).catch((err) => console.error("[funding/reports] email failed", { reportId, err: String(err) }));
  }
  return { ok: true, reportId };
}

export function fundingReportEmailHtml(args: { url: string; report: FundingReport | null }): string {
  const r = args.report;
  const top = r ? r.grants.slice(0, 3).map((g) => `<li>${escapeHtml(g.name)}</li>`).join("") : "";
  const body = r
    ? `<p>We matched <strong>${r.summary.grant_count} grants</strong> and <strong>${r.summary.program_count} programs</strong> to what you told us${
        r.summary.top_grants_amount_max_aud > 0 ? `, worth up to <strong>A$${r.summary.top_grants_amount_max_aud.toLocaleString("en-AU")}</strong> across the top five` : ""
      }.</p>${top ? `<p>Top of the list:</p><ul>${top}</ul>` : ""}`
    : `<p>Payment received. Your ranked list, eligibility checklist and 12-month timeline will be at the link below within a few minutes — if it is not there yet, refresh.</p>`;
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#2563eb;margin:0 0 8px">BlockID · Money Finder</p>
  <h1 style="font-size:22px;margin:0 0 12px">Your grant &amp; program report is ready</h1>
  ${body}
  <p style="margin:24px 0"><a href="${args.url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Open my report</a></p>
  <p style="font-size:12px;color:#6b7280">This link is private to you — anyone with it can read the report. Grant information is free from government; what you paid for is the analysis against your profile.</p>
  <p style="font-size:11px;color:#6b7280;line-height:1.5">${escapeHtml(FUNDING_DISCLAIMER)}</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getFundingReport(id: string): Promise<FundingReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !id) return null;
  try {
    const { data, error } = await supabase.from("funding_reports").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code !== "42P01") console.warn("[funding/reports] getFundingReport", error.message);
      return null;
    }
    return (data as FundingReportRow | null) ?? null;
  } catch (err) {
    console.warn("[funding/reports] getFundingReport", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface ViewerContext {
  userId?: string | null;
  /** `?t=` access token from the emailed link. */
  token?: string | null;
  /** `?s=` Stripe Checkout session id from the success redirect. */
  sessionId?: string | null;
}

/** Owner, valid access token, or the Stripe session that paid for it. Constant-ish time compare on the token. */
export function canViewFundingReport(row: FundingReportRow, viewer: ViewerContext): boolean {
  if (viewer.userId && row.user_id && viewer.userId === row.user_id) return true;
  if (viewer.token && row.access_token && safeEqual(viewer.token, row.access_token)) return true;
  if (viewer.sessionId && row.stripe_session_id && safeEqual(viewer.sessionId, row.stripe_session_id)) return true;
  return false;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface PublicFundingReport {
  id: string;
  status: string;
  created_at: string;
  paid_via: string | null;
  intake: FundingIntake | null;
  grants: ScoredGrant[];
  programs: ScoredProgram[];
  timeline: TimelineItem[];
  narrative_md: string | null;
  meta: FundingReportMeta | null;
  disclaimer: string;
  is_owner: boolean;
  /** Owner only — the startup the report was generated for (drives save-to-data-room). Null for guests. */
  project_id: string | null;
}

/** Strip secrets (token, email, Stripe ids) before the row leaves the server. */
export function publicFundingReport(row: FundingReportRow, viewer: ViewerContext): PublicFundingReport {
  const parsed = parseFundingIntake(row.intake);
  const isOwner = Boolean(viewer.userId && row.user_id && viewer.userId === row.user_id);
  return {
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    paid_via: row.paid_via,
    intake: parsed.ok ? parsed.intake : null,
    grants: Array.isArray(row.grant_matches) ? row.grant_matches : [],
    programs: Array.isArray(row.program_matches) ? row.program_matches : [],
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    narrative_md: row.narrative_md ?? null,
    meta: (row.meta as FundingReportMeta | null) ?? null,
    disclaimer: FUNDING_DISCLAIMER,
    is_owner: isOwner,
    project_id: isOwner ? (row.project_id ?? null) : null,
  };
}
