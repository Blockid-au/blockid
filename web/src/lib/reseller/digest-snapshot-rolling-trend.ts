// Weekly digest rolling-N-week trend (P11.20).
//
// P11.19 (tick 413) shipped readLastNDigestSnapshots, the bounded multi-row
// walker that returns up to the newest N parseable DigestSnapshots ordered
// oldest → newest. Its docstring flagged:
//
//   "so a future rolling-N-week trend section (e.g. 4-week attributed_mrr
//    curve inside the Monday digest) has a pure lib to fold against."
//
// This module closes that gap. Given N snapshots (in chronological order),
// it walks HEADLINE_METRICS (P11.16) and computes a per-metric time series of
// portfolio-wide totals plus a first→last delta + min/max envelope so a
// downstream cron section can render a compact trend table without repeating
// the shape-aware walker (nested-vs-flat path fallback + cohort_velocity
// unroll) in yet a third place.
//
// Kept dependency-free so the trend shape can be regression-tested without
// Supabase, nodemailer, or the file system — mirrors the pure-lib pattern
// used by every P11.x KPI module. Cron-route wiring intentionally deferred to
// a follow-up tick so this pure lib can be exercised in isolation before
// touching the hot Monday cron path — mirrors the pure-lib-first pattern
// used by P11.14 → P11.15 (structural delta pure lib → cron wiring) and
// P11.16 → P11.16 cron wiring and P11.17 → P11.18 (per-reseller metric
// delta pure lib → cron wiring).

import {
  HEADLINE_METRICS,
  readSectionTotal,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshot, KnownKpiSection } from "./digest-snapshot";

/**
 * One time-series point per (metric × snapshot). total is null when the
 * snapshot's section was skipped or absent — surfacing the gap rather than
 * silently substituting a zero that would flatten the trend.
 */
export interface RollingTrendPoint {
  readonly captured_at: string;
  readonly week: string;
  readonly total: number | null;
}

/**
 * One metric's rolling trend across the N-snapshot window. `first_total` /
 * `last_total` skip null points so a mid-window skip does not misreport as
 * the leading/trailing anchor — the delta remains meaningful across a gappy
 * series. `delta` is null when either bookend is null (window has fewer than
 * two non-null points). `min_total` / `max_total` similarly skip nulls.
 */
export interface RollingMetricTrend {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly points: readonly RollingTrendPoint[];
  readonly first_total: number | null;
  readonly last_total: number | null;
  readonly delta: number | null;
  readonly min_total: number | null;
  readonly max_total: number | null;
}

export interface DigestSnapshotRollingTrend {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly metrics: readonly RollingMetricTrend[];
}

/**
 * Fold N snapshots (oldest → newest, as returned by readLastNDigestSnapshots)
 * into a per-metric trend. Empty input yields an empty metrics list so the
 * formatter can short-circuit to '' without a special case at the call site.
 * Non-array input coerces to empty. Passing exactly one snapshot still walks
 * every metric — points[] has one entry, delta is null (need two non-null
 * points), and the formatter will suppress the section since a single-point
 * "trend" is just a numeric readout of the current run.
 */
