// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DECIC-MEAN
// pure-lib (P11.274).
//
// WHOLE-POOL RANGE-AGAINST-DECIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's DECIC
// MEAN (a.k.a. power mean of order 10, M_10):
//
//   ptdm = (max - min) / decic_mean
//
// where decic_mean = ((sum x_i^10) / n)^(1/10). Reads the peak spread
// against the DECIC (power-mean-of-order-10) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.272 PTNM, because
// raising to the TENTH power before averaging lifts the anchor MORE
// than raising to the ninth does, dampening the ratio against the
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
//
// PTDM's unique DISPERSION-axis contribution: reads range in units
// of the DECIC (POWER-MEAN-OF-ORDER-10) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9). The DECIC mean is the FIRST power mean
// above the NONIC in the Power Mean hierarchy -- it is pulled toward
// LARGE values EVEN HARDER than the nonic mean by the Power Mean
// inequality (harmean <= geomean <= mean <= rms <= cubic_mean <=
// quartic_mean <= quintic_mean <= sextic_mean <= septic_mean <=
// octic_mean <= nonic_mean <= decic_mean; equality iff all values
// equal). PTDM's contrast with PTNM + PTOM + PTSEM + PTSM + PTQNM +
// PTQCM + PTCM + PTRMS + PTMEAN + PTGM + PTH extends the (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic, sextic,
// septic, octic, nonic) power-mean centre-anchor UNDECET into a
// DUODECET (harmonic, geometric, arithmetic, quadratic, cubic,
// quartic, quintic, sextic, septic, octic, nonic, decic), and lets a
// reader read the OUTLIER-DAMPENING GRADIENT across TWELVE
// increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTDM+PTNM+PTOM+PTSEM:
//
//   * PTDM tight + PTNM tight + PTOM tight + PTSEM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTDM tight + PTNM tight + PTOM tight + PTSEM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM absorb by raising the
//                                     outlier to the 4th + 5th + 6th
//                                     + 7th + 8th + 9th + 10th power
//                                     into the anchor. Reference:
//                                     [1x9, 10] reads PTDM 1.1330
//                                     tight, PTNM 1.1624 tight,
//                                     PTOM 1.2002 tight, PTSEM
//                                     1.2505 tight, PTRMS 2.726
//                                     spread.
//   * PTDM spread + PTNM spread + PTOM spread + PTSEM spread
//                                     -> EXTREME OUTLIER that even
//                                     the decic mean cannot absorb
//                                     fully; range still lifts PTDM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTDM 1.2463
//                                     spread, PTNM 1.2786 spread.
//   * PTDM wide + PTNM wide + PTOM wide + PTSEM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 10th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/10). Reference:
//                                     [1x99, 100] reads PTDM 1.5691
//                                     wide.
//   * PTDM tight + PTNM tight + PTOM tight + PTSEM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTDM 1.0611 tight, PTNM
//                                     1.0693 tight, PTOM 1.0796
//                                     tight.
//   * PTDM wide + PTNM tight          -> unreachable because
//                                     decic_mean is ALWAYS >=
//                                     nonic_mean by Power Mean
//                                     inequality (M_10 >= M_9), so
//                                     ptdm = range/decic_mean <=
//                                     ptnm = range/nonic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTDM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// decic_mean approaches x_max / n^(1/10), so ptdm approaches
// (x_max - x_min) / (x_max / n^(1/10)) = n^(1/10) * (1 - x_min/x_max)
// -> n^(1/10) as x_max -> +Inf. For n=10 the ceiling is 10^(1/10) ~=
// 1.2589, so even the most extreme outlier in a 10-partner pool
// reads ptdm just below 1.26 (spread but never above ~1.26). For
// n=100 the ceiling climbs to 100^(1/10) ~= 1.5849, so a large pool
// with a dominant outlier reads wide. Pools with pool_count > 10
// escape into wide (since 11^(1/10) ~= 1.2705 > wide_min = 1.26 so
// pool_count >= 11 pools can reach wide). This asymptotic behaviour
// makes PTDM an even CLEANER outlier-tolerance read than PTNM in the
// peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptdm null (empty pool).
//   * pool_count 1                  -> ptdm null (solo -- range = 0
//                                     and DM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptdm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptdm null (decic_mean_zero
//     decic_mean == 0                 -- unreachable since decic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptdm in [0, +Inf) rounded to
//     decic_mean > 0                  4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and decic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> DM = k, range 0, ptdm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^10) = 14914341925, DM =
//                                     1491434192.5^(1/10) ~= 8.2677,
//                                     range 9, ptdm ~= 1.0886 (tight
//                                     -- well under the 1.15 tight/
//                                     spread boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^10) = 10000000009, DM =
//                                     1000000000.9^(1/10) ~= 7.9433,
//                                     range 9, ptdm ~= 1.1330 (tight
//                                     -- MILD-SINGLE-OUTLIER absorbed
//                                     by the decic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.272 PTNM's
//                                     1.1624 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^10) = 19531258, DM =
//                                     1953125.8^(1/10) ~= 4.2570,
//                                     range 4, ptdm ~= 0.9397 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^10) = 50000000005, DM =
//                                     5000000000.5^(1/10) ~= 9.3300,
//                                     range 9, ptdm ~= 0.9646 (tight
//                                     -- BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^10) = 10^20 + 9, DM =
//                                     10^19^(1/10) ~= 79.4328, range
//                                     99, ptdm ~= 1.2463 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/10) ~ 1.2589 asymptote and
//                                     lands just above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> sum(x^10) = 3486784402, DM =
//                                     1743392201^(1/10) ~= 8.3969,
//                                     range 8, ptdm ~= 0.9527 (tight).
//   * two-partner [1, 100]          -> sum(x^10) = 10^20 + 1, DM =
//                                     5x10^19^(1/10) ~= 93.3057,
//                                     range 99, ptdm ~= 1.0611 (tight
//                                     -- ISOLATED HIGH PARTNER; decic
//                                     mean captures the outlier).
//   * small [10, 1, 1]              -> sum(x^10) = 10000000002, DM =
//                                     3333333334^(1/10) ~= 8.9591,
//                                     range 9, ptdm ~= 1.0045 (TIGHT
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTDM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/10) ~= 1.1161 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^10) = 10^20 + 99, DM =
//                                     10^18^(1/10) ~= 63.0957, range
//                                     99, ptdm ~= 1.5691 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptdm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR decic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptdm < 1.15 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- decic mean
//                          pulled UP hard by raising the large
//                          values to the 10th power dominates the
//                          anchor)
//   * spread               ptdm in [1.15, 1.26) (extreme-outlier
//                          regime where even the decic-lifted anchor
//                          leaves the range slightly dominant --
//                          asymptotic ceiling ~ n^(1/10) so 10-
//                          partner pools cap near 1.2589)
//   * wide                 ptdm >= 1.26 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 11 where n^(1/10) climbs
//                          past the wide cutoff; only pools of size
//                          11 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptdm_max /
// wide_ptdm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptdm = MORE range against decic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM + P11.264 PTQNM +
// P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM + P11.272 PTNM tight/
// spread/wide vocabulary). Reuses the exact 3-band label set so a
// reader scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.275):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNonicMeanSection
// (P11.272) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-decic-center after
// the P11.272 range-against-nonic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN (P11.266) ->
// PEAK-TO-SEPTIC-MEAN (P11.268) -> PEAK-TO-OCTIC-MEAN (P11.270) ->
// PEAK-TO-NONIC-MEAN (P11.272) -> PEAK-TO-DECIC-MEAN (this module)
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
type PtdmLabel =
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

