// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRIMEAN
// pure-lib (P11.256).
//
// WHOLE-POOL RANGE-AGAINST-HINGE-AND-MEDIAN-COMPOSITE dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's TUKEY TRIMEAN (a.k.a. Tukey's Fifth) -- the weighted
// composite of the three quartiles that puts double weight on the
// median:
//
//   pttri = (max - min) / trimean
//
// where trimean = (Q1 + 2*median + Q3) / 4 uses the Tukey EXCLUSIVE
// hinges (same convention as P11.242 PTQ1 + P11.244 PTQ3 + P11.254
// PTMH). Reads the peak spread against a ROBUST HINGE-AND-MEDIAN
// COMPOSITE centre so a pool where the median sits BELOW the midhinge
// (right-skewed) reads WIDER here than PTMH (because trimean pulls
// toward the lower median) and a pool where the median sits ABOVE
// the midhinge (left-skewed) reads TIGHTER here than PTMH.
//
// Algebraic identity: trimean = (midhinge + median) / 2. Trimean is
// EXACTLY the arithmetic mean of the P11.254 PTMH denominator and
// the P11.240 PTM denominator, so by monotonicity of the reciprocal
// on positive denominators:
//
//   min(PTM, PTMH) <= PTTRI <= max(PTM, PTMH)
//
// with equality iff median == midhinge (symmetric quartile
// distribution). This invariant lets a reader place PTTRI on the
// SAME tight/spread/wide vocabulary as PTM + PTMH and read the
// difference as the "hinge-vs-median" skew of the pool: when PTTRI
// sits near PTM the median dominates trimean; when PTTRI sits near
// PTMH the midhinge dominates; when it lands halfway median and
// midhinge coincide (symmetric interior).
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
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median. Reads
//                                    range in units of the ORDER-
//                                    STATISTIC CENTER.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1. Reads range
//                                    in units of the LOWER SHOULDER.
//   * P11.244 PEAK-TO-Q3           - (max - min) / Q3. Reads range
//                                    in units of the UPPER SHOULDER.
//   * P11.246 PEAK-TO-MEAN         - (max - min) / mean. Reads range
//                                    in units of the ARITHMETIC
//                                    CENTER.
//   * P11.248 PEAK-TO-GEOMEAN      - (max - min) / geomean. Reads
//                                    range in units of the GEOMETRIC
//                                    (MULTIPLICATIVE) CENTER.
//   * P11.250 PEAK-TO-HARMEAN      - (max - min) / harmean. Reads
//                                    range in units of the HARMONIC
//                                    (INVERSE-ARITHMETIC) CENTER.
//   * P11.252 PEAK-TO-RMS          - (max - min) / rms. Reads range
//                                    in units of the QUADRATIC (ROOT-
//                                    MEAN-SQUARE) CENTER. Closes the
//                                    (harmonic, geometric, arithmetic,
//                                    quadratic) POWER-MEAN quartet.
//   * P11.254 PEAK-TO-MIDHINGE     - (max - min) / midhinge. Reads
//                                    range in units of the ROBUST
//                                    HINGE-COMPOSITE (Tukey midsummary)
//                                    centre.
//
// PTTRI's unique DISPERSION-axis contribution: reads range in units
// of the ROBUST HINGE-AND-MEDIAN COMPOSITE (Tukey trimean) centre.
// Every other robust DISPERSION anchor in the peak-to-X series uses
// either a SINGLE order-statistic (P11.240 PTM median, P11.242 PTQ1
// lower hinge, P11.244 PTQ3 upper hinge) or a two-hinge average
// (P11.254 PTMH). The Tukey trimean is the FIRST composite that
// blends the median with the two hinges, giving the median double
// weight so a pool whose interior is BOTTOM-HEAVY (median near Q1)
// or TOP-HEAVY (median near Q3) reads WIDER or TIGHTER accordingly
// while a SYMMETRIC interior (median == midhinge) has PTTRI == PTMH
// exactly.
//
// PTTRI's contrast with PTM + PTMH completes the (median, trimean,
// midhinge) TRIAD of robust hinge/median composites for the range-
// based dispersion read, and lets a reader distinguish between:
//
//   * PTTRI tight + PTM tight + PTMH tight  -> SYMMETRIC INTERIOR
//                                     (median and midhinge coincide,
//                                     all three anchors dominate the
//                                     range). Reference: flat [k×10]
//                                     and uniform ramp [1..10] read
//                                     all three 0 or 1.6364.
//   * PTTRI tight + PTM tight + PTMH tight  -> BIMODAL SYMMETRIC
//                                     SPLIT (median = midhinge = 5.5
//                                     so PTTRI = PTMH = PTM but the
//                                     interior is bimodal). Reference:
//                                     [1×5, 10×5] reads PTTRI 1.6364
//                                     tight + PTM 1.6364 tight + PTMH
//                                     1.6364 tight; the trio cannot
//                                     tell this apart from the uniform
//                                     ramp -- that requires PTQ1 +
//                                     PTQ3 (see P11.254 docblock).
//   * PTTRI spread + PTM wide + PTMH tight  -> SMALL-VALUE-DOMINATED
//                                     with LARGE-PARTNER PROMOTION
//                                     into Q3 (median sits with the
//                                     small cluster so PTM reads wide;
//                                     midhinge averages the small
//                                     median and the promoted Q3 so
//                                     PTMH reads tight; trimean sits
//                                     between them so PTTRI reads
//                                     spread). Reference: [10, 1, 1]
//                                     reads PTTRI 2.7692 spread + PTM
//                                     9.0 wide + PTMH 1.6364 tight.
//                                     This is the DIAGNOSTIC regime
//                                     that PTTRI uniquely disambiguates
//                                     -- neither PTM nor PTMH alone
//                                     tells the story.
//   * PTTRI wide + PTM wide + PTMH wide    -> UPPER-OUTLIER against
//                                     UNIFORM FLOOR (Q1 = median = Q3
//                                     = 1 so all three denominators
//                                     collapse; range tracks the
//                                     outlier). Reference: [1×9, 10]
//                                     and [1×9, 100] read PTTRI/PTM/
//                                     PTMH all 9.0 or 99.0 wide.
//   * PTTRI tight + PTM tight + PTMH tight -> ISOLATED HIGH PARTNER
//                                     [1, 100] (median = midhinge =
//                                     trimean = 50.5, all three read
//                                     tight -- reference PTTRI 1.9604
//                                     + PTM 1.9604 + PTMH 1.9604).
//
// The SMALL-VALUE-DOMINATED-with-LARGE-PARTNER-PROMOTION distinction
// is the one that PTTRI uniquely CLARIFIES -- neither the PTM/PTMH
// pair alone nor the PTQ1/PTQ3 pair alone flags this regime because
// PTM reads wide (median dampens with the small cluster) while PTMH
// reads tight (midhinge pulls up with the promoted Q3). Only PTTRI
// with its 2x median weight lands in the SPREAD band and tells a
// reader that the median-vs-midhinge divergence is the signal.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> pttri null (empty pool).
//   * pool_count 1                  -> pttri null (solo -- range = 0
//                                     and trimean = the sole cell so
//                                     the ratio would trivially read
//                                     0, but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> pttri null (degenerate --
//     pool_cells == 0                 cannot happen for count
//                                     integers >= 1 by construction,
//                                     but guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> pttri null (trimean_zero --
//     trimean == 0                    unreachable since Q1 + 2*med +
//                                     Q3 of non-negative integers
//                                     >= 1 is >= 4 but guarded for
//                                     future upstream robustness).
//   * pool_count >= 2 and           -> pttri in [0, +Inf) rounded to
//     trimean > 0                     4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and trimean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> Q1 k, med k, Q3 k, trimean k,
//                                     range 0, pttri 0 (tight).
//   * uniform ramp [1..10]          -> lower half [1..5] Q1 = 3,
//                                     upper half [6..10] Q3 = 8, med
//                                     = 5.5, trimean = (3 + 11 + 8)/4
//                                     = 5.5, range 9, pttri = 9/5.5
//                                     = 1.6364 (tight).
//   * upper-outlier [1×9, 10]       -> sorted [1×9, 10], Q1 = 1, Q3
//                                     = 1, med = 1, trimean = 1, range
//                                     9, pttri = 9.0 (wide -- SINGLE-
//                                     OUTLIER-AGAINST-UNIFORM-FLOOR
//                                     regime).
//   * two-shoulders [1×8, 5×2]      -> sorted [1×8, 5, 5], Q1 = 1, Q3
//                                     = 1, med = 1, trimean = 1, range
//                                     4, pttri = 4.0 (spread -- TOP-
//                                     HEAVY interior regime).
//   * 50/50 split [1×5, 10×5]       -> Q1 = 1, Q3 = 10, med = 5.5,
//                                     trimean = (1 + 11 + 10)/4 = 5.5,
//                                     range 9, pttri = 9/5.5 = 1.6364
//                                     (tight -- BIMODAL-SYMMETRIC
//                                     split reads TIGHT here since
//                                     median coincides with midhinge).
//   * extreme outlier [1×9, 100]    -> Q1 = 1, Q3 = 1, med = 1,
//                                     trimean = 1, range 99, pttri
//                                     99.0 (wide).
//   * two-partner [1, 9]            -> Q1 = 1, Q3 = 9, med = 5,
//                                     trimean = (1 + 10 + 9)/4 = 5,
//                                     range 8, pttri = 8/5 = 1.6
//                                     (tight).
//   * two-partner [1, 100]          -> Q1 = 1, Q3 = 100, med = 50.5,
//                                     trimean = (1 + 101 + 100)/4 =
//                                     50.5, range 99, pttri = 99/50.5
//                                     = 1.9604 (tight -- ISOLATED
//                                     HIGH PARTNER regime tight here
//                                     since trimean captures both
//                                     partners; matches PTMH exactly).
//   * small [10, 1, 1]              -> sorted [1, 1, 10], Q1 = 1, Q3
//                                     = 10, med = 1, trimean = (1 +
//                                     2 + 10)/4 = 3.25, range 9,
//                                     pttri = 9/3.25 = 2.7692 (SPREAD
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER PROMOTION into
//                                     Q3 regime; contrast P11.240
//                                     PTM 9.0 wide + P11.254 PTMH
//                                     1.6364 tight -- PTTRI is the
//                                     ONLY surface in the peak-to-X
//                                     family that lands this regime
//                                     in a distinct band).
//
// Bands on raw pttri (fixed cutoffs, calibrated against the n=10
// reference distributions to match the P11.240 PTM + P11.242 PTQ1 +
// P11.244 PTQ3 + P11.254 PTMH vocabulary):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR trimean == 0 (guarded but unreachable)
//   * tight                pttri < 2.0 (flat, uniform ramp, bimodal-
//                          split, two-partner regimes where trimean
//                          is a substantive fraction of range)
//   * spread               pttri in [2.0, 5.0) (two-shoulders +
//                          small-pool LARGE-PARTNER-PROMOTION regimes)
//   * wide                 pttri >= 5.0 (upper-outlier + extreme-
//                          outlier regimes where all three quartile
//                          anchors collapse to the low cluster while
//                          range tracks the outlier)
//
// Both cutoffs are exposed on the envelope as tight_pttri_max /
// wide_pttri_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH pttri = MORE range against trimean = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH tight/spread/wide
// vocabulary). Reuses the exact 3-band label set so a reader
// scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.257):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToMidhingeSection
// (P11.254) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-hinge-and-median-
// composite after the P11.254 range-against-hinge-composite landing.
// The hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> PEAK-TO-Q1 (P11.242) -> PEAK-TO-Q3 (P11.244)
// -> PEAK-TO-MEAN (P11.246) -> PEAK-TO-GEOMEAN (P11.248) -> PEAK-TO-
// HARMEAN (P11.250) -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE
// (P11.254) -> PEAK-TO-TRIMEAN (this module) -> per-pair hot-cells
// GRANULAR (P11.139).

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
type PttriLabel =
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

