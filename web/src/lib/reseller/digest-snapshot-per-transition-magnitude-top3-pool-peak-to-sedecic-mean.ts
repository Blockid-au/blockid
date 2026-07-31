// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEDECIC-MEAN
// pure-lib (P11.286).
//
// WHOLE-POOL RANGE-AGAINST-SEDECIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// SEDECIC MEAN (a.k.a. power mean of order 16, M_16):
//
//   ptsdm = (max - min) / sedecic_mean
//
// where sedecic_mean = ((sum x_i^16) / n)^(1/16). Reads the peak
// spread against the SEDECIC (power-mean-of-order-16) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.284
// PTQIM, because raising to the SIXTEENTH power before averaging
// lifts the anchor MORE than raising to the fifteenth does, dampening
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
//   * P11.284 PEAK-TO-QUINDECIC-MEAN   - (max - min) / quindecic_mean.[M_15]
//
// PTSDM's unique DISPERSION-axis contribution: reads range in units
// of the SEDECIC (POWER-MEAN-OF-ORDER-16) CENTER. Every other
// range-based DISPERSION surface anchors on a scale statistic (P11.237),
// a total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12,
// tredecic M_13, quattuordecic M_14, quindecic M_15). The SEDECIC
// mean is the FIRST power mean above the QUINDECIC in the Power Mean
// hierarchy -- it is pulled toward LARGE values EVEN HARDER than the
// quindecic mean by the Power Mean inequality (harmean <= geomean <=
// mean <= rms <= cubic_mean <= quartic_mean <= quintic_mean <=
// sextic_mean <= septic_mean <= octic_mean <= nonic_mean <=
// decic_mean <= undecic_mean <= duodecic_mean <= tredecic_mean <=
// quattuordecic_mean <= quindecic_mean <= sedecic_mean; equality iff
// all values equal). PTSDM's contrast with PTQIM + PTQTM + PTTRM +
// PTDUM + PTUM + PTDM + PTNM + PTOM + PTSEM + PTSM + PTQNM + PTQCM +
// PTCM + PTRMS + PTMEAN + PTGM + PTH extends the (harmonic,
// geometric, arithmetic, quadratic, cubic, quartic, quintic, sextic,
// septic, octic, nonic, decic, undecic, duodecic, tredecic,
// quattuordecic, quindecic) power-mean centre-anchor SEPTENDECET
// into an OCTODECET (harmonic, geometric, arithmetic, quadratic,
// cubic, quartic, quintic, sextic, septic, octic, nonic, decic,
// undecic, duodecic, tredecic, quattuordecic, quindecic, sedecic),
// and lets a reader read the OUTLIER-DAMPENING GRADIENT across
// EIGHTEEN increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTSDM+PTQIM+PTQTM+PTTRM+PTDUM:
//
//   * PTSDM tight + PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTSDM tight + PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM + PTTRM +
//                                     PTQTM + PTQIM + PTSDM absorb by
//                                     raising the outlier to the 4th
//                                     + 5th + 6th + 7th + 8th + 9th +
//                                     10th + 11th + 12th + 13th + 14th
//                                     + 15th + 16th power into the
//                                     anchor. Reference: [1x9, 10]
//                                     reads PTSDM 1.0393 tight, PTQIM
//                                     1.0493 tight, PTQTM 1.0609
//                                     tight, PTTRM 1.0744 tight,
//                                     PTRMS 2.726 spread.
//   * PTSDM spread + PTQIM spread + PTQTM spread + PTTRM spread + PTDUM spread
//                                     -> EXTREME OUTLIER that even
//                                     the sedecic mean cannot
//                                     absorb fully; range still lifts
//                                     PTSDM into spread. Reference:
//                                     [1x9, 100] reads PTSDM 1.1432
//                                     spread, PTQIM 1.1543 spread,
//                                     PTQTM 1.1670 spread.
//   * PTSDM wide + PTQIM wide + PTQTM wide + PTTRM wide + PTDUM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 16th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/16). Reference:
//                                     [1x99, 100] reads PTSDM 1.3202
//                                     wide.
//   * PTSDM tight + PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTSDM 1.0338 tight, PTQIM
//                                     1.0368 tight, PTQTM 1.0402
//                                     tight.
//   * PTSDM wide + PTQIM tight        -> unreachable because
//                                     sedecic_mean is ALWAYS >=
//                                     quindecic_mean by Power Mean
//                                     inequality (M_16 >= M_15), so
//                                     ptsdm = range/sedecic_mean <=
//                                     ptqim = range/quindecic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTSDM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// sedecic_mean approaches x_max / n^(1/16), so ptsdm approaches
// (x_max - x_min) / (x_max / n^(1/16)) = n^(1/16) * (1 - x_min/x_max)
// -> n^(1/16) as x_max -> +Inf. For n=10 the ceiling is 10^(1/16) ~=
// 1.1548, so even the most extreme outlier in a 10-partner pool
// reads ptsdm just below 1.16 (spread but never above ~1.1548). For
// n=100 the ceiling climbs to 100^(1/16) ~= 1.3335, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 13
// escape into wide (since 13^(1/16) ~= 1.1739 > wide_min = 1.17 so
// pool_count >= 13 pools can reach wide). This asymptotic behaviour
// makes PTSDM an even CLEANER outlier-tolerance read than PTQIM in
// the peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptsdm null (empty pool).
//   * pool_count 1                  -> ptsdm null (solo -- range = 0
//                                     and SDM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptsdm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptsdm null (sedecic_mean_zero
//     sedecic_mean == 0               -- unreachable since sedecic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptsdm in [0, +Inf) rounded to
//     sedecic_mean > 0                4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and sedecic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> SDM = k, range 0, ptsdm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^16) = 12170706132009732, SDM =
//                                     1217070613200973.2^(1/16) ~= 8.7666,
//                                     range 9, ptsdm ~= 1.0266 (tight
//                                     -- well under the 1.05 tight/
//                                     spread boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^16) = 10^16 + 9, SDM =
//                                     10^15^(1/16) ~= 8.6596,
//                                     range 9, ptsdm ~= 1.0393 (tight
//                                     -- MILD-SINGLE-OUTLIER absorbed
//                                     by the sedecic mean where
//                                     P11.252 PTRMS reads spread +
//                                     P11.250 PTH + P11.248 PTGM read
//                                     wide; even softer than P11.284
//                                     PTQIM's 1.0493 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^16) = 305175781258, SDM =
//                                     30517578125.8^(1/16) ~= 4.5215,
//                                     range 4, ptsdm ~= 0.8847 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^16) = 5x10^16 + 5, SDM =
//                                     5x10^15^(1/16) ~= 9.5760,
//                                     range 9, ptsdm ~= 0.9398 (tight
//                                     -- BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^16) = 10^32 + 9, SDM =
//                                     10^31^(1/16) ~= 86.5964, range
//                                     99, ptsdm ~= 1.1432 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/16) ~ 1.1548 asymptote and
//                                     lands well above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> sum(x^16) = 1853020188851842, SDM =
//                                     926510094425921^(1/16) ~= 8.6184,
//                                     range 8, ptsdm ~= 0.9282 (tight).
//   * two-partner [1, 100]          -> sum(x^16) = 10^32 + 1, SDM =
//                                     (5x10^31)^(1/16) ~= 95.7603,
//                                     range 99, ptsdm ~= 1.0338 (tight
//                                     -- ISOLATED HIGH PARTNER;
//                                     sedecic mean captures the
//                                     outlier).
//   * small [10, 1, 1]              -> sum(x^16) = 10^16 + 2, SDM =
//                                     ((10^16 + 2)/3)^(1/16) ~= 9.3364,
//                                     range 9, ptsdm ~= 0.9640 (TIGHT
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTSDM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/16) ~= 1.0711 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^16) = 10^32 + 99, SDM =
//                                     10^30^(1/16) ~= 74.9894, range
//                                     99, ptsdm ~= 1.3202 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptsdm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR sedecic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptsdm < 1.05 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- sedecic
//                          mean pulled UP hard by raising the large
//                          values to the 16th power dominates the
//                          anchor)
//   * spread               ptsdm in [1.05, 1.17) (extreme-outlier
//                          regime where even the sedecic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/16) so 10-
//                          partner pools cap near 1.1548)
//   * wide                 ptsdm >= 1.17 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 13 where n^(1/16) climbs
//                          past the wide cutoff; only pools of size
//                          13 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptsdm_max /
// wide_ptsdm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptsdm = MORE range against sedecic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN +
// P11.248 PTGM + P11.250 PTH + P11.252 PTRMS + P11.254 PTMH +
// P11.256 PTTRI + P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM +
// P11.264 PTQNM + P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM +
// P11.272 PTNM + P11.274 PTDM + P11.276 PTUM + P11.278 PTDUM +
// P11.280 PTTRM + P11.282 PTQTM + P11.284 PTQIM tight/spread/wide
// vocabulary). Reuses the exact 3-band label set so a reader
// scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.287):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuindecicMeanSection
// (P11.284) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sedecic-center
// after the P11.284 range-against-quindecic-center landing. The
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
// -> PEAK-TO-SEDECIC-MEAN (this module) -> per-pair hot-cells
// GRANULAR (P11.139).

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
type PtsdmLabel =
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

