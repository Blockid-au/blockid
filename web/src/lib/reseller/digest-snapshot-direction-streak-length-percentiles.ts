// Weekly digest portfolio direction-streak-length percentile summary (P11.89).
//
// The direction-streak family now carries three exec-summary surfaces at the
// portfolio grain:
//   • P11.30 / P11.31 — sustained-direction streak table (per-metric longest
//     same-sign run).
//   • P11.57 / P11.58 — coverage topline (share of possible metric cells
//     qualifying at min_streak_length).
//   • P11.67 / P11.68 — leaderboard (top-N deepest runs).
//   • P11.77 / P11.78 — length-frequency histogram (dense bucket set from
//     min_streak_length to max_length observed).
//
// The histogram exposes the SHAPE of persistence but requires a reader to
// visually reduce a distribution to a single number to answer a common ops
// question: "what's a typical streak length this week vs last week?" — the
// median and the 90th percentile are the two numbers ops usually cites when
// scanning a length distribution in a hurry, and reading them off a 20-cell
// unicode-block gauge is not the same as grepping a numeric field out of
// JSONL over time.
//
// This module lands a compact percentile summary: p50 (median), p90 (long
// tail), mean, and max computed directly from the P11.77 histogram's source
// (DigestSnapshotDirectionStreaks). One row per fold — no distribution to
// scroll — with the same window metadata as its histogram sibling so a
// JSONL consumer can grep 'p50_length=2 p90_length=4' week over week without
// re-folding the histogram OR the underlying detector.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 / P11.83 → P11.84 / P11.85 → P11.86 / P11.87 → P11.88
// cadence. Cron-route wiring intentionally deferred to a follow-up tick
// (P11.90) so this shape can be exercised in isolation before touching the
// hot Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.90 cron wiring should
// splice the percentile section IMMEDIATELY BELOW the P11.77/P11.78 portfolio
// direction histogram so ops reads the full length distribution and then the
// scalar p50/p90 summary directly underneath — the summary answers the
// distribution's most frequently asked reduction at a glance.
//
// Design notes:
//   • Consumes DigestSnapshotDirectionStreaks directly (SAME input as the
//     P11.77 histogram) rather than re-folding the P11.30 detector — this
//     guarantees the percentile summary cannot diverge from the histogram
//     it summarises for a given window.
//   • Percentile method = NEAREST RANK (inclusive), matching Excel/NIST's
//     PERCENTILE.INC semantics: rank index = ceil(p × N / 100) - 1 clamped
//     to [0, N-1] on the length-ascending sort of streak lengths. Simple,
//     deterministic, no interpolation ambiguity when the plan doubles as
//     a spec for downstream consumers.
//   • Mean = arithmetic mean of streak lengths across all qualifying rows,
//     rounded to one decimal to match every prior P11.x fractional formatter.
//   • Max = the deepest length observed (matches P11.77 histogram.max_length).
//   • Empty-fold safety: when total_streaks is zero the module returns a
//     shape with p50=p90=mean=0 and max=min_streak_length so downstream JSONL
//     consumers see a stable schema on flat weeks. The formatter still self-
//     suppresses in that case to avoid a noise row in the email.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.30/P11.77 posture) OR when total_streaks
//     is zero.

import type { DigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";

export interface DigestSnapshotDirectionStreakLengthPercentiles {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly total_streaks: number;
  readonly p50_length: number;
  readonly p90_length: number;
  readonly mean_length: number;
  readonly max_length: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Nearest-rank (inclusive) percentile on a length-ascending sorted array of
 * streak lengths. Rank index = ceil(p × N / 100) - 1 clamped to [0, N-1] so
 * p=100 always resolves to the max element and p=0 (unused here) resolves to
 * the min. Callers must pass p in the (0, 100] open-closed range for a
 * populated input; the function does not validate p because the two call
 * sites below (p=50, p=90) are compile-time constants.
 */
function nearestRank(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const rank = Math.max(0, Math.min(n - 1, Math.ceil((p * n) / 100) - 1));
  return sortedAsc[rank] ?? 0;
}

/**
 * Fold a DigestSnapshotDirectionStreaks into a scalar percentile summary
 * (p50, p90, mean, max) of the qualifying streak lengths. Returns a
 * zero-initialised shape (with max coerced to min_streak_length) when the
 * input has no rows so downstream JSONL consumers see a stable schema on
 * flat weeks.
 */
export function computeDigestSnapshotDirectionStreakLengthPercentiles(
  streaks: DigestSnapshotDirectionStreaks,
): DigestSnapshotDirectionStreakLengthPercentiles {
  const rows = streaks.rows;
  const total = rows.length;
  if (total === 0) {
    return {
      window_size: streaks.window_size,
      first_week: streaks.first_week,
      last_week: streaks.last_week,
      min_streak_length: streaks.min_streak_length,
      total_streaks: 0,
      p50_length: 0,
      p90_length: 0,
      mean_length: 0,
      max_length: streaks.min_streak_length,
    };
  }

  const lengths = rows.map((r) => r.length).sort((a, b) => a - b);
  const sum = lengths.reduce((s, n) => s + n, 0);
  const mean = sum / total;
  const maxLen = lengths[lengths.length - 1] ?? streaks.min_streak_length;

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    total_streaks: total,
    p50_length: nearestRank(lengths, 50),
    p90_length: nearestRank(lengths, 90),
    mean_length: round1(mean),
    max_length: maxLen,
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
 * Render a compact single-row percentile summary HTML section. The P11.90
 * cron wiring should splice this IMMEDIATELY BELOW the P11.77/P11.78
 * histogram so ops reads the full length distribution and then the scalar
 * p50/p90 summary directly underneath — the summary answers the
 * distribution's most frequently asked reduction ("what's a typical streak
 * length? what's the long tail?") at a glance without visually reducing the
 * histogram.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.30/P11.77 posture) OR when total_streaks is zero.
 */
export function formatDigestSnapshotDirectionStreakLengthPercentilesSection(
  summary: DigestSnapshotDirectionStreakLengthPercentiles,
): string {
  if (summary.window_size < 3) return "";
  if (summary.total_streaks === 0) return "";

  const firstWeek = summary.first_week ? escapeHtml(summary.first_week) : "";
  const lastWeek = summary.last_week ? escapeHtml(summary.last_week) : "";

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Sustained-direction streak length percentiles across the ${summary.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar p50 / p90 / mean / max summary of the ${summary.total_streaks} qualifying streak${summary.total_streaks === 1 ? "" : "s"} above &mdash; complements the P11.77 length-frequency histogram by exposing the two numbers ops most often cites when scanning a distribution in a hurry: the median (typical run) and the p90 (long tail). Nearest-rank method (inclusive) so the p50/p90 values always exist in the observed length set. Grep the numeric fields out of the cron-health JSONL envelope to trend the shape week over week without re-folding the histogram OR the underlying detector.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Total streaks</th>
          <th>p50 length</th>
          <th>p90 length</th>
          <th>Mean length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:right">${summary.total_streaks}</td>
          <td style="text-align:right">${summary.p50_length}</td>
          <td style="text-align:right">${summary.p90_length}</td>
          <td style="text-align:right">${summary.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${summary.max_length}</td>
        </tr>
      </tbody>
    </table>`;
}
