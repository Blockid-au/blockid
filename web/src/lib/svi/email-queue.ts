// Report-email queue (G13-W5-R5 / S-R5, W4-review follow-up (b)).
//
// `sendReportEmail` (lib/svi/email-report.ts) renders the full TBR PDF and
// rasterises three visuals with sharp — 5–8 s of CPU. Until S-R5 that ran
// inside the SSE stream request's fire-and-forget, so the Node process was
// still busy long after the founder's stream closed. Now the pipeline only
// stamps `svi_snapshots.report_email_queued_at` (one cheap UPDATE) and the
// `report-email-sweep` cron (every 5 min) does the render + send off the
// request path, through the same `sendReportEmail` (which still stamps
// `report_email_sent_at`, the idempotency marker).
//
// Rollback / pre-migration: when the column does not exist yet (0402 not
// applied) `queueReportEmail` reports `not_migrated` and the pipeline falls
// back to the in-process send it always did.

import type { SendReportEmailArgs, SendReportEmailResult } from "./email-report";

export const REPORT_EMAIL_QUEUE_COLUMN = "report_email_queued_at";
export const REPORT_EMAIL_MAX_AGE_HOURS = 48;
export const REPORT_EMAIL_SWEEP_LIMIT = 5;

type Row = Record<string, unknown>;

export interface EmailQueueDb {
  from(table: string): {
    update(patch: Row): {
      eq(col: string, v: string): {
        is(col: string, v: null): { select(cols: string): { maybeSingle(): PromiseLike<{ data: Row | null; error: { message: string; code?: string } | null }> } };
      };
    };
    select(cols: string): {
      not(col: string, op: string, v: null): { is(col: string, v: null): { order(col: string, o: { ascending: boolean }): { limit(n: number): PromiseLike<{ data: Row[] | null; error: { message: string; code?: string } | null }> } } };
      eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: Row | null; error: { message: string } | null }> };
    };
  };
}

export function isMissingQueueColumn(err: { message: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /report_email_queued_at|column .* does not exist|schema cache/i.test(err.message);
}

/** Stamp the snapshot as awaiting its email. No-op when already sent. */
export async function queueReportEmail(db: EmailQueueDb, snapshotId: string | null | undefined, now: Date = new Date()): Promise<{ queued: true } | { queued: false; reason: "no_snapshot" | "already_sent" | "not_migrated" | "error"; error?: string }> {
  if (!snapshotId) return { queued: false, reason: "no_snapshot" };
  try {
    const { data, error } = await db.from("svi_snapshots").update({ [REPORT_EMAIL_QUEUE_COLUMN]: now.toISOString() }).eq("id", snapshotId).is("report_email_sent_at", null).select("id").maybeSingle();
    if (error) return isMissingQueueColumn(error) ? { queued: false, reason: "not_migrated", error: error.message } : { queued: false, reason: "error", error: error.message };
    if (!data) return { queued: false, reason: "already_sent" };
    return { queued: true };
  } catch (err) {
    return { queued: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SweepDeps {
  sender?: (args: SendReportEmailArgs) => Promise<SendReportEmailResult>;
  now?: () => Date;
  limit?: number;
  maxAgeHours?: number;
  baseUrl?: string;
}

export interface SweepSummary {
  ok: boolean;
  dryRun: boolean;
  candidates: number;
  sent: string[];
  skipped: Array<{ id: string; reason: string }>;
  failed: Array<{ id: string; reason: string }>;
  error?: string;
}

const UNRETRYABLE = new Set(["no_email", "already_sent"]);

async function clearQueue(db: EmailQueueDb, id: string): Promise<void> {
  await db.from("svi_snapshots").update({ [REPORT_EMAIL_QUEUE_COLUMN]: null }).eq("id", id).is("report_email_sent_at", null).select("id").maybeSingle();
}

/** Render + send every queued, unsent snapshot (oldest first, `limit` per tick). */
export async function sweepReportEmails(db: EmailQueueDb, opts: { dryRun?: boolean } = {}, deps: SweepDeps = {}): Promise<SweepSummary> {
  const now = deps.now ?? (() => new Date());
  const dryRun = opts.dryRun === true;
  const summary: SweepSummary = { ok: true, dryRun, candidates: 0, sent: [], skipped: [], failed: [] };
  const limit = deps.limit ?? REPORT_EMAIL_SWEEP_LIMIT;
  const { data, error } = await db
    .from("svi_snapshots")
    .select(`id, project_id, account_id, analysis_json, ${REPORT_EMAIL_QUEUE_COLUMN}`)
    .not(REPORT_EMAIL_QUEUE_COLUMN, "is", null)
    .is("report_email_sent_at", null)
    .order(REPORT_EMAIL_QUEUE_COLUMN, { ascending: true })
    .limit(limit);
  if (error) {
    summary.ok = !isMissingQueueColumn(error) ? false : true;
    summary.error = isMissingQueueColumn(error) ? "not_migrated" : error.message;
    return summary;
  }
  const rows = (data ?? []) as Row[];
  summary.candidates = rows.length;
  const maxAgeMs = (deps.maxAgeHours ?? REPORT_EMAIL_MAX_AGE_HOURS) * 3_600_000;
  let sender = deps.sender;
  for (const row of rows) {
    const id = String(row.id);
    const queuedAt = typeof row[REPORT_EMAIL_QUEUE_COLUMN] === "string" ? Date.parse(String(row[REPORT_EMAIL_QUEUE_COLUMN])) : NaN;
    if (Number.isFinite(queuedAt) && now().getTime() - queuedAt > maxAgeMs) {
      summary.skipped.push({ id, reason: "expired" });
      if (!dryRun) await clearQueue(db, id);
      continue;
    }
    const projectId = typeof row.project_id === "string" ? row.project_id : null;
    let userId: string | null = null;
    if (projectId) {
      const { data: project } = await db.from("projects").select("user_id").eq("id", projectId).maybeSingle();
      userId = typeof project?.user_id === "string" ? project.user_id : null;
    }
    if (!userId) {
      summary.skipped.push({ id, reason: "no_owner" });
      if (!dryRun) await clearQueue(db, id);
      continue;
    }
    if (dryRun) {
      summary.skipped.push({ id, reason: "dry_run" });
      continue;
    }
    const analysis = (row.analysis_json ?? {}) as Row;
    try {
      if (!sender) {
        const mod = await import("./email-report");
        sender = mod.sendReportEmail;
      }
      const res = await sender({
        userId,
        projectId,
        snapshotId: id,
        dimResults: {},
        criterionResults: [],
        industry: typeof analysis.industry === "string" ? analysis.industry : null,
        stage: typeof analysis.stageLabel === "string" ? analysis.stageLabel : null,
        baseUrl: deps.baseUrl,
      });
      if (res.ok) {
        summary.sent.push(id);
        // sendReportEmail stamps report_email_sent_at; already_sent rows just drop out of the queue.
        if (res.reason === "already_sent") await clearQueue(db, id);
      } else if (res.reason && UNRETRYABLE.has(res.reason)) {
        summary.skipped.push({ id, reason: res.reason });
        await clearQueue(db, id);
      } else {
        summary.failed.push({ id, reason: res.reason ?? "send_failed" });
      }
    } catch (err) {
      summary.failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}
