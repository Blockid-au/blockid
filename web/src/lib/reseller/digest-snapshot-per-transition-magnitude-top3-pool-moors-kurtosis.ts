// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MOORS KURTOSIS
// pure-lib (P11.217).
//
// OCTILE-BASED ROBUST INTERIOR-MASS TAIL-WEIGHT scalar over the P11.161
// pool. Folds the seven-octile ladder (E1..E7 at 12.5%, 25%, 37.5%,
// 50%, 62.5%, 75%, 87.5%) into ONE positive tail-weight read on
// [0, +inf) using two interdecile-style differences over the interior
// hinge span:
//
//   moors = ((E7 - E5) + (E3 - E1)) / (E6 - E2)
//
// Classroom "Moors kurtosis" (Moors 1988 — J.R. Statist. Soc. A). It
// is the OCTILE-based robust cousin of the P11.205 whole-pool
// Fisher-Pearson g2 surface — where g2 uses every cell via the fourth
// standardised moment and blows up on a single tail outlier, Moors uses
// only the seven octile positions and is bounded from below by 0 with
// finite normal-reference value 1.2330. Reads: 1.2330 iff the pool
// matches a normal (mesokurtic reference); > 1.2330 iff the tails are
// heavier than normal (leptokurtic — mass sits far from the mean and
// close to the median); < 1.2330 iff the tails are lighter than normal
// (platykurtic — mass spreads across the shoulders with a flat top).
//
// Complements P11.205 on TWO orthogonal axes:
//   • ROBUSTNESS. Moors ignores cells beyond the E1/E7 octiles so a
//     single (or double) tail outlier cannot move the scalar. A pool
//     [1,1,1,1,1,1,1,100] has g2 approaching ~+5 (right-tail cell
//     dominates the fourth moment) but Moors ~0 (E7 pulled up but
//     E6==E2 keeps the denominator collapsing to the degenerate
//     verdict). Reading the two side-by-side tells ops "tail-weight
//     driven by the interior distribution" (both non-zero) vs
//     "tail-weight driven by a tail outlier" (g2 non-zero, moors
//     degenerate) — the same endpoint-vs-interior contrast the
//     P11.211 QCD / P11.213 COR bounded-dispersion pair surfaces on
//     the DISPERSION axis and the P11.215 Bowley / P11.203 skewness
//     pair surfaces on the ASYMMETRY axis, now lifted to the
//     TAIL-WEIGHT axis.
//   • ROBUST NORMALISATION. Moors uses the interior-mass box (E6-E2)
//     as its yardstick so the scalar is dimensionless and directly
//     comparable across resellers with different absolute cell-count
//     baselines. g2 in contrast can vary by orders of magnitude
//     across pools of different pool_cells even at the same underlying
//     shape.
//
// Well-defined for every pool with pool_count >= 8 and E6 > E2:
//   • pool_count 0            → moors null, octiles null (empty pool).
//   • pool_count in [1, 7]    → moors null, octiles null. Distinct
//                               "small_pool" label. Below eight cells
//                               the seven octile hinges are dominated
//                               by linear-interpolation ties (multiple
//                               octiles collapse to the same
//                               endpoint) which would leak the
//                               endpoint signal already surfaced by
//                               P11.181 range / P11.185 top1/bot1 /
//                               P11.213 COR. Bumped to 8 (one cell
//                               per octile position) so Moors is a
//                               distinct interior-mass tail-weight
//                               read.
//   • pool_count >= 8 and     → moors null, octiles recorded, distinct
//     E6 == E2                  "degenerate" label so the reader knows
//                               the interior box has collapsed (a
//                               single-outlier pool tucks the outlier
//                               into the upper-tail's E7 leaving
//                               E2==E6==min — same failure mode that
//                               returns iqr 0 on P11.207 / qcd null
//                               on P11.211 / bowley null on P11.215).
//                               Distinct from "mesokurtic" because a
//                               degenerate interior tells the reader
//                               NOTHING about tail-weight (structural
//                               indeterminacy, not a measured
//                               mesokurtic verdict).
//   • pool_count >= 8 and     → moors = ((E7-E5)+(E3-E1))/(E6-E2);
//     E6 > E2                   rounded to 4 decimals. Denominator
//                               guaranteed > 0 by the guard above.
//
// Cutoffs use excess-Moors bands anchored at 0.2 / 0.5 around the
// normal reference 1.2330 — the classroom Moors thresholds (Moors
// 1988 §3; also Hosking "L-moments" 1990 §2 for the octile-based
// tail-weight framing). These map back to raw Moors as:
//   • mesokurtic   |moors - 1.2330| < 0.2 → raw moors in [1.033, 1.433]
//   • leaning      |moors - 1.2330| in [0.2, 0.5) → moderate signal
//   • heavy/light  |moors - 1.2330| >= 0.5 → clearly non-normal tails
// Bands:
//   • empty          pool_count == 0
//   • small_pool     pool_count in [1, 7] (octiles undefined)
//   • degenerate     E6 == E2 (flat interior — tail-weight undefined)
//   • mesokurtic     |moors - 1.2330| < 0.2 (near-normal tails)
//   • leptokurtic    moors in [1.4330, 1.7330) (mild heavy tails)
//   • platykurtic    moors in (0.7330, 1.0330] (mild light tails)
//   • strong_heavy   moors >= 1.7330 (clearly heavy tails)
//   • strong_light   moors <= 0.7330 (clearly light tails)
// All cutoffs exposed on the envelope as moors_normal_reference /
// mesokurtic_moors_deviation_max / strong_moors_deviation_min so
// downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// LABEL ORIENTATION follows the standard KURTOSIS framing (POSITIVE
// deviation from normal = heavy tails, NEGATIVE = light tails, ZERO
// deviation = mesokurtic like a normal) — matches the P11.205 excess
// kurtosis surface's sign convention (subtract 3 so mesokurtic reads
// zero) with Moors' subtract-1.2330 offset playing the same role.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — Moors is a seven-octile fold that consumes only the interior
// octile ladder but still names the whole-pool count/cells for
// reader context.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.218):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolBowleySkewnessSection
// (P11.215) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
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
// SKEWNESS (P11.215) → MOORS KURTOSIS (this module) → per-pair
// hot-cells GRANULAR (P11.139). Moors sits IMMEDIATELY BELOW the
// P11.215 Bowley robust interior-mass asymmetry surface so the
// (octile-based ASYMMETRY, octile-based TAIL-WEIGHT) robust pair
// stays adjacent — the reader scans them together for the same
// (g1, g2) → (bowley, moors) higher-moment shape descriptor pair
// the intro-stats convention establishes for whole-pool moments,
// now on the octile-robust surface.
//
// PERCENTILE INTERPOLATION uses linear interpolation between the two
// nearest ordered cells (R's `quantile` type 7 default, also Excel's
// PERCENTILE.INC): index = (n-1)*p, floor = i, frac = index-i,
// value = sorted[i] + frac*(sorted[i+1]-sorted[i]). Same convention
// as every intro-stats percentile helper so a reader porting the pool
// into R/Python/Excel gets the same octile ladder. Distinct from the
// Tukey EXCLUSIVE hinges used by P11.207 IQR / P11.211 QCD / P11.215
// Bowley — those three siblings share the "split at midpoint, drop
// central value" Tukey convention because they consume only three
// hinges, but Moors needs seven interior positions so pinning to the
// same Tukey convention would require re-splitting the pool three
// times which is both wasteful and less accurate than a single
// interpolation pass across the sorted array.

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
type MoorsLabel =
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

