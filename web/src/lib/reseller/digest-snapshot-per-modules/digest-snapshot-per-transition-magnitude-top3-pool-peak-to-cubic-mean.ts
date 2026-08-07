// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-CUBIC-MEAN
// pure-lib (P11.260).
//
// WHOLE-POOL RANGE-AGAINST-CUBIC-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that reports
// the pool's total RANGE (max - min) in units of the pool's CUBIC MEAN
// (a.k.a. power mean of order 3, M_3):
//
//   ptcm = (max - min) / cubic_mean
//
// where cubic_mean = ((sum x_i^3) / n)^(1/3). Reads the peak spread
// against the CUBIC (power-mean-of-order-3) centre so a LARGE-VALUE-
// DOMINATED pool reads TIGHTER here than under P11.252 PTRMS, because
// cubing the large values before averaging lifts the anchor MORE than
// squaring does, dampening the ratio against the range even harder.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units.
//   * P11.199 MAD                  - mean(|x_i - mean|).
//   * P11.201 MedAD                - median(|x_i - median|).
//   * P11.145 CV                   - sigma / mean.
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//   * P11.238 GMD                  - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1.
//   * P11.244 PEAK-TO-Q3           - (max - min) / Q3.
//   * P11.246 PEAK-TO-MEAN         - (max - min) / mean.        [M_1]
//   * P11.248 PEAK-TO-GEOMEAN      - (max - min) / geomean.     [M_0]
//   * P11.250 PEAK-TO-HARMEAN      - (max - min) / harmean.     [M_-1]
//   * P11.252 PEAK-TO-RMS          - (max - min) / rms.         [M_2]
//   * P11.254 PEAK-TO-MIDHINGE     - (max - min) / midhinge.
//   * P11.256 PEAK-TO-TRIMEAN      - (max - min) / trimean.
//   * P11.258 PEAK-TO-QUARTILE-MEAN - (max - min) / quartile_mean.
//
// PTCM's unique DISPERSION-axis contribution: reads range in units of
// the CUBIC (POWER-MEAN-OF-ORDER-3) CENTER. Every other range-based
// DISPERSION surface anchors on a scale statistic (P11.237), a total
// span (P11.213), an order-statistic anchor (P11.240 PTM, P11.242 PTQ1,
// P11.244 PTQ3), a hinge/median composite (P11.254 PTMH, P11.256 PTTRI,
// P11.258 PTQM), or one of the LOWER-ORDER Pythagorean means (harmean
// M_-1, geomean M_0, arithmetic mean M_1, quadratic mean/rms M_2). The
// CUBIC mean is the FIRST power mean above the RMS in the Power Mean
// hierarchy — it is pulled toward LARGE values EVEN HARDER than RMS by
// the Power Mean inequality (harmean <= geomean <= mean <= rms <=
// cubic_mean; equality iff all values equal). PTCM's contrast with
// PTRMS + PTMEAN + PTGM + PTH extends the (harmonic, geometric,
// arithmetic, quadratic) power-mean centre-anchor QUARTET into a
// QUINTET (harmonic, geometric, arithmetic, quadratic, cubic), and
// lets a reader read the OUTLIER-DAMPENING GRADIENT across five
// increasingly outlier-tolerant centres.
//
// Composite regime labels emitted by joining PTCM+PTRMS+PTMEAN:
//
//   * PTCM tight + PTRMS tight  + PTMEAN tight        -> SYMMETRIC POOL
//                                     or MODERATE-SKEW pool where every
//                                     power-mean anchor sits close
//                                     enough to the range to dampen.
//   * PTCM tight + PTRMS spread + PTMEAN spread       -> MILD OUTLIER
//                                     that PTRMS/PTMEAN flag spread
//                                     but PTCM absorbs by cubing the
//                                     outlier into the anchor. Reference:
//                                     [1x9, 10] reads PTCM 1.9332 tight,
//                                     PTRMS 2.726 spread, PTMEAN 4.7368
//                                     spread.
//   * PTCM spread + PTRMS wide  + PTMEAN wide         -> EXTREME OUTLIER
//                                     that even the cubic mean cannot
//                                     absorb fully; range still lifts
//                                     PTCM into spread. Reference:
//                                     [1x9, 100] reads PTCM 2.1329
//                                     spread, PTRMS 3.1292 wide,
//                                     PTMEAN 9.0826 wide.
//   * PTCM wide + PTRMS wide + PTMEAN wide            -> RUNAWAY OUTLIER
//                                     with a large pool: cubing STILL
//                                     leaves range dominant over the
//                                     anchor because the outlier ratio
//                                     exceeds n^(1/3). Reference:
//                                     [1x99, 100] reads PTCM 4.595
//                                     wide.
//   * PTCM tight + PTRMS tight + PTMEAN tight         -> ISOLATED HIGH
//                                     PARTNER (two-partner pool). Ref:
//                                     [1, 100] reads PTCM 1.2473 tight,
//                                     PTRMS 1.4 tight, PTMEAN 1.9604
//                                     tight.
//   * PTCM wide + PTRMS tight                         -> unreachable
//                                     because cubic_mean is ALWAYS >=
//                                     rms by Power Mean inequality
//                                     (M_3 >= M_2), so ptcm =
//                                     range/cubic_mean <= ptrms =
//                                     range/rms by construction.
//                                     Guarded on the reference
//                                     distributions below as a
//                                     documented invariant.
//
// PTCM's asymptotic ceiling: for a pool of size n with a single
// dominant outlier x_max and every other cell at x_min << x_max,
// cubic_mean approaches x_max / n^(1/3), so ptcm approaches (x_max -
// x_min) / (x_max / n^(1/3)) = n^(1/3) * (1 - x_min/x_max) -> n^(1/3)
// as x_max -> +Inf. For n=10 the ceiling is 10^(1/3) ~= 2.1544, so
// even the most extreme outlier in a 10-partner pool reads ptcm just
// above 2.0 (spread but never above ~2.16). For n=100 the ceiling
// climbs to 100^(1/3) ~= 4.64, so a large pool with a dominant outlier
// reads wide. This asymptotic behaviour makes PTCM the CLEANEST
// outlier-tolerance read in the peak-to-X family — extreme values are
// naturally absorbed and only truly LARGE pools with runaway outliers
// escape into wide.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptcm null (empty pool).
//   * pool_count 1                  -> ptcm null (solo -- range = 0
//                                     and CM = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but "solo" conveys more
//                                     information for a single-
//                                     partner pool).
//   * pool_count >= 2 and           -> ptcm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptcm null (cubic_mean_zero --
//     cubic_mean == 0                 unreachable since cubic_mean of
//                                     non-negative counts is zero iff
//                                     every value is zero and counts
//                                     are always >= 1, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptcm in [0, +Inf) rounded to
//     cubic_mean > 0                  4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and cubic_mean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> CM = k, range 0, ptcm 0 (tight).
//   * uniform ramp [1..10]          -> sum(x^3) = 3025, CM =
//                                     (302.5)^(1/3) ~= 6.7126, range
//                                     9, ptcm ~= 1.3407 (tight -- well
//                                     under the 2.0 tight/spread
//                                     boundary).
//   * upper-outlier [1x9, 10]       -> sum(x^3) = 1009, CM =
//                                     (100.9)^(1/3) ~= 4.6521, range
//                                     9, ptcm ~= 1.9332 (tight --
//                                     MILD-SINGLE-OUTLIER absorbed by
//                                     the cubic mean where P11.252
//                                     PTRMS reads spread + P11.250
//                                     PTH + P11.248 PTGM read wide).
//   * two-shoulders [1x8, 5x2]      -> sum(x^3) = 258, CM =
//                                     (25.8)^(1/3) ~= 2.9553, range
//                                     4, ptcm ~= 1.3537 (tight).
//   * 50/50 split [1x5, 10x5]       -> sum(x^3) = 5005, CM =
//                                     (500.5)^(1/3) ~= 7.9377, range
//                                     9, ptcm ~= 1.1336 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> sum(x^3) = 1000009, CM =
//                                     (100000.9)^(1/3) ~= 46.416,
//                                     range 99, ptcm ~= 2.1329
//                                     (SPREAD -- EXTREME OUTLIER just
//                                     nudges above the tight boundary
//                                     as n^(1/3) ~ 2.1544 is
//                                     approached).
//   * two-partner [1, 9]            -> sum(x^3) = 730, CM = 365^(1/3)
//                                     ~= 7.1471, range 8, ptcm ~=
//                                     1.1194 (tight).
//   * two-partner [1, 100]          -> sum(x^3) = 1000001, CM =
//                                     500000.5^(1/3) ~= 79.3701,
//                                     range 99, ptcm ~= 1.2473 (tight
//                                     -- ISOLATED HIGH PARTNER; cubic
//                                     mean captures the outlier).
//   * small [10, 1, 1]              -> sum(x^3) = 1002, CM = 334^(1/3)
//                                     ~= 6.9440, range 9, ptcm ~=
//                                     1.2972 (TIGHT -- SMALL-VALUE-
//                                     DOMINATED with LARGE-PARTNER
//                                     DAMPENING; PTCM approaches the
//                                     3-partner asymptote 3^(1/3) ~=
//                                     1.4422 as the outlier grows).
//
// Bands on raw ptcm (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + upper-outlier +
// two-shoulders + bimodal-split + two-partner + small pools land in
// tight, extreme-outlier pools land in spread, and RUNAWAY-OUTLIER
// pools with pool_count much greater than 27 land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR cubic_mean == 0 (guarded but
//                          unreachable)
//   * tight                ptcm < 2.0 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes -- cubic mean
//                          pulled UP hard by cubing the large values
//                          dominates the anchor)
//   * spread               ptcm in [2.0, 3.0) (extreme-outlier
//                          regime where even the cubic-lifted anchor
//                          leaves the range slightly dominant --
//                          asymptotic ceiling ~ n^(1/3) so 10-partner
//                          pools cap near 2.16)
//   * wide                 ptcm >= 3.0 (RUNAWAY-OUTLIER regime with
//                          pool_count >> 27 where n^(1/3) climbs past
//                          the wide cutoff; only very large pools
//                          with dominant outliers reach here)
//
// Both cutoffs are exposed on the envelope as tight_ptcm_max /
// wide_ptcm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptcm = MORE range against cubic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS + P11.254 PTMH + P11.256 PTTRI +
// P11.258 PTQM tight/spread/wide vocabulary). Reuses the exact 3-band
// label set so a reader scanning the DISPERSION additive/ratio
// family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.261):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuartileMeanSection
// (P11.258) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-cubic-center after
// the P11.258 range-against-unweighted-quartile-composite landing.
// The hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> PEAK-TO-RMS (P11.252) -> PEAK-TO-MIDHINGE
// (P11.254) -> PEAK-TO-TRIMEAN (P11.256) -> PEAK-TO-QUARTILE-MEAN
// (P11.258) -> PEAK-TO-CUBIC-MEAN (this module) -> per-pair hot-cells
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
type PtcmLabel =
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

