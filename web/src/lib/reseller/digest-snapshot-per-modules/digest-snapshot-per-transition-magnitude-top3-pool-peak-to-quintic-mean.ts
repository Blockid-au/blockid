// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINTIC-MEAN
// pure-lib (P11.264).
//
// WHOLE-POOL RANGE-AGAINST-QUINTIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's QUINTIC
// MEAN (a.k.a. power mean of order 5, M_5):
//
//   ptqnm = (max - min) / quintic_mean
//
// where quintic_mean = ((sum x_i^5) / n)^(1/5). Reads the peak spread
// against the QUINTIC (power-mean-of-order-5) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.262 PTQCM, because
// raising to the FIFTH power before averaging lifts the anchor MORE
// than raising to the fourth does, dampening the ratio against the
// range even harder.
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
//   * P11.262 PEAK-TO-QUARTIC-MEAN  - (max - min) / quartic_mean.[M_4]
//
// PTQNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINTIC (POWER-MEAN-OF-ORDER-5) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4). The QUINTIC mean is the FIRST power
// mean above the QUARTIC in the Power Mean hierarchy — it is pulled
// toward LARGE values EVEN HARDER than the quartic mean by the Power
// Mean inequality (harmean <= geomean <= mean <= rms <= cubic_mean
// <= quartic_mean <= quintic_mean; equality iff all values equal).
// PTQNM's contrast with PTQCM + PTCM + PTRMS + PTMEAN + PTGM + PTH
// extends the (harmonic, geometric, arithmetic, quadratic, cubic,
// quartic) power-mean centre-anchor SEXTET into a SEPTET (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic), and
// lets a reader read the OUTLIER-DAMPENING GRADIENT across SEVEN
// increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTQNM+PTQCM+PTCM+PTRMS:
//
//   * PTQNM tight + PTQCM tight + PTCM tight  + PTRMS tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTQNM tight + PTQCM tight + PTCM tight  + PTRMS spread
//                                     -> MILD OUTLIER that PTRMS
//                                     flags spread but PTCM + PTQCM
//                                     + PTQNM absorb by raising the
//                                     outlier to the 3rd + 4th + 5th
//                                     power into the anchor.
//                                     Reference: [1x9, 10] reads
//                                     PTQNM 1.4264 tight, PTQCM
//                                     1.6001 tight, PTCM 1.9332
//                                     tight, PTRMS 2.726 spread.
//   * PTQNM spread + PTQCM spread + PTCM spread + PTRMS wide
//                                     -> EXTREME OUTLIER that even
//                                     the quintic mean cannot absorb
//                                     fully; range still lifts PTQNM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTQNM 1.569
//                                     spread, PTQCM 1.7605 spread,
//                                     PTCM 2.1329 spread, PTRMS
//                                     3.1292 wide.
//   * PTQNM wide + PTQCM wide + PTCM wide + PTRMS wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 5th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/5). Reference:
//                                     [1x99, 100] reads PTQNM 2.4868
//                                     wide.
//   * PTQNM tight + PTQCM tight + PTCM tight + PTRMS tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTQNM 1.1372 tight,
//                                     PTQCM 1.1773 tight, PTCM
//                                     1.2473 tight, PTRMS 1.4 tight.
//   * PTQNM wide + PTQCM tight        -> unreachable because
//                                     quintic_mean is ALWAYS >=
//                                     quartic_mean by Power Mean
//                                     inequality (M_5 >= M_4), so
//                                     ptqnm = range/quintic_mean <=
//                                     ptqcm = range/quartic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTQNM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// quintic_mean approaches x_max / n^(1/5), so ptqnm approaches
// (x_max - x_min) / (x_max / n^(1/5)) = n^(1/5) * (1 - x_min/x_max)
// -> n^(1/5) as x_max -> +Inf. For n=10 the ceiling is 10^(1/5) ~=
// 1.5849, so even the most extreme outlier in a 10-partner pool
// reads ptqnm just below 1.59 (spread but never above ~1.59). For
// n=100 the ceiling climbs to 100^(1/5) ~= 2.5119, so a large pool
// with a dominant outlier reads wide. Pools with pool_count much
// greater than 14 escape into wide (since 14.2^(1/5) ~= 1.7 =
// wide_min). This asymptotic behaviour makes PTQNM an even CLEANER
// outlier-tolerance read than PTQCM in the peak-to-X family —
// extreme values are naturally absorbed even harder and only truly
// LARGE pools with runaway outliers escape into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptqnm null (empty pool).
//   * pool_count 1                  -> ptqnm null (solo -- range = 0
//                                     and QM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptqnm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptqnm null (quintic_mean_zero
//     quintic_mean == 0               -- unreachable since quintic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptqnm in [0, +Inf) rounded to
//     quintic_mean > 0                4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and quintic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> QM = k, range 0, ptqnm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^5) = 220825, QM =
//                                     22082.5^(1/5) ~= 7.3928, range
//                                     9, ptqnm ~= 1.2174 (tight --
//                                     well under the 1.5 tight/spread
//                                     boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^5) = 100009, QM =
//                                     10000.9^(1/5) ~= 6.3097, range
//                                     9, ptqnm ~= 1.4264 (tight --
//                                     MILD-SINGLE-OUTLIER absorbed by
//                                     the quintic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.262
//                                     PTQCM's 1.6001 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^5) = 6258, QM =
//                                     625.8^(1/5) ~= 3.6249, range
//                                     4, ptqnm ~= 1.1035 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^5) = 500005, QM =
//                                     50000.5^(1/5) ~= 8.7055, range
//                                     9, ptqnm ~= 1.0338 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^5) = 10000000009, QM =
//                                     1000000000.9^(1/5) ~= 63.0957,
//                                     range 99, ptqnm ~= 1.5690
//                                     (SPREAD -- EXTREME OUTLIER
//                                     approaches n^(1/5) ~ 1.5849
//                                     asymptote and lands just above
//                                     the tight boundary).
//   * two-partner [1, 9]            -> sum(x^5) = 59050, QM =
//                                     29525^(1/5) ~= 7.8344, range
//                                     8, ptqnm ~= 1.0211 (tight).
//   * two-partner [1, 100]          -> sum(x^5) = 10000000001, QM =
//                                     5000000000.5^(1/5) ~= 87.055,
//                                     range 99, ptqnm ~= 1.1372
//                                     (tight -- ISOLATED HIGH
//                                     PARTNER; quintic mean captures
//                                     the outlier).
//   * small [10, 1, 1]              -> sum(x^5) = 100002, QM =
//                                     33334^(1/5) ~= 8.0273, range
//                                     9, ptqnm ~= 1.1212 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTQNM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/5) ~= 1.2457 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^5) = 10000000099, QM =
//                                     100000000.99^(1/5) ~= 39.8107,
//                                     range 99, ptqnm ~= 2.4868
//                                     (WIDE -- RUNAWAY OUTLIER at
//                                     pool_count much greater than
//                                     14).
//
// Bands on raw ptqnm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 14 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR quintic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptqnm < 1.5 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- quintic
//                          mean pulled UP hard by raising the large
//                          values to the 5th power dominates the
//                          anchor)
//   * spread               ptqnm in [1.5, 1.7) (extreme-outlier
//                          regime where even the quintic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/5) so 10-
//                          partner pools cap near 1.59)
//   * wide                 ptqnm >= 1.7 (RUNAWAY-OUTLIER regime with
//                          pool_count >> 14 where n^(1/5) climbs
//                          past the wide cutoff; only very large
//                          pools with dominant outliers reach here)
//
// Both cutoffs are exposed on the envelope as tight_ptqnm_max /
// wide_ptqnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptqnm = MORE range against quintic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM tight/spread/wide
// vocabulary). Reuses the exact 3-band label set so a reader
// scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.265):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuarticMeanSection
// (P11.262) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quintic-center after
// the P11.262 range-against-quartic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (this module) -> per-pair hot-cells GRANULAR
// (P11.139).

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
type PtqnmLabel =
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

