// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-VIGINTIC-MEAN
// pure-lib (P11.294).
//
// WHOLE-POOL RANGE-AGAINST-VIGINTIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// VIGINTIC MEAN (a.k.a. power mean of order 20, M_20):
//
//   ptvim = (max - min) / vigintic_mean
//
// where vigintic_mean = ((sum x_i^20) / n)^(1/20). Reads the peak
// spread against the VIGINTIC (power-mean-of-order-20) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.292
// PTNVM, because raising to the TWENTIETH power before averaging
// lifts the anchor MORE than raising to the nineteenth does,
// dampening the ratio against the range even harder.
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
//   * P11.284 PEAK-TO-QUINDECIC-MEAN   - (max - min) / quindecic_mean.[M_15]
//   * P11.286 PEAK-TO-SEDECIC-MEAN     - (max - min) / sedecic_mean.[M_16]
//   * P11.288 PEAK-TO-SEPTENDECIC-MEAN - (max - min) / septendecic_mean.[M_17]
//   * P11.290 PEAK-TO-OCTODECIC-MEAN   - (max - min) / octodecic_mean.[M_18]
//   * P11.292 PEAK-TO-NOVEMDECIC-MEAN  - (max - min) / novemdecic_mean.[M_19]
//
// PTVIM's unique DISPERSION-axis contribution: reads range in units
// of the VIGINTIC (POWER-MEAN-OF-ORDER-20) CENTER. Every other
// range-based DISPERSION surface anchors on a scale statistic (P11.237),
// a total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12,
// tredecic M_13, quattuordecic M_14, quindecic M_15, sedecic M_16,
// septendecic M_17, octodecic M_18, novemdecic M_19). The VIGINTIC
// mean is the FIRST power mean above the NOVEMDECIC in the Power Mean
// hierarchy -- it is pulled toward LARGE values EVEN HARDER than the
// novemdecic mean by the Power Mean inequality (harmean <= geomean <=
// mean <= rms <= cubic_mean <= quartic_mean <= quintic_mean <=
// sextic_mean <= septic_mean <= octic_mean <= nonic_mean <=
// decic_mean <= undecic_mean <= duodecic_mean <= tredecic_mean <=
// quattuordecic_mean <= quindecic_mean <= sedecic_mean <=
// septendecic_mean <= octodecic_mean <= novemdecic_mean <=
// vigintic_mean; equality iff all values equal). PTVIM's contrast with
// PTNVM + PTSOM + PTSPM + PTSDM + PTQIM + PTQTM + PTTRM + PTDUM + PTUM
// + PTDM + PTNM + PTOM + PTSEM + PTSM + PTQNM + PTQCM + PTCM + PTRMS
// + PTMEAN + PTGM + PTH extends the (harmonic, geometric, arithmetic,
// quadratic, cubic, quartic, quintic, sextic, septic, octic, nonic,
// decic, undecic, duodecic, tredecic, quattuordecic, quindecic,
// sedecic, septendecic, octodecic, novemdecic) power-mean centre-
// anchor VIGESIMOPRIMET into a VIGESIMOSECUNDET (harmonic, geometric,
// arithmetic, quadratic, cubic, quartic, quintic, sextic, septic,
// octic, nonic, decic, undecic, duodecic, tredecic, quattuordecic,
// quindecic, sedecic, septendecic, octodecic, novemdecic, vigintic),
// and lets a reader read the OUTLIER-DAMPENING GRADIENT across
// TWENTY-TWO increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTVIM+PTNVM+PTSOM+PTSPM+PTSDM:
//
//   * PTVIM tight + PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTVIM tight + PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM + PTTRM +
//                                     PTQTM + PTQIM + PTSDM + PTSPM +
//                                     PTSOM + PTNVM + PTVIM absorb by
//                                     raising the outlier to the 4th
//                                     + 5th + 6th + 7th + 8th + 9th +
//                                     10th + 11th + 12th + 13th +
//                                     14th + 15th + 16th + 17th +
//                                     18th + 19th + 20th power into
//                                     the anchor. Reference:
//                                     [1x9, 10] reads PTVIM 1.0098
//                                     tight (just under the 1.01
//                                     boundary), PTNVM 1.016 tight,
//                                     PTSOM 1.0228 tight.
//   * PTVIM spread + PTNVM spread + PTSOM spread + PTSPM spread + PTSDM spread
//                                     -> EXTREME OUTLIER that even
//                                     the vigintic mean cannot
//                                     absorb fully; range still lifts
//                                     PTVIM into spread. Reference:
//                                     [1x9, 100] reads PTVIM 1.1108
//                                     spread, PTNVM 1.1175 spread,
//                                     PTSOM 1.1251 spread.
//   * PTVIM wide + PTNVM wide + PTSOM wide + PTSPM wide + PTSDM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 20th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/20). Reference:
//                                     [1x99, 100] reads PTVIM 1.2463
//                                     wide.
//   * PTVIM spread + PTNVM spread + PTSOM tight + PTSPM tight + PTSDM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). The 1.01 tight/
//                                     spread boundary at M_20 continues
//                                     to catch this regime that P11.292
//                                     PTNVM first caught at 1.02. Ref:
//                                     [1, 100] reads PTVIM 1.0249
//                                     spread, PTNVM 1.0268 spread,
//                                     PTSOM 1.0289 tight.
//   * PTVIM wide + PTNVM tight        -> unreachable because
//                                     vigintic_mean is ALWAYS >=
//                                     novemdecic_mean by Power Mean
//                                     inequality (M_20 >= M_19), so
//                                     ptvim = range/vigintic_mean
//                                     <= ptnvm = range/novemdecic_mean
//                                     by construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTVIM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// vigintic_mean approaches x_max / n^(1/20), so ptvim approaches
// (x_max - x_min) / (x_max / n^(1/20)) = n^(1/20) * (1 - x_min/x_max)
// -> n^(1/20) as x_max -> +Inf. For n=10 the ceiling is 10^(1/20) ~=
// 1.1220, so even the most extreme outlier in a 10-partner pool
// reads ptvim just below 1.13 (spread but never above ~1.1220). For
// n=100 the ceiling climbs to 100^(1/20) ~= 1.2589, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 13
// escape into wide (since 13^(1/20) ~= 1.1368 > wide_min = 1.13 so
// pool_count >= 13 pools can reach wide). This asymptotic behaviour
// makes PTVIM an even CLEANER outlier-tolerance read than PTNVM in
// the peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptvim null (empty pool).
//   * pool_count 1                  -> ptvim null (solo -- range = 0
//                                     and VIM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptvim null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptvim null (vigintic_mean_zero
//     vigintic_mean == 0              -- unreachable since vigintic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptvim in [0, +Inf) rounded to
//     vigintic_mean > 0               4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and vigintic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> VIM = k, range 0, ptvim 0
//                                     (tight).
//   * uniform ramp [1..10]          -> VIM ~= 8.9687, range 9, ptvim
//                                     ~= 1.0035 (tight -- well under
//                                     the 1.01 tight/spread boundary).
//   * upper-outlier [1x9, 10]       -> VIM ~= 8.9125, range 9, ptvim
//                                     ~= 1.0098 (tight -- MILD-SINGLE-
//                                     OUTLIER absorbed by the
//                                     vigintic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.292 PTNVM's
//                                     1.016 tight landing; barely
//                                     clears the 1.01 boundary).
//   * two-shoulders [1x8, 5x2]      -> VIM ~= 4.6134, range 4, ptvim
//                                     ~= 0.867 (tight).
//   * 50/50 split [1x5, 10x5]       -> VIM ~= 9.6594, range 9, ptvim
//                                     ~= 0.9317 (tight -- BIMODAL
//                                     SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> VIM ~= 89.1251, range 99,
//                                     ptvim ~= 1.1108 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/20) ~ 1.1220 asymptote and
//                                     lands well above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> VIM ~= 8.6934, range 8, ptvim
//                                     ~= 0.9202 (tight).
//   * two-partner [1, 100]          -> VIM ~= 96.5936, range 99,
//                                     ptvim ~= 1.0249 (SPREAD --
//                                     ISOLATED HIGH PARTNER remains
//                                     above the 1.01 tight/spread
//                                     boundary at M_20; the 0.01-per-
//                                     step boundary tightening from
//                                     P11.292's 1.02 keeps this two-
//                                     partner regime in spread).
//   * small [10, 1, 1]              -> VIM ~= 9.4655, range 9, ptvim
//                                     ~= 0.9508 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTVIM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/20) ~= 1.0565 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> VIM ~= 79.4328, range 99,
//                                     ptvim ~= 1.2463 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptvim (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR vigintic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptvim < 1.01 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- vigintic
//                          mean pulled UP hard by raising the large
//                          values to the 20th power dominates the
//                          anchor)
//   * spread               ptvim in [1.01, 1.13) (extreme-outlier
//                          regime where even the vigintic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/20) so 10-
//                          partner pools cap near 1.1220)
//   * wide                 ptvim >= 1.13 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 13 where n^(1/20) climbs
//                          past the wide cutoff; only pools of size
//                          13 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptvim_max /
// wide_ptvim_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptvim = MORE range against vigintic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN +
// P11.248 PTGM + P11.250 PTH + P11.252 PTRMS + P11.254 PTMH +
// P11.256 PTTRI + P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM +
// P11.264 PTQNM + P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM +
// P11.272 PTNM + P11.274 PTDM + P11.276 PTUM + P11.278 PTDUM +
// P11.280 PTTRM + P11.282 PTQTM + P11.284 PTQIM + P11.286 PTSDM +
// P11.288 PTSPM + P11.290 PTSOM + P11.292 PTNVM tight/spread/wide
// vocabulary). Reuses the exact 3-band label set so a reader scanning
// the DISPERSION additive/ratio family sees the same vocabulary
// across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.295):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemdecicMeanSection
// (P11.292) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-vigintic-center
// after the P11.292 range-against-novemdecic-center landing. The
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE
// (P11.254) -> PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN
// (P11.258) -> PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN
// (P11.262) -> PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN
// (P11.266) -> PEAK-TO-SEPTIC-MEAN (P11.268) -> PEAK-TO-OCTIC-MEAN
// (P11.270) -> PEAK-TO-NONIC-MEAN (P11.272) -> PEAK-TO-DECIC-MEAN
// (P11.274) -> PEAK-TO-UNDECIC-MEAN (P11.276) -> PEAK-TO-DUODECIC-MEAN
// (P11.278) -> PEAK-TO-TREDECIC-MEAN (P11.280) -> PEAK-TO-
// QUATTUORDECIC-MEAN (P11.282) -> PEAK-TO-QUINDECIC-MEAN (P11.284)
// -> PEAK-TO-SEDECIC-MEAN (P11.286) -> PEAK-TO-SEPTENDECIC-MEAN
// (P11.288) -> PEAK-TO-OCTODECIC-MEAN (P11.290) -> PEAK-TO-NOVEMDECIC-
// MEAN (P11.292) -> PEAK-TO-VIGINTIC-MEAN (this module) -> per-pair
// hot-cells GRANULAR (P11.139).

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
type PtvimLabel =
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