// Bands on raw ptdm (fixed cutoffs since decic_mean scales with
// cell counts and typical decic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 10 read wide. Cutoffs tighten P11.272 PTNM's
// 1.20/1.30 pair down to 1.15/1.26 because decic_mean >= nonic_mean
// by Power Mean inequality (M_10 >= M_9) so ptdm <= ptnm for every
// non-flat pool -- keeping the spread cutoff at 1.15 means the MILD-
// OUTLIER regime (which P11.272 PTNM reads TIGHT at 1.1624) stays
// TIGHT here too (1.1330 < 1.15), the EXTREME-OUTLIER regime (which
// P11.272 reads SPREAD) stays SPREAD here as well (1.2463 in [1.15,
// 1.26)), and the wide cutoff drops from 1.30 to 1.26 so only
// pool_count >= 11 pools reach wide (11^(1/10) ~= 1.2705 is just
// past the wide floor).
const TIGHT_PTDM_MAX = 1.15;
const WIDE_PTDM_MIN = 1.26;

// PTDM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTDM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_decic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_decic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdm_max: number;
  readonly wide_ptdm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDecicMeanMap;
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

// Peak-to-decic-mean of a discrete distribution:
//   PTDM = (max - min) / decic_mean
// where decic_mean = ((sum x_i^10) / n)^(1/10). Returns null on
// empty, solo, and degenerate (zero decic_mean or non-finite
// tenth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_decic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_decic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and DM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_decic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_decic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let tenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    tenthSum += oct * sq;
  }
  if (!Number.isFinite(tenthSum) || tenthSum <= 0) {
    // Belt-and-braces: sum of tenth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_decic_mean: null };
  }
  const decic_mean = Math.pow(tenthSum / pool_count, 1 / 10);
  if (!Number.isFinite(decic_mean) || decic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_decic_mean: null };
  }
  const range = max - min;
  const ptdm = range / decic_mean;
  // Clamp tiny negative float-noise to 0; ptdm is non-negative by
  // construction because range >= 0 and decic_mean > 0.
  const clamped = ptdm < 0 ? 0 : ptdm;
  return {
    pool_count,
    pool_cells,
    peak_to_decic_mean: roundTo(clamped, PTDM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_decic_mean: partner.peak_to_decic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_decic_mean: metric.peak_to_decic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicMean {
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
    tight_ptdm_max: TIGHT_PTDM_MAX,
    wide_ptdm_min: WIDE_PTDM_MIN,
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

function labelForPtdm(
  pool_count: number,
  pool_cells: number,
  ptdm: number | null,
  tight_max: number,
  wide_min: number,
): PtdmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdm === null) return "degenerate";
  if (ptdm >= wide_min) return "wide";
  if (ptdm < tight_max) return "tight";
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

function renderPtdmCell(
  pool_count: number,
  pool_cells: number,
  ptdm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdm(
    pool_count,
    pool_cells,
    ptdm,
    tight_max,
    wide_min,
  );
  const ptdmText = ptdm === null ? "-" : ptdm.toFixed(4);
  return `PTDM ${ptdmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdm_max, wide_ptdm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_decic_mean, tight_ptdm_max, wide_ptdm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_decic_mean, tight_ptdm_max, wide_ptdm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DECIC-CENTER scalar over the P11.161 pool &mdash; ptdm = (max - min) / decic_mean where decic_mean = ((sum x_i^10) / n)^(1/10). Reads the pool's total RANGE in units of its DECIC (power-mean-of-order-10, M_10) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.272 PTNM because raising the large values to the TENTH power before averaging lifts the anchor MORE than raising to the ninth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the DECIC (POWER-MEAN-OF-ORDER-10) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9) power-mean undecet into a DUODECET with the M_10 decic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdm approaches n^(1/10) so 10-partner pools cap near 1.2589 and only pools with pool_count &gt;= 11 escape into wide (11^(1/10) ~= 1.2705 is just past the wide floor). Composite regime labels: PTDM tight + PTNM tight + PTOM tight + PTSEM tight + PTRMS spread = MILD OUTLIER absorbed by decic ([1x9, 10] reads PTDM 1.1330 tight); PTDM spread + PTNM spread + PTOM spread + PTSEM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTDM 1.2463 spread); PTDM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.5691 wide); PTDM tight + PTNM tight + PTOM tight + PTSEM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0611 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR decic_mean == 0 (guarded but unreachable), tight = ptdm &lt; ${tight_ptdm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptdm in [${tight_ptdm_max}, ${wide_ptdm_min}) (extreme-outlier regime), wide = ptdm &ge; ${wide_ptdm_min} (runaway-outlier regime with pool_count &gt;= 11). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
