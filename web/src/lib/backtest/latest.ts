// SVI backtest — the published JSON, read back (G14-S39).
//
// `content/reports/svi-backtest-latest.json` is written by
// `npm run backtest` (scripts/backtest/run.ts) and re-run weekly (crontab
// Sun 03:40 UTC) and whenever `svi-analysis.ts` changes. Two readers:
//
//   readSviBacktestLatest(root)  → the parsed report for /methodology/calibration
//                                  (null = "not yet published" empty state)
//   readSviBacktestStatus(root)  → ok | stale | missing for /api/status
//                                  (ok when generated_at < 8 days old)
//
// Mirrors lib/traction/status.ts. Never throws; names no path on the
// public payload.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BacktestReport } from "./run-backtest";

export const SVI_BACKTEST_FILE = path.join("content", "reports", "svi-backtest-latest.json");
export const SVI_BACKTEST_HISTORY_FILE = path.join("content", "reports", "svi-backtest-history.jsonl");
/** Weekly run → stale after 8 days (7 + 1 day of slack). */
export const SVI_BACKTEST_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type SviBacktestStatus = "ok" | "stale" | "missing";

/** Pure reducer — exported for tests. */
export function sviBacktestStatusFrom(report: { generated_at?: unknown } | null, now: number = Date.now()): SviBacktestStatus {
  if (!report || typeof report !== "object") return "missing";
  const ts = typeof report.generated_at === "string" ? new Date(report.generated_at).getTime() : Number.NaN;
  if (!Number.isFinite(ts)) return "missing";
  return now - ts < SVI_BACKTEST_MAX_AGE_MS ? "ok" : "stale";
}

/** Minimal shape check so a half-written or foreign JSON never reaches the page as a report. */
export function isBacktestReport(v: unknown): v is BacktestReport {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.generated_at === "string" &&
    typeof r.svi_version === "string" &&
    typeof r.n === "number" &&
    !!r.rho && typeof r.rho === "object" &&
    !!r.ci && typeof r.ci === "object" &&
    Array.isArray(r.buckets) &&
    Array.isArray(r.caveats) &&
    Array.isArray(r.rows_used)
  );
}

/** The last published report, or null. Never throws. */
export async function readSviBacktestLatest(root: string = process.cwd()): Promise<BacktestReport | null> {
  try {
    const raw = await fs.readFile(path.join(root, SVI_BACKTEST_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isBacktestReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** `ok | stale | missing` for /api/status. Never throws. */
export async function readSviBacktestStatus(root: string = process.cwd(), now: number = Date.now()): Promise<SviBacktestStatus> {
  try {
    const raw = await fs.readFile(path.join(root, SVI_BACKTEST_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return sviBacktestStatusFrom(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { generated_at?: unknown }) : null, now);
  } catch {
    return "missing";
  }
}

/**
 * G34 BT6 (RQ21): the headline a report page prints beside its scores —
 * pooled Spearman ρ of SVI vs log(round size), the n behind it and the run
 * date (the figures the /methodology/calibration stats row shows). Pure;
 * null when nothing is published.
 */
export interface SviBacktestHeadline {
  /** Pooled ρ (SVI vs log round size); null when the run could not compute one. */
  rho: number | null;
  /** Rows with a disclosed round (the n behind `rho`). */
  n: number;
  /** ISO timestamp of the run. */
  asOf: string;
}

export function sviBacktestHeadline(report: Pick<BacktestReport, "rho" | "n_with_round" | "generated_at"> | null): SviBacktestHeadline | null {
  if (!report) return null;
  const pooled = report.rho?.round_pooled;
  const rho = typeof pooled === "number" && Number.isFinite(pooled) ? pooled : null;
  const n = typeof report.n_with_round === "number" && Number.isFinite(report.n_with_round) ? Math.max(0, Math.floor(report.n_with_round)) : 0;
  return { rho, n, asOf: report.generated_at };
}

/** The headline read from the published JSON (server surfaces: report pages, PDF, DOCX). Never throws. */
export async function readSviBacktestHeadline(root: string = process.cwd()): Promise<SviBacktestHeadline | null> {
  return sviBacktestHeadline(await readSviBacktestLatest(root));
}
