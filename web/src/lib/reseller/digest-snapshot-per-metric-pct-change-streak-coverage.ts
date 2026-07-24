// Weekly digest per-metric sustained-|pct|-material streak coverage summary (P11.63).
//
// The |pct|-material streak family already carries three surfaces that answer
// the "which metrics/partners kept swinging materially week over week" question
// at different grains:
//   • P11.49 → portfolio spotlight (per metric): which KPIs stayed above the
//     amber-band portfolio-wide for 2+ consecutive point-to-point transitions.
//   • P11.51 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs kept swinging materially.
//   • P11.53 → portfolio coverage topline: how many headline KPIs are on a
//     sustained-|pct|-material streak right now (portfolio-wide fold).
//   • P11.55 → per-reseller coverage topline: how many of THIS PARTNER's KPIs
//     are on a streak.
//
// What no surface answers yet is the METRIC-anchored coverage angle on the
// |pct|-material axis: "for KPI X, how many of the observed partners are
// swinging materially this window". A KPI with 5/5 partners running length-3+
// |pct|-material streaks is under systemic portfolio-wide volatility that a
// product / pricing / retention response can target; a KPI with 1/5 has a
// single-partner idiosyncratic outlier the composite portfolio coverage in
// P11.53 hides. This is the |pct|-magnitude analogue of the P11.61 per-metric
// direction-streak coverage — same metric-anchored pivot, different axis.
//
// This module lands the missing per-metric coverage table on the |pct|-material
// axis. For each HEADLINE_METRICS entry it counts the distinct partners
// producing a trend in the window (denominator: observed partners for that
// metric, matching the P11.55 / P11.61 "observed count" posture) and the
// distinct partners the P11.51 detector emits a qualifying streak for
// (numerator). Unlike P11.61 there is no up/down split because |pct| is
// signless-material — the envelope carries a single coverage_rate_pct plus
// length distribution (min/median/max). Every metric row surfaces even at zero
// coverage so ops reads the same KPI ladder every Monday — mirrors the
// P11.61 / P11.53 / P11.49 stable-ladder posture.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 / P11.53→P11.54 / P11.55→P11.56 /
// P11.57→P11.58 / P11.59→P11.60 / P11.61→P11.62 pattern. Cron-route wiring
// intentionally deferred to a follow-up tick (P11.64) so this shape can be
// exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerPctChangeStreaks so the per-metric
//     coverage numbers cannot diverge from the P11.51 spotlight rows they
//     summarise (a metric surfacing here is exactly one the P11.51 formatter
//     would render below).
//   • total_partners per metric is the OBSERVED distinct-partner count in the
//     trend (metric rows the partner produced regardless of computability).
//     Matches P11.61's per-metric observed-denominator posture: the question at
//     the metric grain is "of partners we see on this KPI, how many are
//     swinging" — a fixed-partner-cardinality denominator would conflate
//     "partner had no data on this KPI" with "partner's data on this KPI was
//     flat", losing the concentration signal.
//   • No up/down split — |pct| is signless-material by construction, so unlike
//     P11.61 (direction) the envelope carries a single coverage rate. The
//     threshold constant travels in the envelope so JSONL consumers can
//     distinguish a default from an override without re-inferring.
//   • Rows are emitted in HEADLINE_METRICS declared order so the KPI ladder is
//     stable across weeks — matches P11.61 / P11.49 / P11.53 canonical-order
//     posture rather than sorting by coverage_rate_pct which would reshuffle
//     the table. Every KPI section from HEADLINE_METRICS surfaces even when
//     total_partners === 0 (visible-flat posture matching P11.61 / P11.55).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak by definition — matches P11.53 / P11.55 / P11.61
//     posture) OR when zero KPIs have any observed partners (empty trend) OR
//     when zero KPIs have any qualifying streak (nothing to summarise —
//     quiet-when-flat).

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
} from "./digest-snapshot-per-reseller-pct-change-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export interface PerMetricPctChangeStreakCoverageRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly total_partners: number;
  readonly partners_with_streak: number;
  readonly coverage_rate_pct: number | null;
  readonly min_length: number | null;
  readonly max_length: number | null;
  readonly median_length: number | null;
}

