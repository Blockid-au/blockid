// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-HARMEAN
// pure-lib (P11.250).
//
// WHOLE-POOL RANGE-AGAINST-HARMONIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// HARMONIC MEAN:
//
//   pth = (max - min) / harmean
//
// where harmean = n / sum(1/x_i). Reads the peak spread against the
// INVERSE-ARITHMETIC centre so a small-value-dominated pool that the
// P11.248 peak-to-geomean surface flags SPREAD (because the geometric
// mean is pulled part-way toward the low cluster) reads WIDE here
// (because the harmonic mean is pulled EVEN MORE toward the low
// cluster by the inverse-arithmetic average and elevates the ratio
// against the range).
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
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median. Reads
//                                    range in units of the ORDER-
//                                    STATISTIC CENTER.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1. Reads range
//                                    in units of the LOWER SHOULDER.
//   * P11.244 PEAK-TO-Q3           - (max - min) / Q3. Reads range
//                                    in units of the UPPER SHOULDER.
//   * P11.246 PEAK-TO-MEAN         - (max - min) / mean. Reads range
//                                    in units of the ARITHMETIC
//                                    CENTER.
//   * P11.248 PEAK-TO-GEOMEAN      - (max - min) / geomean. Reads
//                                    range in units of the GEOMETRIC
//                                    (MULTIPLICATIVE) CENTER.
//
// PTH's unique DISPERSION-axis contribution: reads range in units of
// the HARMONIC (INVERSE-ARITHMETIC) CENTER. Every other range-based
// DISPERSION surface either scales range against a scale statistic
// (sigma for P11.237 studentized-range), the total span (P11.213
// coefficient-of-range), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), an ARITHMETIC centre (P11.246 PTMEAN),
// or a GEOMETRIC centre (P11.248 PTGM). The HARMONIC mean is the
// centre pulled MOST STRONGLY toward SMALL values by the AM-GM-HM
// inequality (harmean <= geomean <= mean; equality iff all values
// equal). PTH's contrast with PTGM completes the (arithmetic-center,
// geometric-center, harmonic-center) centre-anchor triple for the
// range-based dispersion axis, and lets a reader distinguish between:
//
//   * PTH wide + PTGM spread + PTMEAN tight  -> SMALL-VALUE-DOMINATED
//                                     (the harmonic mean is pulled
//                                     way down toward the small
//                                     cluster even harder than the
//                                     geomean, so the range dominates
//                                     the harmonic centre while the
//                                     geometric centre still holds
//                                     the ratio in the spread band).
//                                     Reference: [10, 1, 1] reads
//                                     PTH 6.3 wide, PTGM 4.1774
//                                     spread, PTMEAN 1.5 tight.
//   * PTH wide + PTGM wide + PTMEAN tight    -> ISOLATED HIGH PARTNER
//                                     (all three centres agree the
//                                     pool has one dominant partner
//                                     paired with an isolated high
//                                     but the arithmetic mean sits
//                                     mid-range and dampens). Reference:
//                                     [1, 100] reads PTH 49.995 wide,
//                                     PTGM 9.9 wide, PTMEAN 1.9604
//                                     tight.
//   * PTH wide + PTGM wide + PTMEAN wide     -> EXTREME OUTLIER (all
//                                     three centres stay small enough
//                                     for the range to still flag
//                                     wide on every one). Reference:
//                                     [1x9, 100] reads PTH 89.199
//                                     wide, PTGM 62.4648 wide, PTMEAN
//                                     9.0826 wide.
//   * PTH spread + PTGM spread + PTMEAN tight -> BIMODAL SPLIT (mean
//                                     sits between the two clusters
//                                     and dampens the ratio; geomean
//                                     and harmean both pulled down
//                                     toward the low cluster to a
//                                     comparable degree). Reference:
//                                     [1x5, 10x5] reads PTH 4.95
//                                     spread, PTGM 2.846 spread,
//                                     PTMEAN 1.6364 tight.
//   * PTH tight + PTGM tight + PTMEAN tight  -> FLAT / UNIFORM (all
//                                     three centres agree and dominate
//                                     the range). Reference: uniform
//                                     ramp [1..10] reads PTH 2.6361
//                                     tight, PTGM 1.9873 tight, PTMEAN
//                                     1.6364 tight.
//   * PTH tight + PTGM wide                 -> unreachable because
//                                     harmean is ALWAYS <= geomean for
//                                     non-negative values (AM-GM-HM
//                                     inequality), so pth = range/
//                                     harmean >= ptgm = range/geomean
//                                     by construction. Guarded on the
//                                     reference distributions below as
//                                     a documented invariant.
//
// The SMALL-VALUE-DOMINATED regime is the one that PTH uniquely
// FLAGS -- P11.248 PTGM cannot tell [10, 1, 1] apart from a two-
// shoulders [1x8, 5x2] pool because both read spread; the shape gap
// is real but the LABEL is the same. PTH reads them at 6.3 (wide
// small-value-dominated) and 3.36 (spread two-shoulders) so the
// LABEL diverges, giving a downstream reader the coarser-than-numeric
// signal that a small three-partner pool with a lone outlier has a
// LOW-MASS CONCENTRATION that the geometric centre only partially
// captured.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> pth null (empty pool).
//   * pool_count 1                  -> pth null (solo -- range = 0
//                                     and harmean = the sole cell so
//                                     the ratio would trivially read
//                                     0, but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> pth null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> pth null (degenerate -- any
//     min value <= 0                  non-positive count would make
//                                     1/x undefined or negative and
//                                     poison the harmonic mean;
//                                     unreachable since counts are
//                                     always >= 1 but guarded for
//                                     future upstream robustness).
//   * pool_count >= 2 and           -> pth in [0, +Inf) rounded to
//     min > 0                         4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and harmean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, harmean k, pth 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sum(1/x) = 2.92897, harmean =
//                                     10/2.92897 = 3.4142, range 9,
//                                     pth = 9/3.4142 = 2.6361 (tight
//                                     -- well under the 3.0 boundary
//                                     for the tight/spread cutoff).
//   * upper-outlier [1x9, 10]       -> sum(1/x) = 9 + 0.1 = 9.1,
//                                     harmean = 10/9.1 = 1.0989,
//                                     range 9, pth = 9/1.0989 = 8.19
//                                     (wide -- ISOLATED OUTLIER
//                                     regime same wide label as
//                                     P11.248 PTGM but with a MUCH
//                                     larger numeric magnitude because
//                                     the harmonic average of 9 ones
//                                     and one ten sits at 1.0989
//                                     rather than the geometric mean
//                                     of 1.2589).
//   * two-shoulders [1x8, 5x2]      -> sum(1/x) = 8 + 0.4 = 8.4,
//                                     harmean = 10/8.4 = 1.1905,
//                                     range 4, pth = 4/1.1905 = 3.36
//                                     (spread).
//   * 50/50 split [1x5, 10x5]       -> sum(1/x) = 5 + 0.5 = 5.5,
//                                     harmean = 10/5.5 = 1.8182,
//                                     range 9, pth = 9/1.8182 = 4.95
//                                     (SPREAD -- BIMODAL SPLIT regime
//                                     stays spread in agreement with
//                                     P11.248 PTGM 2.846 but with a
//                                     tighter margin against the wide
//                                     boundary of 5.0).
//   * extreme outlier [1x9, 100]    -> sum(1/x) = 9 + 0.01 = 9.01,
//                                     harmean = 10/9.01 = 1.1099,
//                                     range 99, pth = 99/1.1099 =
//                                     89.199 (wide -- EXTREME OUTLIER
//                                     regime flagged wide same as
//                                     PTGM + PTMEAN).
//   * two-partner [1, 9]            -> sum(1/x) = 1 + 0.1111 = 1.1111,
//                                     harmean = 2/1.1111 = 1.8, range
//                                     8, pth = 8/1.8 = 4.4444 (spread).
//   * two-partner [1, 100]          -> sum(1/x) = 1 + 0.01 = 1.01,
//                                     harmean = 2/1.01 = 1.9802,
//                                     range 99, pth = 99/1.9802 =
//                                     49.995 (WIDE -- ISOLATED HIGH
//                                     PARTNER regime flagged wide
//                                     where P11.246 PTMEAN reads
//                                     tight because the arithmetic
//                                     mean of 50.5 sits mid-range).
//   * small [10, 1, 1]              -> sum(1/x) = 0.1 + 1 + 1 = 2.1,
//                                     harmean = 3/2.1 = 1.4286, range
//                                     9, pth = 9/1.4286 = 6.3 (WIDE
//                                     -- SMALL-VALUE-DOMINATED regime
//                                     uniquely flagged wide where
//                                     P11.248 PTGM 4.1774 reads
//                                     spread).
//   * small [1, 1, 10]              -> identical to above (rank-order
//                                     invariant).
//
// Bands on raw pth (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp + flat + solo pools land
// in tight, two-shoulders + bimodal-split + two-partner-[1,9] pools
// land in spread, and outlier + isolated-high-partner + small-value-
// dominated pools land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR min <= 0 (guarded but unreachable)
//   * tight                pth < 3.0 (flat, uniform ramp regimes)
//   * spread               pth in [3.0, 5.0) (two-shoulders +
//                          bimodal-split + two-partner-[1,9] regimes)
//   * wide                 pth >= 5.0 (single-outlier + isolated-
//                          high-partner + extreme-outlier + small-
//                          value-dominated regimes where the range
//                          dominates the harmonic center)
//
// Both cutoffs are exposed on the envelope as tight_pth_max /
// wide_pth_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH pth = MORE range against harmonic centre = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM
// tight/spread/wide vocabulary). Reuses the exact 3-band label set
// so a reader scanning the DISPERSION additive/ratio family sees
// the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.251):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToGeomeanSection
// (P11.248) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-harmonic-center after
// the P11.248 range-against-geometric-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ... ->
// GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) -> PEAK-TO-Q1 (P11.242)
// -> PEAK-TO-Q3 (P11.244) -> PEAK-TO-MEAN (P11.246) -> PEAK-TO-GEOMEAN
// (P11.248) -> PEAK-TO-HARMEAN (this module) -> per-pair hot-cells
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
type PthLabel =
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

