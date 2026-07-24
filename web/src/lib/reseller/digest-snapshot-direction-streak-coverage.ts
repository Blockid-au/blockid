// Weekly digest sustained-direction streak coverage summary (P11.57).
//
// P11.30 (tick 424) + P11.31 (tick 425) shipped the portfolio-wide
// same-direction streak detector: "which metrics moved the same way for N+
// consecutive point-to-point transitions". P11.32 (tick 426) + P11.33
// (tick 427) then drilled down to the per-reseller mirror. Both surfaces
// answer "which metrics / partners are on a streak right now". Neither
// answers "how many metrics are on a streak — and which way are they
// leaning" — a coverage question ops wants for a single-glance topline
// before diving into the per-row detail table.
//
// This module lands the topline. It consumes the SAME DigestSnapshotRollingTrend
// object P11.30 consumes and folds it into a portfolio-wide coverage summary:
//   • total_metrics: HEADLINE_METRICS.length (the canonical KPI ladder — a
//     denominator that stays stable week over week rather than "metrics that
//     produced trend rows this window" which would move underneath ops);
//   • metrics_with_streak: how many metrics have any qualifying run of
//     length >= min_streak_length;
//   • metrics_up_streak / metrics_down_streak: direction breakout. Unlike
//     the P11.53 |pct|-magnitude coverage, direction has a sign, so the
//     coverage envelope carries the up/down split — a portfolio with 5
//     up-streaks and 0 down-streaks tells a fundamentally different story
//     from 0 up / 5 down even at the same coverage_rate_pct;
//   • coverage_rate_pct / up_coverage_rate_pct / down_coverage_rate_pct:
//     each numerator divided by total_metrics x 100 rounded to 1 decimal
//     (null when total_metrics === 0 — division-by-zero shares the P11.53
//     posture);
//   • min_length / max_length / median_length: distribution over the
//     streak lengths of the metrics that qualified — null when
//     metrics_with_streak === 0.
//
// Pairs cleanly with the P11.30 spotlight: the spotlight names the metrics
// on the streak and their direction, and this coverage summary quantifies
// "is the whole portfolio drifting in one direction, splitting up-vs-down,
// or is one metric monopolising the sustained-direction signal".
//
// Pure-lib-first per the P11.14->P11.15 / P11.20->P11.21 / P11.22->P11.23 /
// P11.24->P11.25 / P11.26->P11.27 / P11.28->P11.29 / P11.30->P11.31 /
// P11.32->P11.33 / P11.34->P11.35 / P11.37->P11.38 / P11.39->P11.40 /
// P11.41->P11.42 / P11.43->P11.44 / P11.45->P11.46 / P11.47->P11.48 /
// P11.49->P11.50 / P11.51->P11.52 / P11.53->P11.54 / P11.55->P11.56
// pattern. Cron-route wiring intentionally deferred to a follow-up tick
// (P11.58) so this shape can be exercised in isolation before touching the
// hot Monday cron path.

import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotDirectionStreaks,
  type DigestSnapshotDirectionStreaks,
} from "./digest-snapshot-direction-streaks";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import type { DigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";

export interface DigestSnapshotDirectionStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly total_metrics: number;
  readonly metrics_with_streak: number;
  readonly metrics_up_streak: number;
  readonly metrics_down_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly up_coverage_rate_pct: number | null;
  readonly down_coverage_rate_pct: number | null;
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

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Fold a DigestSnapshotRollingTrend into a portfolio-wide sustained-direction
 * streak coverage summary. Reuses computeDigestSnapshotDirectionStreaks so
 * the coverage numbers cannot diverge from the P11.30 spotlight rows they
 * summarise.
 *
 * total_metrics is fixed to HEADLINE_METRICS.length — the canonical KPI
 * denominator — so coverage_rate_pct is comparable week over week even when
 * a metric drops out of the trend.
 *
 * minStreakLength is forwarded to the streak detector, which handles its
 * own coercion (< 1 -> DEFAULT_MIN_STREAK_LENGTH).
 */
export function computeDigestSnapshotDirectionStreakCoverage(
  trend: DigestSnapshotRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotDirectionStreakCoverage {
  const streaks: DigestSnapshotDirectionStreaks =
    computeDigestSnapshotDirectionStreaks(trend, minStreakLength);

  const totalMetrics = HEADLINE_METRICS.length;
  const withStreak = streaks.rows.length;
  const upStreak = streaks.rows.filter((r) => r.direction === "up").length;
  const downStreak = streaks.rows.filter((r) => r.direction === "down").length;

  const lengths = streaks.rows.map((r) => r.length).sort((a, b) => a - b);

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    total_metrics: totalMetrics,
    metrics_with_streak: withStreak,
    metrics_up_streak: upStreak,
    metrics_down_streak: downStreak,
    coverage_rate_pct: rate(withStreak, totalMetrics),
    up_coverage_rate_pct: rate(upStreak, totalMetrics),
    down_coverage_rate_pct: rate(downStreak, totalMetrics),
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

function formatRateCell(r: number | null): string {
  if (r === null) return "&mdash;";
  return `${r.toFixed(1)}%`;
}

/**
 * Render a compact one-row HTML summary quantifying portfolio-wide
 * sustained-direction streak coverage. In the P11.58 cron wiring this lands
 * directly above the P11.30/P11.31 spotlight so ops reads the topline
 * (how much of the KPI ladder is on a streak, split up vs down) before
 * scanning the per-row detail table.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak by definition — matches P11.30's suppress-below-3 posture) OR
 * when metrics_with_streak === 0 (no streak signal to summarise).
 */
export function formatDigestSnapshotDirectionStreakCoverageSection(
  coverage: DigestSnapshotDirectionStreakCoverage,
): string {
  if (coverage.window_size < 3) return "";
  if (coverage.metrics_with_streak === 0) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const rowStyle = ' style="background:#fff8e1"';

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained-direction streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Topline for the sustained-direction spotlight below. Coverage counts headline KPIs whose portfolio-wide total moved the same way for ${coverage.min_streak_length}+ consecutive point-to-point transitions. The up/down split separates broad-based gains from broad-based slides at the same coverage rate; a spread min/max length says the portfolio is broadly moving, a large gap between max and median says one metric is monopolising the persistence signal.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Total metrics</th>
          <th>With streak</th>
          <th>&uarr; Up</th>
          <th>&darr; Down</th>
          <th>Coverage rate</th>
          <th>Up rate</th>
          <th>Down rate</th>
          <th>Min length</th>
          <th>Median length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>
        <tr${rowStyle}>
          <td style="text-align:right">${coverage.total_metrics}</td>
          <td style="text-align:right">${coverage.metrics_with_streak}</td>
          <td style="text-align:right">${coverage.metrics_up_streak}</td>
          <td style="text-align:right">${coverage.metrics_down_streak}</td>
          <td style="text-align:right">${formatRateCell(coverage.coverage_rate_pct)}</td>
          <td style="text-align:right">${formatRateCell(coverage.up_coverage_rate_pct)}</td>
          <td style="text-align:right">${formatRateCell(coverage.down_coverage_rate_pct)}</td>
          <td style="text-align:right">${formatCountCell(coverage.min_length)}</td>
          <td style="text-align:right">${formatCountCell(coverage.median_length)}</td>
          <td style="text-align:right">${formatCountCell(coverage.max_length)}</td>
        </tr>
      </tbody>
    </table>`;
}
