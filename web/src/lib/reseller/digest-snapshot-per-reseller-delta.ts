// Weekly digest snapshot per-reseller headline-metric delta (P11.17).
//
// P11.16 shipped the portfolio-wide per-metric delta at tick 410. Its output
// answers "did the portfolio move on cleared commissions this week?" but not
// "which partner drove that move?" — the aggregate row shows -A$500 while ops
// still has to open /admin/resellers/[code] per partner to find the offender.
//
// This module closes that drill-down gap. Given two persisted DigestSnapshot
// rows and the same HEADLINE_METRICS spec list P11.16 uses, it folds one
// per-reseller total per (metric × reseller_code) so the digest can render a
// small table that names the specific partners whose numeric contribution
// shifted. Consumers can align the two outputs row-by-row — the portfolio row
// for commission_cleared_mtd sums the per-reseller rows this module emits for
// the same metric.
//
// Pure-lib-first per the P11.14 → P11.15 (delta pure lib → cron wiring) and
// P11.16 (metric delta pure lib + cron wiring landed together) pattern. Kept
// dependency-free so the JSONL shape can be regression-tested without touching
// Supabase, nodemailer, or the file system.
//
// Design notes:
//   • Reseller identity keyed on reseller_code (present on every KPI-section
//     row across P11.1..P11.12) rather than reseller_id — the digest email is
//     read by ops who recognise codes (INFOVISION) not UUIDs.
//   • Cohort-velocity rows carry a nested cohorts[] array rather than a top-
//     level metric column, so the walker unrolls one level deeper for that
//     key. Matches the P11.16 special case.
//   • Reseller present in one snapshot but not the other → previous_total or
//     current_total is null (mirrors the null-when-either-side-skipped posture
//     of P11.16 so a new partner does not misreport as a 0→full jump).
//   • Formatter only renders reseller rows whose delta is non-zero — a
//     portfolio-wide flat week would otherwise produce a wall of A$0.00 rows.
//   • Sorted by |delta| desc within each metric so the largest movers land
//     first in the email.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshot, KnownKpiSection } from "./digest-snapshot";

export interface PerResellerMetricDeltaRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly reseller_code: string;
  readonly previous_total: number | null;
  readonly current_total: number | null;
  readonly total_delta: number | null;
}

export interface DigestSnapshotPerResellerDelta {
  readonly previous_captured_at: string;
  readonly current_captured_at: string;
  readonly previous_week: string;
  readonly current_week: string;
  readonly rows: readonly PerResellerMetricDeltaRow[];
}

function coerceMetric(unit: HeadlineMetricUnit, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (unit === "signed_cents") return Math.trunc(raw);
  if (raw < 0) return 0;
  return Math.floor(raw);
}

function readPath(row: unknown, path: readonly string[]): number | null {
  let cursor: unknown = row;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== "number" || !Number.isFinite(cursor)) return null;
  return cursor;
}

function readMetricValue(
  paths: readonly (readonly string[])[],
  unit: HeadlineMetricUnit,
  row: unknown,
): number {
  for (const p of paths) {
    const raw = readPath(row, p);
    if (raw !== null) return coerceMetric(unit, raw);
  }
  return 0;
}

function readResellerCode(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const code = (row as Record<string, unknown>).reseller_code;
  if (typeof code !== "string" || code.length === 0) return null;
  return code;
}

/**
 * Fold one section's rows[] into a map of reseller_code → per-reseller total.
 * Returns null when the section is missing, skipped, or its rows array is not
 * iterable — the caller propagates null so the delta row emits null on that
 * side rather than a misleading zero.
 *
 * Cohort-velocity is unrolled one level deeper (rows[].cohorts[]) so a
 * partner's per-reseller total sums every cohort month they own.
 *
 * Exported so the P11.22 per-reseller rolling-trend module can reuse the
 * identical shape-aware walker (cohort_velocity unroll + nested-vs-flat path
 * fallback + reseller_code guard) rather than duplicating it. Mirrors how
 * P11.20 reused readSectionTotal from P11.16.
 */
export function readPerResellerTotals(
  envelope: Record<string, unknown>,
  key: KnownKpiSection,
  paths: readonly (readonly string[])[],
  unit: HeadlineMetricUnit,
): Map<string, number> | null {
  const raw = envelope[key];
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.skipped_reason === "string" && rec.skipped_reason.length > 0) {
    return null;
  }
  const rows = rec.rows;
  if (!Array.isArray(rows)) return null;

  const totals = new Map<string, number>();

  if (key === "cohort_velocity") {
    for (const row of rows) {
      const code = readResellerCode(row);
      if (!code) continue;
      const cohorts = (row as Record<string, unknown>).cohorts;
      if (!Array.isArray(cohorts)) {
        if (!totals.has(code)) totals.set(code, 0);
        continue;
      }
      let sum = 0;
      for (const c of cohorts) sum += readMetricValue(paths, unit, c);
      totals.set(code, (totals.get(code) ?? 0) + sum);
    }
    return totals;
  }

  for (const row of rows) {
    const code = readResellerCode(row);
    if (!code) continue;
    const v = readMetricValue(paths, unit, row);
    totals.set(code, (totals.get(code) ?? 0) + v);
  }
  return totals;
}

