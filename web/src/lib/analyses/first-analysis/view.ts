// The gated view of a first-analysis job (S32-B). Pure: the poll route
// and its test build it from a row without a database.
//
// Gate: a guest who has not yet given an email at the free-summary card
// sees the PREVIEW — input echo, SVI, valuation, one CEO paragraph — and
// `locked: true`. A signed-in owner, or a guest who has given an email,
// sees the whole report as it streams in. The gate is the existing one
// (the email ask after the answer); nothing new is walled.

import { maskSummaryEmail } from "@/lib/analyses/free-summary";
import type { FullReportRow } from "./store";
import {
  firstParagraph,
  isFirstAnalysisReport,
  isReportV2Envelope,
  normaliseAgentSections,
  reportPathFor,
  type FirstAnalysisPreview,
  type FirstAnalysisReport,
  type FirstAnalysisReportView,
  type FullReportView,
} from "./types";

/** Seconds between polls while a partial report is being backfilled by the 5-min cron. */
export const PARTIAL_POLL_SEC = 20;

export function isFullReportLocked(row: Pick<FullReportRow, "user_id" | "full_report_email">): boolean {
  return !row.user_id && !row.full_report_email;
}

/** G28-C: poll cadence while the ReportV2 pipeline runs (one document lands at the end, ~2–8 min). */
export const V2_RUNNING_POLL_SEC = 5;

export function pollAfterSecFor(row: Pick<FullReportRow, "full_report_status" | "full_report_json">): number {
  const status = row.full_report_status;
  if (status === "done" || status === "failed" || status === null) return 0;
  const json = row.full_report_json;
  if (isReportV2Envelope(json) || !json) {
    // A v2 run (or a never-started row, which becomes one): no per-section
    // streaming, so a steady cadence until the document lands.
    return status === "running" ? V2_RUNNING_POLL_SEC : 4;
  }
  const queued = json.progress?.queuedForSec;
  if (typeof queued === "number" && queued > 0) return Math.min(15, Math.max(3, queued));
  if (status === "done_partial") {
    // In flight (a backfill is writing) → the streaming cadence; otherwise
    // the cron cadence, so the sections appear without a reload.
    return json.progress?.current ? 3 : PARTIAL_POLL_SEC;
  }
  return status === "running" ? 3 : 4;
}

/** One shape for the payload's `report.agents`: every voice, always an object. */
export function toReportView(report: FirstAnalysisReport | null): FirstAnalysisReportView | null {
  if (!report) return null;
  return { ...report, agents: normaliseAgentSections(report) };
}

export function buildPreview(row: Pick<FullReportRow, "full_report_json">): FirstAnalysisPreview | null {
  const r = isFirstAnalysisReport(row.full_report_json) ? row.full_report_json : null;
  if (!r) return null;
  return {
    company: r.company,
    echo: r.echo,
    svi: r.svi,
    valuation: r.valuation,
    ceoParagraph: firstParagraph(r.agents?.ceo?.body),
  };
}

export function buildFullReportView(row: FullReportRow): FullReportView {
  const locked = isFullReportLocked(row);
  const emailTo = row.full_report_email ? maskSummaryEmail(row.full_report_email) : null;
  const json = row.full_report_json;
  const kind = reportPathFor(json);
  const envelope = isReportV2Envelope(json) ? json : null;
  return {
    status: row.full_report_status,
    locked,
    kind,
    // The v3 document is never a preview: a v2 row always has a destination
    // (G25-C requires the address before the run) or an owner, so `locked`
    // is false for it in practice; the gate still applies by construction.
    reportV2: locked ? null : (envelope?.report ?? null),
    progressV2: envelope?.progress ?? null,
    report: locked || !isFirstAnalysisReport(json) ? null : toReportView(json),
    preview: buildPreview(row),
    emailedAt: row.full_report_emailed_at,
    emailTo,
    attempts: row.full_report_attempts ?? 0,
    error: row.full_report_status === "failed" || row.full_report_status === "done_partial" ? row.full_report_error : null,
    pollAfterSec: pollAfterSecFor(row),
  };
}
