// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINDECIC-MEAN
// pure-lib (P11.284).
//
// WHOLE-POOL RANGE-AGAINST-QUINDECIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// QUINDECIC MEAN (a.k.a. power mean of order 15, M_15):
//
//   ptqim = (max - min) / quindecic_mean
//
// where quindecic_mean = ((sum x_i^15) / n)^(1/15). Reads the peak
// spread against the QUINDECIC (power-mean-of-order-15) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.282
// PTQTM, because raising to the FIFTEENTH power before averaging
// lifts the anchor MORE than raising to the fourteenth does, dampening
// the ratio against the range even harder.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                    - max - min in raw units.
//   * P11.199 MAD                      - mean(|x_i - mean|).
//   * P11.201 MedAD                    - median(|x_i - median|).
//   * P11.145 CV                       - sigma / mean.
//   * P11.211 QCD                      - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE     - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE        - (max - min) / sigma_population.
//   * P11.238 GMD                      - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN           - (max - min) / median.
//   * P11.242 PEAK-TO-Q1               - (max - min) / Q1.
//   * P11.244 PEAK-TO-Q3               - (max - min) / Q3.
//   * P11.246 PEAK-TO-MEAN             - (max - min) / mean.        [M_1]
//   * P11.248 PEAK-TO-GEOMEAN          - (max - min) / geomean.     [M_0]
//   * P11.250 PEAK-TO-HARMEAN          - (max - min) / harmean.     [M_-1]
//   * P11.252 PEAK-TO-RMS              - (max - min) / rms.         [M_2]
//   * P11.254 PEAK-TO-MIDHINGE         - (max - min) / midhinge.
//   * P11.256 PEAK-TO-TRIMEAN          - (max - min) / trimean.
//   * P11.258 PEAK-TO-QUARTILE-MEAN    - (max - min) / quartile_mean.
//   * P11.260 PEAK-TO-CUBIC-MEAN       - (max - min) / cubic_mean.  [M_3]
//   * P11.262 PEAK-TO-QUARTIC-MEAN     - (max - min) / quartic_mean.[M_4]
//   * P11.264 PEAK-TO-QUINTIC-MEAN     - (max - min) / quintic_mean.[M_5]
//   * P11.266 PEAK-TO-SEXTIC-MEAN      - (max - min) / sextic_mean. [M_6]
//   * P11.268 PEAK-TO-SEPTIC-MEAN      - (max - min) / septic_mean. [M_7]
//   * P11.270 PEAK-TO-OCTIC-MEAN       - (max - min) / octic_mean.  [M_8]
//   * P11.272 PEAK-TO-NONIC-MEAN       - (max - min) / nonic_mean.  [M_9]
//   * P11.274 PEAK-TO-DECIC-MEAN       - (max - min) / decic_mean.  [M_10]
//   * P11.276 PEAK-TO-UNDECIC-MEAN     - (max - min) / undecic_mean.[M_11]
//   * P11.278 PEAK-TO-DUODECIC-MEAN    - (max - min) / duodecic_mean.[M_12]
//   * P11.280 PEAK-TO-TREDECIC-MEAN    - (max - min) / tredecic_mean.[M_13]
//   * P11.282 PEAK-TO-QUATTUORDECIC-MEAN - (max - min) / quattuordecic_mean.[M_14]
//
// PTQIM's unique DISPERSION-axis contribution: reads range in units
// of the QUINDECIC (POWER-MEAN-OF-ORDER-15) CENTER. Every other
// range-based DISPERSION surface anchors on a scale statistic (P11.237),
// a total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12,
// tredecic M_13, quattuordecic M_14). The QUINDECIC mean is the FIRST
// power mean above the QUATTUORDECIC in the Power Mean hierarchy --
// it is pulled toward LARGE values EVEN HARDER than the quattuordecic
// mean by the Power Mean inequality (harmean <= geomean <= mean <=
// rms <= cubic_mean <= quartic_mean <= quintic_mean <= sextic_mean <=
// septic_mean <= octic_mean <= nonic_mean <= decic_mean <=
// undecic_mean <= duodecic_mean <= tredecic_mean <=
// quattuordecic_mean <= quindecic_mean; equality iff all values
// equal). PTQIM's contrast with PTQTM + PTTRM + PTDUM + PTUM + PTDM +
// PTNM + PTOM + PTSEM + PTSM + PTQNM + PTQCM + PTCM + PTRMS + PTMEAN
// + PTGM + PTH extends the (harmonic, geometric, arithmetic,
// quadratic, cubic, quartic, quintic, sextic, septic, octic, nonic,
// decic, undecic, duodecic, tredecic, quattuordecic) power-mean
// centre-anchor SEDECET into a SEPTENDECET (harmonic, geometric,
// arithmetic, quadratic, cubic, quartic, quintic, sextic, septic,
// octic, nonic, decic, undecic, duodecic, tredecic, quattuordecic,
// quindecic), and lets a reader read the OUTLIER-DAMPENING GRADIENT
// across SEVENTEEN increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTQIM+PTQTM+PTTRM+PTDUM+PTUM:
//
//   * PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTUM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTUM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM + PTTRM +
//                                     PTQTM + PTQIM absorb by raising
//                                     the outlier to the 4th + 5th +
//                                     6th + 7th + 8th + 9th + 10th +
//                                     11th + 12th + 13th + 14th + 15th
//                                     power into the anchor. Reference:
//                                     [1x9, 10] reads PTQIM 1.0493
//                                     tight, PTQTM 1.0609 tight, PTTRM
//                                     1.0744 tight, PTRMS 2.726 spread.
//   * PTQIM spread + PTQTM spread + PTTRM spread + PTDUM spread + PTUM spread
//                                     -> EXTREME OUTLIER that even
//                                     the quindecic mean cannot
//                                     absorb fully; range still lifts
//                                     PTQIM into spread. Reference:
//                                     [1x9, 100] reads PTQIM 1.1543
//                                     spread, PTQTM 1.1670 spread,
//                                     PTTRM 1.1818 spread.
//   * PTQIM wide + PTQTM wide + PTTRM wide + PTDUM wide + PTUM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 15th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/15). Reference:
//                                     [1x99, 100] reads PTQIM 1.3458
//                                     wide.
//   * PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTUM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTQIM 1.0368 tight, PTQTM
//                                     1.0402 tight, PTTRM 1.0442
//                                     tight.
//   * PTQIM wide + PTQTM tight        -> unreachable because
//                                     quindecic_mean is ALWAYS >=
//                                     quattuordecic_mean by Power
//                                     Mean inequality (M_15 >= M_14),
//                                     so ptqim = range/quindecic_mean
//                                     <= ptqtm = range/quattuordecic_mean
//                                     by construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTQIM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// quindecic_mean approaches x_max / n^(1/15), so ptqim approaches
// (x_max - x_min) / (x_max / n^(1/15)) = n^(1/15) * (1 - x_min/x_max)
// -> n^(1/15) as x_max -> +Inf. For n=10 the ceiling is 10^(1/15) ~=
// 1.1659, so even the most extreme outlier in a 10-partner pool
// reads ptqim just below 1.17 (spread but never above ~1.1659). For
// n=100 the ceiling climbs to 100^(1/15) ~= 1.3594, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 12
// escape into wide (since 12^(1/15) ~= 1.1802 > wide_min = 1.18 so
// pool_count >= 12 pools can reach wide). This asymptotic behaviour
// makes PTQIM an even CLEANER outlier-tolerance read than PTQTM in
// the peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptqim null (empty pool).
//   * pool_count 1                  -> ptqim null (solo -- range = 0
//                                     and QIM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptqim null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptqim null (quindecic_mean_zero
//     quindecic_mean == 0             -- unreachable since quindecic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptqim in [0, +Inf) rounded to
//     quindecic_mean > 0              4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and quindecic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> QIM = k, range 0, ptqim 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^15) = 1246324856379625, QIM =
//                                     124632485637962.5^(1/15) ~= 8.7038,
//                                     range 9, ptqim ~= 1.0340 (tight
//                                     -- well under the 1.06 tight/
//                                     spread boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^15) = 10^15 + 9, QIM =
//                                     100000000000000.9^(1/15) ~= 8.5770,
//                                     range 9, ptqim ~= 1.0493 (tight
//                                     -- MILD-SINGLE-OUTLIER absorbed
//                                     by the quindecic mean where
//                                     P11.252 PTRMS reads spread +
//                                     P11.250 PTH + P11.248 PTGM read
//                                     wide; even softer than P11.282
//                                     PTQTM's 1.0609 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^15) = 61035156258, QIM =
//                                     6103515625.8^(1/15) ~= 4.4913,
//                                     range 4, ptqim ~= 0.8906 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^15) = 5x10^15 + 5, QIM =
//                                     500000000000000.5^(1/15) ~= 9.5484,
//                                     range 9, ptqim ~= 0.9426 (tight
//                                     -- BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^15) = 10^30 + 9, QIM =
//                                     10^29^(1/15) ~= 85.7696, range
//                                     99, ptqim ~= 1.1543 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/15) ~ 1.1659 asymptote and
//                                     lands well above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> sum(x^15) = 205891132094650, QIM =
//                                     102945566047325^(1/15) ~= 8.5936,
//                                     range 8, ptqim ~= 0.9309 (tight).
//   * two-partner [1, 100]          -> sum(x^15) = 10^30 + 1, QIM =
//                                     (5x10^29)^(1/15) ~= 95.4842,
//                                     range 99, ptqim ~= 1.0368 (tight
//                                     -- ISOLATED HIGH PARTNER;
//                                     quindecic mean captures the
//                                     outlier).
//   * small [10, 1, 1]              -> sum(x^15) = 10^15 + 2, QIM =
//                                     (10^15 + 2)/3)^(1/15) ~= 9.2938,
//                                     range 9, ptqim ~= 0.9684 (TIGHT
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTQIM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/15) ~= 1.0760 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^15) = 10^30 + 99, QIM =
//                                     10^28^(1/15) ~= 73.5642, range
//                                     99, ptqim ~= 1.3458 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptqim (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR quindecic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptqim < 1.06 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- quindecic
//                          mean pulled UP hard by raising the large
//                          values to the 15th power dominates the
//                          anchor)
//   * spread               ptqim in [1.06, 1.18) (extreme-outlier
//                          regime where even the quindecic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/15) so 10-
//                          partner pools cap near 1.1659)
//   * wide                 ptqim >= 1.18 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 12 where n^(1/15) climbs
//                          past the wide cutoff; only pools of size
//                          12 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptqim_max /
// wide_ptqim_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptqim = MORE range against quindecic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN +
// P11.248 PTGM + P11.250 PTH + P11.252 PTRMS + P11.254 PTMH +
// P11.256 PTTRI + P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM +
// P11.264 PTQNM + P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM +
// P11.272 PTNM + P11.274 PTDM + P11.276 PTUM + P11.278 PTDUM +
// P11.280 PTTRM + P11.282 PTQTM tight/spread/wide vocabulary).
// Reuses the exact 3-band label set so a reader scanning the
// DISPERSION additive/ratio family sees the same vocabulary across
// every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.285):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuordecicMeanSection
// (P11.282) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quindecic-center
// after the P11.282 range-against-quattuordecic-center landing. The
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE
// (P11.254) -> PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN
// (P11.258) -> PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN
// (P11.262) -> PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN
// (P11.266) -> PEAK-TO-SEPTIC-MEAN (P11.268) -> PEAK-TO-OCTIC-MEAN
// (P11.270) -> PEAK-TO-NONIC-MEAN (P11.272) -> PEAK-TO-DECIC-MEAN
// (P11.274) -> PEAK-TO-UNDECIC-MEAN (P11.276) -> PEAK-TO-DUODECIC-MEAN
// (P11.278) -> PEAK-TO-TREDECIC-MEAN (P11.280) -> PEAK-TO-
// QUATTUORDECIC-MEAN (P11.282) -> PEAK-TO-QUINDECIC-MEAN (this
// module) -> per-pair hot-cells GRANULAR (P11.139).

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
type PtqimLabel =
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