// Bands on raw ptcm (fixed cutoffs since cubic_mean scales with cell
// counts and typical cubic-center emissions land near 1-10 for the
// P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + upper-outlier + two-shoulders
// + bimodal-split + two-partner + small pools read tight, extreme-
// outlier pools read spread, and RUNAWAY-OUTLIER pools with
// pool_count >> 27 read wide. Cutoffs mirror the P11.252 PTRMS
// tight/spread (2.0) + spread/wide (3.0) boundaries because
// cubic_mean >= rms by Power Mean inequality (M_3 >= M_2) so ptcm <=
// ptrms for every non-flat pool -- keeping the tight boundary at 2.0
// means the EXTREME-OUTLIER regime (which P11.252 reads WIDE) is
// SOFTENED to SPREAD here, and only truly runaway pools (pool_count
// much greater than 27 with a dominant outlier) escape into wide.
const TIGHT_PTCM_MAX = 2.0;
const WIDE_PTCM_MIN = 3.0;

// PTCM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTCM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToCubicMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_cubic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_cubic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCubicMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToCubicMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToCubicMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToCubicMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToCubicMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToCubicMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCubicMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptcm_max: number;
  readonly wide_ptcm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToCubicMeanMap;
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

// Peak-to-cubic-mean of a discrete distribution:
//   PTCM = (max - min) / cubic_mean
// where cubic_mean = ((sum x_i^3) / n)^(1/3). Returns null on empty,
// solo, and degenerate (zero cubic_mean or non-finite cubed sum) so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_cubic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_cubic_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and CM = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_cubic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_cubic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let cubeSum = 0;
  for (const v of values) cubeSum += v * v * v;
  if (!Number.isFinite(cubeSum) || cubeSum <= 0) {
    // Belt-and-braces: sum of cubed non-negative counts is always
    // >= 0 and > 0 whenever any count is > 0. Any float pathology
    // (NaN, Infinity) that slipped past the ingest guarantees
    // degrades to null so downstream renders the "degenerate" label
    // rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_cubic_mean: null };
  }
  const cubic_mean = Math.cbrt(cubeSum / pool_count);
  if (!Number.isFinite(cubic_mean) || cubic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_cubic_mean: null };
  }
  const range = max - min;
  const ptcm = range / cubic_mean;
  // Clamp tiny negative float-noise to 0; ptcm is non-negative by
  // construction because range >= 0 and cubic_mean > 0.
  const clamped = ptcm < 0 ? 0 : ptcm;
  return {
    pool_count,
    pool_cells,
    peak_to_cubic_mean: roundTo(clamped, PTCM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToCubicMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_cubic_mean: partner.peak_to_cubic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_cubic_mean: metric.peak_to_cubic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToCubicMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCubicMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCubicMean {
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
    tight_ptcm_max: TIGHT_PTCM_MAX,
    wide_ptcm_min: WIDE_PTCM_MIN,
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

function labelForPtcm(
  pool_count: number,
  pool_cells: number,
  ptcm: number | null,
  tight_max: number,
  wide_min: number,
): PtcmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptcm === null) return "degenerate";
  if (ptcm >= wide_min) return "wide";
  if (ptcm < tight_max) return "tight";
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

function renderPtcmCell(
  pool_count: number,
  pool_cells: number,
  ptcm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtcm(
    pool_count,
    pool_cells,
    ptcm,
    tight_max,
    wide_min,
  );
  const ptcmText = ptcm === null ? "-" : ptcm.toFixed(4);
  return `PTCM ${ptcmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCubicMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToCubicMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptcm_max, wide_ptcm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtcmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_cubic_mean, tight_ptcm_max, wide_ptcm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtcmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_cubic_mean, tight_ptcm_max, wide_ptcm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-CUBIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-CUBIC-CENTER scalar over the P11.161 pool &mdash; ptcm = (max - min) / cubic_mean where cubic_mean = ((sum x_i^3) / n)^(1/3). Reads the pool's total RANGE in units of its CUBIC (power-mean-of-order-3, M_3) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.252 PTRMS because cubing the large values before averaging lifts the anchor MORE than squaring does, dampening the ratio against the range even harder. Unique DISPERSION-axis contribution: reads range in units of the CUBIC (POWER-MEAN-OF-ORDER-3) CENTER &mdash; extends the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2) Pythagorean quartet into a QUINTET with the M_3 cubic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptcm approaches n^(1/3) so 10-partner pools cap near 2.16 and only pools with pool_count &gt;&gt; 27 escape into wide. Composite regime labels: PTCM tight + PTRMS spread + PTMEAN spread = MILD OUTLIER absorbed by cubic ([1x9, 10] reads PTCM 1.9332 tight); PTCM spread + PTRMS wide + PTMEAN wide = EXTREME OUTLIER only partially absorbed ([1x9, 100] reads PTCM 2.1329 spread); PTCM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 4.595 wide); PTCM tight + PTRMS tight + PTMEAN tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.2473 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR cubic_mean == 0 (guarded but unreachable), tight = ptcm &lt; ${tight_ptcm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptcm in [${tight_ptcm_max}, ${wide_ptcm_min}) (extreme-outlier regime), wide = ptcm &ge; ${wide_ptcm_min} (runaway-outlier regime with pool_count much greater than 27). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptcm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTCM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTCM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
