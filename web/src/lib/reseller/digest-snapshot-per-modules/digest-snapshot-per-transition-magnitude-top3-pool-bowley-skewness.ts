// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL BOWLEY SKEWNESS
// pure-lib (P11.215).
//
// BOUNDED INTERIOR-MASS asymmetry scalar over the P11.161 pool. Folds
// the three-hinge triple (Q1, Q2, Q3) into ONE SIGNED normalised
// asymmetry read on [-1, +1]:
//
//   bs = (Q3 + Q1 - 2*Q2) / (Q3 - Q1)
//
// Classroom "Bowley skewness" (Bowley 1901; Kendall & Stuart Vol.1
// §2.20 in modern print). Interior-only cousin of the P11.203
// whole-pool Fisher-Pearson g1 surface — where g1 uses every cell
// via the third standardised moment and is unbounded in
// (-inf, +inf), Bowley uses only the three hinges of the ordered pool
// and is strictly bounded in [-1, +1] by construction. Reads: +1 iff
// Q2 == Q1 (median at the lower hinge → all interior mass sits on the
// LEFT of the box, so the RIGHT tail is heavy → positive skew); -1 iff
// Q2 == Q3 (mirror-image); 0 iff Q2 is at the midpoint of the box
// (interior mass is symmetric around the median).
//
// Complements P11.203 on TWO orthogonal axes:
//   • ROBUSTNESS. Bowley ignores endpoints so a single (or double)
//     outlier past the hinges cannot move the scalar. A pool
//     [1,1,1,1,100] has Bowley 0 (interior [1,1,1] is symmetric
//     around Q2=1) but g1 ~ +1.5 (right-tail cell dominates the third
//     moment). Reading the two side-by-side tells ops "asymmetry
//     driven by the interior distribution" (both non-zero) vs
//     "asymmetry driven by a tail outlier" (g1 non-zero, Bowley
//     ~0) — the same endpoint-vs-interior contrast the P11.211
//     QCD / P11.213 COR bounded-dispersion pair surfaces on the
//     DISPERSION axis, now lifted to the ASYMMETRY axis.
//   • BOUNDEDNESS. Bowley is directly comparable across resellers
//     with different absolute cell-count baselines because its range
//     is fixed at [-1, +1] — no per-reseller normalisation required.
//     g1 in contrast can vary by orders of magnitude across pools
//     of different pool_cells even at the same underlying shape.
//
// Well-defined for every pool with pool_count >= 4 and Q3 > Q1:
//   • pool_count 0            → bs null, hinges null (empty pool).
//   • pool_count in [1, 3]    → bs null, hinges null. Distinct
//                               "small_pool" label. Same threshold
//                               as P11.207 IQR / P11.209 IQR RATIO /
//                               P11.211 QCD because all four surfaces
//                               consume the same Tukey exclusive
//                               hinges — hinges collapse to
//                               endpoints for pool_count < 4 which
//                               would duplicate the P11.181 range
//                               / P11.185 top1/bot1 / P11.213 COR
//                               endpoint surfaces.
//   • pool_count >= 4 and     → bs null, hinges recorded, distinct
//     Q3 == Q1                  "degenerate" label so the reader
//                               knows the interior is FLAT (a
//                               single-outlier pool tucks the outlier
//                               into the upper-half's max leaving
//                               Q3 == Q1 == 1 — same failure mode
//                               that returns iqr 0 on P11.207 /
//                               qcd null on P11.211). Distinct from
//                               "symmetric" because a degenerate
//                               interior tells the reader NOTHING
//                               about asymmetry (structural
//                               indeterminacy, not a measured symmetric
//                               verdict).
//   • pool_count >= 4 and     → bs = (Q3 + Q1 - 2*Q2) / (Q3 - Q1);
//     Q3 > Q1                   rounded to 4 decimals. Denominator
//                               guaranteed > 0 by the guard above.
//
// Cutoffs use plain-language bounded-asymmetry bands anchored at
// 0.1 / 0.3 — the classroom Bowley thresholds (Kendall & Stuart
// §2.20; also Bulmer "Principles of Statistics" 1979 §5.4). These
// DIFFER from the P11.203 whole-pool skewness thresholds (|g1| >= 0.5
// = right/left_leaning) because Bowley's tight [-1, +1] codomain
// makes 0.5 an extreme value — using 0.5 would collapse most real
// pools into the symmetric bucket. Anchors map to Q2 positions
// within the box (Q3-Q1) via the closed form Q2 = (Q3+Q1)/2 -
// bs*(Q3-Q1)/2:
//   • bs 0.1  ↔ Q2 sits at 45% of the way from Q1 to Q3
//   • bs 0.3  ↔ Q2 sits at 35% of the way from Q1 to Q3
// Bands:
//   • empty         pool_count == 0
//   • small_pool    pool_count in [1, 3] (hinges undefined)
//   • degenerate    Q3 == Q1 (flat interior — asymmetry undefined)
//   • symmetric     |bs| < 0.1 (Q2 within 45-55% of the box)
//   • right_leaning bs in [+0.1, +0.3) (mild positive skew;
//                   Q2 in 35-45% of the box, RIGHT tail heavier)
//   • left_leaning  bs in (-0.3, -0.1] (mild negative skew;
//                   Q2 in 55-65% of the box, LEFT tail heavier)
//   • strong_right  bs >= +0.3 (strong positive skew; Q2 in
//                   0-35% of the box, RIGHT tail dominates
//                   interior mass)
//   • strong_left   bs <= -0.3 (strong negative skew; Q2 in
//                   65-100% of the box, LEFT tail dominates)
// All cutoffs exposed on the envelope as symmetric_bowley_abs_max /
// strong_bowley_abs_min so downstream JSONL consumers render the
// label vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same SIGNED framing as P11.203
// whole-pool skewness (POSITIVE bs = RIGHT tail heavy) — matches the
// classroom third-moment sign convention and the visual convention
// of ordered pools plotted left-to-right.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K
// parameters — Bowley is a three-hinge fold that consumes only
// the interior triple but still names the whole-pool count/cells
// for reader context.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.216):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolCoefficientOfRangeSection
// (P11.213) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
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
// SKEWNESS (this module) → per-pair hot-cells GRANULAR (P11.139).
// Bowley sits IMMEDIATELY BELOW the P11.213 COR bounded-dispersion
// tail so the BOUNDED / INTERIOR-MASS group (QCD + Bowley) sits
// adjacent to the BOUNDED / ENDPOINT sibling (COR), letting the
// reader spot the endpoint-vs-interior contrast on both
// DISPERSION and ASYMMETRY axes in one visual scan. Bowley
// separately pairs with the whole-pool P11.203 skewness surface
// as the BOUNDED / INTERIOR-MASS complement to that surface's
// UNBOUNDED / WHOLE-POOL read — the two skewness surfaces are
// designed to be scanned as a pair on the ASYMMETRY axis the
// same way P11.211 QCD + P11.213 COR are scanned as a pair on
// the DISPERSION axis.

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
type BowleyLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "symmetric"
  | "right_leaning"
  | "left_leaning"
  | "strong_right"
  | "strong_left";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Symmetric zero-centred band edges. 0.1 / 0.3 are the classroom