// Bands on raw ptqim (fixed cutoffs since quindecic_mean scales
// with cell counts and typical quindecic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools read
// tight, extreme-outlier pools read spread, and RUNAWAY-OUTLIER
// pools with pool_count >> 10 read wide. Cutoffs tighten P11.282
// PTQTM's 1.07/1.19 pair down to 1.06/1.18 because quindecic_mean
// >= quattuordecic_mean by Power Mean inequality (M_15 >= M_14) so
// ptqim <= ptqtm for every non-flat pool -- keeping the spread
// cutoff at 1.06 means the MILD-OUTLIER regime (which P11.282 PTQTM
// reads TIGHT at 1.0609) stays TIGHT here too (1.0493 < 1.06), the
// EXTREME-OUTLIER regime (which P11.282 reads SPREAD) stays SPREAD
// here as well (1.1543 in [1.06, 1.18)), and the wide cutoff drops
// from 1.19 to 1.18 so only pool_count >= 12 pools reach wide
// (12^(1/15) ~= 1.1802 is just past the wide floor).
const TIGHT_PTQIM_MAX = 1.06;
const WIDE_PTQIM_MIN = 1.18;

// PTQIM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQIM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quindecic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quindecic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuindecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqim_max: number;
  readonly wide_ptqim_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanMap;
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

