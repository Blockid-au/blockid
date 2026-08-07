// Weekly digest per-reseller sustained-direction streak coverage summary (P11.59).
//
// P11.57 (tick 451) + P11.58 (tick 452) shipped the portfolio-wide
// same-direction streak coverage topline: "how many headline KPIs are on a
// same-direction streak right now, and which way are they leaning". That
// topline is folded from the P11.30 detector over the aggregated portfolio
// trend, so it cannot distinguish "one partner is systemically drifting up
// while another mirrors down" from "the whole portfolio is walking the same
// way". P11.32 (tick 426) + P11.33 (tick 427) exposed the per-(metric ×
// reseller) direction spotlight, but the mirror of P11.57 — a per-partner
// coverage topline that sits ABOVE that spotlight and answers "how many of
// EACH PARTNER's KPIs are on a same-direction streak, split up vs down" —
// is still missing.
//
// This module closes the gap. For each reseller_code appearing in
// DigestSnapshotPerResellerRollingTrend it aggregates the same trend the
// P11.32 detector consumes, reuses computeDigestSnapshotPerResellerDirectionStreaks
// (single source of truth shared with P11.32/P11.33) and reports per partner:
//   • total_metrics: how many HEADLINE_METRICS trends the partner produced
//     — the observed KPI count (mirrors P11.55's "coverage of the observed
//     KPI set" posture rather than P11.57's fixed HEADLINE_METRICS.length
//     denominator, because a partner may legitimately have zero data for
//     some KPIs and the useful question at the per-partner grain is "of the
//     metrics WE SEE for them, how many are on a streak").
//   • metrics_with_streak: how many observed metrics reach a qualifying
//     run of length ≥ min_streak_length via the P11.32 detector.
//   • metrics_up_streak / metrics_down_streak: direction breakout — unlike
//     P11.55's |pct|-magnitude coverage (signless), direction has a sign so
//     the per-partner envelope carries the up/down split. A partner with 3
//     up / 0 down is systemically climbing; 0 up / 3 down is systemically
//     sliding; 2 up / 2 down is oscillating internally — three fundamentally
//     different partner-scoped stories at identical composite coverage rate.
//   • coverage_rate_pct / up_coverage_rate_pct / down_coverage_rate_pct:
//     each numerator / total_metrics × 100 rounded to 1 decimal (null when
//     total_metrics === 0 — matches the P11.55 division-by-zero posture).
//   • min_length / max_length / median_length: distribution over the streak
//     lengths of the partner's qualifying metrics regardless of direction
//     (null when metrics_with_streak === 0 — matches P11.55/P11.57).
//
// Pairs cleanly with the P11.57 portfolio topline + the P11.32 per-partner
// spotlight rows: portfolio topline (P11.57) → per-partner topline
// (P11.59, this module) → per-partner spotlight detail (P11.32). A partner
// surfacing here with 3 down / 0 up on a large coverage_rate_pct is
// systemically sliding across their portfolio (retention issue, mix churn,
// pricing shock); a partner with 3 up / 0 up on a large coverage_rate_pct
// is systemically climbing (expansion, cohort maturity, campaign lift); a
// partner with 2 up / 2 down is churning internally and the aggregate is
// hiding it.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 / P11.53→P11.54 / P11.55→P11.56 /
// P11.57→P11.58 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.60) so this shape can be exercised in isolation
// before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly — mirrors
//     P11.55 so the per-reseller coverage table cannot diverge from the
//     trend table it summarises or the per-reseller spotlight table it
//     sits beside.
//   • Reuses computeDigestSnapshotPerResellerDirectionStreaks — mirrors
//     the P11.55 delegation posture — so a metric surfacing here is exactly
//     one the P11.32 spotlight would render below (no drift risk between
//     the topline and the detail).
//   • total_metrics is the OBSERVED per-partner count (rows the partner
//     produced in the trend regardless of computability), NOT
//     HEADLINE_METRICS.length. A fixed-denominator per-partner posture would
//     make coverage_rate_pct dominated by "did this partner produce any data
//     for that metric this window" instead of "did the data they produced
//     stream a streak" — the wrong axis for the question this table answers.
//   • Rows are emitted in reseller_code alphabetical order so ops reads the
//     same partner ladder every Monday — mirrors P11.55's "same ladder every
//     week" posture rather than sorting by coverage_rate_pct which would
//     reshuffle the table week to week.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition — matches P11.57 suppress-below-3
//     posture) OR when the coverage rows list is empty (no partner data at
//     all) OR when zero partners have any qualifying streak (nothing to
//     summarise — matches P11.57's quiet-when-flat posture even at the
//     per-partner drill-down level).

import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
} from "./digest-snapshot-per-reseller-direction-streaks";

export interface PerResellerDirectionStreakCoverageRow {
  readonly reseller_code: string;
  readonly total_metrics: number;
  readonly metrics_with_streak: number;
  readonly metrics_up_streak: number;
  readonly metrics_down_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly up_coverage_rate_pct: number | null;
  readonly down_coverage_rate_pct: number | null;
  readonly min_length: number | null;
  readonly max_length: number | null;
  readonly median_length: number | null;
}

export interface DigestSnapshotPerResellerDirectionStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly rows: readonly PerResellerDirectionStreakCoverageRow[];
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

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-partner
 * sustained-direction streak coverage summary. Reuses
 * computeDigestSnapshotPerResellerDirectionStreaks so the per-partner
 * coverage numbers cannot diverge from the P11.32 spotlight rows they
 * summarise.
 *
 * total_metrics per partner is the OBSERVED KPI count (trend rows the
 * partner produced, regardless of computability) so coverage reads as "of
 * the metrics we see for this partner, how many are on a same-direction
 * streak" rather than a fixed-denominator posture that would conflate
 * "partner had no data" with "partner's data was flat".
 *
 * minStreakLength is forwarded to the per-reseller streak detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH;
 * fractional → floor).
 */
export function computeDigestSnapshotPerResellerDirectionStreakCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotPerResellerDirectionStreakCoverage {
  const streaks = computeDigestSnapshotPerResellerDirectionStreaks(
    trend,
    minStreakLength,
  );

  const source = Array.isArray(trend?.rows) ? trend.rows : [];

  const totalByCode = new Map<string, number>();
  for (const r of source) {
    if (typeof r?.reseller_code !== "string") continue;
    totalByCode.set(
      r.reseller_code,
      (totalByCode.get(r.reseller_code) ?? 0) + 1,
    );
  }

  interface PerPartnerAgg {
    readonly lengths: number[];
    up: number;
    down: number;
  }
  const aggByCode = new Map<string, PerPartnerAgg>();
  for (const row of streaks.rows) {
    let agg = aggByCode.get(row.reseller_code);
    if (!agg) {
      agg = { lengths: [], up: 0, down: 0 };
      aggByCode.set(row.reseller_code, agg);
    }
    agg.lengths.push(row.length);
    if (row.direction === "up") agg.up += 1;
    else agg.down += 1;
  }

  // Union the two code sets so a partner that appears only in streaks (never
  // in the trend row list) is not silently dropped. In practice the P11.32
  // detector only emits rows sourced from trend.rows, so this is a defensive
  // invariant rather than a practical concern.
  const codes = new Set<string>([
    ...totalByCode.keys(),
    ...aggByCode.keys(),
  ]);
  const ordered = [...codes].sort((a, b) => a.localeCompare(b));

  const rows: PerResellerDirectionStreakCoverageRow[] = ordered.map((code) => {
    const total = totalByCode.get(code) ?? 0;
    const agg = aggByCode.get(code);
    const lengths = (agg?.lengths ?? []).slice().sort((a, b) => a - b);
    const withStreak = lengths.length;
    const upStreak = agg?.up ?? 0;
    const downStreak = agg?.down ?? 0;
    return {
      reseller_code: code,
      total_metrics: total,
      metrics_with_streak: withStreak,
      metrics_up_streak: upStreak,
      metrics_down_streak: downStreak,
      coverage_rate_pct: rate(withStreak, total),
      up_coverage_rate_pct: rate(upStreak, total),
      down_coverage_rate_pct: rate(downStreak, total),
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

function formatRateCell(r: number | null): string {
  if (r === null) return "&mdash;";
  return `${r.toFixed(1)}%`;
}

/**
 * Render a per-reseller sustained-direction streak coverage HTML section. In
 * the P11.60 cron wiring this lands directly above the P11.32/P11.33
 * per-partner spotlight so ops reads the partner topline (which partners
 * have how many KPIs on a streak, split up vs down) before scanning the
 * per-(metric × partner) detail rows.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.57 posture), when zero partners appear, OR when zero
 * partners have any qualifying streak (nothing to summarise).
 */
export function formatDigestSnapshotPerResellerDirectionStreakCoverageSection(
  coverage: DigestSnapshotPerResellerDirectionStreakCoverage,
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
        <td style="text-align:right">${r.metrics_up_streak}</td>
        <td style="text-align:right">${r.metrics_down_streak}</td>
        <td style="text-align:right">${formatRateCell(r.coverage_rate_pct)}</td>
        <td style="text-align:right">${formatRateCell(r.up_coverage_rate_pct)}</td>
        <td style="text-align:right">${formatRateCell(r.down_coverage_rate_pct)}</td>
        <td style="text-align:right">${formatCountCell(r.min_length)}</td>
        <td style="text-align:right">${formatCountCell(r.median_length)}</td>
        <td style="text-align:right">${formatCountCell(r.max_length)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-reseller sustained-direction streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner topline for the sustained-direction spotlight below. Total counts every headline-metric trend the partner produced this window; With streak counts trends whose portfolio-scoped total moved the same way for ${coverage.min_streak_length}+ consecutive point-to-point transitions. The up/down split separates systemic partner climbs from systemic partner slides at the same composite coverage rate; a partner with high coverage and lopsided direction is drifting one way across their whole book, and a partner with balanced up/down is oscillating internally in a way the aggregated total would hide.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Total metrics</th>
          <th>With streak</th>
          <th>&uarr; Up</th>
          <th>&darr; Down</th>
          <th>Coverage rate</th>
          <th>Up rate</th>
          <th>Down rate</th>
          <th>Min length</th>
          <th>Median length</th>
          <th>Max length</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
