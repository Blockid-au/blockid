// Weekly digest per-(reseller × metric) percent-change grouped PER reseller
// (P11.47).
//
// P11.41 (tick 435) + P11.42 (tick 436) shipped the per-metric |pct_change|
// spotlight — one guaranteed row per HEADLINE_METRICS spec key so a metric
// whose partners all shifted sharply cannot monopolise the executive summary.
// P11.43 (tick 437) + P11.44 (tick 438) then quantified per-metric coverage
// (how many partners moved materially in each metric). P11.45 (tick 439) +
// P11.46 (tick 440) pivoted the coverage onto the per-reseller axis (how many
// metrics each partner moved materially in).
//
// The remaining executive-summary gap on the relative axis is the mirror of
// P11.41: a per-reseller spotlight that guarantees each partner surfaces its
// biggest |pct_change| mover regardless of how the pooled per-(reseller ×
// metric) leaderboard (P11.39) OR the per-metric spotlight (P11.41) shakes
// out in a given week. This is the pct-axis companion to P11.28 (per-reseller
// absolute-delta spotlight): "for each partner, which metric moved the most
// in relative terms" — an ops signal the metric-first spotlights cannot see
// because they collapse partner-level breadth into per-metric depth.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 pattern. Cron-route wiring
// is intentionally deferred to the follow-up tick (P11.48) so this shape can
// be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly so the
//     per-reseller pct spotlight cannot diverge from the drill-down table
//     P11.39 already renders — single-source-of-truth pattern shared with
//     P11.26 / P11.28 / P11.32 / P11.39 / P11.41 / P11.43 / P11.45.
//   • pct_change math matches P11.37 / P11.39 / P11.41 / P11.43 / P11.45:
//     null when first_total is null OR 0, null when last_total is null, else
//     (last - first) / |first| * 100 rounded to 1 decimal. Excluded rows
//     contribute zero spotlights.
//   • Threshold reuses PCT_CHANGE_MATERIAL_THRESHOLD so the amber highlight
//     band is one constant across the portfolio pct table, the per-reseller
//     pct drill-down, the per-metric pct spotlight, the per-metric pct
//     coverage, the per-reseller pct coverage, and this per-reseller pct
//     spotlight — an ops workflow triaging relative movers sees the same 25%
//     floor everywhere.
//   • Reseller grouping order is reseller_code asc so ops reads the same
//     partner ladder every Monday — matches P11.28 / P11.32 / P11.45 and
//     mirrors P11.41's HEADLINE_METRICS spec-order posture (both spotlight
//     tables prioritise reader ergonomics over rank-order shuffle).
//   • Within each reseller bucket: |pct_change| desc primary,
//     HEADLINE_METRICS spec order secondary (so ties break to the canonical
//     KPI ladder rather than an arbitrary metric name string sort).
//     Deterministic on ties.
//   • DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE = 1 — coverage-per-partner, not
//     depth-per-partner. Callers can widen to 2 or 3 if they want the
//     runner-up mover per partner.
//   • rank_in_reseller is 1-based so the HTML column can render "#1", "#2",
//     … without the caller re-deriving from array index.
//   • Formatter returns "" when window_size < 2, when rows is empty, OR when
//     no reseller produced a spotlight — quiet-when-flat posture matching
//     P11.26 / P11.28 / P11.32 / P11.39 / P11.41 / P11.43 / P11.45.

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

export const DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE = 1;

export interface PerResellerMetricPctChangePerResellerRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly first_total: number;
  readonly last_total: number;
  readonly pct_change: number;
  readonly rank_in_reseller: number;
}

