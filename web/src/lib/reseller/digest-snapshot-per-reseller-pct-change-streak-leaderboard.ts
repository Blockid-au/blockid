// Weekly digest per-reseller sustained-|pct|-material streak leaderboard (P11.75).
//
// The |pct|-material streak family already carries six surfaces at increasing
// grain:
//   • P11.49 → portfolio spotlight (per metric): which KPIs sustained a
//     |pct_change| >= threshold run portfolio-wide.
//   • P11.51 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs sustained a |pct|-material run.
//   • P11.53 / P11.55 / P11.63 → coverage toplines at portfolio / per-reseller
//     / per-metric grains.
//   • P11.67 → matrix-flat top-N leaderboard: of ALL |pct|-material streaks
//     anywhere in the (metric × reseller) matrix, which are the most volatile.
//   • P11.71 → per-metric top-N leaderboard: for each KPI, which are the
//     most-volatile partner runs on that KPI (equal footing per metric so a
//     churn-volatility leader is not crowded out by an MRR swinger).
//
// Both leaderboard axes so far bucket by KPI — the flat board is length-sorted
// across all (metric × reseller) pairs, and the per-metric board fixes the
// "volatile KPI crowds out the top-N" failure mode by partitioning by KPI.
// Ops still asks the reciprocal question: "for THIS partner, which of their
// KPIs are swinging hardest?" — a per-metric or flat board can't answer that
// without scrolling into the P11.51/P11.52 drill-down and mentally regrouping
// by partner.
//
// This module lands the per-reseller analogue of P11.71: for each partner
// with at least one qualifying streak, render an independent top-N
// leaderboard of the most-volatile KPI runs on that partner's own book. The
// result is an executive strip that gives every partner an at-a-glance
// answer to "which of this partner's KPIs are swinging hardest right now?" —
// a small partner riding a churn-volatility spike ranks #1 in their own group
// even if their MRR magnitude wouldn't crack the flat or per-metric top-N.
// This is the |pct|-magnitude analogue of the P11.73 per-reseller direction-
// streak leaderboard and completes the leaderboard family's symmetry along
// the reseller axis on the magnitude axis, mirroring how the coverage family
// already splits at portfolio (P11.53) / per-metric (P11.63) / per-reseller
// (P11.55) grains.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.76) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so leaderboard
//     entries cannot diverge from the P11.51 spotlight rows they summarise.
//   • DEFAULT_PER_RESELLER_TOP_N = 5 mirrors the P11.73 per-reseller direction
//     leaderboard so both per-partner strips share the same tightness cap.
//   • Group ordering: reseller_code asc (deterministic + alphabetical) —
//     partners have no canonical spec order the way HEADLINE_METRICS does.
//     Only partners with at least one qualifying row emit a group.
//   • Each group carries its own top_n / total_qualified pair so the caption
//     "Top 3 of 8 KPIs for ACME" tells ops how many other KPIs on that
//     partner's book also have qualifying streaks.
//   • cumulative_abs_pct = sum of |pct_change| across the qualifying run's
//     transitions (mirrors P11.67 / P11.71 — the natural volatility score on
//     the |pct|-magnitude axis).
//   • Sort within each group: length desc primary (matches P11.51/P11.67/
//     P11.71 persistence-first posture), cumulative_abs_pct desc secondary
//     (steeper runs rank higher within the same length band), HEADLINE_METRICS
//     spec order tertiary (canonical KPI ladder for deterministic ties within
//     a partner group).
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

export const DEFAULT_PER_RESELLER_TOP_N = 5;

const SPEC_ORDER = new Map<KnownKpiSection, number>(
  HEADLINE_METRICS.map((spec, idx) => [spec.key, idx]),
);

