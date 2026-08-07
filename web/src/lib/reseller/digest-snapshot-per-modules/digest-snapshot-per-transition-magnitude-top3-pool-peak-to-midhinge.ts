// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-MIDHINGE
// pure-lib (P11.254).
//
// WHOLE-POOL RANGE-AGAINST-HINGE-COMPOSITE dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// TUKEY MIDHINGE (a.k.a. midsummary = (Q1 + Q3) / 2):
//
//   ptmh = (max - min) / midhinge
//
// where midhinge = (Q1 + Q3) / 2 uses the Tukey EXCLUSIVE hinges
// (same convention as P11.242 PTQ1 + P11.244 PTQ3). Reads the peak
// spread against a ROBUST HINGE-COMPOSITE centre so a UPPER-OUTLIER
// pool that the P11.244 peak-to-Q3 surface flags TIGHT (because Q3
// sits in the upper cluster and dampens) and P11.242 peak-to-Q1
// flags WIDE (because Q1 sits in the lower cluster) reads WIDE here
// (because the midhinge averages the two shoulders and the outlier
// only lifts Q3, so midhinge stays near the low cluster while range
// tracks the outlier).
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
//   * P11.250 PEAK-TO-HARMEAN      - (max - min) / harmean. Reads
//                                    range in units of the HARMONIC
//                                    (INVERSE-ARITHMETIC) CENTER.
//   * P11.252 PEAK-TO-RMS          - (max - min) / rms. Reads range
//                                    in units of the QUADRATIC (ROOT-
//                                    MEAN-SQUARE) CENTER. Closes the
//                                    (harmonic, geometric, arithmetic,
//                                    quadratic) POWER-MEAN quartet.
//
// PTMH's unique DISPERSION-axis contribution: reads range in units
// of the ROBUST HINGE-COMPOSITE (TUKEY MIDSUMMARY) centre. Every
// other DISPERSION anchor in the peak-to-X series uses either a
// SINGLE order-statistic (P11.240 PTM median, P11.242 PTQ1 lower
// hinge, P11.244 PTQ3 upper hinge) or a POWER-MEAN centre computed
// over the FULL pool (P11.246 PTMEAN, P11.248 PTGM, P11.250 PTH,
// P11.252 PTRMS). The Tukey midhinge is neither: it AVERAGES the two
// hinges into a robust centre that ignores tail values entirely but
// picks up both shoulders symmetrically. That means the midhinge
// sits between Q1 and Q3 by construction (Q1 <= midhinge <= Q3), so
// PTMH always falls between PTQ3 and PTQ1 by monotonicity of the
// reciprocal on positive denominators:
//
//   PTQ3 = range/Q3 <= PTMH = range/midhinge <= PTQ1 = range/Q1
//
// with equality iff Q1 == Q3 (interior of the pool is flat). This
// invariant lets a reader place PTMH on the same tight/spread/wide
// vocabulary as PTQ1 + PTQ3 and read the difference as the "hinge
// spread" of the pool: when PTMH sits near PTQ3 the interior is
// top-heavy; when PTMH sits near PTQ1 the interior is bottom-heavy;
// when it lands halfway the two shoulders have equal cell counts.
//
// PTMH's contrast with PTQ1 + PTQ3 completes the (Q1, midhinge, Q3)
// TRIAD of Tukey hinge-based anchors for the range-based dispersion
// read, and lets a reader distinguish between:
//
//   * PTMH tight + PTQ1 tight + PTQ3 tight  -> FLAT / UNIFORM (all
//                                     three hinge anchors dominate
//                                     the range). Reference: flat
//                                     [k×10] reads all three 0.
//   * PTMH tight + PTQ1 spread + PTQ3 tight -> UNIFORM RAMP (midhinge
//                                     averages Q1 + Q3 into a
//                                     substantive fraction of range;
//                                     PTQ1 lifted because Q1 sits at
//                                     the ramp's floor). Reference:
//                                     uniform ramp [1..10] reads
//                                     PTMH 1.6364 tight + PTQ1 3.0
//                                     spread + PTQ3 1.125 tight.
//   * PTMH tight + PTQ1 wide + PTQ3 tight   -> BIMODAL SYMMETRIC
//                                     SPLIT (midhinge sits BETWEEN
//                                     the clusters; PTQ1 lifted
//                                     because Q1 sits in the lower
//                                     cluster; PTQ3 dampened because
//                                     Q3 sits in the upper cluster).
//                                     Reference: [1×5, 10×5] reads
//                                     PTMH 1.6364 tight + PTQ1 9.0
//                                     wide + PTQ3 0.9 tight.
//   * PTMH wide + PTQ1 wide + PTQ3 tight    -> UPPER-OUTLIER against
//                                     UNIFORM FLOOR (Q3 lifted by
//                                     the outlier so PTQ3 dampens;
//                                     Q1 stays in the floor so PTQ1
//                                     stays wide; midhinge averages
//                                     the two and stays low enough
//                                     for PTMH to read wide).
//                                     Reference: [1×9, 10] reads
//                                     PTMH 9.0 wide + PTQ1 9.0 wide
//                                     + PTQ3 0.9 tight.
//   * PTMH wide + PTQ1 wide + PTQ3 wide     -> EXTREME OUTLIER against
//                                     UNIFORM FLOOR (even Q3 only
//                                     rises to 1 because the outlier
//                                     is a single cell in the upper
//                                     half; midhinge stays near 1;
//                                     range explodes). Reference:
//                                     [1×9, 100] reads PTMH 99.0 wide
//                                     + PTQ1 99.0 wide + PTQ3 99.0
//                                     wide.
//
// The UNIFORM-RAMP-vs-BIMODAL-SYMMETRIC-SPLIT distinction is the one
// that PTMH uniquely CLARIFIES -- P11.240 PTM cannot tell the two
// regimes apart because both read PTM tight (median of ramp = 5.5,
// median of split = 5.5); P11.242 PTQ1 flags both spread/wide
// because Q1 = 3 in the ramp vs Q1 = 1 in the split; P11.244 PTQ3
// flags both tight because Q3 = 8 in the ramp vs Q3 = 10 in the
// split. PTMH reads the ramp as midhinge (3+8)/2 = 5.5 and the split
// as midhinge (1+10)/2 = 5.5 -- both tight -- so PTMH matches PTM
// tight for both. But the TRIAD (PTQ1, PTMH, PTQ3) as a bundle now
// differentiates: ramp (3, 5.5, 8) has SMOOTH INTERIOR while split
// (1, 5.5, 10) has BIMODAL INTERIOR. Downstream label logic joining
// PTQ1 + PTMH + PTQ3 emits SMOOTH_INTERIOR vs BIMODAL_INTERIOR as
// the first-class regime label rather than a single-surface tight/
// wide read.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptmh null (empty pool).
//   * pool_count 1                  -> ptmh null (solo -- range = 0
//                                     and midhinge = the sole cell
//                                     so the ratio would trivially
//                                     read 0, but the "solo" label
//                                     conveys more information than
//                                     "tight" for a single-partner
//                                     pool).
//   * pool_count >= 2 and           -> ptmh null (degenerate --
//     pool_cells == 0                 cannot happen for count
//                                     integers >= 1 by construction,
//                                     but guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptmh null (midhinge_zero --
//     midhinge == 0                   unreachable since Q1 + Q3 of
//                                     non-negative integers >= 1 is
//                                     >= 2 but guarded for future
//                                     upstream robustness).
//   * pool_count >= 2 and           -> ptmh in [0, +Inf) rounded to
//     midhinge > 0                    4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and midhinge > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> Q1 k, Q3 k, midhinge k, range
//                                     0, ptmh 0 (tight).
//   * uniform ramp [1..10]          -> lower half [1..5] Q1 = 3,
//                                     upper half [6..10] Q3 = 8,
//                                     midhinge = 5.5, range 9, ptmh
//                                     = 9/5.5 = 1.6364 (tight).
//   * upper-outlier [1×9, 10]       -> sorted [1×9, 10], lower half
//                                     [1,1,1,1,1] Q1 = 1, upper half
//                                     [1,1,1,1,10] Q3 = 1, midhinge
//                                     = 1, range 9, ptmh = 9.0 (wide
//                                     -- SINGLE-OUTLIER-AGAINST-
//                                     UNIFORM-FLOOR regime; Q3 only
//                                     rises to 1 because the outlier
//                                     is one cell in a five-cell upper
//                                     half).
//   * two-shoulders [1×8, 5×2]      -> sorted [1×8, 5, 5], lower half
//                                     [1,1,1,1,1] Q1 = 1, upper half
//                                     [1,1,1,5,5] Q3 = 1, midhinge
//                                     = 1, range 4, ptmh = 4.0
//                                     (spread -- TOP-HEAVY interior
//                                     regime where the second-highest
//                                     cluster still doesn't reach
//                                     into the upper hinge).
//   * 50/50 split [1×5, 10×5]       -> sorted [1×5, 10×5], lower half
//                                     [1,1,1,1,1] Q1 = 1, upper half
//                                     [10,10,10,10,10] Q3 = 10,
//                                     midhinge = 5.5, range 9, ptmh
//                                     = 9/5.5 = 1.6364 (tight --
//                                     BIMODAL-SYMMETRIC split flagged
//                                     TIGHT here where PTQ1 reads
//                                     wide because midhinge sits
//                                     between the two clusters).
//   * extreme outlier [1×9, 100]    -> Q1 = 1, Q3 = 1, midhinge 1,
//                                     range 99, ptmh 99.0 (wide).
//   * two-partner [1, 9]            -> sorted [1, 9], lower half [1]
//                                     Q1 = 1, upper half [9] Q3 = 9,
//                                     midhinge = 5, range 8, ptmh
//                                     = 8/5 = 1.6 (tight).
//   * two-partner [1, 100]          -> Q1 = 1, Q3 = 100, midhinge =
//                                     50.5, range 99, ptmh = 99/50.5
//                                     = 1.9604 (tight -- ISOLATED
//                                     HIGH PARTNER regime tight here
//                                     because midhinge averages the
//                                     two partners into a substantive
//                                     denominator; contrast P11.242
//                                     PTQ1 99.0 wide + P11.244 PTQ3
//                                     0.99 tight).
//   * small [10, 1, 1]              -> sorted [1, 1, 10], lower half
//                                     [1] Q1 = 1, upper half [10] Q3
//                                     = 10, midhinge = 5.5, range 9,
//                                     ptmh = 9/5.5 = 1.6364 (tight
//                                     -- SMALL-VALUE-DOMINATED with
//                                     LARGE-PARTNER PROMOTION into
//                                     Q3 regime where PTMH reads
//                                     tight because Q3 captures the
//                                     lone large partner; contrast
//                                     P11.242 PTQ1 9.0 wide).
//
// Bands on raw ptmh (fixed cutoffs, calibrated against the n=10
// reference distributions so flat + uniform ramp + bimodal-split +
// two-partner + small pools land in tight, two-shoulders lands in
// spread, and upper-outlier + extreme-outlier pools land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR midhinge == 0 (guarded but unreachable)
//   * tight                ptmh < 2.0 (flat, uniform ramp, bimodal-
//                          split, two-partner, small regimes where
//                          midhinge is a substantive fraction of
//                          range)
//   * spread               ptmh in [2.0, 5.0) (two-shoulders regime
//                          where Q3 doesn't reach the upper cluster)
//   * wide                 ptmh >= 5.0 (upper-outlier + extreme-
//                          outlier regimes where midhinge collapses
//                          to the low cluster while range tracks the
//                          outlier)
//
// Both cutoffs are exposed on the envelope as tight_ptmh_max /
// wide_ptmh_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptmh = MORE range against midhinge = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM +
// P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN + P11.248 PTGM +
// P11.250 PTH + P11.252 PTRMS tight/spread/wide vocabulary). Reuses
// the exact 3-band label set so a reader scanning the DISPERSION
// additive/ratio family sees the same vocabulary across every
// surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.255):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToRmsSection
// (P11.252) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-hinge-composite after
// the P11.252 range-against-quadratic-center landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) -> ...
// -> GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) -> PEAK-TO-Q1 (P11.242)
// -> PEAK-TO-Q3 (P11.244) -> PEAK-TO-MEAN (P11.246) -> PEAK-TO-GEOMEAN
// (P11.248) -> PEAK-TO-HARMEAN (P11.250) -> PEAK-TO-RMS (P11.252) ->
// PEAK-TO-MIDHINGE (this module) -> per-pair hot-cells GRANULAR
// (P11.139).

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
type PtmhLabel =
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