// Bands on raw ptvim (fixed cutoffs since vigintic_mean scales
// with cell counts and typical vigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools read
// tight, extreme-outlier pools read spread, and RUNAWAY-OUTLIER
// pools with pool_count >> 10 read wide. Cutoffs tighten P11.292
// PTNVM's 1.02/1.14 pair down to 1.01/1.13 because vigintic_mean
// >= novemdecic_mean by Power Mean inequality (M_20 >= M_19) so
// ptvim <= ptnvm for every non-flat pool -- keeping the spread
// cutoff at 1.01 means the MILD-OUTLIER regime (which P11.292 PTNVM
// reads TIGHT at 1.016) stays TIGHT here too (1.0098 < 1.01), the
// EXTREME-OUTLIER regime (which P11.292 reads SPREAD) stays SPREAD
// here as well (1.1108 in [1.01, 1.13)), and the wide cutoff drops
// from 1.14 to 1.13 so only pool_count >= 13 pools reach wide
// (13^(1/20) ~= 1.1368 is just past the wide floor).
const TIGHT_PTVIM_MAX = 1.01;
const WIDE_PTVIM_MIN = 1.13;

// PTVIM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTVIM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToViginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_vigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_vigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToViginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToViginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToViginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToViginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToViginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToViginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToViginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptvim_max: number;
  readonly wide_ptvim_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToViginticMeanMap;
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

