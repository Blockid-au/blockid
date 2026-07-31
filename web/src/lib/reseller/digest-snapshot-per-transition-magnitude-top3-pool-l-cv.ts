// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL L-CV
// pure-lib (P11.225).
//
// L-MOMENT-BASED BOUNDED WHOLE-POOL DISPERSION scalar over the P11.161
// pool. Folds every sorted cell into ONE bounded dispersion read on
// [0, +1] using the Hosking (1990) L-CV ratio (also written tau2):
//
//   tau2 = lambda2 / lambda1
//
// where lambda_r are the L-moments computed via unbiased sample PWMs
// (identical PWM machinery as the P11.221 L-skewness + P11.223
// L-kurtosis siblings — only the ratio numerator differs):
//   b0 = (1/n) * sum(x_i)                                (sorted i=1..n)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
//
// Reads for standard reference distributions with non-negative support
// (Hosking 1990 Table 1):
//   • Degenerate flat pool:    tau2 = 0
//   • Uniform on [0, 2*mu]:    tau2 = 1/3 ≈ 0.3333
//   • Exponential:             tau2 = 1/2 = 0.5
//   • Single-outlier (leader): tau2 → 1
// For non-negative variates (like our pool_cells count integers)
// Hosking 1990 §2.3 gives 0 <= tau2 <= 1 as the sample-PWM codomain
// bound. Sign convention: HIGHER tau2 = MORE dispersed pool (mass
// concentrated in a few leaders); LOWER tau2 = MORE uniform pool (mass
// spread evenly). ZERO tau2 = flat pool (every cell equal). ONE tau2 =
// single-cell concentration (one cell holds all mass).
//
// Complements the P11.175 whole-pool Pearson coefficient-of-variation
// CV = sigma / mu surface on TWO orthogonal axes beyond WHOLE-POOL
// SCOPE:
//   1. BOUNDEDNESS. L-CV is bounded on [0, +1] for the sample PWM
//      estimator over non-negative variates (Hosking 1990 §2.3).
//      Extreme dispersion reads cleanly without the unbounded blowups
//      Pearson CV emits for single-outlier pools — the exact
//      DISPERSION-axis analogue of the way P11.223 L-kurtosis bounds
//      the TAIL-WEIGHT axis and P11.221 L-skewness bounds the
//      ASYMMETRY axis. A [1,1,1,1,1000] pool blows Pearson CV to
//      √(n-1) ≈ 2.0 (population-CV upper bound at n=5) while L-CV sits
//      at exactly +1 — same qualitative extreme concentration, but
//      readable on a fixed scale (and comparable across pool sizes
//      since L-CV's bound is n-independent while Pearson CV's is not).
//   2. LINEARITY. L-moments are linear combinations of order statistics
//      rather than powers of deviations, so a single outlier pushes
//      lambda2 by O(1/n) rather than O(1) — the DISPERSION-axis
//      analogue of the way P11.211 QCD / P11.213 COR robustify via
//      percentiles rather than powers, but lifted back to a WHOLE-POOL
//      surface via the L-moment machinery (QCD reads the interior
//      quartile spread; COR reads the endpoint span; L-CV reads the
//      whole-pool dispersion as a bounded ratio).
//
// Reading Pearson CV + L-CV side-by-side lets ops distinguish
// "dispersion driven by broadly spread cells" (both surfaces non-zero
// and same sign; magnitudes co-move on the raw scale) from "dispersion
// driven by a single outlier" (Pearson CV large, L-CV modest but still
// non-zero) from "structural balanced shape" (both near zero).
// Combined with the P11.211 QCD interior quartile-spread and P11.213
// COR endpoint-span surfaces, the quartet (Pearson CV whole-pool
// unbounded, L-CV whole-pool bounded, QCD interior-quartile robust,
// COR endpoint robust) provides the DISPERSION axis's SCOPE ×
// BOUNDEDNESS × ROBUSTNESS grid — the exact structural parallel to
// the TAIL-WEIGHT axis's (Fisher-Pearson excess-kurtosis / L-kurtosis
// / Moors / Crow-Siddiqui) quartet at P11.205 + P11.223 + P11.217 +
// P11.219.
//
// RELATIONSHIP TO P11.221 L-SKEWNESS + P11.223 L-KURTOSIS. All three
// surfaces are L-moment-based bounded whole-pool reads sharing the
// identical PWM machinery — the difference is only in the linear
// combination that folds b0..b3 into lambda2/lambda1 vs lambda3/lambda2
// vs lambda4/lambda2. L-CV reads DISPERSION via lambda2 normalised by
// lambda1 (rank-weighted second L-moment relative to the mean);
// L-skewness reads ASYMMETRY via lambda3 normalised by lambda2 (rank-
// weighted third L-moment relative to the dispersion); L-kurtosis
// reads TAIL-WEIGHT via lambda4 normalised by lambda2 (rank-weighted
// fourth L-moment relative to the dispersion). The three therefore
// surface the three canonical L-moment ratios of pool SHAPE and
// complete the L-MOMENT TRIPLE (tau2 DISPERSION → tau3 ASYMMETRY →
// tau4 TAIL-WEIGHT) — an L-moment analogue of the classical
// (CV, skewness, excess-kurtosis) triple at (P11.175, P11.203,
// P11.205) but on the BOUNDED codomain rather than the UNBOUNDED
// codomain:
//   • L-CV moves whenever the pool becomes MORE or LESS dispersed via
//     a rank-weighted linear combination of ordered cells (b1
//     dominates via the 2*b1 term).
//   • L-skewness moves whenever the pool leans LEFT/RIGHT of its centre
//     via a rank-weighted linear combination of ordered cells (b2
//     dominates via the 6*b2 term).
//   • L-kurtosis moves whenever the pool's TAILS are heavier or lighter
//     than the interior via a rank-weighted linear combination of
//     ordered cells (b3 dominates via the 20*b3 term).
// A pool with heavy right tail but moderate spread (e.g. [1,1,1,1,10])
// will read tau2 mildly high (concentrated), tau3 strongly positive
// (right skew) AND tau4 strongly positive (heavy tail) — all three
// moving together. A perfectly bimodal pool [1,1,1,1,10,10,10,10]
// reads tau2 mildly high (mass split into two humps → moderate
// dispersion), tau3 = 0 (structurally symmetric) AND tau4 strongly
// negative (tails empty, mass split into two humps far from centre
// — the classic platykurtic bimodal signature). A uniform ramp
// [1,2,3,4,5] reads tau2 = 1/3 (uniform reference), tau3 = 0
// (symmetric), tau4 = 0 (uniform reference).
//
// RELATIONSHIP TO P11.211 QCD / P11.213 COR. All three are dispersion
// reads with a compact codomain and balanced / moderate / concentrated
// label vocabulary, but their windows differ:
//   • QCD reads INTERIOR QUARTILE SPREAD via (Q3-Q1) / (Q3+Q1) on the
//     middle-half of the pool. Insensitive to endpoint extremes;
//     sensitive to interior-quartile mass redistribution.
//   • COR reads ENDPOINT SPAN via (max-min) / (max+min) on the pool's
//     extreme two cells. Insensitive to interior mass; sensitive to
//     endpoint extremes.
//   • L-CV reads WHOLE-POOL DISPERSION via rank-weighted linear
//     combinations of every cell. Sensitive to BOTH interior mass AND
//     endpoint extremes, but weighted so cells contribute
//     proportionally to their rank distance from the pool centre.
// Reading all three side-by-side lets ops triangulate whether
// dispersion comes from broadly spread cells (all three move), from
// interior quartile redistribution (QCD moves, COR/tau2 near
// reference), or from a single endpoint outlier (COR/tau2 move, QCD
// near reference).
//
// Well-defined for every pool with pool_count >= 3 and lambda1 > 0:
//   • pool_count 0            → tau2 null, lambdas null (empty pool).
//   • pool_count in [1, 2]    → tau2 null, lambdas null. Distinct
//                               "small_pool" label. n=1 makes b1 a
//                               zero-summand so lambda2 is -b0
//                               (nonsensical for a scale-free ratio);
//                               n=2 makes b1 a one-cell tail-only sum
//                               (i=2 only, weight 1/1=1 so b1=x_2/2)
//                               that leaks the endpoint signal already
//                               surfaced by P11.181 range / P11.185
//                               top1/bot1 / P11.213 COR. Floor of 3
//                               matches Hosking & Wallis 1997 §2.2
//                               "n>=r+1 for stable tau_r estimation"
//                               — one less than the P11.221 L-skewness
//                               floor of 4 because tau2 needs one
//                               fewer rank position (r=2 vs r=3) to
//                               avoid the endpoint-leak pathology.
//   • pool_count >= 3 and     → tau2 null, lambdas recorded (lambda1
//     lambda1 == 0              carries the constant mean 0 so the
//                               reader sees the pool is empty of mass),
//                               distinct "degenerate" label so the
//                               reader knows the pool is empty (every
//                               cell zero so lambda1 = 0 — this cannot
//                               happen for our pool_cells count
//                               integers which are always >= 1 whenever
//                               a partner appears, but the guard exists
//                               for robustness against future upstream
//                               changes that might allow zero-count
//                               partners into the pool map). Distinct
//                               from a flat non-zero pool (every cell
//                               equal at some k > 0) which reads
//                               lambda2 = 0 and tau2 = 0 — a
//                               well-defined dispersion measurement
//                               (perfect uniformity), NOT a degenerate
//                               indeterminacy. This is the key
//                               semantic difference from the P11.221
//                               L-skewness / P11.223 L-kurtosis
//                               siblings which flag lambda2 == 0 as
//                               degenerate: tau3 and tau4 use lambda2
//                               in the DENOMINATOR so lambda2 == 0 is
//                               indeterminate, but tau2 uses lambda2
//                               in the NUMERATOR so lambda2 == 0 is a
//                               MEASURED verdict of zero dispersion.
//   • pool_count >= 3 and     → tau2 = lambda2 / lambda1; rounded to 4
//     lambda1 > 0               decimals. Sample-PWM codomain [0, +1]
//                               for non-negative variates (Hosking
//                               1990 §2.3). Since pool_cells counts
//                               are strictly non-negative integers,
//                               the [0, +1] bound holds by
//                               construction for every real pool this
//                               surface will ever see.
//
// Cutoffs use anchored L-CV bands rather than the excess-deviation
// pattern used by P11.223 L-kurtosis / P11.217 Moors / P11.219
// Crow-Siddiqui because L-CV is a DISPERSION measure with no natural
// "normal reference" (the normal distribution's mean can be zero
// making tau2 undefined). Instead the bands anchor to the
// non-negative-support reference distributions (uniform tau2 = 1/3
// ≈ 0.333, exponential tau2 = 1/2 = 0.5) so ops readers familiar with
// the classical dispersion taxonomy read the labels the same way:
//   • LOW_L_CV_MAX = 0.20 (below the uniform-reference tau2 of 0.333
//     — a pool this balanced is TIGHTER than uniform, meaning every
//     cell sits near the mean)
//   • HIGH_L_CV_MIN = 0.40 (above the uniform-reference tau2 of 0.333
//     but below the exponential-reference tau2 of 0.5 — a pool this
//     concentrated is MORE DISPERSED than uniform, meaning a few
//     cells sit far above the mean)
// Reference distributions land in distinct bands:
//   • Flat non-zero [k, k, ..., k]    → tau2 = 0        → balanced
//   • Uniform ramp [1, 2, ..., n]     → tau2 = 1/3      → moderate
//   • Exponential-like tail           → tau2 = 0.5      → concentrated
//   • Single-outlier [1000, 1, ..., 1]→ tau2 = 1 (saturated) → highly_concentrated
// Bands:
//   • empty              pool_count == 0
//   • small_pool         pool_count in [1, 2] (L-CV estimators
//                        undefined or endpoint-leaky)
//   • degenerate         lambda1 == 0 (pool empty of mass —
//                        dispersion undefined)
//   • balanced           tau2 in [0, 0.20) (tighter than uniform;
//                        every cell near the mean)
//   • moderate           tau2 in [0.20, 0.40) (uniform-ramp-like
//                        dispersion)
//   • concentrated       tau2 in [0.40, 0.60) (exponential-tail-like
//                        dispersion; a few cells sit far above mean)
//   • highly_concentrated tau2 >= 0.60 (single-leader dispersion;
//                        one cell dominates)
// All cutoffs exposed on the envelope as low_l_cv_max / high_l_cv_min
// so downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// LABEL ORIENTATION follows the DISPERSION-family framing (balanced /
// moderate / concentrated / highly_concentrated) — matches the
// P11.175 CV + P11.163 HHI + P11.169 Gini + P11.171 Theil + P11.173
// Atkinson label vocabulary so a reader scanning the dispersion
// surfaces sees the same balanced/concentrated vocabulary across all
// of them.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — L-CV is a
// whole-pool fold that consumes every ordered cell via linear PWM
// weights.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.226):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolLKurtosisSection
// (P11.223) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
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
// KURTOSIS (P11.219) → L-SKEWNESS (P11.221) → L-KURTOSIS (P11.223)
// → L-CV (this module) → per-pair hot-cells GRANULAR (P11.139). L-CV
// sits IMMEDIATELY BELOW the P11.223 L-kurtosis surface so the three
// L-MOMENT siblings (tau2 dispersion at this module → tau3 asymmetry
// at P11.221 → tau4 tail-weight at P11.223) close off the L-moment
// TRIPLE — the (DISPERSION, SKEWNESS, KURTOSIS) L-moment triple
// mirrors the (CV, SKEWNESS, EXCESS KURTOSIS) Fisher-Pearson triple
// at P11.175/P11.203/P11.205 but on the BOUNDED codomain rather than
// the UNBOUNDED codomain.

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
type LCvLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "balanced"
  | "moderate"
  | "concentrated"
  | "highly_concentrated";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Anchored L-CV band cutoffs. LOW below uniform-reference tau2 = 1/3
