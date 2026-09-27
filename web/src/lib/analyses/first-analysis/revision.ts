// G34 F02/S3 — the immutable revision of a finished free /analyze report.
//
// The first-analysis job stores its document on the `analyses` row (no
// svi_snapshots row: a guest has no svi_accounts row and snapshots are
// UNIQUE per account/day). `report_revisions` is keyed on a project (the
// old-version banner and the trend read history per project), so a run is
// committed only when it has a subject the table can key on:
//
//   * a signed-in owner (`analyses.user_id`) — a guest run has no account and
//     no project → skipped ("guest");
//   * `analyses.project_id` (0462, written only when the intake route knew the
//     founder's project) → otherwise skipped ("no_project");
//   * that project belongs to the same user (`projects.user_id`) → otherwise
//     skipped ("project_not_owned"), so no run is attached to a stranger's
//     history.
//
// `account_id` is the project's svi_accounts row when one exists (nullable on
// the table). The project id is read with its own select, so the job's row
// shape (store.ts FULL_REPORT_COLUMNS) is untouched and a database without
// 0462 degrades to "subject_lookup_failed" instead of breaking the job.
// Best-effort end to end: never throws, never blocks the report or its e-mail.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALYSES_TABLE } from "@/lib/analyses/store";
import { commitFinalReport, type CommitFinalReportResult, type CommitSkipReason } from "@/lib/report-v2/commit-final-report";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FullReportRow } from "./store";
import type { FullReportV2Envelope } from "./types";

export type AnalysisRevisionSubject =
  | { ok: true; projectId: string; accountId: string | null }
  | { ok: false; reason: Extract<CommitSkipReason, "guest" | "no_project" | "project_not_owned" | "subject_lookup_failed"> };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Which project (and svi account) a finished analysis's revision belongs to. Never throws. */
export async function resolveAnalysisRevisionSubject(db: SupabaseClient, row: Pick<FullReportRow, "id" | "user_id">): Promise<AnalysisRevisionSubject> {
  const userId = str(row.user_id);
  if (!userId) return { ok: false, reason: "guest" };
  try {
    const { data: a, error: aErr } = await db.from(ANALYSES_TABLE).select("project_id").eq("id", row.id).maybeSingle();
    if (aErr) return { ok: false, reason: "subject_lookup_failed" };
    const projectId = str((a as { project_id?: unknown } | null)?.project_id);
    if (!projectId) return { ok: false, reason: "no_project" };
    const { data: p, error: pErr } = await db.from("projects").select("user_id").eq("id", projectId).maybeSingle();
    if (pErr) return { ok: false, reason: "subject_lookup_failed" };
    if (str((p as { user_id?: unknown } | null)?.user_id) !== userId) return { ok: false, reason: "project_not_owned" };
    let accountId: string | null = null;
    try {
      const { data: acc, error: accErr } = await db
        .from("svi_accounts")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      accountId = accErr ? null : str((acc as { id?: unknown } | null)?.id);
    } catch {
      accountId = null;
    }
    return { ok: true, projectId, accountId };
  } catch {
    return { ok: false, reason: "subject_lookup_failed" };
  }
}

export interface CommitAnalysisRevisionDeps {
  db?: () => SupabaseClient | null;
  commit?: typeof commitFinalReport;
}

/**
 * The job's hook: commit the envelope's final document as an immutable
 * revision when the analysis has a subject. Never throws.
 */
export async function commitFirstAnalysisRevision(
  row: Pick<FullReportRow, "id" | "user_id">,
  envelope: Pick<FullReportV2Envelope, "report">,
  sviVersion: string | undefined,
  deps: CommitAnalysisRevisionDeps = {},
): Promise<CommitFinalReportResult> {
  try {
    const db = (deps.db ?? (() => getSupabaseAdmin() as SupabaseClient | null))();
    if (!db) return { status: "skipped", reason: "no_db" };
    if (!envelope.report) return { status: "skipped", reason: "invalid_document" };
    const subject = await resolveAnalysisRevisionSubject(db, row);
    if (!subject.ok) {
      console.info("[report-v2-job] revision skipped", { analysisId: row.id, reason: subject.reason });
      return { status: "skipped", reason: subject.reason };
    }
    return await (deps.commit ?? commitFinalReport)(db, {
      source: "first_analysis",
      report: envelope.report,
      projectId: subject.projectId,
      accountId: subject.accountId,
      snapshotId: null,
      sviVersion,
    });
  } catch {
    return { status: "failed", reason: "threw" };
  }
}
