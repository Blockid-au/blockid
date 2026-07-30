// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 CONCENTRATION pure-lib (P11.151).
//
// The P11.149 / P11.150 pair opened the PER-(transition, band) TOP-3
// LEADERBOARD surface, naming the loudest 3 partners and loudest 3 KPIs
// inside each of the 12 (transition, band) cells. That answered
// 'WITHIN this cell, WHICH partners and KPIs own the loudest chunks?'
// but did NOT answer the follow-up an ops reader hits the moment the
// top-3 list has three entries: 'is the #1 pick a CLEAR OUTLIER (three
// partners at 6 / 2 / 1 cells — attribute to #1 immediately), or is it
// one of a NEAR-PEER PACK (three partners at 3 / 3 / 3 cells — need to
// poke all three)?'.
//
// This module folds the same P11.139 per-pair hot-cells envelope that
// P11.149 folds and emits TWO derived scalars per cell:
//
//   • partner_concentration_index — top1.cells / sum(top1..top3.cells),
//     rounded to 4 decimals. Range [0, 1]. Higher = the #1 partner
//     dominates the top-3; lower = the top-3 partners are near-peers.
//     null when the cell has zero partners.
//   • metric_concentration_index — same formula over top-3 metrics.
//     null when the cell has zero metrics.
//
// Plus TWO absolute-magnitude complements so a JSONL consumer can read
// concentration without normalising:
//
//   • partner_leader_delta_cells — top1.cells - top2.cells. null when
//     the cell has fewer than 2 partners.
//   • metric_leader_delta_cells — top1.cells - top2.cells. null when
//     the cell has fewer than 2 metrics.
//
// Reference concentration bands (formatter side, informative only —
// envelope carries the raw index):
//
//   • outlier — index >= 0.60 (the #1 pick owns 60%+ of the top-3
//     cells; ops escalates to that partner / KPI directly).
//   • dominant — 0.40 <= index < 0.60 (the #1 pick leads but the
//     runner-up is meaningful; ops names both).
//   • pack — index < 0.40 (the #1 pick is one of a pack; ops names all
//     three).
//
// The seven surfaces (P11.139 granular / P11.141 blended summary /
// P11.143 per-transition drill-down / P11.145 magnitude drill-down /
// P11.147 magnitude LEADERBOARD single-winner / P11.149 magnitude
// TOP-3 leaderboard / this module magnitude TOP-3 concentration) stay
// strictly disjoint at the envelope level. This module never emits
// row-level hot-cell shape (P11.139), per-band cell / sum / max
// scalars (P11.145), the single-winner picker itself (P11.147), or the
// ranked top-3 arrays (P11.149). It carries ONLY the derived per-cell
// concentration scalars so the JSONL envelope has no field duplication
// with any sibling surface.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.147 → P11.148 / P11.149 → P11.150 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.152) so the per-
// (transition, band) concentration shape can be exercised in isolation
// before touching the hot Monday cron path.
//
// Splice placement rule for P11.152: immediately BELOW
// perTransitionMagnitudeTop3LeaderboardSection AND immediately ABOVE
// perPairHotCellsSection so the hierarchy descends per-transition
// DRILL-DOWN (P11.143) → per-transition MAGNITUDE scalars (P11.145) →
// per-transition MAGNITUDE LEADERBOARD single-winner (P11.147) →
// per-transition MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-transition
// MAGNITUDE TOP-3 CONCENTRATION (P11.151) → per-pair hot-cells
// GRANULAR (P11.139) → per-pair scalar distribution (P11.130). Ops
// reads the top-3 ranked list first for the raw entries, then this
// concentration row for the outlier-vs-pack read, then the granular
// table for the individual cells.
//
// Envelope entry snapshot_per_transition_magnitude_top3_concentration
// will land IMMEDIATELY AFTER
// snapshot_per_transition_magnitude_top3_leaderboard and IMMEDIATELY
// BEFORE snapshot_per_pair_hot_cells so the seven per-pair-hot-cells
// envelope entries (blended scalar → per-transition drill-down →
// magnitude scalar drill-down → magnitude leaderboard single-winner →
// magnitude leaderboard TOP-3 → magnitude TOP-3 concentration →
// granular rows) stay adjacent and hierarchically ordered in the JSONL
// response body.
//
// Design notes:
//   • Fixed-key `transitions` shape {improved, degraded, rotated,
//     undecidable} mirrors P11.143 / P11.145 / P11.147 / P11.149.
//   • Fixed-key `bands` shape {small, medium, large} within every
//     transition mirrors P11.145 / P11.147 / P11.149.
//   • Empty (transition, band) cells emit
//     {partner_concentration_index: null, metric_concentration_index:
//     null, partner_leader_delta_cells: null,
//     metric_leader_delta_cells: null, partner_count: 0, metric_count:
//     0} rather than being omitted from the envelope.
//   • Band cutoffs pinned to MAGNITUDE_SMALL_MAX = 2 and
//     MAGNITUDE_MEDIUM_MAX = 5, re-exported from the P11.145 module so
//     all four magnitude surfaces (drill-down / single-winner
//     leaderboard / TOP-3 leaderboard / TOP-3 concentration) cannot
//     drift.
//   • TOP_N pinned to 3, re-exported from the P11.149 module so the
//     concentration denominator can never diverge from the ranked list.
//   • Concentration thresholds pinned as OUTLIER_THRESHOLD = 0.60 and
//     PACK_THRESHOLD = 0.40 so the formatter label taxonomy is stable
//     across ticks; envelope always carries the raw 4-decimal index.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (nothing to characterise). Empty
//     individual (transition, band) cells are OMITTED from the visual
//     table but STAY on the JSONL envelope with null indices.
//   • total_hot_cells scalar mirrors P11.145 / P11.147 / P11.149 for
//     parity across all four magnitude drill-down surfaces.

