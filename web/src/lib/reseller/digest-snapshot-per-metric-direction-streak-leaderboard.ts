// Weekly digest per-metric sustained-direction streak leaderboard (P11.69).
//
// The direction-streak family already carries four surfaces at increasing
// grain:
//   • P11.30 → portfolio spotlight (per metric): which KPIs moved in the same
//     direction portfolio-wide for 2+ consecutive point-to-point transitions.
//   • P11.32 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs share a sustained-direction run.
//   • P11.57 / P11.59 / P11.61 → coverage toplines at portfolio / per-reseller
//     / per-metric grains: how many KPIs / partners are on a run right now,
//     split up vs. down.
//   • P11.65 → matrix-flat top-N leaderboard: of ALL streaks anywhere in the
//     (metric × reseller) matrix, which are the deepest / longest.
//
// The P11.65 flat leaderboard is length-sorted so a single volatile KPI can
// crowd out the top-N and hide the leader on a quieter metric. Ops still asks
// "for MRR specifically, which 5 partners have the longest sustained runs?
// what about credits? churn?" — the flat board can't answer that without
// scrolling into the P11.32 drill-down table and mentally regrouping.
//
// This module lands the per-metric analogue of P11.65: for each headline
// metric that has at least one qualifying streak, render an independent
// top-N leaderboard of the deepest partner runs on that KPI. The result is
// an executive strip that gives every metric equal footing — a partner
// leading on churn recovery ranks #1 in the churn group even if their MRR
// streak wouldn't crack the flat top-N.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.70) so this shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerDirectionStreaks so leaderboard
//     entries cannot diverge from the P11.32 spotlight rows they summarise.
//   • DEFAULT_PER_METRIC_TOP_N = 5 keeps each per-metric strip readable — the
//     flat P11.65 board uses 10 across all metrics, but 5-per-metric across
//     10 headline metrics could theoretically emit 50 rows which is why the
//     default is tighter. Caller can widen or narrow via the topN arg. topN
//     < 1 coerces to DEFAULT_PER_METRIC_TOP_N; fractional values floor.
//   • Group ordering follows HEADLINE_METRICS spec order so the emitted strip
//     walks the same ladder as every other per-metric surface in the digest.
//     Only metrics with at least one qualifying row emit a group — a KPI with
//     zero streaks is silently omitted rather than emitting an empty table.
//   • Each group carries its own top_n / total_qualified pair so the caption
//     "top 3 of 8 partners on MRR" tells ops how much detail lives in the
//     P11.32 drill-down for that metric specifically.
//   • Sort within each group: length desc primary (matches P11.32 posture),
//     |cumulative_delta| desc secondary (steeper runs rank higher within the
//     same length band), reseller_code asc tertiary. Metric key + unit are
//     group-invariant so no spec-order tiebreak is needed inside a group.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.30 / P11.32 posture) OR when zero
//     groups qualify.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
  type StreakDirection,
} from "./digest-snapshot-per-reseller-direction-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_PER_METRIC_TOP_N = 5;

export interface PerMetricDirectionStreakLeaderboardEntry {
  readonly rank: number;
  readonly reseller_code: string;
  readonly direction: StreakDirection;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly start_total: number;
  readonly end_total: number;
  readonly cumulative_delta: number;
}

export interface PerMetricDirectionStreakLeaderboardGroup {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly top_n: number;
  readonly total_qualified: number;
  readonly rows: readonly PerMetricDirectionStreakLeaderboardEntry[];
}

export interface DigestSnapshotPerMetricDirectionStreakLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly top_n_per_metric: number;
  readonly groups: readonly PerMetricDirectionStreakLeaderboardGroup[];
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-metric top-N
 * leaderboard of the deepest sustained-direction streaks. For each metric
 * with at least one qualifying streak, emits an independent top-N ranking
 * so a partner leading on churn recovery cannot be crowded out by a volatile
 * KPI. Reuses computeDigestSnapshotPerResellerDirectionStreaks so entries
 * cannot diverge from the P11.32 spotlight rows they summarise.
 *
 * Sort within each group: length desc primary, |cumulative_delta| desc
 * secondary (steeper runs rank higher within the same length band),
 * reseller_code asc tertiary. Group ordering follows HEADLINE_METRICS spec
 * order.
 *
 * topN < 1 coerces to DEFAULT_PER_METRIC_TOP_N. Fractional inputs floor to
 * integer. minStreakLength is forwarded to the detector; the detector
 * handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH).
 */