// Bowley thresholds (Kendall & Stuart §2.20). Deliberately tighter
// than the P11.203 |g1| 0.5 edge because Bowley's bounded [-1, +1]
// codomain makes 0.5 an extreme value — 0.1 / 0.3 keep the label
// vocabulary discriminating across real pools.
const SYMMETRIC_BOWLEY_ABS_MAX = 0.1;
const STRONG_BOWLEY_ABS_MIN = 0.3;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const BOWLEY_DECIMALS = 4;

// Threshold below which Tukey exclusive hinges collapse to endpoints
// which would duplicate the P11.181 range / P11.185 top1/bot1 /
// P11.213 COR endpoint surfaces. Bumped to 4 so the Bowley surface
// is a distinct interior-mass asymmetry read, matching the
// P11.207 IQR / P11.209 IQR RATIO / P11.211 QCD floor.
const MIN_POOL_COUNT_FOR_BOWLEY = 4;

export interface PerTransitionMagnitudeTop3PoolBowleySkewnessBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_q1_cells: number | null;
  readonly partner_q2_cells: number | null;
  readonly partner_q3_cells: number | null;
  readonly partner_bowley: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_q1_cells: number | null;
  readonly metric_q2_cells: number | null;
  readonly metric_q3_cells: number | null;
  readonly metric_bowley: number | null;
}

