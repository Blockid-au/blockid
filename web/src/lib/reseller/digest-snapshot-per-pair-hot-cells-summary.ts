// Weekly digest PER-PAIR HOT CELLS SUMMARY pure-lib (P11.141).
//
// The P11.139 / P11.140 pair opened the granular per-pair hot-cells surface:
// one row per individual alert-worthy (partner × KPI) cell ranked by
// `hot_score`. The Monday digest now carries the loudest cells first so ops
// can drill from the two cross-cut rankings (P11.135 per-partner + P11.137
// per-metric) straight into the specific cells driving both.
//
// This module opens the SCALAR ROLL-UP complement to that granular ranking.
// Rather than emitting one row per cell, it folds the whole hot-cells list
// into a single scalar-summary envelope: total cells, transitions bucketed,
// max / sum / mean hot_score, plus the single loudest partner and single
// loudest KPI. The output is the executive-summary lead an ops reader wants
// BEFORE scanning the granular table below — "17 hot cells this week,
// loudest partner ACME (5 cells / score 12), loudest KPI attributed_mrr
// (7 cells / score 15), split 8 improved / 6 degraded / 2 rotated / 1
// undecidable".
//
// Pure derivation of the P11.139 envelope — no new folds, no scorecard
// replay, no new inputs. A caller who wants the loudest INDIVIDUAL cells
// reads P11.139; the SCALAR SUMMARY of those cells reads this module. The
// two surfaces stay strictly disjoint: this module never emits row-level
// hot-cell shape (that lives on the P11.139 envelope) and the P11.139
// module never emits scalar aggregate counts (they live here).
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.139 → P11.140 cadence — cron-route wiring intentionally deferred to
// a follow-up tick (P11.142) so the summary envelope shape can be exercised
// in isolation before touching the hot Monday cron path (already hosting
// four grains of scorecard + four grains of verdict + four grains of
// transition + four grains of transition distribution + cross-grain family-
// alerts executive summary + per-partner cross-metric ranking + per-metric
// cross-partner ranking + per-pair hot-cells granular ranking).
//
// Design notes:
//   • Envelope-wide scalars: total_hot_cells + sum_hot_score + max_hot_score
//     + mean_hot_score (0 when rows empty; sum/count otherwise, no rounding
//     so a JSONL consumer can format to its own precision).
//   • by_transition: fixed-key {improved, degraded, rotated, undecidable}
//     counts so the JSONL envelope shape is stable regardless of which
//     transitions actually appear. stable + first_classification never
//     appear here (filtered upstream at P11.139 by isAlertWorthy).
//   • top_partner: single winner keyed by (cells DESC → sum_hot_score DESC →
//     reseller_code ASC) so ties across partners with the same cell count
//     favour the partner whose cells carry higher magnitude. Ties across
//     score favour the alphabetically-earlier reseller_code for stable
//     re-runs. null when rows empty. Payload: reseller_code + cells +
//     sum_hot_score + max_hot_score so ops sees at-a-glance whether the
//     top partner is loud from cell COUNT or from a single MAX cell.
//   • top_metric: single winner keyed by (cells DESC → sum_hot_score DESC →
//     key ASC) with the same rationale. Payload adds metric_name carried
//     through from the first row for that key (all rows for a given key
//     share the same metric_name since it flows from HEADLINE_METRICS).
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (no hot cells to summarise). The JSONL
//     envelope always ships regardless of formatter suppression so a JSONL
//     consumer never sees a truncated set.

import type { KnownKpiSection } from "./digest-snapshot";
import type { DigestSnapshotPerPairHotCells } from "./digest-snapshot-per-pair-hot-cells";

export interface PerPairHotCellsTransitionCounts {
  readonly improved: number;
  readonly degraded: number;
  readonly rotated: number;
  readonly undecidable: number;
}

