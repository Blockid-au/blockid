// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL L-SKEWNESS
// pure-lib (P11.221).
//
// L-MOMENT-BASED BOUNDED WHOLE-POOL ASYMMETRY scalar over the P11.161
// pool. Folds every sorted cell into ONE bounded asymmetry read on
// [-1, +1] using the Hosking (1990) L-skewness ratio:
//
//   tau3 = lambda3 / lambda2
//
// where lambda_r are the L-moments computed via unbiased sample PWMs:
//   b0 = (1/n) * sum(x_i)                                (sorted i=1..n)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   b2 = (1/n) * sum_{i>=3} [(i-1)(i-2)/((n-1)(n-2))] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
//   lambda3 = 6*b2 - 6*b1 + b0
//
// Reads for standard reference distributions:
//   • Normal (Gaussian):   tau3 = 0
//   • Uniform:             tau3 = 0
//   • Exponential:         tau3 = 1/3 ≈ 0.3333
//   • Gumbel (EV1):        tau3 ≈ 0.170
//   • Gamma (shape=2):     tau3 ≈ 0.286
//   • Any symmetric dist:  tau3 = 0
// Sign convention matches classical skewness (POSITIVE = right-tailed,
// NEGATIVE = left-tailed, ZERO = symmetric).
//
// Complements the P11.203 whole-pool Fisher-Pearson g1 skewness surface
// on TWO orthogonal axes beyond WHOLE-POOL SCOPE:
//   1. BOUNDEDNESS. L-skewness is bounded on [-1, +1] by construction
//      (proven in Hosking 1990 §2.3), so extreme skew reads cleanly
//      without the unbounded blowups g1 emits for tail-outlier pools —
//      the exact ASYMMETRY-axis analogue of the way P11.211 QCD /
//      P11.213 COR bound the DISPERSION axis and P11.215 Bowley bounds
//      the INTERIOR ASYMMETRY axis. A [1,1,1,1,1,1,1,100] pool blows
//      g1 to ~+2.5 (fourth-moment style scaling on the outlier) while
//      L-skewness sits at a moderate ~+0.75 — same qualitative right
//      skew, but readable on a fixed scale.
//   2. LINEARITY. L-moments are linear combinations of order statistics
//      rather than powers of deviations, so a single outlier pushes
//      lambda3 by O(1/n) rather than O(1) — the ASYMMETRY-axis analogue
//      of the way the P11.215 Bowley robustifies via octiles rather
//      than powers, but lifted back to a WHOLE-POOL surface via the
//      L-moment machinery (Bowley reads the interior asymmetry over
//      three Tukey hinges; L-skewness reads the whole-pool asymmetry
//      as a bounded ratio).
//
// Reading g1 + L-skewness side-by-side lets ops distinguish
// "asymmetry driven by interior mass" (both surfaces non-zero and same
// sign; magnitudes bounded near each other on the raw scale) from
// "asymmetry driven by a single tail outlier" (g1 large, L-skewness
// modest but still same sign) from "structural symmetry" (both near
// zero). Combined with the P11.215 Bowley interior surface, the trio
// (g1 whole-pool unbounded, tau3 whole-pool bounded, bowley interior
// bounded) provides the ASYMMETRY axis's SCOPE × BOUNDEDNESS grid.
//
// RELATIONSHIP TO P11.215 BOWLEY. Bowley reads INTERIOR asymmetry via
// three Tukey hinges (Q1, Q2, Q3) — blind to what happens beyond the
// interquartile box. L-skewness reads WHOLE-POOL asymmetry via all n
// cells weighted by their rank position — every cell contributes but
// via bounded linear weights rather than powers. The two therefore
// surface orthogonal aspects of asymmetry:
//   • Bowley moves ONLY if the interior mass leans left/right of the
//     median relative to the interquartile box, immune to tail shape.
//   • L-skewness moves whenever ANY cell shifts, but weighted by rank
//     position so tail cells are heavily represented and interior
//     cells are lightly represented via the (i-1)(i-2)/((n-1)(n-2))
//     scaling on b2. A pool with symmetric interior but heavy right
//     tail (e.g. [1,2,3,4,5,20]) will read bowley 0 but L-skewness
//     ~+0.4 — the ASYMMETRY-axis analogue of the DISPERSION-axis
//     endpoint-vs-interior contrast between P11.181 range and P11.207
//     IQR.
//
// Well-defined for every pool with pool_count >= 4 and lambda2 > 0:
//   • pool_count 0            → tau3 null, lambdas null (empty pool).
//   • pool_count in [1, 3]    → tau3 null, lambdas null. Distinct
//                               "small_pool" label. n=1 makes b1/b2
//                               zero-summands so lambda2/lambda3 are
//                               both zero; n=2 makes b2 a zero-summand
//                               so lambda3 is zero; n=3 makes b2 a
//                               one-cell tail-only sum that leaks the
//                               endpoint signal already surfaced by
//                               P11.181 range / P11.185 top1/bot1. Floor
//                               of 4 matches P11.207 IQR / P11.209 IQR
//                               RATIO / P11.211 QCD / P11.215 Bowley /
//                               P11.219 Crow-Siddiqui — every sibling
//                               that consumes ordered statistics shares
//                               the same Tukey-hinge-friendly floor so
//                               a reader importing the P11 pool-shape
//                               family into R/Python/Excel gets one
//                               consistent minimum sample size.
//   • pool_count >= 4 and     → tau3 null, lambdas recorded (lambda1
//     lambda2 == 0              carries the mean so the reader sees the
//                               constant value), distinct "degenerate"
//                               label so the reader knows the pool is
//                               flat (every cell equal so lambda2 = 0,
//                               same failure mode returning iqr 0 on
//                               P11.207 / qcd null on P11.211 / bowley
//                               null on P11.215 / moors null on P11.217
//                               / cs null on P11.219). Distinct from
//                               "symmetric" because a flat pool tells
//                               the reader NOTHING about asymmetry
//                               (structural indeterminacy, not a
//                               measured symmetry verdict).
//   • pool_count >= 4 and     → tau3 = lambda3 / lambda2; rounded to 4
//     lambda2 > 0               decimals. Bounded on [-1, +1] by
//                               Hosking 1990 §2.3 for any valid data
//                               vector.
//
// Cutoffs use symmetric bands around zero: 0.1 / 0.3 (mirror of the
// P11.215 Bowley band edges, chosen so classical reference
// distributions land in distinct bands):
//   • Normal + Uniform (tau3 = 0)   → symmetric.
//   • Gumbel (tau3 ≈ 0.170)         → mild_right.
//   • Gamma shape=2 (tau3 ≈ 0.286)  → mild_right (edge of strong).
//   • Exponential (tau3 = 0.333)    → strong_right.
// Wider than the classical "small effect" of ~0.05 you would use on
// raw g1 because L-skewness is bounded on [-1, +1] and the classical
// L-moment textbooks (Hosking & Wallis 1997 §2.2) treat 0.1 as the
// "leaning" threshold and 0.3 as the "clearly asymmetric" threshold.
// These map back to raw tau3 as:
//   • symmetric    |tau3| < 0.1 (near-normal asymmetry)
//   • leaning      |tau3| in [0.1, 0.3) (moderate signal)
//   • strong       |tau3| >= 0.3 (clearly asymmetric)
// Bands:
//   • empty          pool_count == 0
//   • small_pool     pool_count in [1, 3] (L-moment estimators
//                    undefined)
//   • degenerate     lambda2 == 0 (flat pool — asymmetry undefined)
//   • symmetric      |tau3| < 0.1 (near-normal asymmetry)
//   • mild_right     tau3 in [0.1, 0.3)
//   • mild_left      tau3 in (-0.3, -0.1]
//   • strong_right   tau3 >= 0.3
//   • strong_left    tau3 <= -0.3
// All cutoffs exposed on the envelope as symmetric_l_skewness_abs_max
// / strong_l_skewness_abs_min so downstream JSONL consumers render the
// label vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the standard SKEWNESS framing (POSITIVE =
// right-tailed, NEGATIVE = left-tailed, ZERO = symmetric) — matches
// the P11.203 skewness + P11.215 Bowley sign convention so a reader
// scanning the three asymmetry surfaces (g1 whole-pool unbounded,
// tau3 whole-pool bounded, bowley interior bounded) sees the same
// left/right vocabulary across all three.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — L-
// skewness is a whole-pool fold that consumes every ordered cell via
// linear PWM weights.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.222):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection
// (P11.219) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177)
// → TOP-1 SHARE (P11.165) → TOP-2 COMBINED SHARE (P11.167) →
// BOTTOM-1 SHARE (P11.179) → RANGE (P11.181) → BOTTOM-2 COMBINED
// SHARE (P11.183) → TOP1/BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2
// RATIO (P11.187) → MID-MASS SHARE (P11.189) → TOP1/BOTTOM2 RATIO
// (P11.191) → TOP2/BOTTOM1 RATIO (P11.193) → MEDIAN/MEAN RATIO
// (P11.195) → MEAN-MEDIAN ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE
// DEVIATION (P11.199) → MEDIAN ABSOLUTE DEVIATION (P11.201) →
// SKEWNESS (P11.203) → EXCESS KURTOSIS (P11.205) → IQR (P11.207)
// → IQR RATIO (P11.209) → QCD (P11.211) → COR (P11.213) → BOWLEY
// SKEWNESS (P11.215) → MOORS KURTOSIS (P11.217) → CROW-SIDDIQUI
// KURTOSIS (P11.219) → L-SKEWNESS (this module) → per-pair hot-cells
// GRANULAR (P11.139). L-skewness sits IMMEDIATELY BELOW the P11.219
// Crow-Siddiqui surface so the two ASYMMETRY siblings (g1 unbounded
// whole-pool at P11.203 → tau3 bounded whole-pool here) close off the
// ASYMMETRY axis after the tail-weight family (P11.217 Moors + P11.219
// Crow-Siddiqui). The L-moment family opens here and will extend via
// L-kurtosis (tau4) on a follow-up tick.

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
type LSkewnessLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "symmetric"
  | "mild_right"
  | "mild_left"
  | "strong_right"
  | "strong_left";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Classical L-moment textbook band edges (Hosking & Wallis 1997 §2.2).