export function computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_PER_METRIC_TOP_N,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotPerMetricDirectionStreakLeaderboard {
  const cap =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_PER_METRIC_TOP_N;

  const streaks = computeDigestSnapshotPerResellerDirectionStreaks(
    trend,
    minStreakLength,
  );

  const bySpecKey = new Map<
    KnownKpiSection,
    {
      key: KnownKpiSection;
      metric_name: string;
      unit: HeadlineMetricUnit;
      rows: (typeof streaks.rows)[number][];
    }
  >();

  for (const row of streaks.rows) {
    let group = bySpecKey.get(row.key);
    if (!group) {
      group = {
        key: row.key,
        metric_name: row.metric_name,
        unit: row.unit,
        rows: [],
      };
      bySpecKey.set(row.key, group);
    }
    group.rows.push(row);
  }

  const groups: PerMetricDirectionStreakLeaderboardGroup[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = bySpecKey.get(spec.key);
    if (!bucket || bucket.rows.length === 0) continue;
    const sorted = bucket.rows.slice().sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length;
      const magA = Math.abs(a.cumulative_delta);
      const magB = Math.abs(b.cumulative_delta);
      if (magA !== magB) return magB - magA;
      return a.reseller_code.localeCompare(b.reseller_code);
    });
    const rows: PerMetricDirectionStreakLeaderboardEntry[] = sorted
      .slice(0, cap)
      .map((r, i) => ({
        rank: i + 1,
        reseller_code: r.reseller_code,
        direction: r.direction,
        length: r.length,
        first_week: r.first_week,
        last_week: r.last_week,
        start_total: r.start_total,
        end_total: r.end_total,
        cumulative_delta: r.cumulative_delta,
      }));
    groups.push({
      key: bucket.key,
      metric_name: bucket.metric_name,
      unit: bucket.unit,
      top_n: cap,
      total_qualified: bucket.rows.length,
      rows,
    });
  }

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    top_n_per_metric: cap,
    groups,
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
 * Render a per-metric top-N leaderboard HTML section of the deepest
 * sustained-direction streaks. In the P11.70 cron wiring this lands directly
 * ABOVE the P11.32 per-(metric × reseller) spotlight (and BELOW the P11.66
 * flat matrix leaderboard) so ops reads the metric-by-metric top-of-fold
 * strip first before drilling into the full per-partner table.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.32 posture) OR when zero groups qualify.
 */
export function formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(
  board: DigestSnapshotPerMetricDirectionStreakLeaderboard,
): string {
  if (board.window_size < 3) return "";
  if (board.groups.length === 0) return "";

  const firstWeek = board.first_week ? escapeHtml(board.first_week) : "";
  const lastWeek = board.last_week ? escapeHtml(board.last_week) : "";

  const groupsHtml = board.groups
    .map((group) => {
      const body = group.rows
        .map((r) => {
          const arrow = r.direction === "up" ? "&uarr;" : "&darr;";
          const dirColor = r.direction === "up" ? "#065f46" : "#991b1b";
          return `
      <tr>
        <td style="text-align:right">${r.rank}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:center;color:${dirColor}">${arrow} ${r.direction}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${formatCell(group.unit, r.start_total)}</td>
        <td style="text-align:right">${formatCell(group.unit, r.end_total)}</td>
        <td style="text-align:right">${formatCumulativeDelta(group.unit, r.cumulative_delta)}</td>
      </tr>`;
        })
        .join("");
      const shown = group.rows.length;
      const total = group.total_qualified;
      const caption =
        total > shown
          ? `Top ${shown} of ${total} partners on ${escapeHtml(group.key)} / ${escapeHtml(group.metric_name)}`
          : `Top ${shown} partner${shown === 1 ? "" : "s"} on ${escapeHtml(group.key)} / ${escapeHtml(group.metric_name)}`;
      return `
    <h4 style="margin-top:16px;font-family:Arial,sans-serif;font-size:13px">${caption}</h4>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>#</th>
          <th>Partner</th>
          <th>Direction</th>
          <th>Length</th>
          <th>Window</th>
          <th>Start</th>
          <th>End</th>
          <th>Cumulative delta</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric sustained-direction streak leaderboards across the ${board.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One top-${board.top_n_per_metric} leaderboard per KPI so each metric gets equal footing &mdash; a partner leading on churn recovery ranks #1 in the churn group even if their MRR streak wouldn't crack the flat matrix leaderboard above. Ranked within each metric by length (weeks of same-direction persistence) then by |cumulative delta| (steepness within the same length band). Every entry appears in the per-(metric &times; partner) spotlight table below with matching direction / length / cumulative delta &mdash; this strip surfaces the ${board.min_streak_length}+ point-to-point transition runs ops should scan per-KPI before drilling into the full table.</p>${groupsHtml}`;
}