import type { DigestSnapshotPerPairHotCells } from "./digest-snapshot-per-pair-hot-cells";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
  TOP_N,
  type DigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
  type PerTransitionMagnitudeTop3LeaderboardBand,
} from "./digest-snapshot-per-transition-magnitude-top3-leaderboard";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
  type BandThresholds,
} from "./digest-snapshot-per-transition-magnitude-drilldown";

export { TOP_N };

export const OUTLIER_THRESHOLD = 0.6;
export const PACK_THRESHOLD = 0.4;

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";
type ConcentrationLabel = "outlier" | "dominant" | "pack" | "empty";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

export interface PerTransitionMagnitudeTop3ConcentrationBand {
  readonly partner_concentration_index: number | null;
  readonly metric_concentration_index: number | null;
  readonly partner_leader_delta_cells: number | null;
  readonly metric_leader_delta_cells: number | null;
  readonly partner_count: number;
  readonly metric_count: number;
}

export interface PerTransitionMagnitudeTop3ConcentrationBands {
  readonly small: PerTransitionMagnitudeTop3ConcentrationBand;
  readonly medium: PerTransitionMagnitudeTop3ConcentrationBand;
  readonly large: PerTransitionMagnitudeTop3ConcentrationBand;
}

export interface PerTransitionMagnitudeTop3ConcentrationEntry {
  readonly bands: PerTransitionMagnitudeTop3ConcentrationBands;
}

