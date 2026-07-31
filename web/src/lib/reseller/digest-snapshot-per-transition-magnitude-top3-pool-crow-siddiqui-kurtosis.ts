// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL CROW-SIDDIQUI
// KURTOSIS pure-lib (P11.219).
//
// PERCENTILE-BASED ROBUST TAIL-EXTREME TAIL-WEIGHT scalar over the
// P11.161 pool. Folds the four-percentile square (P2.5, P25, P75,
// P97.5) into ONE positive tail-weight read on [0, +inf) using the
// classroom Crow-Siddiqui (1967) formula:
//
//   cs = (P97.5 - P2.5) / (P75 - P25)
//
// A near-tail-range over the interior-hinge (IQR) span. Reads for
// standard reference distributions:
//   • Uniform (rectangular): 0.95 / 0.50 = 1.9
//   • Normal (Gaussian):      3.92 / 1.349 ≈ 2.906
//   • Laplace (double-exp):   ~5.7
//   • Cauchy:                 diverges (uses interior hinge span 0
//                              in the limit; a Cauchy-like pool will
//                              read very large before the interior
//                              hinges swing wide enough to bound it)
// Reference for a standard normal reads exactly
// CROW_SIDDIQUI_NORMAL_REFERENCE = 2.906 (Crow & Siddiqui 1967 —
// J. Amer. Statist. Assoc. Vol 62). Values above signal HEAVY tails
// vs normal (leptokurtic — mass sits at the extreme percentiles
// while the interior hinges stay narrow); below signal LIGHT tails
// (platykurtic — the interior hinges are wide relative to the
// extreme-percentile span, mass fills the shoulders uniformly).
//
// Complements the P11.217 Moors kurtosis surface on a THIRD axis
// beyond ROBUSTNESS + INTERIOR NORMALISATION: PERCENTILE-DEPTH.
// Where Moors uses SEVEN interior octile positions (E1..E7 at 12.5%
// through 87.5% depths) and folds the ladder using two interdecile
// differences over an interior-hinge box, Crow-Siddiqui uses only
// FOUR positions — the interior Tukey hinges (P25, P75) and the
// near-tail extremes (P2.5, P97.5). The two therefore surface
// orthogonal aspects of tail-weight:
//   • Moors reads the INTERIOR SHOULDER shape — how mass distributes
//     between the 12.5% and 87.5% octiles relative to the 25%-75%
//     hinge box. Blind to what happens beyond E1/E7.
//   • Crow-Siddiqui reads the FAR-TAIL SPAN — how wide the 2.5%-97.5%
//     near-tail range is relative to the 25%-75% interior hinge. A
//     pool with heavy tails beyond the octile ladder will not move
//     Moors but WILL widen Crow-Siddiqui as P97.5 pulls up (and P2.5
//     pulls down).
// Reading the two side-by-side tells ops "tail-weight driven by
// interior shoulder shape" (Moors moves, Crow-Siddiqui stays near
// normal reference) vs "tail-weight driven by far-tail extremes"
// (Crow-Siddiqui moves, Moors stays near normal reference). The
// same DEPTH-AXIS contrast the P11.207 IQR / P11.211 QCD interior
// pair sets up on the DISPERSION axis (IQR reads absolute hinge
// span; QCD reads ratio hinge span) but lifted to the TAIL-WEIGHT
// axis on interior-vs-extreme percentile-depth complementarity.
//
// RELATIONSHIP TO P11.209 IQR RATIO. At LOW pool_count both surfaces
// converge structurally: with n=4 the P97.5 hinge sits ~92.5% of the
// way from sorted[2] to sorted[3] (near-max) and P2.5 sits ~7.5% of
// the way from sorted[0] to sorted[1] (near-min), so the numerator
// approximates (max - min) which is P11.181 range and the ratio
// approximates P11.209 IQR RATIO (= range/iqr). As pool_count GROWS
// the interpolation pulls P97.5 away from the max and P2.5 away from
// the min, so Crow-Siddiqui DIVERGES from IQR RATIO — for n=40 the
// P97.5 sits at index 39*0.975=38.025, blending sorted[38] and
// sorted[39] (about 3% below max on a linear ramp), and for n=100
// the split is 96.5% (about 3.5% below max). Distinction is that
// Crow-Siddiqui becomes a distinct SOFTENED-TAIL read at moderate n
// while IQR RATIO always uses the hard endpoints. This is the
// PERCENTILE-DEPTH analog of the way P11.213 COR softens the
// P11.181 range read by dividing by max+min (normalising to the
// magnitude of the endpoints) — both surfaces smooth the raw range
// read but via different mechanisms (Crow-Siddiqui via interpolation,
// COR via magnitude normalisation).
//
// Well-defined for every pool with pool_count >= 4 and P75 > P25:
//   • pool_count 0            → cs null, percentiles null (empty pool).
//   • pool_count in [1, 3]    → cs null, percentiles null. Distinct
//                               "small_pool" label. Below four cells
//                               the P25/P75 hinges collapse to
//                               endpoints (n=1 → all four percentiles
//                               = sole value; n=2 → P25 and P75
//                               interpolate between the two values;
//                               n=3 → P25 sits at 25% and P75 at 75%
//                               but both are so close to the two
//                               endpoints they leak the endpoint
//                               signal already surfaced by P11.181
//                               range / P11.185 top1/bot1 / P11.213
//                               COR). Floor of 4 matches P11.207 IQR
//                               / P11.209 IQR RATIO / P11.211 QCD /
//                               P11.215 Bowley since all five siblings
//                               share the Tukey-hinge floor. Distinct
//                               from Moors' floor of 8 (seven octiles
//                               need one cell per position) because
//                               Crow-Siddiqui uses only four
//                               positions.
//   • pool_count >= 4 and     → cs null, percentiles recorded, distinct
//     P75 == P25                "degenerate" label so the reader knows
//                               the interior hinge box has collapsed
//                               (a single-outlier pool tucks the
//                               outlier into the upper-tail's P97.5
//                               leaving P25==P75==min — same failure
//                               mode that returns iqr 0 on P11.207 /
//                               qcd null on P11.211 / bowley null on
//                               P11.215). Distinct from "mesokurtic"
//                               because a degenerate interior tells
//                               the reader NOTHING about tail-weight
//                               (structural indeterminacy, not a
//                               measured mesokurtic verdict).
//   • pool_count >= 4 and     → cs = (P97.5 - P2.5) / (P75 - P25);
//     P75 > P25                 rounded to 4 decimals. Denominator
//                               guaranteed > 0 by the guard above.
//                               Numerator is guaranteed >= 0 by
//                               sortedness (P97.5 >= P2.5 always).
//
// Cutoffs use excess-Crow-Siddiqui bands anchored at 0.3 / 0.7 around
// the normal reference 2.906 — chosen so the standard reference
// distributions land in distinct bands:
//   • Uniform (1.9) sits in strong_light (1.9 - 2.906 = -1.006 <= -0.7).
//   • Normal (2.906) sits at the mesokurtic centre by construction.
//   • Laplace (~5.7) sits in strong_heavy (5.7 - 2.906 = 2.794 >= 0.7).
// Wider than Moors' 0.2 / 0.5 bands because Crow-Siddiqui's raw range
// is wider (typical [1.5, 6.0] vs Moors' [0.5, 3.0]) so band edges
// need to scale up to preserve the same discriminative power. These
// map back to raw Crow-Siddiqui as:
//   • mesokurtic     |cs - 2.906| < 0.3 → raw cs in [2.606, 3.206]
//   • leaning        |cs - 2.906| in [0.3, 0.7) → moderate signal
//   • heavy/light    |cs - 2.906| >= 0.7 → clearly non-normal tails
// Bands:
//   • empty          pool_count == 0
//   • small_pool     pool_count in [1, 3] (hinges undefined)
//   • degenerate     P75 == P25 (flat interior — tail-weight undefined)
//   • mesokurtic     |cs - 2.906| < 0.3 (near-normal tails)
//   • leptokurtic    cs in [3.206, 3.606) (mild heavy tails)
//   • platykurtic    cs in (2.206, 2.606] (mild light tails)
//   • strong_heavy   cs >= 3.606 (clearly heavy tails)
//   • strong_light   cs <= 2.206 (clearly light tails)
// All cutoffs exposed on the envelope as crow_siddiqui_normal_reference
// / mesokurtic_crow_siddiqui_deviation_max /
// strong_crow_siddiqui_deviation_min so downstream JSONL consumers
// render the label vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the standard KURTOSIS framing (POSITIVE
// deviation from normal = heavy tails, NEGATIVE = light tails, ZERO
// deviation = mesokurtic like a normal) — matches the P11.205 excess
// kurtosis + P11.217 Moors sign convention with Crow-Siddiqui's
// subtract-2.906 offset playing the same role as Moors' subtract-1.233
// and the classic subtract-3 for excess kurtosis.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — Crow-
// Siddiqui is a four-percentile fold that consumes only the near-tail
// and interior-hinge positions but still names the whole-pool
// count/cells for reader context.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.220):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMoorsKurtosisSection
// (P11.217) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
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
// KURTOSIS (this module) → per-pair hot-cells GRANULAR (P11.139).
// Crow-Siddiqui sits IMMEDIATELY BELOW the P11.217 Moors surface so
// the two ROBUST KURTOSIS siblings stay adjacent — the reader scans
// them together for the (INTERIOR-SHOULDER, FAR-TAIL) percentile-
// depth pair the same way (P11.215, P11.217) provides the ASYMMETRY
// / TAIL-WEIGHT pair on the interior surface.
//
// PERCENTILE INTERPOLATION uses linear interpolation between the two
// nearest ordered cells (R's `quantile` type 7 default, also Excel's
// PERCENTILE.INC): index = (n-1)*p, floor = i, frac = index-i,
// value = sorted[i] + frac*(sorted[i+1]-sorted[i]). Same convention
// as the P11.217 Moors sibling — both pool-shape kurtosis surfaces
// share the same percentile helper so a reader porting the pool into
// R/Python/Excel gets the same near-tail + hinge readings.

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
type CrowSiddiquiLabel =
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