// Bands on raw ptmh (fixed cutoffs since midhinge scales with cell
// counts and typical hinge-composite emissions land near 1-10 for
// the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so flat + uniform ramp + bimodal-split + two-partner
// + small pools read tight, two-shoulders reads spread, and upper-
// outlier + extreme-outlier pools read wide. Cutoffs mirror the
// P11.242 PTQ1 + P11.244 PTQ3 hinge-based siblings (2.0 / 5.0) so
// the triad (PTQ1, PTMH, PTQ3) shares one vocabulary and downstream
// composite regime labels can join across the trio without band
// remapping.
const TIGHT_PTMH_MAX = 2.0;
const WIDE_PTMH_MIN = 5.0;

// PTMH rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTMH_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToMidhingeBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_midhinge: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_midhinge: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMidhingeBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToMidhingeBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToMidhingeBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToMidhingeBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToMidhingeBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMidhingeMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMidhinge {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptmh_max: number;
  readonly wide_ptmh_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToMidhingeMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n.
// Same convention as every other median-consuming pool-shape sibling
// (P11.195, P11.197, P11.201, P11.207, P11.209, P11.240, P11.242,
// P11.244).
function medianOfSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1 hinge: for odd n exclude the central value then
// take the median of the lower half; for even n split at the midpoint
// and take the median of the lower half. Shared convention with
// P11.207 IQR + P11.209 IQR RATIO + P11.242 PTQ1 + P11.244 PTQ3.
function tukeyQ1(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  return medianOfSorted(lower);
}

