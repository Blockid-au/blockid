// Weekly digest PER-TRANSITION MAGNITUDE DRILL-DOWN pure-lib (P11.145).
//
// The P11.143 / P11.144 pair opened the PER-TRANSITION drill-down surface
// over the P11.141 blended scalar summary — partitioning the P11.139
// per-pair hot-cells list BY transition and picking a per-bucket top-
// partner + top-KPI winner PER bucket. That answered 'WHICH partner and
// WHICH KPI own the loudest signal within each transition axis?' but did
// NOT answer 'HOW LOUD is the loud stuff INSIDE each transition — is the
// improved bucket dominated by cells that barely qualified, or by cells
// that jumped a huge distance?'.
//
// This module opens the MAGNITUDE drill-down complement to that per-
// transition partition. Within each of the four transition buckets, it
// further partitions the hot cells by hot_score MAGNITUDE BAND:
//   • small  — hot_score in [1, 2]   (just qualified / 1-2 rungs moved)
//   • medium — hot_score in [3, 5]   (meaningful movement)
//   • large  — hot_score >= 6        (dramatic multi-rung shift)
//
// Rotated + undecidable rows always carry hot_score = 1 by design (P11.139
// pins them to the baseline since the verdict axis flipped but the rank
// itself did not move a magnitude bucket, or the sample is insufficient to
// classify a direction). Those two buckets will therefore always have all
// their cells in the "small" band — that is the correct read: they are
// alert-worthy but low-magnitude by construction.
//
// The four transition buckets and three magnitude bands (12 (transition,
// band) cells total) always ship on the JSONL envelope regardless of
// whether any row actually falls into that combination — matches the
// P11.143 fixed-key {improved, degraded, rotated, undecidable} stability
// rule so a JSONL consumer joining bands by (transition, band) tuple
// across ticks always finds the complete set.
//
// Pure derivation of the P11.139 envelope — no new folds, no scorecard
// replay, no new inputs. A caller who wants the loudest INDIVIDUAL CELLS
// reads P11.139; the BLENDED SCALAR SUMMARY reads P11.141; the PER-
// TRANSITION DRILL-DOWN with per-bucket winners reads P11.143; the
// PER-TRANSITION MAGNITUDE DRILL-DOWN with per-band cell counts reads
// this module. The four surfaces stay strictly disjoint: this module
// never emits per-partner / per-KPI winners (those live on the P11.141
// blended summary and the P11.143 per-transition per-bucket picks) and
// never emits row-level hot-cell shape (that lives on the P11.139
// envelope).
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.141 → P11.142 / P11.143 → P11.144 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.146) so the per-
// (transition, band) shape can be exercised in isolation before touching
// the hot Monday cron path (already hosting four grains of scorecard +
// four grains of verdict + four grains of transition + four grains of
// transition distribution + cross-grain family-alerts executive summary +
// per-partner cross-metric ranking + per-metric cross-partner ranking +
// per-pair hot-cells granular ranking + per-pair hot-cells scalar summary
// + per-transition hot-cells drill-down).
//
// Design notes:
//   • Fixed-key `transitions` shape {improved, degraded, rotated,
//     undecidable} mirrors the P11.143 buckets shape so the two drill-
//     down surfaces align 1:1 by transition axis.
//   • Fixed-key `bands` shape {small, medium, large} within every
//     transition so a JSONL consumer joining bands by (transition, band)
//     always finds the complete 4x3 grid even in weeks where only one
//     (transition, band) combination fires.
//   • Every band carries {cells, sum_hot_score, max_hot_score}. Empty
//     bands carry zeros rather than being omitted — same stability
//     rationale as P11.143.
//   • Band cutoffs pinned as MAGNITUDE_SMALL_MAX = 2 (inclusive) and
//     MAGNITUDE_MEDIUM_MAX = 5 (inclusive), locked in the envelope as
//     `band_thresholds` so a JSONL consumer can render the caption
//     without hard-coding the numbers.
//   • Per-transition `total_cells` scalar equals the sum of the three
//     per-band `cells` scalars — invariant a partition MUST hold and
//     is unit-tested. Envelope-level `total_hot_cells` equals the sum
//     of the four `transitions[t].total_cells` scalars — same invariant
//     shared with P11.143's `total_hot_cells` scalar.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (nothing to drill into). Empty individual
//     (transition, band) cells are OMITTED from the visual table but STAY
//     on the JSONL envelope so a JSONL consumer never sees a truncated
//     set.

import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

export const MAGNITUDE_SMALL_MAX = 2;
export const MAGNITUDE_MEDIUM_MAX = 5;

