// Weekly digest sustained-|pct|-material streak detector (P11.49).
//
// P11.30 (tick 424) + P11.31 (tick 425) shipped the portfolio-wide streak
// detector on the sign-of-delta axis: "metric X moved in the same direction
// for N consecutive weeks". That surfaces persistent gains and slides but
// misses a distinct signal: a metric that keeps swinging materially week
// over week even when direction flips.
//
// Example: attributed_mrr moves +30%, -28%, +35%, -32% across four weeks.
// P11.30 sees zero streak (direction flips every week) and stays silent.
// P11.49 sees a length-3 |pct| ≥ 25% run and surfaces "sustained volatility"
// — a signal that the underlying subscriber base or pricing mix is churning
// materially every week rather than settling into a steady posture. Ops
// wants both — persistent direction (P11.30) and persistent volatility
// (P11.49) — on the same executive summary page.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 pattern.
// Cron-route wiring intentionally deferred to a follow-up tick (P11.50) so
// this pure lib can be exercised in isolation before touching the hot Monday
// cron path.
//
// Design notes:
//   • Consumes DigestSnapshotRollingTrend (portfolio-wide) directly —
//     mirrors P11.30 so the |pct| streak table cannot diverge from the trend
//     table it summarises and from the sign-streak table it sits beside.
//   • PCT_CHANGE_MATERIAL_THRESHOLD reused from P11.37 (25%) so every
//     relative-axis surface (P11.37/P11.39/P11.41/P11.43/P11.45/P11.47) uses
//     the same amber-band constant.
//   • Length counts point-to-point transitions, not weeks — mirrors P11.30
//     so a length-2 streak spans 3 weeks of the same |pct|-material posture.
//   • A transition breaks the streak when: previous point total is null OR
//     current point total is null OR previous total is 0 (pct_change is
//     undefined when the base is zero — a launch-week transition, not a
//     magnitude signal) OR |pct_change| < threshold. Same launch-week /
//     null-bookend filter used across the P11.37 family so a partner's
//     first-observed transition cannot fabricate a streak.
//   • DEFAULT_MIN_STREAK_LENGTH = 2 mirrors P11.30 so both streak tables use
//     the same "persistent" threshold. A caller can override for longer
//     windows.
//   • Sort: length desc primary (most-volatile metrics land first),
//     HEADLINE_METRICS spec order tie-break (canonical KPI ladder — matches
//     every other P11.x formatter).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition), when zero metrics qualify, OR when
//     the input trend has no metrics at all — mirrors P11.30's
//     quiet-when-flat posture so a first-run digest stays silent.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type {
  DigestSnapshotRollingTrend,
  RollingMetricTrend,
  RollingTrendPoint,
} from "./digest-snapshot-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_MIN_STREAK_LENGTH = 2;

export interface PctChangeStreakTransition {
  readonly from_week: string;
  readonly to_week: string;
  readonly from_total: number;
  readonly to_total: number;
  readonly pct_change: number;
}

export interface PctChangeStreakRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly max_abs_pct: number;
  readonly min_abs_pct: number;
  readonly transitions: readonly PctChangeStreakTransition[];
}

export interface DigestSnapshotPctChangeStreaks {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PctChangeStreakRow[];
}

