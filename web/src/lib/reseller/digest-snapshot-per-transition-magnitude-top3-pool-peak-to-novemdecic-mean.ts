// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMDECIC-MEAN
// pure-lib (P11.292).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMDECIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// NOVEMDECIC MEAN (a.k.a. power mean of order 19, M_19):
//
//   ptnvm = (max - min) / novemdecic_mean
//
// where novemdecic_mean = ((sum x_i^19) / n)^(1/19). Reads the peak
// spread against the NOVEMDECIC (power-mean-of-order-19) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.290
// PTSOM, because raising to the NINETEENTH power before averaging
// lifts the anchor MORE than raising to the eighteenth does,
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
//
// PTNVM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMDECIC (POWER-MEAN-OF-ORDER-19) CENTER. Every other
// range-based DISPERSION surface anchors on a scale statistic (P11.237),
// a total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12,
// tredecic M_13, quattuordecic M_14, quindecic M_15, sedecic M_16,
// septendecic M_17, octodecic M_18). The NOVEMDECIC mean is the FIRST
// power mean above the OCTODECIC in the Power Mean hierarchy -- it is
// pulled toward LARGE values EVEN HARDER than the octodecic mean by
// the Power Mean inequality (harmean <= geomean <= mean <= rms <=
// cubic_mean <= quartic_mean <= quintic_mean <= sextic_mean <=
// septic_mean <= octic_mean <= nonic_mean <= decic_mean <=
// undecic_mean <= duodecic_mean <= tredecic_mean <= quattuordecic_mean
// <= quindecic_mean <= sedecic_mean <= septendecic_mean <=
// octodecic_mean <= novemdecic_mean; equality iff all values equal).
// PTNVM's contrast with PTSOM + PTSPM + PTSDM + PTQIM + PTQTM + PTTRM
// + PTDUM + PTUM + PTDM + PTNM + PTOM + PTSEM + PTSM + PTQNM + PTQCM
// + PTCM + PTRMS + PTMEAN + PTGM + PTH extends the (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic, sextic,
// septic, octic, nonic, decic, undecic, duodecic, tredecic,
// quattuordecic, quindecic, sedecic, septendecic, octodecic)
// power-mean centre-anchor VIGESIMET into a VIGESIMOPRIMET (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic, sextic,
// septic, octic, nonic, decic, undecic, duodecic, tredecic,
// quattuordecic, quindecic, sedecic, septendecic, octodecic,
// novemdecic), and lets a reader read the OUTLIER-DAMPENING GRADIENT
// across TWENTY-ONE increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTNVM+PTSOM+PTSPM+PTSDM+PTQIM:
//
//   * PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTQIM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTQIM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM + PTTRM +
//                                     PTQTM + PTQIM + PTSDM + PTSPM +
//                                     PTSOM + PTNVM absorb by raising
//                                     the outlier to the 4th + 5th +
//                                     6th + 7th + 8th + 9th + 10th +
//                                     11th + 12th + 13th + 14th +
//                                     15th + 16th + 17th + 18th +
//                                     19th power into the anchor.
//                                     Reference: [1x9, 10] reads
//                                     PTNVM 1.016 tight, PTSOM 1.0228
//                                     tight, PTSPM 1.0305 tight.
//   * PTNVM spread + PTSOM spread + PTSPM spread + PTSDM spread + PTQIM spread
//                                     -> EXTREME OUTLIER that even
//                                     the novemdecic mean cannot
//                                     absorb fully; range still lifts
//                                     PTNVM into spread. Reference:
//                                     [1x9, 100] reads PTNVM 1.1175
//                                     spread, PTSOM 1.1251 spread,
//                                     PTSPM 1.1336 spread.
//   * PTNVM wide + PTSOM wide + PTSPM wide + PTSDM wide + PTQIM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 19th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/19). Reference:
//                                     [1x99, 100] reads PTNVM 1.2615
//                                     wide.
//   * PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTQIM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTNVM 1.0268 tight, PTSOM
//                                     1.0289 tight, PTSPM 1.0312 tight.
//   * PTNVM wide + PTSOM tight        -> unreachable because
//                                     novemdecic_mean is ALWAYS >=
//                                     octodecic_mean by Power Mean
//                                     inequality (M_19 >= M_18), so
//                                     ptnvm = range/novemdecic_mean
//                                     <= ptsom = range/octodecic_mean
//                                     by construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTNVM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// novemdecic_mean approaches x_max / n^(1/19), so ptnvm approaches
// (x_max - x_min) / (x_max / n^(1/19)) = n^(1/19) * (1 - x_min/x_max)
// -> n^(1/19) as x_max -> +Inf. For n=10 the ceiling is 10^(1/19) ~=
// 1.1288, so even the most extreme outlier in a 10-partner pool
// reads ptnvm just below 1.13 (spread but never above ~1.1288). For
// n=100 the ceiling climbs to 100^(1/19) ~= 1.2743, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 13
// escape into wide (since 13^(1/19) ~= 1.1445 > wide_min = 1.14 so
// pool_count >= 13 pools can reach wide). This asymptotic behaviour
// makes PTNVM an even CLEANER outlier-tolerance read than PTSOM in
// the peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptnvm null (empty pool).
//   * pool_count 1                  -> ptnvm null (solo -- range = 0
//                                     and NVM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptnvm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptnvm null (novemdecic_mean_zero
//     novemdecic_mean == 0            -- unreachable since novemdecic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptnvm in [0, +Inf) rounded to
//     novemdecic_mean > 0             4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and novemdecic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> NVM = k, range 0, ptnvm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> NVM ~= 8.9244, range 9, ptnvm
//                                     ~= 1.0085 (tight -- well under
//                                     the 1.02 tight/spread boundary).
//   * upper-outlier [1x9, 10]       -> NVM ~= 8.8587, range 9, ptnvm
//                                     ~= 1.016 (tight -- MILD-SINGLE-
//                                     OUTLIER absorbed by the
//                                     novemdecic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide;
//                                     even softer than P11.290 PTSOM's
//                                     1.0228 tight landing).
//   * two-shoulders [1x8, 5x2]      -> NVM ~= 4.5939, range 4, ptnvm
//                                     ~= 0.8707 (tight).
//   * 50/50 split [1x5, 10x5]       -> NVM ~= 9.6418, range 9, ptnvm
//                                     ~= 0.9334 (tight -- BIMODAL
//                                     SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NVM ~= 88.5867, range 99,
//                                     ptnvm ~= 1.1175 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/19) ~ 1.1288 asymptote and
//                                     lands well above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> NVM ~= 8.6776, range 8, ptnvm
//                                     ~= 0.9219 (tight).
//   * two-partner [1, 100]          -> NVM ~= 96.4176, range 99,
//                                     ptnvm ~= 1.0268 (tight --
//                                     ISOLATED HIGH PARTNER;
//                                     novemdecic mean captures the
//                                     outlier).
//   * small [10, 1, 1]              -> NVM ~= 9.4382, range 9, ptnvm
//                                     ~= 0.9536 (TIGHT --
//                                     SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTNVM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/19) ~= 1.0595 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> NVM ~= 78.476, range 99,
//                                     ptnvm ~= 1.2615 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptnvm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR novemdecic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptnvm < 1.02 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- novemdecic
//                          mean pulled UP hard by raising the large
//                          values to the 19th power dominates the
//                          anchor)
//   * spread               ptnvm in [1.02, 1.14) (extreme-outlier
//                          regime where even the novemdecic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/19) so 10-
//                          partner pools cap near 1.1288)
//   * wide                 ptnvm >= 1.14 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 13 where n^(1/19) climbs
//                          past the wide cutoff; only pools of size
//                          13 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptnvm_max /
// wide_ptnvm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptnvm = MORE range against novemdecic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN +
// P11.248 PTGM + P11.250 PTH + P11.252 PTRMS + P11.254 PTMH +
// P11.256 PTTRI + P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM +
// P11.264 PTQNM + P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM +
// P11.272 PTNM + P11.274 PTDM + P11.276 PTUM + P11.278 PTDUM +
// P11.280 PTTRM + P11.282 PTQTM + P11.284 PTQIM + P11.286 PTSDM +
// P11.288 PTSPM + P11.290 PTSOM tight/spread/wide vocabulary). Reuses
// the exact 3-band label set so a reader scanning the DISPERSION
// additive/ratio family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.293):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctodecicMeanSection
// (P11.290) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemdecic-center
// after the P11.290 range-against-octodecic-center landing. The
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
// MEAN (this module) -> per-pair hot-cells GRANULAR (P11.139).

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
type PtnvmLabel =
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

