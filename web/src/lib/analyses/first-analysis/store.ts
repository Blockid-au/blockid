// Persistence for the first-analysis job (S32-B, migration 0390).
//
// One job per `analyses` row. Every state transition is a CONDITIONAL
// UPDATE so two workers (the intake request's fire-and-forget runner and
// the 5-minute cron) can never both write the same report:
//
//   queued ──claim──▶ running ──▶ done
//   failed ──claim──▶ running ──▶ failed   (attempts < FULL_REPORT_MAX_ATTEMPTS)
//   running (stale > FULL_REPORT_STUCK_MS) ──claim──▶ running
//
// The email is the same shape: `claimFullReportEmailSend` stamps
// `full_report_emailed_at` BEFORE the send and only when it is still null;
// a send that provably failed releases the stamp. Exactly one email per
// analysis, whichever worker gets there first.
//
// Fail-soft on writes (log, return false), strict on reads — the same
// contract as ../store.ts.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { ANALYSES_TABLE } from "@/lib/analyses/store";
import type { FirstAnalysisReport, FullReportStatus } from "./types";

export const FULL_REPORT_MAX_ATTEMPTS = 3;
/** A `running` row older than this is treated as abandoned and re-claimed. */
export const FULL_REPORT_STUCK_MS = 15 * 60 * 1000;

export const FULL_REPORT_COLUMNS =
  "id, anon_key, user_id, input_kind, input_text, input_chars, input_truncated, input_url, input_filename, intake, context, created_at, " +
  "full_report_status, full_report_json, full_report_error, full_report_attempts, full_report_started_at, full_report_finished_at, full_report_email, full_report_emailed_at";

export interface FullReportRow {
  id: string;
  anon_key: string | null;
  user_id: string | null;
  input_kind: string | null;
  input_text: string | null;
  input_chars: number | null;
  input_truncated: boolean | null;
  input_url: string | null;
  input_filename: string | null;
  intake: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  created_at: string;
  full_report_status: FullReportStatus | null;
  full_report_json: FirstAnalysisReport | null;
  full_report_error: string | null;
  full_report_attempts: number | null;
  full_report_started_at: string | null;
  full_report_finished_at: string | null;
  full_report_email: string | null;
  full_report_emailed_at: string | null;
}

export async function loadFullReportRow(id: string): Promise<FullReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .select(FULL_REPORT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[first-analysis:load] query failed —", error.message);
    return null;
  }
  return (data as unknown as FullReportRow | null) ?? null;
}

/** Mark a fresh row as wanting a full report. No-op when already set. */
export async function enqueueFullReport(id: string, email?: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const patch: Record<string, unknown> = { full_report_status: "queued" };
  if (email) patch.full_report_email = email;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .update(patch)
    .eq("id", id)
    .is("full_report_status", null)
    .select("id");
  if (error) {
    console.error("[first-analysis:enqueue] failed —", error.message);
    return false;
  }
  return ((data as unknown[] | null) ?? []).length === 1;
}

/**
 * Become the one worker running this job. Returns the row on success
 * (attempts already incremented), null when somebody else holds it, it is
 * finished, or it has exhausted its attempts.
 */
export async function claimFullReportJob(
  id: string,
  opts: { now?: Date; maxAttempts?: number; stuckMs?: number } = {},
): Promise<FullReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const now = opts.now ?? new Date();
  const maxAttempts = opts.maxAttempts ?? FULL_REPORT_MAX_ATTEMPTS;
  const stuckBefore = new Date(now.getTime() - (opts.stuckMs ?? FULL_REPORT_STUCK_MS)).toISOString();

  // Read first: PostgREST cannot express `attempts = attempts + 1`, and a
  // conditional update on the exact attempts value we read gives the same
  // race safety (a concurrent claimant bumps it and our update matches 0
  // rows).
  const current = await loadFullReportRow(id);
  if (!current) return null;
  const attempts = current.full_report_attempts ?? 0;
  if (attempts >= maxAttempts) return null;
  const status = current.full_report_status;
  const claimable =
    status === "queued" ||
    status === "failed" ||
    (status === "running" && (!current.full_report_started_at || current.full_report_started_at < stuckBefore));
  if (!claimable) return null;

  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .update({
      full_report_status: "running",
      full_report_attempts: attempts + 1,
      full_report_started_at: now.toISOString(),
      full_report_finished_at: null,
      full_report_error: null,
    })
    .eq("id", id)
    .eq("full_report_attempts", attempts)
    .eq("full_report_status", status)
    .select(FULL_REPORT_COLUMNS);
  if (error) {
    console.error("[first-analysis:claim] update failed —", error.message);
    return null;
  }
  const rows = (data as unknown as FullReportRow[] | null) ?? [];
  return rows.length === 1 ? rows[0] : null;
}

