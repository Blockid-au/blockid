// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.538).
//
// WHOLE-POOL RANGE-AGAINST-DUOQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's DUOQUADRAGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 142, M_142):
//
//   ptdqcnm = (max - min) / duoquadragintcentinagintic_mean
//
// where duoquadragintcentinagintic_mean = ((sum x_i^142) / n)^(1/142).
// Reads the peak spread against the DUOQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-142) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.536 PTUQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-SECOND power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-first does,
// dampening the ratio against the range even harder. Third entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTDQCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUOQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-142) CENTER.
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
// unquadragintcentinagintic M_141) power-mean
// TRESSEPTUAGINTUPLET into a
// QUATTUORSEPTUAGINTUPLET with the M_142
// duoquadragintcentinagintic mean -- third step into the FOURTH DOZEN
// of the triple-digit family opened at PTQCNM (M_140). By the Power
// Mean inequality M_142 >= M_141, so
// duoquadragintcentinagintic_mean >= unquadragintcentinagintic_mean
// and ptdqcnm <= ptuqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duoquadragintcentinagintic_mean approaches x_max / n^(1/142), so
// ptdqcnm approaches n^(1/142) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/142) ~= 1.0163, for n=20 ~= 1.0213, for n=30 ~= 1.0242,
// for n=40 ~= 1.0263, for n=50 ~= 1.0279, for n=60 ~= 1.0293,
// for n=70 ~= 1.0304, for n=80 ~= 1.0313, for n=85 ~= 1.0318,
// for n=89 ~= 1.0321, for n=90 ~= 1.0322 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/142) ~= 1.0330)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/142) ~= 1.0330, and the pool100
// [1x99, 100] reference reads 1.0226 spread (further absorbed
// from PTUQCNM's 1.0229 spread landing -- THREE 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_142.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duoquadragintcentinagintic_mean = k,
//                                     range 0, ptdqcnm 0 (tight).
//   * uniform ramp [1..10]          -> DQCNM ~= 9.8392, range 9,
//                                     ptdqcnm ~= 0.9147 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQCNM 0.9148 at M_141).
//   * upper-outlier [1x9, 10]       -> DQCNM ~= 9.8392, range 9,
//                                     ptdqcnm ~= 0.9147 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_142;
//                                     the M_141 joint collapse at
//                                     0.9148 advances one tick to a
//                                     joint 0.9147 bucket at M_142
//                                     because both anchors continue to
//                                     approach 10 / 10^(1/142) ~ 9.8392
//                                     in lock-step).
//   * two-shoulders [1x8, 5x2]      -> DQCNM ~= 4.9436, range 4,
//                                     ptdqcnm ~= 0.8091 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQCNM 0.8092 at M_141).
//   * 50/50 split [1x5, 10x5]       -> DQCNM ~= 9.9513, range 9,
//                                     ptdqcnm ~= 0.9044 (tight --
//                                     JOINT with PTUQCNM 0.9044 at
//                                     M_141).
//   * extreme outlier [1x9, 100]    -> DQCNM ~= 98.3915, range 99,
//                                     ptdqcnm ~= 1.0062 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/142) ~ 1.0163 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQCNM 1.0063 at M_141).
//   * two-partner [1, 9]            -> DQCNM ~= 8.9562, range 8,
//                                     ptdqcnm ~= 0.8932 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQCNM 0.8933 at M_141).
//   * two-partner [1, 100]          -> DQCNM ~= 99.5131, range 99,
//                                     ptdqcnm ~= 0.9948 (TIGHT --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQCNM 0.9949 at M_141).
//   * small [10, 1, 1]              -> DQCNM ~= 9.9229, range 9,
//                                     ptdqcnm ~= 0.9070 (tight --
//                                     JOINT with PTUQCNM 0.9070 at
//                                     M_141).
//   * pool_count=100 [1x99, 100]    -> DQCNM ~= 96.8089, range 99,
//                                     ptdqcnm ~= 1.0226 (SPREAD --
//                                     FURTHER ABSORBED from PTUQCNM
//                                     M_141's 1.0229 spread; the
//                                     100-partner asymptote
//                                     100^(1/142) ~ 1.0330 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_142 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptdqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duoquadragintcentinagintic_mean == 0
//   * tight                ptdqcnm < 1.005
//   * spread               ptdqcnm in [1.005, 1.09)
//   * wide                 ptdqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdqcnm_max /
// wide_ptdqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.539):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnquadragintcentinaginticMeanSection
// (P11.537) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duoquadragintcentinagintic-center
// after the P11.537 range-against-unquadragintcentinagintic-center landing.
//
// Naming: duoquadragintcentinagintic = duo (2) + quadragint (40) +
// centinagintic (100) following the duovigintcentinagintic (M_122) +
// duotrigintcentinagintic (M_132) systematic pattern; abbreviation
// PTDQCNM (P-T-Duo-Quadragint-Centi-Nagintic-M) is distinct from
// PTDCNM (M_102 ducentinagintic) by the extra 'Q' for the 'quadragint'
// segment, from PTDVCNM (M_122 duovigintcentinagintic) by the 'Q'
// (quadragint) vs 'V' (vigint) segment, and from PTDTCNM (M_132
// duotrigintcentinagintic) by the 'Q' (quadragint) vs 'T' (trigint)
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
type PtdqcnmLabel =
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