// Bands on raw ptnvm (fixed cutoffs since novemdecic_mean scales
// with cell counts and typical novemdecic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools read
// tight, extreme-outlier pools read spread, and RUNAWAY-OUTLIER
// pools with pool_count >> 10 read wide. Cutoffs tighten P11.290
// PTSOM's 1.03/1.15 pair down to 1.02/1.14 because novemdecic_mean
// >= octodecic_mean by Power Mean inequality (M_19 >= M_18) so
// ptnvm <= ptsom for every non-flat pool -- keeping the spread
// cutoff at 1.02 means the MILD-OUTLIER regime (which P11.290 PTSOM
// reads TIGHT at 1.0228) stays TIGHT here too (1.016 < 1.02), the
// EXTREME-OUTLIER regime (which P11.290 reads SPREAD) stays SPREAD
// here as well (1.1175 in [1.02, 1.14)), and the wide cutoff drops
// from 1.15 to 1.14 so only pool_count >= 13 pools reach wide
// (13^(1/19) ~= 1.1445 is just past the wide floor).
const TIGHT_PTNVM_MAX = 1.02;
const WIDE_PTNVM_MIN = 1.14;

// PTNVM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTNVM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemdecic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemdecic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemdecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnvm_max: number;
  readonly wide_ptnvm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanMap;
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