// Mirrors the P11.215 Bowley band shape since both surfaces read
// asymmetry on the bounded [-1, +1] codomain.
const SYMMETRIC_L_SKEWNESS_ABS_MAX = 0.1;
const STRONG_L_SKEWNESS_ABS_MIN = 0.3;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const L_SKEWNESS_DECIMALS = 4;

// Threshold below which the L-moment sample estimators leak the
// endpoint signal already surfaced by P11.181 range / P11.185
// top1/bot1 / P11.213 COR / P11.219 Crow-Siddiqui. Floor of 4 matches
// every ordered-statistics sibling (P11.207 IQR / P11.209 IQR RATIO /
// P11.211 QCD / P11.215 Bowley / P11.219 Crow-Siddiqui) so the P11
// pool-shape family exposes one consistent minimum sample size to
// R/Python/Excel readers.
const MIN_POOL_COUNT_FOR_L_SKEWNESS = 4;

export interface PerTransitionMagnitudeTop3PoolLSkewnessBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_lambda1: number | null;
  readonly partner_lambda2: number | null;
  readonly partner_lambda3: number | null;
  readonly partner_l_skewness: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_lambda1: number | null;
  readonly metric_lambda2: number | null;
  readonly metric_lambda3: number | null;
  readonly metric_l_skewness: number | null;
}