// Peak-to-vigintic-mean of a discrete distribution:
//   PTVIM = (max - min) / vigintic_mean
// where vigintic_mean = ((sum x_i^20) / n)^(1/20). Returns null on
// empty, solo, and degenerate (zero vigintic_mean or non-finite
// twentieth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_vigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_vigintic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and VIM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_vigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_vigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twentiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^20 = x^8 * x^8 * x^4
    twentiethSum += oct * oct * quad;
  }
  if (!Number.isFinite(twentiethSum) || twentiethSum <= 0) {
    // Belt-and-braces: sum of twentieth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_vigintic_mean: null };
  }
  const vigintic_mean = Math.pow(twentiethSum / pool_count, 1 / 20);
  if (!Number.isFinite(vigintic_mean) || vigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_vigintic_mean: null };
  }
  const range = max - min;
  const ptvim = range / vigintic_mean;
  // Clamp tiny negative float-noise to 0; ptvim is non-negative by
  // construction because range >= 0 and vigintic_mean > 0.
  const clamped = ptvim < 0 ? 0 : ptvim;
  return {
    pool_count,
    pool_cells,
    peak_to_vigintic_mean: roundTo(clamped, PTVIM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToViginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_vigintic_mean: partner.peak_to_vigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_vigintic_mean: metric.peak_to_vigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToViginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToViginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToViginticMean {
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
    tight_ptvim_max: TIGHT_PTVIM_MAX,
    wide_ptvim_min: WIDE_PTVIM_MIN,
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

function labelForPtvim(
  pool_count: number,
  pool_cells: number,
  ptvim: number | null,
  tight_max: number,
  wide_min: number,
): PtvimLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptvim === null) return "degenerate";
  if (ptvim >= wide_min) return "wide";
  if (ptvim < tight_max) return "tight";
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

function renderPtvimCell(
  pool_count: number,
  pool_cells: number,
  ptvim: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtvim(
    pool_count,
    pool_cells,
    ptvim,
    tight_max,
    wide_min,
  );
  const ptvimText = ptvim === null ? "-" : ptvim.toFixed(4);
  return `PTVIM ${ptvimText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToViginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToViginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptvim_max, wide_ptvim_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtvimCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_vigintic_mean, tight_ptvim_max, wide_ptvim_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtvimCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_vigintic_mean, tight_ptvim_max, wide_ptvim_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-VIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-VIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptvim = (max - min) / vigintic_mean where vigintic_mean = ((sum x_i^20) / n)^(1/20). Reads the pool's total RANGE in units of its VIGINTIC (power-mean-of-order-20, M_20) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.292 PTNVM because raising the large values to the TWENTIETH power before averaging lifts the anchor MORE than raising to the nineteenth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the VIGINTIC (POWER-MEAN-OF-ORDER-20) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12, tredecic M_13, quattuordecic M_14, quindecic M_15, sedecic M_16, septendecic M_17, octodecic M_18, novemdecic M_19) power-mean vigesimoprimet into a VIGESIMOSECUNDET with the M_20 vigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptvim approaches n^(1/20) so 10-partner pools cap near 1.1220 and only pools with pool_count &gt;= 13 escape into wide (13^(1/20) ~= 1.1368 is just past the wide floor). Composite regime labels: PTVIM tight + PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTRMS spread = MILD OUTLIER absorbed by vigintic ([1x9, 10] reads PTVIM 1.0098 tight); PTVIM spread + PTNVM spread + PTSOM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTVIM 1.1108 spread); PTVIM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.2463 wide); PTVIM spread + PTNVM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0249 spread — the 1.01 tight/spread boundary at M_20 keeps this two-partner regime spread that P11.292 PTNVM first caught at 1.02). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR vigintic_mean == 0 (guarded but unreachable), tight = ptvim &lt; ${tight_ptvim_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptvim in [${tight_ptvim_max}, ${wide_ptvim_min}) (extreme-outlier regime), wide = ptvim &ge; ${wide_ptvim_min} (runaway-outlier regime with pool_count &gt;= 13). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptvim null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTVIM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTVIM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