export interface PerPairHotCellsTopPartner {
  readonly reseller_code: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerPairHotCellsTopMetric {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface DigestSnapshotPerPairHotCellsSummary {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
  readonly mean_hot_score: number;
  readonly by_transition: PerPairHotCellsTransitionCounts;
  readonly top_partner: PerPairHotCellsTopPartner | null;
  readonly top_metric: PerPairHotCellsTopMetric | null;
}

interface PartnerAgg {
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface MetricAgg {
  metric_name: string;
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

/**
 * Fold the P11.139 per-pair hot-cells envelope into a SCALAR SUMMARY:
 * total cells, transitions bucketed, sum / max / mean hot_score, plus the
 * single loudest partner and single loudest KPI. Complements the granular
 * ranking above with the executive-summary lead ops wants BEFORE scanning
 * the row table.
 *
 * Winner tie-break for top_partner and top_metric:
 *   cells DESC → sum_hot_score DESC → identity ASC.
 */
export function computeDigestSnapshotPerPairHotCellsSummary(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerPairHotCellsSummary {
  const by_transition_mut = {
    improved: 0,
    degraded: 0,
    rotated: 0,
    undecidable: 0,
  };

  const partnerMap = new Map<string, PartnerAgg>();
  const metricMap = new Map<KnownKpiSection, MetricAgg>();

  let total_hot_cells = 0;
  let sum_hot_score = 0;
  let max_hot_score = 0;

  for (const r of hotCells.rows) {
    total_hot_cells += 1;
    sum_hot_score += r.hot_score;
    if (r.hot_score > max_hot_score) max_hot_score = r.hot_score;

    if (
      r.transition === "improved" ||
      r.transition === "degraded" ||
      r.transition === "rotated" ||
      r.transition === "undecidable"
    ) {
      by_transition_mut[r.transition] += 1;
    }

    const partner = partnerMap.get(r.reseller_code) ?? {
      cells: 0,
      sum_hot_score: 0,
      max_hot_score: 0,
    };
    partner.cells += 1;
    partner.sum_hot_score += r.hot_score;
    if (r.hot_score > partner.max_hot_score) partner.max_hot_score = r.hot_score;
    partnerMap.set(r.reseller_code, partner);

    const metric = metricMap.get(r.key) ?? {
      metric_name: r.metric_name,
      cells: 0,
      sum_hot_score: 0,
      max_hot_score: 0,
    };
    metric.cells += 1;
    metric.sum_hot_score += r.hot_score;
    if (r.hot_score > metric.max_hot_score) metric.max_hot_score = r.hot_score;
    metricMap.set(r.key, metric);
  }

  const mean_hot_score = total_hot_cells === 0 ? 0 : sum_hot_score / total_hot_cells;

  let top_partner: PerPairHotCellsTopPartner | null = null;
  for (const [reseller_code, agg] of partnerMap) {
    if (top_partner === null) {
      top_partner = { reseller_code, ...agg };
      continue;
    }
    if (agg.cells > top_partner.cells) {
      top_partner = { reseller_code, ...agg };
      continue;
    }
    if (agg.cells === top_partner.cells) {
      if (agg.sum_hot_score > top_partner.sum_hot_score) {
        top_partner = { reseller_code, ...agg };
        continue;
      }
      if (
        agg.sum_hot_score === top_partner.sum_hot_score &&
        reseller_code < top_partner.reseller_code
      ) {
        top_partner = { reseller_code, ...agg };
      }
    }
  }

  let top_metric: PerPairHotCellsTopMetric | null = null;
  for (const [key, agg] of metricMap) {
    if (top_metric === null) {
      top_metric = { key, ...agg };
      continue;
    }
    if (agg.cells > top_metric.cells) {
      top_metric = { key, ...agg };
      continue;
    }
    if (agg.cells === top_metric.cells) {
      if (agg.sum_hot_score > top_metric.sum_hot_score) {
        top_metric = { key, ...agg };
        continue;
      }
      if (agg.sum_hot_score === top_metric.sum_hot_score && key < top_metric.key) {
        top_metric = { key, ...agg };
      }
    }
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    sum_hot_score,
    max_hot_score,
    mean_hot_score,
    by_transition: by_transition_mut,
    top_partner,
    top_metric,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the per-pair hot-cells SCALAR SUMMARY as an executive-summary
 * lead. Designed to splice IMMEDIATELY ABOVE the P11.139 granular
 * per-pair hot-cells table so ops sees the roll-up FIRST (total cells,
 * loudest partner, loudest KPI, transition mix) and then scans the
 * granular table below for the specific offending cells.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells
 * is 0 (nothing to summarise — the granular P11.139 table also
 * suppresses in this case so the whole hot-cells block collapses).
 */
export function formatDigestSnapshotPerPairHotCellsSummarySection(
  snapshot: DigestSnapshotPerPairHotCellsSummary,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const mean = snapshot.mean_hot_score.toFixed(2);

  const topPartnerHtml =
    snapshot.top_partner === null
      ? "&mdash;"
      : `<strong>${escapeHtml(snapshot.top_partner.reseller_code)}</strong> (${snapshot.top_partner.cells} cells, sum ${snapshot.top_partner.sum_hot_score}, max ${snapshot.top_partner.max_hot_score})`;

  const topMetricHtml =
    snapshot.top_metric === null
      ? "&mdash;"
      : `<strong>${escapeHtml(snapshot.top_metric.metric_name)}</strong> (${snapshot.top_metric.cells} cells, sum ${snapshot.top_metric.sum_hot_score}, max ${snapshot.top_metric.max_hot_score})`;

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-pair hot-cells summary across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar roll-up of the granular hot-cells ranking below. Ops reads the executive-summary lead first (total cells, loudest partner, loudest KPI, transition mix) then drills into the specific cells in the ranked table.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <tbody>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">Total hot cells</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right"><strong>${snapshot.total_hot_cells}</strong></td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">sum hot_score</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.sum_hot_score}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">max hot_score</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.max_hot_score}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">mean hot_score</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${mean}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">improved &uarr;</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.by_transition.improved}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">degraded &darr;</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.by_transition.degraded}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">rotated &harr;</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.by_transition.rotated}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">undecidable ?</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${snapshot.by_transition.undecidable}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">Loudest partner</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${topPartnerHtml}</td></tr>
        <tr><td style="padding:4px 8px;border-bottom:1px solid #eee">Loudest KPI</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${topMetricHtml}</td></tr>
      </tbody>
    </table>`;
}
