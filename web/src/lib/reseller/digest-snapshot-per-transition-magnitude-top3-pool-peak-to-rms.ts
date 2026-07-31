// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-RMS
// pure-lib (P11.252).
//
// WHOLE-POOL RANGE-AGAINST-QUADRATIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// ROOT-MEAN-SQUARE (a.k.a. QUADRATIC MEAN):
//
//   ptrms = (max - min) / rms
//
// where rms = sqrt(sum(x_i^2) / n). Reads the peak spread against the
// QUADRATIC (root-mean-square) centre so a LARGE-VALUE-DOMINATED pool
// that the P11.250 peak-to-harmean surface flags WIDE (because the
// harmonic mean is pulled way down toward the low cluster) reads
// TIGHT here (because the RMS squares the large values before
// averaging so the anchor rises with the outlier and dampens the
// ratio against the range).
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
//
// PTRMS's unique DISPERSION-axis contribution: reads range in units
// of the QUADRATIC (ROOT-MEAN-SQUARE) CENTER. Every other range-based
// DISPERSION surface either scales range against a scale statistic
// (sigma for P11.237 studentized-range), the total span (P11.213
// coefficient-of-range), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), an ARITHMETIC centre (P11.246 PTMEAN),
// a GEOMETRIC centre (P11.248 PTGM), or a HARMONIC centre (P11.250
// PTH). The QUADRATIC mean is the centre pulled MOST STRONGLY toward
// LARGE values by the Power Mean inequality (harmean <= geomean <=
// mean <= rms; equality iff all values equal). PTRMS's contrast with
// PTMEAN + PTGM + PTH completes the (harmonic, geometric, arithmetic,
// quadratic) power-mean centre-anchor QUARTET for the range-based
// dispersion axis, and lets a reader distinguish between:
//
//   * PTRMS tight + PTMEAN spread + PTGM spread + PTH wide -> SMALL-
//                                     VALUE-DOMINATED with LARGE-
//                                     PARTNER DAMPENING (a small pool
//                                     with a lone large partner: RMS
//                                     squares the large value so the
//                                     anchor jumps UP hardest of any
//                                     mean and dampens the ratio; PTH
//                                     stays wide because harmean is
//                                     pulled DOWN by the small
//                                     cluster). Reference: [10, 1, 1]
//                                     reads PTRMS 1.5435 tight, PTH
//                                     6.3 wide.
//   * PTRMS tight + PTMEAN tight + PTGM wide + PTH wide     -> ISOLATED
//                                     HIGH PARTNER (two-partner pool
//                                     with a dominant high partner:
//                                     RMS + arithmetic both anchor near
//                                     the high value and dampen; PTGM
//                                     + PTH stay wide because the low
//                                     partner pulls the multiplicative
//                                     / harmonic anchors down). Reference:
//                                     [1, 100] reads PTRMS 1.4 tight,
//                                     PTMEAN 1.9604 tight, PTGM 9.9
//                                     wide, PTH 49.995 wide.
//   * PTRMS spread + PTMEAN spread + PTGM wide + PTH wide  -> MILD
//                                     ISOLATED OUTLIER (one high value
//                                     against many small: RMS squares
//                                     the outlier so anchor lifts and
//                                     the range/RMS ratio only lands
//                                     in spread; PTGM + PTH still read
//                                     wide because their anchors sit
//                                     way lower). Reference: [1x9, 10]
//                                     reads PTRMS 2.726 spread, PTMEAN
//                                     4.7368 spread, PTGM 7.149 wide,
//                                     PTH 8.19 wide.
//   * PTRMS wide + PTMEAN wide + PTGM wide + PTH wide      -> EXTREME
//                                     OUTLIER (all four centres, even
//                                     the RMS pulled UP toward the huge
//                                     outlier, stay small enough for
//                                     the range to still flag wide on
//                                     every one; RMS is DAMPENED
//                                     relative to the others though --
//                                     PTRMS 3.1292 vs PTMEAN 9.0826
//                                     vs PTGM 62.4648 vs PTH 89.199).
//                                     Reference: [1x9, 100].
//   * PTRMS tight + PTMEAN tight + PTGM spread + PTH spread -> BIMODAL
//                                     SPLIT (mean + RMS both sit
//                                     between clusters, RMS lifted a
//                                     bit more toward the high cluster
//                                     by the squaring, so the ratio
//                                     lands tight for both arithmetic
//                                     and quadratic centres). Reference:
//                                     [1x5, 10x5] reads PTRMS 1.2665
//                                     tight, PTMEAN 1.6364 tight, PTGM
//                                     2.846 spread, PTH 4.95 spread.
//   * PTRMS tight + PTMEAN tight + PTGM tight + PTH tight   -> FLAT /
//                                     UNIFORM (all four centres agree
//                                     and dominate the range). Reference:
//                                     uniform ramp [1..10] reads PTRMS
//                                     1.4505 tight, PTMEAN 1.6364
//                                     tight, PTGM 1.9873 tight, PTH
//                                     2.6361 tight.
//   * PTRMS wide + PTMEAN tight                            -> unreachable
//                                     because rms is ALWAYS >= mean by
//                                     Power Mean inequality (RMS-AM),
//                                     so ptrms = range/rms <= ptmean
//                                     = range/mean by construction.
//                                     Guarded on the reference
//                                     distributions below as a
//                                     documented invariant.
//
// The LARGE-PARTNER DAMPENING regime is the one that PTRMS uniquely
// FLAGS -- P11.246 PTMEAN cannot tell [10, 1, 1] apart from a two-
// shoulders [1x8, 5x2] pool because both read spread; the shape gap
// is real but the LABEL is the same. PTRMS reads them at 1.5435
// (tight; small-value-dominated with large-partner dampening) and
// 1.6609 (tight; two-shoulders) so the numeric gap emerges even
// while the label stays tight, giving a downstream reader a
// leaderboard-orderable signal that a three-partner pool with a lone
// large partner has a HIGH-MASS CONCENTRATION that the arithmetic
// centre only partially captured.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptrms null (empty pool).
//   * pool_count 1                  -> ptrms null (solo -- range = 0
//                                     and rms = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> ptrms null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptrms null (degenerate -- any
//     rms == 0                        zero rms would make the ratio
//                                     undefined; unreachable since
//                                     rms of non-negative values is
//                                     zero iff every value is zero
//                                     and counts are always >= 1 but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptrms in [0, +Inf) rounded to
//     rms > 0                         4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and rms > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, rms k, ptrms 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^2) = 385, rms =
//                                     sqrt(38.5) = 6.20484, range 9,
//                                     ptrms = 9/6.20484 = 1.4505
//                                     (tight -- well under the 2.0
//                                     boundary for the tight/spread
//                                     cutoff).
//   * upper-outlier [1x9, 10]       -> sum(x^2) = 109, rms =
//                                     sqrt(10.9) = 3.30151, range 9,
//                                     ptrms = 9/3.30151 = 2.726
//                                     (spread -- MILD SINGLE OUTLIER
//                                     regime flagged spread where
//                                     P11.250 PTH reads wide and
//                                     P11.246 PTMEAN also reads spread
//                                     because RMS is pulled UP by the
//                                     squared outlier).
//   * two-shoulders [1x8, 5x2]      -> sum(x^2) = 58, rms =
//                                     sqrt(5.8) = 2.40832, range 4,
//                                     ptrms = 4/2.40832 = 1.6609
//                                     (tight -- FLAT-ISH TWO-SHOULDERS
//                                     regime where PTMEAN reads spread
//                                     but the squaring of the fives
//                                     pulls RMS up enough to dampen).
//   * 50/50 split [1x5, 10x5]       -> sum(x^2) = 505, rms =
//                                     sqrt(50.5) = 7.10634, range 9,
//                                     ptrms = 9/7.10634 = 1.2665
//                                     (tight -- BIMODAL SPLIT regime
//                                     lands tight because RMS is
//                                     pulled UP hard by the squared
//                                     tens while PTGM 2.846 + PTH 4.95
//                                     both read spread).
//   * extreme outlier [1x9, 100]    -> sum(x^2) = 10009, rms =
//                                     sqrt(1000.9) = 31.637, range 99,
//                                     ptrms = 99/31.637 = 3.1292
//                                     (wide -- EXTREME OUTLIER regime
//                                     stays wide but with a MUCH
//                                     smaller numeric magnitude than
//                                     P11.246 PTMEAN 9.0826 / P11.248
//                                     PTGM 62.4648 / P11.250 PTH
//                                     89.199 because the squaring of
//                                     the hundred pulls RMS way up).
//   * two-partner [1, 9]            -> sum(x^2) = 82, rms = sqrt(41)
//                                     = 6.40312, range 8, ptrms =
//                                     8/6.40312 = 1.2494 (tight).
//   * two-partner [1, 100]          -> sum(x^2) = 10001, rms =
//                                     sqrt(5000.5) = 70.71421, range
//                                     99, ptrms = 99/70.71421 = 1.4
//                                     (tight -- ISOLATED HIGH PARTNER
//                                     regime flagged TIGHT where
//                                     P11.248 PTGM reads wide and
//                                     P11.250 PTH reads wide because
//                                     the squaring of the hundred
//                                     dominates the RMS anchor).
//   * small [10, 1, 1]              -> sum(x^2) = 102, rms =
//                                     sqrt(34) = 5.83095, range 9,
//                                     ptrms = 9/5.83095 = 1.5435
//                                     (TIGHT -- SMALL-VALUE-DOMINATED
//                                     regime with LARGE-PARTNER
//                                     DAMPENING uniquely flagged
//                                     tight here where P11.246 PTMEAN
//                                     2.25 reads spread, P11.248 PTGM
//                                     4.1774 reads spread, P11.250
//                                     PTH 6.3 reads wide).
//   * small [1, 1, 10]              -> identical to above (rank-order
//                                     invariant).
//
// Bands on raw ptrms (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + two-shoulders +
// bimodal-split + two-partner + small pools land in tight, mild-
// isolated-outlier pools land in spread, and extreme-outlier pools
// land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR rms == 0 (guarded but unreachable)
//   * tight                ptrms < 2.0 (flat, uniform ramp, two-
//                          shoulders, bimodal-split, two-partner-
//                          [1,9], two-partner-[1,100], small-[10,1,1]
//                          regimes -- RMS pulled UP by the squared
//                          large values dominates the anchor)
//   * spread               ptrms in [2.0, 3.0) (mild-single-outlier
//                          regime where the range is enough to lift
//                          the ratio above the RMS-lifted anchor)
//   * wide                 ptrms >= 3.0 (extreme-outlier regime
//                          where even the RMS pulled UP hardest of
//                          any mean by the squared outlier stays
//                          small enough for the range to still flag
//                          wide)
//
// Both cutoffs are exposed on the envelope as tight_ptrms_max /
// wide_ptrms_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptrms = MORE range against RMS centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH tight/spread/wide vocabulary). Reuses the exact 3-band
// label set so a reader scanning the DISPERSION additive/ratio
// family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.253):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToHarmeanSection
// (P11.250) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quadratic-center after
// the P11.250 range-against-harmonic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ... ->
// GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) -> PEAK-TO-Q1 (P11.242)
// -> PEAK-TO-Q3 (P11.244) -> PEAK-TO-MEAN (P11.246) -> PEAK-TO-GEOMEAN
// (P11.248) -> PEAK-TO-HARMEAN (P11.250) -> PEAK-TO-RMS (this module)
// -> per-pair hot-cells GRANULAR (P11.139).

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
type PtrmsLabel =
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

