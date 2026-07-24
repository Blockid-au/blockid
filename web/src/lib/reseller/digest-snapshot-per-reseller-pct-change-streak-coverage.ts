// Weekly digest per-reseller sustained-|pct|-material streak coverage summary (P11.55).
//
// P11.53 (tick 447) + P11.54 (tick 448) shipped the portfolio-wide streak
// coverage summary that answers "how many headline KPIs are on a sustained
// |pct|-material streak right now, and what does the length distribution look
// like across those metrics?". That table pivots on HEADLINE_METRICS and
// captures the topline for the P11.49/P11.50 spotlight. It cannot answer the
// mirror question "how many of EACH PARTNER's KPIs are on a streak" — a
// partner running length-3 streaks on every metric reads identically to a
// partner running one length-3 streak on a single metric when the summary is
// aggregated portfolio-wide.
//
// This module lands the per-reseller companion. For each reseller_code that
// appears in the trend it aggregates the same
// DigestSnapshotPerResellerRollingTrend, reuses
// computeDigestSnapshotPerResellerPctChangeStreaks (single source of truth
// shared with P11.51/P11.52) and reports:
//   • total_metrics: how many HEADLINE_METRICS the partner produced a trend
//     for — observed KPI presence per partner (mirrors P11.46's "coverage of
//     the observed KPI set" posture rather than P11.53's HEADLINE_METRICS.length
//     fixed denominator, because a partner may legitimately have zero data on
//     some KPIs and the interesting question is "of the metrics WE SEE, how
//     many are on a streak");
//   • metrics_with_streak: how many of the partner's observed metrics reach a
//     qualifying run of length ≥ min_streak_length via the P11.51 detector;
//   • coverage_rate_pct: metrics_with_streak / total_metrics × 100 rounded to
//     1 decimal (null when total_metrics === 0 — same null-on-zero-denominator
//     posture as computePctChange / P11.46);
//   • min_length, max_length, median_length: distribution over the streak
//     lengths of the partner's qualifying metrics (null when
//     metrics_with_streak === 0).
//
// Pairs cleanly with the P11.53 portfolio topline + the P11.51 per-partner
// spotlight rows: portfolio topline (P11.53) → per-partner topline (P11.55) →
// per-partner spotlight detail (P11.51). A partner surfacing here with high
// coverage_rate_pct and a spread min/max_length is running broad multi-KPI
// volatility (systemic partner-scoped pressure — retention issue, mix
// churn, pricing shock); a partner with low coverage_rate_pct and a large
// max_length has one KPI monopolising their volatility (idiosyncratic outlier
// — a specific line requiring targeted follow-up).
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 / P11.53→P11.54 pattern. Cron-route wiring
// intentionally deferred to a follow-up tick (P11.56) so this shape can be
// exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly — mirrors
//     P11.46 / P11.51 so the per-reseller streak coverage table cannot diverge
//     from the trend table it summarises or from the per-reseller spotlight
//     table it sits beside.
//   • Reuses computeDigestSnapshotPerResellerPctChangeStreaks — mirrors the
//     P11.53 delegation posture — so a metric surfacing here is exactly one
//     the P11.51 spotlight would render below (no drift risk between the
//     topline and the detail).
//   • total_metrics is the OBSERVED per-partner count (rows the partner
//     produced in the trend regardless of computability), NOT
//     HEADLINE_METRICS.length. A fixed-denominator per-partner posture would
//     make coverage_rate_pct dominated by "did this partner produce any data
//     for that metric this window" instead of "did the data they produced
//     stream a streak" — the wrong axis for the question this table answers.
//   • Rows are emitted in reseller_code alphabetical order so ops reads the
//     same partner ladder every Monday — mirrors P11.46 's "same ladder every
//     week" posture rather than sorting by coverage_rate_pct which would
//     reshuffle the table week to week.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition — matches P11.53 suppress-below-3
//     posture) OR when the coverage rows list is empty (no partner data at
//     all) OR when zero partners have any qualifying streak (nothing to
//     summarise — matches P11.53's quiet-when-flat posture even at the
//     per-partner drill-down level).

import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
} from "./digest-snapshot-per-reseller-pct-change-streaks";

export interface PerResellerPctChangeStreakCoverageRow {
  readonly reseller_code: string;
  readonly total_metrics: number;
  readonly metrics_with_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly min_length: number | null;
  readonly max_length: number | null;
  readonly median_length: number | null;
}

