// Stuck Money Finder report sweep (review 2026-09-10 #11).
//
// The Stripe webhook (`handleFundingReportCompleted`) marks a guest row
// `paid`, generates and emails in one go. When the generation throws the row
// sits at `failed` with a "being prepared" email already out; when the
// process dies mid-way it sits at `paid` / `generating`. Nothing regenerated
// those — the buyer paid A$3 for a page that says "contact support".
//
// This sweep (every 30 min from /api/cron/funding-report-retry) picks rows
// that carry a PAID marker — `meta.paid_at`, or `stripe_session_id` +
// `meta.stripe_event_id` for rows written before the stamp existed — whose
// status is still `paid` / `generating` / `failed` and whose payment is older
// than `minAgeMinutes` (10), re-runs the SAME generator the webhook uses
// (`generateAndStoreFundingReport`) and sends the same "ready" email once
// (`sendFundingReportReadyEmail`, deduped on `meta.email_sent_at`). At most
// `limit` (10) rows per tick, oldest first.
//
// Signed-in rows (`paid_via = 'credits' | 'plan'`) have no paid marker and
// are never touched; a `spend_failed` row is not a paid row either.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  EMAIL_SENT_AT_KEY,
  generateAndStoreFundingReport,
  sendFundingReportReadyEmail,
  type FundingReportRow,
} from "./reports";

export const RETRY_STATUSES = ["paid", "generating", "failed"] as const;
export const RETRY_MIN_AGE_MINUTES = 10;
export const RETRY_MAX_PER_TICK = 10;

export interface RetryCandidate {
  id: string;
  status: string;
  paidAt: string;
  to: string | null;
  emailSent: boolean;
}

/** Pure: when was this row paid, if ever? `null` = no paid marker → not ours. */
export function paidMarkerAt(row: Pick<FundingReportRow, "meta" | "stripe_session_id" | "created_at">): string | null {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const paidAt = meta.paid_at;
  if (typeof paidAt === "string" && Number.isFinite(Date.parse(paidAt))) return paidAt;
  if (row.stripe_session_id && typeof meta.stripe_event_id === "string" && meta.stripe_event_id) return row.created_at;
  return null;
}

/** Pure: is this row a retry candidate at `now`? */
export function isRetryCandidate(
  row: Pick<FundingReportRow, "status" | "meta" | "stripe_session_id" | "created_at">,
  now: Date,
  minAgeMinutes: number = RETRY_MIN_AGE_MINUTES,
): boolean {
  if (!(RETRY_STATUSES as readonly string[]).includes(row.status)) return false;
  const paidAt = paidMarkerAt(row);
  if (!paidAt) return false;
  const t = Date.parse(paidAt);
  return Number.isFinite(t) && now.getTime() - t >= minAgeMinutes * 60_000;
}

export interface RetrySummary {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  scanned: number;
  candidates: RetryCandidate[];
  regenerated: number;
  failed: number;
  emailed: number;
  email_skipped: number;
  results: Array<{ id: string; outcome: "ready" | "failed" | "dry"; email: "sent" | "already_sent" | "failed" | "no_recipient" | "skipped" }>;
}

export interface RetryDeps {
  generate?: (id: string) => Promise<{ summary: { grant_count: number; program_count: number } } | null>;
  sendReadyEmail?: typeof sendFundingReportReadyEmail;
  now?: Date;
}

/** Re-run generation for stuck paid rows. Never throws; DB-less → ok:false. */
export async function retryStuckFundingReports(
  opts: { dryRun?: boolean; limit?: number; minAgeMinutes?: number } = {},
  deps: RetryDeps = {},
): Promise<RetrySummary> {
  const dryRun = opts.dryRun ?? false;
  const limit = Math.max(1, Math.min(opts.limit ?? RETRY_MAX_PER_TICK, RETRY_MAX_PER_TICK));
  const minAge = opts.minAgeMinutes ?? RETRY_MIN_AGE_MINUTES;
  const now = deps.now ?? new Date();
  const summary: RetrySummary = {
    ok: false,
    dryRun,
    scanned: 0,
    candidates: [],
    regenerated: 0,
    failed: 0,
    emailed: 0,
    email_skipped: 0,
    results: [],
  };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...summary, error: "supabase_unavailable" };

  let rows: FundingReportRow[] = [];
  try {
    const { data, error } = await supabase
      .from("funding_reports")
      .select("id, user_id, guest_email, status, stripe_session_id, meta, access_token, created_at, updated_at")
      .in("status", [...RETRY_STATUSES])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return { ...summary, error: error.message };
    rows = (data ?? []) as FundingReportRow[];
  } catch (err) {
    return { ...summary, error: err instanceof Error ? err.message : String(err) };
  }
  summary.scanned = rows.length;

  const picked = rows.filter((r) => isRetryCandidate(r, now, minAge)).slice(0, limit);

  // Recipient: guest email, else the owner's account email.
  const ownerIds = Array.from(
    new Set(picked.filter((r) => !r.guest_email && r.user_id).map((r) => r.user_id as string)),
  );
  const emails = new Map<string, string>();
  if (ownerIds.length > 0) {
    try {
      const { data } = await supabase.from("app_users").select("id, email").in("id", ownerIds);
      for (const u of (data ?? []) as Array<{ id: string; email: string | null }>) if (u.email) emails.set(u.id, u.email);
    } catch {
      // no recipient → generate anyway, email skipped
    }
  }

  for (const row of picked) {
    const to = row.guest_email ?? (row.user_id ? emails.get(row.user_id) ?? null : null);
    const emailSent = Boolean(row.meta && typeof row.meta[EMAIL_SENT_AT_KEY] === "string");
    summary.candidates.push({ id: row.id, status: row.status, paidAt: paidMarkerAt(row) ?? row.created_at, to, emailSent });
    if (dryRun) {
      summary.results.push({ id: row.id, outcome: "dry", email: "skipped" });
      continue;
    }
    const generate = deps.generate ?? ((id: string) => generateAndStoreFundingReport(id, { withNarrative: true }));
    let report: Awaited<ReturnType<NonNullable<RetryDeps["generate"]>>> = null;
    try {
      report = await generate(row.id);
    } catch (err) {
      console.error("[funding/report-retry] generate threw", { id: row.id, err: String(err) });
    }
    if (!report) {
      summary.failed += 1;
      summary.results.push({ id: row.id, outcome: "failed", email: "skipped" });
      continue;
    }
    summary.regenerated += 1;
    if (!to) {
      summary.email_skipped += 1;
      summary.results.push({ id: row.id, outcome: "ready", email: "no_recipient" });
      continue;
    }
    const send = deps.sendReadyEmail ?? sendFundingReportReadyEmail;
    const email = await send({
      reportId: row.id,
      to,
      report: report as Parameters<typeof sendFundingReportReadyEmail>[0]["report"],
      accessToken: row.access_token ?? null,
    });
    if (email === "sent") summary.emailed += 1;
    else summary.email_skipped += 1;
    summary.results.push({ id: row.id, outcome: "ready", email: email === "no_db" ? "failed" : email });
  }

  summary.ok = true;
  return summary;
}
