// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESVIGINTIC-MEAN
// pure-lib (P11.306).
//
// WHOLE-POOL RANGE-AGAINST-SESVIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SESVIGINTIC MEAN (a.k.a. power mean of order 26, M_26):
//
//   ptsvm = (max - min) / sesvigintic_mean
//
// where sesvigintic_mean = ((sum x_i^26) / n)^(1/26). Reads the
// peak spread against the SESVIGINTIC (power-mean-of-order-26)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.304 PTQIVM, because raising to the TWENTY-SIXTH power
// before averaging lifts the anchor MORE than raising to the twenty-
// fifth does, dampening the ratio against the range even harder.
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
//   * P11.292 PEAK-TO-OCTODECIC-MEAN   - (max - min) / octodecic_mean.[M_18]
//   * P11.294 PEAK-TO-VIGINTIC-MEAN    - (max - min) / vigintic_mean.[M_20]
//   * P11.296 PEAK-TO-UNVIGINTIC-MEAN  - (max - min) / unvigintic_mean.[M_21]
//   * P11.298 PEAK-TO-DUOVIGINTIC-MEAN - (max - min) / duovigintic_mean.[M_22]
//   * P11.300 PEAK-TO-TRESVIGINTIC-MEAN - (max - min) / tresvigintic_mean.[M_23]
//   * P11.302 PEAK-TO-QUATTUORVIGINTIC-MEAN - (max - min) / quattuorvigintic_mean.[M_24]
//   * P11.304 PEAK-TO-QUINVIGINTIC-MEAN - (max - min) / quinvigintic_mean.[M_25]
//
// PTSVM's unique DISPERSION-axis contribution: reads range in units
// of the SESVIGINTIC (POWER-MEAN-OF-ORDER-26) CENTER. Every
// other range-based DISPERSION surface anchors on a scale statistic
// (P11.237), a total span (P11.213), an order-statistic anchor
// (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite
// (P11.254 PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-
// ORDER power means (harmean M_-1, geomean M_0, arithmetic M_1,
// quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6,
// septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11,
// duodecic M_12, tredecic M_13, quattuordecic M_14, quindecic M_15,
// sedecic M_16, septendecic M_17, octodecic M_18, vigintic M_20,
// unvigintic M_21, duovigintic M_22, tresvigintic M_23,
// quattuorvigintic M_24, quinvigintic M_25). The SESVIGINTIC mean is
// the FIRST power mean above the QUINVIGINTIC in the Power Mean
// hierarchy -- it is pulled toward LARGE values EVEN HARDER than the
// quinvigintic mean by the Power Mean inequality (harmean <= geomean
// <= mean <= rms <= cubic_mean <= quartic_mean <= quintic_mean <=
// sextic_mean <= septic_mean <= octic_mean <= nonic_mean <=
// decic_mean <= undecic_mean <= duodecic_mean <= tredecic_mean <=
// quattuordecic_mean <= quindecic_mean <= sedecic_mean <=
// septendecic_mean <= octodecic_mean <= vigintic_mean <=
// unvigintic_mean <= duovigintic_mean <= tresvigintic_mean <=
// quattuorvigintic_mean <= quinvigintic_mean <= sesvigintic_mean;
// equality iff all values equal). PTSVM's contrast with PTQIVM +
// PTRVM + PTDVIM + PTUVM + PTVIM + PTSOM + PTSPM + PTSDM + PTQIM +
// PTQTM + PTTRM + PTDUM + PTUM + PTDM + PTNM + PTOM + PTSEM + PTSM +
// PTQNM + PTQCM + PTCM + PTRMS + PTMEAN + PTGM + PTH extends the
// (harmonic, geometric, arithmetic, quadratic, cubic, quartic,
// quintic, sextic, septic, octic, nonic, decic, undecic, duodecic,
// tredecic, quattuordecic, quindecic, sedecic, septendecic,
// octodecic, vigintic, unvigintic, duovigintic, tresvigintic,
// quattuorvigintic, quinvigintic) power-mean centre-anchor
// VIGESIMOSEPTET into a VIGESIMOOCTET (harmonic, geometric,
// arithmetic, quadratic, cubic, quartic, quintic, sextic, septic,
// octic, nonic, decic, undecic, duodecic, tredecic, quattuordecic,
// quindecic, sedecic, septendecic, octodecic, vigintic, unvigintic,
// duovigintic, tresvigintic, quattuorvigintic, quinvigintic,
// sesvigintic), and lets a reader read the OUTLIER-DAMPENING
// GRADIENT across TWENTY-SEVEN increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTSVM+PTQIVM+PTRVM+PTDVIM+PTUVM+PTVIM+PTSOM+PTSPM+PTSDM:
//
//   * PTSVM tight + PTQIVM tight + PTRVM tight + PTDVIM tight + PTUVM tight + PTVIM tight + PTSOM tight + PTSPM tight + PTSDM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTSVM tight + PTQIVM tight + PTRVM tight + PTDVIM tight + PTUVM tight + PTVIM tight + PTSOM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM + PTTRM +
//                                     PTQTM + PTQIM + PTSDM + PTSPM +
//                                     PTSOM + PTVIM + PTUVM + PTDVIM +
//                                     PTRVM + PTQIVM + PTSVM absorb by
//                                     raising the outlier to the 4th +
//                                     5th + 6th + 7th + 8th + 9th +
//                                     10th + 11th + 12th + 13th + 14th
//                                     + 15th + 16th + 17th + 18th +
//                                     19th + 20th + 21st + 22nd + 23rd
//                                     + 24th + 25th + 26th power into
//                                     the anchor. Reference:
//                                     [1x9, 10] reads PTSVM 0.9833
//                                     tight (sits FURTHER BELOW the
//                                     flat/uniform-ramp band because
//                                     the 26th power lifts the anchor
//                                     above the arithmetic max,
//                                     dampening the ratio to below
//                                     1), PTQIVM 0.9868 tight, PTRVM
//                                     0.9948 tight.
//   * PTSVM spread + PTQIVM spread + PTRVM spread
//                                     -> EXTREME OUTLIER that even
//                                     the sesvigintic mean cannot
//                                     absorb fully; range still lifts
//                                     PTSVM into spread. Reference:
//                                     [1x9, 100] reads PTSVM 1.0817
//                                     spread, PTQIVM 1.0855 spread,
//                                     PTRVM 1.0942 spread.
//   * PTSVM wide + PTQIVM wide + PTRVM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 26th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/26). Reference:
//                                     [1x99, 100] reads PTSVM 1.1818
//                                     wide.
//   * PTSVM spread + PTQIVM spread + PTRVM spread + PTSOM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). The 1.005 tight/
//                                     spread boundary at M_26 continues
//                                     to catch this regime that P11.294
//                                     PTVIM first caught at 1.01. Ref:
//                                     [1, 100] reads PTSVM 1.0167
//                                     spread, PTQIVM 1.0178 spread,
//                                     PTRVM 1.0203 spread.
//   * PTSVM wide + PTQIVM tight       -> unreachable because
//                                     sesvigintic_mean is ALWAYS
//                                     >= quinvigintic_mean by Power
//                                     Mean inequality (M_26 >= M_25),
//                                     so ptsvm = range/sesvigintic_mean
//                                     <= ptqivm = range/quinvigintic_mean
//                                     by construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTSVM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// sesvigintic_mean approaches x_max / n^(1/26), so ptsvm
// approaches (x_max - x_min) / (x_max / n^(1/26)) = n^(1/26) *
// (1 - x_min/x_max) -> n^(1/26) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/26) ~= 1.0926, so even the most extreme outlier
// in a 10-partner pool reads ptsvm just past 1.09 (spread but
// barely above 1.09). For n=100 the ceiling climbs to 100^(1/26)
// ~= 1.1938, so a large pool with a dominant outlier reads wide.
// Pools with pool_count >= 11 escape into wide (since 11^(1/26)
// ~= 1.0966 > wide_min = 1.09 so pool_count >= 11 pools can reach
// wide with a modest outlier). This asymptotic behaviour makes
// PTSVM an even CLEANER outlier-tolerance read than PTQIVM in the
// peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptsvm null (empty pool).
//   * pool_count 1                  -> ptsvm null (solo -- range = 0
//                                     and SVM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptsvm null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 by construction, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptsvm null (sesvigintic_mean_zero
//     sesvigintic_mean == 0         -- unreachable since sesvigintic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptsvm in [0, +Inf) rounded to
//     sesvigintic_mean > 0          4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and sesvigintic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> SVM = k, range 0, ptsvm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> SVM ~= 9.1756, range 9, ptsvm
//                                     ~= 0.9809 (tight -- well under
//                                     the 1.005 tight/spread boundary).
//   * upper-outlier [1x9, 10]       -> SVM ~= 9.1525, range 9, ptsvm
//                                     ~= 0.9833 (tight -- MILD-SINGLE-
//                                     OUTLIER absorbed by the
//                                     sesvigintic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.304 PTQIVM's
//                                     0.9868 tight landing; drops
//                                     FURTHER BELOW the arithmetic-max
//                                     dampening threshold of 1.0).
//   * two-shoulders [1x8, 5x2]      -> SVM ~= 4.6999, range 4, ptsvm
//                                     ~= 0.8511 (tight).
//   * 50/50 split [1x5, 10x5]       -> SVM ~= 9.7369, range 9, ptsvm
//                                     ~= 0.9243 (tight -- BIMODAL
//                                     SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SVM ~= 91.5247, range 99,
//                                     ptsvm ~= 1.0817 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/26) ~ 1.0926 asymptote and
//                                     lands well above the tight
//                                     boundary but under the wide
//                                     cutoff).
//   * two-partner [1, 9]            -> SVM ~= 8.7632, range 8, ptsvm
//                                     ~= 0.9129 (tight).
//   * two-partner [1, 100]          -> SVM ~= 97.3693, range 99,
//                                     ptsvm ~= 1.0167 (SPREAD --
//                                     ISOLATED HIGH PARTNER remains
//                                     above the 1.005 tight/spread
//                                     boundary at M_26; the boundary
//                                     tightening from P11.294 through
//                                     P11.302 keeps this two-partner
//                                     regime in spread).
//   * small [10, 1, 1]              -> SVM ~= 9.5863, range 9, ptsvm
//                                     ~= 0.9388 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTSVM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/26) ~= 1.0432 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> SVM ~= 83.7678, range 99,
//                                     ptsvm ~= 1.1818 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptsvm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR sesvigintic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptsvm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- sesvigintic
//                          mean pulled UP hard by raising the large
//                          values to the 26th power dominates the
//                          anchor)
//   * spread               ptsvm in [1.005, 1.09) (extreme-outlier
//                          regime where even the sesvigintic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/26) so 10-
//                          partner pools cap near 1.0926)
//   * wide                 ptsvm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 11 where n^(1/26) climbs
//                          past the wide cutoff; only pools of size
//                          11 or larger with dominant outliers reach
//                          here with a modest outlier)
//
// Both cutoffs are exposed on the envelope as tight_ptsvm_max /
// wide_ptsvm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptsvm = MORE range against sesvigintic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN +
// P11.248 PTGM + P11.250 PTH + P11.252 PTRMS + P11.254 PTMH +
// P11.256 PTTRI + P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM +
// P11.264 PTQNM + P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM +
// P11.272 PTNM + P11.274 PTDM + P11.276 PTUM + P11.278 PTDUM +
// P11.280 PTTRM + P11.282 PTQTM + P11.284 PTQIM + P11.286 PTSDM +
// P11.288 PTSPM + P11.292 PTSOM + P11.294 PTVIM + P11.296 PTUVM +
// P11.298 PTDVIM + P11.300 PTRVM + P11.302 PTQVIM + P11.304 PTQIVM tight/spread/wide vocabulary).
// Reuses the exact 3-band label set so a reader scanning the
// DISPERSION additive/ratio family sees the same vocabulary across
// every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.307):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinviginticMeanSection
// (P11.304) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesvigintic-center
// after the P11.302 range-against-quattuorvigintic-center landing. The
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
// (P11.288) -> PEAK-TO-OCTODECIC-MEAN (P11.292) -> PEAK-TO-VIGINTIC-
// MEAN (P11.294) -> PEAK-TO-UNVIGINTIC-MEAN (P11.296) -> PEAK-TO-
// DUOVIGINTIC-MEAN (P11.298) -> PEAK-TO-TRESVIGINTIC-MEAN (P11.300)
// -> PEAK-TO-QUATTUORVIGINTIC-MEAN (P11.302) -> PEAK-TO-QUINVIGINTIC-
// MEAN (P11.304) -> PEAK-TO-SESVIGINTIC-MEAN (this module) -> per-pair
// hot-cells GRANULAR (P11.129).

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
type PtsvmLabel =
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