export interface PerTransitionMagnitudeTop3PoolBowleySkewnessBands {
  readonly small: PerTransitionMagnitudeTop3PoolBowleySkewnessBand;
  readonly medium: PerTransitionMagnitudeTop3PoolBowleySkewnessBand;
  readonly large: PerTransitionMagnitudeTop3PoolBowleySkewnessBand;
}

export interface PerTransitionMagnitudeTop3PoolBowleySkewnessEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolBowleySkewnessBands;
}

export interface PerTransitionMagnitudeTop3PoolBowleySkewnessMap {
  readonly improved: PerTransitionMagnitudeTop3PoolBowleySkewnessEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolBowleySkewnessEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolBowleySkewnessEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolBowleySkewnessEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_bowley: number;
  readonly symmetric_bowley_abs_max: number;
  readonly strong_bowley_abs_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolBowleySkewnessMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n. Same
// convention as P11.195 median/mean ratio + P11.197 mean-median
// absolute gap + P11.201 MADm + P11.207 IQR so the median definition
// is shared across every median-consuming sibling.
function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1/Q3 hinges: for odd n exclude the central value
// then take the median of each half; for even n split at the midpoint
// and take the median of each half. Standard "Method 1" from every
// intro-stats text (also matches R quantile type=1 default). Same
// convention as P11.207 IQR / P11.209 IQR RATIO / P11.211 QCD so
// the hinge triple is shared across every interior-mass sibling.
function tukeyHinges(sorted: number[]): {
  q1: number;
  q2: number;
  q3: number;
} {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  const upper = n % 2 === 1 ? sorted.slice(half + 1) : sorted.slice(half);
  return {
    q1: medianOfSorted(lower),
    q2: medianOfSorted(sorted),
    q3: medianOfSorted(upper),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  q1_cells: number | null;
  q2_cells: number | null;
  q3_cells: number | null;
  bowley: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_BOWLEY || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      q1_cells: null,
      q2_cells: null,
      q3_cells: null,
      bowley: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { q1, q2, q3 } = tukeyHinges(sorted);
  // Degenerate interior (Q3 == Q1) — the box has zero width so the
  // Bowley denominator is zero. Record the hinges so a reader can see
  // the flat interior but return bowley null with a distinct
  // "degenerate" label downstream (structural indeterminacy, not a
  // measured symmetric verdict).
  if (q3 === q1) {
    return {
      pool_count,
      pool_cells,
      q1_cells: roundTo(q1, BOWLEY_DECIMALS),
      q2_cells: roundTo(q2, BOWLEY_DECIMALS),
      q3_cells: roundTo(q3, BOWLEY_DECIMALS),
      bowley: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    q1_cells: roundTo(q1, BOWLEY_DECIMALS),
    q2_cells: roundTo(q2, BOWLEY_DECIMALS),
    q3_cells: roundTo(q3, BOWLEY_DECIMALS),
    bowley: roundTo((q3 + q1 - 2 * q2) / (q3 - q1), BOWLEY_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolBowleySkewnessBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_q1_cells: partner.q1_cells,
    partner_q2_cells: partner.q2_cells,
    partner_q3_cells: partner.q3_cells,
    partner_bowley: partner.bowley,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_q1_cells: metric.q1_cells,
    metric_q2_cells: metric.q2_cells,
    metric_q3_cells: metric.q3_cells,
    metric_bowley: metric.bowley,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolBowleySkewnessEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness {
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
    min_pool_count_for_bowley: MIN_POOL_COUNT_FOR_BOWLEY,
    symmetric_bowley_abs_max: SYMMETRIC_BOWLEY_ABS_MAX,
    strong_bowley_abs_min: STRONG_BOWLEY_ABS_MIN,
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

function labelForBowley(
  pool_count: number,
  q1: number | null,
  q3: number | null,
  bowley: number | null,
  min_pool_count_for_bowley: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): BowleyLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_bowley) return "small_pool";
  if (bowley === null || q1 === null || q3 === null) return "degenerate";
  if (bowley >= strong_abs_min) return "strong_right";
  if (bowley <= -strong_abs_min) return "strong_left";
  if (bowley >= symmetric_abs_max) return "right_leaning";
  if (bowley <= -symmetric_abs_max) return "left_leaning";
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

function renderBowleyCell(
  pool_count: number,
  pool_cells: number,
  q1: number | null,
  q2: number | null,
  q3: number | null,
  bowley: number | null,
  min_pool_count_for_bowley: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForBowley(
    pool_count,
    q1,
    q3,
    bowley,
    min_pool_count_for_bowley,
    symmetric_abs_max,
    strong_abs_min,
  );
  const bowleyText = bowley === null ? "-" : bowley.toFixed(3);
  const q1Text = q1 === null ? "-" : q1.toFixed(2);
  const q2Text = q2 === null ? "-" : q2.toFixed(2);
  const q3Text = q3 === null ? "-" : q3.toFixed(2);
  return `bs ${bowleyText} (Q1 ${q1Text}, Q2 ${q2Text}, Q3 ${q3Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_bowley,
    symmetric_bowley_abs_max,
    strong_bowley_abs_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderBowleyCell(band.partner_pool_count, band.partner_pool_cells, band.partner_q1_cells, band.partner_q2_cells, band.partner_q3_cells, band.partner_bowley, min_pool_count_for_bowley, symmetric_bowley_abs_max, strong_bowley_abs_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderBowleyCell(band.metric_pool_count, band.metric_pool_cells, band.metric_q1_cells, band.metric_q2_cells, band.metric_q3_cells, band.metric_bowley, min_pool_count_for_bowley, symmetric_bowley_abs_max, strong_bowley_abs_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool BOWLEY SKEWNESS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">BOUNDED INTERIOR-MASS asymmetry scalar over the P11.161 pool &mdash; the three-hinge triple (Q1, Q2, Q3) folds into ONE SIGNED normalised asymmetry read on [-1, +1]: bs = (Q3 + Q1 - 2*Q2) / (Q3 - Q1). Bounded normalised complement to the P11.203 whole-pool Fisher-Pearson g1 (unbounded in (-&infin;, +&infin;)) &mdash; interior-only counterpart that ignores endpoints so a single tail outlier cannot move the scalar. Pairs on the ASYMMETRY axis the same way P11.211 QCD + P11.213 COR pair on the DISPERSION axis: read side-by-side to distinguish "asymmetry driven by interior distribution" (both non-zero) from "asymmetry driven by a tail outlier" (g1 non-zero, bs ~0). Values in [-1, +1] &mdash; positive = right-tail heavy (Q2 towards Q1), negative = left-tail heavy (Q2 towards Q3), zero = interior symmetric around the median. Labels: small_pool = pool_count &lt; ${min_pool_count_for_bowley} (Tukey hinges collapse to endpoints, duplicating the range/top1-bot1/COR endpoint surfaces), degenerate = Q3 == Q1 (flat interior, bs denominator zero — structural indeterminacy), symmetric = |bs| &lt; ${symmetric_bowley_abs_max} (Q2 within 45-55% of the box), right_leaning = bs in [${symmetric_bowley_abs_max}, ${strong_bowley_abs_min}) (mild positive skew), left_leaning = bs in (-${strong_bowley_abs_min}, -${symmetric_bowley_abs_max}] (mild negative skew), strong_right = bs &ge; ${strong_bowley_abs_min} (strong positive skew), strong_left = bs &le; -${strong_bowley_abs_min} (strong negative skew). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + bowley null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner bowley</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI bowley</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
