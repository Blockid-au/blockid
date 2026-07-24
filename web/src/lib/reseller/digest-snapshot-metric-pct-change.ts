// Weekly digest snapshot per-metric percent-change delta (P11.37).
//
// P11.16 shipped `computeDigestSnapshotMetricDelta` — absolute cent/count
// deltas per headline metric. A +A$500 delta reads very differently on a
// $10 base (+5000%) versus a $1M base (+0.05%): the absolute magnitude alone
// buries early-warning signals (a fledgling partner doubling revenue at low
// scale) and inflates noise (a well-established partner drifting by a rounding
// error). This module lands the percent-change companion so the weekly digest
// can surface the two projections side-by-side: absolute cents for treasury
// reconciliation, percent change for trend triage.
//
// Pure-lib per the P11.14 / P11.16 pattern; cron wiring deferred to a
// follow-up tick (P11.38) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Reuses HEADLINE_METRICS + readSectionTotal from
//     digest-snapshot-metric-delta so the two tables cannot drift on which
//     row-level field they sum or how they walk the flat-vs-nested envelope.
//   • pct_change is null when previous_total is null OR 0 (division by zero
//     is ambiguous — "we started nothing and now have $500" is a launch, not
//     a percent change) OR current_total is null. Consumers see the gap
//     rather than a misleading Infinity/NaN.
//   • Signed_cents metrics can flip sign; a previous of -A$500 and current of
//     +A$500 renders as -200% (magnitude relative to |previous|) with sign
//     matching the current-total direction — the exec-summary reader gets
//     "regressed to a net positive worth 2× the prior loss magnitude" in one
//     glance without spreadsheeting the sign math.
//   • Rounded to one decimal (Math.round(pct * 10) / 10) — matches ops
//     convention for percent columns and keeps output stable under trivial
//     rounding noise between weeks.
//   • Sort in the rendered section by |pct_change| desc so the biggest
//     movers land first — highest-impact rows read top-down.
//   • Highlight rows whose |pct_change| ≥ 25% (amber) so the "material" band
//     visually pops without drowning the reader in every 0.1% blip.

import {
  HEADLINE_METRICS,
  readSectionTotal,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshot, KnownKpiSection } from "./digest-snapshot";

/** Threshold above which a percent-change row is amber-highlighted. */
export const PCT_CHANGE_MATERIAL_THRESHOLD = 25;

export interface HeadlineMetricPctChange {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly previous_total: number | null;
  readonly current_total: number | null;
  readonly pct_change: number | null;
}

export interface DigestSnapshotMetricPctChange {
  readonly previous_captured_at: string;
  readonly current_captured_at: string;
  readonly previous_week: string;
  readonly current_week: string;
  readonly metrics: readonly HeadlineMetricPctChange[];
}

/**
 * Compute signed percent change relative to |previous|. Returns null when
 * either side is null OR when previous is exactly 0 (the "started nothing"
 * case is a launch/first-week, not a percent change). Signed_cents metrics
 * that flip sign yield a percent whose sign tracks the delta direction.
 */
function computePctChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null) return null;
  if (previous === 0) return null;
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(raw * 10) / 10;
}

export function computeDigestSnapshotMetricPctChange(
  previous: DigestSnapshot,
  current: DigestSnapshot,
): DigestSnapshotMetricPctChange {
  const prevEnv = (previous.envelope ?? {}) as Record<string, unknown>;
  const currEnv = (current.envelope ?? {}) as Record<string, unknown>;
  const metrics: HeadlineMetricPctChange[] = HEADLINE_METRICS.map((spec) => {
    const previous_total = readSectionTotal(prevEnv, spec);
    const current_total = readSectionTotal(currEnv, spec);
    return {
      key: spec.key,
      metric_name: spec.metric_name,
      unit: spec.unit,
      previous_total,
      current_total,
      pct_change: computePctChange(previous_total, current_total),
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

function formatPctCell(pct: number | null): string {
  if (pct === null) return "&mdash;";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Render an HTML table sorted by |pct_change| desc so the biggest movers
 * lead. Returns "" when every metric row's pct_change is null (both sides
 * skipped, absent, or previous-total-zero) — a first-run digest stays quiet
 * on this section. Amber highlight fires when |pct_change| ≥
 * PCT_CHANGE_MATERIAL_THRESHOLD so the noise floor doesn't pull attention.
 */
export function formatDigestSnapshotMetricPctChangeSection(
  delta: DigestSnapshotMetricPctChange,
): string {
  const rankable = delta.metrics.filter((m) => m.pct_change !== null);
  if (rankable.length === 0) return "";

  const sorted = [...rankable].sort((a, b) => {
    const aAbs = Math.abs(a.pct_change ?? 0);
    const bAbs = Math.abs(b.pct_change ?? 0);
    if (bAbs !== aAbs) return bAbs - aAbs;
    return a.key.localeCompare(b.key);
  });

  const body = sorted
    .map((m) => {
      const material =
        m.pct_change !== null &&
        Math.abs(m.pct_change) >= PCT_CHANGE_MATERIAL_THRESHOLD;
      const rowStyle = material ? ' style="background:#fff8e1"' : "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(m.key)}</td>
        <td>${escapeHtml(m.metric_name)}</td>
        <td style="text-align:right">${formatPctCell(m.pct_change)}</td>
      </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest metric &Delta;% (${escapeHtml(delta.previous_week)} &rarr; ${escapeHtml(delta.current_week)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Signed percent change per headline metric, sorted by magnitude. Rows whose |&Delta;%| &ge; ${PCT_CHANGE_MATERIAL_THRESHOLD}% are highlighted. Metrics whose previous total was zero or missing render &mdash; so a launch week does not surface as a misleading +Infinity.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
          <th>&Delta;%</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
