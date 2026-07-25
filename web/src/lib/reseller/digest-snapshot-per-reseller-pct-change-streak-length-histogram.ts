// Weekly digest per-reseller sustained-|pct|-material streak length-frequency histogram (P11.83).
//
// |pct|-magnitude analogue of the P11.81 per-reseller direction-streak length
// histogram. The sustained-|pct|-material streak family now ships six surfaces
// at increasing grain:
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
//     observed with a share-of-total pct per bucket).
//
// The histogram axis so far only exists at the portfolio grain on the
// magnitude axis (P11.79). Ops still asks the reciprocal per-partner question
// when scanning P11.51: "for THIS partner, what's the SHAPE of their
// |pct|-material runs — mostly length-2 blips clearing the threshold, or a
// fat tail of length-5+ persistence?" A per-partner coverage rate (P11.55)
// or a per-partner top-N leaderboard (P11.75) can't answer that: coverage
// collapses shape into a single ratio and the leaderboard caps at top-N so
// the distribution beyond the top-N entries is invisible. Two partners with
// identical coverage% and identical #1 leaderboard entries can differ
// sharply in tail — one clustering at min_streak_length while another sits
// on a fat tail — and neither surface exposes that at the per-partner grain
// on the magnitude axis.
//
// This module lands the per-partner analogue of P11.79 on the magnitude axis:
// for each partner with at least one qualifying |pct|-material streak, emit
// an independent length-frequency histogram over that partner's own streak
// rows. Bucket set is DENSE from min_streak_length to max(row.length) FOR
// THAT PARTNER so the axis reads continuously — a partner whose deepest run
// is length 4 does not carry a phantom length-5 bucket sourced from a
// different partner's tail. Shape is the direct-analogue of P11.75/P11.76
// leaderboard grouping: groups sorted by reseller_code asc, one histogram
// per partner group, only partners with at least one qualifying row emit a
// group. This closes the histogram family's per-partner axis symmetric with
// P11.55 (coverage) and P11.75 (leaderboard) on the magnitude axis and
// mirrors P11.81 on the direction axis.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.84) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so histogram groups
//     cannot diverge from the P11.51 spotlight rows they summarise — mirrors
//     the P11.75 leaderboard's delegation posture on the magnitude axis and
//     P11.81's delegation posture on the direction axis.
//   • Buckets within a group are DENSE from min_streak_length to that
//     partner's max_length observed. A zero-count band between two populated
//     ones renders explicitly with count=0, pct=0 so the length axis reads
//     continuously and the visual bar in the formatter is not visually
//     collapsed against neighbouring bars — matches P11.79's dense-bucket
//     contract at the portfolio grain.
//   • Per-partner max_length is a group-local horizon; a partner whose
//     deepest run is length-4 renders 3 buckets (2/3/4) even if a sibling
//     partner has a length-6 run. Sharing the portfolio-wide max_length
//     across groups would pad every partner with zero-count trailing bands
//     unless that partner also carries the max — the wrong signal for the
//     per-partner question this table answers.
//   • pct within a group = round1(count / group_total × 100). Each partner's
//     shares sum to 100 within their own histogram (subject to rounding) —
//     the per-partner shape is a distribution over THAT partner's runs,
//     never a share of the portfolio total.
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "60% of ACME's runs are length-2 at the 25%
//     threshold" from "60% of ACME's runs are length-2 at a widened 40%
//     threshold" without side-loading the P11.51 envelope. Matches P11.79's
//     threshold-passthrough on the portfolio grain.
//   • Sort of buckets within a group: length asc (histogram reads left-to-
//     right shortest → longest — matches P11.79/P11.81's x-axis convention).
//   • Group ordering: reseller_code asc (deterministic + alphabetical — matches
//     P11.55 / P11.75 / P11.81 posture; partners have no canonical spec order
//     the way HEADLINE_METRICS does for KPIs).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51/P11.79 posture) OR when zero groups
//     qualify (matches P11.75's quiet-when-flat posture at the per-partner
//     grain — a first-run digest stays silent on this section).

import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
} from "./digest-snapshot-per-reseller-pct-change-streaks";

export interface PerResellerPctChangeStreakLengthBucket {
  readonly length: number;
  readonly count: number;
  readonly pct: number;
}

