// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.542).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUATTUORQUADRAGINTCENTINAGINTIC MEAN (a.k.a.
// power mean of order 144, M_144):
//
//   ptqqcnm = (max - min) / quattuorquadragintcentinagintic_mean
//
// where quattuorquadragintcentinagintic_mean = ((sum x_i^144) / n)^(1/144).
// Reads the peak spread against the QUATTUORQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-144) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.540 PTTQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-FOURTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-third does,
// dampening the ratio against the range even harder. Fifth entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTQQCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-144)
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
// trequadragintcentinagintic M_143) power-mean
// QUINSEPTUAGINTUPLET into a
// SESSEPTUAGINTUPLET with the M_144
// quattuorquadragintcentinagintic mean -- fifth step into the FOURTH
// DOZEN of the triple-digit family opened at PTQCNM (M_140). By the
// Power Mean inequality M_144 >= M_143, so
// quattuorquadragintcentinagintic_mean >= trequadragintcentinagintic_mean
// and ptqqcnm <= pttqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorquadragintcentinagintic_mean approaches x_max / n^(1/144),
// so ptqqcnm approaches n^(1/144) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/144) ~= 1.0161, for n=20 ~= 1.0210, for n=30
// ~= 1.0239, for n=40 ~= 1.0259, for n=50 ~= 1.0275, for n=60
// ~= 1.0288, for n=70 ~= 1.0299, for n=80 ~= 1.0309, for n=85
// ~= 1.0313, for n=89 ~= 1.0317, for n=90 ~= 1.0317 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/144) ~= 1.0325) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/144) ~= 1.0325,
// and the pool100 [1x99, 100] reference reads 1.0222 spread
// (further absorbed from PTTQCNM's 1.0224 spread landing -- TWO
// 4-decimal ticks of absorption at M_144) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_144.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorquadragintcentinagintic_mean = k,
//                                     range 0, ptqqcnm 0 (tight).
//   * uniform ramp [1..10]          -> QQCNM ~= 9.8414, range 9,
//                                     ptqqcnm ~= 0.9145 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQCNM 0.9146 at M_143).
//   * upper-outlier [1x9, 10]       -> QQCNM ~= 9.8414, range 9,
//                                     ptqqcnm ~= 0.9145 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_144;
//                                     the M_143 joint collapse at
//                                     0.9146 advances one tick to a
//                                     joint 0.9145 bucket at M_144
//                                     because both anchors continue to
//                                     approach 10 / 10^(1/144) ~ 9.8414
//                                     in lock-step).
//   * two-shoulders [1x8, 5x2]      -> QQCNM ~= 4.9444, range 4,
//                                     ptqqcnm ~= 0.8090 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQCNM 0.8091 at M_143).
//   * 50/50 split [1x5, 10x5]       -> QQCNM ~= 9.9520, range 9,
//                                     ptqqcnm ~= 0.9043 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQCNM 0.9044 at M_143).
//   * extreme outlier [1x9, 100]    -> QQCNM ~= 98.4137, range 99,
//                                     ptqqcnm ~= 1.0060 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/144) ~ 1.0161 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQCNM 1.0061 at M_143).
//   * two-partner [1, 9]            -> QQCNM ~= 8.9568, range 8,
//                                     ptqqcnm ~= 0.8932 (tight --
//                                     JOINT with PTTQCNM 0.8932 at
//                                     M_143).
//   * two-partner [1, 100]          -> QQCNM ~= 99.5198, range 99,
//                                     ptqqcnm ~= 0.9948 (TIGHT --
//                                     JOINT with PTTQCNM 0.9948 at
//                                     M_143).
//   * small [10, 1, 1]              -> QQCNM ~= 9.9240, range 9,
//                                     ptqqcnm ~= 0.9069 (tight --
//                                     JOINT with PTTQCNM 0.9069 at
//                                     M_143).
//   * pool_count=100 [1x99, 100]    -> QQCNM ~= 96.8526, range 99,
//                                     ptqqcnm ~= 1.0222 (SPREAD --
//                                     FURTHER ABSORBED from PTTQCNM
//                                     M_143's 1.0224 spread; the
//                                     100-partner asymptote
//                                     100^(1/144) ~ 1.0325 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_144 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptqqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorquadragintcentinagintic_mean == 0
//   * tight                ptqqcnm < 1.005
//   * spread               ptqqcnm in [1.005, 1.09)
//   * wide                 ptqqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqqcnm_max /
// wide_ptqqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.543):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTrequadragintcentinaginticMeanSection
// (P11.541) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorquadragintcentinagintic-center
// after the P11.541 range-against-trequadragintcentinagintic-center landing.
//
// Naming: quattuorquadragintcentinagintic = quattuor (4) + quadragint
// (40) + centinagintic (100) following the quattuorvigintcentinagintic
// (M_124) + quattuortrigintcentinagintic (M_134) systematic pattern;
// abbreviation PTQQCNM (P-T-Quattuor-Quadragint-Centi-Nagintic-M) is
// distinct from PTQCNM (M_140 quadragintcentinagintic) by the extra
// 'Q' for the 'quattuor' segment, from PTQVCNM (M_124
// quattuorvigintcentinagintic) by the 'Q' (quadragint) vs 'V' (vigint)
// segment, from PTQTCNM (M_134 quattuortrigintcentinagintic) by the
// 'Q' (quadragint) vs 'T' (trigint) segment, and from PTQQNM (M_44
// quattuorquadragintic) by the extra 'CN' for the 'centinagintic'
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
type PtqqcnmLabel =
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

