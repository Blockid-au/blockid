// Weekly digest per-reseller percent-change coverage summary (P11.45).
//
// P11.43 (tick 437) + P11.44 (tick 438) shipped the per-metric coverage
// summary that quantifies bucket depth behind the per-metric |pct_change|
// spotlight (P11.41). That table pivots on HEADLINE_METRICS and answers
// "how thin/deep was the movement in EACH METRIC across the partner set".
// It cannot answer the mirror question "how thin/deep was EACH PARTNER's
// movement across the metric set" — a partner who touched every metric with
// small moves reads identically to one who touched only one metric with a
// large move when the summary is grouped by metric.
//
// This module lands the per-reseller companion. For each reseller_code that
// appears in the trend it aggregates the same
// DigestSnapshotPerResellerRollingTrend and reports:
//   • total_rows: how many HEADLINE_METRICS the partner produced a trend for;
//   • computable_rows: how many of those had a non-null first_total ≠ 0 and
//     a non-null last_total (a computable pct_change);
//   • material_rows: how many computable rows crossed the amber
//     PCT_CHANGE_MATERIAL_THRESHOLD floor (currently ≥ 25%);
//   • material_rate_pct: material_rows / computable_rows × 100 rounded to 1
//     decimal — null when computable_rows === 0 (same null-on-zero-denominator
//     posture as computePctChange);
//   • min_pct, max_pct, median_pct: signed pct distribution over the
//     computable rows — null when computable_rows === 0.
//
// The output pairs cleanly with the per-metric coverage (P11.43): the metric
// summary answers "which metrics are moving broadly across the partner
// portfolio", and this partner summary answers "which partners are moving
// broadly across the metric portfolio". A partner with high material_rate_pct
// and a wide (min_pct, max_pct) is running noisy across every KPI; a partner
// with low material_rate_pct and a tight distribution is running flat.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 pattern. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.46) so this shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — mirrors P11.26 / P11.32 / P11.39 / P11.41 /
//     P11.43 so the coverage numbers cannot diverge from the spotlight rows
//     they summarise.
//   • pct math matches P11.37 / P11.39 / P11.41 / P11.43: null when
//     first_total is null OR 0, null when last_total is null, else
//     (last - first) / |first| * 100 rounded to 1 decimal. delta === null
//     rows (single-point presences) are treated as uncomputable and counted
//     only in total_rows.
//   • total_rows counts every trend row for the partner regardless of
//     computability — raw metric presence so "computable / total" reads as
//     coverage of the observed KPI set.
//   • median_pct uses the linear-interpolation midpoint for even-count
//     buckets: (a[n/2-1] + a[n/2]) / 2 rounded to 1 decimal. Deterministic
//     across V8 versions via a defensive-copy sort.
//   • Rows are emitted in reseller_code alphabetical order so ops reads the
//     same partner ladder every Monday — mirrors P11.43's "same ladder every
//     week" posture rather than sorting by material_rate_pct which would
//     reshuffle the table week to week. A partner that disappears from the
//     trend simply drops off (there is no HEADLINE_METRICS-style fixed set
//     of expected partners — the partner list is the observed roster).
//   • Formatter returns "" when window_size < 2 (single-point windows have
//     no computable pct_change by definition) OR when the coverage rows list
//     is empty (no partner data at all).

import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";

export interface PerResellerPctChangeCoverageRow {
  readonly reseller_code: string;
  readonly total_rows: number;
  readonly computable_rows: number;
  readonly material_rows: number;
  readonly material_rate_pct: number | null;
  readonly min_pct: number | null;
  readonly max_pct: number | null;
  readonly median_pct: number | null;
}

export interface DigestSnapshotPerResellerPctChangeCoverage {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly threshold: number;
  readonly rows: readonly PerResellerPctChangeCoverageRow[];
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
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-reseller coverage
 * summary. Emits one row per observed reseller_code (in alphabetical order)
 * with total/computable/material counts and the signed-pct distribution over
 * the computable rows. Partners that produced zero computable pct still
 * surface (with min/median/max = null + material_rate_pct = null) so a
 * partner running entirely on launch-week / single-point rows is visible
 * rather than silently dropped.
 */
export function computeDigestSnapshotPerResellerPctChangeCoverage(
  trend: DigestSnapshotPerResellerRollingTrend,
): DigestSnapshotPerResellerPctChangeCoverage {
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const buckets = new Map<string, { total: number; pcts: number[] }>();
  for (const r of source) {
    if (typeof r?.reseller_code !== "string") continue;
    let bucket = buckets.get(r.reseller_code);
    if (!bucket) {
      bucket = { total: 0, pcts: [] };
      buckets.set(r.reseller_code, bucket);
    }
    bucket.total += 1;
    // Same filter as P11.41 / P11.43: null delta rows are single-point
    // presences whose first_total === last_total would surface as a false 0%.
    if (r.delta === null) continue;
    const pct = computePctChange(r.first_total, r.last_total);
    if (pct === null) continue;
    bucket.pcts.push(pct);
  }

  const codes = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  const rows: PerResellerPctChangeCoverageRow[] = codes.map((code) => {
    const bucket = buckets.get(code)!;
    const sorted = [...bucket.pcts].sort((a, b) => a - b);
    const computable = sorted.length;
    const material = sorted.filter(
      (p) => Math.abs(p) >= PCT_CHANGE_MATERIAL_THRESHOLD,
    ).length;
    const materialRate =
      computable === 0 ? null : Math.round((material / computable) * 1000) / 10;
    return {
      reseller_code: code,
      total_rows: bucket.total,
      computable_rows: computable,
      material_rows: material,
      material_rate_pct: materialRate,
      min_pct: computable === 0 ? null : sorted[0],
      max_pct: computable === 0 ? null : sorted[computable - 1],
      median_pct: median(sorted),
    };
  });

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
 * Render an HTML section quantifying per-reseller coverage of the pct-change
 * spotlights. In the P11.46 cron wiring this lands directly after the
 * per-metric coverage (P11.43 / P11.44) so ops walks:
 * per-metric coverage (which METRICS moved broadly across the partner set) →
 * per-reseller coverage (which PARTNERS moved broadly across the metric set)
 * on the same page.
 *
 * Returns "" when window_size < 2 (no computable pct_change by definition)
 * OR when the coverage rows list is empty (no partner data at all).
 */
export function formatDigestSnapshotPerResellerPctChangeCoverageSection(
  coverage: DigestSnapshotPerResellerPctChangeCoverage,
): string {
  if (coverage.window_size < 2) return "";
  if (coverage.rows.length === 0) return "";

  const firstWeek = coverage.first_week ? escapeHtml(coverage.first_week) : "";
  const lastWeek = coverage.last_week ? escapeHtml(coverage.last_week) : "";

  const body = coverage.rows
    .map((r) => {
      const material = r.material_rows > 0;
      const missing = r.computable_rows === 0;
      const rowStyle = missing
        ? ' style="background:#ffebee"'
        : material
          ? ' style="background:#fff8e1"'
          : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.reseller_code)}</td>
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
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-reseller &Delta;% coverage across the ${coverage.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Bucket depth behind the per-metric spotlight (P11.41) pivoted per partner. Total counts every headline-metric trend the partner produced; Computable counts trends whose first-week baseline was non-zero and whose last-week total was present. Material counts computable rows whose |&Delta;%| &ge; ${coverage.threshold}%. Min / Median / Max describe the signed-pct distribution over computable rows. Rows with any material mover are highlighted amber; rows where zero trends are computable (partner ran entirely on launch-week or single-point presences) are highlighted red as a data-thinness flag.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
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