// Bands on raw pttri (fixed cutoffs since trimean scales with cell
// counts and typical hinge/median-composite emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + bimodal-split + two-partner
// pools read tight, two-shoulders + small-pool-with-large-promotion
// regimes read spread, and upper-outlier + extreme-outlier pools
// read wide. Cutoffs mirror the P11.240 PTM + P11.242 PTQ1 + P11.244
// PTQ3 + P11.254 PTMH robust-anchor siblings (2.0 / 5.0) so the
// quadruple (PTM, PTQ1, PTQ3, PTMH, PTTRI) shares one vocabulary and
// downstream composite regime labels can join across the quintet
// without band remapping.
const TIGHT_PTTRI_MAX = 2.0;
const WIDE_PTTRI_MIN = 5.0;

// PTTRI rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTTRI_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrimeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trimean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trimean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrimeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrimeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrimeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrimeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrimeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrimeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttri_max: number;
  readonly wide_pttri_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrimeanMap;
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
// P11.244, P11.254).
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
// P11.254 PTMH.
function tukeyQ1(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  return medianOfSorted(lower);
}

// Tukey EXCLUSIVE Q3 hinge: mirror of Q1 on the upper half. Shared
// convention with P11.244 PTQ3 + P11.254 PTMH.
function tukeyQ3(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const start = n % 2 === 1 ? half + 1 : half;
  const upper = sorted.slice(start);
  return medianOfSorted(upper);
}