export interface DigestSnapshotPerMetricPctChangeStreakCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PerMetricPctChangeStreakCoverageRow[];
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
 * sustained-|pct|-material streak coverage summary. Reuses
 * computeDigestSnapshotPerResellerPctChangeStreaks so the per-metric coverage
 * numbers cannot diverge from the P11.51 spotlight rows they summarise.
 *
 * total_partners per metric is the OBSERVED distinct-partner count (trend rows
 * the partner produced for that metric, regardless of computability) so
 * coverage reads as "of the partners we see on this KPI, how many are on a
 * qualifying streak" rather than a fixed-denominator posture that would
 * conflate "no partner produced data on this KPI" with "every partner's data
 * was flat".
 *
 * Rows are emitted in HEADLINE_METRICS declared order so the KPI ladder is
 * stable week over week; every canonical KPI appears even when total_partners
 * === 0 so ops reads a consistent table shape.
 *
 * minStreakLength + threshold are forwarded to the per-reseller streak detector;
 * the detector handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH;
 * non-positive threshold → PCT_CHANGE_MATERIAL_THRESHOLD).
 */
export function computeDigestSnapshotPerMetricPctChangeStreakCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerMetricPctChangeStreakCoverage {
  const streaks = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
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

  const lengthsByMetric = new Map<KnownKpiSection, number[]>();
  for (const row of streaks.rows) {
    let arr = lengthsByMetric.get(row.key);
    if (!arr) {
      arr = [];
      lengthsByMetric.set(row.key, arr);
    }
    arr.push(row.length);
  }

  const rows: PerMetricPctChangeStreakCoverageRow[] = HEADLINE_METRICS.map(
    (spec) => {
      const total = partnersByMetric.get(spec.key)?.size ?? 0;
      const lengths = (lengthsByMetric.get(spec.key) ?? [])
        .slice()
        .sort((a, b) => a - b);
      const withStreak = lengths.length;
      return {
        key: spec.key,
        metric_name: spec.metric_name,
        unit: spec.unit,
        total_partners: total,
        partners_with_streak: withStreak,
        coverage_rate_pct: rate(withStreak, total),
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

function formatRateCell(r: number | null): string {
  if (r === null) return "&mdash;";
  return `${r.toFixed(1)}%`;
}

/**
 * Render a per-metric sustained-|pct|-material streak coverage HTML section. In
 * the P11.64 cron wiring this lands directly above the P11.49/P11.50 portfolio
 * spotlight so ops reads the metric-anchored topline (which KPIs have how many
 * partners swinging materially) before scanning the per-metric detail rows and
 * the per-(metric × partner) spotlight below.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.53 posture), when zero KPIs have any observed partners,
 * OR when zero KPIs have any qualifying streak (nothing to summarise).
 */
export function formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(
  coverage: DigestSnapshotPerMetricPctChangeStreakCoverage,
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
        <td style="text-align:right">${formatRateCell(r.coverage_rate_pct)}</td>
        <td style="text-align:right">${formatCountCell(r.min_length)}</td>
        <td style="text-align:right">${formatCountCell(r.median_length)}</td>
        <td style="text-align:right">${formatCountCell(r.max_length)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric |pct|-material streak coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Metric-anchored topline for the sustained-volatility spotlight below. Total counts distinct partners producing a trend for this KPI this window; With streak counts partners whose |pct_change| stayed at or above ${coverage.threshold}% for ${coverage.min_streak_length}+ consecutive point-to-point transitions. Coverage rate = With streak / Total &times; 100. A KPI with high coverage rate is under portfolio-wide volatility on that specific measure (systemic pressure a product / pricing / retention response can target); a KPI with a single streaking partner is an idiosyncratic outlier the composite portfolio topline would hide.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Total partners</th>
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
