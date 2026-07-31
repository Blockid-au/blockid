// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTIC-MEAN
// pure-lib (P11.268).
//
// WHOLE-POOL RANGE-AGAINST-SEPTIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's SEPTIC
// MEAN (a.k.a. power mean of order 7, M_7):
//
//   ptsem = (max - min) / septic_mean
//
// where septic_mean = ((sum x_i^7) / n)^(1/7). Reads the peak spread
// against the SEPTIC (power-mean-of-order-7) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.266 PTSM, because
// raising to the SEVENTH power before averaging lifts the anchor MORE
// than raising to the sixth does, dampening the ratio against the
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
//   * P11.264 PEAK-TO-QUINTIC-MEAN  - (max - min) / quintic_mean.[M_5]
//   * P11.266 PEAK-TO-SEXTIC-MEAN   - (max - min) / sextic_mean. [M_6]
//
// PTSEM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTIC (POWER-MEAN-OF-ORDER-7) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6). The SEPTIC
// mean is the FIRST power mean above the SEXTIC in the Power Mean
// hierarchy -- it is pulled toward LARGE values EVEN HARDER than the
// sextic mean by the Power Mean inequality (harmean <= geomean <=
// mean <= rms <= cubic_mean <= quartic_mean <= quintic_mean <=
// sextic_mean <= septic_mean; equality iff all values equal). PTSEM's
// contrast with PTSM + PTQNM + PTQCM + PTCM + PTRMS + PTMEAN + PTGM +
// PTH extends the (harmonic, geometric, arithmetic, quadratic, cubic,
// quartic, quintic, sextic) power-mean centre-anchor OCTET into a
// NONET (harmonic, geometric, arithmetic, quadratic, cubic, quartic,
// quintic, sextic, septic), and lets a reader read the OUTLIER-
// DAMPENING GRADIENT across NINE increasingly outlier-tolerant
// centres.
//
// Composite regime labels emitted by joining PTSEM+PTSM+PTQNM+PTQCM:
//
//   * PTSEM tight + PTSM tight + PTQNM tight + PTQCM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTSEM tight + PTSM tight + PTQNM tight + PTQCM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM absorb by
//                                     raising the outlier to the 4th
//                                     + 5th + 6th + 7th power into
//                                     the anchor. Reference:
//                                     [1x9, 10] reads PTSEM 1.2505
//                                     tight, PTSM 1.321 tight, PTQNM
//                                     1.4264 tight, PTQCM 1.6001
//                                     tight, PTRMS 2.726 spread.
//   * PTSEM spread + PTSM spread + PTQNM spread + PTQCM spread
//                                     -> EXTREME OUTLIER that even
//                                     the septic mean cannot absorb
//                                     fully; range still lifts PTSEM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTSEM 1.3756
//                                     spread, PTSM 1.4531 spread,
//                                     PTQNM 1.569 spread, PTQCM
//                                     1.7605 spread.
//   * PTSEM wide + PTSM wide + PTQNM wide + PTQCM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 7th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/7). Reference:
//                                     [1x99, 100] reads PTSEM 1.9114
//                                     wide.
//   * PTSEM tight + PTSM tight + PTQNM tight + PTQCM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTSEM 1.093 tight, PTSM
//                                     1.1112 tight, PTQNM 1.1372
//                                     tight, PTQCM 1.1773 tight.
//   * PTSEM wide + PTSM tight         -> unreachable because
//                                     septic_mean is ALWAYS >=
//                                     sextic_mean by Power Mean
//                                     inequality (M_7 >= M_6), so
//                                     ptsem = range/septic_mean <=
//                                     ptsm = range/sextic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTSEM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// septic_mean approaches x_max / n^(1/7), so ptsem approaches
// (x_max - x_min) / (x_max / n^(1/7)) = n^(1/7) * (1 - x_min/x_max)
// -> n^(1/7) as x_max -> +Inf. For n=10 the ceiling is 10^(1/7) ~=
// 1.3895, so even the most extreme outlier in a 10-partner pool
// reads ptsem just below 1.39 (spread but never above ~1.39). For
// n=100 the ceiling climbs to 100^(1/7) ~= 1.9307, so a large pool
// with a dominant outlier reads wide. Pools with pool_count much
// greater than 10 escape into wide (since 10.54^(1/7) ~= 1.4 =
// wide_min so pool_count >= 11 pools can reach wide). This
// asymptotic behaviour makes PTSEM an even CLEANER outlier-tolerance
// read than PTSM in the peak-to-X family -- extreme values are
// naturally absorbed even harder and only truly LARGE pools with
// runaway outliers escape into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptsem null (empty pool).
//   * pool_count 1                  -> ptsem null (solo -- range = 0
//                                     and SEM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptsem null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptsem null (septic_mean_zero
//     septic_mean == 0                -- unreachable since septic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptsem in [0, +Inf) rounded to
//     septic_mean > 0                 4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and septic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> SEM = k, range 0, ptsem 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^7) = 18080425, SEM =
//                                     1808042.5^(1/7) ~= 7.8319, range
//                                     9, ptsem ~= 1.1491 (tight --
//                                     well under the 1.3 tight/spread
//                                     boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^7) = 10000009, SEM =
//                                     1000000.9^(1/7) ~= 7.1969, range
//                                     9, ptsem ~= 1.2505 (tight --
//                                     MILD-SINGLE-OUTLIER absorbed by
//                                     the septic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.266 PTSM's
//                                     1.321 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^7) = 156258, SEM =
//                                     15625.8^(1/7) ~= 3.9731, range
//                                     4, ptsem ~= 1.0068 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^7) = 50000005, SEM =
//                                     5000000.5^(1/7) ~= 9.0574, range
//                                     9, ptsem ~= 0.9937 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^7) = 100000000000009, SEM
//                                     = 10000000000000.9^(1/7) ~=
//                                     71.9686, range 99, ptsem ~=
//                                     1.3756 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/7) ~
//                                     1.3895 asymptote and lands just
//                                     above the tight boundary).
//   * two-partner [1, 9]            -> sum(x^7) = 4782970, SEM =
//                                     2391485^(1/7) ~= 8.1518, range
//                                     8, ptsem ~= 0.9814 (tight).
//   * two-partner [1, 100]          -> sum(x^7) = 100000000000001, SEM
//                                     = 50000000000000.5^(1/7) ~=
//                                     90.5734, range 99, ptsem ~=
//                                     1.093 (tight -- ISOLATED HIGH
//                                     PARTNER; septic mean captures
//                                     the outlier).
//   * small [10, 1, 1]              -> sum(x^7) = 10000002, SEM =
//                                     3333334^(1/7) ~= 8.5486, range
//                                     9, ptsem ~= 1.0529 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTSEM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/7) ~= 1.1699 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^7) = 100000000000099, SEM
//                                     = 1000000000000.99^(1/7) ~=
//                                     51.7947, range 99, ptsem ~=
//                                     1.9114 (WIDE -- RUNAWAY OUTLIER
//                                     at pool_count much greater than
//                                     10).
//
// Bands on raw ptsem (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR septic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptsem < 1.3 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- septic
//                          mean pulled UP hard by raising the large
//                          values to the 7th power dominates the
//                          anchor)
//   * spread               ptsem in [1.3, 1.4) (extreme-outlier
//                          regime where even the septic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/7) so 10-
//                          partner pools cap near 1.39)
//   * wide                 ptsem >= 1.4 (RUNAWAY-OUTLIER regime with
//                          pool_count >> 10 where n^(1/7) climbs
//                          past the wide cutoff; only very large
//                          pools with dominant outliers reach here)
//
// Both cutoffs are exposed on the envelope as tight_ptsem_max /
// wide_ptsem_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptsem = MORE range against septic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM + P11.264 PTQNM +
// P11.266 PTSM tight/spread/wide vocabulary). Reuses the exact
// 3-band label set so a reader scanning the DISPERSION additive/
// ratio family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.269):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexticMeanSection
// (P11.266) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septic-center after
// the P11.266 range-against-sextic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN (P11.266) ->
// PEAK-TO-SEPTIC-MEAN (this module) -> per-pair hot-cells GRANULAR
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
type PtsemLabel =
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

