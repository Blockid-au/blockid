// Weekly digest per-reseller rolling-N-week trend (P11.22).
//
// P11.20 (tick 414) shipped the portfolio-wide rolling-N-week trend and
// P11.21 (tick 415) wired it into the Monday cron. Its output answers "which
// portfolio metric moved across the 4-week window?" but not "which partner
// drove that trend?" — the aggregate row shows a -A$500 slide on
// commission_cleared_mtd across four weeks while ops still has to open
// /admin/resellers/[code] per partner to identify who slid.
//
// This module closes that drill-down gap. Given N snapshots (oldest → newest
// per readLastNDigestSnapshots contract) and the same HEADLINE_METRICS spec
// list P11.16/P11.17/P11.20 use, it folds one per-reseller_code total per
// (metric × reseller_code × snapshot) into a time series so the digest can
// render a compact table that names the specific partners whose trend line is
// moving.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21
// pattern. Kept dependency-free so the JSONL shape can be regression-tested
// without touching Supabase, nodemailer, or the file system.
//
// Design notes:
//   • Reseller identity keyed on reseller_code (mirrors P11.17 for the same
//     reason — the digest email is read by ops who recognise codes not UUIDs
//     and the code is the natural join key against /admin/resellers/[code]).
//   • Union of reseller_codes across ALL snapshots in the window so a partner
//     present in only some weeks still surfaces — their absent weeks render
//     null-points and their delta is computed from the non-null bookends
//     (mirrors P11.20's null-anchor-skipping).
//   • Zero-delta rows are filtered by the formatter so a flat window stays
//     quiet even when the portfolio trend table shows every metric — mirrors
//     P11.17's aggressive filter (avoids duplicating rows already visible in
//     the parent P11.20 table above).
//   • Sorted by |delta| desc secondary reseller_code asc within each metric
//     so the biggest movers land first — mirrors P11.17 sort ordering.
//   • Cohort-velocity unrolls nested cohorts[] one level deeper per snapshot
//     via the shared readPerResellerTotals helper — mirrors P11.17 handling.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { readPerResellerTotals } from "./digest-snapshot-per-reseller-delta";
import type { DigestSnapshot, KnownKpiSection } from "./digest-snapshot";

/**
 * One time-series point per (metric × reseller_code × snapshot). total is
 * null when the section was skipped/absent on that snapshot OR the reseller
 * did not appear on that snapshot — surfacing the gap rather than silently
 * substituting a zero that would flatten the trend.
 */
export interface PerResellerTrendPoint {
  readonly captured_at: string;
  readonly week: string;
  readonly total: number | null;
}

/**
 * One (metric × reseller_code) trend across the N-snapshot window. first_total
 * and last_total skip null points so a leading/trailing skip or a partner who
 * joined mid-window still gets a meaningful delta from the first-to-last
 * observed value. delta is null when fewer than two non-null points exist.
 */
export interface PerResellerMetricTrend {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly reseller_code: string;
  readonly points: readonly PerResellerTrendPoint[];
  readonly first_total: number | null;
  readonly last_total: number | null;
  readonly delta: number | null;
  readonly min_total: number | null;
  readonly max_total: number | null;
}

export interface DigestSnapshotPerResellerRollingTrend {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly rows: readonly PerResellerMetricTrend[];
}

/**
 * Fold N snapshots (oldest → newest) into a per-(metric × reseller_code)
 * trend. Empty input yields an empty rows list. Non-array input coerces to
 * empty. A single-snapshot window still emits one point per row but every
 * delta stays null (need two non-null points) — the formatter suppresses that
 * case so a first-run cron does not spam a one-column table.
 *
 * HEADLINE_METRICS declared order is the outer loop; within each metric the
 * union of reseller_codes across every snapshot is the inner loop. Rows are
 * sorted by |delta| desc secondary reseller_code asc within each metric so
 * the biggest movers land first when the formatter renders.
 */