/**
 * Diff the two snapshots per (metric × reseller_code). Rows are ordered by
 * (HEADLINE_METRICS declared order) → (|delta| desc, secondary reseller_code
 * asc) so ops sees the metric ladder in the same order as the portfolio table
 * and the largest movers first within each metric.
 *
 * When the previous side is null (section skipped/absent) OR the reseller is
 * absent from the previous side but present in the current side, previous_total
 * is null and total_delta is null. Same for the current side. This mirrors
 * P11.16's null-when-either-side-skipped posture so a new partner or a churned
 * partner shows up as a null-delta row rather than a phantom 0→full jump.
 */
export function computeDigestSnapshotPerResellerDelta(
  previous: DigestSnapshot,
  current: DigestSnapshot,
): DigestSnapshotPerResellerDelta {
  const prevEnv = (previous.envelope ?? {}) as Record<string, unknown>;
  const currEnv = (current.envelope ?? {}) as Record<string, unknown>;

  const rows: PerResellerMetricDeltaRow[] = [];

  for (const spec of HEADLINE_METRICS) {
    const prevTotals = readPerResellerTotals(
      prevEnv,
      spec.key,
      spec.paths,
      spec.unit,
    );
    const currTotals = readPerResellerTotals(
      currEnv,
      spec.key,
      spec.paths,
      spec.unit,
    );

    // Union of reseller_code across the two sides so a partner present in
    // exactly one snapshot still surfaces (as a started / stopped row).
    const codes = new Set<string>();
    if (prevTotals) for (const c of prevTotals.keys()) codes.add(c);
    if (currTotals) for (const c of currTotals.keys()) codes.add(c);

    const perMetric: PerResellerMetricDeltaRow[] = [];
    for (const code of codes) {
      const prevSide = prevTotals ? (prevTotals.get(code) ?? null) : null;
      const currSide = currTotals ? (currTotals.get(code) ?? null) : null;
      const prevIsNull = prevTotals === null || prevSide === null;
      const currIsNull = currTotals === null || currSide === null;
      const delta =
        prevIsNull || currIsNull ? null : (currSide as number) - (prevSide as number);
      perMetric.push({
        key: spec.key,
        metric_name: spec.metric_name,
        unit: spec.unit,
        reseller_code: code,
        previous_total: prevIsNull ? null : prevSide,
        current_total: currIsNull ? null : currSide,
        total_delta: delta,
      });
    }

    perMetric.sort((a, b) => {
      const magA = a.total_delta === null ? -1 : Math.abs(a.total_delta);
      const magB = b.total_delta === null ? -1 : Math.abs(b.total_delta);
      if (magA !== magB) return magB - magA;
      return a.reseller_code.localeCompare(b.reseller_code);
    });

    rows.push(...perMetric);
  }

  return {
    previous_captured_at: previous.captured_at,
    current_captured_at: current.captured_at,
    previous_week: previous.week,
    current_week: current.week,
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
 * Render an HTML table showing per-reseller drill-down for every metric whose
 * portfolio-wide delta is non-zero. Returns empty string when no row has a
 * non-zero delta — a genuine no-op week does not spam the digest email with
 * a wall of A$0.00 rows.
 *
 * Only non-zero-delta rows render (aggressive filter — the portfolio table
 * from P11.16 already lists every metric's total; this table is the drill-down
 * for the movers). Null-delta rows (started / stopped partner or upstream
 * skip) surface too so ops sees the shape rather than a phantom omission.
 */
export function formatDigestSnapshotPerResellerDeltaSection(
  delta: DigestSnapshotPerResellerDelta,
): string {
  const changedRows = delta.rows.filter(
    (r) => r.total_delta === null || r.total_delta !== 0,
  );
  if (changedRows.length === 0) return "";

  const body = changedRows
    .map((r) => {
      const highlight = r.total_delta !== null && r.total_delta !== 0;
      const rowStyle = highlight ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(r.key)}</td>
        <td>${escapeHtml(r.metric_name)}</td>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.previous_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.current_total)}</td>
        <td style="text-align:right">${formatDeltaCell(r.unit, r.total_delta)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest per-reseller metric delta (${escapeHtml(delta.previous_week)} &rarr; ${escapeHtml(delta.current_week)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-partner drill-down for the movers behind the portfolio-wide metric delta table above. Only rows whose delta is non-zero (or null due to a mid-run skip / started / stopped partner) render — a flat week stays quiet here even when the portfolio table shows every metric. Rows sorted by |delta| desc within each metric.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Reseller</th>
          <th>Was</th>
          <th>Now</th>
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
