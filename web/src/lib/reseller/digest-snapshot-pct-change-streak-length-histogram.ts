// Weekly digest portfolio |pct|-material streak-length histogram (P11.79).
//
// |pct|-magnitude analogue of the P11.77 direction-streak length histogram.
// The sustained-|pct|-material streak family already carries persistence
// surfaces at several grains:
//   • P11.49 → portfolio-wide sustained-|pct|-material streak detector
//     (per-metric longest run of consecutive transitions with
//     |pct_change| ≥ threshold across the rolling trend).
//   • P11.50 → the cron-wired formatter for the P11.49 table.
//   • P11.53 / P11.55 / P11.63 → coverage toplines at portfolio / per-metric
//     / per-reseller grains (share of qualifying cells).
//   • P11.67 / P11.71 / P11.75 → leaderboards at flat / per-metric /
//     per-reseller grains (top-N ranked lists by length + cumulative_abs_pct
//     depth).
//
// The same executive gap the P11.77 direction histogram closed on the
// sign-of-delta axis exists here on the magnitude axis: two portfolios can
// have the same coverage% and the same #1 leaderboard entry and still
// differ sharply in tail — one clustering at min_streak_length while
// another sits on a fat tail of length-5+ |pct|-material runs. Neither
// coverage (which collapses to a single ratio) nor leaderboard (which caps
// at top-N) exposes that shape.
//
// This module lands a compact length-frequency histogram of the portfolio's
// qualifying |pct|-material streaks. For each length observed at or above
// min_streak_length, count how many (metric) rows sit at exactly that
// length; carry a share-of-total pct so ops can read "60% of our
// |pct|-material runs are length-2, 30% are length-3, 10% are length-4+"
// at a glance. Bucket set dense from min_streak_length to max observed
// length so a zero-count band between two populated ones renders
// explicitly rather than collapsing the axis.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 pattern. Cron-route
// wiring intentionally deferred to a follow-up tick (P11.80) so this shape
// can be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPctChangeStreaks directly rather than folding
//     the RollingTrend a second time — mirrors the P11.53 coverage /
//     P11.67 leaderboard pattern and guarantees the histogram cannot
//     diverge from the P11.49 streak rows it summarises.
//   • Buckets are DENSE from min_streak_length to max_length observed. A
//     zero-count band between two populated ones renders explicitly with
//     count=0, pct=0 so the length axis reads continuously and the visual
//     bar in the formatter is not visually collapsed against neighbouring
//     bars.
//   • pct = round1(count / total_streaks × 100). Rounded to one decimal to
//     match every prior P11.x pct formatter (coverage / leaderboard /
//     P11.77 direction histogram).
//   • Sort: length asc — the histogram reads left-to-right shortest → longest
//     which is the natural axis convention for a length-frequency plot and
//     matches how the P11.49 rows already sort length desc (this is the
//     transpose — buckets are the x-axis).
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "35% of our runs are length-2 at the 25%
//     threshold" from "35% of our runs are length-2 at a widened 40%
//     threshold" without side-loading the P11.49 envelope.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.49 posture) OR when total_streaks
//     is zero.

import type { DigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";

export interface PctChangeStreakLengthBucket {
  readonly length: number;
  readonly count: number;
  readonly pct: number;
}

export interface DigestSnapshotPctChangeStreakLengthHistogram {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly total_streaks: number;
  readonly max_length: number;
  readonly buckets: readonly PctChangeStreakLengthBucket[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPctChangeStreaks into a dense length-frequency
 * histogram. Bucket set spans min_streak_length..max(row.length) with a
 * zero-count entry for every length band in between so the visual bar
 * cannot skip a gap. Each bucket carries count + share-of-total pct.
 *
 * Returns { total_streaks: 0, buckets: [] } when the input has no rows;
 * max_length coerces to min_streak_length in that case so the shape is
 * still safe for consumers.
 */
export function computeDigestSnapshotPctChangeStreakLengthHistogram(
  streaks: DigestSnapshotPctChangeStreaks,
): DigestSnapshotPctChangeStreakLengthHistogram {
  const rows = streaks.rows;
  const total = rows.length;
  if (total === 0) {
    return {
      window_size: streaks.window_size,
      first_week: streaks.first_week,
      last_week: streaks.last_week,
      min_streak_length: streaks.min_streak_length,
      threshold: streaks.threshold,
      total_streaks: 0,
      max_length: streaks.min_streak_length,
      buckets: [],
    };
  }

  const counts = new Map<number, number>();
  let maxLength = streaks.min_streak_length;
  for (const row of rows) {
    counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    if (row.length > maxLength) maxLength = row.length;
  }

  const buckets: PctChangeStreakLengthBucket[] = [];
  for (let len = streaks.min_streak_length; len <= maxLength; len++) {
    const count = counts.get(len) ?? 0;
    buckets.push({
      length: len,
      count,
      pct: round1((count / total) * 100),
    });
  }

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    threshold: streaks.threshold,
    total_streaks: total,
    max_length: maxLength,
    buckets,
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
 * Render a length-frequency histogram HTML section. The bar column is a
 * plain-text unicode-block gauge so it renders identically in every email
 * client without relying on inline image support or CSS width tricks that
 * some clients strip. In the P11.80 cron wiring this lands directly BELOW
 * the P11.49/P11.50 sustained-|pct|-material table so ops reads the
 * count-per-metric list and then the shape-of-persistence tail underneath
 * — the magnitude-axis analogue of the P11.78 direction placement rule.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.49 posture) OR when total_streaks is zero.
 */
export function formatDigestSnapshotPctChangeStreakLengthHistogramSection(
  histogram: DigestSnapshotPctChangeStreakLengthHistogram,
): string {
  if (histogram.window_size < 3) return "";
  if (histogram.total_streaks === 0) return "";

  const firstWeek = histogram.first_week
    ? escapeHtml(histogram.first_week)
    : "";
  const lastWeek = histogram.last_week ? escapeHtml(histogram.last_week) : "";

  const maxCount = histogram.buckets.reduce(
    (m, b) => (b.count > m ? b.count : m),
    0,
  );
  const barCells = 20;
  const rowsHtml = histogram.buckets
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

  const thresholdPct = round1(histogram.threshold * 100).toFixed(1);

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained-|Δ%|-material streak length distribution across the ${histogram.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Length-frequency histogram of the ${histogram.total_streaks} qualifying |&Delta;%| &ge; ${thresholdPct}% streak${histogram.total_streaks === 1 ? "" : "s"} above &mdash; complements the P11.53 coverage topline (share of possible cells qualifying) and the P11.67 leaderboard (top-N deepest volatile runs) by exposing the SHAPE of magnitude persistence between them. Two portfolios with the same coverage% and the same #1 leaderboard entry can differ sharply in tail: one may cluster at min_streak_length while another sits on a fat tail of length-${histogram.max_length} runs. Buckets are dense from length ${histogram.min_streak_length} to length ${histogram.max_length} so a zero-count band between two populated ones renders explicitly rather than collapsing the axis.</p>
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
}