export function computeDigestSnapshotPerResellerRollingTrend(
  snapshots: readonly DigestSnapshot[],
): DigestSnapshotPerResellerRollingTrend {
  const snaps = Array.isArray(snapshots) ? snapshots : [];
  const first = snaps.length > 0 ? snaps[0] : null;
  const last = snaps.length > 0 ? snaps[snaps.length - 1] : null;

  const rows: PerResellerMetricTrend[] = [];

  for (const spec of HEADLINE_METRICS) {
    // One totals map per snapshot (null when the section is skipped/absent
    // on that snapshot — distinct from an empty map, which means the section
    // ran but had zero rows).
    const perSnapshotTotals: Array<Map<string, number> | null> = snaps.map(
      (snap) => {
        const env = (snap.envelope ?? {}) as Record<string, unknown>;
        return readPerResellerTotals(env, spec.key, spec.paths, spec.unit);
      },
    );

    // Union of reseller_codes across every snapshot's totals map so a partner
    // present in only some weeks still surfaces.
    const codes = new Set<string>();
    for (const m of perSnapshotTotals) {
      if (!m) continue;
      for (const c of m.keys()) codes.add(c);
    }

    const perMetric: PerResellerMetricTrend[] = [];
    for (const code of codes) {
      const points: PerResellerTrendPoint[] = snaps.map((snap, i) => {
        const totals = perSnapshotTotals[i];
        const total =
          totals && totals.has(code)
            ? (totals.get(code) as number)
            : null;
        return {
          captured_at: snap.captured_at,
          week: snap.week,
          total,
        };
      });
      const nonNull = points.filter(
        (p): p is PerResellerTrendPoint & { total: number } => p.total !== null,
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
      perMetric.push({
        key: spec.key,
        metric_name: spec.metric_name,
        unit: spec.unit,
        reseller_code: code,
        points,
        first_total: firstNonNull,
        last_total: lastNonNull,
        delta,
        min_total: min,
        max_total: max,
      });
    }

    perMetric.sort((a, b) => {
      const magA = a.delta === null ? -1 : Math.abs(a.delta);
      const magB = b.delta === null ? -1 : Math.abs(b.delta);
      if (magA !== magB) return magB - magA;
      return a.reseller_code.localeCompare(b.reseller_code);
    });

    rows.push(...perMetric);
  }

  return {
    window_size: snaps.length,
    first_week: first ? first.week : null,
    last_week: last ? last.week : null,
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

function formatCell(unit: HeadlineMetricUnit, n: number | null): string {
  if (n === null) return "&mdash;";
  if (unit === "cents" || unit === "signed_cents") return formatAud(n);
  return String(n);
}

function formatDeltaCell(unit: HeadlineMetricUnit, n: number | null): string {
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
 * Render an HTML table showing per-reseller trend for every (metric ×
 * reseller_code) whose first→last delta is non-zero. Returns empty string
 * when the window is a single snapshot (a one-point trend is meaningless —
 * the P11.17 per-reseller metric delta section already carries the current-
 * run per-partner readout) OR when no row has a non-zero delta (a flat
 * window stays quiet — the P11.20 portfolio trend table above already lists
 * every metric).
 *
 * Null-delta rows (partner appears in fewer than 2 snapshots after
 * skips/absence) still render so ops sees a partner that just started or
 * just churned rather than a silent omission.
 */
export function formatDigestSnapshotPerResellerRollingTrendSection(
  trend: DigestSnapshotPerResellerRollingTrend,
): string {
  if (trend.window_size < 2) return "";
  const changedRows = trend.rows.filter(
    (r) => r.delta === null || r.delta !== 0,
  );
  if (changedRows.length === 0) return "";

  const weekHeaders = trend.rows[0]?.points ?? [];
  const columnLabels = weekHeaders.map((p) => escapeHtml(p.week));
  const headerCells = columnLabels.map((label) => `<th>${label}</th>`).join("");

  const body = changedRows
    .map((r) => {
      const highlight = r.delta !== null && r.delta !== 0;
      const rowStyle = highlight ? ' style="background:#fff8e1"' : "";
      const cellHtml = r.points
        .map(
          (p) =>
            `<td style="text-align:right">${formatCell(r.unit, p.total)}</td>`,
        )
        .join("");
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td>${escapeHtml(r.reseller_code)}</td>${cellHtml}
        <td style="text-align:right">${formatDeltaCell(r.unit, r.delta)}</td>
      </tr>`;
    })
    .join("");

  const firstWeek = trend.first_week ? escapeHtml(trend.first_week) : "";
  const lastWeek = trend.last_week ? escapeHtml(trend.last_week) : "";

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest per-reseller rolling ${trend.window_size}-week trend (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner drill-down for the movers behind the portfolio-wide rolling trend table above. Only (metric &times; reseller) rows whose first &rarr; last delta is non-zero (or null due to a mid-window skip / started / stopped partner) render — a flat window stays quiet here even when the portfolio trend table shows every metric. Rows sorted by |delta| desc within each metric.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Reseller</th>${headerCells}
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
