// Weekly digest per-partner direction+magnitude persistence scorecard (P11.103).
//
// The streak length percentile family already covers both axes (direction and
// |pct|-material magnitude) at every grain (portfolio, per-partner, per-
// metric):
//   • P11.89 / P11.90   → portfolio direction scalar reduction
//   • P11.91 / P11.92   → portfolio magnitude scalar reduction
//   • P11.93 / P11.94   → per-partner direction scalar reduction
//   • P11.95 / P11.96   → per-partner magnitude scalar reduction
//   • P11.97 / P11.98   → per-metric direction scalar reduction
//   • P11.99 / P11.100  → per-metric magnitude scalar reduction
//
// The per-metric capstone (P11.101 / P11.102) landed the direction+magnitude
// scorecard at the per-KPI grain so ops can grep "for THIS KPI, does it churn
// direction-persistently AND magnitude-persistently, or one axis only?" out of
// a single row without cross-referencing two per-metric sections. The
// per-partner grain has the same gap: ops reading the digest sees the
// per-partner direction summary (P11.93/P11.94) and, further down, the
// per-partner magnitude summary (P11.95/P11.96), but the two sit in DIFFERENT
// tables walked by DIFFERENT source folds, so answering "which PARTNERS are
// persistent on BOTH axes vs one axis only?" still requires cross-referencing
// two sections. Two partners with identical direction p50/p90 can differ
// sharply on the magnitude axis: one carries a fat |Δ%| tail (weeks of
// sustained direction that also happen to clear the amber band) while the
// other stays inside the band (sustained direction without material
// magnitude). Neither the direction-side nor the magnitude-side per-partner
// summary exposes that split as a single scorecard row.
//
// This module closes that gap at the per-partner grain — the natural next
// surface after P11.101/P11.102 closed it at the per-metric grain per the
// P11.102 note. Fold BOTH axes over the SAME rolling trend and emit one row
// per partner with side-by-side scalar reductions for direction (from
// P11.93's fold) and magnitude (from P11.95's fold). One consolidated table
// with one row per partner so ops can answer "does THIS PARTNER churn
// direction-persistently AND magnitude-persistently, or only one, or
// neither?" without ever scrolling between two digest sections.
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
// P11.97 → P11.98 / P11.99 → P11.100 / P11.101 → P11.102 cadence. Cron-route
// wiring intentionally deferred to a follow-up tick (P11.104) so this cross-
// axis synthesis can be exercised in isolation before touching the hot
// Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.104 cron wiring should
// splice the per-partner persistence scorecard section IMMEDIATELY BELOW the
// P11.95/P11.96 per-partner magnitude percentile section (the last per-
// partner summary in the current ladder) and ABOVE the per-(metric × partner)
// spotlight sections (P11.32/P11.51) so ops walks per-partner coverage
// (P11.55/P11.59) → per-partner top-N (P11.73/P11.75) → per-partner direction
// shape (P11.81) → per-partner direction scalar (P11.93) → per-partner
// magnitude shape (P11.83) → per-partner magnitude scalar (P11.95) →
// per-partner BOTH-AXES scorecard (THIS MODULE) → per-(metric × partner)
// spotlight. Mirrors the P11.101/P11.102 per-metric capstone placement rule
// one grain up so both capstone scorecards land at the bottom of their
// respective grain's ladder.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to BOTH computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles
//     (P11.93) and computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles
//     (P11.95). Scorecard rows cannot diverge from the two summaries they
//     side-by-side because they ARE the same folds joined by partner code.
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "ACME magnitude persistence increased at the
//     SAME 25% threshold" (real partner shape change) from "ACME magnitude
//     persistence appeared to increase because the threshold widened to 40%"
//     (apparent shift). Matches P11.91/P11.95/P11.99/P11.101 threshold-
//     passthrough posture.
//   • Group ordering: reseller_code asc (deterministic + alphabetical —
//     matches P11.55 / P11.73 / P11.81 / P11.93 / P11.95 posture; partners
//     have no canonical spec order the way HEADLINE_METRICS does for KPIs).
//   • Partners are included when EITHER axis qualifies (direction OR
//     magnitude). A partner omitted from both axes is silently skipped. When
//     one axis qualifies and the other does not, the missing-axis scalars
//     are 0 (total_streaks=0, p50/p90/mean/max=0) so ops can visually see
//     the asymmetry (fat direction column with a zero magnitude column ⇒
//     THIS partner carries sustained direction without material |Δ%|;
//     opposite ⇒ partner churns materially but flips direction each week).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.51 / P11.83 / P11.87 / P11.91 / P11.93
//     / P11.95 / P11.97 / P11.99 / P11.101 posture) OR when zero rows qualify.

