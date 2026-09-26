// The stage timings ledger behind the timeline's "usually ~Xs" (26/09/2026).
//
// Every finished Trusted Business Report run on an analyses row appends ONE
// line to `content/reports/tbr-stage-timings.jsonl` (the live web checkout,
// like tbr-quality.jsonl — gitignored):
//
//   { ts, totalMs, stages: { score?, evidence?, agents?, dimensions?, … } }  (ms)
//
// `loadStageEtas()` reads the last ETA_SAMPLE_RUNS lines and returns the
// median per stage (falling back to DEFAULT_STAGE_SECONDS per stage), cached
// in-process for a few minutes so the 5-second poll never re-reads the file.
// Best effort both ways: the writer never throws and never fails a report;
// a missing / unreadable file yields the defaults. No-op writer under vitest
// unless TBR_STAGE_TIMINGS_FILE is set (the quality-log rule).

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusRoot } from "@/lib/status/jsonl";
import { DEFAULT_STAGE_SECONDS, TBR_STAGE_KEYS, defaultStageEtas, type StageEtas, type TbrStageKey } from "./stage-timeline";

export const TBR_STAGE_TIMINGS_FILE = "tbr-stage-timings.jsonl";
export const ETA_SAMPLE_RUNS = 30;
const CACHE_MS = 5 * 60 * 1000;

export interface StageTimingsRow {
  ts: string;
  totalMs: number;
  stages: Partial<Record<TbrStageKey, number>>;
}

function isTestEnv(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

function ledgerPath(): string {
  return process.env.TBR_STAGE_TIMINGS_FILE || path.join(getStatusRoot(), "content", "reports", TBR_STAGE_TIMINGS_FILE);
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Medians over the given rows; defaults per stage where no row carries it. Pure — exported for the suite. */
export function etasFromRows(rows: StageTimingsRow[]): StageEtas {
  const usable = rows.filter((r) => r && typeof r.totalMs === "number" && r.totalMs > 0 && r.stages && typeof r.stages === "object").slice(-ETA_SAMPLE_RUNS);
  if (usable.length === 0) return defaultStageEtas();
  const stages = { ...DEFAULT_STAGE_SECONDS };
  for (const key of TBR_STAGE_KEYS) {
    if (key === "received" || key === "read") continue;
    const m = median(usable.map((r) => r.stages[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0));
    if (m !== null) stages[key] = Math.max(1, Math.round(m / 1000));
  }
  const totalMed = median(usable.map((r) => r.totalMs));
  return {
    stages,
    totalSec: totalMed !== null ? Math.round(totalMed / 1000) : TBR_STAGE_KEYS.reduce((n, k) => n + stages[k], 0),
    samples: usable.length,
  };
}

/** The last `n` parseable rows of the ledger; a missing file or a bad line yields fewer rows, never a throw. */
async function readTail(file: string, n: number): Promise<StageTimingsRow[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: StageTimingsRow[] = [];
  for (const line of raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(-n)) {
    try {
      const v = JSON.parse(line) as StageTimingsRow;
      if (v && typeof v === "object") out.push(v);
    } catch {
      // skip a half-written line
    }
  }
  return out;
}

let cache: { at: number; etas: StageEtas } | null = null;

/** The ETA medians the poll route attaches to every timeline. Never throws. */
export async function loadStageEtas(now: number = Date.now()): Promise<StageEtas> {
  if (cache && now - cache.at < CACHE_MS) return cache.etas;
  let etas = defaultStageEtas();
  if (!isTestEnv() || process.env.TBR_STAGE_TIMINGS_FILE) {
    try {
      etas = etasFromRows(await readTail(ledgerPath(), ETA_SAMPLE_RUNS));
    } catch {
      etas = defaultStageEtas();
    }
  }
  cache = { at: now, etas };
  return etas;
}

/** Test seam: forget the in-process cache. */
export function resetStageEtasCache(): void {
  cache = null;
}

/** Append one finished run. Never throws. */
export async function recordStageTimings(row: StageTimingsRow): Promise<void> {
  if (isTestEnv() && !process.env.TBR_STAGE_TIMINGS_FILE) return;
  const file = ledgerPath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(row) + "\n");
  } catch {
    /* telemetry must never fail a report */
  }
}