export function computeDigestSnapshotRollingTrend(
  snapshots: readonly DigestSnapshot[],
): DigestSnapshotRollingTrend {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const first = rows.length > 0 ? rows[0] : null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const metrics: RollingMetricTrend[] = HEADLINE_METRICS.map((spec) => {
    const points: RollingTrendPoint[] = rows.map((snap) => {
      const env = (snap.envelope ?? {}) as Record<string, unknown>;
      return {
        captured_at: snap.captured_at,
        week: snap.week,
        total: readSectionTotal(env, spec),
      };
    });
    const nonNull = points.filter((p): p is RollingTrendPoint & { total: number } =>
      p.total !== null,
    );
    const firstNonNull = nonNull.length > 0 ? nonNull[0].total : null;
    const lastNonNull =
      nonNull.length > 0 ? nonNull[nonNull.length - 1].total : null;
    const delta =
      firstNonNull === null || lastNonNull === null || nonNull.length < 2
        ? null
        : lastNonNull - firstNonNull;
    let min: number | null = null;
    let max: number | null = null;
    for (const p of nonNull) {
      if (min === null || p.total < min) min = p.total;
      if (max === null || p.total > max) max = p.total;
    }
    return {
      key: spec.key,
      metric_name: spec.metric_name,
      unit: spec.unit,
      points,
      first_total: firstNonNull,
      last_total: lastNonNull,
      delta,
      min_total: min,
      max_total: max,
    };
  });
  return {
    window_size: rows.length,
    first_week: first ? first.week : null,
    last_week: last ? last.week : null,
    metrics,
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

function formatCell(unit: HeadlineMetricUnit, n: number | null): string {
  if (n === null) return "&mdash;";
  if (unit === "cents" || unit === "signed_cents") return formatAud(n);
  return String(n);
}

function formatDeltaCell(
  unit: HeadlineMetricUnit,
  n: number | null,
): string {
  if (n === null) return "&mdash;";
  if (unit === "cents" || unit === "signed_cents") {
    const abs = Math.abs(n);
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return `${sign}${formatAud(abs).replace(/^-/, "")}`;
  }
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render an HTML table summarising the N-week rolling trend. Returns an empty
 * string when window_size < 2 (a single-point "trend" is meaningless — the
 * P11.16 metric-delta section already carries the current-run readout so no
 * point rendering a one-column table here). Also returns '' when every metric
 * has a null first→last delta (all sections skipped across the window) — a
 * fully-blank week does not spam the digest email.
 *
 * When rendered, each metric row shows week labels as column headers plus a
 * trailing delta column. Rows with a non-zero delta land at the top (sorted by
 * |delta| desc) so the biggest movers are visible without scrolling. Rows
 * with null delta (insufficient non-null points) render at the bottom so ops
 * sees the gap rather than silently omitting the row.
 */
export function formatDigestSnapshotRollingTrendSection(
  trend: DigestSnapshotRollingTrend,
): string {
  if (trend.window_size < 2) return "";
  const anyNonNullDelta = trend.metrics.some((m) => m.delta !== null);
  if (!anyNonNullDelta) return "";

  const columnCount = trend.window_size;
  const weekHeaders = trend.metrics[0]?.points ?? [];
  const columnLabels = weekHeaders.map((p) => escapeHtml(p.week));

  const sorted = [...trend.metrics].sort((a, b) => {
    const aRank = a.delta === null ? Number.NEGATIVE_INFINITY : Math.abs(a.delta);
    const bRank = b.delta === null ? Number.NEGATIVE_INFINITY : Math.abs(b.delta);
    if (aRank === bRank) {
      // Stable within a rank tier: preserve HEADLINE_METRICS declaration order
      // so a genuinely flat week (every delta = 0) renders the ladder in the
      // same order as the P11.14 / P11.16 sections above it.
      return 0;
    }
    return bRank - aRank;
  });

  const body = sorted
    .map((m) => {
      const highlight = m.delta !== null && m.delta !== 0;
      const rowStyle = highlight ? ' style="background:#fff8e1"' : "";
      const cellHtml = m.points
        .map(
          (p) =>
            `<td style="text-align:right">${formatCell(m.unit, p.total)}</td>`,
        )
        .join("");
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(m.key)}</td>
        <td>${escapeHtml(m.metric_name)}</td>${cellHtml}
        <td style="text-align:right">${formatDeltaCell(m.unit, m.delta)}</td>
      </tr>`;
    })
    .join("");

  const headerCells = columnLabels
    .map((label) => `<th>${label}</th>`)
    .join("");

  const firstWeek = trend.first_week ? escapeHtml(trend.first_week) : "";
  const lastWeek = trend.last_week ? escapeHtml(trend.last_week) : "";

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest rolling ${columnCount}-week trend (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Portfolio-wide totals per headline metric across the persisted digest history. Rows are sorted by |first &rarr; last delta| desc so the biggest movers land first. Cells render &mdash; on weeks where that metric's section was skipped or absent so a mid-window gap is visible rather than being reported as a zero point that would flatten the trend.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>${headerCells}
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
