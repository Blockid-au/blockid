// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUARTIC-MEAN
// pure-lib (P11.262).
//
// WHOLE-POOL RANGE-AGAINST-QUARTIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's QUARTIC
// MEAN (a.k.a. power mean of order 4, M_4, also called the
// biquadratic mean):
//
//   ptqcm = (max - min) / quartic_mean
//
// where quartic_mean = ((sum x_i^4) / n)^(1/4). Reads the peak spread
// against the QUARTIC (power-mean-of-order-4) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.260 PTCM, because
// raising to the FOURTH power before averaging lifts the anchor MORE
// than cubing does, dampening the ratio against the range even harder.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                 - max - min in raw units.
//   * P11.199 MAD                   - mean(|x_i - mean|).
//   * P11.201 MedAD                 - median(|x_i - median|).
//   * P11.145 CV                    - sigma / mean.
//   * P11.211 QCD                   - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE  - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE     - (max - min) / sigma_population.
//   * P11.238 GMD                   - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN        - (max - min) / median.
//   * P11.242 PEAK-TO-Q1            - (max - min) / Q1.
//   * P11.244 PEAK-TO-Q3            - (max - min) / Q3.
//   * P11.246 PEAK-TO-MEAN          - (max - min) / mean.        [M_1]
//   * P11.248 PEAK-TO-GEOMEAN       - (max - min) / geomean.     [M_0]
//   * P11.250 PEAK-TO-HARMEAN       - (max - min) / harmean.     [M_-1]
//   * P11.252 PEAK-TO-RMS           - (max - min) / rms.         [M_2]
//   * P11.254 PEAK-TO-MIDHINGE      - (max - min) / midhinge.
//   * P11.256 PEAK-TO-TRIMEAN       - (max - min) / trimean.
//   * P11.258 PEAK-TO-QUARTILE-MEAN - (max - min) / quartile_mean.
//   * P11.260 PEAK-TO-CUBIC-MEAN    - (max - min) / cubic_mean.  [M_3]
//
// PTQCM's unique DISPERSION-axis contribution: reads range in units
// of the QUARTIC (POWER-MEAN-OF-ORDER-4) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3). The QUARTIC mean is the FIRST power mean above
// the CUBIC in the Power Mean hierarchy — it is pulled toward LARGE
// values EVEN HARDER than the cubic mean by the Power Mean
// inequality (harmean <= geomean <= mean <= rms <= cubic_mean <=
// quartic_mean; equality iff all values equal). PTQCM's contrast
// with PTCM + PTRMS + PTMEAN + PTGM + PTH extends the (harmonic,
// geometric, arithmetic, quadratic, cubic) power-mean centre-anchor
// QUINTET into a SEXTET (harmonic, geometric, arithmetic, quadratic,
// cubic, quartic), and lets a reader read the OUTLIER-DAMPENING
// GRADIENT across SIX increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTQCM+PTCM+PTRMS:
//
//   * PTQCM tight + PTCM tight  + PTRMS tight        -> SYMMETRIC POOL
//                                     or MODERATE-SKEW pool where every
//                                     power-mean anchor sits close
//                                     enough to the range to dampen.
//   * PTQCM tight + PTCM tight  + PTRMS spread       -> MILD OUTLIER
//                                     that PTRMS flags spread but
//                                     PTCM + PTQCM absorb by raising
//                                     the outlier to the 3rd + 4th
//                                     power into the anchor. Reference:
//                                     [1x9, 10] reads PTQCM 1.6001
//                                     tight, PTCM 1.9332 tight, PTRMS
//                                     2.726 spread.
//   * PTQCM spread + PTCM spread + PTRMS wide        -> EXTREME OUTLIER
//                                     that even the quartic mean cannot
//                                     absorb fully; range still lifts
//                                     PTQCM into spread. Reference:
//                                     [1x9, 100] reads PTQCM 1.7605
//                                     spread, PTCM 2.1329 spread,
//                                     PTRMS 3.1292 wide.
//   * PTQCM wide + PTCM wide + PTRMS wide            -> RUNAWAY OUTLIER
//                                     with a large pool: raising to
//                                     the 4th power STILL leaves range
//                                     dominant over the anchor because
//                                     the outlier ratio exceeds
//                                     n^(1/4). Reference: [1x99, 100]
//                                     reads PTQCM 3.1306 wide.
//   * PTQCM tight + PTCM tight + PTRMS tight         -> ISOLATED HIGH
//                                     PARTNER (two-partner pool). Ref:
//                                     [1, 100] reads PTQCM 1.1773
//                                     tight, PTCM 1.2473 tight, PTRMS
//                                     1.4 tight.
//   * PTQCM wide + PTCM tight                        -> unreachable
//                                     because quartic_mean is ALWAYS
//                                     >= cubic_mean by Power Mean
//                                     inequality (M_4 >= M_3), so
//                                     ptqcm = range/quartic_mean <=
//                                     ptcm = range/cubic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTQCM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// quartic_mean approaches x_max / n^(1/4), so ptqcm approaches
// (x_max - x_min) / (x_max / n^(1/4)) = n^(1/4) * (1 - x_min/x_max)
// -> n^(1/4) as x_max -> +Inf. For n=10 the ceiling is 10^(1/4) ~=
// 1.7783, so even the most extreme outlier in a 10-partner pool
// reads ptqcm just above 1.7 (spread but never above ~1.78). For
// n=100 the ceiling climbs to 100^(1/4) ~= 3.1623, so a large pool
// with a dominant outlier reads wide. Pools with pool_count much
// greater than 16 escape into wide (since 16^(1/4) = 2 = wide_min).
// This asymptotic behaviour makes PTQCM an even CLEANER outlier-
// tolerance read than PTCM in the peak-to-X family — extreme values
// are naturally absorbed even harder and only truly LARGE pools
// with runaway outliers escape into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptqcm null (empty pool).
//   * pool_count 1                  -> ptqcm null (solo -- range = 0
//                                     and QM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptqcm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptqcm null (quartic_mean_zero
//     quartic_mean == 0               -- unreachable since quartic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptqcm in [0, +Inf) rounded to
//     quartic_mean > 0                4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and quartic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> QM = k, range 0, ptqcm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^4) = 25333, QM =
//                                     (2533.3)^(1/4) ~= 7.0945, range
//                                     9, ptqcm ~= 1.2686 (tight --
//                                     well under the 1.7 tight/spread
//                                     boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^4) = 10009, QM =
//                                     (1000.9)^(1/4) ~= 5.6247, range
//                                     9, ptqcm ~= 1.6001 (tight --
//                                     MILD-SINGLE-OUTLIER absorbed by
//                                     the quartic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.260 PTCM's
//                                     1.9332 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^4) = 1258, QM =
//                                     (125.8)^(1/4) ~= 3.3491, range
//                                     4, ptqcm ~= 1.1944 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^4) = 50005, QM =
//                                     (5000.5)^(1/4) ~= 8.4092, range
//                                     9, ptqcm ~= 1.0703 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^4) = 100000009, QM =
//                                     (10000000.9)^(1/4) ~= 56.234,
//                                     range 99, ptqcm ~= 1.7605
//                                     (SPREAD -- EXTREME OUTLIER just
//                                     nudges above the tight boundary
//                                     as n^(1/4) ~ 1.7783 is
//                                     approached).
//   * two-partner [1, 9]            -> sum(x^4) = 6562, QM =
//                                     3281^(1/4) ~= 7.5683, range 8,
//                                     ptqcm ~= 1.0570 (tight).
//   * two-partner [1, 100]          -> sum(x^4) = 100000001, QM =
//                                     50000000.5^(1/4) ~= 84.0896,
//                                     range 99, ptqcm ~= 1.1773
//                                     (tight -- ISOLATED HIGH
//                                     PARTNER; quartic mean captures
//                                     the outlier).
//   * small [10, 1, 1]              -> sum(x^4) = 10002, QM =
//                                     3334^(1/4) ~= 7.5987, range 9,
//                                     ptqcm ~= 1.1844 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTQCM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/4) ~= 1.3161 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^4) = 100000099, QM =
//                                     1000001^(1/4) ~= 31.6228, range
//                                     99, ptqcm ~= 3.1306 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 16).
//
// Bands on raw ptqcm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 16 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR quartic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptqcm < 1.7 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- quartic
//                          mean pulled UP hard by raising the large
//                          values to the 4th power dominates the
//                          anchor)
//   * spread               ptqcm in [1.7, 2.0) (extreme-outlier
//                          regime where even the quartic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/4) so 10-
//                          partner pools cap near 1.78)
//   * wide                 ptqcm >= 2.0 (RUNAWAY-OUTLIER regime with
//                          pool_count >> 16 where n^(1/4) climbs past
//                          the wide cutoff; only very large pools
//                          with dominant outliers reach here)
//
// Both cutoffs are exposed on the envelope as tight_ptqcm_max /
// wide_ptqcm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptqcm = MORE range against quartic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM tight/spread/wide vocabulary). Reuses
// the exact 3-band label set so a reader scanning the DISPERSION
// additive/ratio family sees the same vocabulary across every
// surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.263):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToCubicMeanSection
// (P11.260) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quartic-center after
// the P11.260 range-against-cubic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (this module)
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
type PtqcmLabel =
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