// Bands on raw ptqnm (fixed cutoffs since quintic_mean scales with
// cell counts and typical quintic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 14 read wide. Cutoffs tighten P11.262 PTQCM's 1.7/2.0
// pair down to 1.5/1.7 because quintic_mean >= quartic_mean by Power
// Mean inequality (M_5 >= M_4) so ptqnm <= ptqcm for every non-flat
// pool -- keeping the spread cutoff at 1.5 means the MILD-OUTLIER
// regime (which P11.262 PTQCM already reads TIGHT) stays TIGHT here
// too, the EXTREME-OUTLIER regime (which P11.262 reads SPREAD) stays
// SPREAD here as well, and the wide cutoff drops from 2.0 to 1.7 so
// only pool_count > 14 pools reach wide (14.2^(1/5) ~= 1.7 is the
// exact asymptote crossing).
const TIGHT_PTQNM_MAX = 1.5;
const WIDE_PTQNM_MIN = 1.7;

// PTQNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqnm_max: number;
  readonly wide_ptqnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinticMeanMap;
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

// Peak-to-quintic-mean of a discrete distribution:
//   PTQNM = (max - min) / quintic_mean
// where quintic_mean = ((sum x_i^5) / n)^(1/5). Returns null on
// empty, solo, and degenerate (zero quintic_mean or non-finite
// fifth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quintic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and QM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_quintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    fifthSum += sq * sq * v;
  }
  if (!Number.isFinite(fifthSum) || fifthSum <= 0) {
    // Belt-and-braces: sum of fifth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_quintic_mean: null };
  }
  const quintic_mean = Math.pow(fifthSum / pool_count, 1 / 5);
  if (!Number.isFinite(quintic_mean) || quintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_quintic_mean: null };
  }
  const range = max - min;
  const ptqnm = range / quintic_mean;
  // Clamp tiny negative float-noise to 0; ptqnm is non-negative by
  // construction because range >= 0 and quintic_mean > 0.
  const clamped = ptqnm < 0 ? 0 : ptqnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quintic_mean: roundTo(clamped, PTQNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quintic_mean: partner.peak_to_quintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quintic_mean: metric.peak_to_quintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinticMean {
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
    tight_ptqnm_max: TIGHT_PTQNM_MAX,
    wide_ptqnm_min: WIDE_PTQNM_MIN,
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

function labelForPtqnm(
  pool_count: number,
  pool_cells: number,
  ptqnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqnm === null) return "degenerate";
  if (ptqnm >= wide_min) return "wide";
  if (ptqnm < tight_max) return "tight";
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

function renderPtqnmCell(
  pool_count: number,
  pool_cells: number,
  ptqnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqnm(
    pool_count,
    pool_cells,
    ptqnm,
    tight_max,
    wide_min,
  );
  const ptqnmText = ptqnm === null ? "-" : ptqnm.toFixed(4);
  return `PTQNM ${ptqnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqnm_max, wide_ptqnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quintic_mean, tight_ptqnm_max, wide_ptqnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quintic_mean, tight_ptqnm_max, wide_ptqnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINTIC-CENTER scalar over the P11.161 pool &mdash; ptqnm = (max - min) / quintic_mean where quintic_mean = ((sum x_i^5) / n)^(1/5). Reads the pool's total RANGE in units of its QUINTIC (power-mean-of-order-5, M_5) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.262 PTQCM because raising the large values to the FIFTH power before averaging lifts the anchor MORE than raising to the fourth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the QUINTIC (POWER-MEAN-OF-ORDER-5) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4) power-mean sextet into a SEPTET with the M_5 quintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqnm approaches n^(1/5) so 10-partner pools cap near 1.59 and only pools with pool_count &gt;&gt; 14 escape into wide (14.2^(1/5) ~= 1.7 is the exact asymptote crossing). Composite regime labels: PTQNM tight + PTQCM tight + PTCM tight + PTRMS spread = MILD OUTLIER absorbed by quintic ([1x9, 10] reads PTQNM 1.4264 tight); PTQNM spread + PTQCM spread + PTCM spread + PTRMS wide = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTQNM 1.569 spread); PTQNM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 2.4868 wide); PTQNM tight + PTQCM tight + PTCM tight + PTRMS tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.1372 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quintic_mean == 0 (guarded but unreachable), tight = ptqnm &lt; ${tight_ptqnm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqnm in [${tight_ptqnm_max}, ${wide_ptqnm_min}) (extreme-outlier regime), wide = ptqnm &ge; ${wide_ptqnm_min} (runaway-outlier regime with pool_count much greater than 14). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