// Peak-to-trimean of a discrete distribution:
//   PTTRI = (max - min) / trimean
// where trimean = (Q1 + 2*median + Q3) / 4 uses the Tukey EXCLUSIVE
// hinges. Returns null on empty, solo, degenerate, and trimean_zero
// so downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trimean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_trimean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and trimean = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_trimean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_trimean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const q1 = tukeyQ1(sortedAsc);
  const q3 = tukeyQ3(sortedAsc);
  const median = medianOfSorted(sortedAsc);
  const trimean = (q1 + 2 * median + q3) / 4;
  if (trimean === 0) {
    // Trimean zero -- unreachable for count integers >= 1 (Q1 + 2*med
    // + Q3 of non-negative integers >= 1 is >= 4) but guarded for
    // future upstream robustness. A zero trimean would give an
    // undefined ratio; report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_trimean: null };
  }
  const range = max - min;
  const pttri = range / trimean;
  // Clamp tiny negative float-noise to 0; pttri is non-negative by
  // construction because range >= 0 and trimean > 0.
  const clamped = pttri < 0 ? 0 : pttri;
  return {
    pool_count,
    pool_cells,
    peak_to_trimean: roundTo(clamped, PTTRI_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrimeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trimean: partner.peak_to_trimean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trimean: metric.peak_to_trimean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrimeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean {
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
    tight_pttri_max: TIGHT_PTTRI_MAX,
    wide_pttri_min: WIDE_PTTRI_MIN,
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

function labelForPttri(
  pool_count: number,
  pool_cells: number,
  pttri: number | null,
  tight_max: number,
  wide_min: number,
): PttriLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttri === null) return "degenerate";
  if (pttri >= wide_min) return "wide";
  if (pttri < tight_max) return "tight";
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

function renderPttriCell(
  pool_count: number,
  pool_cells: number,
  pttri: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttri(
    pool_count,
    pool_cells,
    pttri,
    tight_max,
    wide_min,
  );
  const pttriText = pttri === null ? "-" : pttri.toFixed(4);
  return `PTTRI ${pttriText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttri_max, wide_pttri_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttriCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trimean, tight_pttri_max, wide_pttri_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttriCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trimean, tight_pttri_max, wide_pttri_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRIMEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-HINGE-AND-MEDIAN-COMPOSITE scalar over the P11.161 pool &mdash; pttri = (max - min) / trimean where trimean = (Q1 + 2*median + Q3) / 4 uses the Tukey EXCLUSIVE hinges. Reads the pool's total RANGE in units of its ROBUST HINGE-AND-MEDIAN COMPOSITE (Tukey TRIMEAN, a.k.a. Tukey's Fifth) centre. Algebraic identity: trimean = (midhinge + median) / 2, so by monotonicity of the reciprocal on positive denominators min(PTM, PTMH) &le; PTTRI &le; max(PTM, PTMH) with equality iff median == midhinge. Unique DISPERSION-axis contribution: FIRST robust anchor in the peak-to-X family that blends the median with the two hinges under a fixed weighted composite &mdash; every other robust surface anchors on either a SINGLE order-statistic (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3) or a two-hinge average (P11.254 PTMH). PTTRI's SMALL-VALUE-DOMINATED-with-LARGE-PARTNER-PROMOTION regime [10, 1, 1] reads 2.7692 spread while PTM reads 9.0 wide and PTMH reads 1.6364 tight &mdash; the ONLY surface in the family that lands this asymmetric interior in a distinct band. Composite regime labels: PTTRI/PTM/PTMH all tight = SYMMETRIC INTERIOR; PTTRI spread + PTM wide + PTMH tight = SMALL-VALUE-DOMINATED with LARGE-PARTNER PROMOTION; PTTRI/PTM/PTMH all wide = UPPER-OUTLIER against UNIFORM FLOOR. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trimean == 0 (guarded but unreachable), tight = pttri &lt; ${tight_pttri_max} (flat, uniform ramp, bimodal-split, two-partner regimes), spread = pttri in [${tight_pttri_max}, ${wide_pttri_min}) (two-shoulders + small-pool-with-large-promotion regimes), wide = pttri &ge; ${wide_pttri_min} (upper-outlier + extreme-outlier regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttri null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTRI</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTRI</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
