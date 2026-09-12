// Backup freshness signal for /api/status (release QA-3 P0-4).
//
// Reads the tail of web/content/reports/backup-health.jsonl — written by
// scripts/db-backup.sh ({job:"db-backup"}) and scripts/db-restore-test.sh
// ({job:"restore_test"}) — and collapses it to one public-safe word:
//
//   ok      newest successful db-backup < 26 h old AND newest successful
//           restore_test < 8 days old
//   stale   both exist but one is older than its threshold
//   missing no successful db-backup row at all (or the log is unreadable)
//
// Public: it names no file path, size or host. Full detail stays in the
// JSONL for operators.

import { promises as fs } from "node:fs";
import path from "node:path";

export const BACKUP_HEALTH_FILE = path.join("content", "reports", "backup-health.jsonl");
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
export const RESTORE_TEST_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type BackupStatus = "ok" | "stale" | "missing";

export interface BackupHealth {
  status: BackupStatus;
  /** ISO ts of the newest successful db-backup row, "" when none. */
  last_backup: string;
  /** ISO ts of the newest successful restore_test row, "" when none. */
  last_restore_test: string;
}

type Row = { ts?: string; job?: string; status?: string };

function parseTs(ts: unknown): number {
  if (typeof ts !== "string") return NaN;
  return new Date(ts).getTime();
}

/** Pure classifier — exported for tests. */
export function classifyBackupHealth(lines: string[], now: number = Date.now()): BackupHealth {
  let backupMs = NaN;
  let restoreMs = NaN;
  for (const raw of lines) {
    let row: Row;
    try {
      row = JSON.parse(raw) as Row;
    } catch {
      continue;
    }
    if (row.status !== "ok") continue;
    const t = parseTs(row.ts);
    if (Number.isNaN(t)) continue;
    if (row.job === "db-backup" && !(t <= backupMs)) backupMs = t;
    if (row.job === "restore_test" && !(t <= restoreMs)) restoreMs = t;
  }
  const last_backup = Number.isNaN(backupMs) ? "" : new Date(backupMs).toISOString();
  const last_restore_test = Number.isNaN(restoreMs) ? "" : new Date(restoreMs).toISOString();
  if (!last_backup) return { status: "missing", last_backup, last_restore_test };
  const fresh = now - backupMs < BACKUP_MAX_AGE_MS && !Number.isNaN(restoreMs) && now - restoreMs < RESTORE_TEST_MAX_AGE_MS;
  return { status: fresh ? "ok" : "stale", last_backup, last_restore_test };
}

export async function readBackupHealth(root: string = process.cwd(), now: number = Date.now()): Promise<BackupHealth> {
  try {
    const raw = await fs.readFile(path.join(root, BACKUP_HEALTH_FILE), "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(-400);
    return classifyBackupHealth(lines, now);
  } catch {
    return { status: "missing", last_backup: "", last_restore_test: "" };
  }
}
