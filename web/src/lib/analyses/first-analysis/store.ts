// Persistence for the first-analysis job (S32-B, migration 0390).
//
// One job per `analyses` row. Every state transition is a CONDITIONAL
// UPDATE so two workers (the intake request's fire-and-forget runner and
// the 5-minute cron) can never both write the same report:
//
//   queued ──claim──▶ running ──▶ done | done_partial | failed
//   failed ──claim──▶ running ──▶ …        (attempts < FULL_REPORT_MAX_ATTEMPTS)
//   running (stale > FULL_REPORT_STUCK_MS) ──claim──▶ running
//   done_partial ──claim──▶ done_partial (in flight) ──▶ done | done_partial
//                (migration 0391; the status is kept so the founder's page
//                 and PDF stay readable while the cron backfills; "in
//                 flight" = started_at set and finished_at null; bounded by
//                 the per-section attempt cap, with a hard ceiling of
//                 FULL_REPORT_MAX_ATTEMPTS + SECTION_MAX_ATTEMPTS claims)
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
import { FULL_REPORT_MAX_ATTEMPTS, SECTION_MAX_ATTEMPTS, type FullReportStatus, type StoredFullReport } from "./types";

export { FULL_REPORT_MAX_ATTEMPTS };
/** Hard ceiling on claims of a `done_partial` row (the per-section cap is the real bound). */
export const FULL_REPORT_PARTIAL_MAX_CLAIMS = FULL_REPORT_MAX_ATTEMPTS + SECTION_MAX_ATTEMPTS;
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
  /** G28-C: a v1 `FirstAnalysisReport` (S32 rows) or the `FullReportV2Envelope` (every row since G28) — see types.ts. */
  full_report_json: StoredFullReport | null;
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
 * Take a never-started row back out of the queue (AF04 race: the credit
 * debit failed after the row was saved, so no report was paid for). Only a
 * `queued` row with zero attempts moves; anything already claimed is left.
 */
