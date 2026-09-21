// Score → outcome calibration — the published JSON, read back (G21 P3-A).
//
// `content/reports/calibration-latest.json` is written by
// `npm run calibration` (scripts/calibration/run.ts, weekly cron Sun 04:10
// UTC). Readers:
//
//   readCalibrationLatest(root)  → the parsed report for /methodology/calibration
//                                  (null = "nothing published yet" empty state)
//   readCalibrationStatus(root)  → ok | stale | missing for status surfaces
//
// Mirrors lib/backtest/latest.ts. Never throws; names no path on a public
// payload.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CalibrationReport } from "./compute";

export const CALIBRATION_FILE = path.join("content", "reports", "calibration-latest.json");
export const CALIBRATION_HISTORY_FILE = path.join("content", "reports", "calibration-history.jsonl");
/** Weekly run → stale after 8 days. */
export const CALIBRATION_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type CalibrationStatus = "ok" | "stale" | "missing";

export function calibrationStatusFrom(report: { generated_at?: unknown } | null, now: number = Date.now()): CalibrationStatus {
  if (!report || typeof report !== "object") return "missing";
  const ts = typeof report.generated_at === "string" ? new Date(report.generated_at).getTime() : Number.NaN;
  if (!Number.isFinite(ts)) return "missing";
  return now - ts < CALIBRATION_MAX_AGE_MS ? "ok" : "stale";
}

/** Minimal shape check so a half-written or foreign JSON never reaches the page as a report. */
export function isCalibrationReport(v: unknown): v is CalibrationReport {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.generated_at === "string" &&
    typeof r.method_version === "string" &&
    typeof r.svi_version === "string" &&
    typeof r.horizon_days === "number" &&
    !!r.totals && typeof r.totals === "object" &&
    Array.isArray(r.cohorts) &&
    Array.isArray(r.limitations)
  );
}

export async function readCalibrationLatest(root: string = process.cwd()): Promise<CalibrationReport | null> {
  try {
    const raw = await fs.readFile(path.join(root, CALIBRATION_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isCalibrationReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCalibrationStatus(root: string = process.cwd(), now: number = Date.now()): Promise<CalibrationStatus> {
  return calibrationStatusFrom(await readCalibrationLatest(root), now);
}
