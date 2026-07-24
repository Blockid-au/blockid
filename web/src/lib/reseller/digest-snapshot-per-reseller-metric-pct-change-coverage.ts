// Weekly digest per-(reseller × metric) percent-change coverage summary (P11.43).
//
// P11.39 (tick 433) + P11.40 (tick 434) shipped the pooled per-(reseller ×
// metric) |pct_change| leaderboard. P11.41 (tick 435) + P11.42 (tick 436) then
// closed the metric-coverage gap by projecting the same trend down to a
// top-N-per-metric spotlight so every HEADLINE_METRICS spec key with a
// computable-pct mover surfaces at least once. Both projections answer
// "who moved" — but neither answers "how thin is the coverage" for a given
// metric: a single spotlight row hides whether that partner was the only
// computable-pct row in the bucket or was picked from a crowded field of 20
// material movers, and a metric with zero rows in the spotlight could be
// either genuinely flat or entirely uncomputable (all launch-week rows).
//
// This module lands the coverage summary. For each HEADLINE_METRICS spec key
// it aggregates the same DigestSnapshotPerResellerRollingTrend and reports:
//   • total_rows: how many (reseller_code) trends the metric produced at all;
//   • computable_rows: how many of those had a non-null first_total ≠ 0 and
//     a non-null last_total (a computable pct_change);
//   • material_rows: how many computable rows crossed the amber
//     PCT_CHANGE_MATERIAL_THRESHOLD floor (currently ≥ 25%);
//   • material_rate_pct: material_rows / computable_rows × 100 rounded to 1
//     decimal — null when computable_rows === 0 (division by zero is
//     ambiguous, same posture as computePctChange);
//   • min_pct, max_pct, median_pct: signed pct distribution over the
//     computable rows — null when computable_rows === 0.
//
// The output pairs cleanly with the P11.41/P11.42 spotlight: the spotlight
// names the biggest mover per metric, and this coverage table quantifies the
// bucket depth behind that name so ops can distinguish "one of many big
// movers" (crowded market) from "the only mover we can talk about" (thin
// signal).
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 pattern. Cron-route wiring intentionally deferred to a
// follow-up tick (P11.44) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — mirrors P11.26 / P11.32 / P11.39 / P11.41 so the
//     coverage numbers cannot diverge from the spotlight rows they summarise.
//   • pct math matches P11.37 / P11.39 / P11.41: null when first_total is
//     null OR 0, null when last_total is null, else (last - first) / |first|
//     * 100 rounded to 1 decimal. delta === null rows are treated as
//     uncomputable and counted only in total_rows (same "single-point
//     presence" filter P11.41 uses).
//   • total_rows counts every PerResellerMetricTrend row for the metric
//     regardless of computability — this is the raw presence count so
//     "computable / total" reads as coverage of the observed partner set.
//   • median_pct uses the linear-interpolation midpoint for even-count
//     buckets (a[n/2-1] + a[n/2]) / 2 rounded to 1 decimal. Deterministic
//     and matches the standard statistics convention.
//   • Rows are emitted in HEADLINE_METRICS spec order so ops reads the same
//     ladder every Monday — mirrors P11.26 / P11.41 rather than sorting by
//     material_rate_pct which would shuffle the ladder week to week.
//   • Metrics with zero total_rows are still emitted so a metric that
//     disappears from the portfolio surfaces as a red-flag row rather than
//     silently dropping off the summary. The formatter renders "—" for the
//     null pct fields on those rows.
//   • Formatter returns "" when window_size < 2 (single-point windows have
//     no computable pct_change by definition) OR when every metric has zero
//     total_rows (no trend data at all).

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export interface PerResellerMetricPctChangeCoverageRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly total_rows: number;
  readonly computable_rows: number;
  readonly material_rows: number;
  readonly material_rate_pct: number | null;
  readonly min_pct: number | null;
  readonly max_pct: number | null;
  readonly median_pct: number | null;
}

export interface DigestSnapshotPerResellerMetricPctChangeCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPctChangeCoverageRow[];
}

