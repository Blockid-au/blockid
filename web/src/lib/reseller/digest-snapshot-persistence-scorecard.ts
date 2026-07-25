// Weekly digest portfolio direction+magnitude persistence scorecard (P11.105).
//
// The streak length percentile family now covers both axes (direction and
// |pct|-material magnitude) at every grain:
//   • P11.89 / P11.90   → portfolio direction scalar reduction
//   • P11.91 / P11.92   → portfolio magnitude scalar reduction
//   • P11.93 / P11.94   → per-partner direction scalar reduction
//   • P11.95 / P11.96   → per-partner magnitude scalar reduction
//   • P11.97 / P11.98   → per-metric direction scalar reduction
//   • P11.99 / P11.100  → per-metric magnitude scalar reduction
//
// The per-metric capstone (P11.101 / P11.102) landed the direction+magnitude
// scorecard at the per-KPI grain and the per-partner capstone (P11.103 /
// P11.104) landed it at the per-partner grain — but the PORTFOLIO grain still
// has the same gap: ops reading the digest sees the portfolio direction
// summary (P11.89/P11.90) and, further down, the portfolio magnitude summary
// (P11.91/P11.92), but the two sit in DIFFERENT tables walked by DIFFERENT
// source folds (snapshotDirectionStreaks vs snapshotPctChangeStreaks), so
// answering "is the PORTFOLIO persistent on BOTH axes, one axis only, or
// neither?" still requires cross-referencing two sections. A portfolio whose
// direction p50/p90 look identical to another week's can differ sharply on
// the magnitude axis: one carries a fat |Δ%| tail (weeks of sustained
// direction that also happen to clear the amber band) while the other stays
// inside the band (sustained direction without material magnitude). Neither
// the direction-side nor the magnitude-side portfolio summary exposes that
// split as a single row.
//
// This module closes that gap at the PORTFOLIO grain — the natural next
// surface after the per-metric and per-partner capstones. Fold BOTH axes and
// emit ONE row with side-by-side scalar reductions for direction (from
// P11.89's fold) and magnitude (from P11.91's fold). One consolidated table
// with one row per fold so ops can answer "is the PORTFOLIO persistent on
// direction AND magnitude, or only one, or neither?" without ever scrolling
// between two digest sections.
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
// P11.97 → P11.98 / P11.99 → P11.100 / P11.101 → P11.102 / P11.103 → P11.104
// cadence. Cron-route wiring intentionally deferred to a follow-up tick
// (P11.106) so this cross-axis synthesis can be exercised in isolation before
// touching the hot Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.106 cron wiring should
// splice the portfolio persistence scorecard section IMMEDIATELY BELOW the
// P11.91/P11.92 portfolio magnitude percentile section (the last portfolio-
// grain summary in the current ladder) and ABOVE the per-partner + per-metric
// coverage/leaderboard/histogram/percentile ladders so ops walks portfolio
// coverage → portfolio spotlight → portfolio direction shape (P11.77) →
// portfolio direction scalar (P11.89) → portfolio magnitude shape (P11.79) →
// portfolio magnitude scalar (P11.91) → portfolio BOTH-AXES scorecard (this
// module) → per-metric ladder → per-partner ladder. Mirrors the P11.101/
// P11.102 per-metric capstone and P11.103/P11.104 per-partner capstone
// placement rules one grain up so all three capstone scorecards land at the
// bottom of their respective grain's ladder.
//
// Design notes:
//   • Consumes DigestSnapshotDirectionStreaks + DigestSnapshotPctChangeStreaks
//     directly and delegates to BOTH
//     computeDigestSnapshotDirectionStreakLengthPercentiles (P11.89) AND
//     computeDigestSnapshotPctChangeStreakLengthPercentiles (P11.91).
//     Scorecard fields cannot diverge from the two summaries they side-by-
//     side because they ARE those same folds joined into one row.
//   • Threshold from the magnitude source envelope is carried through so
//     JSONL consumers can distinguish "portfolio magnitude persistence
//     increased at the SAME 25% threshold" (real portfolio shape change)
//     from "portfolio magnitude persistence appeared to increase because
//     the threshold widened to 40%" (apparent shift). Matches P11.91/
//     P11.95/P11.99/P11.101/P11.103 threshold-passthrough posture.
//   • Window metadata pulled from the direction envelope (both envelopes
//     share the same rolling window so this is arbitrary but deterministic —
//     matches P11.101 / P11.103 posture on pulling window metadata from
//     the direction side).
//   • min_streak_length pulled from the direction envelope (same reasoning
//     as window metadata — both envelopes use the same DEFAULT_MIN_STREAK_LENGTH
//     unless a caller overrides them independently, and the direction side is
//     the anchor for cross-axis comparisons).
//   • Zero-fill semantics: when the direction fold has zero streaks the
//     direction block is zero (total_streaks=0, p50/p90/mean=0, max coerced
//     to min_streak_length by the P11.89 empty-fold shape); same for the
//     magnitude block via the P11.91 empty-fold shape. Callers can visually
//     see the asymmetry (fat direction block beside a zero magnitude block
//     ⇒ portfolio carries sustained direction without material |Δ%|; opposite
//     ⇒ portfolio churns materially but flips direction each week).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.49 / P11.79 / P11.89 / P11.91 posture)
//     OR when BOTH axes have zero streaks (the "flat portfolio" week).

