// Weekly digest per-(reseller × metric) percent-change grouped PER metric (P11.41).
//
// P11.39 (tick 433) + P11.40 (tick 434) shipped the per-(reseller × metric)
// percent-change drill-down that ranks the top-N |pct_change| movers ACROSS
// every metric in a single ranked list. Because that ranking pools every
// metric into one leaderboard, a metric whose partners all move sharply in
// relative terms (e.g. an attributed_mrr sea-change week) can monopolise the
// top-N slots and starve coverage for metrics whose biggest movers are
// smaller in |pct_change| but still material to ops (a tier_mix or
// attributed_churn_30d row that never surfaces even though it crossed the
// PCT_CHANGE_MATERIAL_THRESHOLD floor). Mirrors the P11.24 → P11.26 pooling
// gap on the absolute-delta axis and P11.28 → P11.32 on the per-partner axis.
//
// This module closes that gap on the relative axis. It projects the same
// DigestSnapshotPerResellerRollingTrend down to the top-N |pct_change|
// movers WITHIN EACH HEADLINE_METRICS spec key so every metric that has at
// least one computable-pct row gets a guaranteed spotlight — independent of
// how the overall |pct_change| leaderboard shakes out in a given week.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 pattern;
// cron-route wiring is intentionally deferred to the follow-up tick (P11.42)
// so this shape can be exercised in isolation before touching the hot Monday
// cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — same single-source-of-truth pattern as P11.26 /
//     P11.32 / P11.39 so per-metric spotlights cannot diverge from the
//     drill-down tables they summarise.
//   • pct_change math matches P11.37 / P11.39: null when first_total is null
//     OR 0, null when last_total is null, else (last - first) / |first| * 100
//     rounded to 1 decimal. Excluded rows contribute zero spotlights.
//   • Threshold reuses PCT_CHANGE_MATERIAL_THRESHOLD so the amber highlight
//     band is one constant across the portfolio pct table (P11.37), the
//     per-reseller pct drill-down (P11.39), and this per-metric spotlight —
//     an ops workflow triaging relative movers sees the same 25% floor
//     everywhere.
//   • Metric grouping order follows HEADLINE_METRICS so cents-unit and
//     count-unit spotlights interleave in the fixed spec order rather than
//     being sorted by |pct_change|. Mirrors P11.26 so ops reads the same
//     section ladder every Monday and can eyeball a metric's presence/absence
//     at a glance rather than a rank-order shuffle every week.
//   • Within each metric group: |pct_change| desc primary,
//     reseller_code asc secondary. Deterministic on ties.
//   • DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE = 1 — coverage-per-metric, not
//     depth-per-metric. Callers can widen to 2 or 3 if they want the
//     runner-up mover per metric.
//   • rank_in_metric is 1-based so the HTML column can render "#1", "#2", …
//     without the caller re-deriving from array index.
//   • Formatter returns "" when window_size < 2, when rows is empty, OR when
//     no metric produced a spotlight — quiet-when-flat posture matching
//     P11.26 / P11.39.

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

export const DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE = 1;

export interface PerResellerMetricPctChangePerMetricRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly reseller_code: string;
  readonly first_total: number;
  readonly last_total: number;
  readonly pct_change: number;
  readonly rank_in_metric: number;
}

export interface DigestSnapshotPerResellerMetricPctChangePerMetric {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n_per_metric: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPctChangePerMetricRow[];
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
 * Project a DigestSnapshotPerResellerRollingTrend down to the top-N
 * |pct_change| movers WITHIN EACH HEADLINE_METRICS spec key. Guarantees that
 * every metric with at least one row whose first_total is computable-non-zero
 * and last_total is non-null gets a spotlight — even when the pooled
 * per-(reseller × metric) leaderboard (P11.39) is dominated by a single
 * metric whose partners all shifted sharply this week.
 *
 * Sort: HEADLINE_METRICS spec order primary (so the section always emits
 * metrics in the fixed KPI ladder — cents+count interleaved deterministically),
 * |pct_change| desc secondary (biggest relative movers first within each
 * metric bucket), reseller_code asc tertiary (deterministic on ties).
 *
 * topNPerMetric < 1 coerces to DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE. topN
 * larger than the filtered row count for a metric simply emits every ranked
 * row for that metric (no padding).
 */
export function computeDigestSnapshotPerResellerMetricPctChangePerMetric(
  trend: DigestSnapshotPerResellerRollingTrend,
  topNPerMetric: number = DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE,
): DigestSnapshotPerResellerMetricPctChangePerMetric {
  const n =
    Number.isFinite(topNPerMetric) && topNPerMetric >= 1
      ? Math.floor(topNPerMetric)
      : DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  type Ranked = PerResellerMetricPctChangePerMetricRow;
  const grouped = new Map<KnownKpiSection, Ranked[]>();
  for (const r of source) {
    // Mirror the P11.39 filter: rows with a null delta are single-point
    // presences whose first_total === last_total would surface as a false 0%.
    if (r.delta === null) continue;
    const pct = computePctChange(r.first_total, r.last_total);
    if (pct === null) continue;
    const row: Ranked = {
      key: r.key,
      metric_name: r.metric_name,
      unit: r.unit,
      reseller_code: r.reseller_code,
      first_total: r.first_total as number,
      last_total: r.last_total as number,
      pct_change: pct,
      // Filled after sort below.
      rank_in_metric: 0,
    };
    const bucket = grouped.get(r.key);
    if (bucket) bucket.push(row);
    else grouped.set(r.key, [row]);
  }

  const rows: Ranked[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = grouped.get(spec.key);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => {
      const magA = Math.abs(a.pct_change);
      const magB = Math.abs(b.pct_change);
      if (magA !== magB) return magB - magA;
      return a.reseller_code.localeCompare(b.reseller_code);
    });
    for (let i = 0; i < Math.min(n, bucket.length); i++) {
      rows.push({ ...bucket[i], rank_in_metric: i + 1 });
    }
  }

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n_per_metric: n,
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

function formatPctCell(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Render an HTML section showing the top-N |pct_change| mover(s) per metric
 * in the window. In the P11.42 cron wiring this lands directly after the
 * per-reseller pct-change drill-down (P11.39 / P11.40) so ops walks:
 * per-partner |pct| drill-down (pooled) → per-metric |pct| spotlight
 * (coverage-per-metric) on the same page.
 *
 * Returns "" when window_size < 2 (single-point windows have no computable
 * delta), when the input rows list is empty, OR when no metric produced a
 * spotlight (all flat / all null / all launch-week).
 */
export function formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
  headline: DigestSnapshotPerResellerMetricPctChangePerMetric,
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
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td>#${r.rank_in_metric}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${formatPctCell(r.pct_change)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.top_n_per_metric} &Delta;% mover${headline.top_n_per_metric === 1 ? "" : "s"} per metric across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-metric relative-change spotlight so a metric whose partners all shifted sharply cannot monopolise the executive summary. One row per (metric &times; rank) — every HEADLINE_METRICS spec with a computable-pct mover is guaranteed at least one row here. Rows whose |&Delta;%| &ge; ${headline.threshold}% are highlighted. Partners with a launch-week metric (first_total was zero or missing) do not surface — a launch is not a percent change.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Rank</th>
          <th>Reseller</th>
          <th>&Delta;%</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