export interface DigestSnapshotPerResellerMetricPctChangePerReseller {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n_per_reseller: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPctChangePerResellerRow[];
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
 * |pct_change| movers WITHIN EACH reseller_code. Guarantees every partner
 * with at least one row whose first_total is computable-non-zero and
 * last_total is non-null gets a spotlight — even when the pooled
 * per-(reseller × metric) leaderboard (P11.39) OR the per-metric spotlight
 * (P11.41) is dominated by a subset of partners.
 *
 * Sort: reseller_code asc primary (so the section always emits partners in
 * alphabetical order — matches P11.28 / P11.32 / P11.45 and the P11.1/P11.3
 * body-row ordering), |pct_change| desc secondary (biggest relative shift
 * per partner lands first), HEADLINE_METRICS spec order tertiary (ties break
 * to canonical KPI ladder). Deterministic on ties.
 *
 * topNPerReseller < 1 coerces to DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE.
 * topN larger than the filtered row count for a reseller simply emits every
 * ranked row for that reseller (no padding).
 */
export function computeDigestSnapshotPerResellerMetricPctChangePerReseller(
  trend: DigestSnapshotPerResellerRollingTrend,
  topNPerReseller: number = DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE,
): DigestSnapshotPerResellerMetricPctChangePerReseller {
  const n =
    Number.isFinite(topNPerReseller) && topNPerReseller >= 1
      ? Math.floor(topNPerReseller)
      : DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const specOrder = new Map<KnownKpiSection, number>();
  HEADLINE_METRICS.forEach((spec, i) => specOrder.set(spec.key, i));

  type Ranked = PerResellerMetricPctChangePerResellerRow;
  const grouped = new Map<string, Ranked[]>();
  for (const r of source) {
    // Mirror the P11.39/P11.41 filter: rows with a null delta are single-point
    // presences whose first_total === last_total would surface as a false 0%.
    if (r.delta === null) continue;
    const pct = computePctChange(r.first_total, r.last_total);
    if (pct === null) continue;
    const row: Ranked = {
      reseller_code: r.reseller_code,
      key: r.key,
      metric_name: r.metric_name,
      unit: r.unit,
      first_total: r.first_total as number,
      last_total: r.last_total as number,
      pct_change: pct,
      // Filled after sort below.
      rank_in_reseller: 0,
    };
    const bucket = grouped.get(r.reseller_code);
    if (bucket) bucket.push(row);
    else grouped.set(r.reseller_code, [row]);
  }

  const orderedCodes = Array.from(grouped.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const rows: Ranked[] = [];
  for (const code of orderedCodes) {
    const bucket = grouped.get(code)!;
    bucket.sort((a, b) => {
      const magA = Math.abs(a.pct_change);
      const magB = Math.abs(b.pct_change);
      if (magA !== magB) return magB - magA;
      const posA = specOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const posB = specOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });
    for (let i = 0; i < Math.min(n, bucket.length); i++) {
      rows.push({ ...bucket[i], rank_in_reseller: i + 1 });
    }
  }

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n_per_reseller: n,
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
 * Render an HTML section showing the top-N |pct_change| mover(s) per reseller
 * in the window. In the P11.48 cron wiring this lands directly after the
 * per-reseller pct-change coverage summary (P11.45 / P11.46) so ops walks:
 * per-metric |pct| spotlight (P11.41) → per-metric coverage (P11.43) →
 * per-reseller coverage (P11.45) → per-reseller |pct| spotlight (this section)
 * on the same page — the executive summary reads metric-first depth,
 * metric-first breadth, partner-first breadth, then partner-first depth in a
 * single ladder.
 *
 * Returns "" when window_size < 2 (single-point window has no computable
 * delta), when the input rows list is empty, OR when no reseller produced a
 * spotlight (all flat / all null / all launch-week).
 */
export function formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
  headline: DigestSnapshotPerResellerMetricPctChangePerReseller,
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
        <td>#${r.rank_in_reseller}</td>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td style="text-align:right">${formatPctCell(r.pct_change)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.top_n_per_reseller} &Delta;% mover${headline.top_n_per_reseller === 1 ? "" : "s"} per reseller across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller relative-change spotlight so a busy partner whose biggest |&Delta;%| mover loses the metric-group race is not under-represented by the metric-first spotlights above. One row per (reseller &times; rank) — every partner with a computable-pct mover is guaranteed at least one row here regardless of whether they lead any metric group globally. Rows whose |&Delta;%| &ge; ${headline.threshold}% are highlighted. Partners with a launch-week metric (first_total was zero or missing) do not surface — a launch is not a percent change.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Rank</th>
          <th>Section</th>
          <th>Metric</th>
          <th>&Delta;%</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
