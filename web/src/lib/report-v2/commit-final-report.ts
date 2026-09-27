// commitFinalReport — G34 F02/S3: the ONE path every finished ReportV2 takes
// into immutable history (`report_revisions`, pending-authority 0461).
//
// Before S3 only the two snapshot writers (run-report-pipeline, run-for-
// project) called `insertImmutableReportRevision`; a paid order, a free
// /analyze first analysis and a pitch-deck snapshot left no revision, so they
// had no old-version view, no score history and no trend. Every writer now
// hands its final document here:
//
//   writer                        snapshot   project   on failure
//   run-report-pipeline (stream)  yes        yes       caller reports save status
//   run-for-project (evaluator)   yes        yes       caller throws (fail closed)
//   paywall report-generator      —          yes       best-effort, order stays READY
//   first-analysis report-v2-job  —          if linked best-effort, delivery unaffected
//   pitchdeck save-snapshot       yes        if known  best-effort, response unaffected
//
// The function NEVER throws: it returns committed / skipped / failed and the
// caller decides whether that blocks anything. Best-effort writers ignore the
// result; the two stream / evaluator writers keep their fail-closed contract.
//
// The document is stamped with SV2 `methodMeta` (idempotent — a document the
// caller already stamped is unchanged, so a snapshot projection and its
// revision stay byte-identical) before the sorted-key hash
// (`revision-hash.ts`) is taken inside `insertImmutableReportRevision`. The
// trend (trend.ts) compares that stamp between consecutive revisions.
//
// A revision is keyed on its project: the old-version banner
// (revision-position.ts) and the trend read history per project. A report
// with no project (a guest first analysis, a signed-in run not linked to a
// project, a deck with no project) is skipped — there is no subject to hang
// the history on, and inventing one would merge unrelated businesses.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withMethodMeta } from "./method-meta";
import { isReportV2, type ReportV2 } from "./schema";
import { insertImmutableReportRevision } from "./storage";

export type FinalReportSource = "stream_pipeline" | "project_pipeline" | "paid_order" | "first_analysis" | "pitchdeck_snapshot";

export type CommitSkipReason =
  /** No database client (Supabase not configured). */
  | "no_db"
  /** No project to key the history on (guest / unlinked run). */
  | "no_project"
  /** A first analysis with no signed-in owner. */
  | "guest"
  /** The analysis names a project its user does not own — never attach history to it. */
  | "project_not_owned"
  /** The subject lookup failed (DB error / column missing before its migration). */
  | "subject_lookup_failed"
  /** The document failed ReportV2 validation. */
  | "invalid_document";

export type CommitFinalReportResult =
  | { status: "committed"; revisionId: string; shareToken: string; report: ReportV2 }
  | { status: "skipped"; reason: CommitSkipReason }
  | { status: "failed"; reason: "unconfirmed" | "threw" };

export interface CommitFinalReportArgs {
  source: FinalReportSource;
  /** The final document exactly as the writer stored (or is about to store) it. */
  report: ReportV2;
  projectId: string | null | undefined;
  accountId?: string | null;
  /** The daily snapshot projection, when the writer has one. */
  snapshotId?: string | null;
  /** The SVIAnalysis version behind `cover.svi.total` (SV2 `svi_method`). */
  sviVersion?: string;
}

export interface CommitFinalReportDeps {
  insert?: typeof insertImmutableReportRevision;
}

type Db = SupabaseClient;

function log(level: "info" | "warn", result: CommitFinalReportResult, source: FinalReportSource): void {
  const detail = result.status === "committed" ? { revisionId: result.revisionId } : { reason: result.reason };
  try {
    console[level](`[report-v2] final report revision ${result.status}`, { source, ...detail });
  } catch {
    /* logging never matters more than the report */
  }
}

/** Commit one finished report as an immutable revision. Never throws. */
export async function commitFinalReport(db: Db | null | undefined, args: CommitFinalReportArgs, deps: CommitFinalReportDeps = {}): Promise<CommitFinalReportResult> {
  let result: CommitFinalReportResult;
  try {
    if (!db) result = { status: "skipped", reason: "no_db" };
    else if (typeof args.projectId !== "string" || !args.projectId.trim()) result = { status: "skipped", reason: "no_project" };
    else if (!args.report || !isReportV2(args.report)) result = { status: "skipped", reason: "invalid_document" };
    else {
      const report = withMethodMeta(args.report, args.sviVersion);
      const insert = deps.insert ?? insertImmutableReportRevision;
      const revision = await insert(db, {
        snapshotId: args.snapshotId || null,
        accountId: args.accountId || null,
        projectId: args.projectId,
        report,
      });
      result = revision ? { status: "committed", revisionId: revision.revisionId, shareToken: revision.shareToken, report } : { status: "failed", reason: "unconfirmed" };
    }
  } catch {
    result = { status: "failed", reason: "threw" };
  }
  log(result.status === "failed" ? "warn" : "info", result, args?.source ?? "stream_pipeline");
  return result;
}