export async function cancelQueuedFullReport(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_status: null })
    .eq("id", id)
    .eq("full_report_status", "queued")
    .eq("full_report_attempts", 0)
    .select("id");
  if (error) {
    console.error("[first-analysis:cancel] failed —", error.message);
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
  const status = current.full_report_status;
  const stuck = !current.full_report_started_at || current.full_report_started_at < stuckBefore;
  let claimable: boolean;
  if (status === "done_partial") {
    // Backfill: not while another worker is on it, and never past the ceiling.
    const inFlight = Boolean(current.full_report_started_at) && !current.full_report_finished_at;
    claimable = attempts < FULL_REPORT_PARTIAL_MAX_CLAIMS && (!inFlight || stuck);
  } else {
    claimable =
      attempts < maxAttempts &&
      (status === "queued" || status === "failed" || (status === "running" && stuck));
  }
  if (!claimable) return null;

  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .update({
      full_report_status: status === "done_partial" ? "done_partial" : "running",
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

/** Write the in-progress report so the page can stream sections in (a first run, or a partial being backfilled). */
export async function saveFullReportProgress(id: string, report: StoredFullReport): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from(ANALYSES_TABLE)
    .update({ full_report_json: report })
    .eq("id", id)
    .in("full_report_status", ["running", "done_partial"]);
  if (error) {
    console.error("[first-analysis:progress] update failed —", error.message);
    return false;
  }
  return true;
}

export async function finishFullReport(
  id: string,
  outcome: {
    status: "done" | "done_partial" | "failed";
    report: StoredFullReport | null;
    error?: string | null;
    now?: Date;
    /** A "(part 1)" email went out: give the send-once stamp back so the complete report is emailed once more. */
    resetEmailed?: boolean;
  },
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const patch: Record<string, unknown> = {
    full_report_status: outcome.status,
    full_report_finished_at: (outcome.now ?? new Date()).toISOString(),
    full_report_error: outcome.error ? outcome.error.slice(0, 500) : null,
  };
  if (outcome.report) patch.full_report_json = outcome.report;
  if (outcome.resetEmailed) patch.full_report_emailed_at = null;
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
  /** Jobs to (re)run: queued, retryable failed, stuck running, and partials with sections left to backfill. */
  runnable: FullReportRow[];
  /** Done or partial, not yet emailed for that state, with a destination resolvable. */
  emailable: FullReportRow[];
  /**
   * G25-C: never-started FREE rows (queued, attempts 0, with a
   * free_report_grants row) held back because today's platform cap is
   * reached (`holdNeverStartedFree`). Filtered BEFORE the `limit` slice so a
   * capped day never starves failed / stuck / partial rows of their retries.
   */
  heldForCap: FullReportRow[];
}

/** A row the intake route deferred (or one that never got its inline start): queued and never attempted. */
export function isNeverStarted(row: Pick<FullReportRow, "full_report_status" | "full_report_attempts">): boolean {
  return row.full_report_status === "queued" && (row.full_report_attempts ?? 0) === 0;
}

/**
 * What the cron should look at. Bounded (`limit` each) and newest first so a
 * backlog never starves the founder who just pressed the button.
 */
export async function sweepPendingFullReports(
  opts: {
    limit?: number;
    now?: Date;
    maxAttempts?: number;
    stuckMs?: number;
    /** G25-C: today's free cap is reached — hold never-started rows that have a free grant. */
    holdNeverStartedFree?: boolean;
    /** Injectable for the suite: which analysis ids carry a free grant. */
    grantedIds?: (ids: readonly string[]) => Promise<Set<string>>;
  } = {},
): Promise<PendingSweep> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { runnable: [], emailable: [], heldForCap: [] };
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
  // Partials: backfill only the rows nobody is on (finished_at set, or
  // stuck), under the claim ceiling — the per-section cap does the rest.
  const { data: partial, error: e3 } = await supabase
    .from(ANALYSES_TABLE)
    .select(FULL_REPORT_COLUMNS)
    .eq("full_report_status", "done_partial")
    .lt("full_report_attempts", FULL_REPORT_PARTIAL_MAX_CLAIMS)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (e3) console.error("[first-analysis:sweep] partial query failed —", e3.message);
  let candidates = [
    ...((pending as unknown as FullReportRow[] | null) ?? []).filter((r) =>
      r.full_report_status !== "running" ||
      !r.full_report_started_at ||
      r.full_report_started_at < stuckBefore,
    ),
    ...((partial as unknown as FullReportRow[] | null) ?? []).filter((r) =>
      !r.full_report_started_at ||
      Boolean(r.full_report_finished_at) ||
      r.full_report_started_at < stuckBefore,
    ),
  ];
  // G25-C: over the free cap, never-started rows WITH a free grant wait for
  // tomorrow; an entitled member's row (no grant) and every retry keep going.
  const heldForCap: FullReportRow[] = [];
  if (opts.holdNeverStartedFree) {
    const never = candidates.filter(isNeverStarted);
    if (never.length > 0) {
      let granted = new Set<string>();
      try {
        const lookup = opts.grantedIds ?? (async (ids: readonly string[]) => {
          const { grantedAnalysisIds } = await import("@/lib/reports/free-grants");
          return grantedAnalysisIds(ids);
        });
        granted = await lookup(never.map((r) => r.id));
      } catch (err) {
        console.warn("[first-analysis:sweep] grant lookup failed — holding nothing", err instanceof Error ? err.message : String(err));
      }
      candidates = candidates.filter((r) => {
        if (isNeverStarted(r) && granted.has(r.id)) {
          heldForCap.push(r);
          return false;
        }
        return true;
      });
    }
  }
  const runnable = candidates.slice(0, limit);

  const { data: done, error: e2 } = await supabase
    .from(ANALYSES_TABLE)
    .select(FULL_REPORT_COLUMNS)
    .in("full_report_status", ["done", "done_partial"])
    .is("full_report_emailed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (e2) console.error("[first-analysis:sweep] done query failed —", e2.message);
  const emailable = ((done as unknown as FullReportRow[] | null) ?? [])
    .filter((r) => Boolean(r.full_report_email) || Boolean(r.user_id))
    .slice(0, limit);

  return { runnable, emailable, heldForCap };
}