// Bands on raw pth (fixed cutoffs since the harmean scales with
// cell counts and typical harmonic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so uniform ramp + flat pools read tight, two-
// shoulders + bimodal-split + two-partner-[1,9] pools read spread,
// and outlier + isolated-high-partner + small-value-dominated pools
// read wide. Tight/spread boundary is HIGHER than PTGM's 2.0 because
// the harmonic mean sits below the geometric mean by AM-GM-HM so
// pth >= ptgm for every non-flat pool -- lifting the tight boundary
// to 3.0 keeps a uniform ramp (a well-behaved shape) tight rather
// than flipping to spread just because the anchor moved down.
const TIGHT_PTH_MAX = 3.0;
const WIDE_PTH_MIN = 5.0;

// PTH rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTH_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToHarmeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_harmean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_harmean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHarmeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToHarmeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToHarmeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToHarmeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToHarmeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHarmeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pth_max: number;
  readonly wide_pth_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToHarmeanMap;
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

// Peak-to-harmean of a discrete distribution:
//   PTH = (max - min) / harmean
// where harmean = n / sum(1/x_i). Returns null on empty, solo, and
// degenerate (any non-positive value) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_harmean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and harmean = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  if (min <= 0) {
    // Non-positive value -- unreachable for count integers >= 1
    // (the ingest path only increments counters so map values are
    // always >= 1) but guarded because 1/0 = Infinity and 1/<0 is
    // negative which would poison the harmonic mean. Report null so
    // the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  let inverseSum = 0;
  for (const v of values) inverseSum += 1 / v;
  if (!Number.isFinite(inverseSum) || inverseSum <= 0) {
    // Belt-and-braces: sum of finite positive reciprocals is always
    // > 0, but any float pathology (NaN, Infinity) that slipped past
    // the min > 0 guard degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  const harmean = pool_count / inverseSum;
  if (!Number.isFinite(harmean) || harmean <= 0) {
    return { pool_count, pool_cells, peak_to_harmean: null };
  }
  const range = max - min;
  const pth = range / harmean;
  // Clamp tiny negative float-noise to 0; pth is non-negative by
  // construction because range >= 0 and harmean > 0.
  const clamped = pth < 0 ? 0 : pth;
  return {
    pool_count,
    pool_cells,
    peak_to_harmean: roundTo(clamped, PTH_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHarmeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_harmean: partner.peak_to_harmean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_harmean: metric.peak_to_harmean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHarmeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean {
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
    tight_pth_max: TIGHT_PTH_MAX,
    wide_pth_min: WIDE_PTH_MIN,
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

function labelForPth(
  pool_count: number,
  pool_cells: number,
  pth: number | null,
  tight_max: number,
  wide_min: number,
): PthLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pth === null) return "degenerate";
  if (pth >= wide_min) return "wide";
  if (pth < tight_max) return "tight";
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

function renderPthCell(
  pool_count: number,
  pool_cells: number,
  pth: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPth(
    pool_count,
    pool_cells,
    pth,
    tight_max,
    wide_min,
  );
  const pthText = pth === null ? "-" : pth.toFixed(4);
  return `PTH ${pthText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pth_max, wide_pth_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_harmean, tight_pth_max, wide_pth_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_harmean, tight_pth_max, wide_pth_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-HARMEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-HARMONIC-CENTER scalar over the P11.161 pool &mdash; pth = (max - min) / harmean where harmean = n / sum(1/x_i). Reads the pool's total RANGE in units of its HARMONIC MEAN so a SMALL-VALUE-DOMINATED pool that the P11.248 peak-to-geomean surface flags SPREAD (because the geometric mean is only partially pulled down toward the low cluster) reads WIDE here (because the harmonic mean is pulled EVEN MORE toward the low cluster by the inverse-arithmetic average and elevates the ratio against the range). Unique DISPERSION-axis contribution: reads range in units of the HARMONIC (INVERSE-ARITHMETIC) CENTER &mdash; every other range-based DISPERSION surface anchors on a scale statistic (P11.237), the total span (P11.213), an order-statistic anchor (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), an ARITHMETIC centre (P11.246 PTMEAN), or a GEOMETRIC centre (P11.248 PTGM). PTH's contrast with PTGM completes the (arithmetic-center, geometric-center, harmonic-center) centre-anchor triple for the range-based dispersion read: PTH wide + PTGM spread + PTMEAN tight = SMALL-VALUE-DOMINATED (harmonic mean pulled way down toward small cluster harder than geomean); PTH wide + PTGM wide + PTMEAN tight = ISOLATED HIGH PARTNER (all three centres agree; arithmetic mean dampens); PTH wide + PTGM wide + PTMEAN wide = EXTREME OUTLIER (all three centres stay small enough for range to still flag wide); PTH spread + PTGM spread + PTMEAN tight = BIMODAL SPLIT (mean sits between clusters); PTH tight + PTGM tight + PTMEAN tight = FLAT / UNIFORM (all three centres agree). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR min &le; 0 (guarded but unreachable), tight = pth &lt; ${tight_pth_max} (flat, uniform ramp regimes), spread = pth in [${tight_pth_max}, ${wide_pth_min}) (two-shoulders + bimodal-split + two-partner-[1,9] regimes), wide = pth &ge; ${wide_pth_min} (single-outlier + isolated-high-partner + extreme-outlier + small-value-dominated regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pth null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTH</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTH</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