export interface PerTransitionMagnitudeBand {
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionMagnitudeBands {
  readonly small: PerTransitionMagnitudeBand;
  readonly medium: PerTransitionMagnitudeBand;
  readonly large: PerTransitionMagnitudeBand;
}

export interface PerTransitionMagnitudeEntry {
  readonly total_cells: number;
  readonly bands: PerTransitionMagnitudeBands;
}

export interface PerTransitionMagnitudeMap {
  readonly improved: PerTransitionMagnitudeEntry;
  readonly degraded: PerTransitionMagnitudeEntry;
  readonly rotated: PerTransitionMagnitudeEntry;
  readonly undecidable: PerTransitionMagnitudeEntry;
}

export interface BandThresholds {
  readonly small_max: number;
  readonly medium_max: number;
}

export interface DigestSnapshotPerTransitionMagnitudeDrilldown {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeMap;
}

interface BandAggregator {
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface TransitionAggregator {
  total_cells: number;
  small: BandAggregator;
  medium: BandAggregator;
  large: BandAggregator;
}

function emptyBand(): BandAggregator {
  return { cells: 0, sum_hot_score: 0, max_hot_score: 0 };
}

function emptyTransition(): TransitionAggregator {
  return {
    total_cells: 0,
    small: emptyBand(),
    medium: emptyBand(),
    large: emptyBand(),
  };
}

function isTransitionKey(
  t: PerPairHotCellRow["transition"],
): t is TransitionBucketKey {
  return (
    t === "improved" || t === "degraded" || t === "rotated" || t === "undecidable"
  );
}

function bandForScore(score: number): MagnitudeBandKey {
  if (score <= MAGNITUDE_SMALL_MAX) return "small";
  if (score <= MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function finaliseBand(agg: BandAggregator): PerTransitionMagnitudeBand {
  return {
    cells: agg.cells,
    sum_hot_score: agg.sum_hot_score,
    max_hot_score: agg.max_hot_score,
  };
}

function finaliseTransition(agg: TransitionAggregator): PerTransitionMagnitudeEntry {
  return {
    total_cells: agg.total_cells,
    bands: {
      small: finaliseBand(agg.small),
      medium: finaliseBand(agg.medium),
      large: finaliseBand(agg.large),
    },
  };
}

/**
 * Partition the P11.139 per-pair hot-cells envelope by (transition, magnitude
 * band) and emit per-band cell counts + score aggregates. Complements the
 * P11.143 per-transition drill-down with a magnitude view so an ops reader
 * sees whether a loud transition bucket is loud because MANY cells barely
 * qualified or because a FEW cells jumped a huge distance.
 *
 * Band cutoffs: small [1..2], medium [3..5], large [>=6]. Rotated and
 * undecidable rows always land in the small band (hot_score = 1 by P11.139
 * design).
 */
export function computeDigestSnapshotPerTransitionMagnitudeDrilldown(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeDrilldown {
  const aggregators: Record<TransitionBucketKey, TransitionAggregator> = {
    improved: emptyTransition(),
    degraded: emptyTransition(),
    rotated: emptyTransition(),
    undecidable: emptyTransition(),
  };

  let total_hot_cells = 0;

  for (const r of hotCells.rows) {
    if (!isTransitionKey(r.transition)) continue;
    total_hot_cells += 1;

    const agg = aggregators[r.transition];
    agg.total_cells += 1;

    const bandKey = bandForScore(r.hot_score);
    const band = agg[bandKey];
    band.cells += 1;
    band.sum_hot_score += r.hot_score;
    if (r.hot_score > band.max_hot_score) band.max_hot_score = r.hot_score;
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    band_thresholds: {
      small_max: MAGNITUDE_SMALL_MAX,
      medium_max: MAGNITUDE_MEDIUM_MAX,
    },
    transitions: {
      improved: finaliseTransition(aggregators.improved),
      degraded: finaliseTransition(aggregators.degraded),
      rotated: finaliseTransition(aggregators.rotated),
      undecidable: finaliseTransition(aggregators.undecidable),
    },
  };
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

/**
 * Render the per-transition magnitude drill-down as a table: one row per
 * non-empty (transition, band) cell with cells / sum_hot_score /
 * max_hot_score scalars. Designed to splice IMMEDIATELY BELOW the P11.143
 * per-transition drill-down and IMMEDIATELY ABOVE the P11.139 granular
 * per-pair hot-cells table so the hierarchy descends per-transition
 * DRILL-DOWN (P11.143) → per-transition MAGNITUDE (P11.145) → per-pair
 * hot-cells GRANULAR (P11.139). Ops reads the per-transition winner
 * picks first, then the magnitude breakdown to see whether the winners
 * are loud from many small cells or a few large ones, then the granular
 * table for the specific cells.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells is
 * 0 (nothing to drill into — the P11.143 drill-down and P11.141 scalar
 * summary also suppress in this case so the whole hot-cells block
 * collapses).
 *
 * Empty (transition, band) cells are OMITTED from the visual table but
 * STAY on the JSONL envelope with zero scalars so a JSONL consumer never
 * sees a truncated set.
 */
export function formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeDrilldown,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => entry.bands[b].cells > 0).map((b) => {
      const cell = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${cell.cells}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${cell.sum_hot_score}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${cell.max_hot_score}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude drill-down across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Further partitions the ${snapshot.total_hot_cells} hot cells by magnitude band inside each transition so an ops reader sees whether a loud bucket is loud from MANY cells that barely qualified or a FEW cells that jumped a huge distance. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated and undecidable rows always land in the small band by P11.139 design. Empty (transition, band) cells omitted from this table but stay on the JSONL envelope with zero scalars.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">cells</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">sum hot_score</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">max hot_score</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
