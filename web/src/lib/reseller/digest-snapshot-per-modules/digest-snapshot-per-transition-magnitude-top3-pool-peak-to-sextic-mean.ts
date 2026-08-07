// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXTIC-MEAN
// pure-lib (P11.266).
//
// WHOLE-POOL RANGE-AGAINST-SEXTIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's SEXTIC
// MEAN (a.k.a. power mean of order 6, M_6):
//
//   ptsm = (max - min) / sextic_mean
//
// where sextic_mean = ((sum x_i^6) / n)^(1/6). Reads the peak spread
// against the SEXTIC (power-mean-of-order-6) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.264 PTQNM, because
// raising to the SIXTH power before averaging lifts the anchor MORE
// than raising to the fifth does, dampening the ratio against the
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
//
// PTSM's unique DISPERSION-axis contribution: reads range in units
// of the SEXTIC (POWER-MEAN-OF-ORDER-6) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5). The SEXTIC mean is the
// FIRST power mean above the QUINTIC in the Power Mean hierarchy —
// it is pulled toward LARGE values EVEN HARDER than the quintic mean
// by the Power Mean inequality (harmean <= geomean <= mean <= rms <=
// cubic_mean <= quartic_mean <= quintic_mean <= sextic_mean; equality
// iff all values equal). PTSM's contrast with PTQNM + PTQCM + PTCM
// + PTRMS + PTMEAN + PTGM + PTH extends the (harmonic, geometric,
// arithmetic, quadratic, cubic, quartic, quintic) power-mean centre-
// anchor SEPTET into an OCTET (harmonic, geometric, arithmetic,
// quadratic, cubic, quartic, quintic, sextic), and lets a reader read
// the OUTLIER-DAMPENING GRADIENT across EIGHT increasingly outlier-
// tolerant centres.
//
// Composite regime labels emitted by joining PTSM+PTQNM+PTQCM+PTCM:
//
//   * PTSM tight + PTQNM tight + PTQCM tight + PTCM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTSM tight + PTQNM tight + PTQCM tight + PTCM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTCM + PTQCM
//                                     + PTQNM + PTSM absorb by
//                                     raising the outlier to the 3rd
//                                     + 4th + 5th + 6th power into
//                                     the anchor. Reference:
//                                     [1x9, 10] reads PTSM 1.321
//                                     tight, PTQNM 1.4264 tight,
//                                     PTQCM 1.6001 tight, PTCM
//                                     1.9332 tight, PTRMS 2.726
//                                     spread.
//   * PTSM spread + PTQNM spread + PTQCM spread + PTCM spread
//                                     -> EXTREME OUTLIER that even
//                                     the sextic mean cannot absorb
//                                     fully; range still lifts PTSM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTSM 1.4531
//                                     spread, PTQNM 1.569 spread,
//                                     PTQCM 1.7605 spread, PTCM
//                                     2.1329 spread.
//   * PTSM wide + PTQNM wide + PTQCM wide + PTCM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 6th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/6). Reference:
//                                     [1x99, 100] reads PTSM 2.1329
//                                     wide.
//   * PTSM tight + PTQNM tight + PTQCM tight + PTCM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTSM 1.1112 tight, PTQNM
//                                     1.1372 tight, PTQCM 1.1773
//                                     tight, PTCM 1.2473 tight.
//   * PTSM wide + PTQNM tight         -> unreachable because
//                                     sextic_mean is ALWAYS >=
//                                     quintic_mean by Power Mean
//                                     inequality (M_6 >= M_5), so
//                                     ptsm = range/sextic_mean <=
//                                     ptqnm = range/quintic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTSM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// sextic_mean approaches x_max / n^(1/6), so ptsm approaches
// (x_max - x_min) / (x_max / n^(1/6)) = n^(1/6) * (1 - x_min/x_max)
// -> n^(1/6) as x_max -> +Inf. For n=10 the ceiling is 10^(1/6) ~=
// 1.4678, so even the most extreme outlier in a 10-partner pool
// reads ptsm just below 1.47 (spread but never above ~1.47). For
// n=100 the ceiling climbs to 100^(1/6) ~= 2.1544, so a large pool
// with a dominant outlier reads wide. Pools with pool_count much
// greater than 11 escape into wide (since 11.4^(1/6) ~= 1.5 =
// wide_min). This asymptotic behaviour makes PTSM an even CLEANER
// outlier-tolerance read than PTQNM in the peak-to-X family —
// extreme values are naturally absorbed even harder and only truly
// LARGE pools with runaway outliers escape into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptsm null (empty pool).
//   * pool_count 1                  -> ptsm null (solo -- range = 0
//                                     and SM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptsm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptsm null (sextic_mean_zero
//     sextic_mean == 0                -- unreachable since sextic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptsm in [0, +Inf) rounded to
//     sextic_mean > 0                 4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and sextic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> SM = k, range 0, ptsm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^6) = 1978405, SM =
//                                     197840.5^(1/6) ~= 7.6334, range
//                                     9, ptsm ~= 1.179 (tight --
//                                     well under the 1.4 tight/spread
//                                     boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^6) = 1000009, SM =
//                                     100000.9^(1/6) ~= 6.8129, range
//                                     9, ptsm ~= 1.321 (tight --
//                                     MILD-SINGLE-OUTLIER absorbed by
//                                     the sextic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.264
//                                     PTQNM's 1.4264 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^6) = 31258, SM =
//                                     3125.8^(1/6) ~= 3.8238, range
//                                     4, ptsm ~= 1.0461 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^6) = 5000005, SM =
//                                     500000.5^(1/6) ~= 8.909, range
//                                     9, ptsm ~= 1.0102 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^6) = 1000000000009, SM =
//                                     100000000000.9^(1/6) ~= 68.1292,
//                                     range 99, ptsm ~= 1.4531
//                                     (SPREAD -- EXTREME OUTLIER
//                                     approaches n^(1/6) ~ 1.4678
//                                     asymptote and lands just above
//                                     the tight boundary).
//   * two-partner [1, 9]            -> sum(x^6) = 531442, SM =
//                                     265721^(1/6) ~= 8.0181, range
//                                     8, ptsm ~= 0.9977 (tight).
//   * two-partner [1, 100]          -> sum(x^6) = 1000000000001, SM =
//                                     500000000000.5^(1/6) ~= 89.0899,
//                                     range 99, ptsm ~= 1.1112
//                                     (tight -- ISOLATED HIGH
//                                     PARTNER; sextic mean captures
//                                     the outlier).
//   * small [10, 1, 1]              -> sum(x^6) = 1000002, SM =
//                                     333334^(1/6) ~= 8.3268, range
//                                     9, ptsm ~= 1.0808 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTSM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/6) ~= 1.2009 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^6) = 1000000000099, SM =
//                                     10000000000.99^(1/6) ~= 46.4159,
//                                     range 99, ptsm ~= 2.1329
//                                     (WIDE -- RUNAWAY OUTLIER at
//                                     pool_count much greater than
//                                     11).
//
// Bands on raw ptsm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 11 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR sextic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptsm < 1.4 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- sextic
//                          mean pulled UP hard by raising the large
//                          values to the 6th power dominates the
//                          anchor)
//   * spread               ptsm in [1.4, 1.5) (extreme-outlier
//                          regime where even the sextic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/6) so 10-
//                          partner pools cap near 1.47)
//   * wide                 ptsm >= 1.5 (RUNAWAY-OUTLIER regime with
//                          pool_count >> 11 where n^(1/6) climbs
//                          past the wide cutoff; only very large
//                          pools with dominant outliers reach here)
//
// Both cutoffs are exposed on the envelope as tight_ptsm_max /
// wide_ptsm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptsm = MORE range against sextic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM + P11.264 PTQNM
// tight/spread/wide vocabulary). Reuses the exact 3-band label set
// so a reader scanning the DISPERSION additive/ratio family sees
// the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.267):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinticMeanSection
// (P11.264) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sextic-center after
// the P11.264 range-against-quintic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN (this module)
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
type PtsmLabel =
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