// Tukey EXCLUSIVE Q3 hinge: mirror of Q1 on the upper half. Shared
// convention with P11.244 PTQ3.
function tukeyQ3(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const start = n % 2 === 1 ? half + 1 : half;
  const upper = sorted.slice(start);
  return medianOfSorted(upper);
}

// Peak-to-midhinge of a discrete distribution:
//   PTMH = (max - min) / midhinge
// where midhinge = (Q1 + Q3) / 2 uses the Tukey EXCLUSIVE hinges.
// Returns null on empty, solo, degenerate, and midhinge_zero so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_midhinge: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_midhinge: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and midhinge = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_midhinge: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_midhinge: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const q1 = tukeyQ1(sortedAsc);
  const q3 = tukeyQ3(sortedAsc);
  const midhinge = (q1 + q3) / 2;
  if (midhinge === 0) {
    // Midhinge zero -- unreachable for count integers >= 1 (Q1 + Q3
    // of non-negative integers >= 1 is >= 2) but guarded for future
    // upstream robustness. A zero midhinge would give an undefined
    // ratio; report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_midhinge: null };
  }
  const range = max - min;
  const ptmh = range / midhinge;
  // Clamp tiny negative float-noise to 0; ptmh is non-negative by
  // construction because range >= 0 and midhinge > 0.
  const clamped = ptmh < 0 ? 0 : ptmh;
  return {
    pool_count,
    pool_cells,
    peak_to_midhinge: roundTo(clamped, PTMH_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMidhingeBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_midhinge: partner.peak_to_midhinge,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_midhinge: metric.peak_to_midhinge,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMidhingeEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMidhinge(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMidhinge {
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
    tight_ptmh_max: TIGHT_PTMH_MAX,
    wide_ptmh_min: WIDE_PTMH_MIN,
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

function labelForPtmh(
  pool_count: number,
  pool_cells: number,
  ptmh: number | null,
  tight_max: number,
  wide_min: number,
): PtmhLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptmh === null) return "degenerate";
  if (ptmh >= wide_min) return "wide";
  if (ptmh < tight_max) return "tight";
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

function renderPtmhCell(
  pool_count: number,
  pool_cells: number,
  ptmh: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtmh(
    pool_count,
    pool_cells,
    ptmh,
    tight_max,
    wide_min,
  );
  const ptmhText = ptmh === null ? "-" : ptmh.toFixed(4);
  return `PTMH ${ptmhText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMidhingeSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMidhinge,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptmh_max, wide_ptmh_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmhCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_midhinge, tight_ptmh_max, wide_ptmh_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmhCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_midhinge, tight_ptmh_max, wide_ptmh_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-MIDHINGE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-HINGE-COMPOSITE scalar over the P11.161 pool &mdash; ptmh = (max - min) / midhinge where midhinge = (Q1 + Q3) / 2 uses the Tukey EXCLUSIVE hinges. Reads the pool's total RANGE in units of its ROBUST HINGE-COMPOSITE (Tukey MIDSUMMARY) centre so a UPPER-OUTLIER pool that the P11.244 peak-to-Q3 surface flags TIGHT (because Q3 sits in the upper cluster) and P11.242 peak-to-Q1 flags WIDE (because Q1 sits in the lower cluster) reads WIDE here (because midhinge averages the two shoulders and stays near the low cluster while range tracks the outlier). Unique DISPERSION-axis contribution: reads range in units of the ROBUST HINGE-COMPOSITE centre &mdash; every other range-based DISPERSION surface anchors on a scale statistic (P11.237), the total span (P11.213), a SINGLE order-statistic (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), or a POWER-MEAN centre (P11.246 PTMEAN, P11.248 PTGM, P11.250 PTH, P11.252 PTRMS). PTMH completes the (Q1, midhinge, Q3) TRIAD of Tukey hinge-based anchors and by construction always satisfies PTQ3 &le; PTMH &le; PTQ1 (equality iff Q1 == Q3). Composite regime labels: PTMH tight + PTQ1 spread + PTQ3 tight = UNIFORM RAMP; PTMH tight + PTQ1 wide + PTQ3 tight = BIMODAL SYMMETRIC SPLIT; PTMH wide + PTQ1 wide + PTQ3 tight = UPPER-OUTLIER against UNIFORM FLOOR; PTMH/PTQ1/PTQ3 all wide = EXTREME OUTLIER. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR midhinge == 0 (guarded but unreachable), tight = ptmh &lt; ${tight_ptmh_max} (flat, uniform ramp, bimodal-split, two-partner, small regimes), spread = ptmh in [${tight_ptmh_max}, ${wide_ptmh_min}) (two-shoulders regime), wide = ptmh &ge; ${wide_ptmh_min} (upper-outlier + extreme-outlier regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptmh null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTMH</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTMH</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
