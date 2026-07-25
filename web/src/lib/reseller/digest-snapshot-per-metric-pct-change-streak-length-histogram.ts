// Weekly digest per-metric sustained-|pct|-material streak length-frequency histogram (P11.87).
//
// The sustained-|pct|-material streak family now ships seven surfaces at
// increasing grain:
//   • P11.49 → portfolio spotlight (per metric): which KPIs sustained a
//     |pct_change| ≥ threshold run portfolio-wide.
//   • P11.51 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs sustained a |pct|-material run.
//   • P11.53 / P11.55 / P11.63 → coverage toplines at portfolio / per-partner /
//     per-metric grains (share of qualifying cells).
//   • P11.67 / P11.71 / P11.75 → leaderboards at flat / per-metric /
//     per-partner grains (top-N ranked lists by length + cumulative_abs_pct).
//   • P11.79 → portfolio length-frequency histogram (shape of persistence at
//     the portfolio grain — dense buckets from min_streak_length to max_length
//     observed with a share-of-total pct per bucket + threshold passthrough).
//   • P11.83 → per-partner length-frequency histogram (shape of persistence at
//     the per-partner grain — one dense histogram per partner, threshold
//     passthrough, per-partner-scoped Distribution gauge).
//
// The histogram family on the magnitude axis so far covers the portfolio grain
// (P11.79) and the per-partner grain (P11.83) but leaves the per-metric axis
// unfilled — the last empty leaf. Ops still asks the reciprocal per-metric
// question when scanning P11.51: "for churn specifically, what's the SHAPE of
// the (partner × churn) |pct|-material runs — mostly length-2 blips clearing
// the threshold or a fat tail of length-5+ persistent swings?" A per-metric
// coverage rate (P11.63) or a per-metric top-N leaderboard (P11.71) can't
// answer that: coverage collapses shape into a single ratio per KPI, and the
// leaderboard caps at top-N so the distribution beyond the top-N entries is
// invisible. Two KPIs with identical coverage% and identical #1 leaderboard
// entries can differ sharply in tail on the magnitude axis — one clustering
// at min_streak_length while another sits on a fat tail — and neither surface
// exposes that.
//
// This module lands the per-metric analogue of P11.79 / P11.83 on the
// magnitude axis: for each HEADLINE_METRICS spec-order KPI with at least one
// qualifying (partner × this metric) |pct|-material streak, emit an
// independent length-frequency histogram over that KPI's own streak rows.
// Bucket set is DENSE from min_streak_length to max(row.length) FOR THAT KPI
// so the axis reads continuously — a KPI whose deepest run is length 4 does
// not carry a phantom length-5 bucket sourced from a different KPI's tail.
// Shape mirrors the P11.71 per-metric leaderboard grouping: groups walk
// HEADLINE_METRICS spec order, one histogram per KPI group, only KPIs with at
// least one qualifying row emit a group. This closes the histogram family's
// per-metric axis on the magnitude side, symmetric with P11.63 (coverage) and
// P11.71 (leaderboard) and mirroring P11.85 on the direction axis.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 / P11.83 → P11.84 / P11.85 → P11.86 pattern. Cron-route
// wiring intentionally deferred to a follow-up tick (P11.88) so this shape
// can be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so histogram groups
//     cannot diverge from the P11.51 spotlight rows they summarise — mirrors
//     the P11.71 per-metric leaderboard's delegation posture on the magnitude
//     axis and the P11.85 per-metric direction-histogram's delegation posture
//     on the direction axis.
//   • Buckets within a group are DENSE from min_streak_length to that KPI's
//     max_length observed. A zero-count band between two populated ones
//     renders explicitly with count=0, pct=0 so the length axis reads
//     continuously and the visual bar in the formatter is not visually
//     collapsed against neighbouring bars — matches P11.79 / P11.83 / P11.85
//     dense-bucket contract.
//   • Per-KPI max_length is a group-local horizon; a KPI whose deepest
//     partner run is length-4 renders 3 buckets (2/3/4) even if a sibling
//     KPI has a length-6 run. Sharing the portfolio-wide max_length across
//     groups would pad every KPI with zero-count trailing bands unless that
//     KPI also carries the max — the wrong signal for the per-KPI question
//     this table answers.
//   • pct within a group = round1(count / group_total × 100). Each KPI's
//     shares sum to 100 within its own histogram (subject to rounding) — the
//     per-KPI shape is a distribution over THAT KPI's partner runs, never a
//     share of the portfolio total.
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "60% of churn runs are length-2 at the 25%
//     threshold" from "60% of churn runs are length-2 at a widened 40%
//     threshold" without side-loading the P11.51 envelope. Matches P11.79 /
//     P11.83 threshold-passthrough on the other grains of the magnitude axis.
//   • Sort of buckets within a group: length asc (histogram reads left-to-
//     right shortest → longest — matches P11.79 / P11.83 / P11.85 x-axis
//     convention).
//   • Group ordering: HEADLINE_METRICS spec order (canonical KPI ladder,
//     matches P11.63 / P11.71 / P11.85 posture; every per-metric surface in
//     the digest walks the same ladder so ops reading top-to-bottom sees a
//     stable KPI spine).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51 / P11.79 / P11.83 / P11.85 posture)
//     OR when zero groups qualify (matches P11.71 / P11.85 quiet-when-flat
//     posture at the per-metric grain — a first-run digest stays silent on
//     this section).

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