// Bands on raw ptsdm (fixed cutoffs since sedecic_mean scales
// with cell counts and typical sedecic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools read
// tight, extreme-outlier pools read spread, and RUNAWAY-OUTLIER
// pools with pool_count >> 10 read wide. Cutoffs tighten P11.284
// PTQIM's 1.06/1.18 pair down to 1.05/1.17 because sedecic_mean
// >= quindecic_mean by Power Mean inequality (M_16 >= M_15) so
// ptsdm <= ptqim for every non-flat pool -- keeping the spread
// cutoff at 1.05 means the MILD-OUTLIER regime (which P11.284 PTQIM
// reads TIGHT at 1.0493) stays TIGHT here too (1.0393 < 1.05), the
// EXTREME-OUTLIER regime (which P11.284 reads SPREAD) stays SPREAD
// here as well (1.1432 in [1.05, 1.17)), and the wide cutoff drops
// from 1.18 to 1.17 so only pool_count >= 13 pools reach wide
// (13^(1/16) ~= 1.1739 is just past the wide floor).
const TIGHT_PTSDM_MAX = 1.05;
const WIDE_PTSDM_MIN = 1.17;

// PTSDM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTSDM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sedecic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sedecic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsdm_max: number;
  readonly wide_ptsdm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSedecicMeanMap;
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