export interface PerResellerPctChangeStreakLengthHistogramGroup {
  readonly reseller_code: string;
  readonly total_streaks: number;
  readonly max_length: number;
  readonly buckets: readonly PerResellerPctChangeStreakLengthBucket[];
}

export interface DigestSnapshotPerResellerPctChangeStreakLengthHistogram {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly groups: readonly PerResellerPctChangeStreakLengthHistogramGroup[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-partner dense
 * length-frequency histogram of sustained-|pct|-material streaks. For each
 * partner with at least one qualifying streak, emits an independent
 * histogram over that partner's own streak rows with a dense bucket set
 * from min_streak_length to max(row.length) FOR THAT PARTNER — sibling
 * partners' deeper tails do not pad this partner's axis. Reuses
 * computeDigestSnapshotPerResellerPctChangeStreaks so histogram groups
 * cannot diverge from the P11.51 spotlight rows they summarise.
 *
 * Group ordering: reseller_code asc. Bucket ordering within a group: length
 * asc. Each bucket carries count + share-of-partner-total pct rounded to
 * one decimal. Partners with zero qualifying rows are omitted entirely.
 *
 * minStreakLength + threshold are forwarded to the detector; the detector
 * handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH; fractional →
 * floor; non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPctChangeStreakLengthHistogram {
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

  const groups: PerResellerPctChangeStreakLengthHistogramGroup[] = [];
  for (const code of sortedCodes) {
    const lengths = byReseller.get(code);
    if (!lengths || lengths.length === 0) continue;

    const counts = new Map<number, number>();
    let maxLength = streaks.min_streak_length;
    for (const len of lengths) {
      counts.set(len, (counts.get(len) ?? 0) + 1);
      if (len > maxLength) maxLength = len;
    }

    const total = lengths.length;
    const buckets: PerResellerPctChangeStreakLengthBucket[] = [];
    for (let len = streaks.min_streak_length; len <= maxLength; len++) {
      const count = counts.get(len) ?? 0;
      buckets.push({
        length: len,
        count,
        pct: round1((count / total) * 100),
      });
    }

    groups.push({
      reseller_code: code,
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
 * Render a per-partner sustained-|pct|-material length-frequency histogram
 * HTML section. One independent histogram table per partner, sorted
 * reseller_code asc. Each table's Distribution column is a plain-text
 * 20-cell unicode-block gauge (█ filled + ░ empty) proportional to
 * bucket.count / max(bucket.count) WITHIN THAT PARTNER — the gauge scales
 * per-partner so a small partner's tail is not visually crushed by a
 * dominant partner's peak bucket.
 *
 * In the P11.84 cron wiring this lands directly BETWEEN the P11.75/P11.76
 * per-partner leaderboard and the P11.51/P11.52 per-(metric × partner)
 * spotlight so ops reads the partner topline (coverage P11.55) →
 * per-partner leaderboard top-N (P11.75) → per-partner shape-of-persistence
 * tail (this module) → per-partner spotlight detail (P11.51). This closes
 * the histogram family's per-partner axis symmetric with the leaderboard
 * family on the magnitude axis and mirrors the P11.82 placement on the
 * direction axis.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51/P11.79 posture) OR when zero groups qualify.
 */
export function formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
  histogram: DigestSnapshotPerResellerPctChangeStreakLengthHistogram,
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
      const caption = `${escapeHtml(group.reseller_code)} &mdash; ${total} qualifying |&Delta;%| &ge; ${thresholdPct}% streak${total === 1 ? "" : "s"}, tail runs to length ${group.max_length}`;
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-partner sustained-|&Delta;%|-material streak length distributions across the ${histogram.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One length-frequency histogram per partner so ops can answer "what's the SHAPE of THIS partner's magnitude persistence" at a glance &mdash; two partners with identical P11.55 coverage% and identical P11.75 #1 leaderboard entries can still differ sharply in tail (one clustering at length ${histogram.min_streak_length} while another sits on a fat tail of length-5+ |&Delta;%| &ge; ${thresholdPct}% runs) and neither of those surfaces exposes that. Buckets within a partner group are dense from length ${histogram.min_streak_length} to that partner's own max_length so zero-count bands between populated bands render explicitly. The Distribution gauge scales per-partner so a small partner's tail is not visually crushed by a dominant partner's peak.</p>${groupsHtml}`;
}
