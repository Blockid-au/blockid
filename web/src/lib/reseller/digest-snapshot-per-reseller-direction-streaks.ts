// Weekly digest sustained-direction streak detector — per reseller (P11.32).
//
// P11.30 (tick 424) + P11.31 (tick 425) shipped the portfolio-wide streak
// detector that summarises persistence at the (metric) grain: "metric X moved
// in the same direction for 3+ consecutive weeks". That answers the exec-
// summary question "what has been trending" from a metric-first angle but
// still requires ops to open the P11.22 per-reseller drill-down to identify
// which specific partner is driving the trend.
//
// The remaining exec-summary gap is the per-reseller persistence angle:
// InfoVision may have slid on commission_cleared_mtd for 4 weeks running
// while the aggregated portfolio total was flat because a second partner
// climbed by the same magnitude. That kind of counter-balanced pattern is
// invisible to P11.30 yet is exactly the kind of partner-level signal ops
// wants surfaced before a monthly commission clearing call.
//
// This module lands the per-reseller streak detector: walk each
// (metric × reseller_code) time series in DigestSnapshotPerResellerRollingTrend
// and identify the longest run of consecutive same-sign point-to-point deltas.
// Emit a row per (metric × reseller_code) whose longest run reaches
// DEFAULT_MIN_STREAK_LENGTH so the digest can surface a partner-scoped
// "sustained-direction" table alongside the portfolio-scoped P11.30 table.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 /
// P11.30→P11.31 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.33) so this pure lib can be exercised in isolation
// before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — mirrors P11.28 (top_movers_per_reseller) so the
//     per-reseller streak table cannot diverge from the per-reseller trend
//     table it summarises.
//   • Reuses the exact same streak-walker semantics as P11.30: length counts
//     point-to-point deltas, zero transitions break the run (flat weeks are
//     neither up nor down), null points sever the run (a mid-window gap is
//     signal loss, not signal continuation).
//   • DEFAULT_MIN_STREAK_LENGTH = 2 (three consecutive same-direction weeks)
//     matches P11.30 so the two tables use the same "persistent" threshold.
//   • Sort: length desc primary (most persistent runs land first — matches
//     P11.30's persistence-first posture), reseller_code asc secondary
//     (deterministic + alphabetical tie-break within the same length band —
//     matches P11.28 body-row ordering), HEADLINE_METRICS spec order tertiary
//     (canonical KPI ladder for tie-breaks — matches P11.28).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition), when zero rows qualify, OR when the
//     input has no rows at all — mirrors P11.30's quiet-when-flat posture so
//     a first-run digest stays silent on this section.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
  PerResellerTrendPoint,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_MIN_STREAK_LENGTH = 2;

export type StreakDirection = "up" | "down";

export interface PerResellerStreakRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly direction: StreakDirection;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly start_total: number;
  readonly end_total: number;
  readonly cumulative_delta: number;
}

export interface DigestSnapshotPerResellerDirectionStreaks {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly rows: readonly PerResellerStreakRow[];
}

interface LongestStreak {
  readonly direction: StreakDirection;
  readonly length: number;
  readonly startIndex: number;
  readonly endIndex: number;
}

/**
 * Walk a per-(metric × reseller_code) time series and return the longest run
 * of consecutive same-sign point-to-point deltas. Null points and zero
 * deltas both break the current run. Semantics match P11.30's portfolio
 * walker so the two projections are directly comparable.
 */
function findLongestStreak(
  points: readonly PerResellerTrendPoint[],
): LongestStreak | null {
  let best: LongestStreak | null = null;
  let currentDir: StreakDirection | null = null;
  let currentStart = -1;
  let currentLen = 0;
  let prevIdx = -1;

  for (let i = 0; i < points.length; i++) {
    const cur = points[i].total;
    if (cur === null) {
      currentDir = null;
      currentLen = 0;
      prevIdx = -1;
      continue;
    }
    if (prevIdx < 0) {
      prevIdx = i;
      continue;
    }
    const prev = points[prevIdx].total;
    if (prev === null) {
      prevIdx = i;
      continue;
    }
    const delta = cur - prev;
    const dir: StreakDirection | null =
      delta > 0 ? "up" : delta < 0 ? "down" : null;

    if (dir === null) {
      currentDir = null;
      currentLen = 0;
    } else if (dir === currentDir) {
      currentLen += 1;
    } else {
      currentDir = dir;
      currentLen = 1;
      currentStart = prevIdx;
    }

    if (currentDir !== null && currentLen > 0) {
      const candidate: LongestStreak = {
        direction: currentDir,
        length: currentLen,
        startIndex: currentStart,
        endIndex: i,
      };
      if (best === null || candidate.length > best.length) {
        best = candidate;
      }
    }
    prevIdx = i;
  }
  return best;
}