export interface PerTransitionMagnitudeTop3PoolLSkewnessBands {
  readonly small: PerTransitionMagnitudeTop3PoolLSkewnessBand;
  readonly medium: PerTransitionMagnitudeTop3PoolLSkewnessBand;
  readonly large: PerTransitionMagnitudeTop3PoolLSkewnessBand;
}

export interface PerTransitionMagnitudeTop3PoolLSkewnessEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolLSkewnessBands;
}

export interface PerTransitionMagnitudeTop3PoolLSkewnessMap {
  readonly improved: PerTransitionMagnitudeTop3PoolLSkewnessEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolLSkewnessEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolLSkewnessEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolLSkewnessEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_l_skewness: number;
  readonly symmetric_l_skewness_abs_max: number;
  readonly strong_l_skewness_abs_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolLSkewnessMap;
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

// Unbiased sample probability-weighted moments (Hosking 1990) folded
// into L-moments lambda1 / lambda2 / lambda3.
//   b0 = (1/n) * sum(x_i)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   b2 = (1/n) * sum_{i>=3} [(i-1)(i-2)/((n-1)(n-2))] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
//   lambda3 = 6*b2 - 6*b1 + b0
// Caller guarantees n >= MIN_POOL_COUNT_FOR_L_SKEWNESS (= 4) so both
// (n-1) and (n-2) denominators are safe. Same b_r weight convention as
// the R `lmom` and `lmomco` packages so a reader porting the pool into
// R gets identical lambdas.
function lMomentsOfSorted(sorted: number[]): {
  lambda1: number;
  lambda2: number;
  lambda3: number;
} {
  const n = sorted.length;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 1; i <= n; i++) {
    const x = sorted[i - 1];
    b0 += x;
    if (i >= 2) b1 += ((i - 1) / (n - 1)) * x;
    if (i >= 3) b2 += (((i - 1) * (i - 2)) / ((n - 1) * (n - 2))) * x;
  }
  b0 /= n;
  b1 /= n;
  b2 /= n;
  return {
    lambda1: b0,
    lambda2: 2 * b1 - b0,
    lambda3: 6 * b2 - 6 * b1 + b0,
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  lambda1: number | null;
  lambda2: number | null;
  lambda3: number | null;
  l_skewness: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (
    pool_count < MIN_POOL_COUNT_FOR_L_SKEWNESS ||
    pool_cells === 0
  ) {
    return {
      pool_count,
      pool_cells,
      lambda1: null,
      lambda2: null,
      lambda3: null,
      l_skewness: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { lambda1, lambda2, lambda3 } = lMomentsOfSorted(sorted);
  // Degenerate flat pool (lambda2 == 0) — every cell equal so the
  // L-skewness denominator is zero. Record lambda1 so the reader sees
  // the constant value but return l_skewness null with a distinct
  // "degenerate" label downstream (structural indeterminacy, not a
  // measured symmetric verdict).
  if (lambda2 === 0) {
    return {
      pool_count,
      pool_cells,
      lambda1: roundTo(lambda1, L_SKEWNESS_DECIMALS),
      lambda2: 0,
      lambda3: roundTo(lambda3, L_SKEWNESS_DECIMALS),
      l_skewness: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    lambda1: roundTo(lambda1, L_SKEWNESS_DECIMALS),
    lambda2: roundTo(lambda2, L_SKEWNESS_DECIMALS),
    lambda3: roundTo(lambda3, L_SKEWNESS_DECIMALS),
    l_skewness: roundTo(lambda3 / lambda2, L_SKEWNESS_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolLSkewnessBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_lambda1: partner.lambda1,
    partner_lambda2: partner.lambda2,
    partner_lambda3: partner.lambda3,
    partner_l_skewness: partner.l_skewness,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_lambda1: metric.lambda1,
    metric_lambda2: metric.lambda2,
    metric_lambda3: metric.lambda3,
    metric_l_skewness: metric.l_skewness,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolLSkewnessEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness {
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
    min_pool_count_for_l_skewness: MIN_POOL_COUNT_FOR_L_SKEWNESS,
    symmetric_l_skewness_abs_max: SYMMETRIC_L_SKEWNESS_ABS_MAX,
    strong_l_skewness_abs_min: STRONG_L_SKEWNESS_ABS_MIN,
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

function labelForLSkewness(
  pool_count: number,
  lambda2: number | null,
  l_skewness: number | null,
  min_pool_count_for_l_skewness: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): LSkewnessLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_l_skewness) return "small_pool";
  if (l_skewness === null || lambda2 === null || lambda2 === 0)
    return "degenerate";
  if (l_skewness >= strong_abs_min) return "strong_right";
  if (l_skewness <= -strong_abs_min) return "strong_left";
  if (l_skewness >= symmetric_abs_max) return "mild_right";
  if (l_skewness <= -symmetric_abs_max) return "mild_left";
  return "symmetric";
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

function renderLSkewnessCell(
  pool_count: number,
  pool_cells: number,
  lambda1: number | null,
  lambda2: number | null,
  lambda3: number | null,
  l_skewness: number | null,
  min_pool_count_for_l_skewness: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForLSkewness(
    pool_count,
    lambda2,
    l_skewness,
    min_pool_count_for_l_skewness,
    symmetric_abs_max,
    strong_abs_min,
  );
  const tauText = l_skewness === null ? "-" : l_skewness.toFixed(3);
  const l1Text = lambda1 === null ? "-" : lambda1.toFixed(2);
  const l2Text = lambda2 === null ? "-" : lambda2.toFixed(2);
  const l3Text = lambda3 === null ? "-" : lambda3.toFixed(2);
  return `tau3 ${tauText} (lambda1 ${l1Text}, lambda2 ${l2Text}, lambda3 ${l3Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_l_skewness,
    symmetric_l_skewness_abs_max,
    strong_l_skewness_abs_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLSkewnessCell(band.partner_pool_count, band.partner_pool_cells, band.partner_lambda1, band.partner_lambda2, band.partner_lambda3, band.partner_l_skewness, min_pool_count_for_l_skewness, symmetric_l_skewness_abs_max, strong_l_skewness_abs_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLSkewnessCell(band.metric_pool_count, band.metric_pool_cells, band.metric_lambda1, band.metric_lambda2, band.metric_lambda3, band.metric_l_skewness, min_pool_count_for_l_skewness, symmetric_l_skewness_abs_max, strong_l_skewness_abs_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool L-SKEWNESS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">L-MOMENT-BASED BOUNDED WHOLE-POOL ASYMMETRY scalar over the P11.161 pool &mdash; tau3 = lambda3 / lambda2 folded from the unbiased sample PWM estimators (Hosking 1990). Bounded [-1, +1] complement to the P11.203 whole-pool Fisher-Pearson g1 skewness surface which is unbounded and blows up on tail outliers via the third-standardised-moment fourth-power scaling &mdash; read side-by-side to distinguish "asymmetry driven by interior mass" (both surfaces non-zero and same sign) from "asymmetry driven by a single tail outlier" (g1 large, tau3 modest but same sign). Also complements the P11.215 Bowley interior asymmetry: Bowley reads INTERIOR asymmetry via three Tukey hinges (blind to tails); tau3 reads WHOLE-POOL asymmetry via rank-weighted linear combinations (every cell contributes but tails are heavily represented). Sign convention: POSITIVE = right-tailed, NEGATIVE = left-tailed, ZERO = symmetric. Reference distributions: uniform + normal (tau3=0), Gumbel (~0.170), exponential (0.333). Labels: small_pool = pool_count &lt; ${min_pool_count_for_l_skewness} (L-moment estimators undefined — b1/b2 zero-summands leak endpoint signal), degenerate = lambda2 == 0 (flat pool, denominator zero — structural indeterminacy), symmetric = |tau3| &lt; ${symmetric_l_skewness_abs_max} (near-normal asymmetry), mild_right = tau3 in [${symmetric_l_skewness_abs_max}, ${strong_l_skewness_abs_min}) (moderate right skew), mild_left = tau3 in (${-strong_l_skewness_abs_min}, ${-symmetric_l_skewness_abs_max}] (moderate left skew), strong_right = tau3 &ge; ${strong_l_skewness_abs_min} (clearly right-tailed), strong_left = tau3 &le; ${-strong_l_skewness_abs_min} (clearly left-tailed). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + tau3 null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner tau3</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI tau3</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
