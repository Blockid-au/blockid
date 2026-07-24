// Weekly digest sustained-|pct|-material streak detector — per reseller (P11.51).
//
// P11.49 (tick 443) + P11.50 (tick 444) shipped the portfolio-wide sustained
// |pct|-material streak detector that answers "which metric kept swinging
// materially week over week even when direction flipped?" from the aggregated
// angle. That surfaces persistent portfolio-wide volatility but misses the
// partner-level drill-down: InfoVision's commission_cleared_mtd may have
// churned +35%, -30%, +40%, -32% across four weeks while a second partner
// swung the opposite direction by the same magnitude, leaving the portfolio
// total flat. P11.49 stays quiet on that pattern; ops still has to open
// /admin/resellers/[code] to identify the specific partner whose subscriber
// mix is churning materially each week.
//
// This module closes that drill-down gap on the |pct|-material axis. Walk
// each (metric × reseller_code) time series in
// DigestSnapshotPerResellerRollingTrend and identify the longest run of
// consecutive |pct_change| ≥ threshold point-to-point transitions. Emit a row
// per (metric × reseller_code) whose longest run reaches
// DEFAULT_MIN_STREAK_LENGTH so the digest can surface a partner-scoped
// "sustained-|pct|-material" table alongside the portfolio-scoped P11.49 table.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 /
// P11.30→P11.31 / P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 /
// P11.39→P11.40 / P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 /
// P11.47→P11.48 / P11.49→P11.50 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.52) so this pure lib can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly — mirrors P11.32
//     so the per-reseller |pct| streak table cannot diverge from the trend
//     table it summarises and from the per-reseller sign-streak table it sits
//     beside.
//   • PCT_CHANGE_MATERIAL_THRESHOLD reused from P11.37 (25%) so every
//     relative-axis surface (P11.37/P11.39/P11.41/P11.43/P11.45/P11.47/P11.49)
//     uses the same amber-band constant.
//   • Length counts point-to-point transitions, not weeks — mirrors P11.32 /
//     P11.49 so a length-2 streak spans 3 weeks of the same |pct|-material
//     posture.
//   • A transition breaks the streak when: previous point total is null OR
//     current point total is null OR previous total is 0 (pct_change is
//     undefined when the base is zero — a launch-week transition, not a
//     magnitude signal) OR |pct_change| < threshold. Same launch-week /
//     null-bookend filter used across the P11.37 family and P11.49 so a
//     partner's first-observed transition cannot fabricate a streak.
//   • DEFAULT_MIN_STREAK_LENGTH = 2 mirrors P11.32 / P11.49 so all three
//     streak tables use the same "persistent" threshold.
//   • Sort: length desc primary (most-volatile partners land first),
//     reseller_code asc secondary (deterministic alphabetical tie-break within
//     the same length band — matches P11.32), HEADLINE_METRICS spec order
//     tertiary (canonical KPI ladder for tie-breaks — matches P11.32).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition), when zero rows qualify, OR when the
//     input trend has no rows at all — mirrors P11.32 / P11.49's
//     quiet-when-flat posture so a first-run digest stays silent.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
  PerResellerTrendPoint,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_MIN_STREAK_LENGTH = 2;

export interface PerResellerPctChangeStreakTransition {
  readonly from_week: string;
  readonly to_week: string;
  readonly from_total: number;
  readonly to_total: number;
  readonly pct_change: number;
}

export interface PerResellerPctChangeStreakRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly max_abs_pct: number;
  readonly min_abs_pct: number;
  readonly transitions: readonly PerResellerPctChangeStreakTransition[];
}

export interface DigestSnapshotPerResellerPctChangeStreaks {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerPctChangeStreakRow[];
}

interface LongestRun {
  readonly length: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly transitions: readonly PerResellerPctChangeStreakTransition[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Walk a per-(metric × reseller_code) time series and return the longest run
 * of consecutive point-to-point transitions whose |pct_change| ≥ threshold.
 * Null points, a zero base, and sub-threshold transitions all break the
 * current run. Ties on length prefer the earlier-starting run so the output
 * is deterministic when a partner has two equally-long qualifying runs inside
 * the same window. Semantics match P11.49's portfolio walker so the two
 * projections are directly comparable.
 */
function findLongestPctRun(
  points: readonly PerResellerTrendPoint[],
  threshold: number,
): LongestRun | null {
  let best: LongestRun | null = null;
  let currentStart = -1;
  let currentTransitions: PerResellerPctChangeStreakTransition[] = [];
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
    const transition: PerResellerPctChangeStreakTransition = {
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
 * Project a DigestSnapshotPerResellerRollingTrend down to its per-partner
 * sustained-|pct|-material streaks. Emits one row per (metric × reseller_code)
 * whose longest qualifying run reaches minStreakLength.
 *
 * Sort: length desc primary (most-volatile partners land first), reseller_code
 * asc secondary (deterministic alphabetical tie-break), HEADLINE_METRICS spec
 * order tertiary (canonical KPI ladder).
 *
 * minStreakLength < 1 coerces to DEFAULT_MIN_STREAK_LENGTH. Fractional inputs
 * floor to integer. Non-finite or non-positive threshold coerces to
 * PCT_CHANGE_MATERIAL_THRESHOLD so a misconfigured caller still gets a sane
 * amber band rather than a catch-everything zero threshold.
 */
export function computeDigestSnapshotPerResellerPctChangeStreaks(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPctChangeStreaks {
  const min =
    Number.isFinite(minStreakLength) && minStreakLength >= 1
      ? Math.floor(minStreakLength)
      : DEFAULT_MIN_STREAK_LENGTH;
  const th =
    Number.isFinite(threshold) && threshold > 0
      ? threshold
      : PCT_CHANGE_MATERIAL_THRESHOLD;

  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const specOrder = new Map<KnownKpiSection, number>(
    HEADLINE_METRICS.map((s, i) => [s.key, i]),
  );

  const qualified: PerResellerPctChangeStreakRow[] = [];
  for (const m of source) {
    const run = findLongestPctRun(m.points, th);
    if (run === null || run.length < min) continue;
    const abs = run.transitions.map((t) => Math.abs(t.pct_change));
    qualified.push({
      reseller_code: m.reseller_code,
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
    const codeCmp = a.reseller_code.localeCompare(b.reseller_code);
    if (codeCmp !== 0) return codeCmp;
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
 * Render an HTML section summarising per-reseller sustained-|pct|-material
 * streaks. Returns "" when window_size < 3 (need at least 3 points for a
 * length-2 streak), when the rows list is empty, OR when the trend has no rows
 * at all — mirrors P11.32 / P11.49's quiet-when-flat posture.
 */
export function formatDigestSnapshotPerResellerPctChangeStreaksSection(
  streaks: DigestSnapshotPerResellerPctChangeStreaks,
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
        <td>${escapeHtml(r.reseller_code)}</td>
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-reseller sustained |pct|-material streaks across the ${streaks.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner drill-down for the portfolio-wide |pct|-material streak table above. Each (metric &times; reseller) row surfaces the longest run of consecutive point-to-point transitions whose |pct_change| stayed at or above ${streaks.threshold}% for ${streaks.min_streak_length}+ transitions &mdash; catches counter-balanced volatility where one partner churns materially each week while another swings the opposite direction, hiding the pattern at the aggregated level. A length-${streaks.min_streak_length} streak spans ${streaks.min_streak_length + 1} weeks of continuous material swings &mdash; direction may flip week over week. Launch-week (previous total = 0) and mid-window null transitions break the run.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
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
