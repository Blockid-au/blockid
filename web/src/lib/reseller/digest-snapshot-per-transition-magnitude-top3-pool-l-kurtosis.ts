// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL L-KURTOSIS
// pure-lib (P11.223).
//
// L-MOMENT-BASED BOUNDED WHOLE-POOL TAIL-WEIGHT scalar over the P11.161
// pool. Folds every sorted cell into ONE bounded tail-weight read on
// [-1, +1] using the Hosking (1990) L-kurtosis ratio:
//
//   tau4 = lambda4 / lambda2
//
// where lambda_r are the L-moments computed via unbiased sample PWMs:
//   b0 = (1/n) * sum(x_i)                                (sorted i=1..n)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   b2 = (1/n) * sum_{i>=3} [(i-1)(i-2)/((n-1)(n-2))] * x_i
//   b3 = (1/n) * sum_{i>=4} [(i-1)(i-2)(i-3)/((n-1)(n-2)(n-3))] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
//   lambda3 = 6*b2 - 6*b1 + b0
//   lambda4 = 20*b3 - 30*b2 + 12*b1 - b0
//
// Reads for standard reference distributions (Hosking 1990 Table 1):
//   • Uniform:             tau4 = 0
//   • Normal (Gaussian):   tau4 ≈ 0.1226
//   • Exponential:         tau4 = 1/6 ≈ 0.1667
//   • Logistic:            tau4 = 1/6 ≈ 0.1667
//   • Gumbel (EV1):        tau4 ≈ 0.1504
//   • Laplace:             tau4 ≈ 0.2357
//   • Cauchy:              diverges
// Sign convention matches classical (excess-)kurtosis: POSITIVE excess
// = HEAVY tails (leptokurtic), NEGATIVE excess = LIGHT tails
// (platykurtic), ZERO excess = mesokurtic (normal-like tail shape).
//
// Complements the P11.205 whole-pool Fisher-Pearson excess-kurtosis g2
// surface on TWO orthogonal axes beyond WHOLE-POOL SCOPE:
//   1. BOUNDEDNESS. L-kurtosis is bounded on [-1, +1] for the sample
//      PWM estimator (Hosking 1990 §2.3; the continuous-distribution
//      bound tightens to (5*tau3^2 - 1)/4 <= tau4 <= 1 but discrete
//      finite-sample pools such as a perfectly bimodal [1,1,1,1,10,10,
//      10,10] can drop to -0.5, so the universally-safe compact
//      codomain for the digest surface is [-1, +1]). Extreme
//      tail-weight reads cleanly without the
//      unbounded blowups g2 emits for tail-outlier pools — the exact
//      TAIL-WEIGHT-axis analogue of the way P11.221 L-skewness bounds
//      the ASYMMETRY axis and P11.211 QCD / P11.213 COR bound the
//      DISPERSION axis. A [1,1,1,1,1000] pool blows g2 to a very large
//      positive value (fourth-power scaling on the outlier) while
//      L-kurtosis sits at exactly +1 — same qualitative heavy tail, but
//      readable on a fixed scale.
//   2. LINEARITY. L-moments are linear combinations of order statistics
//      rather than powers of deviations, so a single outlier pushes
//      lambda4 by O(1/n) rather than O(1) — the TAIL-WEIGHT-axis
//      analogue of the way P11.217 Moors / P11.219 Crow-Siddiqui
//      robustify via percentiles rather than powers, but lifted back to
//      a WHOLE-POOL surface via the L-moment machinery (Moors reads the
//      interior shoulder shape over seven octiles; Crow-Siddiqui reads
//      the far-tail span over four percentiles; L-kurtosis reads the
//      whole-pool tail-weight as a bounded ratio).
//
// Reading g2 + L-kurtosis side-by-side lets ops distinguish "tail-
// weight driven by broadly heavy tails" (both surfaces non-zero and
// same sign; magnitudes co-move on the raw scale) from "tail-weight
// driven by a single outlier" (g2 large, L-kurtosis modest but still
// same sign) from "structural mesokurtic shape" (both near their
// respective normal references — g2 near 0, tau4 near 0.1226).
// Combined with the P11.217 Moors interior shoulder and P11.219 Crow-
// Siddiqui far-tail surfaces, the quartet (g2 whole-pool unbounded,
// tau4 whole-pool bounded, Moors interior-shoulder robust, Crow-
// Siddiqui far-tail robust) provides the TAIL-WEIGHT axis's SCOPE ×
// BOUNDEDNESS × ROBUSTNESS grid.
//
// RELATIONSHIP TO P11.221 L-SKEWNESS. Both surfaces are L-moment-based
// bounded whole-pool reads sharing the identical PWM machinery — the
// difference is only in the linear combination that folds b0..b3 into
// lambda2/lambda3 vs lambda2/lambda4. L-skewness reads asymmetry via
// lambda3 (rank-weighted third L-moment); L-kurtosis reads tail-weight
// via lambda4 (rank-weighted fourth L-moment). The two therefore
// surface orthogonal aspects of the pool's shape:
//   • L-skewness moves whenever the pool leans LEFT/RIGHT of its centre
//     via a rank-weighted linear combination of ordered cells (b2
//     dominates via the 6*b2 term).
//   • L-kurtosis moves whenever the pool's TAILS are heavier or lighter
//     than the interior via a rank-weighted linear combination of
//     ordered cells (b3 dominates via the 20*b3 term with its
//     (i-1)(i-2)(i-3) cubic weight on the largest cells).
// A pool with heavy right tail but symmetric interior (e.g. [1,2,3,4,
// 5,6,7,100]) will read tau3 mildly positive (right skew) AND tau4
// strongly positive (heavy tail) — both moving together. A perfectly
// bimodal pool [1,1,1,1,10,10,10,10] reads tau3 = 0 (structurally
// symmetric) AND tau4 strongly negative (tails empty, mass split into
// two humps far from centre — the classic platykurtic bimodal
// signature).
//
// RELATIONSHIP TO P11.217 MOORS / P11.219 CROW-SIDDIQUI. All three are
// tail-weight reads with an anchored normal reference and mesokurtic /
// leptokurtic / platykurtic / strong_heavy / strong_light label
// vocabulary, but their windows differ:
//   • Moors reads INTERIOR SHOULDER SHAPE via seven octiles (E1..E7 at
//     12.5%..87.5% depth). Insensitive to far-tail extremes; sensitive
//     to shoulder-mass redistribution.
//   • Crow-Siddiqui reads FAR-TAIL SPAN via four percentiles (P2.5,
//     P25, P75, P97.5). Insensitive to interior-shoulder mass;
//     sensitive to far-tail extremes.
//   • L-kurtosis reads WHOLE-POOL TAIL-WEIGHT via rank-weighted linear
//     combinations of every cell. Sensitive to BOTH interior-shoulder
//     mass AND far-tail extremes, but weighted so tail cells dominate.
// Reading all three side-by-side lets ops triangulate whether tail
// weight comes from broadly heavy tails (all three move), from
// interior shoulder redistribution (Moors moves, cs/tau4 near
// reference), or from a single far-tail outlier (cs/tau4 move, Moors
// near reference).
//
// Well-defined for every pool with pool_count >= 5 and lambda2 > 0:
//   • pool_count 0            → tau4 null, lambdas null (empty pool).
//   • pool_count in [1, 4]    → tau4 null, lambdas null. Distinct
//                               "small_pool" label. n=1..3 makes b3 a
//                               zero-summand so lambda4 is zero; n=4
//                               makes b3 a one-cell tail-only sum
//                               (i=4 only, weight 6/6=1 so b3=x_4/4)
//                               that leaks the endpoint signal already
//                               surfaced by P11.181 range / P11.185
//                               top1/bot1 / P11.213 COR. Floor of 5
//                               matches the "avoid endpoint leakage"
//                               reasoning applied by every L-moment
//                               textbook (Hosking & Wallis 1997 §2.2
//                               recommend n>=r+1 for stable tau_r
//                               estimation); one greater than the
//                               P11.221 L-skewness floor of 4 because
//                               tau4 needs one more rank position to
//                               avoid the endpoint-leak pathology that
//                               tau3 stops at n=4.
//   • pool_count >= 5 and     → tau4 null, lambdas recorded (lambda1
//     lambda2 == 0              carries the mean so the reader sees the
//                               constant value), distinct "degenerate"
//                               label so the reader knows the pool is
//                               flat (every cell equal so lambda2 = 0,
//                               same failure mode returning iqr 0 on
//                               P11.207 / qcd null on P11.211 / bowley
//                               null on P11.215 / moors null on P11.217
//                               / cs null on P11.219 / tau3 null on
//                               P11.221). Distinct from "mesokurtic"
//                               because a flat pool tells the reader
//                               NOTHING about tail-weight (structural
//                               indeterminacy, not a measured
//                               mesokurtic verdict).
//   • pool_count >= 5 and     → tau4 = lambda4 / lambda2; rounded to 4
//     lambda2 > 0               decimals. Sample-PWM codomain [-1, +1];
//                               continuous-distribution refinement is
//                               (5*tau3^2 - 1)/4 <= tau4 <= 1 (Hosking
//                               1990 §2.3) but discrete finite-sample
//                               pools can reach the lower end of the
//                               loose [-1, +1] range.
//
// Cutoffs use excess-tau4 bands anchored on the normal reference 0.1226
// (analog to the P11.205 excess-kurtosis "subtract 3 so mesokurtic
// reads zero" convention and P11.217 Moors "subtract 1.233" / P11.219
// Crow-Siddiqui "subtract 2.906"):
//   • L_KURTOSIS_NORMAL_REFERENCE = 0.1226
//   • MESOKURTIC_L_KURTOSIS_DEVIATION_MAX = 0.05
//   • STRONG_L_KURTOSIS_DEVIATION_MIN = 0.15
// Bands (chosen so classical reference distributions land in distinct
// bands — narrower than Moors' 0.2 / 0.5 and Crow-Siddiqui's 0.3 / 0.7
// because L-kurtosis has a compact codomain (-0.25, +1] roughly ten
// times narrower than Moors' [0.5, 3.0] and twenty times narrower than
// Crow-Siddiqui's [1.5, 6.0]):
//   • Uniform (tau4 = 0)              → |dev|=0.1226 → mild_light
//   • Normal (tau4 = 0.1226)          → |dev|=0     → mesokurtic
//   • Exponential (tau4 = 0.1667)     → |dev|=0.044 → mesokurtic
//   • Logistic (tau4 = 0.1667)        → |dev|=0.044 → mesokurtic
//   • Gumbel (tau4 ≈ 0.1504)          → |dev|=0.028 → mesokurtic
//   • Laplace (tau4 ≈ 0.2357)         → |dev|=0.113 → mild_heavy
// These map back to raw tau4 as:
//   • mesokurtic    |tau4 - 0.1226| < 0.05 (raw tau4 in [0.0726, 0.1726])
//   • leptokurtic   tau4 in [0.1726, 0.2726) (mild heavy)
//   • platykurtic   tau4 in (-0.0274, 0.0726] (mild light)
//   • strong_heavy  tau4 >= 0.2726
//   • strong_light  tau4 <= -0.0274
// Bands:
//   • empty          pool_count == 0
//   • small_pool     pool_count in [1, 4] (L-kurtosis estimators
//                    undefined or endpoint-leaky)
//   • degenerate     lambda2 == 0 (flat pool — tail-weight undefined)
//   • mesokurtic     |tau4 - 0.1226| < 0.05 (near-normal tail shape)
//   • leptokurtic    tau4 in [0.1726, 0.2726) (mild heavy tails)
//   • platykurtic    tau4 in (-0.0274, 0.0726] (mild light tails)
//   • strong_heavy   tau4 >= 0.2726 (clearly heavy-tailed)
//   • strong_light   tau4 <= -0.0274 (clearly light-tailed / bimodal)
// All cutoffs exposed on the envelope as l_kurtosis_normal_reference /
// mesokurtic_l_kurtosis_deviation_max / strong_l_kurtosis_deviation_min
// so downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// LABEL ORIENTATION follows the standard TAIL-WEIGHT framing
// (mesokurtic / leptokurtic / platykurtic / strong_heavy /
// strong_light) — matches the P11.205 excess-kurtosis + P11.217 Moors
// + P11.219 Crow-Siddiqui label vocabulary so a reader scanning the
// four tail-weight surfaces sees the same heavy/light vocabulary
// across all four.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — L-
// kurtosis is a whole-pool fold that consumes every ordered cell via
// linear PWM weights.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.224):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolLSkewnessSection
// (P11.221) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
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
// KURTOSIS (P11.219) → L-SKEWNESS (P11.221) → L-KURTOSIS (this
// module) → per-pair hot-cells GRANULAR (P11.139). L-kurtosis sits
// IMMEDIATELY BELOW the P11.221 L-skewness surface so the two
// L-MOMENT siblings (tau3 bounded whole-pool at P11.221 → tau4
// bounded whole-pool here) close off the L-moment family after the
// tail-weight family (P11.217 Moors + P11.219 Crow-Siddiqui) — the
// (SKEWNESS, KURTOSIS) L-moment pair mirrors the (SKEWNESS, EXCESS
// KURTOSIS) Fisher-Pearson pair at P11.203/P11.205 but on the
// BOUNDED codomain rather than the UNBOUNDED codomain.

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
type LKurtosisLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "mesokurtic"
  | "leptokurtic"
  | "platykurtic"
  | "strong_heavy"
  | "strong_light";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// L-kurtosis reference value for a standard normal (Hosking 1990
