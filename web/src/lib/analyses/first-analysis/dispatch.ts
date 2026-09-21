// Which job an `analyses` row runs (G28-C, 2026-09-21).
//
// Two runners share the S32 columns and state machine:
//   * `./report-v2-job.ts` — the ReportV2 pipeline (the paid Trusted Business
//     Report's `orchestrateReport`); EVERY row started since G28 — a free
//     grant (guest or account) or an entitled member's intake run;
//   * `./job.ts` — the S32 seven-voice first analysis; kept ONLY for rows
//     that already hold a v1 `FirstAnalysisReport` (written before G28):
//     their `done_partial` backfills, retries and e-mails.
// The stored shape decides (`reportPathFor`): a row with no report yet, or a
// v2 envelope, is v2. Nothing starts an S32 job for a fresh row any more.
//
// Every caller — the intake route's fire-and-forget start, the poll route's
// re-kick, the 5-minute cron, the resend button, the free-summary e-mail —
// goes through these two functions so no surface can pick the wrong runner.

import "server-only";

import { deliverFullReport, runFirstAnalysisJob, defaultDeps, makeAgentCaller, startFirstAnalysisJob, type DeliveryOutcome, type JobOutcome } from "./job";
import { defaultReportV2Deps, deliverReportV2, makeReportCaller, runReportV2Job, startReportV2Job, type ReportV2JobOutcome } from "./report-v2-job";
import type { FullReportRow } from "./store";
import { isFirstAnalysisReport, isReportV2Envelope, reportPathFor } from "./types";

export { reportPathFor };

/** Fire-and-forget start for a row whose shape is known (the poll route, the cron) or fresh (the intake route → v2). */
export function startAnalysisReportJob(id: string, opts: { userId?: string | null; json?: unknown } = {}): void {
  if (reportPathFor(opts.json) === "s32") startFirstAnalysisJob(id, { userId: opts.userId });
  else startReportV2Job(id, { userId: opts.userId });
}

/** Awaited run for the cron. */
export async function runAnalysisReportJob(row: FullReportRow): Promise<JobOutcome | ReportV2JobOutcome> {
  if (reportPathFor(row.full_report_json) === "s32") {
    const deps = defaultDeps();
    deps.callAgent = makeAgentCaller(row.user_id);
    return runFirstAnalysisJob(row.id, deps);
  }
  const deps = defaultReportV2Deps();
  deps.callAI = makeReportCaller(row.user_id ?? null);
  return runReportV2Job(row.id, deps);
}

/** E-mail whatever document the row holds (send-once unless `force`). `skipped` when there is nothing to send. */
export async function deliverAnalysisReport(row: FullReportRow, opts: { force?: boolean } = {}): Promise<DeliveryOutcome> {
  const json = row.full_report_json;
  if (isReportV2Envelope(json)) return deliverReportV2(row, json, opts);
  if (isFirstAnalysisReport(json)) return deliverFullReport(row, json, opts);
  return "skipped";
}
