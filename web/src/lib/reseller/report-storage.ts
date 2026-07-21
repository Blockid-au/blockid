// Reseller monthly report Storage helpers (P7.2).
//
// Pure helpers (no Supabase dependency) so retention windowing + download
// filename derivation can be unit-tested in isolation. The cron and the
// signed-URL route call into these to compute keys/paths, then invoke
// supabase.storage.* directly. See docs/plans/reseller-module-plan.md § C.6
// (retention) + § P7_kpi_reports.

export const REPORT_BUCKET = "reseller-reports";
export const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
export const RETENTION_EXPOSED_MONTHS = 12;
export const RETENTION_HARD_MONTHS = 24;

/** Deterministic storage object key for a reseller's monthly report. */
export function buildStoragePath(resellerId: string, monthKey: string): string {
  return `${resellerId}/${monthKey}.csv`;
}

/** User-facing filename served with the signed URL. */
export function buildDownloadFilename(
  displayNameOrCode: string,
  monthKey: string,
): string {
  const slug = displayNameOrCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const safe = slug || "reseller";
  return `blockid-${safe}-${monthKey}.csv`;
}

/** Convert a YYYY-MM key to a comparable integer YYYYMM. */
export function monthKeyToInt(monthKey: string): number {
  const [y, m] = monthKey.split("-");
  return Number(y) * 100 + Number(m);
}

/** YYYY-MM key N whole calendar months before `now` (UTC). N=0 = current. */
export function monthKeyOffset(now: Date, offset: number): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const target = new Date(Date.UTC(y, m - offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Cutoffs: reports with month_key >= exposedMinKey are user-visible; reports with month_key < hardMinKey are purged. */
export function computeRetentionWindow(now: Date = new Date()): {
  exposedMinKey: string;
  hardMinKey: string;
} {
  return {
    exposedMinKey: monthKeyOffset(now, RETENTION_EXPOSED_MONTHS - 1),
    hardMinKey: monthKeyOffset(now, RETENTION_HARD_MONTHS - 1),
  };
}

export interface ReportFileMeta {
  month_key: string;
}

/** Filter report metadata down to the exposed (last 12 months) window. */
export function filterVisibleReports<T extends ReportFileMeta>(
  files: T[],
  now: Date = new Date(),
): T[] {
  const { exposedMinKey } = computeRetentionWindow(now);
  const cutoff = monthKeyToInt(exposedMinKey);
  return files.filter((f) => monthKeyToInt(f.month_key) >= cutoff);
}

/** Return files whose month_key is older than the 24-month hard retention. */
export function selectExpiredReports<T extends ReportFileMeta>(
  files: T[],
  now: Date = new Date(),
): T[] {
  const { hardMinKey } = computeRetentionWindow(now);
  const cutoff = monthKeyToInt(hardMinKey);
  return files.filter((f) => monthKeyToInt(f.month_key) < cutoff);
}

/** True when the given month is inside the 12-month exposed window. */
export function isMonthExposed(monthKey: string, now: Date = new Date()): boolean {
  const { exposedMinKey } = computeRetentionWindow(now);
  return monthKeyToInt(monthKey) >= monthKeyToInt(exposedMinKey);
}
