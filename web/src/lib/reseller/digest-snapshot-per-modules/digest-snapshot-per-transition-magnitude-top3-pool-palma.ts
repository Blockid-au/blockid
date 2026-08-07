// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PALMA RATIO
// pure-lib (P11.230).
//
// TOP-DECILE-OVER-BOTTOM-4-DECILES concentration ratio over the
// P11.161 pool. Folds the sorted-ascending cell-count vector into ONE
// unbounded concentration read on [0, +Inf):
//
//   palma = sum_top10 / sum_bottom40
//
// where sum_top10 is the total cell count contributed by the largest
// 10% of pool cells (rounded to nearest, min 1) and sum_bottom40 is
// the total cell count contributed by the smallest 40% of pool cells
// (rounded to nearest, min 1). Middle 50% intentionally IGNORED.
//
// Named after Jose Gabriel Palma (Palma 2011 "Homogeneous middles vs
// heterogeneous tails, and the end of the 'Inverted-U': the share of
// the rich is what it's all about") who observed that in cross-country
// income inequality data the MIDDLE 50% share is remarkably stable
// (~50% almost everywhere), so inequality is almost entirely captured
// by the ratio of the tails — the top 10% share vs the bottom 40%
// share. Ignoring the middle 50% gives a much sharper concentration
// read than the whole-pool P11.169 Gini + P11.171 Theil + P11.173
// Atkinson surfaces which weight every cell.
//
// Complements the existing CONCENTRATION-axis surfaces:
//
//   • P11.165 TOP-1 SHARE          — share of the SINGLE largest cell.
//                                    Sensitive to single-outlier pools;
//                                    ignores the shape of the rest of
//                                    the pool.
//   • P11.167 TOP-2 SHARE          — share of the TWO largest cells.
//                                    Slightly more robust than TOP-1
//                                    but still ignores the bottom tail.
//   • P11.179 BOTTOM-1 SHARE       — mirror of TOP-1 on the smallest
//                                    cell.
//   • P11.183 BOTTOM-2 SHARE       — mirror of TOP-2 on the smallest
//                                    two cells.
//   • P11.185 TOP1/BOTTOM1 RATIO   — single-cell extreme ratio.
//                                    Sensitive to double-outlier pools.
//   • P11.187 TOP2/BOTTOM2 RATIO   — two-cell tail ratio. Robust to
//                                    single-outlier pools but still
//                                    only reads the extreme cells.
//   • P11.169 GINI                 — whole-pool Lorenz-curve area.
//                                    Reads the ENTIRE distribution but
//                                    weights the middle 50% heavily.
//   • P11.171 THEIL / P11.173      — whole-pool entropy-based
//     ATKINSON                       inequality measures. Ditto.
//
// Palma sits between the extreme-cell family (TOP-1/2 + BOTTOM-1/2 +
// their ratios — captures the very tips of the tails) and the whole-
// pool inequality family (Gini/Theil/Atkinson — reads every cell):
//
//   • Extreme-cell surfaces read WHERE THE TIPS ARE.
//   • Palma reads WHERE THE TAILS ARE (top 10% vs bottom 40%).
//   • Whole-pool surfaces read HOW THE WHOLE POOL IS SHAPED.
//
// Reading the trio side-by-side lets ops distinguish concentration
// signals by their SPATIAL LOCUS in the pool:
//
//   • TOP-1 large, Palma modest, Gini modest → single-outlier only
//     (one whale, otherwise balanced middle+tail).
//   • TOP-1 modest, Palma large, Gini large → structural tail
//     concentration (top 10% carries meaningfully more mass than
//     bottom 40%, without one single cell dominating).
//   • TOP-1 modest, Palma modest, Gini large → interior redistribution
//     driven by mid-pool heterogeneity (the P11.189 mid-mass-share
//     surface reads this too).
//
// This is the CONCENTRATION-axis analogue of the way the DISPERSION
// axis reads {whole-pool CV, interior-quartile QCD, endpoint COR}
// as three complementary surfaces spanning SCOPE × ROBUSTNESS.
//
// Well-defined for every pool with pool_count >= 10 and bottom40 mass
// > 0:
//   • pool_count 0             → palma null, tails null (empty pool).
//   • pool_count in [1, 9]     → palma null, tails null. Distinct
//                                "small_pool" label. Floor of 10
//                                matches the classical Palma
//                                construction (needs at least 10
//                                partners for top10 = 1 partner AND
//                                bottom40 = 4 partners AND
//                                middle 50 = 5 partners to be
//                                non-overlapping and each populated).
//                                Below 10 the top10 and bottom40
//                                slices overlap or collapse to the
//                                same single cell, defeating the
//                                surface's purpose. Matches the
//                                P11.228 Kelly floor of 10 for the
//                                same "at least one rank per decile"
//                                logic.
//   • pool_count >= 10 and     → palma null, tails recorded. Distinct
//     bottom40_cells == 0        "degenerate" label. Cannot happen
//                                for count integers >= 1 in the
//                                partner/metric maps by construction
//                                (ingest only increments existing
//                                partners), but guarded for future
//                                upstream robustness.
//   • pool_count >= 10 and     → palma = sum_top10 / sum_bottom40;
//     bottom40_cells > 0         rounded to 4 decimals.
//
// Reference distributions (n = 10):
//   • flat [k,k,...,k]         → sum_top10 = k, sum_bottom40 = 4k,
//                                palma = 0.25 (perfectly egalitarian
//                                — bottom 40% has 4x more mass than
//                                top 10% simply because it has 4x
//                                more partners).
//   • uniform ramp [1..10]     → sum_top10 = 10, sum_bottom40 =
//                                1+2+3+4 = 10, palma = 1.0 (balanced
//                                — top decile matches bottom four
//                                deciles by mass).
//   • single upper-outlier     → sum_top10 = 100, sum_bottom40 = 4,
//     [1,1,1,1,1,1,1,1,1,100]    palma = 25.0 (highly_concentrated —
//                                one whale dominates entirely).
//   • single lower-outlier     → sum_top10 = 10, sum_bottom40 =
//     [1,10,10,10,10,10,10,      1+10+10+10 = 31, palma ~0.32
//     10,10,10]                  (egalitarian — the lower outlier
//                                pulls sum_bottom40 up).
//
// Cutoffs anchor on the flat reference 0.25 and balanced reference
// 1.0 with bands widening geometrically:
//   • empty              pool_count == 0
//   • small_pool         pool_count in [1, 9]
//   • degenerate         bottom40_cells == 0 (guarded but unreachable)
//   • egalitarian        palma < 0.5 (bottom 40% mass > 2x top 10%)
//   • balanced           palma in [0.5, 1.5) (uniform-ramp regime)
//   • concentrated       palma in [1.5, 3.0) (top 10% has 1.5-3x
//                        the mass of the bottom 40%)
//   • highly_concentrated palma >= 3.0 (top 10% dominates)
// All cutoffs exposed on the envelope as egalitarian_palma_max /
// concentrated_palma_min / highly_concentrated_palma_min so
// downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// SLICE COUNT CONVENTION. Uses round-to-nearest with min 1 so the
// slicing degrades gracefully at the pool_count boundary:
//   top10_count    = max(1, round(pool_count * 0.10))
//   bottom40_count = max(1, round(pool_count * 0.40))
// At pool_count = 10 this yields top10 = 1, bottom40 = 4 (middle 5
// ignored). At pool_count = 20 this yields top10 = 2, bottom40 = 8
// (middle 10 ignored). At pool_count = 100 this yields top10 = 10,
// bottom40 = 40 (middle 50 ignored — the classical Palma slicing).
// The slice counts are exposed on the envelope for downstream
// consumers to double-check the rounding.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.231):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolKellySkewnessSection
// (P11.228) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → ... → L-CV (P11.225) → KELLY SKEWNESS (P11.228) →
// PALMA RATIO (this module) → per-pair hot-cells GRANULAR (P11.139).
// Palma sits IMMEDIATELY BELOW the P11.228 Kelly asymmetry surface so
// the top-decile-over-bottom-four-deciles concentration read closes
// off the CONCENTRATION axis's TAIL-VS-TAIL cell: extreme-cell
// (TOP-1/2, BOTTOM-1/2), tail-slice (this module), whole-pool
// (P11.169 Gini + P11.171 Theil + P11.173 Atkinson).

