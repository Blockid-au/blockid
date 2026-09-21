// The `first-analysis-report` cron's work (S32-B): every 5 minutes, re-run
// jobs that failed or stalled (≤ FULL_REPORT_MAX_ATTEMPTS) and send the
// emails for finished reports whose destination has since become known
// (a guest who gave an email after the job landed; a claim that attached
// the row to an account). `dryRun` lists the candidates and touches
// nothing. Dependencies injected for the colocated suite.
//
// G25-C: the daily platform cap (FREE_REPORTS_DAILY_CAP). While today's free
// submissions are at the cap, rows that have NEVER started (`queued`,
// attempts 0 — the ones the intake route deferred with "we e-mail you when
// it is ready") wait for tomorrow; in-flight, failed and partial rows are
// already paid for and keep going. E-mails are never held back.

import "server-only";

import { deliverAnalysisReport, runAnalysisReportJob } from "./dispatch";
import type { DeliveryOutcome, JobOutcome } from "./job";
import type { ReportV2JobOutcome } from "./report-v2-job";
import { isNeverStarted, sweepPendingFullReports, type FullReportRow } from "./store";

export { isNeverStarted };

/** G28-C: a swept row runs the v2 pipeline (new rows) or the S32 job (pre-G28 rows) — dispatch.ts decides by shape. */
export type SweepRunOutcome = JobOutcome["outcome"] | ReportV2JobOutcome["outcome"] | "started";

export interface SweepSummary {
  ok: boolean;
  dryRun: boolean;
  runnable: { id: string; status: string | null; attempts: number }[];
  emailable: { id: string; hasEmail: boolean; hasUser: boolean }[];
  ran: { id: string; outcome: SweepRunOutcome }[];
  emailed: { id: string; outcome: DeliveryOutcome }[];
  /** G25-C: never-started free rows held back because today's free cap is reached (filtered in the store, before the limit). */
  heldForCap: string[];
  /** G25-C: abandoned reservations (no analysis after an hour) given back this sweep. */
  staleReleased: number;
  error?: string;
}

export interface SweepDeps {
  sweep: (opts: { limit: number; holdNeverStartedFree?: boolean }) => Promise<{ runnable: FullReportRow[]; emailable: FullReportRow[]; heldForCap?: FullReportRow[] }>;
  run: (row: FullReportRow) => Promise<{ outcome: SweepRunOutcome }>;
  deliver: (row: FullReportRow) => Promise<DeliveryOutcome>;
  /** True when today's free submissions are at the platform cap (lib/reports/free-grants freeReportsCapReached). */
  capReached?: () => Promise<boolean>;
  /** Give back reservations whose run never saved (lib/reports/free-grants releaseStaleReservations). */
  releaseStale?: () => Promise<number>;
}

export function defaultSweepDeps(): SweepDeps {
  return {
    sweep: (opts) => sweepPendingFullReports(opts),
    run: (row) => runAnalysisReportJob(row),
    deliver: (row) => deliverAnalysisReport(row),
    capReached: async () => {
      const { freeReportsCapReached } = await import("@/lib/reports/free-grants");
      return freeReportsCapReached();
    },
    releaseStale: async () => {
      const { releaseStaleReservations } = await import("@/lib/reports/free-grants");
      return releaseStaleReservations();
    },
  };
}

export async function sweepFirstAnalysisReports(
  opts: { dryRun?: boolean; limit?: number; awaitRuns?: boolean } = {},
  deps: SweepDeps = defaultSweepDeps(),
): Promise<SweepSummary> {
  const dryRun = Boolean(opts.dryRun);
  const limit = opts.limit ?? 5;
  const summary: SweepSummary = { ok: true, dryRun, runnable: [], emailable: [], ran: [], emailed: [], heldForCap: [], staleReleased: 0 };
  try {
    // One cheap count: is today's free cap reached? The store then holds
    // never-started FREE rows before it slices to `limit`, so retries are
    // never starved by a queue of deferred free runs. A failed read holds
    // nothing (fail open).
    let capReached = false;
    if (deps.capReached) {
      try {
        capReached = await deps.capReached();
      } catch (err) {
        console.warn("[first-analysis:sweep] cap read failed — running", err instanceof Error ? err.message : String(err));
        capReached = false;
      }
    }
    const pending = await deps.sweep({ limit, holdNeverStartedFree: capReached });
    summary.heldForCap = (pending.heldForCap ?? []).map((r) => r.id);
    const runnable = pending.runnable;
    summary.runnable = runnable.map((r) => ({ id: r.id, status: r.full_report_status, attempts: r.full_report_attempts ?? 0 }));
    summary.emailable = pending.emailable.map((r) => ({ id: r.id, hasEmail: Boolean(r.full_report_email), hasUser: Boolean(r.user_id) }));
    if (dryRun) return summary;

    // Abandoned reservations (a run that reserved a free report and never
    // saved) are given back so the address is not out of pocket. Best effort.
    if (deps.releaseStale) {
      try {
        summary.staleReleased = await deps.releaseStale();
      } catch (err) {
        console.warn("[first-analysis:sweep] stale release failed", err instanceof Error ? err.message : String(err));
      }
    }

    // Emails first: they are cheap and the founder is waiting on them.
    for (const row of pending.emailable) {
      try {
        summary.emailed.push({ id: row.id, outcome: await deps.deliver(row) });
      } catch (err) {
        console.error("[first-analysis:sweep] deliver threw —", err, { analysisId: row.id });
        summary.emailed.push({ id: row.id, outcome: "send_failed" });
      }
    }
    // G28-C: a v2 run takes up to ~8 min (the ReportV2 pipeline) — far past
    // the cron route's 290 s clamp. The sweep starts the runs and returns;
    // each job claims its row (state machine) so the next tick never
    // double-runs it, and progress / delivery land server-side. `awaitRuns`
    // keeps the old synchronous behaviour for tests and one-off scripts.
    if (opts.awaitRuns) {
      for (const row of runnable) {
        try {
          const out = await deps.run(row);
          summary.ran.push({ id: row.id, outcome: out.outcome });
        } catch (err) {
          console.error("[first-analysis:sweep] run threw —", err, { analysisId: row.id });
          summary.ran.push({ id: row.id, outcome: "failed" });
        }
      }
    } else {
      for (const row of runnable) {
        void deps.run(row).catch((err: unknown) => {
          console.error("[first-analysis:sweep] run threw —", err, { analysisId: row.id });
        });
        summary.ran.push({ id: row.id, outcome: "started" });
      }
    }
    return summary;
  } catch (err) {
    summary.ok = false;
    summary.error = err instanceof Error ? err.message : String(err);
    return summary;
  }
}