// Peak-to-novemdecic-mean of a discrete distribution:
//   PTNVM = (max - min) / novemdecic_mean
// where novemdecic_mean = ((sum x_i^19) / n)^(1/19). Returns null on
// empty, solo, and degenerate (zero novemdecic_mean or non-finite
// nineteenth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemdecic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_novemdecic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and NVM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_novemdecic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_novemdecic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let nineteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^19 = x^8 * x^8 * x^2 * x
    nineteenthSum += oct * oct * sq * v;
  }
  if (!Number.isFinite(nineteenthSum) || nineteenthSum <= 0) {
    // Belt-and-braces: sum of nineteenth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_novemdecic_mean: null };
  }
  const novemdecic_mean = Math.pow(nineteenthSum / pool_count, 1 / 19);
  if (!Number.isFinite(novemdecic_mean) || novemdecic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_novemdecic_mean: null };
  }
  const range = max - min;
  const ptnvm = range / novemdecic_mean;
  // Clamp tiny negative float-noise to 0; ptnvm is non-negative by
  // construction because range >= 0 and novemdecic_mean > 0.
  const clamped = ptnvm < 0 ? 0 : ptnvm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemdecic_mean: roundTo(clamped, PTNVM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemdecic_mean: partner.peak_to_novemdecic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemdecic_mean: metric.peak_to_novemdecic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemdecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemdecicMean {
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
    tight_ptnvm_max: TIGHT_PTNVM_MAX,
    wide_ptnvm_min: WIDE_PTNVM_MIN,
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

function labelForPtnvm(
  pool_count: number,
  pool_cells: number,
  ptnvm: number | null,
  tight_max: number,
  wide_min: number,
): PtnvmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnvm === null) return "degenerate";
  if (ptnvm >= wide_min) return "wide";
  if (ptnvm < tight_max) return "tight";
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

function renderPtnvmCell(
  pool_count: number,
  pool_cells: number,
  ptnvm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnvm(
    pool_count,
    pool_cells,
    ptnvm,
    tight_max,
    wide_min,
  );
  const ptnvmText = ptnvm === null ? "-" : ptnvm.toFixed(4);
  return `PTNVM ${ptnvmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemdecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemdecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnvm_max, wide_ptnvm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemdecic_mean, tight_ptnvm_max, wide_ptnvm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemdecic_mean, tight_ptnvm_max, wide_ptnvm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMDECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMDECIC-CENTER scalar over the P11.161 pool &mdash; ptnvm = (max - min) / novemdecic_mean where novemdecic_mean = ((sum x_i^19) / n)^(1/19). Reads the pool's total RANGE in units of its NOVEMDECIC (power-mean-of-order-19, M_19) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.290 PTSOM because raising the large values to the NINETEENTH power before averaging lifts the anchor MORE than raising to the eighteenth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the NOVEMDECIC (POWER-MEAN-OF-ORDER-19) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12, tredecic M_13, quattuordecic M_14, quindecic M_15, sedecic M_16, septendecic M_17, octodecic M_18) power-mean vigesimet into a VIGESIMOPRIMET with the M_19 novemdecic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnvm approaches n^(1/19) so 10-partner pools cap near 1.1288 and only pools with pool_count &gt;= 13 escape into wide (13^(1/19) ~= 1.1445 is just past the wide floor). Composite regime labels: PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTQIM tight + PTRMS spread = MILD OUTLIER absorbed by novemdecic ([1x9, 10] reads PTNVM 1.016 tight); PTNVM spread + PTSOM spread + PTSPM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTNVM 1.1175 spread); PTNVM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.2615 wide); PTNVM tight + PTSOM tight + PTSPM tight + PTSDM tight + PTQIM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0268 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemdecic_mean == 0 (guarded but unreachable), tight = ptnvm &lt; ${tight_ptnvm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptnvm in [${tight_ptnvm_max}, ${wide_ptnvm_min}) (extreme-outlier regime), wide = ptnvm &ge; ${wide_ptnvm_min} (runaway-outlier regime with pool_count &gt;= 13). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnvm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNVM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNVM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