import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
  type BandThresholds,
} from "./digest-snapshot-per-transition-magnitude-drilldown";
import { TOP_N } from "./digest-snapshot-per-transition-magnitude-top3-leaderboard";

export { TOP_N };

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";
type PalmaLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "egalitarian"
  | "balanced"
  | "concentrated"
  | "highly_concentrated";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Anchored on the flat reference 0.25 and balanced ramp reference 1.0.
// Widen geometrically so highly_concentrated captures the single-whale
// regime (palma >> 3 for pools where one partner emits > 3x the mass
// of the bottom 4 combined).
const EGALITARIAN_PALMA_MAX = 0.5;
const CONCENTRATED_PALMA_MIN = 1.5;
const HIGHLY_CONCENTRATED_PALMA_MIN = 3.0;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const PALMA_DECIMALS = 4;

// Threshold below which the top10 + bottom40 slices collide or
// collapse. Floor of 10 gives top10 = 1 partner, bottom40 = 4
// partners, middle = 5 partners: three disjoint non-empty slices.
const MIN_POOL_COUNT_FOR_PALMA = 10;

export interface PerTransitionMagnitudeTop3PoolPalmaBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top10_count: number | null;
  readonly partner_top10_cells: number | null;
  readonly partner_bottom40_count: number | null;
  readonly partner_bottom40_cells: number | null;
  readonly partner_palma: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top10_count: number | null;
  readonly metric_top10_cells: number | null;
  readonly metric_bottom40_count: number | null;
  readonly metric_bottom40_cells: number | null;
  readonly metric_palma: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPalmaBands {
  readonly small: PerTransitionMagnitudeTop3PoolPalmaBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPalmaBand;
  readonly large: PerTransitionMagnitudeTop3PoolPalmaBand;
}

