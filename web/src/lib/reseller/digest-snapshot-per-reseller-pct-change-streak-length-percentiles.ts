// Weekly digest per-reseller sustained-|pct|-material streak length percentile summary (P11.95).
//
// Magnitude-axis analogue of the P11.93 per-partner direction-streak length
// percentile summary and per-partner analogue of the P11.91 portfolio
// |pct|-material percentile summary. The sustained-|pct|-material streak
// family now spans five surfaces at the per-partner grain:
//   • P11.51 → per-(metric × reseller) spotlight rows (which pairs sustained
//     a |pct_change| ≥ threshold run).
//   • P11.55 / P11.56 → per-partner coverage topline (share of qualifying
//     cells per partner).
//   • P11.75 / P11.76 → per-partner top-N leaderboard (deepest runs per
//     partner by length + cumulative |pct| depth).
//   • P11.83 / P11.84 → per-partner length-frequency histogram (dense buckets
//     from min_streak_length to that partner's own max_length observed).
//
// The portfolio grain already carries the scalar reduction of the histogram
// distribution on both axes (P11.89/P11.90 direction; P11.91/P11.92 |pct|):
// a single row of p50 / p90 / mean / max so ops can grep the shape-of-
// persistence scalars out of the cron-health JSONL envelope without re-
// parsing the histogram OR the underlying detector. The per-partner axis
// only carries that scalar reduction on the direction side today (P11.93 /
// P11.94). Ops reading the P11.83/P11.84 per-partner |pct|-material
// histogram still has to visually collapse each partner's distribution to
// answer the same common question one grain down: "for THIS partner, what's
// a typical volatile-|Δ%| run length? what's their long tail at the current
// threshold?"
//
// This module lands the per-partner analogue of P11.91 on the magnitude
// axis, mirroring the P11.93 direction-side analogue one axis over: one row
// per partner with a scalar p50 / p90 / mean / max reduction of THAT
// partner's own |pct|-material streak lengths. Two partners with identical
// P11.55 coverage% and identical P11.75 #1 leaderboard entries can still
// differ sharply in p50/p90 at a given threshold band — one carrying a fat
// magnitude tail (high p90 relative to its p50) while the other clusters
// tightly at min_streak_length — and neither of those surfaces exposes that
// as a scalar the way this summary does.
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
// P11.89 → P11.90 / P11.91 → P11.92 / P11.93 → P11.94 cadence. Cron-route
// wiring intentionally deferred to a follow-up tick (P11.96) so this shape
// can be exercised in isolation before touching the hot Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.96 cron wiring should
// splice the per-partner |pct|-material percentile section IMMEDIATELY
// BELOW the P11.83/P11.84 per-partner |pct|-material histogram so ops walks
// per-partner coverage (P11.55) → per-partner top-N leaderboard (P11.75) →
// per-partner length-frequency histogram (P11.83) → per-partner scalar
// p50/p90 summary (this module) → per-partner spotlight detail (P11.51).
// Mirrors the P11.93/P11.94 direction-side per-partner placement one axis
// over and extends the P11.91/P11.92 portfolio-grain magnitude placement
// one grain down.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so percentile
//     groups cannot diverge from the P11.51 spotlight rows they summarise —
//     mirrors the P11.83 histogram's delegation posture on the same axis
//     and the P11.93 percentile-summary delegation posture on the direction
//     axis.
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "ACME p50 shifted from 2 to 3 at the SAME
//     25% threshold" (real per-partner shape change) from "ACME p50 shifted
//     from 2 to 3 because the threshold was widened to 40%" (apparent shift
//     due to a wider amber band). Matches P11.83's threshold-passthrough on
//     the per-partner histogram and P11.91's threshold-passthrough on the
//     portfolio percentile summary.
//   • Percentile method = NEAREST RANK (inclusive), matching Excel/NIST's
//     PERCENTILE.INC semantics: rank index = ceil(p × N / 100) - 1 clamped
//     to [0, N-1] on the length-ascending sort of streak lengths WITHIN a
//     partner group. Identical to the P11.91 portfolio-grain method + the
//     P11.89/P11.93 direction methods so every percentile surface reports
//     on the same yardstick across grains and axes.
//   • Mean = arithmetic mean of streak lengths within a partner group,
//     rounded to one decimal to match every prior P11.x fractional formatter.
//   • Max = the deepest length observed for that partner (matches the
//     partner's P11.83 histogram.max_length exactly).
//   • Group ordering: reseller_code asc (deterministic + alphabetical —
//     matches P11.55 / P11.75 / P11.83 / P11.93 posture; partners have no
//     canonical spec order the way HEADLINE_METRICS does for KPIs).
//   • Partners with zero qualifying rows are omitted entirely (silent skip —
//     matches P11.83 posture; no zero-row noise rows).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51/P11.83/P11.91/P11.93 posture) OR
//     when zero groups qualify.

import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
} from "./digest-snapshot-per-reseller-pct-change-streaks";

export interface PerResellerPctChangeStreakLengthPercentilesGroup {
  readonly reseller_code: string;
  readonly total_streaks: number;
  readonly p50_length: number;
  readonly p90_length: number;
  readonly mean_length: number;
  readonly max_length: number;
}

