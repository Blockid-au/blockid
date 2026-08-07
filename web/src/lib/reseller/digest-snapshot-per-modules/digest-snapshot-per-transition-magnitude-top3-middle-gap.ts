// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 MIDDLE GAP pure-lib (P11.159).
//
// Middle-of-pack complement to the P11.155 runner-up gap (leader-vs-#2) and
// the P11.157 tail gap (leader-vs-#N). Runner-up gap answers "how much
// daylight does #1 have over #2?" — the top-of-the-pack question. Tail gap
// answers "how much daylight does #1 have over the last entry?" — the
// leader-vs-tail question. This module answers "how much daylight does #2
// have over the last entry?" — the middle-of-pack question. Together the
// three integer gaps triangulate the shape of the full TOP-N ranked window
// without asking the reader to eyeball the array.
//
// Only meaningful when the (transition, band) cell has the full TOP-N pack
// (count === TOP_N); with fewer entries the runner-up gap already carries
// the same information (its top2 IS the top_last there), so this module
// returns null gap for count < TOP_N and labels the cell "partial".
//
// Ops case the middle gap closes: two (improved, medium) cells both compute
// tail_gap = 3 with a full 3-entry top list — one has top1_cells=4,
// top2_cells=3, top3_cells=1 (tail collapses, #1 and #2 both leave #3 far
// behind; middle_gap = 3 - 1 = 2), the other has top1_cells=4,
// top2_cells=1, top3_cells=1 (leader stands alone, #2 and #3 are tied at
// the bottom; middle_gap = 1 - 1 = 0). Tail gap reads 3 for both;
// middle gap reads 2 for the collapse case and 0 for the leader-outlier
// case. Reading them together names the leader-only vs pack-collapses
// shapes the tail gap alone leaves ambiguous.
//
// Uses TOP_N re-exported from the P11.149 leaderboard so the "full top-N"
// threshold cannot drift. Uses the same OUTLIER_GAP_MIN = 2 as P11.155 /
// P11.157 so the label vocabulary lines up across every gap-shape surface.
//
// Splice placement rule for P11.160 cron wiring: IMMEDIATELY BELOW the
// P11.157 TOP-3 tail gap section and IMMEDIATELY ABOVE the P11.139
// granular per-pair hot-cells table. Envelope entry
// snapshot_per_transition_magnitude_top3_middle_gap sits IMMEDIATELY
// AFTER snapshot_per_transition_magnitude_top3_tail_gap.

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
type MiddleGapLabel = "outlier" | "tight" | "flat" | "partial" | "empty";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Same cutoff as P11.155 / P11.157 so the outlier vs tight vocabulary lines
// up across every gap-shape surface. A middle-gap >= 2 cells means #2 has
// at least twice the smallest possible entry count over the tail entry.
const OUTLIER_GAP_MIN = 2;

export interface PerTransitionMagnitudeTop3MiddleGapBand {
  readonly partner_top2_cells: number | null;
  readonly partner_top_last_cells: number | null;
  readonly partner_middle_gap: number | null;
  readonly metric_top2_cells: number | null;
  readonly metric_top_last_cells: number | null;
  readonly metric_middle_gap: number | null;
  readonly partner_count: number;
  readonly metric_count: number;
}

export interface PerTransitionMagnitudeTop3MiddleGapBands {
  readonly small: PerTransitionMagnitudeTop3MiddleGapBand;
  readonly medium: PerTransitionMagnitudeTop3MiddleGapBand;
  readonly large: PerTransitionMagnitudeTop3MiddleGapBand;
}

export interface PerTransitionMagnitudeTop3MiddleGapEntry {
  readonly bands: PerTransitionMagnitudeTop3MiddleGapBands;
}

export interface PerTransitionMagnitudeTop3MiddleGapMap {
  readonly improved: PerTransitionMagnitudeTop3MiddleGapEntry;
  readonly degraded: PerTransitionMagnitudeTop3MiddleGapEntry;
  readonly rotated: PerTransitionMagnitudeTop3MiddleGapEntry;
  readonly undecidable: PerTransitionMagnitudeTop3MiddleGapEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3MiddleGap {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly outlier_gap_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3MiddleGapMap;
}

function middleFromEntries(
  cells: readonly number[],
): { top2: number | null; top_last: number | null; gap: number | null } {
  if (cells.length < 2) return { top2: null, top_last: null, gap: null };
  const top2 = cells[1]!;
  if (cells.length < TOP_N) return { top2, top_last: null, gap: null };
  const top_last = cells[cells.length - 1]!;
  return { top2, top_last, gap: top2 - top_last };
}

function foldBand(
  band: PerTransitionMagnitudeTop3LeaderboardBand,
): PerTransitionMagnitudeTop3MiddleGapBand {
  const partner = middleFromEntries(band.top_partners.map((p) => p.cells));
  const metric = middleFromEntries(band.top_metrics.map((m) => m.cells));
  return {
    partner_top2_cells: partner.top2,
    partner_top_last_cells: partner.top_last,
    partner_middle_gap: partner.gap,
    metric_top2_cells: metric.top2,
    metric_top_last_cells: metric.top_last,
    metric_middle_gap: metric.gap,
    partner_count: band.top_partners.length,
    metric_count: band.top_metrics.length,
  };
}

function foldTransition(
  entry: DigestSnapshotPerTransitionMagnitudeTop3Leaderboard["transitions"][TransitionBucketKey],
): PerTransitionMagnitudeTop3MiddleGapEntry {
  return {
    bands: {
      small: foldBand(entry.bands.small),
      medium: foldBand(entry.bands.medium),
      large: foldBand(entry.bands.large),
    },
  };
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3MiddleGap {
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

function labelForMiddle(
  gap: number | null,
  count: number,
  outlier_gap_min: number,
): MiddleGapLabel {
  if (count === 0) return "empty";
  if (count < TOP_N) return "partial";
  if (gap === 0) return "flat";
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

function renderMiddleCell(
  gap: number | null,
  top2: number | null,
  top_last: number | null,
  count: number,
  outlier_gap_min: number,
): string {
  if (count === 0) return "&mdash;";
  const label = labelForMiddle(gap, count, outlier_gap_min);
  if (gap === null || top2 === null) {
    if (top2 === null) return `&mdash; (${label})`;
    return `${top2} / &mdash; (${label})`;
  }
  return `${top2} / ${top_last} = +${gap} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3MiddleGap,
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
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMiddleCell(band.partner_middle_gap, band.partner_top2_cells, band.partner_top_last_cells, band.partner_count, outlier_gap_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMiddleCell(band.metric_middle_gap, band.metric_top2_cells, band.metric_top_last_cells, band.metric_count, outlier_gap_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} middle gap across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Absolute cell-count gap between the #2 entry and the last entry in the TOP-${snapshot.top_n} ranked list, i.e. top2 &minus; top${snapshot.top_n}. Only defined for cells with a full TOP-${snapshot.top_n} pack; smaller cells show &mdash; and the "partial" label (their shape is already covered by the runner-up gap surface). Reads as top2 / top${snapshot.top_n} = +gap. Labels: outlier = gap &ge; ${outlier_gap_min}, tight = gap in (0..${outlier_gap_min - 1}), flat = gap 0, partial = fewer than ${snapshot.top_n} entries. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Empty cells omitted from this table but stay on the JSONL envelope with gap null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner middle gap</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">metric middle gap</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
