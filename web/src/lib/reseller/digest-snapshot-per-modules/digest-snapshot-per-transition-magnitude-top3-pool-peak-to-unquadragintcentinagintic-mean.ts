// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.536).
//
// WHOLE-POOL RANGE-AGAINST-UNQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's UNQUADRAGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 141, M_141):
//
//   ptuqcnm = (max - min) / unquadragintcentinagintic_mean
//
// where unquadragintcentinagintic_mean = ((sum x_i^141) / n)^(1/141).
// Reads the peak spread against the UNQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-141) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.534 PTQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-FIRST power before averaging lifts the
// anchor MORE than raising to the hundred-and-fortieth does,
// dampening the ratio against the range even harder. Second entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTUQCNM's unique DISPERSION-axis contribution: reads range in units
// of the UNQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-141) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113,
// quattuordecicentinagintic M_114, quindecicentinagintic M_115,
// sedecicentinagintic M_116, septdecicentinagintic M_117,
// octodecicentinagintic M_118, novedecicentinagintic M_119,
// vigintcentinagintic M_120, unvigintcentinagintic M_121,
// duovigintcentinagintic M_122, trevigintcentinagintic M_123,
// quattuorvigintcentinagintic M_124, quinvigintcentinagintic M_125,
// sesvigintcentinagintic M_126, septvigintcentinagintic M_127,
// octvigintcentinagintic M_128, novemvigintcentinagintic M_129,
// trigintcentinagintic M_130, untrigintcentinagintic M_131,
// duotrigintcentinagintic M_132, tretrigintcentinagintic M_133,
// quattuortrigintcentinagintic M_134,
// quintrigintcentinagintic M_135,
// sestrigintcentinagintic M_136,
// septtrigintcentinagintic M_137,
// octotrigintcentinagintic M_138,
// novemtrigintcentinagintic M_139,
// quadragintcentinagintic M_140) power-mean
// DUOSEPTUAGINTUPLET into a
// TRESSEPTUAGINTUPLET with the M_141
// unquadragintcentinagintic mean -- second step into the FOURTH DOZEN
// of the triple-digit family opened at PTQCNM (M_140). By the Power
// Mean inequality M_141 >= M_140, so
// unquadragintcentinagintic_mean >= quadragintcentinagintic_mean
// and ptuqcnm <= ptqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unquadragintcentinagintic_mean approaches x_max / n^(1/141), so
// ptuqcnm approaches n^(1/141) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/141) ~= 1.0165, for n=20 ~= 1.0215, for n=30 ~= 1.0244,
// for n=40 ~= 1.0265, for n=50 ~= 1.0281, for n=60 ~= 1.0295,
// for n=70 ~= 1.0306, for n=80 ~= 1.0316, for n=85 ~= 1.0320,
// for n=89 ~= 1.0323, for n=90 ~= 1.0324 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/141) ~= 1.0332)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/141) ~= 1.0332, and the pool100
// [1x99, 100] reference reads 1.0229 spread (further absorbed
// from PTQCNM's 1.0231 spread landing -- TWO 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_141.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unquadragintcentinagintic_mean = k,
//                                     range 0, ptuqcnm 0 (tight).
//   * uniform ramp [1..10]          -> UQCNM ~= 9.8377, range 9,
//                                     ptuqcnm ~= 0.9148 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQCNM 0.9149 at M_140).
//   * upper-outlier [1x9, 10]       -> UQCNM ~= 9.8377, range 9,
//                                     ptuqcnm ~= 0.9148 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_141;
//                                     the M_140 joint collapse at
//                                     0.9149 persists at M_141 as a
//                                     joint 0.9148 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/141) ~ 9.8377 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> UQCNM ~= 4.9432, range 4,
//                                     ptuqcnm ~= 0.8092 (tight --
//                                     JOINT with PTQCNM 0.8092 at
//                                     M_140).
//   * 50/50 split [1x5, 10x5]       -> UQCNM ~= 9.9518, range 9,
//                                     ptuqcnm ~= 0.9044 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQCNM 0.9045 at M_140).
//   * extreme outlier [1x9, 100]    -> UQCNM ~= 98.3771, range 99,
//                                     ptuqcnm ~= 1.0063 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/141) ~ 1.0165 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQCNM 1.0064 at M_140).
//   * two-partner [1, 9]            -> UQCNM ~= 8.9561, range 8,
//                                     ptuqcnm ~= 0.8933 (tight --
//                                     JOINT with PTQCNM 0.8933 at
//                                     M_140).
//   * two-partner [1, 100]          -> UQCNM ~= 99.5095, range 99,
//                                     ptuqcnm ~= 0.9949 (TIGHT --
//                                     JOINT with PTQCNM 0.9949 at
//                                     M_140).
//   * small [10, 1, 1]              -> UQCNM ~= 9.9224, range 9,
//                                     ptuqcnm ~= 0.9070 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQCNM 0.9071 at M_140).
//   * pool_count=100 [1x99, 100]    -> UQCNM ~= 96.7830, range 99,
//                                     ptuqcnm ~= 1.0229 (SPREAD --
//                                     FURTHER ABSORBED from PTQCNM
//                                     M_140's 1.0231 spread; the
//                                     100-partner asymptote
//                                     100^(1/141) ~ 1.0332 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_141 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptuqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unquadragintcentinagintic_mean == 0
//   * tight                ptuqcnm < 1.005
//   * spread               ptuqcnm in [1.005, 1.09)
//   * wide                 ptuqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptuqcnm_max /
// wide_ptuqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.537):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanSection
// (P11.535) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unquadragintcentinagintic-center
// after the P11.535 range-against-quadragintcentinagintic-center landing.
//
// Naming: unquadragintcentinagintic = un (1) + quadragint (40) +
// centinagintic (100) following the unvigintcentinagintic (M_121) +
// untrigintcentinagintic (M_131) systematic pattern; abbreviation
// PTUQCNM (P-T-Un-Quadragint-Centi-Nagintic-M) is distinct from
// PTUCNM (M_101 unicentinagintic) by the extra 'Q' for the 'quadragint'
// segment, from PTUVCNM (M_121 unvigintcentinagintic) by the 'Q'
// (quadragint) vs 'V' (vigint) segment, and from PTUTCNM (M_131
// untrigintcentinagintic) by the 'Q' (quadragint) vs 'T' (trigint)
// segment.

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
type PtuqcnmLabel =
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