export interface PerTransitionMagnitudeTop3PoolPalmaEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPalmaBands;
}

export interface PerTransitionMagnitudeTop3PoolPalmaMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPalmaEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPalmaEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPalmaEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPalmaEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPalma {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_palma: number;
  readonly egalitarian_palma_max: number;
  readonly concentrated_palma_min: number;
  readonly highly_concentrated_palma_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPalmaMap;
}

interface BandBuckets {
  partners: Map<string, number>;
  metrics: Map<string, number>;
}

interface TransitionBuckets {
  small: BandBuckets;
  medium: BandBuckets;
  large: BandBuckets;
}

function emptyBandBuckets(): BandBuckets {
  return { partners: new Map(), metrics: new Map() };
}

function emptyTransitionBuckets(): TransitionBuckets {
  return {
    small: emptyBandBuckets(),
    medium: emptyBandBuckets(),
    large: emptyBandBuckets(),
  };
}

function bandForScore(score: number): MagnitudeBandKey {
  if (score <= MAGNITUDE_SMALL_MAX) return "small";
  if (score <= MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function isTransitionKey(
  t: PerPairHotCellRow["transition"],
): t is TransitionBucketKey {
  return (
    t === "improved" ||
    t === "degraded" ||
    t === "rotated" ||
    t === "undecidable"
  );
}

function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

// Round-to-nearest with min 1 so the slice never collapses to zero.
// At pool_count = 10 this yields top10 = 1, bottom40 = 4 (middle 5
// ignored). At pool_count = 100 this yields top10 = 10, bottom40 =
// 40 (middle 50 ignored — the classical Palma slicing).
function sliceCount(pool_count: number, fraction: number): number {
  return Math.max(1, Math.round(pool_count * fraction));
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  top10_count: number | null;
  top10_cells: number | null;
  bottom40_count: number | null;
  bottom40_cells: number | null;
  palma: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_PALMA || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top10_count: null,
      top10_cells: null,
      bottom40_count: null,
      bottom40_cells: null,
      palma: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const top10_count = sliceCount(pool_count, 0.1);
  const bottom40_count = sliceCount(pool_count, 0.4);
  // top10 slice is the largest partners; bottom40 slice is the
  // smallest. On sorted-ascending [x_1, ..., x_n] the top10 is
  // sorted[n - top10_count : n] and the bottom40 is sorted[0 :
  // bottom40_count].
  const top10_cells = sorted
    .slice(sorted.length - top10_count)
    .reduce((a, b) => a + b, 0);
  const bottom40_cells = sorted
    .slice(0, bottom40_count)
    .reduce((a, b) => a + b, 0);
  if (bottom40_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top10_count,
      top10_cells,
      bottom40_count,
      bottom40_cells,
      palma: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    top10_count,
    top10_cells,
    bottom40_count,
    bottom40_cells,
    palma: roundTo(top10_cells / bottom40_cells, PALMA_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPalmaBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top10_count: partner.top10_count,
    partner_top10_cells: partner.top10_cells,
    partner_bottom40_count: partner.bottom40_count,
    partner_bottom40_cells: partner.bottom40_cells,
    partner_palma: partner.palma,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top10_count: metric.top10_count,
    metric_top10_cells: metric.top10_cells,
    metric_bottom40_count: metric.bottom40_count,
    metric_bottom40_cells: metric.bottom40_cells,
    metric_palma: metric.palma,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPalmaEntry {
  return {
    bands: {
      small: finaliseBand(buckets.small),
      medium: finaliseBand(buckets.medium),
      large: finaliseBand(buckets.large),
    },
  };
}

function ingest(
  buckets: BandBuckets,
  code: string,
  key: PerPairHotCellRow["key"],
): void {
  buckets.partners.set(code, (buckets.partners.get(code) ?? 0) + 1);
  buckets.metrics.set(key, (buckets.metrics.get(key) ?? 0) + 1);
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPalma {
  const buckets: Record<TransitionBucketKey, TransitionBuckets> = {
    improved: emptyTransitionBuckets(),
    degraded: emptyTransitionBuckets(),
    rotated: emptyTransitionBuckets(),
    undecidable: emptyTransitionBuckets(),
  };

  let total_hot_cells = 0;

  for (const r of hotCells.rows) {
    if (!isTransitionKey(r.transition)) continue;
    total_hot_cells += 1;
    const band = buckets[r.transition][bandForScore(r.hot_score)];
    ingest(band, r.reseller_code, r.key);
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    top_n: TOP_N,
    min_pool_count_for_palma: MIN_POOL_COUNT_FOR_PALMA,
    egalitarian_palma_max: EGALITARIAN_PALMA_MAX,
    concentrated_palma_min: CONCENTRATED_PALMA_MIN,
    highly_concentrated_palma_min: HIGHLY_CONCENTRATED_PALMA_MIN,
    band_thresholds: {
      small_max: MAGNITUDE_SMALL_MAX,
      medium_max: MAGNITUDE_MEDIUM_MAX,
    },
    transitions: {
      improved: finaliseTransition(buckets.improved),
      degraded: finaliseTransition(buckets.degraded),
      rotated: finaliseTransition(buckets.rotated),
      undecidable: finaliseTransition(buckets.undecidable),
    },
  };
}

function labelForPalma(
  pool_count: number,
  bottom40_cells: number | null,
  palma: number | null,
  min_pool_count_for_palma: number,
  egalitarian_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): PalmaLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_palma) return "small_pool";
  if (palma === null || bottom40_cells === 0) return "degenerate";
  if (palma >= highly_concentrated_min) return "highly_concentrated";
  if (palma >= concentrated_min) return "concentrated";
  if (palma < egalitarian_max) return "egalitarian";
  return "balanced";
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

function renderPalmaCell(
  pool_count: number,
  pool_cells: number,
  top10_count: number | null,
  top10_cells: number | null,
  bottom40_count: number | null,
  bottom40_cells: number | null,
  palma: number | null,
  min_pool_count_for_palma: number,
  egalitarian_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPalma(
    pool_count,
    bottom40_cells,
    palma,
    min_pool_count_for_palma,
    egalitarian_max,
    concentrated_min,
    highly_concentrated_min,
  );
  const palmaText = palma === null ? "-" : palma.toFixed(3);
  const topText = top10_cells === null ? "-" : String(top10_cells);
  const bottomText = bottom40_cells === null ? "-" : String(bottom40_cells);
  const topCountText = top10_count === null ? "-" : String(top10_count);
  const bottomCountText =
    bottom40_count === null ? "-" : String(bottom40_count);
  return `palma ${palmaText} (top${topCountText} ${topText} / bot${bottomCountText} ${bottomText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPalma,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_palma,
    egalitarian_palma_max,
    concentrated_palma_min,
    highly_concentrated_palma_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPalmaCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top10_count, band.partner_top10_cells, band.partner_bottom40_count, band.partner_bottom40_cells, band.partner_palma, min_pool_count_for_palma, egalitarian_palma_max, concentrated_palma_min, highly_concentrated_palma_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPalmaCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top10_count, band.metric_top10_cells, band.metric_bottom40_count, band.metric_bottom40_cells, band.metric_palma, min_pool_count_for_palma, egalitarian_palma_max, concentrated_palma_min, highly_concentrated_palma_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PALMA RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">TOP-DECILE-OVER-BOTTOM-4-DECILES concentration ratio over the P11.161 pool &mdash; palma = sum_top10 / sum_bottom40 on the sorted-ascending cell-count vector, ignoring the middle 50% (Palma 2011). Complements the P11.165/167 TOP-1/2 SHARE and P11.169 GINI / P11.171 THEIL / P11.173 ATKINSON surfaces by reading the TAIL-VS-TAIL structure without weighting the middle. Codomain [0, +Inf): flat pool &rarr; 0.25 (bottom 40% mass is 4x top 10% simply because it has 4x more partners), uniform ramp &rarr; 1.0 (balanced), single upper-outlier &rarr; unbounded (top 10% dominates entirely). Labels: small_pool = pool_count &lt; ${min_pool_count_for_palma} (top10/bottom40/middle slices collide or collapse), degenerate = bottom40_cells == 0 (guarded but unreachable given count integers &ge; 1), egalitarian = palma &lt; ${egalitarian_palma_max} (bottom 40% mass &gt; 2x top 10%), balanced = palma in [${egalitarian_palma_max}, ${concentrated_palma_min}) (uniform-ramp regime), concentrated = palma in [${concentrated_palma_min}, ${highly_concentrated_palma_min}) (top 10% has 1.5-3x the bottom 40% mass), highly_concentrated = palma &ge; ${highly_concentrated_palma_min} (top 10% dominates). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + palma null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner palma</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI palma</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
