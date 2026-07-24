// Weekly digest per-(reseller × metric) percent-change delta (P11.39).
//
// P11.37 (tick 431) + P11.38 (tick 432) shipped the portfolio-wide percent-
// change delta that answers "which HEADLINE_METRIC moved most in relative
// terms week-over-week at the portfolio scale?". That projection sums across
// every partner per metric, so a small partner doubling their attributed_mrr
// (a 100% relative pop worth investigating) can be invisible when a bigger
// partner nudges the same metric by 1% (the absolute cents delta may win the
// raw ranking while the relative signal drowns in the aggregate denominator).
//
// This module lands the per-(reseller × metric) drill-down so ops can see the
// biggest relative movers even when the portfolio aggregate hides them. Uses
// the same DigestSnapshotPerResellerRollingTrend feeder P11.28 / P11.32
// consume so per-reseller rankings cannot drift on how first_total /
// last_total are folded — single source of truth for per-partner totals.
//
// Pure-lib-first per the P11.14→P11.15 / P11.22→P11.23 / P11.24→P11.25 /
// P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 / P11.32→P11.33 /
// P11.34→P11.35 / P11.37→P11.38 pattern; cron-route wiring intentionally
// deferred to the follow-up tick (P11.40) so this shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • pct_change math matches P11.37: null when first_total is null OR 0,
//     null when last_total is null, else (last - first) / |first| * 100
//     rounded to 1 decimal. Signed_cents metrics that flip sign yield a
//     percent whose sign tracks the delta direction with magnitude relative
//     to |first|. Consumers see the gap rather than a misleading Infinity/NaN.
//   • Threshold + amber highlight both reuse P11.37's
//     PCT_CHANGE_MATERIAL_THRESHOLD so the two sections' "material" band is
//     one constant — an ops workflow triaging portfolio vs. per-partner
//     movers reads the same 25% floor on both tables.
//   • Sort by |pct_change| desc primary, reseller_code asc secondary,
//     HEADLINE_METRICS spec order tertiary — biggest relative movers land
//     first regardless of partner code or metric identity. Deterministic on
//     ties (reseller alphabetical, then canonical KPI ladder).
//   • Rows whose pct_change is null are excluded — a partner with a
//     launch-week metric contributes zero rows to the output (no forced empty
//     spotlight) so the digest stays quiet when nothing has a computable
//     percent shift.
//   • DEFAULT_TOP_N = 5 — enough to surface the interesting movers without
//     spamming a 100-row table on a busy week; callers can widen if they
//     want more depth.
//   • Formatter returns "" when window_size < 2, when rows is empty, OR when
//     no filtered row makes the top-N cut — quiet-when-flat posture matching
//     P11.28 / P11.37.

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

export const DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE = 5;

export interface PerResellerMetricPctChangeRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly first_total: number;
  readonly last_total: number;
  readonly pct_change: number;
}

export interface DigestSnapshotPerResellerMetricPctChange {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPctChangeRow[];
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

/**
 * Project a DigestSnapshotPerResellerRollingTrend down to the top-N |pct|
 * movers across every (reseller × metric) pair. Guarantees that a fledgling
 * partner doubling a metric at low scale is visible even when the portfolio
 * aggregate percent change (P11.37) is dominated by a bigger partner's
 * absolute-cents move.
 *
 * Sort: |pct_change| desc primary (biggest relative movers first),
 * reseller_code asc secondary, HEADLINE_METRICS spec order tertiary.
 * Deterministic on ties.
 *
 * topN < 1 coerces to DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE.
 * topN larger than the filtered row count simply emits every ranked row
 * (no padding).
 */
export function computeDigestSnapshotPerResellerMetricPctChange(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE,
): DigestSnapshotPerResellerMetricPctChange {
  const n =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const specOrder = new Map<KnownKpiSection, number>();
  HEADLINE_METRICS.forEach((spec, i) => specOrder.set(spec.key, i));

  const ranked: PerResellerMetricPctChangeRow[] = [];
  for (const r of source) {
    // Skip rows where the trend delta is null — fewer than two non-null
    // snapshot points means first_total === last_total (the same single
    // observed value) which would surface as a misleading 0% row. Mirrors
    // the P11.28 posture on null-delta rows.
    if (r.delta === null) continue;
    const pct = computePctChange(r.first_total, r.last_total);
    if (pct === null) continue;
    ranked.push({
      reseller_code: r.reseller_code,
      key: r.key,
      metric_name: r.metric_name,
      unit: r.unit,
      first_total: r.first_total as number,
      last_total: r.last_total as number,
      pct_change: pct,
    });
  }

  ranked.sort((a, b) => {
    const magA = Math.abs(a.pct_change);
    const magB = Math.abs(b.pct_change);
    if (magA !== magB) return magB - magA;
    const codeCmp = a.reseller_code.localeCompare(b.reseller_code);
    if (codeCmp !== 0) return codeCmp;
    const posA = specOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const posB = specOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return posA - posB;
  });

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n: n,
    threshold: PCT_CHANGE_MATERIAL_THRESHOLD,
    rows: ranked.slice(0, n),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPctCell(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Render an HTML section listing the top-N |pct_change| movers across every
 * (reseller × metric) pair in the window. In the P11.40 cron wiring this
 * lands directly after the per-reseller rolling trend drill-down (P11.22 /
 * P11.23) — the natural placement given the shared feeder — so ops walks
 * per-partner absolute trend → per-partner percent-change drill-down on the
 * same page.
 *
 * Returns "" when window_size < 2 (single-point window has no computable
 * delta), when the ranked-row list is empty (no partner had a computable
 * percent shift across their metrics), OR when every ranked row would fall
 * outside the top-N cut.
 */
export function formatDigestSnapshotPerResellerMetricPctChangeSection(
  headline: DigestSnapshotPerResellerMetricPctChange,
): string {
  if (headline.window_size < 2) return "";
  if (headline.rows.length === 0) return "";

  const firstWeek = headline.first_week ? escapeHtml(headline.first_week) : "";
  const lastWeek = headline.last_week ? escapeHtml(headline.last_week) : "";

  const body = headline.rows
    .map((r) => {
      const material = Math.abs(r.pct_change) >= headline.threshold;
      const rowStyle = material ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${formatPctCell(r.pct_change)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.top_n} per-reseller &Delta;% movers across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Signed percent change per (reseller &times; metric) pair, sorted by magnitude. Rows whose |&Delta;%| &ge; ${headline.threshold}% are highlighted. Partners with a launch-week metric (first_total was zero or missing) do not surface — a launch is not a percent change.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Section</th>
          <th>Metric</th>
          <th>&Delta;%</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
