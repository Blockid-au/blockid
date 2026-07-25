// Weekly digest per-metric sustained-|pct|-material streak length percentile summary (P11.99).
//
// The |pct|-material streak percentile family now spans two grains:
//   • P11.91 / P11.92 → portfolio-grain scalar reduction (single row of
//     p50/p90/mean/max across every qualifying |pct|-material streak).
//   • P11.95 / P11.96 → per-partner scalar reduction (one row per partner
//     summarising THAT partner's own |pct|-material streak lengths).
//
// On the per-metric axis the |pct|-material family carries coverage (P11.63)
// / P11.64), leaderboard (P11.71 / P11.72) and length-frequency histogram
// (P11.87 / P11.88) but no scalar percentile summary. Ops reading the
// P11.87/P11.88 per-metric |pct|-material histogram still has to visually
// collapse each KPI's distribution to answer the same common question: "for
// THIS KPI at THIS threshold, what's a typical volatile-|Δ%| run length?
// what's the long tail?" Two KPIs with identical P11.63 coverage% and
// identical P11.71 #1 leaderboard entries can differ sharply in p50/p90 at
// the same threshold band — one clustering tightly at min_streak_length
// while another sits on a fat tail — and none of P11.63 / P11.71 / P11.87
// exposes that as a scalar the way this summary does.
//
// This module lands the per-metric analogue of P11.91 on the magnitude axis,
// mirroring the P11.97 direction-side per-metric summary one axis over: one
// row per HEADLINE_METRICS KPI with a scalar p50 / p90 / mean / max
// reduction of THAT KPI's own |pct|-material streak lengths. Closes the
// percentile-summary family's per-metric axis on the magnitude side,
// symmetric with the P11.63 coverage / P11.71 leaderboard / P11.87 histogram
// per-metric surfaces on the same |pct|-material axis.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 / P11.83 → P11.84 / P11.85 → P11.86 / P11.87 → P11.88 /
// P11.89 → P11.90 / P11.91 → P11.92 / P11.93 → P11.94 / P11.95 → P11.96 /
// P11.97 → P11.98 cadence. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.100) so this shape can be exercised in isolation
// before touching the hot Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.100 cron wiring should
// splice the per-metric |pct|-material percentile section IMMEDIATELY BELOW
// the P11.87/P11.88 per-metric |pct|-material histogram so ops walks
// per-metric coverage (P11.63) → per-metric top-N leaderboard (P11.71) →
// per-metric shape-of-persistence tail (P11.87) → per-metric scalar p50/p90
// summary (this module) → per-partner coverage (P11.55) → per-partner top-N
// (P11.75) → per-partner length histogram (P11.83) → per-partner scalar
// p50/p90 summary (P11.95) → per-(metric × partner) spotlight (P11.51).
// Mirrors the P11.97/P11.98 direction-side per-metric placement one axis
// over and extends the P11.91/P11.92 portfolio-grain magnitude placement
// one grain down.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so percentile
//     groups cannot diverge from the P11.51 spotlight rows they summarise —
//     mirrors the P11.87 per-metric histogram's delegation posture on the
//     same axis and the P11.97 per-metric percentile-summary delegation
//     posture on the direction axis.
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "churn p50 shifted from 2 to 3 at the SAME
//     25% threshold" (real per-KPI shape change) from "churn p50 shifted
//     because the threshold was widened to 40%" (apparent shift due to a
//     wider amber band). Matches P11.87's threshold-passthrough on the
//     per-metric histogram and P11.91/P11.95's threshold-passthrough on the
//     portfolio + per-partner percentile summaries.
//   • Percentile method = NEAREST RANK (inclusive), matching Excel/NIST's
//     PERCENTILE.INC semantics: rank index = ceil(p × N / 100) - 1 clamped
//     to [0, N-1] on the length-ascending sort of streak lengths WITHIN a
//     KPI group. Identical to the P11.89 / P11.91 / P11.93 / P11.95 / P11.97
//     methods so every percentile surface reports on the same yardstick
//     across grains and axes.
//   • Mean = arithmetic mean of streak lengths within a KPI group, rounded
//     to one decimal to match every prior P11.x fractional formatter.
//   • Max = the deepest length observed for that KPI (matches the KPI's
//     P11.87 histogram.max_length exactly).
//   • Group ordering: HEADLINE_METRICS spec order (canonical KPI ladder,
//     matches P11.63 / P11.71 / P11.87 / P11.97 posture; every per-metric
//     surface in the digest walks the same ladder so ops reading top-to-
//     bottom sees a stable KPI spine).
//   • KPIs with zero qualifying rows are omitted entirely (silent skip —
//     matches P11.87 / P11.97 posture; no zero-row noise rows).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51 / P11.83 / P11.87 / P11.91 / P11.93
//     / P11.95 / P11.97 posture) OR when zero groups qualify.

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