// Table 1). A pool whose PWM ladder matches the normal reads exactly
// this value. Excess-tau4 bands centre on this anchor — same
// convention as the P11.205 excess-kurtosis "subtract 3" rule and the
// P11.217 Moors / P11.219 Crow-Siddiqui deviation anchors.
const L_KURTOSIS_NORMAL_REFERENCE = 0.1226;

// Symmetric excess-tau4 band edges around the normal reference.
// 0.05 / 0.15 chosen so the standard reference distributions
// (uniform 0, normal 0.1226, exponential/logistic 0.1667, gumbel
// 0.1504, laplace 0.2357) land in distinct bands. Narrower than
// Moors' 0.2 / 0.5 and Crow-Siddiqui's 0.3 / 0.7 because L-kurtosis
// has a compact codomain (-0.25, +1] roughly ten times narrower than
// Moors' [0.5, 3.0] and twenty times narrower than Crow-Siddiqui's
// [1.5, 6.0].
const MESOKURTIC_L_KURTOSIS_DEVIATION_MAX = 0.05;
const STRONG_L_KURTOSIS_DEVIATION_MIN = 0.15;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const L_KURTOSIS_DECIMALS = 4;

// Threshold below which the L-moment sample estimators leak the
// endpoint signal already surfaced by P11.181 range / P11.185
// top1/bot1 / P11.213 COR / P11.219 Crow-Siddiqui / P11.221
// L-skewness. Floor of 5 matches Hosking & Wallis 1997 §2.2 "n>=r+1
// for stable tau_r estimation" — one greater than the P11.221
// L-skewness floor of 4 because tau4 needs one more rank position to
// avoid the endpoint-leak pathology that tau3 stops at n=4 (at n=4,
// b3 = x_4/4 which is a one-cell tail-only sum leaking the endpoint
// signal already surfaced by the endpoint family).
const MIN_POOL_COUNT_FOR_L_KURTOSIS = 5;