// Peak-to-sedecic-mean of a discrete distribution:
//   PTSDM = (max - min) / sedecic_mean
// where sedecic_mean = ((sum x_i^16) / n)^(1/16). Returns null on
// empty, solo, and degenerate (zero sedecic_mean or non-finite
// sixteenth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sedecic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_sedecic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and SDM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_sedecic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_sedecic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^16 = x^8 * x^8
    sixteenthSum += oct * oct;
  }
  if (!Number.isFinite(sixteenthSum) || sixteenthSum <= 0) {
    // Belt-and-braces: sum of sixteenth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_sedecic_mean: null };
  }
  const sedecic_mean = Math.pow(sixteenthSum / pool_count, 1 / 16);
  if (!Number.isFinite(sedecic_mean) || sedecic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_sedecic_mean: null };
  }
  const range = max - min;
  const ptsdm = range / sedecic_mean;
  // Clamp tiny negative float-noise to 0; ptsdm is non-negative by
  // construction because range >= 0 and sedecic_mean > 0.
  const clamped = ptsdm < 0 ? 0 : ptsdm;
  return {
    pool_count,
    pool_cells,
    peak_to_sedecic_mean: roundTo(clamped, PTSDM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSedecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sedecic_mean: partner.peak_to_sedecic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sedecic_mean: metric.peak_to_sedecic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSedecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicMean {
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
    tight_ptsdm_max: TIGHT_PTSDM_MAX,
    wide_ptsdm_min: WIDE_PTSDM_MIN,
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

function labelForPtsdm(
  pool_count: number,
  pool_cells: number,
  ptsdm: number | null,
  tight_max: number,
  wide_min: number,
): PtsdmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsdm === null) return "degenerate";
  if (ptsdm >= wide_min) return "wide";
  if (ptsdm < tight_max) return "tight";
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

function renderPtsdmCell(
  pool_count: number,
  pool_cells: number,
  ptsdm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsdm(
    pool_count,
    pool_cells,
    ptsdm,
    tight_max,
    wide_min,
  );
  const ptsdmText = ptsdm === null ? "-" : ptsdm.toFixed(4);
  return `PTSDM ${ptsdmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsdm_max, wide_ptsdm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsdmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sedecic_mean, tight_ptsdm_max, wide_ptsdm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsdmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sedecic_mean, tight_ptsdm_max, wide_ptsdm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEDECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEDECIC-CENTER scalar over the P11.161 pool &mdash; ptsdm = (max - min) / sedecic_mean where sedecic_mean = ((sum x_i^16) / n)^(1/16). Reads the pool's total RANGE in units of its SEDECIC (power-mean-of-order-16, M_16) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.284 PTQIM because raising the large values to the SIXTEENTH power before averaging lifts the anchor MORE than raising to the fifteenth does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the SEDECIC (POWER-MEAN-OF-ORDER-16) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11, duodecic M_12, tredecic M_13, quattuordecic M_14, quindecic M_15) power-mean septendecet into an OCTODECET with the M_16 sedecic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsdm approaches n^(1/16) so 10-partner pools cap near 1.1548 and only pools with pool_count &gt;= 13 escape into wide (13^(1/16) ~= 1.1739 is just past the wide floor). Composite regime labels: PTSDM tight + PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight + PTRMS spread = MILD OUTLIER absorbed by sedecic ([1x9, 10] reads PTSDM 1.0393 tight); PTSDM spread + PTQIM spread + PTQTM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTSDM 1.1432 spread); PTSDM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.3202 wide); PTSDM tight + PTQIM tight + PTQTM tight + PTTRM tight + PTDUM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0338 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sedecic_mean == 0 (guarded but unreachable), tight = ptsdm &lt; ${tight_ptsdm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptsdm in [${tight_ptsdm_max}, ${wide_ptsdm_min}) (extreme-outlier regime), wide = ptsdm &ge; ${wide_ptsdm_min} (runaway-outlier regime with pool_count &gt;= 13). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsdm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSDM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSDM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
