// Weekly digest snapshot per-metric numeric delta (P11.16).
//
// P11.14 shipped the structural per-section delta (present/skipped/absent +
// rows.length). Its docstring explicitly deferred per-metric numeric deltas:
//
//   "Per-metric numeric deltas (e.g. commission_cleared_mtd cents delta) can
//    be layered on top in future ticks — this module intentionally does NOT
//    try to do that here so the API stays stable when new KPI sections ship."
//
// This module closes that gap. Given two persisted DigestSnapshot rows (which
// hold the full response body per P11.13's route wiring — see route.ts:1427
// where `envelope: body` captures every row's numeric fields), it folds one
// headline metric per KPI section into a portfolio-wide total and reports the
// signed delta between the two runs.
//
// Scope is deliberately narrow — each section has its own row shape; picking
// one headline per section keeps the diff footprint stable when a section
// adds a new column (e.g. commission_cleared_mtd could add cleared_gst_cents
// alongside cleared_cents in a future tick without breaking this module).
//
// Kept dependency-free so the JSONL shape can be regression-tested without
// touching Supabase, nodemailer, or the file system — mirrors the pure-lib
// pattern used by digest-snapshot.ts (P11.13) and digest-snapshot-delta.ts
// (P11.14).

import {
  DIGEST_SNAPSHOT_KPI_SECTIONS,
  type DigestSnapshot,
  type KnownKpiSection,
} from "./digest-snapshot";

/**
 * One headline metric per KPI section. The metric_name is the row-level field
 * this module sums; unit tells the formatter how to render the totals (cents
 * → A$D.CC vs count → plain integer vs signed_cents → A$D.CC with leading
 * minus for negative net-contribution / net-gst rows).
 */
export type HeadlineMetricUnit = "count" | "cents" | "signed_cents";

interface HeadlineMetricSpec {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  /**
   * Ordered list of dot-paths to try when reading the metric off a row.
   * The persisted body publishes flat rows (e.g. `row.mrr_cents`) but the
   * in-memory current-side envelope carries the nested raw *Rows shape
   * (e.g. `row.mrr.mrr_cents`) at the moment the delta is computed — this
   * mismatch would otherwise leave the current-side total at 0 while the
   * previous-side (from disk) reads correctly. Listing both paths per spec
   * lets the diff be symmetrical regardless of which side is nested. First
   * path that resolves to a finite number wins.
   */
  readonly paths: readonly (readonly string[])[];
}

/**
 * Canonical headline-metric list. Order matches DIGEST_SNAPSHOT_KPI_SECTIONS
 * so the rendered table walks the same ladder as the P11.14 structural delta.
 * Each entry names the single row-level field this module sums to a portfolio
 * total. Adding a new KPI section to DIGEST_SNAPSHOT_KPI_SECTIONS without
 * appending a spec here surfaces as a missing-metric row in the output rather
 * than a silent drop — see the "spec-list covers every KPI section" test.
 */
export const HEADLINE_METRICS: readonly HeadlineMetricSpec[] = [
  {
    key: "budget_utilization",
    metric_name: "grant_used",
    unit: "count",
    paths: [["grant_used"], ["utilization", "grant_used"]],
  },
  {
    key: "tier_mix",
    metric_name: "total",
    unit: "count",
    paths: [["total"], ["mix", "total"]],
  },
  {
    key: "commission_cleared_mtd",
    metric_name: "cleared_cents",
    unit: "cents",
    paths: [["cleared_cents"], ["mtd", "cleared_cents"]],
  },
  {
    key: "clawback_exposure",
    metric_name: "total_cents",
    unit: "cents",
    paths: [["total_cents"], ["exposure", "total_cents"]],
  },
  {
    key: "attributed_mrr",
    metric_name: "mrr_cents",
    unit: "cents",
    paths: [["mrr_cents"], ["mrr", "mrr_cents"]],
  },
  {
    key: "attributed_net_contribution",
    metric_name: "net_contribution_cents",
    unit: "signed_cents",
    paths: [
      ["net_contribution_cents"],
      ["net", "net_contribution_cents"],
    ],
  },
  {
    key: "attributed_churn_30d",
    metric_name: "churned_count",
    unit: "count",
    paths: [["churned_count"], ["churn", "churned_count"]],
  },
  {
    key: "ledger_drift_events",
    metric_name: "total_drift_count",
    unit: "count",
    paths: [["total_drift_count"], ["drift", "total_drift_count"]],
  },
  {
    key: "gst_reconciliation_delta",
    metric_name: "net_gst_cents",
    unit: "signed_cents",
    paths: [["net_gst_cents"], ["delta", "net_gst_cents"]],
  },
  {
    key: "cohort_velocity",
    metric_name: "activated_count",
    unit: "count",
    paths: [["activated_count"]],
  },
  {
    key: "ltv_cac_per_reseller",
    metric_name: "lifetime_revenue_cents",
    unit: "cents",
    paths: [["lifetime_revenue_cents"], ["ltv_cac", "lifetime_revenue_cents"]],
  },
  {
    key: "sandbox_share_of_budget",
    metric_name: "sandbox_credits_used",
    unit: "count",
    paths: [["sandbox_credits_used"], ["share", "sandbox_credits_used"]],
  },
];