// Moors reference value for a standard normal (Moors 1988). A pool
// whose interior octile ladder matches the normal reads exactly this
// value. Excess-Moors bands centre on this anchor.
const MOORS_NORMAL_REFERENCE = 1.233;

// Symmetric band edges around the normal reference. 0.2 / 0.5 mirror
// the classroom Moors thresholds and keep the label vocabulary
// discriminating across real pools (Moors' typical range spans
// roughly [0.5, 3.0] in practice).
const MESOKURTIC_MOORS_DEVIATION_MAX = 0.2;
const STRONG_MOORS_DEVIATION_MIN = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const MOORS_DECIMALS = 4;

// Threshold below which the seven octile positions collapse into
// endpoint ties and Moors leaks the endpoint signal already surfaced
// by P11.181 range / P11.185 top1/bot1 / P11.213 COR. Bumped to 8
// (one cell per octile) so Moors is a distinct interior tail-weight
// read.
const MIN_POOL_COUNT_FOR_MOORS = 8;

export interface PerTransitionMagnitudeTop3PoolMoorsKurtosisBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_e1_cells: number | null;
  readonly partner_e2_cells: number | null;
  readonly partner_e3_cells: number | null;
  readonly partner_e5_cells: number | null;
  readonly partner_e6_cells: number | null;
  readonly partner_e7_cells: number | null;
  readonly partner_moors: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_e1_cells: number | null;
  readonly metric_e2_cells: number | null;
  readonly metric_e3_cells: number | null;
  readonly metric_e5_cells: number | null;
  readonly metric_e6_cells: number | null;
  readonly metric_e7_cells: number | null;
  readonly metric_moors: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMoorsKurtosisBands {
  readonly small: PerTransitionMagnitudeTop3PoolMoorsKurtosisBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMoorsKurtosisBand;
  readonly large: PerTransitionMagnitudeTop3PoolMoorsKurtosisBand;
}

