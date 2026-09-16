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
// Callers fall back to `adapter.ts` when the read returns null.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isReportV2, type ReportV2 } from "./schema";

type Db = SupabaseClient;

let warnedMissingColumn = false;
function noteMissingColumn(table: string, column: string, message: string): void {
  if (warnedMissingColumn) return;
  warnedMissingColumn = true;
  console.warn(`[report-v2] ${table}.${column} unavailable (${message}) — apply web/supabase/migrations/0395_report_v2_columns.sql; falling back to the read-time adapter until then.`);
}

function isMissingColumn(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache") || m.includes("column");
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
    return stored && isReportV2(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Best-effort write of `svi_snapshots.report_v2`; returns true when stored. */
export async function writeSnapshotReportV2(db: Db, snapshotId: string, report: ReportV2): Promise<boolean> {
  try {
    const { error } = await db.from("svi_snapshots").update({ report_v2: report }).eq("id", snapshotId);
    if (error) {
      if (isMissingColumn(error.message)) noteMissingColumn("svi_snapshots", "report_v2", error.message);
      else console.warn("[report-v2] svi_snapshots.report_v2 write failed:", error.message);
      return false;
    }
    return true;
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
    return stored && isReportV2(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Test seam. */
export function __resetReportV2StorageWarnings(): void {
  warnedMissingColumn = false;
}
