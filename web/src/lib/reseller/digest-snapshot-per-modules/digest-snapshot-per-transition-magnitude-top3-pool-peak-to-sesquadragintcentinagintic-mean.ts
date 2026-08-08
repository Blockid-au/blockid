// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.546).
//
// WHOLE-POOL RANGE-AGAINST-SESQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SESQUADRAGINTCENTINAGINTIC MEAN (power mean of
// order 146, M_146):
//
//   ptsqcnm = (max - min) / sesquadragintcentinagintic_mean
//
// where sesquadragintcentinagintic_mean = ((sum x_i^146) / n)^(1/146).
// Reads the peak spread against the SESQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-146) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.544 PTQIQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-SIXTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-fifth does,
// dampening the ratio against the range even harder. Sixth entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTSQCNM's unique DISPERSION-axis contribution: reads range in units
// of the SESQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-146)
// CENTER. Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
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
// duoquadragintcentinagintic M_142,
// trequadragintcentinagintic M_143,
// quattuorquadragintcentinagintic M_144,
// quinquadragintcentinagintic M_145) power-mean
// SESSEPTUAGINTUPLET into a
// SEPTSEPTUAGINTUPLET with the M_146
// sesquadragintcentinagintic mean -- sixth step into the FOURTH
// DOZEN of the triple-digit family opened at PTQCNM (M_140). By the
// Power Mean inequality M_146 >= M_145, so
// sesquadragintcentinagintic_mean >= quinquadragintcentinagintic_mean
// and ptsqcnm <= ptqiqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sesquadragintcentinagintic_mean approaches x_max / n^(1/146),
// so ptsqcnm approaches n^(1/146) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/146) ~= 1.0159, for n=20 ~= 1.0207, for n=30
// ~= 1.0236, for n=40 ~= 1.0256, for n=50 ~= 1.0272, for n=60
// ~= 1.0284, for n=70 ~= 1.0295, for n=80 ~= 1.0305, for n=85
// ~= 1.0309, for n=89 ~= 1.0312, for n=90 ~= 1.0313 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/146) ~= 1.0320) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/146) ~= 1.0320,
// and the pool100 [1x99, 100] reference reads 1.0217 spread
// (further absorbed from PTQIQCNM's 1.0222 spread landing -- FIVE
// 4-decimal ticks of absorption at M_146) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_146.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sesquadragintcentinagintic_mean = k,
//                                     range 0, ptsqcnm 0 (tight).
//   * uniform ramp [1..10]          -> SQCNM ~= 9.8435, range 9,
//                                     ptsqcnm ~= 0.9143 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIQCNM 0.9144 at M_145).
//   * upper-outlier [1x9, 10]       -> SQCNM ~= 9.8435, range 9,
//                                     ptsqcnm ~= 0.9143 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_146;
//                                     the M_145 joint collapse at
//                                     0.9144 advances one tick to a
//                                     joint 0.9143 bucket at M_146
//                                     because both anchors continue to
//                                     approach 10 / 10^(1/146) ~ 9.8435
//                                     in lock-step).
//   * two-shoulders [1x8, 5x2]      -> SQCNM ~= 4.9452, range 4,
//                                     ptsqcnm ~= 0.8089 (tight --
//                                     JOINT with PTQIQCNM 0.8089 at
//                                     M_145).
//   * 50/50 split [1x5, 10x5]       -> SQCNM ~= 9.9526, range 9,
//                                     ptsqcnm ~= 0.9043 (tight --
//                                     JOINT with PTQIQCNM 0.9043 at
//                                     M_145).
//   * extreme outlier [1x9, 100]    -> SQCNM ~= 98.4353, range 99,
//                                     ptsqcnm ~= 1.0057 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/146) ~ 1.0159 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIQCNM 1.0058 at M_145).
//   * two-partner [1, 9]            -> SQCNM ~= 8.9574, range 8,
//                                     ptsqcnm ~= 0.8931 (tight --
//                                     JOINT with PTQIQCNM 0.8931 at
//                                     M_145).
//   * two-partner [1, 100]          -> SQCNM ~= 99.5264, range 99,
//                                     ptsqcnm ~= 0.9947 (TIGHT --
//                                     JOINT with PTQIQCNM 0.9947 at
//                                     M_145).
//   * small [10, 1, 1]              -> SQCNM ~= 9.9250, range 9,
//                                     ptsqcnm ~= 0.9068 (tight --
//                                     JOINT with PTQIQCNM 0.9068 at
//                                     M_145).
//   * pool_count=100 [1x99, 100]    -> SQCNM ~= 96.8950, range 99,
//                                     ptsqcnm ~= 1.0217 (SPREAD --
//                                     FURTHER ABSORBED from PTQIQCNM
//                                     M_145's 1.0222 spread; the
//                                     100-partner asymptote
//                                     100^(1/146) ~ 1.0320 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- five 4-decimal ticks
//                                     of absorption at M_146 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptsqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sesquadragintcentinagintic_mean == 0
//   * tight                ptsqcnm < 1.005
//   * spread               ptsqcnm in [1.005, 1.09)
//   * wide                 ptsqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsqcnm_max /
// wide_ptsqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.547):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquadragintcentinaginticMeanSection
// (P11.545) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesquadragintcentinagintic-center
// after the P11.545 range-against-quinquadragintcentinagintic-center landing.
//
// Naming: sesquadragintcentinagintic = ses (6) + quadragint (40) +
// centinagintic (100) following the sesvigintcentinagintic (M_126) +
// sestrigintcentinagintic (M_136) systematic pattern; abbreviation
// PTSQCNM (P-T-Ses-Quadragint-Centi-Nagintic-M) is distinct from PTQCNM
// (M_140 quadragintcentinagintic) by the extra 'S' for the 'ses'
// segment, from PTSVCNM (M_126 sesvigintcentinagintic) by the 'Q'
// (quadragint) vs 'V' (vigint) segment, and from PTSTCNM (M_136
// sestrigintcentinagintic) by the 'Q' (quadragint) vs 'T' (trigint)
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
type PtsqcnmLabel =
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

