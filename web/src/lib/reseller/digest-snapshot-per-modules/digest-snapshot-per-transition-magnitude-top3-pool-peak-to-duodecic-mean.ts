// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUODECIC-MEAN
// pure-lib (P11.278).
//
// WHOLE-POOL RANGE-AGAINST-DUODECIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's DUODECIC
// MEAN (a.k.a. power mean of order 12, M_12):
//
//   ptdum = (max - min) / duodecic_mean
//
// where duodecic_mean = ((sum x_i^12) / n)^(1/12). Reads the peak spread
// against the DUODECIC (power-mean-of-order-12) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.276 PTUM, because
// raising to the TWELFTH power before averaging lifts the anchor MORE
// than raising to the eleventh does, dampening the ratio against the
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
//   * P11.276 PEAK-TO-UNDECIC-MEAN  - (max - min) / undecic_mean.[M_11]
//
// PTDUM's unique DISPERSION-axis contribution: reads range in units
// of the DUODECIC (POWER-MEAN-OF-ORDER-12) CENTER. Every other range-
// based DISPERSION surface anchors on a scale statistic (P11.237), a
// total span (P11.213), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), a hinge/median composite (P11.254
// PTMH, P11.256 PTTRI, P11.258 PTQM), or one of the LOWER-ORDER
// power means (harmean M_-1, geomean M_0, arithmetic M_1, quadratic
// M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7,
// octic M_8, nonic M_9, decic M_10, undecic M_11). The DUODECIC mean
// is the FIRST power mean above the UNDECIC in the Power Mean
// hierarchy -- it is pulled toward LARGE values EVEN HARDER than the
// undecic mean by the Power Mean inequality (harmean <= geomean <=
// mean <= rms <= cubic_mean <= quartic_mean <= quintic_mean <=
// sextic_mean <= septic_mean <= octic_mean <= nonic_mean <=
// decic_mean <= undecic_mean <= duodecic_mean; equality iff all values
// equal). PTDUM's contrast with PTUM + PTDM + PTNM + PTOM + PTSEM +
// PTSM + PTQNM + PTQCM + PTCM + PTRMS + PTMEAN + PTGM + PTH extends
// the (harmonic, geometric, arithmetic, quadratic, cubic, quartic,
// quintic, sextic, septic, octic, nonic, decic, undecic) power-mean
// centre-anchor TREDECET into a QUATTUORDECET (harmonic, geometric,
// arithmetic, quadratic, cubic, quartic, quintic, sextic, septic,
// octic, nonic, decic, undecic, duodecic), and lets a reader read
// the OUTLIER-DAMPENING GRADIENT across FOURTEEN increasingly outlier-
// tolerant centres.
//
// Composite regime labels emitted by joining PTDUM+PTUM+PTDM+PTNM+PTOM:
//
//   * PTDUM tight + PTUM tight + PTDM tight + PTNM tight + PTOM tight
//                                     -> SYMMETRIC POOL or MODERATE-
//                                     SKEW pool where every power-
//                                     mean anchor sits close enough
//                                     to the range to dampen.
//   * PTDUM tight + PTUM tight + PTDM tight + PTNM tight + PTOM tight
//     but PTRMS spread                -> MILD OUTLIER that PTRMS
//                                     flags spread but PTQCM + PTQNM
//                                     + PTSM + PTSEM + PTOM + PTNM +
//                                     PTDM + PTUM + PTDUM absorb by
//                                     raising the outlier to the 4th +
//                                     5th + 6th + 7th + 8th + 9th +
//                                     10th + 11th + 12th power into
//                                     the anchor. Reference: [1x9, 10]
//                                     reads PTDUM 1.0904 tight, PTUM
//                                     1.1096 tight, PTDM 1.1330 tight,
//                                     PTNM 1.1624 tight, PTOM 1.2002
//                                     tight, PTRMS 2.726 spread.
//   * PTDUM spread + PTUM spread + PTDM spread + PTNM spread + PTOM spread
//                                     -> EXTREME OUTLIER that even
//                                     the duodecic mean cannot absorb
//                                     fully; range still lifts PTDUM
//                                     into spread. Reference:
//                                     [1x9, 100] reads PTDUM 1.1994
//                                     spread, PTUM 1.2205 spread,
//                                     PTDM 1.2463 spread.
//   * PTDUM wide + PTUM wide + PTDM wide + PTNM wide + PTOM wide
//                                     -> RUNAWAY OUTLIER with a
//                                     large pool: raising to the 12th
//                                     power STILL leaves range
//                                     dominant over the anchor
//                                     because the outlier ratio
//                                     exceeds n^(1/12). Reference:
//                                     [1x99, 100] reads PTDUM 1.4531
//                                     wide.
//   * PTDUM tight + PTUM tight + PTDM tight + PTNM tight + PTOM tight
//                                     -> ISOLATED HIGH PARTNER (two-
//                                     partner pool). Ref: [1, 100]
//                                     reads PTDUM 1.0489 tight, PTUM
//                                     1.0544 tight, PTDM 1.0611 tight,
//                                     PTNM 1.0693 tight.
//   * PTDUM wide + PTUM tight          -> unreachable because
//                                     duodecic_mean is ALWAYS >=
//                                     undecic_mean by Power Mean
//                                     inequality (M_12 >= M_11), so
//                                     ptdum = range/duodecic_mean <=
//                                     ptum = range/undecic_mean by
//                                     construction. Guarded on the
//                                     reference distributions below
//                                     as a documented invariant.
//
// PTDUM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// duodecic_mean approaches x_max / n^(1/12), so ptdum approaches
// (x_max - x_min) / (x_max / n^(1/12)) = n^(1/12) * (1 - x_min/x_max)
// -> n^(1/12) as x_max -> +Inf. For n=10 the ceiling is 10^(1/12) ~=
// 1.2115, so even the most extreme outlier in a 10-partner pool
// reads ptdum just below 1.22 (spread but never above ~1.22). For
// n=100 the ceiling climbs to 100^(1/12) ~= 1.4678, so a large pool
// with a dominant outlier reads wide. Pools with pool_count >= 12
// escape into wide (since 12^(1/12) ~= 1.2301 > wide_min = 1.22 so
// pool_count >= 12 pools can reach wide). This asymptotic behaviour
// makes PTDUM an even CLEANER outlier-tolerance read than PTUM in the
// peak-to-X family -- extreme values are naturally absorbed even
// harder and only truly LARGE pools with runaway outliers escape
// into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptdum null (empty pool).
//   * pool_count 1                  -> ptdum null (solo -- range = 0
//                                     and DUM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptdum null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptdum null (duodecic_mean_zero
//     duodecic_mean == 0               -- unreachable since duodecic_mean
//                                     of non-negative counts is zero
//                                     iff every value is zero and
//                                     counts are always >= 1, but
//                                     guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptdum in [0, +Inf) rounded to
//     duodecic_mean > 0                4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and duodecic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> DUM = k, range 0, ptdum 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(x^12) = 1367428536133, DUM =
//                                     136742853613.3^(1/12) ~= 8.4721,
//                                     range 9, ptdum ~= 1.0623 (tight
//                                     -- well under the 1.10 tight/
//                                     spread boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^12) = 1000000000009, DUM =
//                                     100000000000.9^(1/12) ~= 8.2540,
//                                     range 9, ptdum ~= 1.0904 (tight
//                                     -- MILD-SINGLE-OUTLIER absorbed
//                                     by the duodecic mean where
//                                     P11.252 PTRMS reads spread +
//                                     P11.250 PTH + P11.248 PTGM read
//                                     wide; even softer than P11.276
//                                     PTUM's 1.1096 tight landing).
//   * two-shoulders [1x8, 5x2]      -> sum(x^12) = 488281258, DUM =
//                                     48828125.8^(1/12) ~= 4.3724,
//                                     range 4, ptdum ~= 0.9148 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^12) = 5000000000005, DUM =
//                                     500000000000.5^(1/12) ~= 9.4387,
//                                     range 9, ptdum ~= 0.9535 (tight
//                                     -- BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^12) = 10^24 + 9, DUM =
//                                     10^23^(1/12) ~= 82.5404, range
//                                     99, ptdum ~= 1.1994 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/12) ~ 1.2115 asymptote and
//                                     lands just above the tight
//                                     boundary).
//   * two-partner [1, 9]            -> sum(x^12) = 282429536482, DUM =
//                                     141214768241^(1/12) ~= 8.4949,
//                                     range 8, ptdum ~= 0.9417 (tight).
//   * two-partner [1, 100]          -> sum(x^12) = 10^24 + 1, DUM =
//                                     5x10^23^(1/12) ~= 94.3874,
//                                     range 99, ptdum ~= 1.0489 (tight
//                                     -- ISOLATED HIGH PARTNER;
//                                     duodecic mean captures the
//                                     outlier).
//   * small [10, 1, 1]              -> sum(x^12) = 1000000000002, DUM =
//                                     333333333334^(1/12) ~= 9.1251,
//                                     range 9, ptdum ~= 0.9863 (TIGHT
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER DAMPENING; PTDUM
//                                     approaches the 3-partner
//                                     asymptote 3^(1/12) ~= 1.0959 as
//                                     the outlier grows).
//   * pool_count=100 [1x99, 100]    -> sum(x^12) = 10^24 + 99, DUM =
//                                     10^22^(1/12) ~= 68.1292, range
//                                     99, ptdum ~= 1.4531 (WIDE --
//                                     RUNAWAY OUTLIER at pool_count
//                                     much greater than 10).
//
// Bands on raw ptdum (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 10 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR duodecic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptdum < 1.10 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- duodecic mean
//                          pulled UP hard by raising the large
//                          values to the 12th power dominates the
//                          anchor)
//   * spread               ptdum in [1.10, 1.22) (extreme-outlier
//                          regime where even the duodecic-lifted
//                          anchor leaves the range slightly dominant
//                          -- asymptotic ceiling ~ n^(1/12) so 10-
//                          partner pools cap near 1.2115)
//   * wide                 ptdum >= 1.22 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 12 where n^(1/12) climbs
//                          past the wide cutoff; only pools of size
//                          12 or larger with dominant outliers reach
//                          here)
//
// Both cutoffs are exposed on the envelope as tight_ptdum_max /
// wide_ptdum_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptdum = MORE range against duodecic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM + P11.260 PTCM + P11.262 PTQCM + P11.264 PTQNM +
// P11.266 PTSM + P11.268 PTSEM + P11.270 PTOM + P11.272 PTNM +
// P11.274 PTDM + P11.276 PTUM tight/spread/wide vocabulary). Reuses
// the exact 3-band label set so a reader scanning the DISPERSION
// additive/ratio family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.279):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUndecicMeanSection
// (P11.276) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duodecic-center after
// the P11.276 range-against-undecic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE (P11.254) ->
// PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN (P11.258) ->
// PEAK-TO-CUBIC-MEAN (P11.260) -> PEAK-TO-QUARTIC-MEAN (P11.262) ->
// PEAK-TO-QUINTIC-MEAN (P11.264) -> PEAK-TO-SEXTIC-MEAN (P11.266) ->
// PEAK-TO-SEPTIC-MEAN (P11.268) -> PEAK-TO-OCTIC-MEAN (P11.270) ->
// PEAK-TO-NONIC-MEAN (P11.272) -> PEAK-TO-DECIC-MEAN (P11.274) ->
// PEAK-TO-UNDECIC-MEAN (P11.276) -> PEAK-TO-DUODECIC-MEAN (this
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
type PtdumLabel =
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