export interface DigestSnapshotPerResellerPctChangeStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerPctChangeStreakCoverageRow[];
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

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-partner streak
 * coverage summary. Reuses computeDigestSnapshotPerResellerPctChangeStreaks so
 * the per-partner coverage numbers cannot diverge from the P11.51 spotlight
 * rows they summarise.
 *
 * total_metrics per partner is the OBSERVED KPI count (trend rows the partner
 * produced, regardless of computability), so coverage reads as "of the
 * metrics we see for this partner, how many are on a streak" rather than a
 * fixed-denominator posture that would conflate "partner had no data" with
 * "partner's data was flat".
 *
 * minStreakLength / threshold are forwarded to the per-reseller streak
 * detector; the detector handles its own coercion (< 1 →
 * DEFAULT_MIN_STREAK_LENGTH; non-positive threshold →
 * PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerResellerPctChangeStreakCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerPctChangeStreakCoverage {
  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const totalByCode = new Map<string, number>();
  for (const r of source) {
    if (typeof r?.reseller_code !== "string") continue;
    totalByCode.set(r.reseller_code, (totalByCode.get(r.reseller_code) ?? 0) + 1);
  }

  const streakLengthsByCode = new Map<string, number[]>();
  for (const row of streaks.rows) {
    let arr = streakLengthsByCode.get(row.reseller_code);
    if (!arr) {
      arr = [];
      streakLengthsByCode.set(row.reseller_code, arr);
    }
    arr.push(row.length);
  }

  // A partner may appear in streaks even if their total_metrics count was
  // (defensively) zero — never happens in practice because the P11.51 detector
  // only emits rows sourced from trend.rows, but the invariant is worth
  // stating: union the code sets so we do not silently drop a partner.
  const codes = new Set<string>([
    ...totalByCode.keys(),
    ...streakLengthsByCode.keys(),
  ]);
  const ordered = [...codes].sort((a, b) => a.localeCompare(b));

  const rows: PerResellerPctChangeStreakCoverageRow[] = ordered.map((code) => {
    const total = totalByCode.get(code) ?? 0;
    const lengths = (streakLengthsByCode.get(code) ?? [])
      .slice()
      .sort((a, b) => a - b);
    const withStreak = lengths.length;
    const coverageRate =
      total === 0 ? null : Math.round((withStreak / total) * 1000) / 10;
    return {
      reseller_code: code,
      total_metrics: total,
      metrics_with_streak: withStreak,
      coverage_rate_pct: coverageRate,
      min_length: withStreak === 0 ? null : lengths[0],
      max_length: withStreak === 0 ? null : lengths[lengths.length - 1],
      median_length: median(lengths),
    };
  });

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    threshold: streaks.threshold,
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

function formatCountCell(n: number | null): string {
  if (n === null) return "&mdash;";
  return String(n);
}

function formatRateCell(rate: number | null): string {
  if (rate === null) return "&mdash;";
  return `${rate.toFixed(1)}%`;
}

/**
 * Render a per-reseller streak coverage HTML section. In the P11.56 cron
 * wiring this lands directly above the P11.51/P11.52 per-partner spotlight so
 * ops reads the partner topline (which partners have how many KPIs on a
 * streak) before scanning the per-(metric × partner) detail rows.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.53 posture), when zero partners appear, OR when zero
 * partners have any qualifying streak (nothing to summarise).
 */
export function formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(
  coverage: DigestSnapshotPerResellerPctChangeStreakCoverage,
): string {
  if (coverage.window_size < 3) return "";
  if (coverage.rows.length === 0) return "";
  const totalStreaks = coverage.rows.reduce(
    (acc, r) => acc + r.metrics_with_streak,
    0,
  );
  if (totalStreaks === 0) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const body = coverage.rows
    .map((r) => {
      const rowStyle =
        r.metrics_with_streak > 0 ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${r.total_metrics}</td>
        <td style="text-align:right">${r.metrics_with_streak}</td>
        <td style="text-align:right">${formatRateCell(r.coverage_rate_pct)}</td>
        <td style="text-align:right">${formatCountCell(r.min_length)}</td>
        <td style="text-align:right">${formatCountCell(r.median_length)}</td>
        <td style="text-align:right">${formatCountCell(r.max_length)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-reseller |pct|-material streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner topline for the sustained-volatility spotlight below. Total counts every headline-metric trend the partner produced this window; With streak counts trends whose |pct_change| stayed at or above ${coverage.threshold}% for ${coverage.min_streak_length}+ consecutive point-to-point transitions. Coverage rate = With streak / Total &times; 100. A partner with high coverage rate and a spread min/max length is running broad multi-KPI volatility; a partner with low coverage rate and a large max length has one KPI monopolising the volatility signal.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Total metrics</th>
          <th>With streak</th>
          <th>Coverage rate</th>
          <th>Min length</th>
          <th>Median length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