// Bands on raw ptqcm (fixed cutoffs since quartic_mean scales with
// cell counts and typical quartic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 16 read wide. Cutoffs tighten P11.260 PTCM's 2.0/3.0
// pair down to 1.7/2.0 because quartic_mean >= cubic_mean by Power
// Mean inequality (M_4 >= M_3) so ptqcm <= ptcm for every non-flat
// pool -- keeping the tight boundary at 1.7 means the MILD-OUTLIER
// regime (which P11.260 PTCM already reads TIGHT) stays TIGHT here
// too, the EXTREME-OUTLIER regime (which P11.260 reads SPREAD) stays
// SPREAD here as well, and the wide cutoff drops from 3.0 to 2.0 so
// only pool_count > 16 pools reach wide (16^(1/4) = 2 is the exact
// asymptote crossing).
const TIGHT_PTQCM_MAX = 1.7;
const WIDE_PTQCM_MIN = 2.0;

// PTQCM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQCM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quartic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quartic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuarticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuarticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqcm_max: number;
  readonly wide_ptqcm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuarticMeanMap;
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

// Peak-to-quartic-mean of a discrete distribution:
//   PTQCM = (max - min) / quartic_mean
// where quartic_mean = ((sum x_i^4) / n)^(1/4). Returns null on
// empty, solo, and degenerate (zero quartic_mean or non-finite
// fourth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quartic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quartic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and QM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_quartic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quartic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    fourthSum += sq * sq;
  }
  if (!Number.isFinite(fourthSum) || fourthSum <= 0) {
    // Belt-and-braces: sum of fourth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_quartic_mean: null };
  }
  const quartic_mean = Math.sqrt(Math.sqrt(fourthSum / pool_count));
  if (!Number.isFinite(quartic_mean) || quartic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_quartic_mean: null };
  }
  const range = max - min;
  const ptqcm = range / quartic_mean;
  // Clamp tiny negative float-noise to 0; ptqcm is non-negative by
  // construction because range >= 0 and quartic_mean > 0.
  const clamped = ptqcm < 0 ? 0 : ptqcm;
  return {
    pool_count,
    pool_cells,
    peak_to_quartic_mean: roundTo(clamped, PTQCM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuarticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quartic_mean: partner.peak_to_quartic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quartic_mean: metric.peak_to_quartic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuarticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuarticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuarticMean {
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
    tight_ptqcm_max: TIGHT_PTQCM_MAX,
    wide_ptqcm_min: WIDE_PTQCM_MIN,
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

function labelForPtqcm(
  pool_count: number,
  pool_cells: number,
  ptqcm: number | null,
  tight_max: number,
  wide_min: number,
): PtqcmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqcm === null) return "degenerate";
  if (ptqcm >= wide_min) return "wide";
  if (ptqcm < tight_max) return "tight";
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

function renderPtqcmCell(
  pool_count: number,
  pool_cells: number,
  ptqcm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqcm(
    pool_count,
    pool_cells,
    ptqcm,
    tight_max,
    wide_min,
  );
  const ptqcmText = ptqcm === null ? "-" : ptqcm.toFixed(4);
  return `PTQCM ${ptqcmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuarticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuarticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqcm_max, wide_ptqcm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quartic_mean, tight_ptqcm_max, wide_ptqcm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quartic_mean, tight_ptqcm_max, wide_ptqcm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUARTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUARTIC-CENTER scalar over the P11.161 pool &mdash; ptqcm = (max - min) / quartic_mean where quartic_mean = ((sum x_i^4) / n)^(1/4). Reads the pool's total RANGE in units of its QUARTIC (power-mean-of-order-4, M_4, biquadratic) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.260 PTCM because raising the large values to the FOURTH power before averaging lifts the anchor MORE than cubing does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the QUARTIC (POWER-MEAN-OF-ORDER-4) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3) power-mean quintet into a SEXTET with the M_4 quartic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqcm approaches n^(1/4) so 10-partner pools cap near 1.78 and only pools with pool_count &gt;&gt; 16 escape into wide (16^(1/4) = 2 is the exact asymptote crossing). Composite regime labels: PTQCM tight + PTCM tight + PTRMS spread = MILD OUTLIER absorbed by quartic ([1x9, 10] reads PTQCM 1.6001 tight); PTQCM spread + PTCM spread + PTRMS wide = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTQCM 1.7605 spread); PTQCM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 3.1306 wide); PTQCM tight + PTCM tight + PTRMS tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.1773 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quartic_mean == 0 (guarded but unreachable), tight = ptqcm &lt; ${tight_ptqcm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqcm in [${tight_ptqcm_max}, ${wide_ptqcm_min}) (extreme-outlier regime), wide = ptqcm &ge; ${wide_ptqcm_min} (runaway-outlier regime with pool_count much greater than 16). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqcm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQCM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQCM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