// Bands on raw ptqqcnm (fixed cutoffs since quattuorquadragintcentinagintic_mean
// scales with cell counts and typical quattuorquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_144 is 0.9145
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0162
// (M_143) to 1.0161 (M_144), 20-partner drops from 1.0212 to 1.0210,
// 30-partner drops from 1.0241 to 1.0239, 40-partner drops from
// 1.0261 to 1.0259, 50-partner drops from 1.0277 to 1.0275,
// 60-partner drops from 1.0290 to 1.0288, 70-partner drops from
// 1.0302 to 1.0299, 80-partner drops from 1.0311 to 1.0309,
// 85-partner drops from 1.0316 to 1.0313, 89-partner drops from
// 1.0319 to 1.0317, 90-partner drops from 1.0320 to 1.0317 -- so
// pool_count >= 100 (100^(1/144) ~ 1.0325) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTQCNM 1.0224 spread to PTQQCNM 1.0222 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQQCNM_MAX = 1.005;
const WIDE_PTQQCNM_MIN = 1.09;

// PTQQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqqcnm_max: number;
  readonly wide_ptqqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanMap;
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

// Peak-to-quattuorquadragintcentinagintic-mean of a discrete distribution:
//   PTQQCNM = (max - min) / quattuorquadragintcentinagintic_mean
// where quattuorquadragintcentinagintic_mean = ((sum x_i^144) / n)^(1/144).
// Returns null on empty, solo, and degenerate (zero
// quattuorquadragintcentinagintic_mean or non-finite hundred-and-forty-fourth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^144 = x^128 * x^16 = p128 * p16 -- (128 + 16) decomposition so
    // the fold reuses the p128 rung shared with the M_128..M_143
    // siblings and multiplies by p16 to hit the next order.
    hundredFortyFourthSum += p128 * p16;
  }
  if (
    !Number.isFinite(hundredFortyFourthSum) ||
    hundredFortyFourthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquadragintcentinagintic_mean: null,
    };
  }
  const quattuorquadragintcentinagintic_mean = Math.pow(
    hundredFortyFourthSum / pool_count,
    1 / 144,
  );
  if (
    !Number.isFinite(quattuorquadragintcentinagintic_mean) ||
    quattuorquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqqcnm = range / quattuorquadragintcentinagintic_mean;
  const clamped = ptqqcnm < 0 ? 0 : ptqqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorquadragintcentinagintic_mean: roundTo(clamped, PTQQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorquadragintcentinagintic_mean:
      partner.peak_to_quattuorquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorquadragintcentinagintic_mean:
      metric.peak_to_quattuorquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMean {
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
    tight_ptqqcnm_max: TIGHT_PTQQCNM_MAX,
    wide_ptqqcnm_min: WIDE_PTQQCNM_MIN,
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

function labelForPtqqcnm(
  pool_count: number,
  pool_cells: number,
  ptqqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqqcnm === null) return "degenerate";
  if (ptqqcnm >= wide_min) return "wide";
  if (ptqqcnm < tight_max) return "tight";
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

function renderPtqqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqqcnm(
    pool_count,
    pool_cells,
    ptqqcnm,
    tight_max,
    wide_min,
  );
  const ptqqcnmText = ptqqcnm === null ? "-" : ptqqcnm.toFixed(4);
  return `PTQQCNM ${ptqqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqqcnm_max, wide_ptqqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorquadragintcentinagintic_mean, tight_ptqqcnm_max, wide_ptqqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorquadragintcentinagintic_mean, tight_ptqqcnm_max, wide_ptqqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqqcnm = (max - min) / quattuorquadragintcentinagintic_mean where quattuorquadragintcentinagintic_mean = ((sum x_i^144) / n)^(1/144). Reads the pool's total RANGE in units of its QUATTUORQUADRAGINTCENTINAGINTIC (power-mean-of-order-144, M_144) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.540 PTTQCNM because raising to the ONE-HUNDRED-AND-FORTY-FOURTH power lifts the anchor MORE than raising to the hundred-and-forty-third does. Unique DISPERSION-axis contribution extends the (harmonic..trequadragintcentinagintic) power-mean QUINSEPTUAGINTUPLET into a SESSEPTUAGINTUPLET with the M_144 quattuorquadragintcentinagintic mean, fifth step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqqcnm approaches n^(1/144) so 10-partner pools cap near 1.0161, 20-partner near 1.0210, 30-partner near 1.0239, 40-partner near 1.0259, 50-partner near 1.0275, 60-partner near 1.0288, 70-partner near 1.0299, 80-partner near 1.0309, 85-partner near 1.0313, 89-partner near 1.0317 and 90-partner near 1.0317 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/144) ~= 1.0325) are required to escape into wide with a modest outlier. Composite regime labels: PTQQCNM tight + PTTQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQQCNM 0.9145 tight -- rejoining the uniform ramp's 0.9145 for the sixty-third tick in the sequence after PTTQCNM's 0.9146 joint bucket at M_143); PTQQCNM spread + PTTQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQQCNM 1.0060 spread -- one 4-decimal tick below PTTQCNM's 1.0061); PTQQCNM spread + PTTQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_144 ([1x99, 100] reads 1.0222 spread after M_143's 1.0224 spread landing -- two 4-decimal ticks of absorption); PTQQCNM tight + PTTQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_143 ([1, 100] reads 0.9948 tight, unchanged from M_143's 0.9948 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqqcnm &lt; ${tight_ptqqcnm_max}, spread = ptqqcnm in [${tight_ptqqcnm_max}, ${wide_ptqqcnm_min}), wide = ptqqcnm &ge; ${wide_ptqqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
