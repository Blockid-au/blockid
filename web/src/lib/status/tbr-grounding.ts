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
// KPI source: `TBR_GROUNDED_SHARE_KPI` (lib/report-pipeline/quality-log.ts,
// G23-A) — the same threshold /api/status `watch` is derived from; the
// fallback only guards a non-finite export. No path, project or snapshot id
// leaves this module.
//
// G29-B: `last_degraded` — when the LATEST row is a no-report run (the G28-B
// rule, `isNoReportRow`), its { ts, providers_struck, deadline_hit_wave } so
// the Trust row can say "last run degraded (providers struck: …)" next to the
// last GOOD share instead of a placeholder; null when the latest run produced
// a report.

import { isNoReportRow, lastDegradedOf, TBR_GROUNDED_SHARE_KPI, TBR_QUALITY_FILE, type TbrLastDegraded } from "@/lib/report-pipeline/quality-log";
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
  /** G29-B: set when the latest logged run produced no report; `grounded_share` is then the last GOOD run's. */
  last_degraded: TbrLastDegraded | null;
}

type RowLike = { ts?: unknown; groundedShare?: unknown; words?: unknown; degradedSections?: unknown; providers_struck?: unknown; deadline_hit_wave?: unknown };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The KPI: the quality-log export (0.85), guarded against a non-finite value. */
export function resolveGroundedShareKpi(): number {
  const v: number = TBR_GROUNDED_SHARE_KPI;
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1) return r2(v);
  return TBR_GROUNDED_SHARE_KPI_FALLBACK;
}

/** Pure: the latest row (by position, then by ts when present) with a finite groundedShare. */
export function latestGroundedShare(rows: readonly RowLike[]): number | null {
  let best: { ts: number; share: number } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const share = row.groundedShare;
    if (typeof share !== "number" || !Number.isFinite(share)) continue;
    // A run that produced no report (words 0, ≥ 7 of 8 chapters degraded —
    // the G28-B rule) has no grounding to publish — the same rule as the
    // quality window (review G23 P1: the status tile read 0 from an outage
    // row while the window said 0.41).
    if (isNoReportRow(row)) continue;
    const ts = typeof row.ts === "string" ? Date.parse(row.ts) : NaN;
    const t = Number.isFinite(ts) ? ts : -Infinity;
    // Later rows win ties (the file is append-only, so position is the run order).
    if (!best || t >= best.ts) best = { ts: t, share };
  }
  return best ? r2(Math.min(1, Math.max(0, best.share))) : null;
}

/** Pure: the latest row overall (by ts, position breaks ties) when it is a no-report run; null otherwise. */
export function latestDegradedRun(rows: readonly RowLike[]): TbrLastDegraded | null {
  let best: { ts: number; row: RowLike } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const ts = typeof row.ts === "string" ? Date.parse(row.ts) : NaN;
    const t = Number.isFinite(ts) ? ts : -Infinity;
    if (!best || t >= best.ts) best = { ts: t, row };
  }
  return best && isNoReportRow(best.row) ? lastDegradedOf(best.row) : null;
}

export function emptyTbrGrounding(): TbrGrounding {
  return { grounded_share: null, grounded_share_kpi: resolveGroundedShareKpi(), last_degraded: null };
}

/** Never throws; names no path. */
export async function readTbrGrounding(root: string = getStatusRoot()): Promise<TbrGrounding> {
  const kpi = resolveGroundedShareKpi();
  try {
    const rows = await readJsonlTail<RowLike>(root, TBR_QUALITY_FILE, TBR_GROUNDING_TAIL_LINES);
    return { grounded_share: latestGroundedShare(rows), grounded_share_kpi: kpi, last_degraded: latestDegradedRun(rows) };
  } catch {
    return { grounded_share: null, grounded_share_kpi: kpi, last_degraded: null };
  }
}
