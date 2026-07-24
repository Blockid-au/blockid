// Weekly digest sustained-|pct|-material streak leaderboard (P11.67).
//
// The |pct|-material streak family already carries four surfaces that answer
// the "which metrics / partners kept swinging materially week over week"
// question at different grains:
//   • P11.49 → portfolio spotlight (per metric): which KPIs sustained a
//     |pct_change| >= threshold run portfolio-wide.
//   • P11.51 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs sustained a |pct|-material run.
//   • P11.53 / P11.55 / P11.63 → coverage toplines at portfolio / per-reseller
//     / per-metric grains: how many KPIs / partners are on a run right now.
//
// What no surface answers yet is the top-of-fold question ops actually asks
// when the Monday digest lands on the |pct|-magnitude axis: "of all the
// sustained-|pct|-material streaks anywhere in the (metric × reseller) matrix
// RIGHT NOW, which are the deepest / most volatile?" The P11.51 spotlight is
// length-sorted but uncapped and can carry dozens of rows on a large portfolio;
// ops wants the top-N leaderboard as a one-glance strip above the drill-down
// tables so the most volatile partner × KPI runs are visible before scrolling.
// This is the |pct|-magnitude analogue of the P11.65 direction-streak
// leaderboard.
//
// This module lands that leaderboard. It reuses the exact P11.51 detector
// (computeDigestSnapshotPerResellerPctChangeStreaks) so leaderboard entries
// cannot diverge from the P11.51 spotlight rows they summarise (an entry
// ranked #1 here appears in the P11.51 table below with matching length /
// max_abs_pct / min_abs_pct / transitions). Sort layers add a
// cumulative_abs_pct desc tiebreak within the same length band so a
// higher-total-volatility run beats a lower-total-volatility same-length run
// — length answers "how persistent" but summed |pct_change| answers "how
// consequential", and a leaderboard should reward both.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.68) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so leaderboard
//     entries cannot diverge from the P11.51 spotlight rows.
//   • DEFAULT_LEADERBOARD_TOP_N = 10 keeps the strip readable at a glance
//     without dropping meaningful runs on a mid-size portfolio; caller can
//     widen or narrow via the topN arg. topN < 1 coerces to
//     DEFAULT_LEADERBOARD_TOP_N; fractional values floor to integer.
//   • total_qualified reports the PRE-slice count so a "top 10 of 47" label
//     tells ops how much detail lives in the P11.51 spotlight below — a
//     silent slice would hide the drill-down depth.
//   • cumulative_abs_pct = sum of |pct_change| across the qualifying run's
//     transitions (the |pct|-magnitude analogue of |cumulative_delta| on the
//     direction axis; direction is signless-material so the natural magnitude
//     score is the sum of the |pct| swings that qualified the run).
//   • Sort: length desc primary (matches P11.51 persistence-first posture),
//     cumulative_abs_pct desc secondary (steeper runs rank higher within the
//     same length band), reseller_code asc tertiary, HEADLINE_METRICS spec
//     order quaternary. Same-length ties by cumulative_abs_pct never invert
//     the P11.51 ordering because P11.51 already tiebreaks by reseller_code +
//     spec order — this module inserts one extra tiebreak layer ABOVE the
//     P11.51 tiebreaks so the most-volatile streak in a length band leads the
//     leaderboard.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition — matches P11.49 / P11.51 posture),
//     when zero rows qualify, OR when the input has no rows at all.

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

export const DEFAULT_LEADERBOARD_TOP_N = 10;

export interface PctChangeStreakLeaderboardRow {
  readonly rank: number;
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly max_abs_pct: number;
  readonly min_abs_pct: number;
  readonly cumulative_abs_pct: number;
}

export interface DigestSnapshotPctChangeStreakLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly top_n: number;
  readonly total_qualified: number;
  readonly rows: readonly PctChangeStreakLeaderboardRow[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a top-N leaderboard of the
 * most-volatile sustained-|pct|-material streaks anywhere in the (metric ×
 * reseller) matrix. Reuses computeDigestSnapshotPerResellerPctChangeStreaks so
 * entries cannot diverge from the P11.51 spotlight rows they summarise.
 *
 * Sort: length desc primary, cumulative_abs_pct desc secondary (steeper runs
 * rank higher within the same length band), reseller_code asc tertiary,
 * HEADLINE_METRICS spec order quaternary.
 *
 * topN < 1 coerces to DEFAULT_LEADERBOARD_TOP_N. Fractional inputs floor to
 * integer. minStreakLength + threshold are forwarded to the detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH,
 * non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPctChangeStreakLeaderboard(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_LEADERBOARD_TOP_N,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPctChangeStreakLeaderboard {
  const cap =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_LEADERBOARD_TOP_N;

  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  const specOrder = new Map<KnownKpiSection, number>();
  HEADLINE_METRICS.forEach((spec, i) => specOrder.set(spec.key, i));

  const enriched = streaks.rows.map((r) => {
    const cumulative_abs_pct = round1(
      r.transitions.reduce((sum, t) => sum + Math.abs(t.pct_change), 0),
    );
    return { row: r, cumulative_abs_pct };
  });

  enriched.sort((a, b) => {
    if (a.row.length !== b.row.length) return b.row.length - a.row.length;
    if (a.cumulative_abs_pct !== b.cumulative_abs_pct) {
      return b.cumulative_abs_pct - a.cumulative_abs_pct;
    }
    const codeCmp = a.row.reseller_code.localeCompare(b.row.reseller_code);
    if (codeCmp !== 0) return codeCmp;
    const posA = specOrder.get(a.row.key) ?? Number.MAX_SAFE_INTEGER;
    const posB = specOrder.get(b.row.key) ?? Number.MAX_SAFE_INTEGER;
    return posA - posB;
  });

  const rows: PctChangeStreakLeaderboardRow[] = enriched
    .slice(0, cap)
    .map((e, i) => ({
      rank: i + 1,
      reseller_code: e.row.reseller_code,
      key: e.row.key,
      metric_name: e.row.metric_name,
      unit: e.row.unit,
      length: e.row.length,
      first_week: e.row.first_week,
      last_week: e.row.last_week,
      max_abs_pct: e.row.max_abs_pct,
      min_abs_pct: e.row.min_abs_pct,
      cumulative_abs_pct: e.cumulative_abs_pct,
    }));

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    threshold: streaks.threshold,
    top_n: cap,
    total_qualified: streaks.rows.length,
    rows,
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
 * Render a top-N leaderboard HTML section of the most-volatile
 * sustained-|pct|-material streaks across the (metric × reseller) matrix. In
 * the P11.68 cron wiring this lands directly ABOVE the P11.51/P11.52
 * per-(metric × reseller) spotlight so ops reads the top-of-fold leaderboard
 * first before scrolling into the full drill-down table.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 posture) OR when zero rows qualify.
 */
export function formatDigestSnapshotPctChangeStreakLeaderboardSection(
  board: DigestSnapshotPctChangeStreakLeaderboard,
): string {
  if (board.window_size < 3) return "";
  if (board.rows.length === 0) return "";

  const firstWeek = board.first_week ? escapeHtml(board.first_week) : "";
  const lastWeek = board.last_week ? escapeHtml(board.last_week) : "";
  const shownCount = board.rows.length;
  const totalCount = board.total_qualified;

  const body = board.rows
    .map((r) => {
      return `
      <tr style="background:#fff8e1">
        <td style="text-align:right">${r.rank}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${r.max_abs_pct.toFixed(1)}%</td>
        <td style="text-align:right">${r.min_abs_pct.toFixed(1)}%</td>
        <td style="text-align:right">${r.cumulative_abs_pct.toFixed(1)}%</td>
      </tr>`;
    })
    .join("");

  const caption =
    totalCount > shownCount
      ? `Top ${shownCount} of ${totalCount} sustained-|pct|-material streaks`
      : `Top ${shownCount} sustained-|pct|-material streak${shownCount === 1 ? "" : "s"}`;

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">${caption} across the ${board.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Top-of-fold leaderboard of the most-volatile sustained |&Delta;%| runs anywhere in the (metric &times; partner) matrix. Ranked by length (weeks of continuous |pct_change| &ge; ${board.threshold}% persistence) then by cumulative |&Delta;%| (total swing magnitude across the qualifying transitions) so both persistence and magnitude float to the top. Every entry appears in the per-(metric &times; partner) spotlight table below with matching length / max |&Delta;%| / min |&Delta;%| &mdash; this strip surfaces the ${board.min_streak_length}+ point-to-point transition runs ops should scan first before drilling into the full table.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>#</th>
          <th>Partner</th>
          <th>Section</th>
          <th>Metric</th>
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
}
