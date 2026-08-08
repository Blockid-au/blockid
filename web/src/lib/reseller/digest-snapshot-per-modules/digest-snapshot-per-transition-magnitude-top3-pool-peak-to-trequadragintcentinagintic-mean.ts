// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TREQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.540).
//
// WHOLE-POOL RANGE-AGAINST-TREQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's TREQUADRAGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 143, M_143):
//
//   pttqcnm = (max - min) / trequadragintcentinagintic_mean
//
// where trequadragintcentinagintic_mean = ((sum x_i^143) / n)^(1/143).
// Reads the peak spread against the TREQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-143) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.538 PTDQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-THIRD power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-second does,
// dampening the ratio against the range even harder. Fourth entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTTQCNM's unique DISPERSION-axis contribution: reads range in units
// of the TREQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-143) CENTER.
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
// quadragintcentinagintic M_140,
// unquadragintcentinagintic M_141,
// duoquadragintcentinagintic M_142) power-mean
// QUATTUORSEPTUAGINTUPLET into a
// QUINSEPTUAGINTUPLET with the M_143
// trequadragintcentinagintic mean -- fourth step into the FOURTH DOZEN
// of the triple-digit family opened at PTQCNM (M_140). By the Power
// Mean inequality M_143 >= M_142, so
// trequadragintcentinagintic_mean >= duoquadragintcentinagintic_mean
// and pttqcnm <= ptdqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trequadragintcentinagintic_mean approaches x_max / n^(1/143), so
// pttqcnm approaches n^(1/143) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/143) ~= 1.0162, for n=20 ~= 1.0212, for n=30 ~= 1.0241,
// for n=40 ~= 1.0261, for n=50 ~= 1.0277, for n=60 ~= 1.0290,
// for n=70 ~= 1.0302, for n=80 ~= 1.0311, for n=85 ~= 1.0316,
// for n=89 ~= 1.0319, for n=90 ~= 1.0320 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/143) ~= 1.0327)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/143) ~= 1.0327, and the pool100
// [1x99, 100] reference reads 1.0224 spread (further absorbed
// from PTDQCNM's 1.0226 spread landing -- TWO 4-decimal ticks of
// absorption at M_143) because the asymptote gap at n=100 has
// narrowed further and the [1x99, 100] pool sits deeper inside the
// spread band at M_143.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trequadragintcentinagintic_mean = k,
//                                     range 0, pttqcnm 0 (tight).
//   * uniform ramp [1..10]          -> TQCNM ~= 9.8403, range 9,
//                                     pttqcnm ~= 0.9146 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDQCNM 0.9147 at M_142).
//   * upper-outlier [1x9, 10]       -> TQCNM ~= 9.8403, range 9,
//                                     pttqcnm ~= 0.9146 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_143;
//                                     the M_142 joint collapse at
//                                     0.9147 advances one tick to a
//                                     joint 0.9146 bucket at M_143
//                                     because both anchors continue to
//                                     approach 10 / 10^(1/143) ~ 9.8403
//                                     in lock-step).
//   * two-shoulders [1x8, 5x2]      -> TQCNM ~= 4.9440, range 4,
//                                     pttqcnm ~= 0.8091 (tight --
//                                     JOINT with PTDQCNM 0.8091 at
//                                     M_142).
//   * 50/50 split [1x5, 10x5]       -> TQCNM ~= 9.9516, range 9,
//                                     pttqcnm ~= 0.9044 (tight --
//                                     JOINT with PTDQCNM 0.9044 at
//                                     M_142).
//   * extreme outlier [1x9, 100]    -> TQCNM ~= 98.4027, range 99,
//                                     pttqcnm ~= 1.0061 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/143) ~ 1.0162 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTDQCNM 1.0062 at M_142).
//   * two-partner [1, 9]            -> TQCNM ~= 8.9565, range 8,
//                                     pttqcnm ~= 0.8932 (tight --
//                                     JOINT with PTDQCNM 0.8932 at
//                                     M_142).
//   * two-partner [1, 100]          -> TQCNM ~= 99.5165, range 99,
//                                     pttqcnm ~= 0.9948 (TIGHT --
//                                     JOINT with PTDQCNM 0.9948 at
//                                     M_142).
//   * small [10, 1, 1]              -> TQCNM ~= 9.9235, range 9,
//                                     pttqcnm ~= 0.9069 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDQCNM 0.9070 at M_142).
//   * pool_count=100 [1x99, 100]    -> TQCNM ~= 96.8309, range 99,
//                                     pttqcnm ~= 1.0224 (SPREAD --
//                                     FURTHER ABSORBED from PTDQCNM
//                                     M_142's 1.0226 spread; the
//                                     100-partner asymptote
//                                     100^(1/143) ~ 1.0327 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_143 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw pttqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trequadragintcentinagintic_mean == 0
//   * tight                pttqcnm < 1.005
//   * spread               pttqcnm in [1.005, 1.09)
//   * wide                 pttqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttqcnm_max /
// wide_pttqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.541):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanSection
// (P11.539) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trequadragintcentinagintic-center
// after the P11.539 range-against-duoquadragintcentinagintic-center landing.
//
// Naming: trequadragintcentinagintic = tre (3) + quadragint (40) +
// centinagintic (100) following the trevigintcentinagintic (M_123) +
// tretrigintcentinagintic (M_133) systematic pattern; abbreviation
// PTTQCNM (P-T-Tre-Quadragint-Centi-Nagintic-M) is distinct from
// PTTCNM (M_103 trecentinagintic) by the extra 'Q' for the 'quadragint'
// segment, from PTTVCNM (M_123 trevigintcentinagintic) by the 'Q'
// (quadragint) vs 'V' (vigint) segment, and from PTTTCNM (M_133
// tretrigintcentinagintic) by the 'Q' (quadragint) vs 'T' (trigint)
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
type PttqcnmLabel =
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