export interface PerMetricPctChangeStreakLengthBucket {
  readonly length: number;
  readonly count: number;
  readonly pct: number;
}

export interface PerMetricPctChangeStreakLengthHistogramGroup {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly total_streaks: number;
  readonly max_length: number;
  readonly buckets: readonly PerMetricPctChangeStreakLengthBucket[];
}

export interface DigestSnapshotPerMetricPctChangeStreakLengthHistogram {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly groups: readonly PerMetricPctChangeStreakLengthHistogramGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-metric dense
 * length-frequency histogram of sustained-|pct|-material streaks. For each
 * HEADLINE_METRICS KPI with at least one qualifying (partner × this metric)
 * streak, emits an independent histogram over that KPI's own streak rows
 * with a dense bucket set from min_streak_length to max(row.length) FOR
 * THAT KPI — sibling KPIs' deeper tails do not pad this KPI's axis. Reuses
 * computeDigestSnapshotPerResellerPctChangeStreaks so histogram groups
 * cannot diverge from the P11.51 spotlight rows they summarise.
 *
 * Group ordering: HEADLINE_METRICS spec order. Bucket ordering within a
 * group: length asc. Each bucket carries count + share-of-KPI-total pct
 * rounded to one decimal. KPIs with zero qualifying rows are omitted
 * entirely.
 *
 * minStreakLength + threshold are forwarded to the detector; the detector
 * handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH; fractional →
 * floor; non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerMetricPctChangeStreakLengthHistogram {
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

  const groups: PerMetricPctChangeStreakLengthHistogramGroup[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = bySpecKey.get(spec.key);
    if (!bucket || bucket.lengths.length === 0) continue;

    const counts = new Map<number, number>();
    let maxLength = streaks.min_streak_length;
    for (const len of bucket.lengths) {
      counts.set(len, (counts.get(len) ?? 0) + 1);
      if (len > maxLength) maxLength = len;
    }

    const total = bucket.lengths.length;
    const buckets: PerMetricPctChangeStreakLengthBucket[] = [];
    for (let len = streaks.min_streak_length; len <= maxLength; len++) {
      const count = counts.get(len) ?? 0;
      buckets.push({
        length: len,
        count,
        pct: round1((count / total) * 100),
      });
    }

    groups.push({
      key: bucket.key,
      metric_name: bucket.metric_name,
      unit: bucket.unit,
      total_streaks: total,
      max_length: maxLength,
      buckets,
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
 * Render a per-metric sustained-|pct|-material length-frequency histogram
 * HTML section. One independent histogram table per KPI, walking
 * HEADLINE_METRICS spec order. Each table's Distribution column is a
 * plain-text 20-cell unicode-block gauge (█ filled + ░ empty) proportional
 * to bucket.count / max(bucket.count) WITHIN THAT KPI — the gauge scales
 * per-KPI so a low-cardinality metric's tail is not visually crushed by a
 * dominant metric's peak bucket. Caption embeds the threshold percent
 * alongside the qualifying-streak count so a reader instantly sees which
 * amber-band setting the shape is scored against.
 *
 * In the P11.88 cron wiring this lands directly BETWEEN the P11.71/P11.72
 * per-metric leaderboard and the P11.83/P11.84 per-partner length-histogram
 * so ops reads per-metric coverage (P11.63) → per-metric top-N leaderboard
 * (P11.71) → per-metric shape-of-persistence tail (this module) → per-
 * partner coverage (P11.55) → per-partner top-N leaderboard (P11.75) →
 * per-partner shape-of-persistence tail (P11.83) → per-(metric × partner)
 * spotlight detail (P11.51). This closes the histogram family's per-metric
 * axis on the magnitude side, symmetric with the leaderboard family (P11.71)
 * and the coverage family (P11.63) on the same |pct|-material axis.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 / P11.79 / P11.83 / P11.85 posture) OR when zero
 * groups qualify.
 */
export function formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection(
  histogram: DigestSnapshotPerMetricPctChangeStreakLengthHistogram,
): string {
  if (histogram.window_size < 3) return "";
  if (histogram.groups.length === 0) return "";

  const firstWeek = histogram.first_week
    ? escapeHtml(histogram.first_week)
    : "";
  const lastWeek = histogram.last_week ? escapeHtml(histogram.last_week) : "";
  const thresholdPct = round1(histogram.threshold * 100).toFixed(1);

  const barCells = 20;
  const groupsHtml = histogram.groups
    .map((group) => {
      const maxCount = group.buckets.reduce(
        (m, b) => (b.count > m ? b.count : m),
        0,
      );
      const rowsHtml = group.buckets
        .map((b) => {
          const filled =
            maxCount === 0
              ? 0
              : Math.round((b.count / maxCount) * barCells);
          const bar = "█".repeat(filled) + "░".repeat(barCells - filled);
          return `
      <tr>
        <td style="text-align:right">${b.length}</td>
        <td style="text-align:right">${b.count}</td>
        <td style="text-align:right">${b.pct.toFixed(1)}%</td>
        <td style="font-family:monospace">${bar}</td>
      </tr>`;
        })
        .join("");
      const total = group.total_streaks;
      const caption = `${escapeHtml(group.key)} / ${escapeHtml(group.metric_name)} &mdash; ${total} qualifying |&Delta;%| &ge; ${thresholdPct}% partner streak${total === 1 ? "" : "s"}, tail runs to length ${group.max_length}`;
      return `
    <h4 style="margin-top:16px;font-family:Arial,sans-serif;font-size:13px">${caption}</h4>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Length</th>
          <th>Count</th>
          <th>Share</th>
          <th>Distribution</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric sustained-|&Delta;%|-material streak length distributions across the ${histogram.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One length-frequency histogram per KPI so ops can answer "what's the SHAPE of persistence on THIS metric on the magnitude axis" at a glance &mdash; two KPIs with identical P11.63 coverage% and identical P11.71 #1 leaderboard entries can still differ sharply in tail (one clustering at length ${histogram.min_streak_length} while another sits on a fat tail of length-5+ |&Delta;%| &ge; ${thresholdPct}% runs) and neither of those surfaces exposes that. Buckets within a KPI group are dense from length ${histogram.min_streak_length} to that KPI's own max_length so zero-count bands between populated bands render explicitly. The Distribution gauge scales per-KPI so a low-cardinality metric's tail is not visually crushed by a dominant metric's peak.</p>${groupsHtml}`;
}
