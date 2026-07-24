// Weekly digest per-metric sustained-direction streak coverage summary (P11.61).
//
// The direction-streak family already carries three surfaces that answer the
// "which metrics/partners are on a same-direction streak" question at
// different grains:
//   • P11.30 → portfolio spotlight (per metric): "which KPIs moved the same
//     way portfolio-wide for 3+ weeks running".
//   • P11.32 → per-(metric × reseller) spotlight: "which (metric × partner)
//     pairs are on a streak".
//   • P11.57 → portfolio coverage topline: "how many of the headline KPIs
//     are on a streak right now, up/down split".
//   • P11.59 → per-reseller coverage topline: "how many of THIS PARTNER's
//     KPIs are on a streak, up/down split".
//
// What no surface answers yet is the METRIC-anchored coverage angle: "for
// KPI X, how many of the observed partners are on a same-direction streak
// this window, up vs down". A KPI with 5/5 partners on a downward streak is
// under systemic portfolio-wide pressure that would justify a product /
// pricing / retention response; a KPI with 3 up / 2 down is idiosyncratic
// noise; a KPI with 0/5 is quiet. The composite portfolio coverage in
// P11.57 collapses all three into "streak on / streak off" — losing the
// per-KPI concentration signal.
//
// This module lands the missing per-metric coverage table. For each
// HEADLINE_METRICS entry it counts the distinct partners producing a trend
// in the window (denominator: observed partners for that metric, matching
// the P11.59 "observed count" posture) and the distinct partners the P11.32
// detector emits a qualifying streak for (numerator), plus the up/down
// direction split. Every metric row surfaces even at zero coverage so ops
// reads the same KPI ladder every Monday — mirrors the P11.30/P11.31 style
// where the headline row list is stable week over week.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 / P11.53→P11.54 / P11.55→P11.56 /
// P11.57→P11.58 / P11.59→P11.60 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.62) so this shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerDirectionStreaks so the per-metric
//     coverage numbers cannot diverge from the P11.32 spotlight rows they
//     summarise (a metric surfacing here is exactly one the P11.32 formatter
//     would render below).
//   • Because the underlying detector emits at most one row per (metric ×
//     reseller_code) — the longest run wins — partners_up_streak +
//     partners_down_streak === partners_with_streak by construction. The
//     up/down split is therefore a pure partition, not an overlap-permitting
//     tally.
//   • total_partners per metric is the OBSERVED distinct-partner count in
//     the trend (metric rows the partner produced, regardless of
//     computability). A partner appearing in the trend with only null points
//     still counts as observed — that matches the "of the partners WE SEE
//     for this KPI" posture, not "of every possible partner in the segment".
//   • Rows are emitted in HEADLINE_METRICS declared order so the KPI ladder
//     is stable across weeks — matches P11.30's canonical-order posture
//     rather than sorting by coverage_rate_pct which would reshuffle the
//     table. Every KPI section from HEADLINE_METRICS surfaces even when
//     total_partners === 0 (visible-flat posture matching P11.59's "keep
//     the row in the ladder" behaviour for zero-coverage partners).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot
//     host a length-2 streak by definition — matches P11.57/P11.59 posture)
//     OR when zero KPIs have any observed partners (empty trend) OR when
//     zero KPIs have any qualifying streak (nothing to summarise —
//     quiet-when-flat matching P11.57/P11.59).

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
} from "./digest-snapshot-per-reseller-direction-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export interface PerMetricDirectionStreakCoverageRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly total_partners: number;
  readonly partners_with_streak: number;
  readonly partners_up_streak: number;
  readonly partners_down_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly up_coverage_rate_pct: number | null;
  readonly down_coverage_rate_pct: number | null;
  readonly min_length: number | null;
  readonly max_length: number | null;
  readonly median_length: number | null;
}

export interface DigestSnapshotPerMetricDirectionStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly rows: readonly PerMetricDirectionStreakCoverageRow[];
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
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-metric
 * sustained-direction streak coverage summary. Reuses
 * computeDigestSnapshotPerResellerDirectionStreaks so the per-metric
 * coverage numbers cannot diverge from the P11.32 spotlight rows they
 * summarise.
 *
 * total_partners per metric is the OBSERVED distinct-partner count (trend
 * rows the partner produced for that metric, regardless of computability)
 * so coverage reads as "of the partners we see on this KPI, how many are
 * on a same-direction streak" rather than a fixed-denominator posture that
 * would conflate "no partner produced data on this KPI" with "every
 * partner's data was flat".
 *
 * Rows are emitted in HEADLINE_METRICS declared order so the KPI ladder is
 * stable week over week; every canonical KPI appears even when
 * total_partners === 0 so ops reads a consistent table shape.
 *
 * minStreakLength is forwarded to the per-reseller streak detector; the
 * detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH;
 * fractional → floor).
 */
