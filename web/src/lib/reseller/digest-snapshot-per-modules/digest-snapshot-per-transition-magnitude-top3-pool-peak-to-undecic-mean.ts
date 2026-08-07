// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNDECIC-MEAN
// pure-lib (P11.276).
//
// WHOLE-POOL RANGE-AGAINST-UNDECIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's UNDECIC
// MEAN (a.k.a. power mean of order 11, M_11):
//
//   ptum = (max - min) / undecic_mean
//
// where undecic_mean = ((sum x_i^11) / n)^(1/11). Reads the peak spread
// against the UNDECIC (power-mean-of-order-11) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.274 PTDM, because
// raising to the ELEVENTH power before averaging lifts the anchor MORE
// than raising to the tenth does, dampening the ratio against the
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
//   * P11.268 PEAK-TO-SEPTIC-MEAN   - (max - min) / septic_mean. [M_7]
//   * P11.270 PEAK-TO-OCTIC-MEAN    - (max - min) / octic_mean.  [M_8]
//   * P11.272 PEAK-TO-NONIC-MEAN    - (max - min) / nonic_mean.  [M_9]
//   * P11.274 PEAK-TO-DECIC-MEAN    - (max - min) / decic_mean.  [M_10]
//
// PTUM's unique DISPERSION-axis contribution: reads range in units
// of the UNDECIC (POWER-MEAN-OF-ORDER-11) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10). The UNDECIC mean is the FIRST
// power mean above the DECIC in the Power Mean hierarchy -- it is
// pulled toward LARGE values EVEN HARDER than the decic mean by the
// Power Mean inequality (harmean <= geomean <= mean <= rms <=
// cubic_mean <= quartic_mean <= quintic_mean <= sextic_mean <=
// septic_mean <= octic_mean <= nonic_mean <= decic_mean <=
// undecic_mean; equality iff all values equal). PTUM's contrast with
// PTDM + PTNM + PTOM + PTSEM + PTSM + PTQNM + PTQCM + PTCM + PTRMS +
// PTMEAN + PTGM + PTH extends the (harmonic, geometric, arithmetic,
// quadratic, cubic, quartic, quintic, sextic, septic, octic, nonic,
// decic) power-mean centre-anchor DUODECET into a TREDECET (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic, sextic,
// septic, octic, nonic, decic, undecic), and lets a reader read the
// OUTLIER-DAMPENING GRADIENT across THIRTEEN increasingly outlier-
// tolerant centres.
//
// Composite regime labels emitted by joining PTUM+PTDM+PTNM+PTOM:
//
//   * PTUM tight + PTDM tight + PTNM tight + PTOM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTUM tight + PTDM tight + PTNM tight + PTOM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM absorb by raising
//                                     the outlier to the 4th + 5th +
//                                     6th + 7th + 8th + 9th + 10th +
//                                     11th power into the anchor.
//                                     Reference: [1x9, 10] reads PTUM
//                                     1.1096 tight, PTDM 1.1330 tight,
//                                     PTNM 1.1624 tight, PTOM 1.2002
//                                     tight, PTRMS 2.726 spread.
//   * PTUM spread + PTDM spread + PTNM spread + PTOM spread
//                                     -> EXTREME OUTLIER that even
//                                     the undecic mean cannot absorb
//                                     fully; range still lifts PTUM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTUM 1.2205
//                                     spread, PTDM 1.2463 spread.
//   * PTUM wide + PTDM wide + PTNM wide + PTOM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 11th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/11). Reference:
//                                     [1x99, 100] reads PTUM 1.5047
//                                     wide.
//   * PTUM tight + PTDM tight + PTNM tight + PTOM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTUM 1.0544 tight, PTDM
//                                     1.0611 tight, PTNM 1.0693
//                                     tight.
//   * PTUM wide + PTDM tight          -> unreachable because
//                                     undecic_mean is ALWAYS >=
//                                     decic_mean by Power Mean
//                                     inequality (M_11 >= M_10), so
//                                     ptum = range/undecic_mean <=
//                                     ptdm = range/decic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTUM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// undecic_mean approaches x_max / n^(1/11), so ptum approaches
// (x_max - x_min) / (x_max / n^(1/11)) = n^(1/11) * (1 - x_min/x_max)
// -> n^(1/11) as x_max -> +Inf. For n=10 the ceiling is 10^(1/11) ~=
// 1.2329, so even the most extreme outlier in a 10-partner pool
// reads ptum just below 1.24 (spread but never above ~1.24). For
// n=100 the ceiling climbs to 100^(1/11) ~= 1.5199, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 11
// escape into wide (since 11^(1/11) ~= 1.2434 > wide_min = 1.24 so
// pool_count >= 11 pools can reach wide). This asymptotic behaviour
// makes PTUM an even CLEANER outlier-tolerance read than PTDM in the
// peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptum null (empty pool).
//   * pool_count 1                  -> ptum null (solo -- range = 0
//                                     and UM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptum null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptum null (undecic_mean_zero
//     undecic_mean == 0               -- unreachable since undecic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptum in [0, +Inf) rounded to
//     undecic_mean > 0                4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and undecic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> UM = k, range 0, ptum 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^11) = 142364319625, UM =
//                                     14236431962.5^(1/11) ~= 8.3760,
//                                     range 9, ptum ~= 1.0745 (tight
//                                     -- well under the 1.12 tight/
//                                     spread boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^11) = 100000000009, UM =
//                                     10000000000.9^(1/11) ~= 8.1113,
//                                     range 9, ptum ~= 1.1096 (tight
//                                     -- MILD-SINGLE-OUTLIER absorbed
//                                     by the undecic mean where
//                                     P11.252 PTRMS reads spread +
//                                     P11.250 PTH + P11.248 PTGM read
//                                     wide; even softer than P11.274
//                                     PTDM's 1.1330 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^11) = 97656258, UM =
//                                     9765625.8^(1/11) ~= 4.3199,
//                                     range 4, ptum ~= 0.9260 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^11) = 500000000005, UM =
//                                     50000000000.5^(1/11) ~= 9.3891,
//                                     range 9, ptum ~= 0.9585 (tight
//                                     -- BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^11) = 10^22 + 9, UM =
//                                     10^21^(1/11) ~= 81.1133, range
//                                     99, ptum ~= 1.2205 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/11) ~ 1.2329 asymptote and
//                                     lands just above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> sum(x^11) = 31381059610, UM =
//                                     15690529805^(1/11) ~= 8.4508,
//                                     range 8, ptum ~= 0.9467 (tight).
//   * two-partner [1, 100]          -> sum(x^11) = 10^22 + 1, UM =
//                                     5x10^21^(1/11) ~= 93.898,
//                                     range 99, ptum ~= 1.0544 (tight
//                                     -- ISOLATED HIGH PARTNER;
//                                     undecic mean captures the
//                                     outlier).
//   * small [10, 1, 1]              -> sum(x^11) = 100000000002, UM =
//                                     33333333334^(1/11) ~= 9.0497,
//                                     range 9, ptum ~= 0.9945 (TIGHT
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTUM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/11) ~= 1.1054 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^11) = 10^22 + 99, UM =
//                                     10^20^(1/11) ~= 65.7938, range
//                                     99, ptum ~= 1.5047 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptum (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR undecic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptum < 1.12 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- undecic mean
//                          pulled UP hard by raising the large
//                          values to the 11th power dominates the
//                          anchor)
//   * spread               ptum in [1.12, 1.24) (extreme-outlier
//                          regime where even the undecic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/11) so 10-
//                          partner pools cap near 1.2329)
//   * wide                 ptum >= 1.24 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 11 where n^(1/11) climbs
//                          past the wide cutoff; only pools of size
//                          11 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptum_max /
// wide_ptum_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptum = MORE range against undecic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM + P11.264 PTQNM +
// P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM + P11.272 PTNM +
// P11.274 PTDM tight/spread/wide vocabulary). Reuses the exact
// 3-band label set so a reader scanning the DISPERSION additive/
// ratio family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.277):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDecicMeanSection
// (P11.274) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-undecic-center after
// the P11.274 range-against-decic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN (P11.266) ->
// PEAK-TO-SEPTIC-MEAN (P11.268) -> PEAK-TO-OCTIC-MEAN (P11.270) ->
// PEAK-TO-NONIC-MEAN (P11.272) -> PEAK-TO-DECIC-MEAN (P11.274) ->
// PEAK-TO-UNDECIC-MEAN (this module) -> per-pair hot-cells GRANULAR
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
type PtumLabel =
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

