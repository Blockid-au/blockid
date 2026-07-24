// Weekly digest top-N movers PER reseller (P11.28).
//
// P11.24 (tick 418) + P11.25 (tick 419) shipped the portfolio-wide top-N
// |delta| headline that ranks across every (metric × reseller_code) pair.
// P11.26 (tick 420) + P11.27 (tick 421) then closed the per-metric coverage
// gap so cents-scale metrics could not monopolise the executive summary.
// Both surfaces answer "what moved most" from a metric-first angle.
//
// The remaining executive-summary gap is the reseller-first angle: on a busy
// week a single partner may drive several material shifts (e.g. InfoVision
// swings on MRR + churn + drift simultaneously) yet the P11.24/P11.26
// spotlights can still under-represent that partner if each of their moves
// loses the metric-group race to a larger competitor. This module closes that
// gap by projecting the same per-reseller rolling trend down to the top-N
// |delta| movers WITHIN EACH reseller_code — guaranteeing every partner with
// any non-null-non-zero mover in the window gets at least one spotlight row
// regardless of whether they lead any metric group globally.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 pattern. Cron-route wiring
// is intentionally deferred to the follow-up tick (P11.29) so the shape can
// be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — mirrors P11.24/P11.26 so the per-reseller
//     spotlights can never diverge from the drill-down table they summarise.
//   • Null-delta and zero-delta rows are excluded — a reseller with no mover
//     contributes zero rows to the output (no forced empty spotlight) so the
//     digest stays quiet when nothing moved for that partner.
//   • Reseller grouping order is reseller_code asc so ops reads the same
//     section order every week and can eyeball a partner's presence/absence
//     at a glance — matches the alphabetical sort used elsewhere in the
//     digest (P11.1 budget_utilization, P11.3 commission_cleared_mtd, etc.).
//   • Within each reseller group: |delta| desc primary, HEADLINE_METRICS spec
//     order secondary (so ties break to the canonical KPI ladder rather than
//     an arbitrary metric name string sort). Deterministic on ties.
//   • DEFAULT_TOP_N_PER_RESELLER = 1 — the point of this section is
//     coverage-per-reseller, not depth-per-reseller. Callers can widen if
//     they want the top-2 or top-3 per partner.
//   • rank_in_reseller is 1-based so the HTML column can render "#1", "#2", …
//     without the caller re-deriving from array index.
//   • Formatter returns "" when window_size < 2, when rows is empty, or when
//     no reseller produced a spotlight — matches the P11.24/P11.26
//     quiet-when-flat posture.

import { HEADLINE_METRICS, type HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_TOP_N_PER_RESELLER = 1;

export interface TopMoverPerResellerRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly first_total: number;
  readonly last_total: number;
  readonly delta: number;
  readonly abs_delta: number;
  readonly rank_in_reseller: number;
}

export interface DigestSnapshotTopMoversPerReseller {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n_per_reseller: number;
  readonly rows: readonly TopMoverPerResellerRow[];
}

/**
 * Project a DigestSnapshotPerResellerRollingTrend down to the top-N |delta|
 * movers WITHIN EACH reseller_code. Guarantees every partner with at least
 * one non-null-non-zero mover in the window gets at least one spotlight row,
 * independent of whether they lead a metric group globally.
 *
 * Sort: reseller_code asc primary (so the section always emits partners in
 * alphabetical order — matches the P11.1/P11.3 body-row ordering), |delta|
 * desc secondary (biggest shift per partner lands first), HEADLINE_METRICS
 * spec order tertiary (ties break to canonical KPI ladder).
 *
 * topNPerReseller < 1 coerces to DEFAULT_TOP_N_PER_RESELLER. topN larger
 * than the filtered row count for a reseller simply emits every
 * non-null-non-zero row for that reseller (no padding).
 */
export function computeDigestSnapshotTopMoversPerReseller(
  trend: DigestSnapshotPerResellerRollingTrend,
  topNPerReseller: number = DEFAULT_TOP_N_PER_RESELLER,
): DigestSnapshotTopMoversPerReseller {
  const n =
    Number.isFinite(topNPerReseller) && topNPerReseller >= 1
      ? Math.floor(topNPerReseller)
      : DEFAULT_TOP_N_PER_RESELLER;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const specOrder = new Map<KnownKpiSection, number>();
  HEADLINE_METRICS.forEach((spec, i) => specOrder.set(spec.key, i));

  const grouped = new Map<string, PerResellerMetricTrend[]>();
  for (const r of source) {
    if (r.delta === null || r.delta === 0) continue;
    if (r.first_total === null || r.last_total === null) continue;
    const bucket = grouped.get(r.reseller_code);
    if (bucket) bucket.push(r);
    else grouped.set(r.reseller_code, [r]);
  }

  const orderedCodes = Array.from(grouped.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const rows: TopMoverPerResellerRow[] = [];
  for (const code of orderedCodes) {
    const bucket = grouped.get(code)!;
    bucket.sort((a, b) => {
      const absA = Math.abs(a.delta ?? 0);
      const absB = Math.abs(b.delta ?? 0);
      if (absA !== absB) return absB - absA;
      const posA = specOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const posB = specOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });
    for (let i = 0; i < Math.min(n, bucket.length); i++) {
      const r = bucket[i];
      rows.push({
        reseller_code: r.reseller_code,
        key: r.key,
        metric_name: r.metric_name,
        unit: r.unit,
        first_total: r.first_total as number,
        last_total: r.last_total as number,
        delta: r.delta as number,
        abs_delta: Math.abs(r.delta as number),
        rank_in_reseller: i + 1,
      });
    }
  }

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n_per_reseller: n,
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
 * Render an HTML section showing the top-N |delta| mover(s) per reseller in
 * the window. Rendered directly under the P11.24 + P11.26 executive-summary
 * pair so ops sees the reseller-first angle ("which partners moved the most
 * across their metrics") alongside the metric-first angles ("biggest single
 * shift" and "biggest shift per metric") above the drill-down.
 *
 * Returns "" when window_size < 2 (single-point window is meaningless), when
 * the input rows list is empty, OR when no reseller produced a spotlight
 * (all flat / all null).
 */
export function formatDigestSnapshotTopMoversPerResellerSection(
  headline: DigestSnapshotTopMoversPerReseller,
): string {
  if (headline.window_size < 2) return "";
  if (headline.rows.length === 0) return "";

  const firstWeek = headline.first_week ? escapeHtml(headline.first_week) : "";
  const lastWeek = headline.last_week ? escapeHtml(headline.last_week) : "";

  const body = headline.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>#${r.rank_in_reseller}</td>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.first_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.last_total)}</td>
        <td style="text-align:right"><strong>${formatDeltaCell(r.unit, r.delta)}</strong></td>
      </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.top_n_per_reseller} mover${headline.top_n_per_reseller === 1 ? "" : "s"} per reseller across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller spotlight so a busy partner with several material shifts is not under-represented by the metric-first executive summaries above. One row per (reseller &times; rank) — every partner with a non-null-non-zero mover in the window is guaranteed at least one row here regardless of whether they lead any metric group globally.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Rank</th>
          <th>Section</th>
          <th>Metric</th>
          <th>First</th>
          <th>Last</th>
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