// Bands on raw ptsem (fixed cutoffs since septic_mean scales with
// cell counts and typical septic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 10 read wide. Cutoffs tighten P11.266 PTSM's 1.4/1.5
// pair down to 1.3/1.4 because septic_mean >= sextic_mean by Power
// Mean inequality (M_7 >= M_6) so ptsem <= ptsm for every non-flat
// pool -- keeping the spread cutoff at 1.3 means the MILD-OUTLIER
// regime (which P11.266 PTSM already reads TIGHT) stays TIGHT here
// too, the EXTREME-OUTLIER regime (which P11.266 reads SPREAD) stays
// SPREAD here as well, and the wide cutoff drops from 1.5 to 1.4 so
// only pool_count > 10 pools reach wide (10.54^(1/7) ~= 1.4 is the
// exact asymptote crossing).
const TIGHT_PTSEM_MAX = 1.3;
const WIDE_PTSEM_MIN = 1.4;

// PTSEM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTSEM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSepticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSepticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSepticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSepticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSepticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsem_max: number;
  readonly wide_ptsem_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSepticMeanMap;
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

// Peak-to-septic-mean of a discrete distribution:
//   PTSEM = (max - min) / septic_mean
// where septic_mean = ((sum x_i^7) / n)^(1/7). Returns null on
// empty, solo, and degenerate (zero septic_mean or non-finite
// seventh-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_septic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and SEM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_septic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_septic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const cube = sq * v;
    seventhSum += cube * cube * v;
  }
  if (!Number.isFinite(seventhSum) || seventhSum <= 0) {
    // Belt-and-braces: sum of seventh-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_septic_mean: null };
  }
  const septic_mean = Math.pow(seventhSum / pool_count, 1 / 7);
  if (!Number.isFinite(septic_mean) || septic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_septic_mean: null };
  }
  const range = max - min;
  const ptsem = range / septic_mean;
  // Clamp tiny negative float-noise to 0; ptsem is non-negative by
  // construction because range >= 0 and septic_mean > 0.
  const clamped = ptsem < 0 ? 0 : ptsem;
  return {
    pool_count,
    pool_cells,
    peak_to_septic_mean: roundTo(clamped, PTSEM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSepticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septic_mean: partner.peak_to_septic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septic_mean: metric.peak_to_septic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSepticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepticMean {
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
    tight_ptsem_max: TIGHT_PTSEM_MAX,
    wide_ptsem_min: WIDE_PTSEM_MIN,
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

function labelForPtsem(
  pool_count: number,
  pool_cells: number,
  ptsem: number | null,
  tight_max: number,
  wide_min: number,
): PtsemLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsem === null) return "degenerate";
  if (ptsem >= wide_min) return "wide";
  if (ptsem < tight_max) return "tight";
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

function renderPtsemCell(
  pool_count: number,
  pool_cells: number,
  ptsem: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsem(
    pool_count,
    pool_cells,
    ptsem,
    tight_max,
    wide_min,
  );
  const ptsemText = ptsem === null ? "-" : ptsem.toFixed(4);
  return `PTSEM ${ptsemText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsem_max, wide_ptsem_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsemCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septic_mean, tight_ptsem_max, wide_ptsem_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsemCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septic_mean, tight_ptsem_max, wide_ptsem_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTIC-CENTER scalar over the P11.161 pool &mdash; ptsem = (max - min) / septic_mean where septic_mean = ((sum x_i^7) / n)^(1/7). Reads the pool's total RANGE in units of its SEPTIC (power-mean-of-order-7, M_7) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.266 PTSM because raising the large values to the SEVENTH power before averaging lifts the anchor MORE than raising to the sixth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the SEPTIC (POWER-MEAN-OF-ORDER-7) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6) power-mean octet into a NONET with the M_7 septic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsem approaches n^(1/7) so 10-partner pools cap near 1.39 and only pools with pool_count &gt;&gt; 10 escape into wide (10.54^(1/7) ~= 1.4 is the exact asymptote crossing). Composite regime labels: PTSEM tight + PTSM tight + PTQNM tight + PTQCM tight + PTRMS spread = MILD OUTLIER absorbed by septic ([1x9, 10] reads PTSEM 1.2505 tight); PTSEM spread + PTSM spread + PTQNM spread + PTQCM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTSEM 1.3756 spread); PTSEM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.9114 wide); PTSEM tight + PTSM tight + PTQNM tight + PTQCM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.093 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septic_mean == 0 (guarded but unreachable), tight = ptsem &lt; ${tight_ptsem_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptsem in [${tight_ptsem_max}, ${wide_ptsem_min}) (extreme-outlier regime), wide = ptsem &ge; ${wide_ptsem_min} (runaway-outlier regime with pool_count much greater than 10). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsem null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSEM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSEM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
