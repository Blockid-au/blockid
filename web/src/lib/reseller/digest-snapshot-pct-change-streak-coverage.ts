// Weekly digest sustained-|pct|-material streak coverage summary (P11.53).
//
// P11.49 (tick 443) + P11.50 (tick 444) shipped the portfolio-wide
// |pct|-material streak detector: "which metrics stayed volatile for N+
// consecutive point-to-point transitions". P11.51 (tick 445) + P11.52
// (tick 446) then drilled down to the per-reseller mirror. Both surfaces
// answer "which metrics / partners are on a streak right now". Neither
// answers "how many metrics are on a streak" — a coverage question ops
// wants for a single-glance topline before diving into the per-row
// detail table.
//
// This module lands the topline. It consumes the SAME DigestSnapshotRollingTrend
// object P11.49 consumes and folds it into a portfolio-wide coverage summary:
//   • total_metrics: HEADLINE_METRICS.length (the canonical KPI ladder — a
//     denominator that stays stable week over week rather than "metrics that
//     produced trend rows this window" which would move underneath ops);
//   • metrics_with_streak: how many metrics have any qualifying run of
//     length ≥ min_streak_length;
//   • coverage_rate_pct: metrics_with_streak / total_metrics × 100 rounded
//     to 1 decimal (null when total_metrics === 0 — division-by-zero shares
//     the P11.43 posture);
//   • min_length, max_length, median_length: distribution over the streak
//     lengths of the metrics that qualified — null when metrics_with_streak
//     === 0.
//
// Pairs cleanly with the P11.49 spotlight: the spotlight names the metrics
// on the streak, and this coverage summary quantifies "is this the whole
// portfolio drifting into volatility, or one outlier in an otherwise flat
// week". A high coverage_rate_pct with a spread min/max_length says the
// portfolio is broadly churning; a low coverage_rate_pct with a large
// max_length says one metric is monopolising the volatility signal.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.54) so this shape can be exercised in
// isolation before touching the hot Monday cron path.

import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPctChangeStreaks,
  type DigestSnapshotPctChangeStreaks,
} from "./digest-snapshot-pct-change-streaks";
import type { DigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";

export interface DigestSnapshotPctChangeStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly total_metrics: number;
  readonly metrics_with_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly min_length: number | null;
  readonly max_length: number | null;
  readonly median_length: number | null;
}

function median(sortedAsc: readonly number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = sortedAsc.length >> 1;
  const raw =
    sortedAsc.length % 2 === 1
      ? sortedAsc[mid]
      : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
  return Math.round(raw * 10) / 10;
}

/**
 * Fold a DigestSnapshotRollingTrend into a portfolio-wide |pct|-material
 * streak coverage summary. Reuses computeDigestSnapshotPctChangeStreaks so
 * the coverage numbers cannot diverge from the P11.49 spotlight rows they
 * summarise.
 *
 * total_metrics is fixed to HEADLINE_METRICS.length — the canonical KPI
 * denominator — so coverage_rate_pct is comparable week over week even when
 * a metric drops out of the trend.
 *
 * minStreakLength / threshold are forwarded to the streak detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH; non-
 * positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPctChangeStreakCoverage(
  trend: DigestSnapshotRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPctChangeStreakCoverage {
  const streaks: DigestSnapshotPctChangeStreaks =
    computeDigestSnapshotPctChangeStreaks(trend, minStreakLength, threshold);

  const totalMetrics = HEADLINE_METRICS.length;
  const withStreak = streaks.rows.length;
  const coverageRate =
    totalMetrics === 0
      ? null
      : Math.round((withStreak / totalMetrics) * 1000) / 10;

  const lengths = streaks.rows.map((r) => r.length).sort((a, b) => a - b);

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    threshold: streaks.threshold,
    total_metrics: totalMetrics,
    metrics_with_streak: withStreak,
    coverage_rate_pct: coverageRate,
    min_length: lengths.length === 0 ? null : lengths[0],
    max_length: lengths.length === 0 ? null : lengths[lengths.length - 1],
    median_length: median(lengths),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCountCell(n: number | null): string {
  if (n === null) return "&mdash;";
  return String(n);
}

function formatRateCell(rate: number | null): string {
  if (rate === null) return "&mdash;";
  return `${rate.toFixed(1)}%`;
}

/**
 * Render a compact one-row HTML summary quantifying portfolio-wide
 * |pct|-material streak coverage. In the P11.54 cron wiring this lands
 * directly above the P11.49/P11.50 spotlight so ops reads the topline
 * (how much of the KPI ladder is on a streak) before scanning the detail.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak by definition — matches P11.49's suppress-below-3 posture) OR
 * when metrics_with_streak === 0 (no streak signal to summarise).
 */
export function formatDigestSnapshotPctChangeStreakCoverageSection(
  coverage: DigestSnapshotPctChangeStreakCoverage,
): string {
  if (coverage.window_size < 3) return "";
  if (coverage.metrics_with_streak === 0) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const rowStyle = ' style="background:#fff8e1"';

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">|pct|-material streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Topline for the sustained-volatility spotlight below. Coverage counts headline KPIs whose portfolio-wide |pct_change| stayed at or above ${coverage.threshold}% for ${coverage.min_streak_length}+ consecutive point-to-point transitions. A high coverage rate with a spread min/max length says the portfolio is broadly churning; a low coverage rate with a large max length says one metric is monopolising the volatility signal.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Total metrics</th>
          <th>With streak</th>
          <th>Coverage rate</th>
          <th>Min length</th>
          <th>Median length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>
        <tr${rowStyle}>
          <td style="text-align:right">${coverage.total_metrics}</td>
          <td style="text-align:right">${coverage.metrics_with_streak}</td>
          <td style="text-align:right">${formatRateCell(coverage.coverage_rate_pct)}</td>
          <td style="text-align:right">${formatCountCell(coverage.min_length)}</td>
          <td style="text-align:right">${formatCountCell(coverage.median_length)}</td>
          <td style="text-align:right">${formatCountCell(coverage.max_length)}</td>
        </tr>
      </tbody>
    </table>`;
}