// Bands on raw pttqcnm (fixed cutoffs since trequadragintcentinagintic_mean
// scales with cell counts and typical trequadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_143 is 0.9146
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0163
// (M_142) to 1.0162 (M_143), 20-partner drops from 1.0213 to 1.0212,
// 30-partner drops from 1.0242 to 1.0241, 40-partner drops from
// 1.0263 to 1.0261, 50-partner drops from 1.0279 to 1.0277,
// 60-partner drops from 1.0293 to 1.0290, 70-partner drops from
// 1.0304 to 1.0302, 80-partner drops from 1.0313 to 1.0311,
// 85-partner drops from 1.0318 to 1.0316, 89-partner drops from
// 1.0321 to 1.0319, 90-partner drops from 1.0322 to 1.0320 -- so
// pool_count >= 100 (100^(1/143) ~ 1.0327) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTDQCNM 1.0226 spread to PTTQCNM 1.0224 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTQCNM_MAX = 1.005;
const WIDE_PTTQCNM_MIN = 1.09;

// PTTQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trequadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trequadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttqcnm_max: number;
  readonly wide_pttqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanMap;
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

// Peak-to-trequadragintcentinagintic-mean of a discrete distribution:
//   PTTQCNM = (max - min) / trequadragintcentinagintic_mean
// where trequadragintcentinagintic_mean = ((sum x_i^143) / n)^(1/143).
// Returns null on empty, solo, and degenerate (zero
// trequadragintcentinagintic_mean or non-finite hundred-and-forty-third-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trequadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^143 = x^128 * x^8 * x^4 * x^2 * x = p128 * oct * quad * sq * v --
    // (128 + 8 + 4 + 2 + 1) decomposition so the fold reuses the p128 rung
    // shared with the M_128..M_142 siblings and multiplies by oct * quad
    // * sq * v to hit the next order.
    hundredFortyThirdSum += p128 * oct * quad * sq * v;
  }
  if (
    !Number.isFinite(hundredFortyThirdSum) ||
    hundredFortyThirdSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequadragintcentinagintic_mean: null,
    };
  }
  const trequadragintcentinagintic_mean = Math.pow(
    hundredFortyThirdSum / pool_count,
    1 / 143,
  );
  if (
    !Number.isFinite(trequadragintcentinagintic_mean) ||
    trequadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttqcnm = range / trequadragintcentinagintic_mean;
  const clamped = pttqcnm < 0 ? 0 : pttqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_trequadragintcentinagintic_mean: roundTo(clamped, PTTQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trequadragintcentinagintic_mean:
      partner.peak_to_trequadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trequadragintcentinagintic_mean:
      metric.peak_to_trequadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMean {
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
    tight_pttqcnm_max: TIGHT_PTTQCNM_MAX,
    wide_pttqcnm_min: WIDE_PTTQCNM_MIN,
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

function labelForPttqcnm(
  pool_count: number,
  pool_cells: number,
  pttqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttqcnm === null) return "degenerate";
  if (pttqcnm >= wide_min) return "wide";
  if (pttqcnm < tight_max) return "tight";
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

function renderPttqcnmCell(
  pool_count: number,
  pool_cells: number,
  pttqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttqcnm(
    pool_count,
    pool_cells,
    pttqcnm,
    tight_max,
    wide_min,
  );
  const pttqcnmText = pttqcnm === null ? "-" : pttqcnm.toFixed(4);
  return `PTTQCNM ${pttqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttqcnm_max, wide_pttqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trequadragintcentinagintic_mean, tight_pttqcnm_max, wide_pttqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trequadragintcentinagintic_mean, tight_pttqcnm_max, wide_pttqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TREQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TREQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttqcnm = (max - min) / trequadragintcentinagintic_mean where trequadragintcentinagintic_mean = ((sum x_i^143) / n)^(1/143). Reads the pool's total RANGE in units of its TREQUADRAGINTCENTINAGINTIC (power-mean-of-order-143, M_143) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.538 PTDQCNM because raising to the ONE-HUNDRED-AND-FORTY-THIRD power lifts the anchor MORE than raising to the hundred-and-forty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duoquadragintcentinagintic) power-mean QUATTUORSEPTUAGINTUPLET into a QUINSEPTUAGINTUPLET with the M_143 trequadragintcentinagintic mean, fourth step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttqcnm approaches n^(1/143) so 10-partner pools cap near 1.0162, 20-partner near 1.0212, 30-partner near 1.0241, 40-partner near 1.0261, 50-partner near 1.0277, 60-partner near 1.0290, 70-partner near 1.0302, 80-partner near 1.0311, 85-partner near 1.0316, 89-partner near 1.0319 and 90-partner near 1.0320 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/143) ~= 1.0327) are required to escape into wide with a modest outlier. Composite regime labels: PTTQCNM tight + PTDQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTQCNM 0.9146 tight -- rejoining the uniform ramp's 0.9146 for the sixty-second tick in the sequence after PTDQCNM's 0.9147 joint bucket at M_142); PTTQCNM spread + PTDQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTQCNM 1.0061 spread -- one 4-decimal tick below PTDQCNM's 1.0062); PTTQCNM spread + PTDQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_143 ([1x99, 100] reads 1.0224 spread after M_142's 1.0226 spread landing -- two 4-decimal ticks of absorption); PTTQCNM tight + PTDQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_142 ([1, 100] reads 0.9948 tight, unchanged from M_142's 0.9948 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trequadragintcentinagintic_mean == 0 (guarded but unreachable), tight = pttqcnm &lt; ${tight_pttqcnm_max}, spread = pttqcnm in [${tight_pttqcnm_max}, ${wide_pttqcnm_min}), wide = pttqcnm &ge; ${wide_pttqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