// Bands on raw ptdum (fixed cutoffs since duodecic_mean scales with
// cell counts and typical duodecic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-
// shoulders + bimodal-split + two-partner + small pools read tight,
// extreme-outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 10 read wide. Cutoffs tighten P11.276 PTUM's
// 1.12/1.24 pair down to 1.10/1.22 because duodecic_mean >=
// undecic_mean by Power Mean inequality (M_12 >= M_11) so ptdum <=
// ptum for every non-flat pool -- keeping the spread cutoff at 1.10
// means the MILD-OUTLIER regime (which P11.276 PTUM reads TIGHT at
// 1.1096) stays TIGHT here too (1.0904 < 1.10), the EXTREME-OUTLIER
// regime (which P11.276 reads SPREAD) stays SPREAD here as well
// (1.1994 in [1.10, 1.22)), and the wide cutoff drops from 1.24 to
// 1.22 so only pool_count >= 12 pools reach wide (12^(1/12) ~=
// 1.2301 is just past the wide floor).
const TIGHT_PTDUM_MAX = 1.1;
const WIDE_PTDUM_MIN = 1.22;

// PTDUM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTDUM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duodecic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duodecic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdum_max: number;
  readonly wide_ptdum_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanMap;
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

// Peak-to-duodecic-mean of a discrete distribution:
//   PTDUM = (max - min) / duodecic_mean
// where duodecic_mean = ((sum x_i^12) / n)^(1/12). Returns null on
// empty, solo, and degenerate (zero duodecic_mean or non-finite
// twelfth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duodecic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_duodecic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and DUM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_duodecic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_duodecic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twelfthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    twelfthSum += oct * quad;
  }
  if (!Number.isFinite(twelfthSum) || twelfthSum <= 0) {
    // Belt-and-braces: sum of twelfth-power non-negative counts is
    // always >= 0 and > 0 whenever any count is > 0. Any float
    // pathology (NaN, Infinity) that slipped past the ingest
    // guarantees degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_duodecic_mean: null };
  }
  const duodecic_mean = Math.pow(twelfthSum / pool_count, 1 / 12);
  if (!Number.isFinite(duodecic_mean) || duodecic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_duodecic_mean: null };
  }
  const range = max - min;
  const ptdum = range / duodecic_mean;
  // Clamp tiny negative float-noise to 0; ptdum is non-negative by
  // construction because range >= 0 and duodecic_mean > 0.
  const clamped = ptdum < 0 ? 0 : ptdum;
  return {
    pool_count,
    pool_cells,
    peak_to_duodecic_mean: roundTo(clamped, PTDUM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duodecic_mean: partner.peak_to_duodecic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duodecic_mean: metric.peak_to_duodecic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuodecicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean {
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
    tight_ptdum_max: TIGHT_PTDUM_MAX,
    wide_ptdum_min: WIDE_PTDUM_MIN,
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

function labelForPtdum(
  pool_count: number,
  pool_cells: number,
  ptdum: number | null,
  tight_max: number,
  wide_min: number,
): PtdumLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdum === null) return "degenerate";
  if (ptdum >= wide_min) return "wide";
  if (ptdum < tight_max) return "tight";
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

function renderPtdumCell(
  pool_count: number,
  pool_cells: number,
  ptdum: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdum(
    pool_count,
    pool_cells,
    ptdum,
    tight_max,
    wide_min,
  );
  const ptdumText = ptdum === null ? "-" : ptdum.toFixed(4);
  return `PTDUM ${ptdumText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdum_max, wide_ptdum_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdumCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duodecic_mean, tight_ptdum_max, wide_ptdum_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdumCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duodecic_mean, tight_ptdum_max, wide_ptdum_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUODECIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUODECIC-CENTER scalar over the P11.161 pool &mdash; ptdum = (max - min) / duodecic_mean where duodecic_mean = ((sum x_i^12) / n)^(1/12). Reads the pool's total RANGE in units of its DUODECIC (power-mean-of-order-12, M_12) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.276 PTUM because raising the large values to the TWELFTH power before averaging lifts the anchor MORE than raising to the eleventh does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the DUODECIC (POWER-MEAN-OF-ORDER-12) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic M_3, quartic M_4, quintic M_5, sextic M_6, septic M_7, octic M_8, nonic M_9, decic M_10, undecic M_11) power-mean tredecet into a QUATTUORDECET with the M_12 duodecic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdum approaches n^(1/12) so 10-partner pools cap near 1.2115 and only pools with pool_count &gt;= 12 escape into wide (12^(1/12) ~= 1.2301 is just past the wide floor). Composite regime labels: PTDUM tight + PTUM tight + PTDM tight + PTNM tight + PTOM tight + PTRMS spread = MILD OUTLIER absorbed by duodecic ([1x9, 10] reads PTDUM 1.0904 tight); PTDUM spread + PTUM spread + PTDM spread = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTDUM 1.1994 spread); PTDUM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.4531 wide); PTDUM tight + PTUM tight + PTDM tight + PTNM tight + PTOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0489 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duodecic_mean == 0 (guarded but unreachable), tight = ptdum &lt; ${tight_ptdum_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptdum in [${tight_ptdum_max}, ${wide_ptdum_min}) (extreme-outlier regime), wide = ptdum &ge; ${wide_ptdum_min} (runaway-outlier regime with pool_count &gt;= 12). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdum null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDUM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDUM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