/**
 * One row in the per-metric delta output. `previous_total` / `current_total`
 * are null when that snapshot's section was skipped or absent (no rows to
 * sum). `total_delta` is null when either side is null so ops sees the gap
 * rather than a misleading "we went from 0 to 500" jump caused by a skipped
 * previous run.
 */
export interface HeadlineMetricDelta {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly previous_total: number | null;
  readonly current_total: number | null;
  readonly total_delta: number | null;
}

export interface DigestSnapshotMetricDelta {
  readonly previous_captured_at: string;
  readonly current_captured_at: string;
  readonly previous_week: string;
  readonly current_week: string;
  readonly metrics: readonly HeadlineMetricDelta[];
}

/**
 * For signed_cents metrics negative values are allowed (a loss-leader partner
 * can have net_contribution_cents < 0). For count/cents metrics the row's
 * value must be a finite non-negative integer to count toward the sum —
 * garbled cells contribute 0 rather than NaN-poisoning the total.
 */
function coerceMetric(unit: HeadlineMetricUnit, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (unit === "signed_cents") return Math.trunc(raw);
  if (raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * Walk one path (e.g. ["mrr", "mrr_cents"]) on a row and return the leaf if
 * it's a number, else null. Non-object intermediate keys short-circuit to
 * null so a partial nested shape (e.g. row.mrr = null) does not throw.
 */
function readPath(row: unknown, path: readonly string[]): number | null {
  let cursor: unknown = row;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== "number" || !Number.isFinite(cursor)) return null;
  return cursor;
}

/**
 * Try each spec.paths entry in order and return the first finite number
 * found, else 0. For signed_cents units, negative numbers are allowed; for
 * cents/count units, negative numbers coerce to 0 via coerceMetric so a
 * garbled row cannot deflate the portfolio total.
 */
function readMetric(spec: HeadlineMetricSpec, row: unknown): number {
  for (const path of spec.paths) {
    const raw = readPath(row, path);
    if (raw !== null) return coerceMetric(spec.unit, raw);
  }
  return 0;
}

/**
 * Read the total for one section. Returns null when the section is missing,
 * skipped, or its rows array is not iterable. When present, sums the named
 * row-level field across every row.
 *
 * Special case for cohort_velocity — its rows carry a nested `cohorts` array
 * rather than a top-level metric column, so this walker unrolls one level
 * deeper for that key. Adding another nested-shape section in the future
 * would need a similar unroll case.
 */
/**
 * Read the total for one HEADLINE_METRICS section against a raw envelope
 * (the persisted digest body). Exported so downstream trend modules (P11.20)
 * can reuse the identical shape-aware walker rather than duplicating the
 * cohort-velocity unroll + nested-vs-flat path fallback that make the delta
 * output symmetric across disk/in-memory shapes. Returns null when the
 * section is missing/skipped/non-array; a finite non-negative sum otherwise
 * (signed_cents metrics may return negative totals — net-contribution can be
 * legitimately negative for a loss-leader partner).
 */
export function readSectionTotal(
  envelope: Record<string, unknown>,
  spec: HeadlineMetricSpec,
): number | null {
  const raw = envelope[spec.key];
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec.skipped_reason === "string" &&
    rec.skipped_reason.length > 0
  ) {
    return null;
  }
  const rows = rec.rows;
  if (!Array.isArray(rows)) return null;

  if (spec.key === "cohort_velocity") {
    let sum = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const cohorts = (row as Record<string, unknown>).cohorts;
      if (!Array.isArray(cohorts)) continue;
      for (const c of cohorts) sum += readMetric(spec, c);
    }
    return sum;
  }

  let sum = 0;
  for (const row of rows) sum += readMetric(spec, row);
  return sum;
}

