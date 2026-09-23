// ReportV2 storage helpers — server only.
//
// Migration 0395 adds `svi_snapshots.report_v2` and
// `assembled_reports.report_json` (both nullable jsonb). Migrations are
// applied by hand after deploy, so BOTH helpers must work while the columns
// do not exist yet:
//   - reads run a SEPARATE single-column select and swallow the error, so
//     the main snapshot query (which never names the new column) keeps
//     working;
//   - writes are a best-effort UPDATE after the row exists — never part of
//     the INSERT — so a missing column can never break snapshot creation.
// Legacy callers fall back to `adapter.ts` when the read returns null.
// New assembled generations use insertCompletedAssembledReport: a complete row
// without its confirmed canonical document is no longer an accepted result.
//
// G19-S47: every read returns the document with `executive.structured`
// present (a pre-S47 row is parsed on read — `executive-structure.ts`).

import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureExecutiveStructured } from "./executive-structure";
import { isReportV2, type ReportV2 } from "./schema";

type Db = SupabaseClient;

let warnedMissingColumn = false;
function noteMissingColumn(table: string, column: string, message: string): void {
  if (warnedMissingColumn) return;
  warnedMissingColumn = true;
  console.warn(`[report-v2] ${table}.${column} unavailable (${message}) — apply web/supabase/migrations/0395_report_v2_columns.sql (svi_snapshots / assembled_reports) or 0401_evaluation_reports_report_v2.sql (evaluation_reports); falling back to the read-time adapter until then.`);
}

function isMissingColumn(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  // PostgREST: "column svi_snapshots.report_v2 does not exist" / "Could not
  // find the 'report_v2' column of 'svi_snapshots' in the schema cache".
  // A bare "column" match swallowed every other failure (size, format) as
  // "apply 0395" — require the missing-column phrasing.
  return m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache");
}

/** New report rows and their canonical document commit in one database statement.
 * No best-effort projection: absence, mismatch or an ambiguous response fails closed.
 * This does not make subsequent writes immutable or reconcile an unknown commit.
 */
export async function insertCompletedAssembledReport(db: Db, row: Record<string, unknown>, report: ReportV2): Promise<boolean> {
  if (typeof row.id !== "string" || !row.id) return false;
  try {
    const document = JSON.parse(JSON.stringify({ ...report, reportId: row.id }));
    if (!isReportV2(document)) return false;
    const { data, error } = await db.from("assembled_reports")
      .insert({ ...row, report_json: document, status: "complete" })
      .select("id,status,report_json").single();
    if (error) {
      console.warn("[report-v2] atomic assembled report insert failed:", error.code);
      return false;
    }
    return data?.id === row.id && data.status === "complete" && isDeepStrictEqual(data.report_json, document);
  } catch {
    console.warn("[report-v2] atomic assembled report persistence could not be confirmed");
    return false;
  }
}

/**
 * Commit one immutable public revision after the mutable daily projection has
 * been confirmed.  A new UUID/token is minted for every finalized document;
 * the existing snapshot token remains a legacy projection and is never
 * rewritten.  Fail closed when the authority table is unavailable or the
 * read-back does not match, so callers cannot publish a mutable link while
 * claiming immutable history.
 */