export function computeDigestSnapshotPerMetricDirectionStreakCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotPerMetricDirectionStreakCoverage {
  const streaks = computeDigestSnapshotPerResellerDirectionStreaks(
    trend,
    minStreakLength,
  );

  const source = Array.isArray(trend?.rows) ? trend.rows : [];

  // Distinct partner set per metric — the observed denominator.
  const partnersByMetric = new Map<KnownKpiSection, Set<string>>();
  for (const r of source) {
    if (typeof r?.reseller_code !== "string") continue;
    let set = partnersByMetric.get(r.key);
    if (!set) {
      set = new Set<string>();
      partnersByMetric.set(r.key, set);
    }
    set.add(r.reseller_code);
  }

  interface PerMetricAgg {
    readonly lengths: number[];
    up: number;
    down: number;
  }
  const aggByMetric = new Map<KnownKpiSection, PerMetricAgg>();
  for (const row of streaks.rows) {
    let agg = aggByMetric.get(row.key);
    if (!agg) {
      agg = { lengths: [], up: 0, down: 0 };
      aggByMetric.set(row.key, agg);
    }
    agg.lengths.push(row.length);
    if (row.direction === "up") agg.up += 1;
    else agg.down += 1;
  }

  const rows: PerMetricDirectionStreakCoverageRow[] = HEADLINE_METRICS.map(
    (spec) => {
      const total = partnersByMetric.get(spec.key)?.size ?? 0;
      const agg = aggByMetric.get(spec.key);
      const lengths = (agg?.lengths ?? []).slice().sort((a, b) => a - b);
      const withStreak = lengths.length;
      const upStreak = agg?.up ?? 0;
      const downStreak = agg?.down ?? 0;
      return {
        key: spec.key,
        metric_name: spec.metric_name,
        unit: spec.unit,
        total_partners: total,
        partners_with_streak: withStreak,
        partners_up_streak: upStreak,
        partners_down_streak: downStreak,
        coverage_rate_pct: rate(withStreak, total),
        up_coverage_rate_pct: rate(upStreak, total),
        down_coverage_rate_pct: rate(downStreak, total),
        min_length: withStreak === 0 ? null : lengths[0],
        max_length: withStreak === 0 ? null : lengths[lengths.length - 1],
        median_length: median(lengths),
      };
    },
  );

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
 * Render a per-metric sustained-direction streak coverage HTML section. In
 * the P11.62 cron wiring this lands directly above the P11.30/P11.31
 * portfolio spotlight so ops reads the metric-anchored topline (which KPIs
 * have how many partners on a streak, up vs down) before scanning the
 * per-metric detail rows and the per-(metric × partner) spotlight below.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.57 posture), when zero KPIs have any observed
 * partners, OR when zero KPIs have any qualifying streak (nothing to
 * summarise).
 */
export function formatDigestSnapshotPerMetricDirectionStreakCoverageSection(
  coverage: DigestSnapshotPerMetricDirectionStreakCoverage,
): string {
  if (coverage.window_size < 3) return "";
  const totalPartners = coverage.rows.reduce(
    (acc, r) => acc + r.total_partners,
    0,
  );
  if (totalPartners === 0) return "";
  const totalStreaks = coverage.rows.reduce(
    (acc, r) => acc + r.partners_with_streak,
    0,
  );
  if (totalStreaks === 0) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const body = coverage.rows
    .map((r) => {
      const rowStyle =
        r.partners_with_streak > 0 ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${r.total_partners}</td>
        <td style="text-align:right">${r.partners_with_streak}</td>
        <td style="text-align:right">${r.partners_up_streak}</td>
        <td style="text-align:right">${r.partners_down_streak}</td>
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric sustained-direction streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Metric-anchored topline for the sustained-direction spotlight below. Total counts distinct partners producing a trend for this KPI this window; With streak counts partners whose per-partner total moved the same way for ${coverage.min_streak_length}+ consecutive point-to-point transitions. The up/down split partitions the streaking partners (each partner surfaces on at most one side per KPI, since the detector emits the longest same-sign run) so a KPI with high coverage and lopsided direction is under systemic portfolio-wide pressure or lift on that specific measure; a KPI with balanced up/down partners is idiosyncratic noise the composite portfolio topline would hide.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Total partners</th>
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
