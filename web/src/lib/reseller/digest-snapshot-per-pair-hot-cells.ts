// Weekly digest PER-PAIR HOT CELLS pure-lib (P11.139).
//
// The P11.135 / P11.136 pair opened the per-partner cross-metric ranking
// surface — one row per reseller_code aggregating that partner's KPI
// portfolio into the same ten-bucket distribution vocabulary the four
// grain-level distribution modules emit. The P11.137 / P11.138 pair added
// the dual per-metric cross-partner ranking — one row per KPI aggregating
// that metric's per-partner distribution the same way. Both surfaces
// answer 'WHICH partner / WHICH KPI owns the loudest signal?' but neither
// answers 'WHICH SPECIFIC (partner, KPI) CELLS drive both rankings?'
// without the reader manually cross-referencing the P11.123 pair-level
// row table.
//
// This module closes that granular gap. Rather than aggregating, it
// preserves the pair-level row granularity and ranks INDIVIDUAL alert-
// worthy cells by a `hot_score` scalar derived from |delta_rank|. Rows
// with transition in {improved, degraded, rotated, undecidable} qualify
// as alert-worthy; stable + first_classification rows never surface here
// (they already contribute to the per-partner / per-metric buckets above
// and repeating them one-cell-per-row would just be noise).
//
// The output is the (per-pair, granular) complement of the two cross-cut
// rankings: P11.135 answered 'PER PARTNER across the partner's KPI
// portfolio, how much changed by how much?'; P11.137 answered 'PER KPI
// across the roster of partners, how much changed by how much?'; this
// module answers 'WHICH INDIVIDUAL CELLS are the loudest specific
// (partner, KPI) alerts this week?'.
//
// Pure derivation of the P11.123 envelope — no new folds, no scorecard
// replay, no new inputs. A caller who wants the loudest partners reads
// P11.135; the loudest KPIs reads P11.137; the loudest INDIVIDUAL CELLS
// reads this module.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.137 → P11.138 cadence — cron-route wiring intentionally deferred
// to a follow-up tick (P11.140) so the per-pair hot-cell row shape can
// be exercised in isolation before touching the hot Monday cron path
// (already hosting four grains of scorecard + four grains of verdict +
// four grains of transition + four grains of transition distribution +
// cross-grain family-alerts executive summary + per-partner cross-metric
// ranking + per-metric cross-partner ranking).
//
// Design notes:
//   • Only alert-worthy rows surface. Alert-worthy = transition in
//     {improved, degraded, rotated, undecidable}. Stable +
//     first_classification never render — they already show up on the
//     per-partner / per-metric ranking summaries as bucket counts, and
//     repeating them one-row-per-cell would flood the digest.
//   • `hot_score` scalar per cell:
//       - improved / degraded: Math.abs(delta_rank) with floor of 1 so
//         a delta_rank of 0 (classified alert-worthy but sitting on the
//         boundary) still scores >0 and does not sort below rotated /
//         undecidable rows which get baseline 1.
//       - rotated: 1 (baseline — the verdict axis flipped but the rank
//         itself did not move a magnitude bucket).
//       - undecidable: 1 (baseline — insufficient sustained data to
//         classify a direction, but flagged as needing eyes).
//   • Row ordering: hot_score DESC (loudest cells first), then
//     delta_rank ASC (most-negative first so degraded cells lead ties
//     over improved cells at the same magnitude — a degraded_by_2 is a
//     louder ops signal than an improved_by_2 at the same score), then
//     reseller_code ASC, then key ASC for stable tie-break so re-runs on
//     the same input produce identical ordering.
//   • Rows carry the same shape fields the P11.123 pair-level table
//     already emits (reseller_code + key + metric_name + unit + transition
//     + from_verdict + to_verdict + delta_rank + summary) plus the new
//     hot_score scalar. A JSONL consumer joining rows by (reseller_code,
//     key) across ticks always finds the same field set on every row.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `rows.length === 0` (no alert-worthy cells to render). The JSONL
//     envelope always ships rows in ranked order regardless of formatter
//     suppression so a JSONL consumer never sees a truncated set.

import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";

type TransitionToken =
  PerResellerMetricPersistenceScorecardVerdictTransitionRow["transition"];

export interface PerPairHotCellRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly transition: TransitionToken;
  readonly from_verdict: PerResellerMetricPersistenceScorecardVerdictTransitionRow["from_verdict"];
  readonly to_verdict: PerResellerMetricPersistenceScorecardVerdictTransitionRow["to_verdict"];
  readonly delta_rank: number | null;
  readonly summary: string;
  readonly hot_score: number;
}

export interface DigestSnapshotPerPairHotCells {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerPairHotCellRow[];
}

function isAlertWorthy(transition: TransitionToken): boolean {
  return (
    transition === "improved" ||
    transition === "degraded" ||
    transition === "rotated" ||
    transition === "undecidable"
  );
}