// Peak-to-quindecic-mean of a discrete distribution:
//   PTQIM = (max - min) / quindecic_mean
// where quindecic_mean = ((sum x_i^15) / n)^(1/15). Returns null on
// empty, solo, and degenerate (zero quindecic_mean or non-finite
// fifteenth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quindecic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quindecic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and QIM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_quindecic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quindecic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fifteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^15 = x^8 * x^4 * x^2 * x
    fifteenthSum += oct * quad * sq * v;
  }
  if (!Number.isFinite(fifteenthSum) || fifteenthSum <= 0) {
    // Belt-and-braces: sum of fifteenth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_quindecic_mean: null };
  }
  const quindecic_mean = Math.pow(fifteenthSum / pool_count, 1 / 15);
  if (!Number.isFinite(quindecic_mean) || quindecic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_quindecic_mean: null };
  }
  const range = max - min;
  const ptqim = range / quindecic_mean;
  // Clamp tiny negative float-noise to 0; ptqim is non-negative by
  // construction because range >= 0 and quindecic_mean > 0.
  const clamped = ptqim < 0 ? 0 : ptqim;
  return {
    pool_count,
    pool_cells,
    peak_to_quindecic_mean: roundTo(clamped, PTQIM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quindecic_mean: partner.peak_to_quindecic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quindecic_mean: metric.peak_to_quindecic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuindecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuindecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuindecicMean {
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
    tight_ptqim_max: TIGHT_PTQIM_MAX,
    wide_ptqim_min: WIDE_PTQIM_MIN,
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

function labelForPtqim(
  pool_count: number,
  pool_cells: number,
  ptqim: number | null,
  tight_max: number,
  wide_min: number,
): PtqimLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqim === null) return "degenerate";
  if (ptqim >= wide_min) return "wide";
  if (ptqim < tight_max) return "tight";
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

function renderPtqimCell(
  pool_count: number,
  pool_cells: number,
  ptqim: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqim(
    pool_count,
    pool_cells,
    ptqim,
    tight_max,
    wide_min,
  );
  const ptqimText = ptqim === null ? "-" : ptqim.toFixed(4);
  return `PTQIM ${ptqimText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuindecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuindecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqim_max, wide_ptqim_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqimCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quindecic_mean, tight_ptqim_max, wide_ptqim_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqimCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quindecic_mean, tight_ptqim_max, wide_ptqim_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINDECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINDECIC-CENTER scalar over the P11.161 pool &mdash; ptqim = (max - min) / quindecic_mean where quindecic_mean = ((sum x_i^15) / n)^(1/15). Reads the pool's total RANGE in units of its QUINDECIC (power-mean-of-order-15, M_15) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.282 PTQTM because raising the large values to the FIFTEENTH power before averaging lifts the anchor MORE than raising to the fourteenth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the QUINDECIC (POWER-MEAN-OF-ORDER-15) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12, tredecic M_13, quattuordecic M_14) power-mean sedecet into a SEPTENDECET with the M_15 quindecic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqim approaches n^(1/15) so 10-partner pools cap near 1.1659 and only pools with pool_count &gt;= 12 escape into wide (12^(1/15) ~= 1.1802 is just past the wide floor). Composite regime labels: PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTUM tight + PTRMS spread = MILD OUTLIER absorbed by quindecic ([1x9, 10] reads PTQIM 1.0493 tight); PTQIM spread + PTQTM spread + PTTRM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTQIM 1.1543 spread); PTQIM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.3458 wide); PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTUM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0368 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quindecic_mean == 0 (guarded but unreachable), tight = ptqim &lt; ${tight_ptqim_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptqim in [${tight_ptqim_max}, ${wide_ptqim_min}) (extreme-outlier regime), wide = ptqim &ge; ${wide_ptqim_min} (runaway-outlier regime with pool_count &gt;= 12). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqim null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