// so a "balanced" pool sits tighter than uniform; HIGH above uniform
// but below exponential-reference tau2 = 1/2 so a "concentrated" pool
// sits between the classical non-negative-support references.
// HIGHLY_CONCENTRATED sits above the exponential reference so
// single-leader pools with tau2 → 1 land in their own band.
const LOW_L_CV_MAX = 0.2;
const HIGH_L_CV_MIN = 0.4;
const HIGHLY_CONCENTRATED_L_CV_MIN = 0.6;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const L_CV_DECIMALS = 4;

// Threshold below which the L-moment sample estimators leak the
// endpoint signal already surfaced by P11.181 range / P11.185
// top1/bot1 / P11.213 COR. Floor of 3 matches Hosking & Wallis 1997
// §2.2 "n>=r+1 for stable tau_r estimation" — one less than the
// P11.221 L-skewness floor of 4 because tau2 needs one fewer rank
// position (r=2 vs r=3) to avoid the endpoint-leak pathology (at n=2
// b1 = x_2/2 which is a one-cell tail-only sum leaking the endpoint
// signal already surfaced by the endpoint family).
const MIN_POOL_COUNT_FOR_L_CV = 3;

export interface PerTransitionMagnitudeTop3PoolLCvBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_lambda1: number | null;
  readonly partner_lambda2: number | null;
  readonly partner_l_cv: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_lambda1: number | null;
  readonly metric_lambda2: number | null;
  readonly metric_l_cv: number | null;
}