function hotScore(
  transition: TransitionToken,
  delta_rank: number | null,
): number {
  if (transition === "improved" || transition === "degraded") {
    const magnitude = Math.abs(delta_rank ?? 0);
    return magnitude === 0 ? 1 : magnitude;
  }
  return 1;
}

/**
 * Fold the P11.123 per-(partner × metric) verdict-transition envelope
 * into a ROW-PER-CELL hot-cell ranking. Preserves the pair-level
 * granularity — one row per (reseller_code, KPI) — but filters to
 * alert-worthy transitions only and ranks by a hot_score scalar so ops
 * can triage the specific individual cells driving both cross-cut
 * rankings above.
 *
 * Rows are sorted hot_score DESC (loudest cells first), then delta_rank
 * ASC (most-negative first so degraded cells lead ties at the same
 * magnitude), then reseller_code ASC, then key ASC for stable tie-break.
 */
export function computeDigestSnapshotPerPairHotCells(
  transitions: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
): DigestSnapshotPerPairHotCells {
  const rows: PerPairHotCellRow[] = transitions.rows
    .filter((r) => isAlertWorthy(r.transition))
    .map((r) => ({
      reseller_code: r.reseller_code,
      key: r.key,
      metric_name: r.metric_name,
      unit: r.unit,
      transition: r.transition,
      from_verdict: r.from_verdict,
      to_verdict: r.to_verdict,
      delta_rank: r.delta_rank,
      summary: r.summary,
      hot_score: hotScore(r.transition, r.delta_rank),
    }));

  rows.sort((a, b) => {
    if (a.hot_score !== b.hot_score) return b.hot_score - a.hot_score;
    const aDelta = a.delta_rank ?? 0;
    const bDelta = b.delta_rank ?? 0;
    if (aDelta !== bDelta) return aDelta - bDelta;
    if (a.reseller_code !== b.reseller_code) {
      return a.reseller_code < b.reseller_code ? -1 : 1;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return {
    window_size: transitions.window_size,
    first_week: transitions.first_week,
    last_week: transitions.last_week,
    sustained_p90_threshold: transitions.sustained_p90_threshold,
    threshold: transitions.threshold,
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

function formatSignedDelta(delta_rank: number | null): string {
  if (delta_rank === null) return "—";
  if (delta_rank > 0) return `+${delta_rank}`;
  return String(delta_rank);
}

function transitionArrow(
  transition: TransitionToken,
  delta_rank: number | null,
): string {
  if (transition === "improved") return "&uarr;";
  if (transition === "degraded") return "&darr;";
  if (transition === "rotated") return "&harr;";
  if (transition === "undecidable") return "?";
  // stable + first_classification filtered upstream, defensive fallback:
  return delta_rank !== null && delta_rank > 0
    ? "&uarr;"
    : delta_rank !== null && delta_rank < 0
      ? "&darr;"
      : "&harr;";
}

/**
 * Render the per-pair hot-cells ranking as a granular table: one row per
 * individual alert-worthy (reseller × KPI) cell, ordered loudest first.
 * Designed to splice IMMEDIATELY BELOW the P11.137 per-metric cross-
 * partner ranking so the hierarchy descends pair-rows (P11.124) →
 * per-partner ranking (P11.135) → per-metric ranking (P11.137) →
 * per-pair hot cells (P11.139) → per-pair scalar distribution (P11.130).
 * The two cross-cut rankings sit adjacent; the granular hot-cell list
 * sits between them and the scalar distribution so ops can pivot from
 * 'loudest partners / loudest KPIs' straight into 'which specific cells
 * are driving both' without leaving the Monday email.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when the envelope has
 * zero alert-worthy rows (nothing to rank).
 */
export function formatDigestSnapshotPerPairHotCellsSection(
  snapshot: DigestSnapshotPerPairHotCells,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.rows.length === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);

  const rowsHtml = snapshot.rows
    .map((r) => {
      const arrow = transitionArrow(r.transition, r.delta_rank);
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>${escapeHtml(r.reseller_code)}</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(r.metric_name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(r.transition)} ${arrow}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatSignedDelta(r.delta_rank))}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.hot_score}</td></tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-pair hot cells across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Ranks INDIVIDUAL alert-worthy (partner &times; KPI) cells by <code>hot_score</code> so ops can drill from the two cross-cut rankings above straight into the specific cells driving them. <code>hot_score = |&Delta;rank|</code> for improved/degraded (floor 1); baseline 1 for rotated + undecidable. Rows sorted loudest first; degraded cells lead ties at the same magnitude. Stable + first_classification cells never render &mdash; they already contribute to the per-partner and per-metric bucket counts above.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">Partner</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">&Delta;rank</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">hot_score</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