export interface PerResellerPctChangeStreakLeaderboardEntry {
  readonly rank: number;
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

export interface PerResellerPctChangeStreakLeaderboardGroup {
  readonly reseller_code: string;
  readonly top_n: number;
  readonly total_qualified: number;
  readonly rows: readonly PerResellerPctChangeStreakLeaderboardEntry[];
}

export interface DigestSnapshotPerResellerPctChangeStreakLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly top_n_per_reseller: number;
  readonly groups: readonly PerResellerPctChangeStreakLeaderboardGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-reseller top-N
 * leaderboard of the most-volatile sustained-|pct|-material streaks. For each
 * partner with at least one qualifying streak, emits an independent top-N
 * ranking of the KPI runs on that partner's own book so a small partner
 * riding a churn-volatility spike is #1 on their own book even if their MRR
 * magnitude wouldn't crack the flat or per-metric top-N. Reuses
 * computeDigestSnapshotPerResellerPctChangeStreaks so entries cannot diverge
 * from the P11.51 spotlight rows they summarise.
 *
 * Sort within each group: length desc primary, cumulative_abs_pct desc
 * secondary (steeper runs rank higher within the same length band), key
 * HEADLINE_METRICS spec-order tertiary. Group ordering: reseller_code asc.
 *
 * topN < 1 coerces to DEFAULT_PER_RESELLER_TOP_N. Fractional inputs floor to
 * integer. minStreakLength + threshold are forwarded to the detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH,
 * non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_PER_RESELLER_TOP_N,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPctChangeStreakLeaderboard {
  const cap =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_PER_RESELLER_TOP_N;

  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  const byReseller = new Map<
    string,
    {
      reseller_code: string;
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
    let group = byReseller.get(row.reseller_code);
    if (!group) {
      group = { reseller_code: row.reseller_code, rows: [] };
      byReseller.set(row.reseller_code, group);
    }
    group.rows.push({ row, cumulative_abs_pct });
  }

  const sortedCodes = Array.from(byReseller.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const groups: PerResellerPctChangeStreakLeaderboardGroup[] = [];
  for (const code of sortedCodes) {
    const bucket = byReseller.get(code);
    if (!bucket || bucket.rows.length === 0) continue;
    const sorted = bucket.rows.slice().sort((a, b) => {
      if (a.row.length !== b.row.length) return b.row.length - a.row.length;
      if (a.cumulative_abs_pct !== b.cumulative_abs_pct) {
        return b.cumulative_abs_pct - a.cumulative_abs_pct;
      }
      const specA = SPEC_ORDER.get(a.row.key) ?? Number.MAX_SAFE_INTEGER;
      const specB = SPEC_ORDER.get(b.row.key) ?? Number.MAX_SAFE_INTEGER;
      return specA - specB;
    });
    const rows: PerResellerPctChangeStreakLeaderboardEntry[] = sorted
      .slice(0, cap)
      .map((e, i) => ({
        rank: i + 1,
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
    groups.push({
      reseller_code: bucket.reseller_code,
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
    top_n_per_reseller: cap,
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
 * Render a per-reseller top-N leaderboard HTML section of the most-volatile
 * sustained-|pct|-material streaks per partner. In the P11.76 cron wiring
 * this lands directly ABOVE the P11.51/P11.52 per-(metric × reseller)
 * spotlight and BELOW the P11.72 per-metric leaderboard so ops reads the
 * partner-by-partner top-of-fold strip after the metric-by-metric strip
 * before drilling into the full per-partner table. This closes the
 * leaderboard family's per-partner axis on the |pct|-magnitude axis,
 * symmetric with the P11.73 per-reseller direction leaderboard.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 posture) OR when zero groups qualify.
 */
export function formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(
  board: DigestSnapshotPerResellerPctChangeStreakLeaderboard,
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
        <td>${escapeHtml(r.key)} / ${escapeHtml(r.metric_name)}</td>
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
          ? `Top ${shown} of ${total} KPIs for ${escapeHtml(group.reseller_code)}`
          : `Top ${shown} KPI${shown === 1 ? "" : "s"} for ${escapeHtml(group.reseller_code)}`;
      return `
    <h4 style="margin-top:16px;font-family:Arial,sans-serif;font-size:13px">${caption}</h4>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>#</th>
          <th>KPI</th>
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-partner sustained-|pct|-material streak leaderboards across the ${board.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One top-${board.top_n_per_reseller} leaderboard per partner so ops can answer "which of this partner's KPIs are swinging hardest right now?" at a glance &mdash; a small partner riding a churn-volatility spike ranks #1 on their own book even if their MRR magnitude wouldn't crack the flat matrix leaderboard or the per-metric strip above. Ranked within each partner by length (weeks of continuous |pct_change| &ge; ${board.threshold}% persistence) then by cumulative |&Delta;%| (total swing magnitude across the qualifying transitions). Every entry appears in the per-(metric &times; partner) spotlight table below with matching length / max |&Delta;%| / min |&Delta;%| &mdash; this strip surfaces the ${board.min_streak_length}+ point-to-point transition runs ops should scan per-partner before drilling into the full table.</p>${groupsHtml}`;
}
