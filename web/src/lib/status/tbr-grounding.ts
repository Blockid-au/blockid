// G23-C — report grounding for /api/status.tbr_quality and the /admin/funnel
// Trust section: the LATEST pipeline run's `groundedShare` (G19's open P1 — the
// showcase run read 0.41 against the 0.85 KPI) next to the KPI itself, so the
// number the goal is measured on is visible without opening the jsonl.
//
// Source: content/reports/tbr-quality.jsonl (one row per run, appended by
// lib/report-pipeline/quality-log.ts on the LIVE checkout — getStatusRoot()).
// Fail-soft: a missing / unparsable file or no row with a finite
// `groundedShare` reads as `grounded_share: null`; the KPI is always a number.
//
// KPI source: lane A (G23-A) exports `TBR_GROUNDED_SHARE_KPI` from
// lib/report-pipeline/quality.ts. Until that file lands this module resolves
// the KPI from the existing `TBR_QUALITY_GROUNDED_WATCH` (quality-log.ts, the
// same 0.85 threshold /api/status `watch` is derived from) and falls back to
// `TBR_GROUNDED_SHARE_KPI_FALLBACK`; the merge swaps `resolveGroundedShareKpi`
// to the lane-A export in one line. No path, project or snapshot id leaves
// this module.

import * as qualityLog from "@/lib/report-pipeline/quality-log";
import { getStatusRoot, readJsonlTail } from "./jsonl";

/** The G19 §5 / G23-A target: groundedShare ≥ 0.85. */
export const TBR_GROUNDED_SHARE_KPI_FALLBACK = 0.85;
/** How many trailing rows to scan for the latest run with a finite groundedShare. */
export const TBR_GROUNDING_TAIL_LINES = 50;

export interface TbrGrounding {
  /** `groundedShare` of the most recent run (2 dp); null when no run has been logged. */
  grounded_share: number | null;
  /** The KPI the share is measured against (2 dp). */
  grounded_share_kpi: number;
}

type RowLike = { ts?: unknown; groundedShare?: unknown };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The KPI: lane A's export when present, else the quality-log watch threshold, else 0.85. */
export function resolveGroundedShareKpi(): number {
  const mod = qualityLog as Record<string, unknown>;
  for (const key of ["TBR_GROUNDED_SHARE_KPI", "TBR_QUALITY_GROUNDED_WATCH"]) {
    const v = mod[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1) return r2(v);
  }
  return TBR_GROUNDED_SHARE_KPI_FALLBACK;
}

/** Pure: the latest row (by position, then by ts when present) with a finite groundedShare. */
export function latestGroundedShare(rows: readonly RowLike[]): number | null {
  let best: { ts: number; share: number } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const share = row.groundedShare;
    if (typeof share !== "number" || !Number.isFinite(share)) continue;
    const ts = typeof row.ts === "string" ? Date.parse(row.ts) : NaN;
    const t = Number.isFinite(ts) ? ts : -Infinity;
    // Later rows win ties (the file is append-only, so position is the run order).
    if (!best || t >= best.ts) best = { ts: t, share };
  }
  return best ? r2(Math.min(1, Math.max(0, best.share))) : null;
}

export function emptyTbrGrounding(): TbrGrounding {
  return { grounded_share: null, grounded_share_kpi: resolveGroundedShareKpi() };
}

/** Never throws; names no path. */
export async function readTbrGrounding(root: string = getStatusRoot()): Promise<TbrGrounding> {
  const kpi = resolveGroundedShareKpi();
  try {
    const rows = await readJsonlTail<RowLike>(root, qualityLog.TBR_QUALITY_FILE, TBR_GROUNDING_TAIL_LINES);
    return { grounded_share: latestGroundedShare(rows), grounded_share_kpi: kpi };
  } catch {
    return { grounded_share: null, grounded_share_kpi: kpi };
  }
}