function computePctChange(
  first: number | null,
  last: number | null,
): number | null {
  if (first === null || last === null) return null;
  if (first === 0) return null;
  const raw = ((last - first) / Math.abs(first)) * 100;
  return Math.round(raw * 10) / 10;
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
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-metric coverage
 * summary. Emits one row per HEADLINE_METRICS spec key (in spec order) with
 * total/computable/material counts and the signed-pct distribution over the
 * computable rows. Metrics that produced zero trend rows still surface so a
 * disappeared metric is visible rather than silently absent.
 */
export function computeDigestSnapshotPerResellerMetricPctChangeCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
): DigestSnapshotPerResellerMetricPctChangeCoverage {
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const buckets = new Map<
    KnownKpiSection,
    { total: number; pcts: number[] }
  >();
  for (const spec of HEADLINE_METRICS) {
    buckets.set(spec.key, { total: 0, pcts: [] });
  }
  for (const r of source) {
    const bucket = buckets.get(r.key);
    if (!bucket) continue;
    bucket.total += 1;
    // Same filter as P11.41: null delta rows are single-point presences whose
    // first_total === last_total would surface as a false 0%.
    if (r.delta === null) continue;
    const pct = computePctChange(r.first_total, r.last_total);
    if (pct === null) continue;
    bucket.pcts.push(pct);
  }

  const rows: PerResellerMetricPctChangeCoverageRow[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = buckets.get(spec.key);
    if (!bucket) continue;
    const sorted = [...bucket.pcts].sort((a, b) => a - b);
    const computable = sorted.length;
    const material = sorted.filter(
      (p) => Math.abs(p) >= PCT_CHANGE_MATERIAL_THRESHOLD,
    ).length;
    const materialRate =
      computable === 0 ? null : Math.round((material / computable) * 1000) / 10;
    rows.push({
      key: spec.key,
      metric_name: spec.metric_name,
      unit: spec.unit,
      total_rows: bucket.total,
      computable_rows: computable,
      material_rows: material,
      material_rate_pct: materialRate,
      min_pct: computable === 0 ? null : sorted[0],
      max_pct: computable === 0 ? null : sorted[computable - 1],
      median_pct: median(sorted),
    });
  }

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    threshold: PCT_CHANGE_MATERIAL_THRESHOLD,
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

function formatPctCell(pct: number | null): string {
  if (pct === null) return "&mdash;";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatRateCell(rate: number | null): string {
  if (rate === null) return "&mdash;";
  return `${rate.toFixed(1)}%`;
}

/**
 * Render an HTML section quantifying per-metric coverage of the per-reseller
 * |pct_change| spotlight. In the P11.44 cron wiring this lands directly after
 * the per-metric spotlight (P11.41 / P11.42) so ops walks:
 * per-metric spotlight (who moved most in each metric) → per-metric coverage
 * (how thin/deep the movement was in each metric) on the same page.
 *
 * Returns "" when window_size < 2 (no computable pct_change) OR when every
 * metric produced zero trend rows (no partner data at all).
 */
export function formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(
  coverage: DigestSnapshotPerResellerMetricPctChangeCoverage,
): string {
  if (coverage.window_size < 2) return "";
  if (coverage.rows.every((r) => r.total_rows === 0)) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const body = coverage.rows
    .map((r) => {
      const material = r.material_rows > 0;
      const missing = r.total_rows === 0;
      const rowStyle = missing
        ? ' style="background:#ffebee"'
        : material
          ? ' style="background:#fff8e1"'
          : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${r.total_rows}</td>
        <td style="text-align:right">${r.computable_rows}</td>
        <td style="text-align:right">${r.material_rows}</td>
        <td style="text-align:right">${formatRateCell(r.material_rate_pct)}</td>
        <td style="text-align:right">${formatPctCell(r.min_pct)}</td>
        <td style="text-align:right">${formatPctCell(r.median_pct)}</td>
        <td style="text-align:right">${formatPctCell(r.max_pct)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-metric &Delta;% coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Bucket depth behind the per-metric spotlight (P11.41). Total counts every observed partner trend; Computable counts partners whose first-week baseline was non-zero and whose last-week total was present. Material counts computable rows whose |&Delta;%| &ge; ${coverage.threshold}%. Min / Median / Max describe the signed-pct distribution over computable rows. Rows with any material mover are highlighted amber; rows with zero total (metric disappeared from the portfolio this window) are highlighted red as a data-loss flag.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Total</th>
          <th>Computable</th>
          <th>Material</th>
          <th>Material rate</th>
          <th>Min &Delta;%</th>
          <th>Median &Delta;%</th>
          <th>Max &Delta;%</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