/**
 * Project a DigestSnapshotPerResellerRollingTrend down to its per-partner
 * sustained-direction streaks. Emits one row per (metric × reseller_code)
 * whose longest run of same-sign point-to-point deltas reaches
 * minStreakLength.
 *
 * Sort: length desc primary (most persistent runs land first), reseller_code
 * asc secondary (deterministic alphabetical tie-break), HEADLINE_METRICS spec
 * order tertiary (canonical KPI ladder).
 *
 * minStreakLength < 1 coerces to DEFAULT_MIN_STREAK_LENGTH. Fractional inputs
 * floor to integer.
 */
export function computeDigestSnapshotPerResellerDirectionStreaks(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotPerResellerDirectionStreaks {
  const min =
    Number.isFinite(minStreakLength) && minStreakLength >= 1
      ? Math.floor(minStreakLength)
      : DEFAULT_MIN_STREAK_LENGTH;

  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const specOrder = new Map<KnownKpiSection, number>();
  HEADLINE_METRICS.forEach((spec, i) => specOrder.set(spec.key, i));

  const qualified: PerResellerStreakRow[] = [];
  for (const m of source) {
    const streak = findLongestStreak(m.points);
    if (streak === null || streak.length < min) continue;
    const startPt = m.points[streak.startIndex];
    const endPt = m.points[streak.endIndex];
    if (startPt.total === null || endPt.total === null) continue;
    qualified.push({
      reseller_code: m.reseller_code,
      key: m.key,
      metric_name: m.metric_name,
      unit: m.unit,
      direction: streak.direction,
      length: streak.length,
      first_week: startPt.week,
      last_week: endPt.week,
      start_total: startPt.total,
      end_total: endPt.total,
      cumulative_delta: endPt.total - startPt.total,
    });
  }

  qualified.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const codeCmp = a.reseller_code.localeCompare(b.reseller_code);
    if (codeCmp !== 0) return codeCmp;
    const posA = specOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const posB = specOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return posA - posB;
  });

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    min_streak_length: min,
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

function formatAud(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}A$${whole}.${String(frac).padStart(2, "0")}`;
}

function formatCell(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") return formatAud(n);
  return String(n);
}

function formatCumulativeDelta(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") {
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const abs = Math.abs(n);
    return `${sign}${formatAud(abs).replace(/^-/, "")}`;
  }
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render an HTML section summarising per-reseller sustained-direction
 * streaks. Returns "" when window_size < 3 (need at least 3 points for a
 * length-2 streak), when zero rows qualify, OR when the trend has no rows at
 * all. Down streaks are highlighted (amber background) so persistent partner
 * slides visually pop against persistent partner gains — matches P11.30's
 * highlight-changed-rows posture.
 */
export function formatDigestSnapshotPerResellerDirectionStreaksSection(
  streaks: DigestSnapshotPerResellerDirectionStreaks,
): string {
  if (streaks.window_size < 3) return "";
  if (streaks.rows.length === 0) return "";

  const firstWeek = streaks.first_week ? escapeHtml(streaks.first_week) : "";
  const lastWeek = streaks.last_week ? escapeHtml(streaks.last_week) : "";

  const body = streaks.rows
    .map((r) => {
      const arrow = r.direction === "up" ? "&uarr;" : "&darr;";
      const highlight = r.direction === "down" ? ' style="background:#fff8e1"' : "";
      return `
      <tr${highlight}>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:center">${arrow} ${r.direction}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.start_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.end_total)}</td>
        <td style="text-align:right"><strong>${formatCumulativeDelta(r.unit, r.cumulative_delta)}</strong></td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-reseller sustained-direction streaks across the ${streaks.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner drill-down for the portfolio-wide streak table above. Each (metric &times; reseller) row surfaces the longest run of consecutive same-direction weeks for that partner &mdash; catches counter-balanced patterns where one partner slides for weeks while another climbs by the same magnitude, hiding the trend at the aggregated level. Down streaks are highlighted. Zero and null transitions break a streak (flat weeks and gaps do not extend a direction).</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Section</th>
          <th>Metric</th>
          <th>Direction</th>
          <th>Length</th>
          <th>Window</th>
          <th>Start</th>
          <th>End</th>
          <th>Cumulative &Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
