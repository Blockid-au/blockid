// Weekly digest per-metric sustained-|pct|-material streak leaderboard (P11.71).
//
// The |pct|-material streak family already carries five surfaces at increasing
// grain:
//   • P11.49 → portfolio spotlight (per metric): which KPIs sustained a
//     |pct_change| >= threshold run portfolio-wide.
//   • P11.51 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs sustained a |pct|-material run.
//   • P11.53 / P11.55 / P11.63 → coverage toplines at portfolio / per-reseller
//     / per-metric grains: how many KPIs / partners are on a run right now.
//   • P11.67 → matrix-flat top-N leaderboard: of ALL |pct|-material streaks
//     anywhere in the (metric × reseller) matrix, which are the deepest / most
//     volatile.
//
// The P11.67 flat leaderboard is length-sorted so a single volatile KPI can
// crowd out the top-N and hide the leader on a quieter metric. Ops still asks
// "for churn specifically, which 5 partners are swinging hardest? what about
// commission_cleared_mtd? attributed_mrr?" — the flat board can't answer that
// without scrolling into the P11.51/P11.52 drill-down and mentally regrouping.
//
// This module lands the per-metric analogue of P11.67: for each headline
// metric that has at least one qualifying streak, render an independent
// top-N leaderboard of the most-volatile partner runs on that KPI. The result
// is an executive strip that gives every metric equal footing — a partner
// leading on churn volatility ranks #1 in the churn group even if their MRR
// streak wouldn't crack the flat top-N. This is the |pct|-magnitude analogue
// of the P11.69 per-metric direction-streak leaderboard.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 pattern. Cron-route
// wiring intentionally deferred to a follow-up tick (P11.72) so this shape can
// be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so leaderboard
//     entries cannot diverge from the P11.51 spotlight rows they summarise.
//   • DEFAULT_PER_METRIC_TOP_N = 5 mirrors the P11.69 per-metric direction
//     leaderboard so both per-metric strips share the same tightness cap. The
//     flat P11.67 board uses 10 across all metrics; 5-per-metric across 10
//     headline metrics could theoretically emit 50 rows which is why the
//     default is tighter. Caller can widen or narrow via the topN arg. topN
//     < 1 coerces to DEFAULT_PER_METRIC_TOP_N; fractional values floor.
//   • Group ordering follows HEADLINE_METRICS spec order so the emitted strip
//     walks the same ladder as every other per-metric surface in the digest.
//     Only metrics with at least one qualifying row emit a group — a KPI with
//     zero streaks is silently omitted rather than emitting an empty table.
//   • Each group carries its own top_n / total_qualified pair so the caption
//     "top 3 of 8 partners on churn" tells ops how much detail lives in the
//     P11.51 drill-down for that metric specifically.
//   • cumulative_abs_pct = sum of |pct_change| across the qualifying run's
//     transitions (mirrors P11.67 — the natural volatility score on the
//     |pct|-magnitude axis).
//   • Sort within each group: length desc primary (matches P11.51/P11.67
//     persistence-first posture), cumulative_abs_pct desc secondary (steeper
//     runs rank higher within the same length band), reseller_code asc
//     tertiary. Metric key + unit are group-invariant so no spec-order
//     tiebreak is needed inside a group.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51 posture) OR when zero groups
//     qualify.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
} from "./digest-snapshot-per-reseller-pct-change-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_PER_METRIC_TOP_N = 5;

export interface PerMetricPctChangeStreakLeaderboardEntry {
  readonly rank: number;
  readonly reseller_code: string;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly max_abs_pct: number;
  readonly min_abs_pct: number;
  readonly cumulative_abs_pct: number;
}

export interface PerMetricPctChangeStreakLeaderboardGroup {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly top_n: number;
  readonly total_qualified: number;
  readonly rows: readonly PerMetricPctChangeStreakLeaderboardEntry[];
}