/**
 * Diff the two snapshots' per-metric totals. Order matches HEADLINE_METRICS,
 * which in turn matches DIGEST_SNAPSHOT_KPI_SECTIONS, so consumers can align
 * the P11.14 structural delta and the P11.16 numeric delta row-by-row.
 */
export function computeDigestSnapshotMetricDelta(
  previous: DigestSnapshot,
  current: DigestSnapshot,
): DigestSnapshotMetricDelta {
  const prevEnv = (previous.envelope ?? {}) as Record<string, unknown>;
  const currEnv = (current.envelope ?? {}) as Record<string, unknown>;
  const metrics: HeadlineMetricDelta[] = HEADLINE_METRICS.map((spec) => {
    const prevTotal = readSectionTotal(prevEnv, spec);
    const currTotal = readSectionTotal(currEnv, spec);
    const delta =
      prevTotal === null || currTotal === null ? null : currTotal - prevTotal;
    return {
      key: spec.key,
      metric_name: spec.metric_name,
      unit: spec.unit,
      previous_total: prevTotal,
      current_total: currTotal,
      total_delta: delta,
    };
  });
  return {
    previous_captured_at: previous.captured_at,
    current_captured_at: current.captured_at,
    previous_week: previous.week,
    current_week: current.week,
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
 * Render an HTML table summarising the per-metric portfolio-wide delta.
 * Returns an empty string when every metric's delta is null (both snapshots
 * fully skipped or absent) OR when every non-null delta is zero — a genuine
 * no-op week does not spam the digest email. Otherwise every metric row
 * renders (not just the changed ones) with amber-highlight on rows whose
 * delta is non-zero so ops can eyeball the full ladder.
 */
export function formatDigestSnapshotMetricDeltaSection(
  delta: DigestSnapshotMetricDelta,
): string {
  const anyNonZeroDelta = delta.metrics.some(
    (m) => m.total_delta !== null && m.total_delta !== 0,
  );
  const anyPresent = delta.metrics.some(
    (m) => m.previous_total !== null || m.current_total !== null,
  );
  if (!anyNonZeroDelta && !anyPresent) return "";
  if (!anyNonZeroDelta) return "";

  const body = delta.metrics
    .map((m) => {
      const highlight = m.total_delta !== null && m.total_delta !== 0;
      const rowStyle = highlight ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(m.key)}</td>
        <td>${escapeHtml(m.metric_name)}</td>
        <td style="text-align:right">${formatCell(m.unit, m.previous_total)}</td>
        <td style="text-align:right">${formatCell(m.unit, m.current_total)}</td>
        <td style="text-align:right">${formatDeltaCell(m.unit, m.total_delta)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest metric delta (${escapeHtml(delta.previous_week)} &rarr; ${escapeHtml(delta.current_week)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Portfolio-wide totals per headline metric. Rows whose delta is non-zero are highlighted. Skipped or absent sections render &mdash; on both sides so a mid-run gap is visible rather than being reported as a misleading zero-to-full jump.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>Was</th>
          <th>Now</th>
          <th>&Delta;</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}

/**
 * Assert HEADLINE_METRICS covers every KnownKpiSection. Called at module load
 * only in tests (importing this function from route.ts would drag it into the
 * hot path). Returns the missing keys so a future section addition surfaces
 * as a test failure rather than a silent output drop.
 */
export function findMissingHeadlineMetricKeys(): readonly KnownKpiSection[] {
  const covered = new Set<KnownKpiSection>(HEADLINE_METRICS.map((s) => s.key));
  return DIGEST_SNAPSHOT_KPI_SECTIONS.filter((k) => !covered.has(k));
}
