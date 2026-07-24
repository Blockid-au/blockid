// Weekly digest top-N movers PER metric (P11.26).
//
// P11.24 (tick 418) + P11.25 (tick 419) shipped the portfolio-wide top-N
// |delta| movers headline that ranks across every (metric × reseller_code)
// pair. That surface answers "what are the single biggest shifts across the
// window?" — but because it ranks on the raw |delta| scalar, unit scale
// dominates: a A$5.00 cents-scale MRR slide (delta=500) will always outrank a
// +5 signup count-scale mover, so cents-unit metrics tend to monopolise the
// slots and count-unit metrics (attributed_churn_30d, cohort_velocity,
// ledger_drift_events, tier_mix, sandbox_share_of_budget, budget_utilization)
// never surface in the executive summary even when they have material shifts.
//
// This module closes that gap. It projects the same per-reseller rolling
// trend down to the top-N |delta| movers WITHIN EACH metric so every tracked
// HEADLINE_METRICS spec is guaranteed at least one spotlight row when it has
// any non-null-non-zero delta — independent of the cents/count unit split.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 / P11.24→P11.25 pattern. Cron-route wiring is intentionally
// deferred to the follow-up tick (P11.27) so the shape can be exercised in
// isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — same pattern as P11.24 so the per-metric
//     spotlights can never diverge from the drill-down table they summarise.
//   • Null-delta and zero-delta rows are excluded — a metric with no mover
//     contributes zero rows to the output (no forced empty spotlight) so the
//     digest stays quiet when nothing moved.
//   • Metric grouping order follows HEADLINE_METRICS so cents-unit and
//     count-unit spotlights interleave in the fixed spec order rather than
//     being sorted by unit or |delta|. Ops reads the same section order every
//     week and can eyeball a metric's presence/absence at a glance.
//   • Within each metric group: |delta| desc primary, reseller_code asc
//     secondary. Deterministic even on ties so the JSONL/HTML output is
//     byte-stable across identical inputs.
//   • DEFAULT_TOP_N_PER_METRIC = 1 — the point of this section is
//     coverage-per-metric, not depth-per-metric. Callers can widen if they
//     want the top-2 or top-3 per metric.
//   • rank_in_metric is 1-based so the HTML column can render "#1", "#2", …
//     without the caller re-deriving from array index.
//   • Formatter returns "" when window_size < 2, when rows is empty, or when
//     no metric produced a spotlight — matches the P11.24 quiet-when-flat
//     posture.

import { HEADLINE_METRICS, type HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_TOP_N_PER_METRIC = 1;

export interface TopMoverPerMetricRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly reseller_code: string;
  readonly first_total: number;
  readonly last_total: number;
  readonly delta: number;
  readonly abs_delta: number;
  readonly rank_in_metric: number;
}

export interface DigestSnapshotTopMoversPerMetric {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n_per_metric: number;
  readonly rows: readonly TopMoverPerMetricRow[];
}

/**
 * Project a DigestSnapshotPerResellerRollingTrend down to the top-N |delta|
 * movers WITHIN EACH HEADLINE_METRICS spec key. Guarantees every metric that
 * has at least one non-null-non-zero mover in the window gets at least one
 * spotlight row, independent of the cents/count unit scale that dominates
 * the P11.24 portfolio-wide ranking.
 *
 * Sort: HEADLINE_METRICS spec order primary (so the section always emits
 * metrics in the fixed KPI ladder — cents+count interleaved deterministically),
 * |delta| desc secondary, reseller_code asc tertiary. Deterministic even when
 * two movers share the same |delta|.
 *
 * topNPerMetric < 1 coerces to DEFAULT_TOP_N_PER_METRIC. topN larger than the
 * filtered row count for a metric simply emits every non-null-non-zero row
 * for that metric (no padding).
 */
export function computeDigestSnapshotTopMoversPerMetric(
  trend: DigestSnapshotPerResellerRollingTrend,
  topNPerMetric: number = DEFAULT_TOP_N_PER_METRIC,
): DigestSnapshotTopMoversPerMetric {
  const n =
    Number.isFinite(topNPerMetric) && topNPerMetric >= 1
      ? Math.floor(topNPerMetric)
      : DEFAULT_TOP_N_PER_METRIC;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const grouped = new Map<KnownKpiSection, PerResellerMetricTrend[]>();
  for (const r of source) {
    if (r.delta === null || r.delta === 0) continue;
    if (r.first_total === null || r.last_total === null) continue;
    const bucket = grouped.get(r.key);
    if (bucket) bucket.push(r);
    else grouped.set(r.key, [r]);
  }

  const rows: TopMoverPerMetricRow[] = [];
  for (const spec of HEADLINE_METRICS) {
    const bucket = grouped.get(spec.key);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => {
      const absA = Math.abs(a.delta ?? 0);
      const absB = Math.abs(b.delta ?? 0);
      if (absA !== absB) return absB - absA;
      return a.reseller_code.localeCompare(b.reseller_code);
    });
    for (let i = 0; i < Math.min(n, bucket.length); i++) {
      const r = bucket[i];
      rows.push({
        key: r.key,
        metric_name: r.metric_name,
        unit: r.unit,
        reseller_code: r.reseller_code,
        first_total: r.first_total as number,
        last_total: r.last_total as number,
        delta: r.delta as number,
        abs_delta: Math.abs(r.delta as number),
        rank_in_metric: i + 1,
      });
    }
  }

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n_per_metric: n,
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

function formatAud(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}A$${whole}.${String(frac).padStart(2, "0")}`;
}

function formatCell(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") return formatAud(n);
  return String(n);
}

function formatDeltaCell(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") {
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const abs = Math.abs(n);
    return `${sign}${formatAud(abs).replace(/^-/, "")}`;
  }
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render an HTML section showing the top-N |delta| mover(s) per metric in the
 * window. Rendered directly under the P11.24 portfolio-wide top-movers
 * headline so ops sees both "the biggest shifts anywhere" (P11.24) and "the
 * biggest shift in each metric" (P11.26) above the drill-down.
 *
 * Returns "" when window_size < 2 (single-point window is meaningless), when
 * the input rows list is empty, OR when no metric produced a spotlight (all
 * flat / all null).
 */
export function formatDigestSnapshotTopMoversPerMetricSection(
  headline: DigestSnapshotTopMoversPerMetric,
): string {
  if (headline.window_size < 2) return "";
  if (headline.rows.length === 0) return "";

  const firstWeek = headline.first_week ? escapeHtml(headline.first_week) : "";
  const lastWeek = headline.last_week ? escapeHtml(headline.last_week) : "";

  const body = headline.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td>#${r.rank_in_metric}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.first_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.last_total)}</td>
        <td style="text-align:right"><strong>${formatDeltaCell(r.unit, r.delta)}</strong></td>
      </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.top_n_per_metric} mover${headline.top_n_per_metric === 1 ? "" : "s"} per metric across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-metric spotlight so cents-scale metrics do not monopolise the executive summary. One row per (metric &times; rank) — every HEADLINE_METRICS spec with a non-null-non-zero mover is guaranteed at least one row here regardless of unit scale.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Rank</th>
          <th>Reseller</th>
          <th>First</th>
          <th>Last</th>
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
