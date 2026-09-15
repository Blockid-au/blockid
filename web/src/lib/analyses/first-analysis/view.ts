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
import { firstParagraph, type FirstAnalysisPreview, type FullReportView } from "./types";

export function isFullReportLocked(row: Pick<FullReportRow, "user_id" | "full_report_email">): boolean {
  return !row.user_id && !row.full_report_email;
}

export function pollAfterSecFor(row: Pick<FullReportRow, "full_report_status" | "full_report_json">): number {
  const status = row.full_report_status;
  if (status === "done" || status === "failed" || status === null) return 0;
  const queued = row.full_report_json?.progress?.queuedForSec;
  if (typeof queued === "number" && queued > 0) return Math.min(15, Math.max(3, queued));
  return status === "running" ? 3 : 4;
}

export function buildPreview(row: Pick<FullReportRow, "full_report_json">): FirstAnalysisPreview | null {
  const r = row.full_report_json;
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
  return {
    status: row.full_report_status,
    locked,
    report: locked ? null : row.full_report_json,
    preview: buildPreview(row),
    emailedAt: row.full_report_emailed_at,
    emailTo,
    attempts: row.full_report_attempts ?? 0,
    error: row.full_report_status === "failed" ? row.full_report_error : null,
    pollAfterSec: pollAfterSecFor(row),
  };
}