// Bands on raw ptrms (fixed cutoffs since the rms scales with
// cell counts and typical quadratic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + two-shoulders + bimodal-
// split + two-partner + small pools read tight, mild-isolated-outlier
// pools read spread, and extreme-outlier pools read wide. Tight/
// spread boundary is LOWER than PTMEAN's 2.0 (equal in this case) +
// PTGM's 2.0 + PTH's 3.0 because the RMS sits above every other mean
// by the Power Mean inequality so ptrms <= ptmean for every non-flat
// pool -- keeping the tight boundary at 2.0 keeps the mild-single-
// outlier regime in spread while the extreme-outlier regime remains
// the only surface reading wide.
const TIGHT_PTRMS_MAX = 2.0;
const WIDE_PTRMS_MIN = 3.0;

// PTRMS rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTRMS_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToRmsBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_rms: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_rms: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToRmsBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToRmsBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToRmsBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToRmsBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToRmsEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToRmsBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToRmsMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToRmsEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToRmsEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToRmsEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToRmsEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToRms {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptrms_max: number;
  readonly wide_ptrms_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToRmsMap;
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

// Peak-to-rms of a discrete distribution:
//   PTRMS = (max - min) / rms
// where rms = sqrt(sum(x_i^2) / n). Returns null on empty, solo, and
// degenerate (zero rms or non-finite squared sum) so downstream
// labels fire from distinct guard branches rather than from a NaN
// or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_rms: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_rms: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and rms = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_rms: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_rms: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let squareSum = 0;
  for (const v of values) squareSum += v * v;
  if (!Number.isFinite(squareSum) || squareSum <= 0) {
    // Belt-and-braces: sum of squared non-negative counts is always
    // >= 0 and > 0 whenever any count is > 0. Any float pathology
    // (NaN, Infinity) that slipped past the ingest guarantees
    // degrades to null so downstream renders the "degenerate" label
    // rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_rms: null };
  }
  const rms = Math.sqrt(squareSum / pool_count);
  if (!Number.isFinite(rms) || rms <= 0) {
    return { pool_count, pool_cells, peak_to_rms: null };
  }
  const range = max - min;
  const ptrms = range / rms;
  // Clamp tiny negative float-noise to 0; ptrms is non-negative by
  // construction because range >= 0 and rms > 0.
  const clamped = ptrms < 0 ? 0 : ptrms;
  return {
    pool_count,
    pool_cells,
    peak_to_rms: roundTo(clamped, PTRMS_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToRmsBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_rms: partner.peak_to_rms,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_rms: metric.peak_to_rms,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToRmsEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToRms(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToRms {
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
    tight_ptrms_max: TIGHT_PTRMS_MAX,
    wide_ptrms_min: WIDE_PTRMS_MIN,
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

function labelForPtrms(
  pool_count: number,
  pool_cells: number,
  ptrms: number | null,
  tight_max: number,
  wide_min: number,
): PtrmsLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptrms === null) return "degenerate";
  if (ptrms >= wide_min) return "wide";
  if (ptrms < tight_max) return "tight";
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

function renderPtrmsCell(
  pool_count: number,
  pool_cells: number,
  ptrms: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtrms(
    pool_count,
    pool_cells,
    ptrms,
    tight_max,
    wide_min,
  );
  const ptrmsText = ptrms === null ? "-" : ptrms.toFixed(4);
  return `PTRMS ${ptrmsText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToRmsSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToRms,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptrms_max, wide_ptrms_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtrmsCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_rms, tight_ptrms_max, wide_ptrms_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtrmsCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_rms, tight_ptrms_max, wide_ptrms_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-RMS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUADRATIC-CENTER scalar over the P11.161 pool &mdash; ptrms = (max - min) / rms where rms = sqrt(sum(x_i^2) / n). Reads the pool's total RANGE in units of its ROOT-MEAN-SQUARE (quadratic mean) so a LARGE-VALUE-DOMINATED pool that the P11.250 peak-to-harmean surface flags WIDE (because the harmonic mean is pulled way down toward the low cluster) reads TIGHT here (because RMS squares the large values before averaging so the anchor rises with the outlier and dampens the ratio against the range). Unique DISPERSION-axis contribution: reads range in units of the QUADRATIC (ROOT-MEAN-SQUARE) CENTER &mdash; every other range-based DISPERSION surface anchors on a scale statistic (P11.237), the total span (P11.213), an order-statistic anchor (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), an ARITHMETIC centre (P11.246 PTMEAN), a GEOMETRIC centre (P11.248 PTGM), or a HARMONIC centre (P11.250 PTH). PTRMS's contrast with PTMEAN + PTGM + PTH completes the (harmonic, geometric, arithmetic, quadratic) power-mean centre-anchor QUARTET for the range-based dispersion read: PTRMS tight + PTMEAN spread + PTGM spread + PTH wide = SMALL-VALUE-DOMINATED with LARGE-PARTNER DAMPENING ([10,1,1]); PTRMS tight + PTMEAN tight + PTGM wide + PTH wide = ISOLATED HIGH PARTNER ([1,100]); PTRMS spread + PTMEAN spread + PTGM wide + PTH wide = MILD ISOLATED OUTLIER ([1x9,10]); PTRMS wide + all wide = EXTREME OUTLIER ([1x9,100]); PTRMS tight + PTMEAN tight + PTGM spread + PTH spread = BIMODAL SPLIT ([1x5,10x5]); PTRMS/PTMEAN/PTGM/PTH all tight = FLAT / UNIFORM. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR rms == 0 (guarded but unreachable), tight = ptrms &lt; ${tight_ptrms_max} (flat, uniform ramp, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptrms in [${tight_ptrms_max}, ${wide_ptrms_min}) (mild-single-outlier regime), wide = ptrms &ge; ${wide_ptrms_min} (extreme-outlier regime). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptrms null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTRMS</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTRMS</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