// Bands on raw ptdqcnm (fixed cutoffs since duoquadragintcentinagintic_mean
// scales with cell counts and typical duoquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_142 is 0.9147
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0165
// (M_141) to 1.0163 (M_142), 20-partner drops from 1.0215 to 1.0213,
// 30-partner drops from 1.0244 to 1.0242, 40-partner drops from
// 1.0265 to 1.0263, 50-partner drops from 1.0281 to 1.0279,
// 60-partner drops from 1.0295 to 1.0293, 70-partner drops from
// 1.0306 to 1.0304, 80-partner drops from 1.0316 to 1.0313,
// 85-partner drops from 1.0320 to 1.0318, 89-partner drops from
// 1.0323 to 1.0321, 90-partner drops from 1.0324 to 1.0322 -- so
// pool_count >= 100 (100^(1/142) ~ 1.0330) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTUQCNM 1.0229 spread to PTDQCNM 1.0226 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDQCNM_MAX = 1.005;
const WIDE_PTDQCNM_MIN = 1.09;

// PTDQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duoquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duoquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdqcnm_max: number;
  readonly wide_ptdqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanMap;
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

// Peak-to-duoquadragintcentinagintic-mean of a discrete distribution:
//   PTDQCNM = (max - min) / duoquadragintcentinagintic_mean
// where duoquadragintcentinagintic_mean = ((sum x_i^142) / n)^(1/142).
// Returns null on empty, solo, and degenerate (zero
// duoquadragintcentinagintic_mean or non-finite hundred-and-forty-second-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duoquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^142 = x^128 * x^8 * x^4 * x^2 = p128 * oct * quad * sq --
    // (128 + 8 + 4 + 2) decomposition so the fold reuses the p128 rung
    // shared with the M_128..M_141 siblings and multiplies by oct * quad
    // * sq to hit the next order.
    hundredFortySecondSum += p128 * oct * quad * sq;
  }
  if (
    !Number.isFinite(hundredFortySecondSum) ||
    hundredFortySecondSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquadragintcentinagintic_mean: null,
    };
  }
  const duoquadragintcentinagintic_mean = Math.pow(
    hundredFortySecondSum / pool_count,
    1 / 142,
  );
  if (
    !Number.isFinite(duoquadragintcentinagintic_mean) ||
    duoquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdqcnm = range / duoquadragintcentinagintic_mean;
  const clamped = ptdqcnm < 0 ? 0 : ptdqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duoquadragintcentinagintic_mean: roundTo(clamped, PTDQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duoquadragintcentinagintic_mean:
      partner.peak_to_duoquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duoquadragintcentinagintic_mean:
      metric.peak_to_duoquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMean {
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
    tight_ptdqcnm_max: TIGHT_PTDQCNM_MAX,
    wide_ptdqcnm_min: WIDE_PTDQCNM_MIN,
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

function labelForPtdqcnm(
  pool_count: number,
  pool_cells: number,
  ptdqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdqcnm === null) return "degenerate";
  if (ptdqcnm >= wide_min) return "wide";
  if (ptdqcnm < tight_max) return "tight";
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

function renderPtdqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdqcnm(
    pool_count,
    pool_cells,
    ptdqcnm,
    tight_max,
    wide_min,
  );
  const ptdqcnmText = ptdqcnm === null ? "-" : ptdqcnm.toFixed(4);
  return `PTDQCNM ${ptdqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdqcnm_max, wide_ptdqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duoquadragintcentinagintic_mean, tight_ptdqcnm_max, wide_ptdqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duoquadragintcentinagintic_mean, tight_ptdqcnm_max, wide_ptdqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdqcnm = (max - min) / duoquadragintcentinagintic_mean where duoquadragintcentinagintic_mean = ((sum x_i^142) / n)^(1/142). Reads the pool's total RANGE in units of its DUOQUADRAGINTCENTINAGINTIC (power-mean-of-order-142, M_142) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.536 PTUQCNM because raising to the ONE-HUNDRED-AND-FORTY-SECOND power lifts the anchor MORE than raising to the hundred-and-forty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unquadragintcentinagintic) power-mean TRESSEPTUAGINTUPLET into a QUATTUORSEPTUAGINTUPLET with the M_142 duoquadragintcentinagintic mean, third step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdqcnm approaches n^(1/142) so 10-partner pools cap near 1.0163, 20-partner near 1.0213, 30-partner near 1.0242, 40-partner near 1.0263, 50-partner near 1.0279, 60-partner near 1.0293, 70-partner near 1.0304, 80-partner near 1.0313, 85-partner near 1.0318, 89-partner near 1.0321 and 90-partner near 1.0322 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/142) ~= 1.0330) are required to escape into wide with a modest outlier. Composite regime labels: PTDQCNM tight + PTUQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDQCNM 0.9147 tight -- rejoining the uniform ramp's 0.9147 for the sixty-first tick in the sequence after PTUQCNM's 0.9148 joint bucket at M_141); PTDQCNM spread + PTUQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDQCNM 1.0062 spread -- one 4-decimal tick below PTUQCNM's 1.0063); PTDQCNM spread + PTUQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_142 ([1x99, 100] reads 1.0226 spread after M_141's 1.0229 spread landing); PTDQCNM tight + PTUQCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one tick at M_142 ([1, 100] reads 0.9948 tight, down from M_141's 0.9949 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duoquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptdqcnm &lt; ${tight_ptdqcnm_max}, spread = ptdqcnm in [${tight_ptdqcnm_max}, ${wide_ptdqcnm_min}), wide = ptdqcnm &ge; ${wide_ptdqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