export interface PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMoorsKurtosisBands;
}

export interface PerTransitionMagnitudeTop3PoolMoorsKurtosisMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_moors: number;
  readonly moors_normal_reference: number;
  readonly mesokurtic_moors_deviation_max: number;
  readonly strong_moors_deviation_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMoorsKurtosisMap;
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

// R quantile type 7 / Excel PERCENTILE.INC linear interpolation. index
// walks the sorted array in [0, n-1]; fractional index blends the two
// nearest cells. Standard percentile convention used across every
// intro-stats environment so a reader porting the pool into R/Python/
// Excel gets the same octile ladder.
function percentileOfSorted(sorted: number[], p: number): number {
  const n = sorted.length;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

// Compute the six octile positions Moors consumes: E1, E2, E3, E5, E6,
// E7 at 12.5%, 25%, 37.5%, 62.5%, 75%, 87.5%. E4 (median) is
// deliberately omitted because Moors' formula does not consume it —
// the shape read is entirely built from the SIX shoulder + tail
// octiles, matching Moors 1988's original definition.
function octilesForMoors(sorted: number[]): {
  e1: number;
  e2: number;
  e3: number;
  e5: number;
  e6: number;
  e7: number;
} {
  return {
    e1: percentileOfSorted(sorted, 0.125),
    e2: percentileOfSorted(sorted, 0.25),
    e3: percentileOfSorted(sorted, 0.375),
    e5: percentileOfSorted(sorted, 0.625),
    e6: percentileOfSorted(sorted, 0.75),
    e7: percentileOfSorted(sorted, 0.875),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  e1_cells: number | null;
  e2_cells: number | null;
  e3_cells: number | null;
  e5_cells: number | null;
  e6_cells: number | null;
  e7_cells: number | null;
  moors: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_MOORS || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      e1_cells: null,
      e2_cells: null,
      e3_cells: null,
      e5_cells: null,
      e6_cells: null,
      e7_cells: null,
      moors: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { e1, e2, e3, e5, e6, e7 } = octilesForMoors(sorted);
  // Degenerate interior (E6 == E2) — the interior box has zero width
  // so the Moors denominator is zero. Record the octiles so a reader
  // can see the flat interior but return moors null with a distinct
  // "degenerate" label downstream (structural indeterminacy, not a
  // measured mesokurtic verdict).
  if (e6 === e2) {
    return {
      pool_count,
      pool_cells,
      e1_cells: roundTo(e1, MOORS_DECIMALS),
      e2_cells: roundTo(e2, MOORS_DECIMALS),
      e3_cells: roundTo(e3, MOORS_DECIMALS),
      e5_cells: roundTo(e5, MOORS_DECIMALS),
      e6_cells: roundTo(e6, MOORS_DECIMALS),
      e7_cells: roundTo(e7, MOORS_DECIMALS),
      moors: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    e1_cells: roundTo(e1, MOORS_DECIMALS),
    e2_cells: roundTo(e2, MOORS_DECIMALS),
    e3_cells: roundTo(e3, MOORS_DECIMALS),
    e5_cells: roundTo(e5, MOORS_DECIMALS),
    e6_cells: roundTo(e6, MOORS_DECIMALS),
    e7_cells: roundTo(e7, MOORS_DECIMALS),
    moors: roundTo(((e7 - e5) + (e3 - e1)) / (e6 - e2), MOORS_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMoorsKurtosisBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_e1_cells: partner.e1_cells,
    partner_e2_cells: partner.e2_cells,
    partner_e3_cells: partner.e3_cells,
    partner_e5_cells: partner.e5_cells,
    partner_e6_cells: partner.e6_cells,
    partner_e7_cells: partner.e7_cells,
    partner_moors: partner.moors,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_e1_cells: metric.e1_cells,
    metric_e2_cells: metric.e2_cells,
    metric_e3_cells: metric.e3_cells,
    metric_e5_cells: metric.e5_cells,
    metric_e6_cells: metric.e6_cells,
    metric_e7_cells: metric.e7_cells,
    metric_moors: metric.moors,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMoorsKurtosisEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis {
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
    min_pool_count_for_moors: MIN_POOL_COUNT_FOR_MOORS,
    moors_normal_reference: MOORS_NORMAL_REFERENCE,
    mesokurtic_moors_deviation_max: MESOKURTIC_MOORS_DEVIATION_MAX,
    strong_moors_deviation_min: STRONG_MOORS_DEVIATION_MIN,
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

function labelForMoors(
  pool_count: number,
  e2: number | null,
  e6: number | null,
  moors: number | null,
  min_pool_count_for_moors: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): MoorsLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_moors) return "small_pool";
  if (moors === null || e2 === null || e6 === null) return "degenerate";
  const deviation = moors - normal_reference;
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

function renderMoorsCell(
  pool_count: number,
  pool_cells: number,
  e1: number | null,
  e2: number | null,
  e3: number | null,
  e5: number | null,
  e6: number | null,
  e7: number | null,
  moors: number | null,
  min_pool_count_for_moors: number,
  normal_reference: number,
  mesokurtic_deviation_max: number,
  strong_deviation_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForMoors(
    pool_count,
    e2,
    e6,
    moors,
    min_pool_count_for_moors,
    normal_reference,
    mesokurtic_deviation_max,
    strong_deviation_min,
  );
  const moorsText = moors === null ? "-" : moors.toFixed(3);
  const e1Text = e1 === null ? "-" : e1.toFixed(2);
  const e2Text = e2 === null ? "-" : e2.toFixed(2);
  const e3Text = e3 === null ? "-" : e3.toFixed(2);
  const e5Text = e5 === null ? "-" : e5.toFixed(2);
  const e6Text = e6 === null ? "-" : e6.toFixed(2);
  const e7Text = e7 === null ? "-" : e7.toFixed(2);
  return `m ${moorsText} (E1 ${e1Text}, E2 ${e2Text}, E3 ${e3Text}, E5 ${e5Text}, E6 ${e6Text}, E7 ${e7Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_moors,
    moors_normal_reference,
    mesokurtic_moors_deviation_max,
    strong_moors_deviation_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMoorsCell(band.partner_pool_count, band.partner_pool_cells, band.partner_e1_cells, band.partner_e2_cells, band.partner_e3_cells, band.partner_e5_cells, band.partner_e6_cells, band.partner_e7_cells, band.partner_moors, min_pool_count_for_moors, moors_normal_reference, mesokurtic_moors_deviation_max, strong_moors_deviation_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMoorsCell(band.metric_pool_count, band.metric_pool_cells, band.metric_e1_cells, band.metric_e2_cells, band.metric_e3_cells, band.metric_e5_cells, band.metric_e6_cells, band.metric_e7_cells, band.metric_moors, min_pool_count_for_moors, moors_normal_reference, mesokurtic_moors_deviation_max, strong_moors_deviation_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MOORS KURTOSIS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">OCTILE-BASED ROBUST INTERIOR-MASS TAIL-WEIGHT scalar over the P11.161 pool &mdash; the seven-octile ladder folds into ONE positive tail-weight read: m = ((E7 - E5) + (E3 - E1)) / (E6 - E2). Robust octile-based complement to the P11.205 whole-pool Fisher-Pearson g2 (unbounded in [-2, +&infin;)) &mdash; interior-only counterpart that ignores cells beyond E1/E7 so a single tail outlier cannot move the scalar. Pairs on the TAIL-WEIGHT axis the same way P11.215 Bowley + P11.203 skewness pair on the ASYMMETRY axis: read side-by-side to distinguish "tail-weight driven by interior distribution" (both non-zero) from "tail-weight driven by a tail outlier" (g2 non-zero, moors degenerate). Reference normal reads ${moors_normal_reference} &mdash; values above signal HEAVY tails, below signal LIGHT tails. Labels: small_pool = pool_count &lt; ${min_pool_count_for_moors} (octiles collapse to endpoint ties, duplicating range/top1-bot1/COR endpoint surfaces), degenerate = E6 == E2 (flat interior, m denominator zero &mdash; structural indeterminacy), mesokurtic = |m &minus; ${moors_normal_reference}| &lt; ${mesokurtic_moors_deviation_max} (near-normal tails), leptokurtic = m in [${(moors_normal_reference + mesokurtic_moors_deviation_max).toFixed(4)}, ${(moors_normal_reference + strong_moors_deviation_min).toFixed(4)}) (mild heavy tails), platykurtic = m in (${(moors_normal_reference - strong_moors_deviation_min).toFixed(4)}, ${(moors_normal_reference - mesokurtic_moors_deviation_max).toFixed(4)}] (mild light tails), strong_heavy = m &ge; ${(moors_normal_reference + strong_moors_deviation_min).toFixed(4)} (clearly heavy tails), strong_light = m &le; ${(moors_normal_reference - strong_moors_deviation_min).toFixed(4)} (clearly light tails). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + moors null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner moors</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI moors</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