export interface DigestSnapshotPerMetricPctChangeStreakLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly top_n_per_metric: number;
  readonly groups: readonly PerMetricPctChangeStreakLeaderboardGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-metric top-N
 * leaderboard of the most-volatile sustained-|pct|-material streaks. For each
 * metric with at least one qualifying streak, emits an independent top-N
 * ranking so a partner leading on churn volatility cannot be crowded out by a
 * hotter KPI. Reuses computeDigestSnapshotPerResellerPctChangeStreaks so
 * entries cannot diverge from the P11.51 spotlight rows they summarise.
 *
 * Sort within each group: length desc primary, cumulative_abs_pct desc
 * secondary (steeper runs rank higher within the same length band),
 * reseller_code asc tertiary. Group ordering follows HEADLINE_METRICS spec
 * order.
 *
 * topN < 1 coerces to DEFAULT_PER_METRIC_TOP_N. Fractional inputs floor to
 * integer. minStreakLength + threshold are forwarded to the detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH,
 * non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_PER_METRIC_TOP_N,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerMetricPctChangeStreakLeaderboard {
  const cap =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_PER_METRIC_TOP_N;

  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  const bySpecKey = new Map<
    KnownKpiSection,
    {
      key: KnownKpiSection;
      metric_name: string;
      unit: HeadlineMetricUnit;
      rows: Array<{
        row: (typeof streaks.rows)[number];
        cumulative_abs_pct: number;
      }>;
    }
  >();

  for (const row of streaks.rows) {
    const cumulative_abs_pct = round1(
      row.transitions.reduce((sum, t) => sum + Math.abs(t.pct_change), 0),
    );
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
    group.rows.push({ row, cumulative_abs_pct });
  }

  const groups: PerMetricPctChangeStreakLeaderboardGroup[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = bySpecKey.get(spec.key);
    if (!bucket || bucket.rows.length === 0) continue;
    const sorted = bucket.rows.slice().sort((a, b) => {
      if (a.row.length !== b.row.length) return b.row.length - a.row.length;
      if (a.cumulative_abs_pct !== b.cumulative_abs_pct) {
        return b.cumulative_abs_pct - a.cumulative_abs_pct;
      }
      return a.row.reseller_code.localeCompare(b.row.reseller_code);
    });
    const rows: PerMetricPctChangeStreakLeaderboardEntry[] = sorted
      .slice(0, cap)
      .map((e, i) => ({
        rank: i + 1,
        reseller_code: e.row.reseller_code,
        length: e.row.length,
        first_week: e.row.first_week,
        last_week: e.row.last_week,
        max_abs_pct: e.row.max_abs_pct,
        min_abs_pct: e.row.min_abs_pct,
        cumulative_abs_pct: e.cumulative_abs_pct,
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
    threshold: streaks.threshold,
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

/**
 * Render a per-metric top-N leaderboard HTML section of the most-volatile
 * sustained-|pct|-material streaks. In the P11.72 cron wiring this lands
 * directly ABOVE the P11.51/P11.52 per-(metric × reseller) spotlight (and
 * BELOW the P11.68 flat matrix leaderboard) so ops reads the metric-by-metric
 * top-of-fold strip first before drilling into the full per-partner table.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 posture) OR when zero groups qualify.
 */
export function formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(
  board: DigestSnapshotPerMetricPctChangeStreakLeaderboard,
): string {
  if (board.window_size < 3) return "";
  if (board.groups.length === 0) return "";

  const firstWeek = board.first_week ? escapeHtml(board.first_week) : "";
  const lastWeek = board.last_week ? escapeHtml(board.last_week) : "";

  const groupsHtml = board.groups
    .map((group) => {
      const body = group.rows
        .map((r) => {
          return `
      <tr style="background:#fff8e1">
        <td style="text-align:right">${r.rank}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${r.max_abs_pct.toFixed(1)}%</td>
        <td style="text-align:right">${r.min_abs_pct.toFixed(1)}%</td>
        <td style="text-align:right">${r.cumulative_abs_pct.toFixed(1)}%</td>
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
          <th>Length</th>
          <th>Window</th>
          <th>Max |&Delta;%|</th>
          <th>Min |&Delta;%|</th>
          <th>Cumulative |&Delta;%|</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric sustained-|pct|-material streak leaderboards across the ${board.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One top-${board.top_n_per_metric} leaderboard per KPI so each metric gets equal footing &mdash; a partner leading on churn volatility ranks #1 in the churn group even if their MRR streak wouldn't crack the flat matrix leaderboard above. Ranked within each metric by length (weeks of continuous |pct_change| &ge; ${board.threshold}% persistence) then by cumulative |&Delta;%| (total swing magnitude across the qualifying transitions). Every entry appears in the per-(metric &times; partner) spotlight table below with matching length / max |&Delta;%| / min |&Delta;%| &mdash; this strip surfaces the ${board.min_streak_length}+ point-to-point transition runs ops should scan per-KPI before drilling into the full table.</p>${groupsHtml}`;
}
