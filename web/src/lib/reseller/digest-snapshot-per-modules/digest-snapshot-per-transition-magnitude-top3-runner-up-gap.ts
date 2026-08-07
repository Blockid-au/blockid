// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 RUNNER-UP GAP pure-lib (P11.155).
//
// Absolute-gap complement to the P11.151 concentration index and the P11.153
// tie count. Concentration answers "how dominant is the #1 pick?" as a
// normalised scalar; tie count answers "how many entries are tied at the
// top?" as an integer; this module answers "how much daylight does the #1
// entry have over the #2 entry?" as an integer cell-count gap. Together the
// three scalars disambiguate outlier vs pack-of-peers shapes the leaderboard
// arrays alone leave to the reader.
//
// Ops case the runner-up gap closes: two cells both compute concentration
// ~0.6 and tie_count=1 — one has top1_cells=6, top2_cells=1 (huge gap, the
// #1 partner is a true outlier), the other has top1_cells=3, top2_cells=2
// (tight gap, the #1 partner is barely ahead of a pack). Concentration
// squashes both to a similar number; tie count reports 1 in both cases.
// This module ships partner_runner_up_gap = 5 for the outlier and
// partner_runner_up_gap = 1 for the tight case.
//
// Folds the P11.149 top-3 leaderboard entries per cell. Cells with 0
// entries emit gap=null + top1_cells=null + top2_cells=null. Cells with
// exactly 1 entry emit gap=null + top2_cells=null (no runner-up exists).
// Cells with 2+ entries emit gap = top1_cells - top2_cells (integer >= 0;
// zero when the top-2 are tied). By the P11.149 sort (cells DESC → sum
// DESC → identity ASC) the arrays are pre-sorted, so top1 = index 0 and
// top2 = index 1.
//
// Splice placement rule for P11.156 cron wiring: IMMEDIATELY BELOW the
// P11.153 TOP-3 tie count section and IMMEDIATELY ABOVE the P11.139
// granular per-pair hot-cells table. Envelope entry
// snapshot_per_transition_magnitude_top3_runner_up_gap sits IMMEDIATELY
// AFTER snapshot_per_transition_magnitude_top3_tie_count.

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

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";
type GapLabel = "outlier" | "tight" | "tied" | "solo" | "empty";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Cutoff for the outlier vs tight readout label. A gap of >=2 cells means
// the #1 entry has at least twice the smallest possible runner-up count,
// which the tie-count + concentration scalars alone would not surface.
const OUTLIER_GAP_MIN = 2;

export interface PerTransitionMagnitudeTop3RunnerUpGapBand {
  readonly partner_top1_cells: number | null;
  readonly partner_top2_cells: number | null;
  readonly partner_runner_up_gap: number | null;
  readonly metric_top1_cells: number | null;
  readonly metric_top2_cells: number | null;
  readonly metric_runner_up_gap: number | null;
  readonly partner_count: number;
  readonly metric_count: number;
}

export interface PerTransitionMagnitudeTop3RunnerUpGapBands {
  readonly small: PerTransitionMagnitudeTop3RunnerUpGapBand;
  readonly medium: PerTransitionMagnitudeTop3RunnerUpGapBand;
  readonly large: PerTransitionMagnitudeTop3RunnerUpGapBand;
}

export interface PerTransitionMagnitudeTop3RunnerUpGapEntry {
  readonly bands: PerTransitionMagnitudeTop3RunnerUpGapBands;
}

export interface PerTransitionMagnitudeTop3RunnerUpGapMap {
  readonly improved: PerTransitionMagnitudeTop3RunnerUpGapEntry;
  readonly degraded: PerTransitionMagnitudeTop3RunnerUpGapEntry;
  readonly rotated: PerTransitionMagnitudeTop3RunnerUpGapEntry;
  readonly undecidable: PerTransitionMagnitudeTop3RunnerUpGapEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly outlier_gap_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3RunnerUpGapMap;
}

function gapFromEntries(
  cells: readonly number[],
): { top1: number | null; top2: number | null; gap: number | null } {
  if (cells.length === 0) return { top1: null, top2: null, gap: null };
  if (cells.length === 1) return { top1: cells[0]!, top2: null, gap: null };
  const top1 = cells[0]!;
  const top2 = cells[1]!;
  return { top1, top2, gap: top1 - top2 };
}

function foldBand(
  band: PerTransitionMagnitudeTop3LeaderboardBand,
): PerTransitionMagnitudeTop3RunnerUpGapBand {
  const partner = gapFromEntries(band.top_partners.map((p) => p.cells));
  const metric = gapFromEntries(band.top_metrics.map((m) => m.cells));
  return {
    partner_top1_cells: partner.top1,
    partner_top2_cells: partner.top2,
    partner_runner_up_gap: partner.gap,
    metric_top1_cells: metric.top1,
    metric_top2_cells: metric.top2,
    metric_runner_up_gap: metric.gap,
    partner_count: band.top_partners.length,
    metric_count: band.top_metrics.length,
  };
}

function foldTransition(
  entry: DigestSnapshotPerTransitionMagnitudeTop3Leaderboard["transitions"][TransitionBucketKey],
): PerTransitionMagnitudeTop3RunnerUpGapEntry {
  return {
    bands: {
      small: foldBand(entry.bands.small),
      medium: foldBand(entry.bands.medium),
      large: foldBand(entry.bands.large),
    },
  };
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap {
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
    outlier_gap_min: OUTLIER_GAP_MIN,
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

function labelForGap(
  gap: number | null,
  count: number,
  outlier_gap_min: number,
): GapLabel {
  if (count === 0) return "empty";
  if (count === 1) return "solo";
  if (gap === 0) return "tied";
  if (gap !== null && gap >= outlier_gap_min) return "outlier";
  return "tight";
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

function renderGapCell(
  gap: number | null,
  top1: number | null,
  top2: number | null,
  count: number,
  outlier_gap_min: number,
): string {
  if (top1 === null) return "&mdash;";
  const label = labelForGap(gap, count, outlier_gap_min);
  if (gap === null) return `${top1} / &mdash; (${label})`;
  return `${top1} / ${top2} = +${gap} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGapSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { outlier_gap_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_count > 0 || band.metric_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGapCell(band.partner_runner_up_gap, band.partner_top1_cells, band.partner_top2_cells, band.partner_count, outlier_gap_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGapCell(band.metric_runner_up_gap, band.metric_top1_cells, band.metric_top2_cells, band.metric_count, outlier_gap_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} runner-up gap across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Absolute cell-count gap between the #1 and #2 entries inside each (transition, band) cell. Reads as top1 / top2 = +gap. Labels: outlier = gap &ge; ${outlier_gap_min}, tight = gap in (0..${outlier_gap_min - 1}), tied = gap 0, solo = no runner-up. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Empty cells omitted from this table but stay on the JSONL envelope with gap null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner gap</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">metric gap</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