// Bands on raw ptsqcnm (fixed cutoffs since sesquadragintcentinagintic_mean
// scales with cell counts and typical sesquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_146 is 0.9143
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0161
// (M_145) to 1.0159 (M_146), 20-partner drops from 1.0210 to 1.0207,
// 30-partner drops from 1.0239 to 1.0236, 40-partner drops from
// 1.0259 to 1.0256, 50-partner drops from 1.0275 to 1.0272,
// 60-partner drops from 1.0288 to 1.0284, 70-partner drops from
// 1.0299 to 1.0295, 80-partner drops from 1.0309 to 1.0305,
// 85-partner drops from 1.0313 to 1.0309, 89-partner drops from
// 1.0317 to 1.0312, 90-partner drops from 1.0317 to 1.0313 -- so
// pool_count >= 100 (100^(1/146) ~ 1.0320) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQIQCNM 1.0222 spread to PTSQCNM 1.0217 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSQCNM_MAX = 1.005;
const WIDE_PTSQCNM_MIN = 1.09;

// PTSQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsqcnm_max: number;
  readonly wide_ptsqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanMap;
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

// Peak-to-sesquadragintcentinagintic-mean of a discrete distribution:
//   PTSQCNM = (max - min) / sesquadragintcentinagintic_mean
// where sesquadragintcentinagintic_mean = ((sum x_i^146) / n)^(1/146).
// Returns null on empty, solo, and degenerate (zero
// sesquadragintcentinagintic_mean or non-finite hundred-and-forty-sixth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^146 = x^128 * x^16 * x^2 = p128 * p16 * sq -- (128 + 16 + 2)
    // decomposition reuses the p128 rung shared with the M_128..M_145
    // siblings and multiplies by p16 and sq to hit the next order.
    hundredFortySixthSum += p128 * p16 * sq;
  }
  if (
    !Number.isFinite(hundredFortySixthSum) ||
    hundredFortySixthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquadragintcentinagintic_mean: null,
    };
  }
  const sesquadragintcentinagintic_mean = Math.pow(
    hundredFortySixthSum / pool_count,
    1 / 146,
  );
  if (
    !Number.isFinite(sesquadragintcentinagintic_mean) ||
    sesquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsqcnm = range / sesquadragintcentinagintic_mean;
  const clamped = ptsqcnm < 0 ? 0 : ptsqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesquadragintcentinagintic_mean: roundTo(clamped, PTSQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesquadragintcentinagintic_mean:
      partner.peak_to_sesquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesquadragintcentinagintic_mean:
      metric.peak_to_sesquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMean {
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
    tight_ptsqcnm_max: TIGHT_PTSQCNM_MAX,
    wide_ptsqcnm_min: WIDE_PTSQCNM_MIN,
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

function labelForPtsqcnm(
  pool_count: number,
  pool_cells: number,
  ptsqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtsqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsqcnm === null) return "degenerate";
  if (ptsqcnm >= wide_min) return "wide";
  if (ptsqcnm < tight_max) return "tight";
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

function renderPtsqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptsqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsqcnm(
    pool_count,
    pool_cells,
    ptsqcnm,
    tight_max,
    wide_min,
  );
  const ptsqcnmText = ptsqcnm === null ? "-" : ptsqcnm.toFixed(4);
  return `PTSQCNM ${ptsqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsqcnm_max, wide_ptsqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesquadragintcentinagintic_mean, tight_ptsqcnm_max, wide_ptsqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesquadragintcentinagintic_mean, tight_ptsqcnm_max, wide_ptsqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsqcnm = (max - min) / sesquadragintcentinagintic_mean where sesquadragintcentinagintic_mean = ((sum x_i^146) / n)^(1/146). Reads the pool's total RANGE in units of its SESQUADRAGINTCENTINAGINTIC (power-mean-of-order-146, M_146) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.544 PTQIQCNM because raising to the ONE-HUNDRED-AND-FORTY-SIXTH power lifts the anchor MORE than raising to the hundred-and-forty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquadragintcentinagintic) power-mean SESSEPTUAGINTUPLET into a SEPTSEPTUAGINTUPLET with the M_146 sesquadragintcentinagintic mean, sixth step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsqcnm approaches n^(1/146) so 10-partner pools cap near 1.0159, 20-partner near 1.0207, 30-partner near 1.0236, 40-partner near 1.0256, 50-partner near 1.0272, 60-partner near 1.0284, 70-partner near 1.0295, 80-partner near 1.0305, 85-partner near 1.0309, 89-partner near 1.0312 and 90-partner near 1.0313 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/146) ~= 1.0320) are required to escape into wide with a modest outlier. Composite regime labels: PTSQCNM tight + PTQIQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSQCNM 0.9143 tight -- rejoining the uniform ramp's 0.9143 for the sixty-fourth tick in the sequence after PTQIQCNM's 0.9144 joint bucket at M_145); PTSQCNM spread + PTQIQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSQCNM 1.0057 spread -- one 4-decimal tick below PTQIQCNM's 1.0058); PTSQCNM spread + PTQIQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_146 ([1x99, 100] reads 1.0217 spread after M_145's 1.0222 spread landing -- five 4-decimal ticks of absorption); PTSQCNM tight + PTQIQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_145 ([1, 100] reads 0.9947 tight, unchanged from M_145's 0.9947 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptsqcnm &lt; ${tight_ptsqcnm_max}, spread = ptsqcnm in [${tight_ptsqcnm_max}, ${wide_ptsqcnm_min}), wide = ptsqcnm &ge; ${wide_ptsqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
