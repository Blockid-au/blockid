// Weekly digest sustained-direction streak detector (P11.30).
//
// P11.20 (tick 414) + P11.21 (tick 415) shipped the portfolio-wide N-week
// rolling trend that folds N snapshots into a per-metric time series with a
// first→last delta. P11.24 (tick 418) + P11.25 (tick 419) shipped the top-N
// |delta| headline that ranks (metric × reseller) pairs by absolute movement.
// Both projections answer "what moved most" from a magnitude angle.
//
// The remaining exec-summary gap is the *persistence* angle: a metric that
// slid every single week of the window is a fundamentally different signal
// from a metric that dropped once and stayed flat, even when the two share the
// same |first → last| delta. Ops wants an early warning on sustained trends
// (a partner-portfolio churning up 3 weeks running is worth a call) vs one-off
// blips (a single-week refund spike that self-corrected).
//
// This module lands the streak detector: walk each metric's rolling trend and
// identify the longest run of consecutive same-sign point-to-point deltas.
// Emit a row per metric whose longest run reaches DEFAULT_MIN_STREAK_LENGTH so
// the digest can surface a short "sustained-direction" table above the noisy
// point-by-point table.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 pattern.
// Cron-route wiring intentionally deferred to a follow-up tick (P11.31) so
// this pure lib can be exercised in isolation before touching the hot Monday
// cron path.
//
// Design notes:
//   • Consumes DigestSnapshotRollingTrend (portfolio-wide) directly rather
//     than re-walking snapshots — mirrors the P11.24 top-movers pattern.
//     Guarantees the streak table cannot diverge from the trend table it
//     summarises (a streak of length k spans k+1 consecutive non-null points
//     that must all exist in the RollingMetricTrend.points array).
//   • Streak length counts point-to-point deltas, not weeks. Length 2 means
//     two same-sign transitions ⇒ three consecutive weeks moving in the same
//     direction. This lets a small 3-week window still surface a length-2
//     streak while a longer 8-week window can require length ≥3 for a signal.
//   • Zero deltas break a streak (a flat point is neither up nor down) rather
//     than extending either direction — a partner that dips then plateaus is
//     not a sustained-slide signal.
//   • Null points break a streak. A gap in the middle of a series is not the
//     absence of a signal; it is a *loss* of signal, and pretending the run
//     continued across the gap would fabricate persistence that was never
//     observed. Downstream ops opens /admin/resellers/[code] to disambiguate.
//   • DEFAULT_MIN_STREAK_LENGTH = 2 (three consecutive same-direction weeks).
//     Short enough to fire on a 4-week rolling window (P11.21 default) yet
//     strict enough to filter one-off blips. A caller can override for longer
//     windows.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition), when zero metrics qualify, OR when
//     the input has no metrics at all — keeps a first-run cron quiet.

import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotRollingTrend,
  RollingMetricTrend,
  RollingTrendPoint,
} from "./digest-snapshot-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_MIN_STREAK_LENGTH = 2;

export type StreakDirection = "up" | "down";

export interface StreakRow {
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

export interface DigestSnapshotDirectionStreaks {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly rows: readonly StreakRow[];
}

interface LongestStreak {
  readonly direction: StreakDirection;
  readonly length: number;
  readonly startIndex: number;
  readonly endIndex: number;
}

/**
 * Walk a per-metric time series and return the longest run of consecutive
 * same-sign point-to-point deltas. Null points and zero deltas both break the
 * current run. Ties on length prefer the earlier-starting run so the output is
 * deterministic when a metric has two equally-long streaks in opposite
 * directions inside the same window.
 */
function findLongestStreak(
  points: readonly RollingTrendPoint[],
): LongestStreak | null {
  let best: LongestStreak | null = null;
  let currentDir: StreakDirection | null = null;
  let currentStart = -1;
  let currentLen = 0;
  let prevIdx = -1;

  for (let i = 0; i < points.length; i++) {
    const cur = points[i].total;
    if (cur === null) {
      // Null point severs the run entirely — a missing week is a signal loss,
      // not a signal continuation.
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
      // Defensive: should not hit because we clear prevIdx on null above.
      prevIdx = i;
      continue;
    }
    const delta = cur - prev;
    const dir: StreakDirection | null =
      delta > 0 ? "up" : delta < 0 ? "down" : null;

    if (dir === null) {
      // Flat transition breaks any current streak.
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
 * Project a DigestSnapshotRollingTrend down to its sustained-direction
 * streaks. Emits one row per metric whose longest run of same-sign
 * point-to-point deltas reaches minStreakLength.
 *
 * Sort: length desc, then HEADLINE_METRICS declaration order (preserved via
 * stable sort — Array.prototype.sort is guaranteed stable in modern V8 which
 * matches every other P11.x formatter's ordering posture).
 *
 * minStreakLength < 1 coerces to DEFAULT_MIN_STREAK_LENGTH.
 */
export function computeDigestSnapshotDirectionStreaks(
  trend: DigestSnapshotRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotDirectionStreaks {
  const min =
    Number.isFinite(minStreakLength) && minStreakLength >= 1
      ? Math.floor(minStreakLength)
      : DEFAULT_MIN_STREAK_LENGTH;

  const source: readonly RollingMetricTrend[] = Array.isArray(trend?.metrics)
    ? trend.metrics
    : [];

  const qualified: StreakRow[] = [];
  for (const m of source) {
    const streak = findLongestStreak(m.points);
    if (streak === null || streak.length < min) continue;
    const startPt = m.points[streak.startIndex];
    const endPt = m.points[streak.endIndex];
    if (startPt.total === null || endPt.total === null) continue;
    qualified.push({
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

  qualified.sort((a, b) => b.length - a.length);

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
 * Render an HTML section summarising sustained-direction streaks. Returns ""
 * when window_size < 3 (need at least 3 points for a length-2 streak), when
 * the streaks list is empty, OR when the trend has no metrics at all.
 */
export function formatDigestSnapshotDirectionStreaksSection(
  streaks: DigestSnapshotDirectionStreaks,
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained-direction streaks across the ${streaks.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Metrics whose portfolio-wide total moved in the same direction for ${streaks.min_streak_length}+ consecutive point-to-point transitions. A length-${streaks.min_streak_length} streak spans ${streaks.min_streak_length + 1} weeks of same-direction movement. Down streaks are highlighted so persistent slides stand out from persistent gains. Zero and null transitions break a streak (flat weeks and gaps do not extend a direction).</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
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