export interface PerMetricPctChangeStreakLengthPercentilesGroup {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly total_streaks: number;
  readonly p50_length: number;
  readonly p90_length: number;
  readonly mean_length: number;
  readonly max_length: number;
}

export interface DigestSnapshotPerMetricPctChangeStreakLengthPercentiles {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly groups: readonly PerMetricPctChangeStreakLengthPercentilesGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Nearest-rank (inclusive) percentile on a length-ascending sorted array of
 * streak lengths. Rank index = ceil(p × N / 100) - 1 clamped to [0, N-1] so
 * p=100 always resolves to the max element and p=0 (unused here) resolves to
 * the min. Identical semantics to the P11.89 / P11.91 / P11.93 / P11.95 /
 * P11.97 helpers so every percentile surface reports on the same yardstick
 * across grains and axes.
 */
function nearestRank(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const rank = Math.max(0, Math.min(n - 1, Math.ceil((p * n) / 100) - 1));
  return sortedAsc[rank] ?? 0;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into per-metric scalar
 * |pct|-material streak-length percentile summaries. For each
 * HEADLINE_METRICS KPI with at least one qualifying streak, emits a group
 * with p50 / p90 / mean / max reduced from that KPI's own |pct|-material
 * streak lengths. Delegates to computeDigestSnapshotPerResellerPctChangeStreaks
 * so percentile groups cannot diverge from the P11.51 spotlight rows.
 *
 * Group ordering: HEADLINE_METRICS spec order. KPIs with zero qualifying
 * rows are omitted entirely. minStreakLength + threshold are forwarded to
 * the detector; the detector handles its own coercion (< 1 →
 * DEFAULT_MIN_STREAK_LENGTH; fractional → floor; non-positive threshold →
 * PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerMetricPctChangeStreakLengthPercentiles {
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
      lengths: number[];
    }
  >();

  for (const row of streaks.rows) {
    let group = bySpecKey.get(row.key);
    if (!group) {
      group = {
        key: row.key,
        metric_name: row.metric_name,
        unit: row.unit,
        lengths: [],
      };
      bySpecKey.set(row.key, group);
    }
    group.lengths.push(row.length);
  }

  const groups: PerMetricPctChangeStreakLengthPercentilesGroup[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = bySpecKey.get(spec.key);
    if (!bucket || bucket.lengths.length === 0) continue;

    const sorted = [...bucket.lengths].sort((a, b) => a - b);
    const total = sorted.length;
    const sum = sorted.reduce((s, n) => s + n, 0);
    const mean = sum / total;
    const maxLen = sorted[sorted.length - 1] ?? streaks.min_streak_length;

    groups.push({
      key: bucket.key,
      metric_name: bucket.metric_name,
      unit: bucket.unit,
      total_streaks: total,
      p50_length: nearestRank(sorted, 50),
      p90_length: nearestRank(sorted, 90),
      mean_length: round1(mean),
      max_length: maxLen,
    });
  }

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    threshold: streaks.threshold,
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
 * Render a per-metric scalar |pct|-material percentile summary as one
 * consolidated table with one row per KPI (KPI / Metric / Total streaks /
 * p50 length / p90 length / Mean length / Max length). The one-table-many-
 * rows shape (vs P11.87's many-tables-one-histogram-each) is intentional
 * and mirrors P11.95's per-partner magnitude-side shape + P11.97's
 * per-metric direction-side shape: the summary reduces every KPI to a
 * scalar four-tuple so a side-by-side comparison across KPIs at a given
 * threshold band is the question ops most often asks after reading the
 * per-metric histogram.
 *
 * The caption embeds the threshold percent so a reader sees at a glance
 * which band the p50/p90 values are scored against — matches P11.87 /
 * P11.91 / P11.95 caption pattern on the magnitude axis.
 *
 * In the P11.100 cron wiring this lands directly BELOW the P11.87/P11.88
 * per-metric |pct|-material histogram and ABOVE the P11.83/P11.84 per-
 * partner |pct|-material histogram so ops walks per-metric coverage
 * (P11.63) → per-metric top-N leaderboard (P11.71) → per-metric shape-of-
 * persistence tail (P11.87) → per-metric scalar p50/p90 summary (this
 * module) → per-partner coverage (P11.55) → per-partner top-N (P11.75) →
 * per-partner length histogram (P11.83) → per-partner scalar p50/p90
 * summary (P11.95) → per-(metric × partner) spotlight detail (P11.51).
 * Extends the P11.91/P11.92 portfolio-grain magnitude placement rule one
 * grain down and mirrors the P11.97/P11.98 direction-side per-metric
 * placement rule one axis over.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 / P11.87 / P11.91 / P11.95 / P11.97 posture) OR
 * when zero groups qualify.
 */
export function formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection(
  summary: DigestSnapshotPerMetricPctChangeStreakLengthPercentiles,
): string {
  if (summary.window_size < 3) return "";
  if (summary.groups.length === 0) return "";

  const firstWeek = summary.first_week ? escapeHtml(summary.first_week) : "";
  const lastWeek = summary.last_week ? escapeHtml(summary.last_week) : "";
  const thresholdPct = round1(summary.threshold * 100).toFixed(1);

  const rowsHtml = summary.groups
    .map(
      (group) => `
        <tr>
          <td>${escapeHtml(group.key)}</td>
          <td>${escapeHtml(group.metric_name)}</td>
          <td style="text-align:right">${group.total_streaks}</td>
          <td style="text-align:right">${group.p50_length}</td>
          <td style="text-align:right">${group.p90_length}</td>
          <td style="text-align:right">${group.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${group.max_length}</td>
        </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric sustained-|&Delta;%|-material streak length percentiles across the ${summary.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% threshold</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar p50 / p90 / mean / max summary per KPI &mdash; extends the P11.91 portfolio-grain magnitude reduction one grain down and mirrors the P11.97 direction-side per-metric summary one axis over so ops can grep KPI-scoped |&Delta;%|-material shape scalars out of the cron-health JSONL envelope without re-folding the P11.87 per-metric histogram OR the underlying detector. Two KPIs with identical P11.63 coverage% and identical P11.71 #1 leaderboard entries at the same ${thresholdPct}% threshold can still differ sharply in p50/p90 &mdash; one carrying a fat magnitude tail (high p90 relative to its p50) while the other clusters tightly at length ${summary.min_streak_length} &mdash; and neither of those surfaces exposes that as a scalar the way this summary does. Nearest-rank method (inclusive) matches the P11.89/P11.91/P11.93/P11.95/P11.97 yardstick so per-metric values are directly comparable to the portfolio + per-partner p50/p90 elsewhere in the digest. Threshold carried alongside the percentile values so a shift from p50=2 to p50=3 at the SAME threshold reads differently from an apparent shift caused by widening the threshold band.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>KPI</th>
          <th>Metric</th>
          <th>Total streaks</th>
          <th>p50 length</th>
          <th>p90 length</th>
          <th>Mean length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
