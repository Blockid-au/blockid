// Weekly digest top-N movers headline (P11.24).
//
// P11.22 (tick 416) + P11.23 (tick 417) shipped the per-reseller rolling
// N-week trend that names every partner whose per-metric total moved across
// the window. The output is comprehensive — every (metric × reseller) with a
// non-zero delta lands in the drill-down table — but ops still has to scan
// the whole table to identify the biggest shifts. This tick lands the
// executive-summary counterpart: pick the top-N |delta| movers across ALL
// (metric × reseller) pairs and render a compact "headline" table at the top
// of the digest so the biggest shifts land above the fold.
//
// Pure-lib-first per the P11.14→P11.15 / P11.17→P11.18 / P11.20→P11.21 /
// P11.22→P11.23 pattern. Cron-route wiring is intentionally deferred to a
// follow-up tick (P11.25) so this shape can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly rather than
//     re-walking snapshots — mirrors the P11.16 → P11.20 reuse pattern where
//     the trend is the fold and this section is the projection. Guarantees
//     the top-movers headline can never diverge from the drill-down table it
//     summarises (a mover shown at the top must exist in the P11.22 table).
//   • Null-delta rows are excluded (partner appears in fewer than 2 non-null
//     points — cannot rank an unknown shift). Zero-delta rows are excluded
//     (a flat line is not a mover). Same posture as P11.22's changedRows
//     filter but stricter — the headline needs a ranked value.
//   • Absolute-value ranking so a -A$500 slide sits next to a +A$500 gain
//     rather than being buried at the opposite end of a signed sort. Tie-
//     break on reseller_code asc then key asc so the ordering is
//     deterministic when two movers share |delta|.
//   • DEFAULT_TOP_N = 5 — small enough to fit above the fold in the email
//     preview pane; matches the "top 5" convention already used by ops in
//     the founder-weekly-digest.
//   • Formatter returns "" when window_size < 2 (single-point windows have
//     no meaningful trend to rank), when the input rows list is empty, OR
//     when zero rows pass the null/zero-delta filter — keeps a first-run
//     cron quiet.

import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotPerResellerRollingTrend,
  PerResellerMetricTrend,
} from "./digest-snapshot-per-reseller-rolling-trend";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_TOP_N = 5;

export interface TopMoverRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly reseller_code: string;
  readonly first_total: number;
  readonly last_total: number;
  readonly delta: number;
  readonly abs_delta: number;
}

export interface DigestSnapshotTopMovers {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly top_n: number;
  readonly rows: readonly TopMoverRow[];
}

/**
 * Project a DigestSnapshotPerResellerRollingTrend down to its top-N |delta|
 * movers across every (metric × reseller_code) pair. Rows with null or zero
 * delta are excluded — they cannot be ranked (null) or are not movers (zero).
 *
 * Sort: |delta| desc, then reseller_code asc, then key asc. Deterministic
 * even when two movers share the same |delta| so the JSONL/HTML output is
 * byte-stable across identical inputs.
 *
 * topN < 1 coerces to DEFAULT_TOP_N. topN larger than the filtered row count
 * simply returns every non-null-non-zero row (no padding).
 */
export function computeDigestSnapshotTopMovers(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_TOP_N,
): DigestSnapshotTopMovers {
  const n = Number.isFinite(topN) && topN >= 1 ? Math.floor(topN) : DEFAULT_TOP_N;
  const source: readonly PerResellerMetricTrend[] = Array.isArray(trend?.rows)
    ? trend.rows
    : [];

  const ranked: TopMoverRow[] = [];
  for (const r of source) {
    if (r.delta === null || r.delta === 0) continue;
    if (r.first_total === null || r.last_total === null) continue;
    ranked.push({
      key: r.key,
      metric_name: r.metric_name,
      unit: r.unit,
      reseller_code: r.reseller_code,
      first_total: r.first_total,
      last_total: r.last_total,
      delta: r.delta,
      abs_delta: Math.abs(r.delta),
    });
  }

  ranked.sort((a, b) => {
    if (a.abs_delta !== b.abs_delta) return b.abs_delta - a.abs_delta;
    const codeCmp = a.reseller_code.localeCompare(b.reseller_code);
    if (codeCmp !== 0) return codeCmp;
    return a.key.localeCompare(b.key);
  });

  return {
    window_size: trend?.window_size ?? 0,
    first_week: trend?.first_week ?? null,
    last_week: trend?.last_week ?? null,
    top_n: n,
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
 * Render a compact HTML headline table showing the top-N |delta| movers
 * across every (metric × reseller_code) in the window. Rendered at the TOP
 * of the digest email as an above-the-fold executive summary before the
 * detailed drill-down tables further down.
 *
 * Returns "" when window_size < 2 (single-point window is meaningless),
 * when the input rows list is empty, OR when no row passes the null/zero
 * delta filter (a flat window stays quiet).
 */
export function formatDigestSnapshotTopMoversSection(
  headline: DigestSnapshotTopMovers,
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
        <td>${escapeHtml(r.reseller_code)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.first_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.last_total)}</td>
        <td style="text-align:right"><strong>${formatDeltaCell(r.unit, r.delta)}</strong></td>
      </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Top ${headline.rows.length} movers across the ${headline.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Executive summary of the biggest partner-metric shifts. Ranked by |first &rarr; last delta| across every (metric &times; reseller) tracked in the per-reseller rolling trend table below. Zero-delta and null-delta rows excluded — see the drill-down for the full list.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Metric</th>
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