export interface DigestSnapshotPerResellerPctChangeStreakLengthPercentiles {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly groups: readonly PerResellerPctChangeStreakLengthPercentilesGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Nearest-rank (inclusive) percentile on a length-ascending sorted array of
 * streak lengths. Rank index = ceil(p × N / 100) - 1 clamped to [0, N-1] so
 * p=100 always resolves to the max element and p=0 (unused here) resolves to
 * the min. Identical semantics to the P11.89 / P11.91 / P11.93 helpers so
 * every percentile surface reports on the same yardstick across grains and
 * axes.
 */
function nearestRank(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const rank = Math.max(0, Math.min(n - 1, Math.ceil((p * n) / 100) - 1));
  return sortedAsc[rank] ?? 0;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into per-partner scalar
 * |pct|-material streak-length percentile summaries. For each partner with
 * at least one qualifying streak, emits a group with p50 / p90 / mean / max
 * reduced from that partner's own |pct|-material streak lengths. Delegates
 * to computeDigestSnapshotPerResellerPctChangeStreaks so percentile groups
 * cannot diverge from the P11.51 spotlight rows.
 *
 * Group ordering: reseller_code asc. Partners with zero qualifying rows are
 * omitted entirely. minStreakLength + threshold are forwarded to the
 * detector; the detector handles its own coercion (< 1 →
 * DEFAULT_MIN_STREAK_LENGTH; fractional → floor; non-positive threshold →
 * PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPctChangeStreakLengthPercentiles {
  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  const byReseller = new Map<string, number[]>();
  for (const row of streaks.rows) {
    let lens = byReseller.get(row.reseller_code);
    if (!lens) {
      lens = [];
      byReseller.set(row.reseller_code, lens);
    }
    lens.push(row.length);
  }

  const sortedCodes = Array.from(byReseller.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const groups: PerResellerPctChangeStreakLengthPercentilesGroup[] = [];
  for (const code of sortedCodes) {
    const lengths = byReseller.get(code);
    if (!lengths || lengths.length === 0) continue;

    const sorted = [...lengths].sort((a, b) => a - b);
    const total = sorted.length;
    const sum = sorted.reduce((s, n) => s + n, 0);
    const mean = sum / total;
    const maxLen = sorted[sorted.length - 1] ?? streaks.min_streak_length;

    groups.push({
      reseller_code: code,
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
 * Render a per-partner scalar |pct|-material percentile summary as one
 * consolidated table with one row per partner (Partner / Total streaks /
 * p50 length / p90 length / Mean length / Max length). The one-table-many-
 * rows shape (vs P11.83's many-tables-one-histogram-each) is intentional
 * and mirrors P11.93's direction-side shape: the summary reduces every
 * partner to a scalar four-tuple so a side-by-side comparison across
 * partners at a given threshold band is the question ops most often asks
 * after reading the per-partner histogram.
 *
 * The caption embeds the threshold percent so a reader sees at a glance
 * which band the p50/p90 values are scored against — matches P11.83's and
 * P11.91's caption pattern on the magnitude axis.
 *
 * In the P11.96 cron wiring this lands directly BELOW the P11.83/P11.84
 * per-partner |pct|-material histogram and ABOVE the P11.51/P11.52
 * per-(metric × partner) spotlight so ops walks per-partner coverage
 * (P11.55) → per-partner top-N leaderboard (P11.75) → per-partner length-
 * frequency histogram (P11.83) → per-partner scalar p50/p90 summary (this
 * module) → per-partner spotlight detail (P11.51). Extends the P11.91/
 * P11.92 portfolio-grain magnitude placement rule one grain down and
 * mirrors the P11.93/P11.94 direction-side placement rule one axis over.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51/P11.83/P11.91/P11.93 posture) OR when zero groups
 * qualify.
 */
export function formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection(
  summary: DigestSnapshotPerResellerPctChangeStreakLengthPercentiles,
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
          <td>${escapeHtml(group.reseller_code)}</td>
          <td style="text-align:right">${group.total_streaks}</td>
          <td style="text-align:right">${group.p50_length}</td>
          <td style="text-align:right">${group.p90_length}</td>
          <td style="text-align:right">${group.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${group.max_length}</td>
        </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-partner sustained-|&Delta;%|-material streak length percentiles across the ${summary.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% threshold</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar p50 / p90 / mean / max summary per partner &mdash; extends the P11.91 portfolio-grain magnitude reduction one grain down and mirrors the P11.93 direction-side per-partner summary one axis over so ops can grep partner-scoped |&Delta;%|-material shape scalars out of the cron-health JSONL envelope without re-folding the P11.83 per-partner histogram OR the underlying detector. Two partners with identical P11.55 coverage% and identical P11.75 #1 leaderboard entries at the same ${thresholdPct}% threshold can still differ sharply in p50/p90 &mdash; one carrying a fat magnitude tail (high p90 relative to its p50) while the other clusters tightly at length ${summary.min_streak_length} &mdash; and neither of those surfaces exposes that as a scalar the way this summary does. Nearest-rank method (inclusive) matches the P11.89/P11.91/P11.93 yardstick so per-partner values are directly comparable to the portfolio p50/p90 above and to the direction-side per-partner summary alongside. Threshold carried alongside the percentile values so a shift from p50=2 to p50=3 at the SAME threshold reads differently from an apparent shift caused by widening the threshold band.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Partner</th>
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