// Bands on raw ptum (fixed cutoffs since undecic_mean scales with
// cell counts and typical undecic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 10 read wide. Cutoffs tighten P11.274 PTDM's
// 1.15/1.26 pair down to 1.12/1.24 because undecic_mean >=
// decic_mean by Power Mean inequality (M_11 >= M_10) so ptum <= ptdm
// for every non-flat pool -- keeping the spread cutoff at 1.12 means
// the MILD-OUTLIER regime (which P11.274 PTDM reads TIGHT at 1.1330)
// stays TIGHT here too (1.1096 < 1.12), the EXTREME-OUTLIER regime
// (which P11.274 reads SPREAD) stays SPREAD here as well (1.2205 in
// [1.12, 1.24)), and the wide cutoff drops from 1.26 to 1.24 so only
// pool_count >= 11 pools reach wide (11^(1/11) ~= 1.2434 is just
// past the wide floor).
const TIGHT_PTUM_MAX = 1.12;
const WIDE_PTUM_MIN = 1.24;

// PTUM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTUM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_undecic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_undecic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptum_max: number;
  readonly wide_ptum_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUndecicMeanMap;
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

// Peak-to-undecic-mean of a discrete distribution:
//   PTUM = (max - min) / undecic_mean
// where undecic_mean = ((sum x_i^11) / n)^(1/11). Returns null on
// empty, solo, and degenerate (zero undecic_mean or non-finite
// eleventh-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_undecic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_undecic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and UM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_undecic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_undecic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eleventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    eleventhSum += oct * sq * v;
  }
  if (!Number.isFinite(eleventhSum) || eleventhSum <= 0) {
    // Belt-and-braces: sum of eleventh-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_undecic_mean: null };
  }
  const undecic_mean = Math.pow(eleventhSum / pool_count, 1 / 11);
  if (!Number.isFinite(undecic_mean) || undecic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_undecic_mean: null };
  }
  const range = max - min;
  const ptum = range / undecic_mean;
  // Clamp tiny negative float-noise to 0; ptum is non-negative by
  // construction because range >= 0 and undecic_mean > 0.
  const clamped = ptum < 0 ? 0 : ptum;
  return {
    pool_count,
    pool_cells,
    peak_to_undecic_mean: roundTo(clamped, PTUM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUndecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_undecic_mean: partner.peak_to_undecic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_undecic_mean: metric.peak_to_undecic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUndecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicMean {
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
    tight_ptum_max: TIGHT_PTUM_MAX,
    wide_ptum_min: WIDE_PTUM_MIN,
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

function labelForPtum(
  pool_count: number,
  pool_cells: number,
  ptum: number | null,
  tight_max: number,
  wide_min: number,
): PtumLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptum === null) return "degenerate";
  if (ptum >= wide_min) return "wide";
  if (ptum < tight_max) return "tight";
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

function renderPtumCell(
  pool_count: number,
  pool_cells: number,
  ptum: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtum(
    pool_count,
    pool_cells,
    ptum,
    tight_max,
    wide_min,
  );
  const ptumText = ptum === null ? "-" : ptum.toFixed(4);
  return `PTUM ${ptumText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptum_max, wide_ptum_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtumCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_undecic_mean, tight_ptum_max, wide_ptum_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtumCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_undecic_mean, tight_ptum_max, wide_ptum_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNDECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNDECIC-CENTER scalar over the P11.161 pool &mdash; ptum = (max - min) / undecic_mean where undecic_mean = ((sum x_i^11) / n)^(1/11). Reads the pool's total RANGE in units of its UNDECIC (power-mean-of-order-11, M_11) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.274 PTDM because raising the large values to the ELEVENTH power before averaging lifts the anchor MORE than raising to the tenth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the UNDECIC (POWER-MEAN-OF-ORDER-11) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10) power-mean duodecet into a TREDECET with the M_11 undecic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptum approaches n^(1/11) so 10-partner pools cap near 1.2329 and only pools with pool_count &gt;= 11 escape into wide (11^(1/11) ~= 1.2434 is just past the wide floor). Composite regime labels: PTUM tight + PTDM tight + PTNM tight + PTOM tight + PTRMS spread = MILD OUTLIER absorbed by undecic ([1x9, 10] reads PTUM 1.1096 tight); PTUM spread + PTDM spread + PTNM spread + PTOM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTUM 1.2205 spread); PTUM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.5047 wide); PTUM tight + PTDM tight + PTNM tight + PTOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0543 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR undecic_mean == 0 (guarded but unreachable), tight = ptum &lt; ${tight_ptum_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptum in [${tight_ptum_max}, ${wide_ptum_min}) (extreme-outlier regime), wide = ptum &ge; ${wide_ptum_min} (runaway-outlier regime with pool_count &gt;= 11). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptum null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