export interface PerTransitionMagnitudeTop3ConcentrationMap {
  readonly improved: PerTransitionMagnitudeTop3ConcentrationEntry;
  readonly degraded: PerTransitionMagnitudeTop3ConcentrationEntry;
  readonly rotated: PerTransitionMagnitudeTop3ConcentrationEntry;
  readonly undecidable: PerTransitionMagnitudeTop3ConcentrationEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3Concentration {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly outlier_threshold: number;
  readonly pack_threshold: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3ConcentrationMap;
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function concentrationFromEntries(
  cells: readonly number[],
): number | null {
  if (cells.length === 0) return null;
  let sum = 0;
  for (const c of cells) sum += c;
  if (sum <= 0) return null;
  const top1 = cells[0]!;
  return roundTo4(top1 / sum);
}

function leaderDeltaFromEntries(cells: readonly number[]): number | null {
  if (cells.length < 2) return null;
  return cells[0]! - cells[1]!;
}

function foldBand(
  band: PerTransitionMagnitudeTop3LeaderboardBand,
): PerTransitionMagnitudeTop3ConcentrationBand {
  const partnerCells = band.top_partners.map((p) => p.cells);
  const metricCells = band.top_metrics.map((m) => m.cells);
  return {
    partner_concentration_index: concentrationFromEntries(partnerCells),
    metric_concentration_index: concentrationFromEntries(metricCells),
    partner_leader_delta_cells: leaderDeltaFromEntries(partnerCells),
    metric_leader_delta_cells: leaderDeltaFromEntries(metricCells),
    partner_count: band.top_partners.length,
    metric_count: band.top_metrics.length,
  };
}

function foldTransition(
  entry: DigestSnapshotPerTransitionMagnitudeTop3Leaderboard["transitions"][TransitionBucketKey],
): PerTransitionMagnitudeTop3ConcentrationEntry {
  return {
    bands: {
      small: foldBand(entry.bands.small),
      medium: foldBand(entry.bands.medium),
      large: foldBand(entry.bands.large),
    },
  };
}

/**
 * Derive per-(transition, band) concentration scalars from the P11.149
 * top-3 leaderboard fold of the P11.139 per-pair hot-cells envelope.
 * Complements the P11.149 ranked list by adding a single-scalar
 * outlier-vs-pack read so an ops reader sees the shape of each cell's
 * top-3 without visually scanning the three entries.
 *
 * Empty (transition, band) cells emit null indices — the envelope
 * always ships the full 4×3 grid so a JSONL consumer never sees a
 * truncated set. Rotated + undecidable transitions ship null indices
 * in the medium + large bands since P11.139 caps their hot_score at 1.
 *
 * Concentration index = top1.cells / sum(top1..topN.cells), rounded
 * to 4 decimals. Range [0, 1] with 1 meaning the #1 pick owns the
 * entire top-3 (all peers vanished into ties broken by identity ASC
 * that fell outside the TOP_N cap, or fewer than N partners qualified).
 */
export function computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3Concentration {
  const top3 =
    computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(hotCells);
  return {
    window_size: top3.window_size,
    first_week: top3.first_week,
    last_week: top3.last_week,
    sustained_p90_threshold: top3.sustained_p90_threshold,
    threshold: top3.threshold,
    total_hot_cells: top3.total_hot_cells,
    top_n: top3.top_n,
    outlier_threshold: OUTLIER_THRESHOLD,
    pack_threshold: PACK_THRESHOLD,
    band_thresholds: {
      small_max: MAGNITUDE_SMALL_MAX,
      medium_max: MAGNITUDE_MEDIUM_MAX,
    },
    transitions: {
      improved: foldTransition(top3.transitions.improved),
      degraded: foldTransition(top3.transitions.degraded),
      rotated: foldTransition(top3.transitions.rotated),
      undecidable: foldTransition(top3.transitions.undecidable),
    },
  };
}

function labelForConcentration(
  index: number | null,
  outlier: number,
  pack: number,
): ConcentrationLabel {
  if (index === null) return "empty";
  if (index >= outlier) return "outlier";
  if (index < pack) return "pack";
  return "dominant";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transitionLabel(k: TransitionBucketKey): string {
  if (k === "improved") return "improved &uarr;";
  if (k === "degraded") return "degraded &darr;";
  if (k === "rotated") return "rotated &harr;";
  return "undecidable ?";
}

function bandRangeLabel(
  k: MagnitudeBandKey,
  small_max: number,
  medium_max: number,
): string {
  if (k === "small") return `small (1..${small_max})`;
  if (k === "medium") return `medium (${small_max + 1}..${medium_max})`;
  return `large (${medium_max + 1}+)`;
}

function renderIndexCell(
  index: number | null,
  label: ConcentrationLabel,
): string {
  if (index === null) return "&mdash;";
  return `${index.toFixed(4)} (${label})`;
}

function renderDeltaCell(delta: number | null): string {
  if (delta === null) return "&mdash;";
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

/**
 * Render the per-transition magnitude TOP-3 concentration as a table:
 * one row per non-empty (transition, band) cell listing the partner
 * concentration index + metric concentration index + leader-vs-#2
 * absolute cell deltas. Designed to splice IMMEDIATELY BELOW the
 * P11.149 TOP-3 leaderboard table and IMMEDIATELY ABOVE the P11.139
 * granular per-pair hot-cells table so the hierarchy descends
 * per-transition DRILL-DOWN (P11.143) → per-transition MAGNITUDE
 * scalars (P11.145) → per-transition MAGNITUDE LEADERBOARD single-
 * winner (P11.147) → per-transition MAGNITUDE TOP-3 LEADERBOARD
 * (P11.149) → per-transition MAGNITUDE TOP-3 CONCENTRATION (P11.151)
 * → per-pair hot-cells GRANULAR (P11.139).
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells
 * is 0 (nothing to characterise).
 *
 * Empty (transition, band) cells are OMITTED from the visual table but
 * STAY on the JSONL envelope with null indices.
 */
export function formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3Concentration,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const outlierPct = (snapshot.outlier_threshold * 100).toFixed(0);
  const packPct = (snapshot.pack_threshold * 100).toFixed(0);
  const { small_max, medium_max } = snapshot.band_thresholds;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_count > 0 || band.metric_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      const partnerLabel = labelForConcentration(
        band.partner_concentration_index,
        snapshot.outlier_threshold,
        snapshot.pack_threshold,
      );
      const metricLabel = labelForConcentration(
        band.metric_concentration_index,
        snapshot.outlier_threshold,
        snapshot.pack_threshold,
      );
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIndexCell(band.partner_concentration_index, partnerLabel)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderDeltaCell(band.partner_leader_delta_cells)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIndexCell(band.metric_concentration_index, metricLabel)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderDeltaCell(band.metric_leader_delta_cells)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} concentration across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Folds the P11.149 top-${snapshot.top_n} ranked list into a single-scalar outlier-vs-pack read for each (transition, band) cell. Index = top1.cells / sum(top1..top${snapshot.top_n}.cells). Labels: outlier &ge; ${outlierPct}%, dominant ${packPct}..${outlierPct}%, pack &lt; ${packPct}%. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Leader &Delta; = top1.cells &minus; top2.cells; &mdash; when fewer than 2 entries qualify. Empty (transition, band) cells omitted from this table but stay on the JSONL envelope with null indices.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner index</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner &Delta;</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">metric index</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">metric &Delta;</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