// Bands on raw ptsm (fixed cutoffs since sextic_mean scales with
// cell counts and typical sextic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 11 read wide. Cutoffs tighten P11.264 PTQNM's 1.5/1.7
// pair down to 1.4/1.5 because sextic_mean >= quintic_mean by Power
// Mean inequality (M_6 >= M_5) so ptsm <= ptqnm for every non-flat
// pool -- keeping the spread cutoff at 1.4 means the MILD-OUTLIER
// regime (which P11.264 PTQNM already reads TIGHT) stays TIGHT here
// too, the EXTREME-OUTLIER regime (which P11.264 reads SPREAD) stays
// SPREAD here as well, and the wide cutoff drops from 1.7 to 1.5 so
// only pool_count > 11 pools reach wide (11.4^(1/6) ~= 1.5 is the
// exact asymptote crossing).
const TIGHT_PTSM_MAX = 1.4;
const WIDE_PTSM_MIN = 1.5;

// PTSM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTSM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sextic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sextic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsm_max: number;
  readonly wide_ptsm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexticMeanMap;
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

// Peak-to-sextic-mean of a discrete distribution:
//   PTSM = (max - min) / sextic_mean
// where sextic_mean = ((sum x_i^6) / n)^(1/6). Returns null on
// empty, solo, and degenerate (zero sextic_mean or non-finite
// sixth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sextic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_sextic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and SM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_sextic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_sextic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    sixthSum += sq * sq * sq;
  }
  if (!Number.isFinite(sixthSum) || sixthSum <= 0) {
    // Belt-and-braces: sum of sixth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_sextic_mean: null };
  }
  const sextic_mean = Math.pow(sixthSum / pool_count, 1 / 6);
  if (!Number.isFinite(sextic_mean) || sextic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_sextic_mean: null };
  }
  const range = max - min;
  const ptsm = range / sextic_mean;
  // Clamp tiny negative float-noise to 0; ptsm is non-negative by
  // construction because range >= 0 and sextic_mean > 0.
  const clamped = ptsm < 0 ? 0 : ptsm;
  return {
    pool_count,
    pool_cells,
    peak_to_sextic_mean: roundTo(clamped, PTSM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sextic_mean: partner.peak_to_sextic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sextic_mean: metric.peak_to_sextic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexticMean {
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
    tight_ptsm_max: TIGHT_PTSM_MAX,
    wide_ptsm_min: WIDE_PTSM_MIN,
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

function labelForPtsm(
  pool_count: number,
  pool_cells: number,
  ptsm: number | null,
  tight_max: number,
  wide_min: number,
): PtsmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsm === null) return "degenerate";
  if (ptsm >= wide_min) return "wide";
  if (ptsm < tight_max) return "tight";
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

function renderPtsmCell(
  pool_count: number,
  pool_cells: number,
  ptsm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsm(
    pool_count,
    pool_cells,
    ptsm,
    tight_max,
    wide_min,
  );
  const ptsmText = ptsm === null ? "-" : ptsm.toFixed(4);
  return `PTSM ${ptsmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsm_max, wide_ptsm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sextic_mean, tight_ptsm_max, wide_ptsm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sextic_mean, tight_ptsm_max, wide_ptsm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXTIC-CENTER scalar over the P11.161 pool &mdash; ptsm = (max - min) / sextic_mean where sextic_mean = ((sum x_i^6) / n)^(1/6). Reads the pool's total RANGE in units of its SEXTIC (power-mean-of-order-6, M_6) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.264 PTQNM because raising the large values to the SIXTH power before averaging lifts the anchor MORE than raising to the fifth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the SEXTIC (POWER-MEAN-OF-ORDER-6) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5) power-mean septet into an OCTET with the M_6 sextic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsm approaches n^(1/6) so 10-partner pools cap near 1.47 and only pools with pool_count &gt;&gt; 11 escape into wide (11.4^(1/6) ~= 1.5 is the exact asymptote crossing). Composite regime labels: PTSM tight + PTQNM tight + PTQCM tight + PTCM tight + PTRMS spread = MILD OUTLIER absorbed by sextic ([1x9, 10] reads PTSM 1.321 tight); PTSM spread + PTQNM spread + PTQCM spread + PTCM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTSM 1.4531 spread); PTSM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 2.1329 wide); PTSM tight + PTQNM tight + PTQCM tight + PTCM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.1112 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sextic_mean == 0 (guarded but unreachable), tight = ptsm &lt; ${tight_ptsm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptsm in [${tight_ptsm_max}, ${wide_ptsm_min}) (extreme-outlier regime), wide = ptsm &ge; ${wide_ptsm_min} (runaway-outlier regime with pool_count much greater than 11). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