// Bands on raw ptuqcnm (fixed cutoffs since unquadragintcentinagintic_mean
// scales with cell counts and typical unquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_141 is 0.9148
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0166
// (M_140) to 1.0165 (M_141), 20-partner drops from 1.0216 to 1.0215,
// 30-partner drops from 1.0246 to 1.0244, 40-partner drops from
// 1.0267 to 1.0265, 50-partner drops from 1.0283 to 1.0281,
// 60-partner drops from 1.0297 to 1.0295, 70-partner drops from
// 1.0308 to 1.0306, 80-partner drops from 1.0318 to 1.0316,
// 85-partner drops from 1.0322 to 1.0320, 89-partner drops from
// 1.0326 to 1.0323, 90-partner drops from 1.0327 to 1.0324 -- so
// pool_count >= 100 (100^(1/141) ~ 1.0332) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQCNM 1.0231 spread to PTUQCNM 1.0229 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUQCNM_MAX = 1.005;
const WIDE_PTUQCNM_MIN = 1.09;

// PTUQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuqcnm_max: number;
  readonly wide_ptuqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanMap;
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

// Peak-to-unquadragintcentinagintic-mean of a discrete distribution:
//   PTUQCNM = (max - min) / unquadragintcentinagintic_mean
// where unquadragintcentinagintic_mean = ((sum x_i^141) / n)^(1/141).
// Returns null on empty, solo, and degenerate (zero
// unquadragintcentinagintic_mean or non-finite hundred-and-forty-first-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^141 = x^128 * x^8 * x^4 * x = p128 * oct * quad * v --
    // (128 + 8 + 4 + 1) decomposition so the fold reuses the p128 rung
    // shared with the M_128..M_140 siblings and multiplies by oct * quad
    // * v to hit the next order.
    hundredFortyFirstSum += p128 * oct * quad * v;
  }
  if (
    !Number.isFinite(hundredFortyFirstSum) ||
    hundredFortyFirstSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquadragintcentinagintic_mean: null,
    };
  }
  const unquadragintcentinagintic_mean = Math.pow(
    hundredFortyFirstSum / pool_count,
    1 / 141,
  );
  if (
    !Number.isFinite(unquadragintcentinagintic_mean) ||
    unquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptuqcnm = range / unquadragintcentinagintic_mean;
  const clamped = ptuqcnm < 0 ? 0 : ptuqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_unquadragintcentinagintic_mean: roundTo(clamped, PTUQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unquadragintcentinagintic_mean:
      partner.peak_to_unquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unquadragintcentinagintic_mean:
      metric.peak_to_unquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMean {
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
    tight_ptuqcnm_max: TIGHT_PTUQCNM_MAX,
    wide_ptuqcnm_min: WIDE_PTUQCNM_MIN,
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

function labelForPtuqcnm(
  pool_count: number,
  pool_cells: number,
  ptuqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtuqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuqcnm === null) return "degenerate";
  if (ptuqcnm >= wide_min) return "wide";
  if (ptuqcnm < tight_max) return "tight";
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

function renderPtuqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptuqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuqcnm(
    pool_count,
    pool_cells,
    ptuqcnm,
    tight_max,
    wide_min,
  );
  const ptuqcnmText = ptuqcnm === null ? "-" : ptuqcnm.toFixed(4);
  return `PTUQCNM ${ptuqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuqcnm_max, wide_ptuqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unquadragintcentinagintic_mean, tight_ptuqcnm_max, wide_ptuqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unquadragintcentinagintic_mean, tight_ptuqcnm_max, wide_ptuqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuqcnm = (max - min) / unquadragintcentinagintic_mean where unquadragintcentinagintic_mean = ((sum x_i^141) / n)^(1/141). Reads the pool's total RANGE in units of its UNQUADRAGINTCENTINAGINTIC (power-mean-of-order-141, M_141) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.534 PTQCNM because raising to the ONE-HUNDRED-AND-FORTY-FIRST power lifts the anchor MORE than raising to the hundred-and-fortieth does. Unique DISPERSION-axis contribution extends the (harmonic..quadragintcentinagintic) power-mean DUOSEPTUAGINTUPLET into a TRESSEPTUAGINTUPLET with the M_141 unquadragintcentinagintic mean, second step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuqcnm approaches n^(1/141) so 10-partner pools cap near 1.0165, 20-partner near 1.0215, 30-partner near 1.0244, 40-partner near 1.0265, 50-partner near 1.0281, 60-partner near 1.0295, 70-partner near 1.0306, 80-partner near 1.0316, 85-partner near 1.0320, 89-partner near 1.0323 and 90-partner near 1.0324 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/141) ~= 1.0332) are required to escape into wide with a modest outlier. Composite regime labels: PTUQCNM tight + PTQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUQCNM 0.9148 tight -- rejoining the uniform ramp's 0.9148 for the sixtieth tick in the sequence after PTQCNM's 0.9149 joint bucket at M_140); PTUQCNM spread + PTQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUQCNM 1.0063 spread -- one 4-decimal tick below PTQCNM's 1.0064); PTUQCNM spread + PTQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_141 ([1x99, 100] reads 1.0229 spread after M_140's 1.0231 spread landing); PTUQCNM tight + PTQCNM tight = ISOLATED HIGH PARTNER absorption HOLDS at M_141 ([1, 100] reads 0.9949 tight, joint with M_140's 0.9949 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptuqcnm &lt; ${tight_ptuqcnm_max}, spread = ptuqcnm in [${tight_ptuqcnm_max}, ${wide_ptuqcnm_min}), wide = ptuqcnm &ge; ${wide_ptuqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