import type { DigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";
import type { DigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";
import { computeDigestSnapshotDirectionStreakLengthPercentiles } from "./digest-snapshot-direction-streak-length-percentiles";
import { computeDigestSnapshotPctChangeStreakLengthPercentiles } from "./digest-snapshot-pct-change-streak-length-percentiles";

export interface PersistenceScorecardAxis {
  readonly total_streaks: number;
  readonly p50_length: number;
  readonly p90_length: number;
  readonly mean_length: number;
  readonly max_length: number;
}

export interface DigestSnapshotPersistenceScorecard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly direction: PersistenceScorecardAxis;
  readonly magnitude: PersistenceScorecardAxis;
}

/**
 * Fold portfolio-grain direction + magnitude streak inputs into a single
 * scorecard row that side-by-sides the P11.89 direction-axis and P11.91
 * magnitude-axis scalar reductions (p50 / p90 / mean / max). Delegates to
 * both percentile helpers so the scorecard cannot diverge from the two
 * portfolio summaries it consolidates.
 *
 * Window metadata + min_streak_length come from the direction envelope
 * (arbitrary but deterministic anchor — both envelopes walk the same rolling
 * window). Threshold comes from the magnitude envelope (the only tunable
 * band on the scorecard — direction has no threshold). Empty-fold safety is
 * handled by the two upstream helpers: zero streaks on either axis leaves
 * that block zero-filled so ops can visually see the asymmetry.
 */
export function computeDigestSnapshotPersistenceScorecard(
  directionStreaks: DigestSnapshotDirectionStreaks,
  pctChangeStreaks: DigestSnapshotPctChangeStreaks,
): DigestSnapshotPersistenceScorecard {
  const direction =
    computeDigestSnapshotDirectionStreakLengthPercentiles(directionStreaks);
  const magnitude =
    computeDigestSnapshotPctChangeStreakLengthPercentiles(pctChangeStreaks);

  return {
    window_size: direction.window_size,
    first_week: direction.first_week,
    last_week: direction.last_week,
    min_streak_length: direction.min_streak_length,
    threshold: magnitude.threshold,
    direction: {
      total_streaks: direction.total_streaks,
      p50_length: direction.p50_length,
      p90_length: direction.p90_length,
      mean_length: direction.mean_length,
      max_length: direction.max_length,
    },
    magnitude: {
      total_streaks: magnitude.total_streaks,
      p50_length: magnitude.p50_length,
      p90_length: magnitude.p90_length,
      mean_length: magnitude.mean_length,
      max_length: magnitude.max_length,
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Render the portfolio direction+magnitude persistence scorecard as a single
 * consolidated table with ONE row and TWO side-by-side blocks (direction
 * axis on the left, magnitude axis on the right, each with total / p50 /
 * p90 / mean / max). The one-table-one-row shape mirrors the compact single-
 * row shape of the P11.89 and P11.91 upstream summaries; the twin-block
 * shape mirrors the P11.101 per-metric and P11.103 per-partner capstones
 * because the whole point is direct cross-axis comparison on the same row.
 *
 * The caption embeds the magnitude threshold percent so a reader sees at a
 * glance which amber band the |Δ%| block is scored against — matches P11.91
 * / P11.95 / P11.99 / P11.101 / P11.103 caption pattern on the magnitude
 * axis. The direction block has no tunable threshold (a direction streak is
 * any run of same-sign transitions) so no direction-side threshold is
 * embedded.
 *
 * In the P11.106 cron wiring this lands directly BELOW the P11.91/P11.92
 * portfolio |Δ%|-material percentile section — the capstone position at the
 * bottom of the portfolio-grain ladder so a reader who already saw direction
 * and magnitude summaries above can immediately reconcile them into a single
 * portfolio verdict without scrolling back up.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.49 / P11.79 / P11.89 / P11.91 posture) OR when BOTH
 * axes have zero streaks (the "flat portfolio" week — neither axis has
 * anything to reduce).
 */
export function formatDigestSnapshotPersistenceScorecardSection(
  scorecard: DigestSnapshotPersistenceScorecard,
): string {
  if (scorecard.window_size < 3) return "";
  if (
    scorecard.direction.total_streaks === 0 &&
    scorecard.magnitude.total_streaks === 0
  ) {
    return "";
  }

  const firstWeek = scorecard.first_week ? escapeHtml(scorecard.first_week) : "";
  const lastWeek = scorecard.last_week ? escapeHtml(scorecard.last_week) : "";
  const thresholdPct = round1(scorecard.threshold * 100).toFixed(1);

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Portfolio direction &plus; magnitude persistence scorecard across the ${scorecard.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Side-by-side scalar reduction of the P11.89 direction-axis and P11.91 magnitude-axis portfolio percentile summaries so ops can answer &ldquo;is the PORTFOLIO persistent on direction AND magnitude, or only one, or neither?&rdquo; without scrolling between the two upstream sections. A portfolio with identical direction p50/p90 to last week can differ sharply on the magnitude axis (fat direction block beside a zero magnitude block &rArr; sustained direction inside the amber band; opposite &rArr; volatile |&Delta;%| but flips direction each week). Nearest-rank method (inclusive) matches the P11.89 / P11.91 / P11.93 / P11.95 / P11.97 / P11.99 yardstick so the direction and magnitude scalars in this scorecard are directly comparable to the upstream per-grain summaries. Threshold carried alongside the magnitude block so a shift from magnitude p50=2 to p50=3 at the SAME threshold reads differently from an apparent shift caused by widening the threshold band. Mirrors the P11.101 per-metric capstone scorecard and P11.103 per-partner capstone scorecard one grain up (all three capstone scorecards land at the bottom of their respective grain&rsquo;s ladder).</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th colspan="5" style="text-align:center">Direction axis (P11.89)</th>
          <th colspan="5" style="text-align:center">Magnitude axis (P11.91)</th>
        </tr>
        <tr>
          <th>Total</th>
          <th>p50</th>
          <th>p90</th>
          <th>Mean</th>
          <th>Max</th>
          <th>Total</th>
          <th>p50</th>
          <th>p90</th>
          <th>Mean</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:right">${scorecard.direction.total_streaks}</td>
          <td style="text-align:right">${scorecard.direction.p50_length}</td>
          <td style="text-align:right">${scorecard.direction.p90_length}</td>
          <td style="text-align:right">${scorecard.direction.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${scorecard.direction.max_length}</td>
          <td style="text-align:right">${scorecard.magnitude.total_streaks}</td>
          <td style="text-align:right">${scorecard.magnitude.p50_length}</td>
          <td style="text-align:right">${scorecard.magnitude.p90_length}</td>
          <td style="text-align:right">${scorecard.magnitude.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${scorecard.magnitude.max_length}</td>
        </tr>
      </tbody>
    </table>`;
}
