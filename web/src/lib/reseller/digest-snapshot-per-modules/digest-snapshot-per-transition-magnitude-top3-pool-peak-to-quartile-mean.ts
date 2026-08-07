// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUARTILE-MEAN
// pure-lib (P11.258).
//
// WHOLE-POOL RANGE-AGAINST-UNWEIGHTED-QUARTILE-COMPOSITE dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's UNWEIGHTED QUARTILE MEAN (a.k.a. quartile average) -- the
// arithmetic mean of Q1, median, and Q3 with EQUAL weights:
//
//   ptqm = (max - min) / quartile_mean
//
// where quartile_mean = (Q1 + median + Q3) / 3 uses the Tukey EXCLUSIVE
// hinges (same convention as P11.242 PTQ1 + P11.244 PTQ3 + P11.254
// PTMH + P11.256 PTTRI). Reads the peak spread against a SYMMETRIC
// HINGE-AND-MEDIAN COMPOSITE centre so a pool whose median sits ABOVE
// the midhinge (left-skewed interior) reads WIDER here than PTTRI
// (because quartile_mean pulls DOWN toward Q1) and a pool whose median
// sits BELOW the midhinge (right-skewed interior) reads TIGHTER here
// than PTTRI (because quartile_mean pulls UP toward Q3 relative to
// trimean's median-heavy composite).
//
// Algebraic identity: quartile_mean = (2*midhinge + median) / 3. QM
// gives the two hinges TWO-THIRDS of the weight and the median ONE-
// THIRD, whereas the P11.256 PTTRI trimean gives the midhinge ONE-
// HALF and the median ONE-HALF (trimean = (midhinge + median) / 2).
// So QM DE-EMPHASISES the median relative to trimean. Consequently:
//
//   * midhinge >  median (right-skewed interior)  -> QM > trimean, so PTQM < PTTRI
//   * midhinge == median (symmetric interior)     -> QM == trimean, so PTQM == PTTRI
//   * midhinge <  median (left-skewed  interior)  -> QM < trimean, so PTQM > PTTRI
//
// This lets a reader place PTQM next to PTTRI and read the DIFFERENCE
// as the HINGE-VS-MEDIAN SKEW of the interior: PTQM below PTTRI
// signals a right-skewed interior (median clusters with Q1); PTQM
// above PTTRI signals a left-skewed interior (median clusters with
// Q3); PTQM == PTTRI signals a symmetric interior (median coincides
// with the midhinge). The (PTQM, PTTRI) contrast is the SIGNED-SKEW
// analogue of the (PTM, PTMH) magnitude contrast that P11.256 already
// documents.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units.
//   * P11.199 MAD                  - mean(|x_i - mean|).
//   * P11.201 MedAD                - median(|x_i - median|).
//   * P11.145 CV                   - sigma / mean.
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//   * P11.238 GMD                  - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1.
//   * P11.244 PEAK-TO-Q3           - (max - min) / Q3.
//   * P11.246 PEAK-TO-MEAN         - (max - min) / mean.
//   * P11.248 PEAK-TO-GEOMEAN      - (max - min) / geomean.
//   * P11.250 PEAK-TO-HARMEAN      - (max - min) / harmean.
//   * P11.252 PEAK-TO-RMS          - (max - min) / rms.
//   * P11.254 PEAK-TO-MIDHINGE     - (max - min) / midhinge. Two-hinge
//                                    unweighted average.
//   * P11.256 PEAK-TO-TRIMEAN      - (max - min) / trimean. Weighted
//                                    composite (Q1 + 2*median + Q3)/4;
//                                    puts DOUBLE weight on the median.
//
// PTQM's unique DISPERSION-axis contribution: reads range in units of
// the UNWEIGHTED (equal-weight) quartile composite. It closes the
// (midhinge, trimean, quartile_mean) TRIAD of hinge/median composites:
//   * midhinge      = (Q1 + Q3)/2               -- median absent.
//   * trimean       = (Q1 + 2*median + Q3)/4    -- median DOUBLE weight.
//   * quartile_mean = (Q1 + median + Q3)/3      -- median SINGLE weight.
// PTQM sits between PTMH (median absent) and PTTRI (median doubled)
// as the "median-included at unit weight" composite. Every other
// robust surface in the peak-to-X series uses either a SINGLE order-
// statistic (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), a two-hinge
// average (P11.254 PTMH), or a median-heavy hinge composite (P11.256
// PTTRI). QM is the FIRST composite that gives Q1, median, and Q3
// equal weight, so a pool whose interior is BOTTOM-HEAVY (median near
// Q1) reads TIGHTER on PTQM than on PTM (median dominates PTM but is
// diluted by the two hinges in PTQM), while a SYMMETRIC interior
// (median == midhinge) has PTQM == PTTRI exactly.
//
// PTQM's contrast with PTTRI + PTMH gives a reader three orthogonal
// reads of the SAME range across the SAME three quartile anchors:
//
//   * PTMH  ignores median              -> pure two-hinge composite.
//   * PTQM  weighs median once          -> unweighted trio composite.
//   * PTTRI weighs median twice         -> median-heavy trio composite.
//
// This ordering yields the invariant PTMH <-> PTQM <-> PTTRI where
// PTQM sits BETWEEN PTMH and PTTRI on the number line (with signed
// direction depending on median-vs-midhinge skew):
//
//   * midhinge >  median  ->  PTMH < PTQM < PTTRI
//   * midhinge == median  ->  PTMH = PTQM = PTTRI
//   * midhinge <  median  ->  PTMH > PTQM > PTTRI
//
// Formal proof of the sandwich: let mh = (Q1 + Q3)/2 and m = median.
// Then trimean = (mh + m)/2 and quartile_mean = (2*mh + m)/3. Both
// are convex combinations of mh and m, so both lie between mh and m
// on the number line. Since quartile_mean is a 2/3-mh + 1/3-m mix
// and trimean is a 1/2-mh + 1/2-m mix, quartile_mean is CLOSER to mh
// than trimean is; equivalently trimean is CLOSER to m than
// quartile_mean is. So mh -- quartile_mean -- trimean -- m sit in
// that ORDER on the number line (with equality iff mh == m). By
// monotonicity of the reciprocal on positive denominators the peak-
// to-X reads travel in the OPPOSITE direction (large denominator ->
// small ratio), giving the PTMH <-> PTQM <-> PTTRI sandwich above.
//
// PTQM's diagnostic use next to PTTRI + PTMH:
//
//   * PTQM tight + PTTRI tight + PTMH tight  -> SYMMETRIC INTERIOR
//                                     (median == midhinge; all three
//                                     collapse to the same ratio).
//                                     Reference: flat [k×10] all 0;
//                                     uniform ramp [1..10] all 1.6364.
//   * PTQM tight + PTTRI tight + PTMH tight  -> BIMODAL SYMMETRIC
//                                     SPLIT (median == midhinge == 5.5
//                                     so the trio collapses again).
//                                     Reference: [1×5, 10×5] all 1.6364.
//                                     The trio cannot tell this apart
//                                     from the uniform ramp -- that
//                                     requires PTQ1 + PTQ3 (see
//                                     P11.254 docblock).
//   * PTQM spread + PTTRI spread + PTMH tight  -> SMALL-VALUE-DOMINATED
//                                     with LARGE-PARTNER PROMOTION
//                                     into Q3 (median sits with the
//                                     small cluster so the median-
//                                     included composites both read
//                                     spread; midhinge averages the
//                                     small median-side value and the
//                                     promoted Q3 so PTMH reads tight;
//                                     PTQM reads SLIGHTLY TIGHTER than
//                                     PTTRI because QM dilutes the
//                                     small-median vote to 1/3 vs
//                                     trimean's 2/4). Reference:
//                                     [10, 1, 1] reads PTQM 2.25
//                                     spread + PTTRI 2.7692 spread +
//                                     PTMH 1.6364 tight. The (PTQM,
//                                     PTTRI) SPREAD-INSIDE-SPREAD pair
//                                     is the DIAGNOSTIC that this is
//                                     right-skewed interior rather
//                                     than left-skewed -- if PTQM sat
//                                     ABOVE PTTRI a reader would see
//                                     LEFT-skewed interior instead.
//   * PTQM wide + PTTRI wide + PTMH wide     -> UPPER-OUTLIER against
//                                     UNIFORM FLOOR (Q1 = median = Q3
//                                     = 1 so all three composites
//                                     collapse; range tracks the
//                                     outlier). Reference: [1×9, 10]
//                                     and [1×9, 100] read PTQM/PTTRI/
//                                     PTMH all 9.0 or 99.0 wide.
//   * PTQM tight + PTTRI tight + PTMH tight -> ISOLATED HIGH PARTNER
//                                     [1, 100] (median = midhinge =
//                                     quartile_mean = 50.5, all three
//                                     read tight -- reference PTQM
//                                     1.9604 + PTTRI 1.9604 + PTMH
//                                     1.9604).
//
// The RIGHT-vs-LEFT-skewed-interior distinction is the one that PTQM
// uniquely SIGNS -- neither the PTM/PTMH pair alone nor the PTTRI
// surface alone tells a reader whether the median clusters with Q1
// (right-skewed) or Q3 (left-skewed). Only the (PTQM, PTTRI) pair
// with their signed relative ordering surfaces that direction.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptqm null (empty pool).
//   * pool_count 1                  -> ptqm null (solo -- range = 0
//                                     and QM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptqm null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 but guarded for future
//                                     upstream robustness).
//   * pool_count >= 2 and           -> ptqm null (quartile_mean_zero
//     quartile_mean == 0              -- unreachable since Q1 + med +
//                                     Q3 of non-negative integers
//                                     >= 1 is >= 3 but guarded for
//                                     future upstream robustness).
//   * pool_count >= 2 and           -> ptqm in [0, +Inf) rounded to
//     quartile_mean > 0               4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and quartile_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> Q1 k, med k, Q3 k, QM k, range
//                                     0, ptqm 0 (tight).
//   * uniform ramp [1..10]          -> Q1 = 3, med = 5.5, Q3 = 8, QM =
//                                     (3 + 5.5 + 8)/3 = 5.5, range 9,
//                                     ptqm = 9/5.5 = 1.6364 (tight;
//                                     equals PTTRI + PTMH since
//                                     median == midhinge).
//   * upper-outlier [1×9, 10]       -> sorted [1×9, 10], Q1 = 1, Q3 =
//                                     1, med = 1, QM = 1, range 9,
//                                     ptqm = 9.0 (wide -- SINGLE-
//                                     OUTLIER-AGAINST-UNIFORM-FLOOR).
//   * two-shoulders [1×8, 5×2]      -> sorted [1×8, 5, 5], Q1 = 1, Q3
//                                     = 1, med = 1, QM = 1, range 4,
//                                     ptqm = 4.0 (spread -- TOP-HEAVY
//                                     interior).
//   * 50/50 split [1×5, 10×5]       -> Q1 = 1, Q3 = 10, med = 5.5, QM
//                                     = (1 + 5.5 + 10)/3 = 5.5, range
//                                     9, ptqm = 1.6364 (tight -- BIMODAL
//                                     SYMMETRIC split; median coincides
//                                     with midhinge so PTQM == PTTRI ==
//                                     PTMH).
//   * extreme outlier [1×9, 100]    -> Q1 = 1, Q3 = 1, med = 1, QM = 1,
//                                     range 99, ptqm 99.0 (wide).
//   * two-partner [1, 9]            -> Q1 = 1, Q3 = 9, med = 5, QM = 5,
//                                     range 8, ptqm = 8/5 = 1.6 (tight;
//                                     equals PTTRI + PTMH exactly).
//   * two-partner [1, 100]          -> Q1 = 1, Q3 = 100, med = 50.5,
//                                     QM = (1 + 50.5 + 100)/3 = 50.5,
//                                     range 99, ptqm = 99/50.5 = 1.9604
//                                     (tight -- ISOLATED HIGH PARTNER;
//                                     matches PTTRI + PTMH exactly).
//   * small [10, 1, 1]              -> sorted [1, 1, 10], Q1 = 1, Q3 =
//                                     10, med = 1, QM = (1 + 1 + 10)/3
//                                     = 4, range 9, ptqm = 9/4 = 2.25
//                                     (SPREAD -- SMALL-VALUE-DOMINATED
//                                     with LARGE-PARTNER PROMOTION;
//                                     PTTRI reads 2.7692 spread here so
//                                     PTQM < PTTRI confirms the right-
//                                     skewed interior since midhinge
//                                     (5.5) > median (1). PTMH reads
//                                     1.6364 tight so the (PTQM, PTTRI,
//                                     PTMH) trio pins the diagnostic).
//
// Bands on raw ptqm (fixed cutoffs, calibrated against the n=10
// reference distributions to match the P11.240 PTM + P11.242 PTQ1 +
// P11.244 PTQ3 + P11.254 PTMH + P11.256 PTTRI vocabulary):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR quartile_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptqm < 2.0 (flat, uniform ramp, bimodal-
//                          split, two-partner regimes where QM is a
//                          substantive fraction of range)
//   * spread               ptqm in [2.0, 5.0) (two-shoulders + small-
//                          pool LARGE-PARTNER-PROMOTION regimes)
//   * wide                 ptqm >= 5.0 (upper-outlier + extreme-
//                          outlier regimes where all three quartile
//                          anchors collapse to the low cluster while
//                          range tracks the outlier)
//
// Both cutoffs are exposed on the envelope as tight_ptqm_max /
// wide_ptqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptqm = MORE range against quartile_mean = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI tight/
// spread/wide vocabulary). Reuses the exact 3-band label set so a
// reader scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.259):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTrimeanSection
// (P11.256) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unweighted-quartile-
// composite after the P11.256 range-against-hinge-and-median-composite
// landing. The hierarchy descends per-transition MAGNITUDE TOP-3 POOL
// SIZE (P11.161) -> ... -> PEAK-TO-MEAN (P11.246) -> PEAK-TO-GEOMEAN
// (P11.248) -> PEAK-TO-HARMEAN (P11.250) -> PEAK-TO-RMS (P11.252) ->
// PEAK-TO-MIDHINGE (P11.254) -> PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-
// QUARTILE-MEAN (this module) -> per-pair hot-cells GRANULAR (P11.139).

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
type PtqmLabel =
  | "empty"
  | "solo"
  | "degenerate"
  | "tight"
  | "spread"
  | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Bands on raw ptqm (fixed cutoffs since quartile_mean scales with
// cell counts and typical hinge/median-composite emissions land near
// 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + bimodal-split +
// two-partner pools read tight, two-shoulders + small-pool-with-
// large-promotion regimes read spread, and upper-outlier + extreme-
// outlier pools read wide. Cutoffs mirror the P11.240 PTM + P11.242
// PTQ1 + P11.244 PTQ3 + P11.254 PTMH + P11.256 PTTRI robust-anchor
// siblings (2.0 / 5.0) so the sextet (PTM, PTQ1, PTQ3, PTMH, PTTRI,
// PTQM) shares one vocabulary and downstream composite regime labels
// can join across the group without band remapping.
const TIGHT_PTQM_MAX = 2.0;
const WIDE_PTQM_MIN = 5.0;

// PTQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quartile_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quartile_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuartileMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuartileMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqm_max: number;
  readonly wide_ptqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuartileMeanMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n.
// Same convention as every other median-consuming pool-shape sibling
// (P11.195, P11.197, P11.201, P11.207, P11.209, P11.240, P11.242,
// P11.244, P11.254, P11.256).
function medianOfSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1 hinge: for odd n exclude the central value then
// take the median of the lower half; for even n split at the midpoint
// and take the median of the lower half. Shared convention with
// P11.207 IQR + P11.209 IQR RATIO + P11.242 PTQ1 + P11.244 PTQ3 +
// P11.254 PTMH + P11.256 PTTRI.
function tukeyQ1(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  return medianOfSorted(lower);
}

// Tukey EXCLUSIVE Q3 hinge: mirror of Q1 on the upper half. Shared
// convention with P11.244 PTQ3 + P11.254 PTMH + P11.256 PTTRI.
function tukeyQ3(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const start = n % 2 === 1 ? half + 1 : half;
  const upper = sorted.slice(start);
  return medianOfSorted(upper);
}

// Peak-to-quartile-mean of a discrete distribution:
//   PTQM = (max - min) / quartile_mean
// where quartile_mean = (Q1 + median + Q3) / 3 uses the Tukey
// EXCLUSIVE hinges. Returns null on empty, solo, degenerate, and
// quartile_mean_zero so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quartile_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quartile_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and QM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_quartile_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quartile_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const q1 = tukeyQ1(sortedAsc);
  const q3 = tukeyQ3(sortedAsc);
  const median = medianOfSorted(sortedAsc);
  const quartile_mean = (q1 + median + q3) / 3;
  if (quartile_mean === 0) {
    // QM zero -- unreachable for count integers >= 1 (Q1 + med + Q3
    // of non-negative integers >= 1 is >= 3) but guarded for future
    // upstream robustness. A zero denominator would give an undefined
    // ratio; report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_quartile_mean: null };
  }
  const range = max - min;
  const ptqm = range / quartile_mean;
  // Clamp tiny negative float-noise to 0; ptqm is non-negative by
  // construction because range >= 0 and quartile_mean > 0.
  const clamped = ptqm < 0 ? 0 : ptqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quartile_mean: roundTo(clamped, PTQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuartileMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quartile_mean: partner.peak_to_quartile_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quartile_mean: metric.peak_to_quartile_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuartileMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuartileMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuartileMean {
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
    tight_ptqm_max: TIGHT_PTQM_MAX,
    wide_ptqm_min: WIDE_PTQM_MIN,
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

function labelForPtqm(
  pool_count: number,
  pool_cells: number,
  ptqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqm === null) return "degenerate";
  if (ptqm >= wide_min) return "wide";
  if (ptqm < tight_max) return "tight";
  return "spread";
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

function renderPtqmCell(
  pool_count: number,
  pool_cells: number,
  ptqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqm(
    pool_count,
    pool_cells,
    ptqm,
    tight_max,
    wide_min,
  );
  const ptqmText = ptqm === null ? "-" : ptqm.toFixed(4);
  return `PTQM ${ptqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuartileMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuartileMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqm_max, wide_ptqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quartile_mean, tight_ptqm_max, wide_ptqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quartile_mean, tight_ptqm_max, wide_ptqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUARTILE-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNWEIGHTED-QUARTILE-COMPOSITE scalar over the P11.161 pool &mdash; ptqm = (max - min) / quartile_mean where quartile_mean = (Q1 + median + Q3) / 3 uses the Tukey EXCLUSIVE hinges. Reads the pool's total RANGE in units of its UNWEIGHTED (equal-weight) QUARTILE COMPOSITE centre. Algebraic identity: quartile_mean = (2*midhinge + median) / 3 so QM sits BETWEEN midhinge and trimean on the number line (with equality iff median == midhinge), giving the sandwich PTMH &lt;-&gt; PTQM &lt;-&gt; PTTRI. Unique DISPERSION-axis contribution: closes the (midhinge, trimean, quartile_mean) TRIAD of hinge/median composites &mdash; PTMH ignores the median, PTQM includes it at UNIT weight, PTTRI weighs it TWICE. The (PTQM, PTTRI) relative ordering SIGNS the interior skew: PTQM &lt; PTTRI signals right-skewed interior (median near Q1); PTQM == PTTRI signals symmetric interior (median == midhinge); PTQM &gt; PTTRI signals left-skewed interior (median near Q3). Reference [10, 1, 1]: PTQM 2.25 spread + PTTRI 2.7692 spread + PTMH 1.6364 tight &mdash; the (PTQM, PTTRI) SPREAD-INSIDE-SPREAD pair with PTQM &lt; PTTRI pins the SMALL-VALUE-DOMINATED with LARGE-PARTNER PROMOTION regime as RIGHT-SKEWED interior. Composite regime labels: PTQM/PTTRI/PTMH all tight = SYMMETRIC INTERIOR; PTQM spread + PTTRI spread + PTMH tight = SMALL-VALUE-DOMINATED with LARGE-PARTNER PROMOTION (right-skewed if PTQM &lt; PTTRI); PTQM/PTTRI/PTMH all wide = UPPER-OUTLIER against UNIFORM FLOOR. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quartile_mean == 0 (guarded but unreachable), tight = ptqm &lt; ${tight_ptqm_max} (flat, uniform ramp, bimodal-split, two-partner regimes), spread = ptqm in [${tight_ptqm_max}, ${wide_ptqm_min}) (two-shoulders + small-pool-with-large-promotion regimes), wide = ptqm &ge; ${wide_ptqm_min} (upper-outlier + extreme-outlier regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