/** Write the partial report so the page can stream sections in. */
export async function saveFullReportProgress(id: string, report: FirstAnalysisReport): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_json: report })
    .eq("id", id)
    .eq("full_report_status", "running");
  if (error) {
    console.error("[first-analysis:progress] update failed —", error.message);
    return false;
  }
  return true;
}

export async function finishFullReport(
  id: string,
  outcome: { status: "done" | "failed"; report: FirstAnalysisReport | null; error?: string | null; now?: Date },
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const patch: Record<string, unknown> = {
    full_report_status: outcome.status,
    full_report_finished_at: (outcome.now ?? new Date()).toISOString(),
    full_report_error: outcome.error ? outcome.error.slice(0, 500) : null,
  };
  if (outcome.report) patch.full_report_json = outcome.report;
  const { error } = await supabase.from(ANALYSES_TABLE).update(patch).eq("id", id);
  if (error) {
    console.error("[first-analysis:finish] update failed —", error.message);
    return false;
  }
  return true;
}

/** Record where the PDF should go. Overwrites — the latest address wins. */
export async function setFullReportEmail(id: string, email: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_email: email })
    .eq("id", id);
  if (error) {
    console.error("[first-analysis:email] set failed —", error.message);
    return false;
  }
  return true;
}

/** Send-once claim on the email. True = you may send; false = already sent / unavailable. */
export async function claimFullReportEmailSend(id: string, now: Date = new Date()): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_emailed_at: now.toISOString() })
    .eq("id", id)
    .is("full_report_emailed_at", null)
    .select("id");
  if (error) {
    console.error("[first-analysis:email] claim failed —", error.message);
    return false;
  }
  return ((data as unknown[] | null) ?? []).length === 1;
}

/** Give the claim back after a send that provably did not go out. */
export async function releaseFullReportEmailSend(id: string, reason: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_emailed_at: null, full_report_error: `email: ${reason}`.slice(0, 500) })
    .eq("id", id);
  if (error) console.error("[first-analysis:email] release failed —", error.message);
}

/** Account email for a claimed row. Null when unknown. */
export async function lookupUserEmail(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const email = (data as { email?: unknown }).email;
  return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
}

/** Plan id for a claimed row, so the PDF can pick the free or unlimited variant. */
export async function lookupUserPlan(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const plan = (data as { plan?: unknown }).plan;
  return typeof plan === "string" ? plan : null;
}

export interface PendingSweep {
  /** Jobs to (re)run: queued, retryable failed, stuck running. */
  runnable: FullReportRow[];
  /** Done, not yet emailed, with a destination resolvable. */
  emailable: FullReportRow[];
}

/**
 * What the cron should look at. Bounded (`limit` each) and newest first so a
 * backlog never starves the founder who just pressed the button.
 */
export async function sweepPendingFullReports(
  opts: { limit?: number; now?: Date; maxAttempts?: number; stuckMs?: number } = {},
): Promise<PendingSweep> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { runnable: [], emailable: [] };
  const limit = opts.limit ?? 10;
  const now = opts.now ?? new Date();
  const maxAttempts = opts.maxAttempts ?? FULL_REPORT_MAX_ATTEMPTS;
  const stuckBefore = new Date(now.getTime() - (opts.stuckMs ?? FULL_REPORT_STUCK_MS)).toISOString();

  const { data: pending, error: e1 } = await supabase
    .from(ANALYSES_TABLE)
    .select(FULL_REPORT_COLUMNS)
    .in("full_report_status", ["queued", "failed", "running"])
    .lt("full_report_attempts", maxAttempts)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (e1) console.error("[first-analysis:sweep] pending query failed —", e1.message);
  const runnable = ((pending as unknown as FullReportRow[] | null) ?? [])
    .filter((r) =>
      r.full_report_status !== "running" ||
      !r.full_report_started_at ||
      r.full_report_started_at < stuckBefore,
    )
    .slice(0, limit);

  const { data: done, error: e2 } = await supabase
    .from(ANALYSES_TABLE)
    .select(FULL_REPORT_COLUMNS)
    .eq("full_report_status", "done")
    .is("full_report_emailed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (e2) console.error("[first-analysis:sweep] done query failed —", e2.message);
  const emailable = ((done as unknown as FullReportRow[] | null) ?? [])
    .filter((r) => Boolean(r.full_report_email) || Boolean(r.user_id))
    .slice(0, limit);

  return { runnable, emailable };
}