// Crow-Siddiqui reference value for a standard normal (Crow &
// Siddiqui 1967). A pool whose four-percentile square matches the
// normal reads exactly this value. Excess-Crow-Siddiqui bands centre
// on this anchor.
const CROW_SIDDIQUI_NORMAL_REFERENCE = 2.906;

// Symmetric band edges around the normal reference. 0.3 / 0.7 chosen
// so the standard reference distributions (uniform 1.9, normal 2.906,
// laplace ~5.7) land in distinct bands. Wider than Moors' 0.2 / 0.5
// because Crow-Siddiqui's raw range spans roughly [1.5, 6.0] in
// practice while Moors spans roughly [0.5, 3.0].
const MESOKURTIC_CROW_SIDDIQUI_DEVIATION_MAX = 0.3;
const STRONG_CROW_SIDDIQUI_DEVIATION_MIN = 0.7;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const CROW_SIDDIQUI_DECIMALS = 4;

// Threshold below which the Tukey P25/P75 hinges collapse to
// endpoints and Crow-Siddiqui leaks the endpoint signal already
// surfaced by P11.181 range / P11.185 top1/bot1 / P11.213 COR. Floor
// of 4 matches P11.207 IQR / P11.209 IQR RATIO / P11.211 QCD /
// P11.215 Bowley — all five siblings share the Tukey-hinge floor.
const MIN_POOL_COUNT_FOR_CROW_SIDDIQUI = 4;

