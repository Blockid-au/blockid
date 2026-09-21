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

import { deliverFullReport, makeAgentCaller, defaultDeps, runFirstAnalysisJob, type DeliveryOutcome, type JobOutcome } from "./job";
import { sweepPendingFullReports, type FullReportRow } from "./store";

export interface SweepSummary {
  ok: boolean;
  dryRun: boolean;
  runnable: { id: string; status: string | null; attempts: number }[];
  emailable: { id: string; hasEmail: boolean; hasUser: boolean }[];
  ran: { id: string; outcome: JobOutcome["outcome"] }[];
  emailed: { id: string; outcome: DeliveryOutcome }[];
  /** G25-C: never-started rows held back because today's free cap is reached. */
  heldForCap: string[];
  error?: string;
}

export interface SweepDeps {
  sweep: (opts: { limit: number }) => Promise<{ runnable: FullReportRow[]; emailable: FullReportRow[] }>;
  run: (row: FullReportRow) => Promise<JobOutcome>;
  deliver: (row: FullReportRow) => Promise<DeliveryOutcome>;
  /** True when today's free submissions are at the platform cap (lib/reports/free-grants freeReportsCapReached). */
  capReached?: () => Promise<boolean>;
}

/** A row the intake route deferred (or one that never got its inline start): queued and never attempted. */
export function isNeverStarted(row: Pick<FullReportRow, "full_report_status" | "full_report_attempts">): boolean {
  return row.full_report_status === "queued" && (row.full_report_attempts ?? 0) === 0;
}

export function defaultSweepDeps(): SweepDeps {
  return {
    sweep: (opts) => sweepPendingFullReports(opts),
    run: (row) => {
      const deps = defaultDeps();
      deps.callAgent = makeAgentCaller(row.user_id);
      return runFirstAnalysisJob(row.id, deps);
    },
    deliver: (row) => (row.full_report_json ? deliverFullReport(row, row.full_report_json) : Promise.resolve("skipped")),
    capReached: async () => {
      const { freeReportsCapReached } = await import("@/lib/reports/free-grants");
      return freeReportsCapReached();
    },
  };
}

export async function sweepFirstAnalysisReports(
  opts: { dryRun?: boolean; limit?: number } = {},
  deps: SweepDeps = defaultSweepDeps(),
): Promise<SweepSummary> {
  const dryRun = Boolean(opts.dryRun);
  const limit = opts.limit ?? 5;
  const summary: SweepSummary = { ok: true, dryRun, runnable: [], emailable: [], ran: [], emailed: [], heldForCap: [] };
  try {
    const pending = await deps.sweep({ limit });
    // Cap check only when a never-started row is waiting — one cheap count.
    let capReached = false;
    if (deps.capReached && pending.runnable.some(isNeverStarted)) {
      try {
        capReached = await deps.capReached();
      } catch (err) {
        console.warn("[first-analysis:sweep] cap read failed — running", err instanceof Error ? err.message : String(err));
        capReached = false;
      }
    }
    const runnable = pending.runnable.filter((r) => {
      if (capReached && isNeverStarted(r)) {
        summary.heldForCap.push(r.id);
        return false;
      }
      return true;
    });
    summary.runnable = runnable.map((r) => ({ id: r.id, status: r.full_report_status, attempts: r.full_report_attempts ?? 0 }));
    summary.emailable = pending.emailable.map((r) => ({ id: r.id, hasEmail: Boolean(r.full_report_email), hasUser: Boolean(r.user_id) }));
    if (dryRun) return summary;

    // Emails first: they are cheap and the founder is waiting on them.
    for (const row of pending.emailable) {
      try {
        summary.emailed.push({ id: row.id, outcome: await deps.deliver(row) });
      } catch (err) {
        console.error("[first-analysis:sweep] deliver threw —", err, { analysisId: row.id });
        summary.emailed.push({ id: row.id, outcome: "send_failed" });
      }
    }
    for (const row of runnable) {
      try {
        const out = await deps.run(row);
        summary.ran.push({ id: row.id, outcome: out.outcome });
      } catch (err) {
        console.error("[first-analysis:sweep] run threw —", err, { analysisId: row.id });
        summary.ran.push({ id: row.id, outcome: "failed" });
      }
    }
    return summary;
  } catch (err) {
    summary.ok = false;
    summary.error = err instanceof Error ? err.message : String(err);
    return summary;
  }
}