interface LongestRun {
  readonly length: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly transitions: readonly PctChangeStreakTransition[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Walk a per-metric time series and return the longest run of consecutive
 * point-to-point transitions whose |pct_change| ≥ threshold. Null points, a
 * zero base, and sub-threshold transitions all break the current run. Ties
 * on length prefer the earlier-starting run so the output is deterministic
 * when a metric has two equally-long qualifying runs inside the same window.
 */
function findLongestPctRun(
  points: readonly RollingTrendPoint[],
  threshold: number,
): LongestRun | null {
  let best: LongestRun | null = null;
  let currentStart = -1;
  let currentTransitions: PctChangeStreakTransition[] = [];
  let prevIdx = -1;

  for (let i = 0; i < points.length; i++) {
    const cur = points[i].total;
    if (cur === null) {
      currentStart = -1;
      currentTransitions = [];
      prevIdx = -1;
      continue;
    }
    if (prevIdx < 0) {
      prevIdx = i;
      continue;
    }
    const prev = points[prevIdx].total;
    if (prev === null || prev === 0) {
      // Null or launch-week base — cannot compute a magnitude; break the run.
      currentStart = -1;
      currentTransitions = [];
      prevIdx = i;
      continue;
    }
    const pct = round1(((cur - prev) / Math.abs(prev)) * 100);
    if (Math.abs(pct) < threshold) {
      currentStart = -1;
      currentTransitions = [];
      prevIdx = i;
      continue;
    }
    const transition: PctChangeStreakTransition = {
      from_week: points[prevIdx].week,
      to_week: points[i].week,
      from_total: prev,
      to_total: cur,
      pct_change: pct,
    };
    if (currentTransitions.length === 0) {
      currentStart = prevIdx;
      currentTransitions = [transition];
    } else {
      currentTransitions = [...currentTransitions, transition];
    }
    const candidate: LongestRun = {
      length: currentTransitions.length,
      startIndex: currentStart,
      endIndex: i,
      transitions: currentTransitions,
    };
    if (best === null || candidate.length > best.length) {
      best = candidate;
    }
    prevIdx = i;
  }
  return best;
}

/**
 * Project a DigestSnapshotRollingTrend down to its sustained-|pct|-material
 * streaks. Emits one row per metric whose longest qualifying run reaches
 * minStreakLength.
 *
 * Sort: length desc, HEADLINE_METRICS spec order tie-break (stable sort).
 *
 * minStreakLength < 1 coerces to DEFAULT_MIN_STREAK_LENGTH. Non-finite or
 * non-positive threshold coerces to PCT_CHANGE_MATERIAL_THRESHOLD so a
 * misconfigured caller still gets a sane amber band rather than a
 * catch-everything zero threshold.
 */
export function computeDigestSnapshotPctChangeStreaks(
  trend: DigestSnapshotRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPctChangeStreaks {
  const min =
    Number.isFinite(minStreakLength) && minStreakLength >= 1
      ? Math.floor(minStreakLength)
      : DEFAULT_MIN_STREAK_LENGTH;
  const th =
    Number.isFinite(threshold) && threshold > 0
      ? threshold
      : PCT_CHANGE_MATERIAL_THRESHOLD;

  const source: readonly RollingMetricTrend[] = Array.isArray(trend?.metrics)
    ? trend.metrics
    : [];

  const specOrder = new Map<KnownKpiSection, number>(
    HEADLINE_METRICS.map((s, i) => [s.key, i]),
  );

  const qualified: PctChangeStreakRow[] = [];
  for (const m of source) {
    const run = findLongestPctRun(m.points, th);
    if (run === null || run.length < min) continue;
    const abs = run.transitions.map((t) => Math.abs(t.pct_change));
    qualified.push({
      key: m.key,
      metric_name: m.metric_name,
      unit: m.unit,
      length: run.length,
      first_week: m.points[run.startIndex].week,
      last_week: m.points[run.endIndex].week,
      max_abs_pct: Math.max(...abs),
      min_abs_pct: Math.min(...abs),
      transitions: run.transitions,
    });
  }

  qualified.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const ai = specOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const bi = specOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    min_streak_length: min,
    threshold: th,
    rows: qualified,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSignedPct(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

/**
 * Render an HTML section summarising sustained-|pct|-material streaks.
 * Returns "" when window_size < 3 (need at least 3 points for a length-2
 * streak), when the rows list is empty, OR when the trend has no metrics.
 */
export function formatDigestSnapshotPctChangeStreaksSection(
  streaks: DigestSnapshotPctChangeStreaks,
): string {
  if (streaks.window_size < 3) return "";
  if (streaks.rows.length === 0) return "";

  const firstWeek = streaks.first_week ? escapeHtml(streaks.first_week) : "";
  const lastWeek = streaks.last_week ? escapeHtml(streaks.last_week) : "";

  const body = streaks.rows
    .map((r) => {
      const transitions = r.transitions
        .map(
          (t) =>
            `${escapeHtml(t.from_week)}&rarr;${escapeHtml(t.to_week)} ${formatSignedPct(t.pct_change)}`,
        )
        .join(", ");
      return `
      <tr style="background:#fff8e1">
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${r.max_abs_pct.toFixed(1)}%</td>
        <td style="text-align:right">${r.min_abs_pct.toFixed(1)}%</td>
        <td>${transitions}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained |pct|-material streaks across the ${streaks.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Metrics whose portfolio-wide |pct_change| stayed at or above ${streaks.threshold}% for ${streaks.min_streak_length}+ consecutive point-to-point transitions. A length-${streaks.min_streak_length} streak spans ${streaks.min_streak_length + 1} weeks of continuous material swings — direction may flip week over week. Complements the sign-of-delta streak table above by surfacing sustained volatility a direction-streak filter cannot see. Launch-week (previous total = 0) and mid-window null transitions break the run.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Length</th>
          <th>Window</th>
          <th>Max |&Delta;%|</th>
          <th>Min |&Delta;%|</th>
          <th>Transitions</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