export interface PerTransitionMagnitudeTop3PoolLCvBands {
  readonly small: PerTransitionMagnitudeTop3PoolLCvBand;
  readonly medium: PerTransitionMagnitudeTop3PoolLCvBand;
  readonly large: PerTransitionMagnitudeTop3PoolLCvBand;
}

export interface PerTransitionMagnitudeTop3PoolLCvEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolLCvBands;
}

export interface PerTransitionMagnitudeTop3PoolLCvMap {
  readonly improved: PerTransitionMagnitudeTop3PoolLCvEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolLCvEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolLCvEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolLCvEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolLCv {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_l_cv: number;
  readonly low_l_cv_max: number;
  readonly high_l_cv_min: number;
  readonly highly_concentrated_l_cv_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolLCvMap;
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
// into L-moments lambda1 / lambda2. Only b0 and b1 are needed for
// tau2 (lambda3 / lambda4 are unused here — see P11.221 L-skewness /
// P11.223 L-kurtosis siblings for those higher-order ladders).
//   b0 = (1/n) * sum(x_i)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
// Caller guarantees n >= MIN_POOL_COUNT_FOR_L_CV (= 3) so (n-1)
// denominator is safe. Same b_r weight convention as the R `lmom` and
// `lmomco` packages so a reader porting the pool into R gets identical
// lambdas.
function lMomentsOfSorted(sorted: number[]): {
  lambda1: number;
  lambda2: number;
} {
  const n = sorted.length;
  let b0 = 0;
  let b1 = 0;
  for (let i = 1; i <= n; i++) {
    const x = sorted[i - 1];
    b0 += x;
    if (i >= 2) b1 += ((i - 1) / (n - 1)) * x;
  }
  b0 /= n;
  b1 /= n;
  return {
    lambda1: b0,
    lambda2: 2 * b1 - b0,
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  lambda1: number | null;
  lambda2: number | null;
  l_cv: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_L_CV || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      lambda1: null,
      lambda2: null,
      l_cv: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { lambda1, lambda2 } = lMomentsOfSorted(sorted);
  // Degenerate mass-empty pool (lambda1 == 0) — the L-CV denominator
  // is zero. Record lambda1 so the reader sees the constant value but
  // return l_cv null with a distinct "degenerate" label downstream
  // (structural indeterminacy — pool has no mass so dispersion is
  // undefined). Cannot happen for our pool_cells count integers which
  // are always >= 1 whenever a partner appears; guard exists for
  // robustness.
  if (lambda1 === 0) {
    return {
      pool_count,
      pool_cells,
      lambda1: 0,
      lambda2: roundTo(lambda2, L_CV_DECIMALS),
      l_cv: null,
    };
  }
  // Tiny negative float-noise (from partial cancellations near the
  // uniform boundary on lambda2 = 2*b1 - b0) clamped to 0; lambda2 is
  // mathematically >= 0 for non-negative variates on the sample-PWM
  // codomain (Hosking 1990 §2.3).
  const lambda2Clamped = lambda2 < 0 ? 0 : lambda2;
  return {
    pool_count,
    pool_cells,
    lambda1: roundTo(lambda1, L_CV_DECIMALS),
    lambda2: roundTo(lambda2Clamped, L_CV_DECIMALS),
    l_cv: roundTo(lambda2Clamped / lambda1, L_CV_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolLCvBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_lambda1: partner.lambda1,
    partner_lambda2: partner.lambda2,
    partner_l_cv: partner.l_cv,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_lambda1: metric.lambda1,
    metric_lambda2: metric.lambda2,
    metric_l_cv: metric.l_cv,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolLCvEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolLCv {
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
    min_pool_count_for_l_cv: MIN_POOL_COUNT_FOR_L_CV,
    low_l_cv_max: LOW_L_CV_MAX,
    high_l_cv_min: HIGH_L_CV_MIN,
    highly_concentrated_l_cv_min: HIGHLY_CONCENTRATED_L_CV_MIN,
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

function labelForLCv(
  pool_count: number,
  lambda1: number | null,
  l_cv: number | null,
  min_pool_count_for_l_cv: number,
  low_max: number,
  high_min: number,
  highly_concentrated_min: number,
): LCvLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_l_cv) return "small_pool";
  if (l_cv === null || lambda1 === null || lambda1 === 0) return "degenerate";
  if (l_cv >= highly_concentrated_min) return "highly_concentrated";
  if (l_cv >= high_min) return "concentrated";
  if (l_cv >= low_max) return "moderate";
  return "balanced";
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

function renderLCvCell(
  pool_count: number,
  pool_cells: number,
  lambda1: number | null,
  lambda2: number | null,
  l_cv: number | null,
  min_pool_count_for_l_cv: number,
  low_max: number,
  high_min: number,
  highly_concentrated_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForLCv(
    pool_count,
    lambda1,
    l_cv,
    min_pool_count_for_l_cv,
    low_max,
    high_min,
    highly_concentrated_min,
  );
  const tauText = l_cv === null ? "-" : l_cv.toFixed(3);
  const l1Text = lambda1 === null ? "-" : lambda1.toFixed(2);
  const l2Text = lambda2 === null ? "-" : lambda2.toFixed(2);
  return `tau2 ${tauText} (lambda1 ${l1Text}, lambda2 ${l2Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolLCv,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_l_cv,
    low_l_cv_max,
    high_l_cv_min,
    highly_concentrated_l_cv_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLCvCell(band.partner_pool_count, band.partner_pool_cells, band.partner_lambda1, band.partner_lambda2, band.partner_l_cv, min_pool_count_for_l_cv, low_l_cv_max, high_l_cv_min, highly_concentrated_l_cv_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLCvCell(band.metric_pool_count, band.metric_pool_cells, band.metric_lambda1, band.metric_lambda2, band.metric_l_cv, min_pool_count_for_l_cv, low_l_cv_max, high_l_cv_min, highly_concentrated_l_cv_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool L-CV across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">L-MOMENT-BASED BOUNDED WHOLE-POOL DISPERSION scalar over the P11.161 pool &mdash; tau2 = lambda2 / lambda1 folded from the unbiased sample PWM estimators (Hosking 1990). Bounded [0, +1] complement to the P11.175 whole-pool Pearson coefficient-of-variation surface which is unbounded (upper limit &radic;(n-1)) and blows up on single-outlier pools via the second-standardised-moment scaling &mdash; read side-by-side to distinguish "dispersion driven by broadly spread cells" (both surfaces non-zero and same sign) from "dispersion driven by a single outlier" (Pearson CV large, tau2 modest but still non-zero). Also complements the P11.211 QCD interior-quartile-spread + P11.213 COR endpoint-span robust surfaces: QCD reads interior quartile spread (Q3-Q1)/(Q3+Q1), COR reads endpoint span (max-min)/(max+min), tau2 reads whole-pool dispersion via rank-weighted linear combinations of every cell. Completes the L-MOMENT TRIPLE with P11.221 L-skewness + P11.223 L-kurtosis (tau2 dispersion &rarr; tau3 asymmetry &rarr; tau4 tail-weight) &mdash; the bounded-codomain analogue of the (CV, skewness, excess-kurtosis) Fisher-Pearson triple at P11.175 + P11.203 + P11.205. Sign convention: HIGHER tau2 = MORE dispersed pool (mass concentrated in a few leaders); LOWER tau2 = MORE uniform pool (mass spread evenly). Reference distributions: flat non-zero (tau2=0, balanced), uniform ramp (tau2=1/3, moderate), exponential (tau2=0.5, concentrated), single-outlier (tau2=1, highly_concentrated). Labels: small_pool = pool_count &lt; ${min_pool_count_for_l_cv} (L-moment estimators undefined or endpoint-leaky &mdash; n=2 makes b1=x_2/2 a one-cell tail-only sum), degenerate = lambda1 == 0 (pool empty of mass, denominator zero &mdash; structural indeterminacy), balanced = tau2 in [0, ${low_l_cv_max}) (tighter than uniform reference), moderate = tau2 in [${low_l_cv_max}, ${high_l_cv_min}) (uniform-ramp-like dispersion), concentrated = tau2 in [${high_l_cv_min}, ${highly_concentrated_l_cv_min}) (exponential-tail-like dispersion), highly_concentrated = tau2 &ge; ${highly_concentrated_l_cv_min} (single-leader dispersion). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + tau2 null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner tau2</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI tau2</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
