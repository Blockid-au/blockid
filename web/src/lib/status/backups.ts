// G15-R2 — /api/status.backups_detail from content/reports/backup-health.jsonl.
// (The existing `backups` key stays the one-word ok|stale|missing verdict from
// lib/ops/backup-health.ts; this is the detail beside it.)
//
// Row shapes seen in the file / written by the G15-R3 lane:
//   {ts, job:"db-backup",     status:"ok"|"fail", sha256, sizeBytes, …}   scripts/db-backup.sh
//   {ts, job:"offsite",       status:"ok"|"fail", error, offsite_status?}  scripts/db-backup-offsite.mjs
//   {ts, job:"restore-drill", status:"ok"|"fail", tables, duration_ms}    scripts/db/restore-drill.sh (R3)
//   {ts, job:"restore_test",  status:"ok"|"fail"}                          legacy restore test
//   {ts, job:"local", …}                                                   accepted as an alias of db-backup
//
// Public-safe: timestamps, an age in hours and one status word — never a
// path, size, host or error text.

import { readJsonlTail, tsMs, getStatusRoot } from "./jsonl";

export const BACKUP_HEALTH_FILE = "backup-health.jsonl";

export type BackupsDetail = {
  local_last_ok_at: string | null;
  local_age_h: number | null;
  /** ok | fail | founder_action_required | never (no offsite row at all) */
  offsite_status: string;
  offsite_last_at: string | null;
  restore_drill_last_ok_at: string | null;
};

type Row = { ts?: unknown; job?: unknown; status?: unknown; offsite_status?: unknown };

const LOCAL_JOBS = new Set(["db-backup", "local"]);
const DRILL_JOBS = new Set(["restore-drill", "restore_drill", "restore_test", "restore-test"]);

/** Pure reducer — exported for tests. */
export function summariseBackups(rows: Row[], now: number = Date.now()): BackupsDetail {
  let localOk = Number.NaN;
  let drillOk = Number.NaN;
  let offsiteTs = Number.NaN;
  let offsite: string = "never";
  for (const r of rows) {
    const t = tsMs(r.ts);
    if (!Number.isFinite(t)) continue;
    const job = typeof r.job === "string" ? r.job : "";
    const ok = r.status === "ok";
    if (LOCAL_JOBS.has(job) && ok && !(t <= localOk)) localOk = t;
    if (DRILL_JOBS.has(job) && ok && !(t <= drillOk)) drillOk = t;
    if (job === "offsite" && !(t <= offsiteTs)) {
      offsiteTs = t;
      if (typeof r.offsite_status === "string" && r.offsite_status) offsite = r.offsite_status.slice(0, 40);
      else offsite = ok ? "ok" : "fail";
    }
  }
  const iso = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
  return {
    local_last_ok_at: iso(localOk),
    local_age_h: Number.isFinite(localOk) ? Math.round(((now - localOk) / 3_600_000) * 10) / 10 : null,
    offsite_status: offsite,
    offsite_last_at: iso(offsiteTs),
    restore_drill_last_ok_at: iso(drillOk),
  };
}

export async function readBackupsDetail(root: string = getStatusRoot(), now: number = Date.now()): Promise<BackupsDetail> {
  try {
    const rows = await readJsonlTail<Row>(root, BACKUP_HEALTH_FILE, 400);
    return summariseBackups(rows, now);
  } catch {
    return summariseBackups([], now);
  }
}
