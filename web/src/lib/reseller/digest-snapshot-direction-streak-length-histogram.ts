// Weekly digest portfolio direction-streak-length histogram (P11.77).
//
// The direction-streak family already carries persistence-first surfaces at
// several grains:
//   • P11.30 → portfolio-wide sustained-direction streak detector (per-metric
//     longest same-sign run across the rolling trend).
//   • P11.31 → the cron-wired formatter for the P11.30 table.
//   • P11.57 / P11.59 / P11.61 → coverage toplines at portfolio / per-metric /
//     per-reseller grains (share of qualifying cells).
//   • P11.67 / P11.69 / P11.73 → leaderboards at flat / per-metric /
//     per-reseller grains (top-N ranked lists of longest runs).
//
// Every surface above answers either "which cells qualify" (coverage) or
// "which cells are the deepest" (leaderboard). Neither answers a third
// executive question ops routinely asks scanning the P11.30 table: "what's
// the SHAPE of persistence — are our qualifying streaks mostly length-2
// blips clearing the threshold, or are we sitting on a fat tail of length-5+
// runs that warrant a call?" Two portfolios with the same coverage% and the
// same leaderboard #1 can have wildly different tails — one where the top-N
// dominates and everything else clusters at min_streak_length, versus one
// where the length distribution is broad and sustained. The leaderboard
// hides that shape by capping at top-N; coverage hides it by collapsing to a
// single ratio.
//
// This module lands a compact length-frequency histogram of the portfolio's
// qualifying streaks. For each length observed at or above
// min_streak_length, count how many (metric) rows sit at exactly that
// length; carry a share-of-total pct so ops can read "60% of our sustained
// runs are length-2, 30% are length-3, 10% are length-4+" at a glance. The
// bucket set is dense from min_streak_length to max_length observed (no
// gaps skipped) so the visual bar in the formatter cannot mislead by
// omitting a zero-count length between two populated bands.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.78) so this shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotDirectionStreaks directly rather than folding
//     the RollingTrend a second time — mirrors the P11.57 coverage /
//     P11.67 leaderboard pattern and guarantees the histogram cannot
//     diverge from the P11.30 streak rows it summarises.
//   • Buckets are DENSE from min_streak_length to max_length observed. A
//     zero-count band between two populated ones renders explicitly with
//     count=0, pct=0 so the length axis reads continuously and the visual
//     bar in the formatter is not visually collapsed against neighbouring
//     bars.
//   • pct = round1(count / total_streaks × 100). Rounded to one decimal to
//     match every prior P11.x pct formatter (coverage / leaderboard).
//   • Sort: length asc — the histogram reads left-to-right shortest → longest
//     which is the natural axis convention for a length-frequency plot and
//     matches how the P11.30 rows already sort length desc (this is the
//     transpose — buckets are the x-axis).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.30 posture) OR when total_streaks
//     is zero.

import type { DigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";

export interface DirectionStreakLengthBucket {
  readonly length: number;
  readonly count: number;
  readonly pct: number;
}

export interface DigestSnapshotDirectionStreakLengthHistogram {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly total_streaks: number;
  readonly max_length: number;
  readonly buckets: readonly DirectionStreakLengthBucket[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotDirectionStreaks into a dense length-frequency
 * histogram. Bucket set spans min_streak_length..max(row.length) with a
 * zero-count entry for every length band in between so the visual bar
 * cannot skip a gap. Each bucket carries count + share-of-total pct.
 *
 * Returns { total_streaks: 0, buckets: [] } when the input has no rows;
 * max_length coerces to min_streak_length in that case so the shape is
 * still safe for consumers.
 */
export function computeDigestSnapshotDirectionStreakLengthHistogram(
  streaks: DigestSnapshotDirectionStreaks,
): DigestSnapshotDirectionStreakLengthHistogram {
  const rows = streaks.rows;
  const total = rows.length;
  if (total === 0) {
    return {
      window_size: streaks.window_size,
      first_week: streaks.first_week,
      last_week: streaks.last_week,
      min_streak_length: streaks.min_streak_length,
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

  const buckets: DirectionStreakLengthBucket[] = [];
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
 * some clients strip. In the P11.78 cron wiring this lands directly BELOW
 * the P11.30/P11.31 sustained-direction table so ops reads the count-per-
 * metric list and then the shape-of-persistence tail underneath.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.30 posture) OR when total_streaks is zero.
 */
export function formatDigestSnapshotDirectionStreakLengthHistogramSection(
  histogram: DigestSnapshotDirectionStreakLengthHistogram,
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

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained-direction streak length distribution across the ${histogram.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Length-frequency histogram of the ${histogram.total_streaks} qualifying streak${histogram.total_streaks === 1 ? "" : "s"} above &mdash; complements the P11.57 coverage topline (share of possible cells qualifying) and the P11.67 leaderboard (top-N deepest runs) by exposing the SHAPE of persistence between them. Two portfolios with the same coverage% and the same #1 leaderboard entry can differ sharply in tail: one may cluster at min_streak_length while another sits on a fat tail of length-${histogram.max_length} runs. Buckets are dense from length ${histogram.min_streak_length} to length ${histogram.max_length} so a zero-count band between two populated ones renders explicitly rather than collapsing the axis.</p>
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