export interface PerTransitionMagnitudeTop3PoolLKurtosisBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_lambda1: number | null;
  readonly partner_lambda2: number | null;
  readonly partner_lambda3: number | null;
  readonly partner_lambda4: number | null;
  readonly partner_l_kurtosis: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_lambda1: number | null;
  readonly metric_lambda2: number | null;
  readonly metric_lambda3: number | null;
  readonly metric_lambda4: number | null;
  readonly metric_l_kurtosis: number | null;
}

export interface PerTransitionMagnitudeTop3PoolLKurtosisBands {
  readonly small: PerTransitionMagnitudeTop3PoolLKurtosisBand;
  readonly medium: PerTransitionMagnitudeTop3PoolLKurtosisBand;
  readonly large: PerTransitionMagnitudeTop3PoolLKurtosisBand;
}

export interface PerTransitionMagnitudeTop3PoolLKurtosisEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolLKurtosisBands;
}

export interface PerTransitionMagnitudeTop3PoolLKurtosisMap {
  readonly improved: PerTransitionMagnitudeTop3PoolLKurtosisEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolLKurtosisEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolLKurtosisEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolLKurtosisEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_l_kurtosis: number;
  readonly l_kurtosis_normal_reference: number;
  readonly mesokurtic_l_kurtosis_deviation_max: number;
  readonly strong_l_kurtosis_deviation_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolLKurtosisMap;
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
// into L-moments lambda1 / lambda2 / lambda3 / lambda4.
//   b0 = (1/n) * sum(x_i)
//   b1 = (1/n) * sum_{i>=2} [(i-1)/(n-1)] * x_i
//   b2 = (1/n) * sum_{i>=3} [(i-1)(i-2)/((n-1)(n-2))] * x_i
//   b3 = (1/n) * sum_{i>=4} [(i-1)(i-2)(i-3)/((n-1)(n-2)(n-3))] * x_i
//   lambda1 = b0
//   lambda2 = 2*b1 - b0
//   lambda3 = 6*b2 - 6*b1 + b0
//   lambda4 = 20*b3 - 30*b2 + 12*b1 - b0
// Caller guarantees n >= MIN_POOL_COUNT_FOR_L_KURTOSIS (= 5) so
// (n-1), (n-2), and (n-3) denominators are all safe. Same b_r weight
// convention as the R `lmom` and `lmomco` packages so a reader
// porting the pool into R gets identical lambdas.
function lMomentsOfSorted(sorted: number[]): {
  lambda1: number;
  lambda2: number;
  lambda3: number;
  lambda4: number;
} {
  const n = sorted.length;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  for (let i = 1; i <= n; i++) {
    const x = sorted[i - 1];
    b0 += x;
    if (i >= 2) b1 += ((i - 1) / (n - 1)) * x;
    if (i >= 3) b2 += (((i - 1) * (i - 2)) / ((n - 1) * (n - 2))) * x;
    if (i >= 4)
      b3 +=
        (((i - 1) * (i - 2) * (i - 3)) / ((n - 1) * (n - 2) * (n - 3))) * x;
  }
  b0 /= n;
  b1 /= n;
  b2 /= n;
  b3 /= n;
  return {
    lambda1: b0,
    lambda2: 2 * b1 - b0,
    lambda3: 6 * b2 - 6 * b1 + b0,
    lambda4: 20 * b3 - 30 * b2 + 12 * b1 - b0,
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  lambda1: number | null;
  lambda2: number | null;
  lambda3: number | null;
  lambda4: number | null;
  l_kurtosis: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (
    pool_count < MIN_POOL_COUNT_FOR_L_KURTOSIS ||
    pool_cells === 0
  ) {
    return {
      pool_count,
      pool_cells,
      lambda1: null,
      lambda2: null,
      lambda3: null,
      lambda4: null,
      l_kurtosis: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { lambda1, lambda2, lambda3, lambda4 } = lMomentsOfSorted(sorted);
  // Degenerate flat pool (lambda2 == 0) — every cell equal so the
  // L-kurtosis denominator is zero. Record lambda1 so the reader sees
  // the constant value but return l_kurtosis null with a distinct
  // "degenerate" label downstream (structural indeterminacy, not a
  // measured mesokurtic verdict).
  if (lambda2 === 0) {
    return {
      pool_count,
      pool_cells,
      lambda1: roundTo(lambda1, L_KURTOSIS_DECIMALS),
      lambda2: 0,
      lambda3: roundTo(lambda3, L_KURTOSIS_DECIMALS),
      lambda4: roundTo(lambda4, L_KURTOSIS_DECIMALS),
      l_kurtosis: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    lambda1: roundTo(lambda1, L_KURTOSIS_DECIMALS),
    lambda2: roundTo(lambda2, L_KURTOSIS_DECIMALS),
    lambda3: roundTo(lambda3, L_KURTOSIS_DECIMALS),
    lambda4: roundTo(lambda4, L_KURTOSIS_DECIMALS),
    l_kurtosis: roundTo(lambda4 / lambda2, L_KURTOSIS_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolLKurtosisBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_lambda1: partner.lambda1,
    partner_lambda2: partner.lambda2,
    partner_lambda3: partner.lambda3,
    partner_lambda4: partner.lambda4,
    partner_l_kurtosis: partner.l_kurtosis,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_lambda1: metric.lambda1,
    metric_lambda2: metric.lambda2,
    metric_lambda3: metric.lambda3,
    metric_lambda4: metric.lambda4,
    metric_l_kurtosis: metric.l_kurtosis,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolLKurtosisEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis {
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
    min_pool_count_for_l_kurtosis: MIN_POOL_COUNT_FOR_L_KURTOSIS,
    l_kurtosis_normal_reference: L_KURTOSIS_NORMAL_REFERENCE,
    mesokurtic_l_kurtosis_deviation_max: MESOKURTIC_L_KURTOSIS_DEVIATION_MAX,
    strong_l_kurtosis_deviation_min: STRONG_L_KURTOSIS_DEVIATION_MIN,
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

function labelForLKurtosis(
  pool_count: number,
  lambda2: number | null,
  l_kurtosis: number | null,
  min_pool_count_for_l_kurtosis: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): LKurtosisLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_l_kurtosis) return "small_pool";
  if (l_kurtosis === null || lambda2 === null || lambda2 === 0)
    return "degenerate";
  const deviation = l_kurtosis - normal_reference;
  if (deviation >= strong_deviation_min) return "strong_heavy";
  if (deviation <= -strong_deviation_min) return "strong_light";
  if (deviation >= mesokurtic_deviation_max) return "leptokurtic";
  if (deviation <= -mesokurtic_deviation_max) return "platykurtic";
  return "mesokurtic";
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

function renderLKurtosisCell(
  pool_count: number,
  pool_cells: number,
  lambda1: number | null,
  lambda2: number | null,
  lambda3: number | null,
  lambda4: number | null,
  l_kurtosis: number | null,
  min_pool_count_for_l_kurtosis: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForLKurtosis(
    pool_count,
    lambda2,
    l_kurtosis,
    min_pool_count_for_l_kurtosis,
    normal_reference,
    mesokurtic_deviation_max,
    strong_deviation_min,
  );
  const tauText = l_kurtosis === null ? "-" : l_kurtosis.toFixed(3);
  const l1Text = lambda1 === null ? "-" : lambda1.toFixed(2);
  const l2Text = lambda2 === null ? "-" : lambda2.toFixed(2);
  const l3Text = lambda3 === null ? "-" : lambda3.toFixed(2);
  const l4Text = lambda4 === null ? "-" : lambda4.toFixed(2);
  return `tau4 ${tauText} (lambda1 ${l1Text}, lambda2 ${l2Text}, lambda3 ${l3Text}, lambda4 ${l4Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_l_kurtosis,
    l_kurtosis_normal_reference,
    mesokurtic_l_kurtosis_deviation_max,
    strong_l_kurtosis_deviation_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLKurtosisCell(band.partner_pool_count, band.partner_pool_cells, band.partner_lambda1, band.partner_lambda2, band.partner_lambda3, band.partner_lambda4, band.partner_l_kurtosis, min_pool_count_for_l_kurtosis, l_kurtosis_normal_reference, mesokurtic_l_kurtosis_deviation_max, strong_l_kurtosis_deviation_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderLKurtosisCell(band.metric_pool_count, band.metric_pool_cells, band.metric_lambda1, band.metric_lambda2, band.metric_lambda3, band.metric_lambda4, band.metric_l_kurtosis, min_pool_count_for_l_kurtosis, l_kurtosis_normal_reference, mesokurtic_l_kurtosis_deviation_max, strong_l_kurtosis_deviation_min)}</td></tr>`;
    });
  }).join("");

  const meso_lo = (l_kurtosis_normal_reference - mesokurtic_l_kurtosis_deviation_max).toFixed(4);
  const meso_hi = (l_kurtosis_normal_reference + mesokurtic_l_kurtosis_deviation_max).toFixed(4);
  const strong_hi = (l_kurtosis_normal_reference + strong_l_kurtosis_deviation_min).toFixed(4);
  const strong_lo = (l_kurtosis_normal_reference - strong_l_kurtosis_deviation_min).toFixed(4);

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool L-KURTOSIS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">L-MOMENT-BASED BOUNDED WHOLE-POOL TAIL-WEIGHT scalar over the P11.161 pool &mdash; tau4 = lambda4 / lambda2 folded from the unbiased sample PWM estimators (Hosking 1990). Bounded (-0.25, +1] complement to the P11.205 whole-pool Fisher-Pearson excess-kurtosis g2 surface which is unbounded and blows up on tail outliers via the fourth-standardised-moment fourth-power scaling &mdash; read side-by-side to distinguish "tail-weight driven by broadly heavy tails" (both surfaces non-zero and same sign) from "tail-weight driven by a single outlier" (g2 large, tau4 modest but still same sign). Also complements the P11.217 Moors interior-shoulder + P11.219 Crow-Siddiqui far-tail robust surfaces: Moors reads interior shoulder shape (E1..E7 octiles), Crow-Siddiqui reads far-tail span (P2.5/P97.5), tau4 reads whole-pool tail-weight via rank-weighted linear combinations of every cell. Sign convention (excess tau4 = tau4 - ${l_kurtosis_normal_reference}): POSITIVE = HEAVY tails (leptokurtic), NEGATIVE = LIGHT tails (platykurtic), ZERO = mesokurtic. Reference distributions: uniform (tau4=0, mild_light), normal (tau4=${l_kurtosis_normal_reference}, mesokurtic), exponential/logistic (tau4=0.1667, mesokurtic), gumbel (tau4=0.1504, mesokurtic), laplace (tau4=0.2357, mild_heavy). Labels: small_pool = pool_count &lt; ${min_pool_count_for_l_kurtosis} (L-moment estimators undefined or endpoint-leaky — n=4 makes b3=x_4/4 a one-cell tail-only sum), degenerate = lambda2 == 0 (flat pool, denominator zero — structural indeterminacy), mesokurtic = |tau4 - ${l_kurtosis_normal_reference}| &lt; ${mesokurtic_l_kurtosis_deviation_max} (raw tau4 in [${meso_lo}, ${meso_hi}]), leptokurtic = tau4 in [${meso_hi}, ${strong_hi}) (mild heavy tails), platykurtic = tau4 in (${strong_lo}, ${meso_lo}] (mild light tails), strong_heavy = tau4 &ge; ${strong_hi} (clearly heavy-tailed), strong_light = tau4 &le; ${strong_lo} (clearly light-tailed / bimodal). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + tau4 null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner tau4</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI tau4</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
