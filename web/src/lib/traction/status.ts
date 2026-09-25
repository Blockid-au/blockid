// Traction snapshot freshness for /api/status (G14-S33).
//
// Reads content/reports/traction-snapshot.json — written daily 03:20 UTC by
// /api/cron/traction-snapshot — and collapses it to one word:
//
//   ok       generated_at < 26 h old (daily cron + 2 h slack)
//   stale    file exists but is older than that (cron stopped / failing)
//   missing  no file, unreadable, or no parseable generated_at
//
// Mirrors readGa4EventAuditStatus (lib/analytics/ga4-event-audit.ts). Names
// no path, host or figure — safe on the public payload.

import { promises as fs } from "node:fs";
import path from "node:path";

export const TRACTION_SNAPSHOT_FILE = path.join("content", "reports", "traction-snapshot.json");
export const TRACTION_HISTORY_FILE = path.join("content", "reports", "traction-history.jsonl");
/** A daily run is stale after 26 h (03:20 UTC + a couple of hours of slack). */
export const TRACTION_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export type TractionStatus = "ok" | "stale" | "missing";

/** Pure reducer — exported for tests. */
export function tractionStatusFrom(report: { generated_at?: unknown } | null, now: number = Date.now()): TractionStatus {
  if (!report || typeof report !== "object") return "missing";
  const ts = typeof report.generated_at === "string" ? new Date(report.generated_at).getTime() : Number.NaN;
  if (!Number.isFinite(ts) || ts > now) return "missing";
  return now - ts < TRACTION_MAX_AGE_MS ? "ok" : "stale";
}

/** The last persisted snapshot as loose JSON, or null. Never throws. */
export async function readTractionSnapshotRaw(root: string = process.cwd()): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path.join(root, TRACTION_SNAPSHOT_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `ok | stale | missing` for /api/status. Never throws. */
export async function readTractionStatus(root: string = process.cwd(), now: number = Date.now()): Promise<TractionStatus> {
  return tractionStatusFrom(await readTractionSnapshotRaw(root), now);
}

/** True when the persisted snapshot is fresh enough to serve instead of a live query. */
export function isTractionFresh(report: { generated_at?: unknown } | null, now: number = Date.now()): boolean {
  return tractionStatusFrom(report, now) === "ok";
}