// Bands on raw ptsvm (fixed cutoffs since sesvigintic_mean scales
// with cell counts and typical sesvigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools read
// tight, extreme-outlier pools read spread, and RUNAWAY-OUTLIER
// pools with pool_count >> 10 read wide. Tight boundary holds at
// P11.304 PTQIVM's 1.005 -- MILD-OUTLIER at M_26 is 0.9833 (already
// well below the arithmetic-max dampening threshold of 1.0), so the
// 1.005 boundary continues to preserve MILD-OUTLIER as tight with a
// healthy buffer while still catching the ISOLATED HIGH PARTNER
// regime ([1, 100] reads 1.0167 spread). Wide boundary HOLDS at
// P11.304 PTQIVM's 1.09 -- 10-partner asymptote drops from 1.0965
// (M_25) to 1.0926 (M_26) while [1x9,100] EXTREME reads 1.0817 (still
// spread) and 11^(1/26) ~= 1.0966 keeps pool_count >= 11 pools in
// reach of wide with a modest outlier.
const TIGHT_PTSVM_MAX = 1.005;
const WIDE_PTSVM_MIN = 1.09;

// PTSVM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTSVM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesvigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesvigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesviginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsvm_max: number;
  readonly wide_ptsvm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanMap;
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

// Peak-to-sesvigintic-mean of a discrete distribution:
//   PTSVM = (max - min) / sesvigintic_mean
// where sesvigintic_mean = ((sum x_i^26) / n)^(1/26). Returns null
// on empty, solo, and degenerate (zero sesvigintic_mean or non-
// finite twenty-sixth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesvigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_sesvigintic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and SVM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_sesvigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_sesvigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twentysixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^26 = x^8 * x^8 * x^8 * x^2
    twentysixthSum += oct * oct * oct * sq;
  }
  if (!Number.isFinite(twentysixthSum) || twentysixthSum <= 0) {
    // Belt-and-braces: sum of twenty-sixth-power non-negative counts
    // is always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_sesvigintic_mean: null };
  }
  const sesvigintic_mean = Math.pow(twentysixthSum / pool_count, 1 / 26);
  if (!Number.isFinite(sesvigintic_mean) || sesvigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_sesvigintic_mean: null };
  }
  const range = max - min;
  const ptsvm = range / sesvigintic_mean;
  // Clamp tiny negative float-noise to 0; ptsvm is non-negative by
  // construction because range >= 0 and sesvigintic_mean > 0.
  const clamped = ptsvm < 0 ? 0 : ptsvm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesvigintic_mean: roundTo(clamped, PTSVM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesvigintic_mean:
      partner.peak_to_sesvigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesvigintic_mean: metric.peak_to_sesvigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesviginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesviginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesviginticMean {
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
    tight_ptsvm_max: TIGHT_PTSVM_MAX,
    wide_ptsvm_min: WIDE_PTSVM_MIN,
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

function labelForPtsvm(
  pool_count: number,
  pool_cells: number,
  ptsvm: number | null,
  tight_max: number,
  wide_min: number,
): PtsvmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsvm === null) return "degenerate";
  if (ptsvm >= wide_min) return "wide";
  if (ptsvm < tight_max) return "tight";
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

function renderPtsvmCell(
  pool_count: number,
  pool_cells: number,
  ptsvm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsvm(
    pool_count,
    pool_cells,
    ptsvm,
    tight_max,
    wide_min,
  );
  const ptsvmText = ptsvm === null ? "-" : ptsvm.toFixed(4);
  return `PTSVM ${ptsvmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesviginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesviginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsvm_max, wide_ptsvm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsvmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesvigintic_mean, tight_ptsvm_max, wide_ptsvm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsvmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesvigintic_mean, tight_ptsvm_max, wide_ptsvm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESVIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESVIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsvm = (max - min) / sesvigintic_mean where sesvigintic_mean = ((sum x_i^26) / n)^(1/26). Reads the pool's total RANGE in units of its SESVIGINTIC (power-mean-of-order-26, M_26) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.304 PTQIVM because raising the large values to the TWENTY-SIXTH power before averaging lifts the anchor MORE than raising to the twenty-fifth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the SESVIGINTIC (POWER-MEAN-OF-ORDER-26) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12, tredecic M_13, quattuordecic M_14, quindecic M_15, sedecic M_16, septendecic M_17, octodecic M_18, vigintic M_20, unvigintic M_21, duovigintic M_22, tresvigintic M_23, quattuorvigintic M_24, quinvigintic M_25) power-mean vigesimoseptet into a VIGESIMOOCTET with the M_26 sesvigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsvm approaches n^(1/26) so 10-partner pools cap near 1.0926 and only pools with pool_count &gt;= 11 escape into wide with a modest outlier (11^(1/26) ~= 1.0966 is past the wide floor). Composite regime labels: PTSVM tight + PTQIVM tight + PTRVM tight + PTDVIM tight + PTUVM tight + PTVIM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTRMS spread = MILD OUTLIER absorbed by sesvigintic ([1x9, 10] reads PTSVM 0.9833 tight); PTSVM spread + PTQIVM spread + PTRVM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTSVM 1.0817 spread); PTSVM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1818 wide); PTSVM spread + PTQIVM spread + PTRVM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0167 spread — the 1.005 tight/spread boundary at M_26 keeps this two-partner regime spread that P11.294 PTVIM first caught at 1.01). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesvigintic_mean == 0 (guarded but unreachable), tight = ptsvm &lt; ${tight_ptsvm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptsvm in [${tight_ptsvm_max}, ${wide_ptsvm_min}) (extreme-outlier regime), wide = ptsvm &ge; ${wide_ptsvm_min} (runaway-outlier regime with pool_count &gt;= 11). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsvm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSVM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSVM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