export interface PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_p025_cells: number | null;
  readonly partner_p25_cells: number | null;
  readonly partner_p75_cells: number | null;
  readonly partner_p975_cells: number | null;
  readonly partner_crow_siddiqui: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_p025_cells: number | null;
  readonly metric_p25_cells: number | null;
  readonly metric_p75_cells: number | null;
  readonly metric_p975_cells: number | null;
  readonly metric_crow_siddiqui: number | null;
}

export interface PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBands {
  readonly small: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBand;
  readonly medium: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBand;
  readonly large: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBand;
}

export interface PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBands;
}

export interface PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisMap {
  readonly improved: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_crow_siddiqui: number;
  readonly crow_siddiqui_normal_reference: number;
  readonly mesokurtic_crow_siddiqui_deviation_max: number;
  readonly strong_crow_siddiqui_deviation_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisMap;
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

// R quantile type 7 / Excel PERCENTILE.INC linear interpolation.
// Same helper shape as the P11.217 Moors sibling so both robust
// kurtosis modules share the exact same percentile convention.
function percentileOfSorted(sorted: number[], p: number): number {
  const n = sorted.length;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

// Compute the four percentile positions Crow-Siddiqui consumes:
// P2.5, P25, P75, P97.5. Deliberately DISTINCT from the seven octile
// positions Moors consumes (E1..E7 at 12.5%-87.5%) — Crow-Siddiqui
// reads the FAR-TAIL SPAN via P2.5/P97.5 whereas Moors reads the
// INTERIOR SHOULDER SHAPE via E1..E7 which never venture past 87.5%
// depth.
function percentilesForCrowSiddiqui(sorted: number[]): {
  p025: number;
  p25: number;
  p75: number;
  p975: number;
} {
  return {
    p025: percentileOfSorted(sorted, 0.025),
    p25: percentileOfSorted(sorted, 0.25),
    p75: percentileOfSorted(sorted, 0.75),
    p975: percentileOfSorted(sorted, 0.975),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  p025_cells: number | null;
  p25_cells: number | null;
  p75_cells: number | null;
  p975_cells: number | null;
  crow_siddiqui: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (
    pool_count < MIN_POOL_COUNT_FOR_CROW_SIDDIQUI ||
    pool_cells === 0
  ) {
    return {
      pool_count,
      pool_cells,
      p025_cells: null,
      p25_cells: null,
      p75_cells: null,
      p975_cells: null,
      crow_siddiqui: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { p025, p25, p75, p975 } = percentilesForCrowSiddiqui(sorted);
  // Degenerate interior (P75 == P25) — the interior hinge box has zero
  // width so the Crow-Siddiqui denominator is zero. Record the
  // percentiles so a reader can see the flat interior but return
  // crow_siddiqui null with a distinct "degenerate" label downstream
  // (structural indeterminacy, not a measured mesokurtic verdict).
  if (p75 === p25) {
    return {
      pool_count,
      pool_cells,
      p025_cells: roundTo(p025, CROW_SIDDIQUI_DECIMALS),
      p25_cells: roundTo(p25, CROW_SIDDIQUI_DECIMALS),
      p75_cells: roundTo(p75, CROW_SIDDIQUI_DECIMALS),
      p975_cells: roundTo(p975, CROW_SIDDIQUI_DECIMALS),
      crow_siddiqui: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    p025_cells: roundTo(p025, CROW_SIDDIQUI_DECIMALS),
    p25_cells: roundTo(p25, CROW_SIDDIQUI_DECIMALS),
    p75_cells: roundTo(p75, CROW_SIDDIQUI_DECIMALS),
    p975_cells: roundTo(p975, CROW_SIDDIQUI_DECIMALS),
    crow_siddiqui: roundTo((p975 - p025) / (p75 - p25), CROW_SIDDIQUI_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_p025_cells: partner.p025_cells,
    partner_p25_cells: partner.p25_cells,
    partner_p75_cells: partner.p75_cells,
    partner_p975_cells: partner.p975_cells,
    partner_crow_siddiqui: partner.crow_siddiqui,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_p025_cells: metric.p025_cells,
    metric_p25_cells: metric.p25_cells,
    metric_p75_cells: metric.p75_cells,
    metric_p975_cells: metric.p975_cells,
    metric_crow_siddiqui: metric.crow_siddiqui,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis {
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
    min_pool_count_for_crow_siddiqui: MIN_POOL_COUNT_FOR_CROW_SIDDIQUI,
    crow_siddiqui_normal_reference: CROW_SIDDIQUI_NORMAL_REFERENCE,
    mesokurtic_crow_siddiqui_deviation_max:
      MESOKURTIC_CROW_SIDDIQUI_DEVIATION_MAX,
    strong_crow_siddiqui_deviation_min: STRONG_CROW_SIDDIQUI_DEVIATION_MIN,
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

function labelForCrowSiddiqui(
  pool_count: number,
  p25: number | null,
  p75: number | null,
  crow_siddiqui: number | null,
  min_pool_count_for_crow_siddiqui: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): CrowSiddiquiLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_crow_siddiqui) return "small_pool";
  if (crow_siddiqui === null || p25 === null || p75 === null)
    return "degenerate";
  const deviation = crow_siddiqui - normal_reference;
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

function renderCrowSiddiquiCell(
  pool_count: number,
  pool_cells: number,
  p025: number | null,
  p25: number | null,
  p75: number | null,
  p975: number | null,
  crow_siddiqui: number | null,
  min_pool_count_for_crow_siddiqui: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForCrowSiddiqui(
    pool_count,
    p25,
    p75,
    crow_siddiqui,
    min_pool_count_for_crow_siddiqui,
    normal_reference,
    mesokurtic_deviation_max,
    strong_deviation_min,
  );
  const csText = crow_siddiqui === null ? "-" : crow_siddiqui.toFixed(3);
  const p025Text = p025 === null ? "-" : p025.toFixed(2);
  const p25Text = p25 === null ? "-" : p25.toFixed(2);
  const p75Text = p75 === null ? "-" : p75.toFixed(2);
  const p975Text = p975 === null ? "-" : p975.toFixed(2);
  return `cs ${csText} (P2.5 ${p025Text}, P25 ${p25Text}, P75 ${p75Text}, P97.5 ${p975Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_crow_siddiqui,
    crow_siddiqui_normal_reference,
    mesokurtic_crow_siddiqui_deviation_max,
    strong_crow_siddiqui_deviation_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCrowSiddiquiCell(band.partner_pool_count, band.partner_pool_cells, band.partner_p025_cells, band.partner_p25_cells, band.partner_p75_cells, band.partner_p975_cells, band.partner_crow_siddiqui, min_pool_count_for_crow_siddiqui, crow_siddiqui_normal_reference, mesokurtic_crow_siddiqui_deviation_max, strong_crow_siddiqui_deviation_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCrowSiddiquiCell(band.metric_pool_count, band.metric_pool_cells, band.metric_p025_cells, band.metric_p25_cells, band.metric_p75_cells, band.metric_p975_cells, band.metric_crow_siddiqui, min_pool_count_for_crow_siddiqui, crow_siddiqui_normal_reference, mesokurtic_crow_siddiqui_deviation_max, strong_crow_siddiqui_deviation_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool CROW-SIDDIQUI KURTOSIS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">PERCENTILE-BASED ROBUST TAIL-EXTREME TAIL-WEIGHT scalar over the P11.161 pool &mdash; the four-percentile square (P2.5, P25, P75, P97.5) folds into ONE positive tail-weight read: cs = (P97.5 - P2.5) / (P75 - P25). Percentile-depth complement to the P11.217 Moors kurtosis surface which reads INTERIOR SHOULDER SHAPE via E1..E7 octiles (12.5%-87.5% depth) &mdash; Crow-Siddiqui instead reads the FAR-TAIL SPAN via the near-extremes P2.5/P97.5. Read side-by-side to distinguish "tail-weight driven by interior shoulders" (Moors moves, cs stays near normal) from "tail-weight driven by far-tail extremes" (cs moves, Moors stays near normal). Reference normal reads ${crow_siddiqui_normal_reference} &mdash; values above signal HEAVY tails, below signal LIGHT tails. Reference distributions: uniform (1.9) sits in strong_light, laplace (~5.7) sits in strong_heavy. Labels: small_pool = pool_count &lt; ${min_pool_count_for_crow_siddiqui} (P25/P75 hinges collapse to endpoints, duplicating range/top1-bot1/COR endpoint surfaces), degenerate = P75 == P25 (flat interior hinge, cs denominator zero &mdash; structural indeterminacy), mesokurtic = |cs &minus; ${crow_siddiqui_normal_reference}| &lt; ${mesokurtic_crow_siddiqui_deviation_max} (near-normal tails), leptokurtic = cs in [${(crow_siddiqui_normal_reference + mesokurtic_crow_siddiqui_deviation_max).toFixed(4)}, ${(crow_siddiqui_normal_reference + strong_crow_siddiqui_deviation_min).toFixed(4)}) (mild heavy tails), platykurtic = cs in (${(crow_siddiqui_normal_reference - strong_crow_siddiqui_deviation_min).toFixed(4)}, ${(crow_siddiqui_normal_reference - mesokurtic_crow_siddiqui_deviation_max).toFixed(4)}] (mild light tails), strong_heavy = cs &ge; ${(crow_siddiqui_normal_reference + strong_crow_siddiqui_deviation_min).toFixed(4)} (clearly heavy tails), strong_light = cs &le; ${(crow_siddiqui_normal_reference - strong_crow_siddiqui_deviation_min).toFixed(4)} (clearly light tails). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + cs null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner cs</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI cs</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