export async function insertImmutableReportRevision(
  db: Db,
  args: {
    snapshotId: string;
    accountId: string;
    projectId: string;
    report: ReportV2;
  },
): Promise<{ revisionId: string; shareToken: string } | null> {
  if (!args.snapshotId || !args.accountId || !args.projectId || !isReportV2(args.report)) return null;
  const revisionId = randomUUID();
  const shareToken = nanoid(32);
  const document = JSON.parse(JSON.stringify(args.report));
  try {
    const { data, error } = await db
      .from("report_revisions")
      .insert({
        id: revisionId,
        snapshot_id: args.snapshotId,
        account_id: args.accountId,
        project_id: args.projectId,
        share_token: shareToken,
        report_json: document,
        report_hash: null,
        schema_version: "2.0",
      })
      .select("id, share_token, report_json, revoked_at")
      .single();
    if (error || !data || data.id !== revisionId || data.share_token !== shareToken || data.revoked_at !== null) {
      console.warn("[report-v2] immutable revision insert/read-back failed:", error?.message ?? "mismatch");
      return null;
    }
    if (!isDeepStrictEqual(data.report_json, document)) {
      console.warn("[report-v2] immutable revision document read-back mismatch");
      return null;
    }
    return { revisionId, shareToken };
  } catch (err) {
    console.warn("[report-v2] immutable revision insert threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Stored `svi_snapshots.report_v2` when present and valid, else null. */
export async function readSnapshotReportV2(db: Db, snapshotId: string): Promise<ReportV2 | null> {
  try {
    const { data, error } = await db.from("svi_snapshots").select("report_v2").eq("id", snapshotId).maybeSingle();
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("svi_snapshots", "report_v2", error.message);
      return null;
    }
    const stored = (data as { report_v2?: unknown } | null)?.report_v2;
    return stored && isReportV2(stored) ? ensureExecutiveStructured(stored) : null;
  } catch {
    return null;
  }
}

/** Best-effort write of `svi_snapshots.report_v2`; returns true when stored. */
export async function writeSnapshotReportV2(db: Db, snapshotId: string, report: ReportV2): Promise<boolean> {
  try {
    const { data, error } = await db.from("svi_snapshots").update({ report_v2: report }).eq("id", snapshotId).select("id").maybeSingle();
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("svi_snapshots", "report_v2", error.message);
      else console.warn("[report-v2] svi_snapshots.report_v2 write failed:", error.message);
      return false;
    }
    return data?.id === snapshotId;
  } catch (err) {
    console.warn("[report-v2] svi_snapshots.report_v2 write threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Best-effort write of `assembled_reports.report_json`; returns true when stored. */
export async function writeAssembledReportJson(db: Db, reportId: string, report: ReportV2): Promise<boolean> {
  try {
    const { error } = await db.from("assembled_reports").update({ report_json: report }).eq("id", reportId);
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("assembled_reports", "report_json", error.message);
      else console.warn("[report-v2] assembled_reports.report_json write failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[report-v2] assembled_reports.report_json write threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Stored `assembled_reports.report_json` when present and valid, else null. */
export async function readAssembledReportJson(db: Db, reportId: string): Promise<ReportV2 | null> {
  try {
    const { data, error } = await db.from("assembled_reports").select("report_json").eq("id", reportId).maybeSingle();
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("assembled_reports", "report_json", error.message);
      return null;
    }
    const stored = (data as { report_json?: unknown } | null)?.report_json;
    return stored && isReportV2(stored) ? ensureExecutiveStructured(stored) : null;
  } catch {
    return null;
  }
}

/** Best-effort write of `evaluation_reports.report_v2` (migration 0401, S-R4); returns true when stored. */
export async function writeEvaluationReportV2(db: Db, evaluationReportId: string, report: ReportV2): Promise<boolean> {
  try {
    const { error } = await db.from("evaluation_reports").update({ report_v2: report }).eq("id", evaluationReportId);
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("evaluation_reports", "report_v2", error.message);
      else console.warn("[report-v2] evaluation_reports.report_v2 write failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[report-v2] evaluation_reports.report_v2 write threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Stored `evaluation_reports.report_v2` when present and valid, else null. */
export async function readEvaluationReportV2(db: Db, evaluationReportId: string): Promise<ReportV2 | null> {
  try {
    const { data, error } = await db.from("evaluation_reports").select("report_v2").eq("id", evaluationReportId).maybeSingle();
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("evaluation_reports", "report_v2", error.message);
      return null;
    }
    const stored = (data as { report_v2?: unknown } | null)?.report_v2;
    return stored && isReportV2(stored) ? ensureExecutiveStructured(stored) : null;
  } catch {
    return null;
  }
}

/** Test seam. */
export function __resetReportV2StorageWarnings(): void {
  warnedMissingColumn = false;
}
