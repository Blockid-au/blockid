// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 TIE COUNT pure-lib (P11.153).
//
// Absolute-count complement to the P11.151 concentration index. Concentration
// answers "how dominant is the #1 pick?" as a normalised scalar; this module
// answers "how many entries are tied at the top?" as an integer. Together the
// two surfaces disambiguate cases like partner_concentration_index=0.5 —
// which is 1/2 (2 partners with 1 cell each, no tie) vs 2/4 (2 partners tied
// at the top with a runner-up at 2 more cells). The concentration formula
// squashes both cases to 0.5; this module ships `partner_top1_tie_count=2`
// for the tied pair and `partner_top1_tie_count=1` for the clear leader.
//
// Folds the P11.149 top-3 leaderboard entries per cell and counts how many
// share the same `cells` count as the #1 entry. Range [0, TOP_N]. 0 when
// the cell is empty; 1 when a clear leader owns the #1 slot; 2 or 3 when
// the tie extends across the top-3 arrays.
//
// Splice placement rule for P11.154 cron wiring: IMMEDIATELY BELOW the
// P11.151 TOP-3 concentration section and IMMEDIATELY ABOVE the P11.139
// granular per-pair hot-cells table. Envelope entry
// snapshot_per_transition_magnitude_top3_tie_count sits IMMEDIATELY AFTER
// snapshot_per_transition_magnitude_top3_concentration.

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
type TieLabel = "clear" | "tied" | "empty";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

export interface PerTransitionMagnitudeTop3TieCountBand {
  readonly partner_top1_tie_count: number;
  readonly metric_top1_tie_count: number;
  readonly partner_top1_cells: number | null;
  readonly metric_top1_cells: number | null;
  readonly partner_count: number;
  readonly metric_count: number;
}

export interface PerTransitionMagnitudeTop3TieCountBands {
  readonly small: PerTransitionMagnitudeTop3TieCountBand;
  readonly medium: PerTransitionMagnitudeTop3TieCountBand;
  readonly large: PerTransitionMagnitudeTop3TieCountBand;
}

export interface PerTransitionMagnitudeTop3TieCountEntry {
  readonly bands: PerTransitionMagnitudeTop3TieCountBands;
}

export interface PerTransitionMagnitudeTop3TieCountMap {
  readonly improved: PerTransitionMagnitudeTop3TieCountEntry;
  readonly degraded: PerTransitionMagnitudeTop3TieCountEntry;
  readonly rotated: PerTransitionMagnitudeTop3TieCountEntry;
  readonly undecidable: PerTransitionMagnitudeTop3TieCountEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3TieCount {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3TieCountMap;
}

function tieCountFromEntries(cells: readonly number[]): number {
  if (cells.length === 0) return 0;
  const top1 = cells[0]!;
  let count = 1;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] === top1) count += 1;
    else break;
  }
  return count;
}

function foldBand(
  band: PerTransitionMagnitudeTop3LeaderboardBand,
): PerTransitionMagnitudeTop3TieCountBand {
  const partnerCells = band.top_partners.map((p) => p.cells);
  const metricCells = band.top_metrics.map((m) => m.cells);
  return {
    partner_top1_tie_count: tieCountFromEntries(partnerCells),
    metric_top1_tie_count: tieCountFromEntries(metricCells),
    partner_top1_cells: partnerCells.length > 0 ? partnerCells[0]! : null,
    metric_top1_cells: metricCells.length > 0 ? metricCells[0]! : null,
    partner_count: band.top_partners.length,
    metric_count: band.top_metrics.length,
  };
}

function foldTransition(
  entry: DigestSnapshotPerTransitionMagnitudeTop3Leaderboard["transitions"][TransitionBucketKey],
): PerTransitionMagnitudeTop3TieCountEntry {
  return {
    bands: {
      small: foldBand(entry.bands.small),
      medium: foldBand(entry.bands.medium),
      large: foldBand(entry.bands.large),
    },
  };
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3TieCount(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3TieCount {
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

function labelForTieCount(count: number): TieLabel {
  if (count === 0) return "empty";
  if (count === 1) return "clear";
  return "tied";
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

function renderCountCell(count: number, top1_cells: number | null): string {
  if (top1_cells === null) return "&mdash;";
  const label = labelForTieCount(count);
  return `${count} @ ${top1_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3TieCountSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3TieCount,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_count > 0 || band.metric_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCountCell(band.partner_top1_tie_count, band.partner_top1_cells)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCountCell(band.metric_top1_tie_count, band.metric_top1_cells)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} tie count across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Counts how many partners / KPIs share the #1 cell count inside each (transition, band) cell. Range [0, ${snapshot.top_n}]. Labels: clear = 1, tied &ge; 2. Reads as N @ C: N entries tied at C cells. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Empty cells omitted from this table but stay on the JSONL envelope with count 0.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner tie</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">metric tie</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