import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles } from "./digest-snapshot-per-reseller-direction-streak-length-percentiles";
import { computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles } from "./digest-snapshot-per-reseller-pct-change-streak-length-percentiles";

export interface PerResellerPersistenceScorecardAxis {
  readonly total_streaks: number;
  readonly p50_length: number;
  readonly p90_length: number;
  readonly mean_length: number;
  readonly max_length: number;
}

export interface PerResellerPersistenceScorecardRow {
  readonly reseller_code: string;
  readonly direction: PerResellerPersistenceScorecardAxis;
  readonly magnitude: PerResellerPersistenceScorecardAxis;
}

export interface DigestSnapshotPerResellerPersistenceScorecard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerPersistenceScorecardRow[];
}

const EMPTY_AXIS: PerResellerPersistenceScorecardAxis = {
  total_streaks: 0,
  p50_length: 0,
  p90_length: 0,
  mean_length: 0,
  max_length: 0,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-partner persistence
 * scorecard that side-by-sides the direction and |pct|-material magnitude
 * scalar reductions. For each partner that qualifies on at least one axis,
 * emits a row with two side-by-side blocks (direction + magnitude); each
 * block carries p50 / p90 / mean / max reduced from that partner's streak
 * lengths on that axis. Delegates to P11.93 + P11.95 so scorecard rows cannot
 * diverge from those summaries.
 *
 * Group ordering: reseller_code asc. Partners omitted from BOTH axes are
 * silently skipped. When one axis qualifies and the other does not, the
 * missing-axis block is zero-filled so ops can see the asymmetry visually.
 * minStreakLength + threshold are forwarded to the respective detectors; each
 * detector handles its own coercion.
 */
export function computeDigestSnapshotPerResellerPersistenceScorecard(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPersistenceScorecard {
  const direction =
    computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(
      trend,
      minStreakLength,
    );
  const magnitude =
    computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
      trend,
      minStreakLength,
      threshold,
    );

  const directionByCode = new Map(
    direction.groups.map((g) => [g.reseller_code, g]),
  );
  const magnitudeByCode = new Map(
    magnitude.groups.map((g) => [g.reseller_code, g]),
  );

  const allCodes = new Set<string>();
  for (const g of direction.groups) allCodes.add(g.reseller_code);
  for (const g of magnitude.groups) allCodes.add(g.reseller_code);
  const sortedCodes = Array.from(allCodes).sort((a, b) => a.localeCompare(b));

  const rows: PerResellerPersistenceScorecardRow[] = [];
  for (const code of sortedCodes) {
    const dir = directionByCode.get(code);
    const mag = magnitudeByCode.get(code);
    rows.push({
      reseller_code: code,
      direction: dir
        ? {
            total_streaks: dir.total_streaks,
            p50_length: dir.p50_length,
            p90_length: dir.p90_length,
            mean_length: dir.mean_length,
            max_length: dir.max_length,
          }
        : EMPTY_AXIS,
      magnitude: mag
        ? {
            total_streaks: mag.total_streaks,
            p50_length: mag.p50_length,
            p90_length: mag.p90_length,
            mean_length: mag.mean_length,
            max_length: mag.max_length,
          }
        : EMPTY_AXIS,
    });
  }

  return {
    window_size: direction.window_size,
    first_week: direction.first_week,
    last_week: direction.last_week,
    min_streak_length: direction.min_streak_length,
    threshold: magnitude.threshold,
    rows,
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
 * Render the per-partner direction+magnitude persistence scorecard as a
 * single consolidated table with one row per qualifying partner and TWO
 * side-by-side blocks per row (direction axis on the left, magnitude axis on
 * the right, each with total / p50 / p90 / mean / max). The one-table-many-
 * rows shape mirrors P11.93 / P11.95 / P11.101; the twin-block shape is
 * unique to the capstone scorecards (P11.101 per-metric, this module per-
 * partner) because the whole point is direct cross-axis comparison per row.
 *
 * The caption embeds the magnitude threshold percent so a reader sees at a
 * glance which amber band the |Δ%| block is scored against — matches P11.91 /
 * P11.95 / P11.99 / P11.101 caption pattern on the magnitude axis. The
 * direction block has no tunable threshold (a direction streak is any run of
 * same-sign transitions) so no direction-side threshold is embedded.
 *
 * In the P11.104 cron wiring this lands directly BELOW the P11.95/P11.96
 * per-partner |Δ%|-material percentile section — the capstone position at
 * the bottom of the per-partner ladder so a reader who already saw direction
 * and magnitude summaries above can immediately reconcile them into a single
 * per-partner verdict without scrolling back up.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.51 / P11.83 / P11.91 / P11.93 / P11.95 / P11.101
 * posture) OR when zero rows qualify.
 */
export function formatDigestSnapshotPerResellerPersistenceScorecardSection(
  scorecard: DigestSnapshotPerResellerPersistenceScorecard,
): string {
  if (scorecard.window_size < 3) return "";
  if (scorecard.rows.length === 0) return "";

  const firstWeek = scorecard.first_week ? escapeHtml(scorecard.first_week) : "";
  const lastWeek = scorecard.last_week ? escapeHtml(scorecard.last_week) : "";
  const thresholdPct = round1(scorecard.threshold * 100).toFixed(1);

  const rowsHtml = scorecard.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.reseller_code)}</td>
          <td style="text-align:right">${row.direction.total_streaks}</td>
          <td style="text-align:right">${row.direction.p50_length}</td>
          <td style="text-align:right">${row.direction.p90_length}</td>
          <td style="text-align:right">${row.direction.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${row.direction.max_length}</td>
          <td style="text-align:right">${row.magnitude.total_streaks}</td>
          <td style="text-align:right">${row.magnitude.p50_length}</td>
          <td style="text-align:right">${row.magnitude.p90_length}</td>
          <td style="text-align:right">${row.magnitude.mean_length.toFixed(1)}</td>
          <td style="text-align:right">${row.magnitude.max_length}</td>
        </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-partner direction &plus; magnitude persistence scorecard across the ${scorecard.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Side-by-side scalar reduction of the P11.93 direction-axis and P11.95 magnitude-axis per-partner percentile summaries so ops can answer &ldquo;does THIS PARTNER churn direction-persistently AND magnitude-persistently, or only one, or neither?&rdquo; without scrolling between the two upstream sections. Two partners with identical direction p50/p90 can differ sharply on the magnitude axis (fat direction column beside a zero magnitude column &rArr; sustained direction inside the amber band; opposite &rArr; volatile |&Delta;%| but flips direction each week). Nearest-rank method (inclusive) matches the P11.89 / P11.91 / P11.93 / P11.95 / P11.97 / P11.99 yardstick so the direction and magnitude scalars in this scorecard are directly comparable to the upstream per-grain summaries. Threshold carried alongside the magnitude block so a shift from magnitude p50=2 to p50=3 at the SAME threshold reads differently from an apparent shift caused by widening the threshold band. Mirrors the P11.101 per-metric capstone scorecard one grain up so both capstone scorecards land at the bottom of their respective grain&rsquo;s ladder.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th rowspan="2">Partner</th>
          <th colspan="5" style="text-align:center">Direction axis (P11.93)</th>
          <th colspan="5" style="text-align:center">Magnitude axis (P11.95)</th>
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
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
