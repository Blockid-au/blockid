// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.548).
//
// WHOLE-POOL RANGE-AGAINST-SEPTQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SEPTQUADRAGINTCENTINAGINTIC MEAN (power mean of
// order 147, M_147):
//
//   ptspqcnm = (max - min) / septquadragintcentinagintic_mean
//
// where septquadragintcentinagintic_mean = ((sum x_i^147) / n)^(1/147).
// Reads the peak spread against the SEPTQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-147) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.546 PTSQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-SEVENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-sixth does,
// dampening the ratio against the range even harder. Seventh entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTSPQCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-147)
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
// quinquadragintcentinagintic M_145,
// sesquadragintcentinagintic M_146) power-mean
// OCTOSEPTUAGINTUPLET into a
// NOVEMSEPTUAGINTUPLET with the M_147
// septquadragintcentinagintic mean -- seventh step into the FOURTH
// DOZEN of the triple-digit family opened at PTQCNM (M_140). By the
// Power Mean inequality M_147 >= M_146, so
// septquadragintcentinagintic_mean >= sesquadragintcentinagintic_mean
// and ptspqcnm <= ptsqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septquadragintcentinagintic_mean approaches x_max / n^(1/147),
// so ptspqcnm approaches n^(1/147) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/147) ~= 1.0158, for n=20 ~= 1.0206, for n=30
// ~= 1.0234, for n=40 ~= 1.0254, for n=50 ~= 1.0270, for n=60
// ~= 1.0282, for n=70 ~= 1.0293, for n=80 ~= 1.0303, for n=85
// ~= 1.0307, for n=89 ~= 1.0310, for n=90 ~= 1.0311 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/147) ~= 1.0318) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/147) ~= 1.0318,
// and the pool100 [1x99, 100] reference reads 1.0215 spread
// (further absorbed from PTSQCNM's 1.0217 spread landing -- TWO
// 4-decimal ticks of absorption at M_147) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_147.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septquadragintcentinagintic_mean = k,
//                                     range 0, ptspqcnm 0 (tight).
//   * uniform ramp [1..10]          -> SPQCNM ~= 9.8446, range 9,
//                                     ptspqcnm ~= 0.9142 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSQCNM 0.9143 at M_146).
//   * upper-outlier [1x9, 10]       -> SPQCNM ~= 9.8446, range 9,
//                                     ptspqcnm ~= 0.9142 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_147;
//                                     the M_146 joint collapse at
//                                     0.9143 advances one tick to a
//                                     joint 0.9142 bucket at M_147
//                                     because both anchors continue to
//                                     approach 10 / 10^(1/147) ~ 9.8446
//                                     in lock-step).
//   * two-shoulders [1x8, 5x2]      -> SPQCNM ~= 4.9456, range 4,
//                                     ptspqcnm ~= 0.8088 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSQCNM 0.8089 at M_146).
//   * 50/50 split [1x5, 10x5]       -> SPQCNM ~= 9.9530, range 9,
//                                     ptspqcnm ~= 0.9043 (tight --
//                                     JOINT with PTSQCNM 0.9043 at
//                                     M_146).
//   * extreme outlier [1x9, 100]    -> SPQCNM ~= 98.4458, range 99,
//                                     ptspqcnm ~= 1.0056 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/147) ~ 1.0158 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSQCNM 1.0057 at M_146).
//   * two-partner [1, 9]            -> SPQCNM ~= 8.9577, range 8,
//                                     ptspqcnm ~= 0.8931 (tight --
//                                     JOINT with PTSQCNM 0.8931 at
//                                     M_146).
//   * two-partner [1, 100]          -> SPQCNM ~= 99.5296, range 99,
//                                     ptspqcnm ~= 0.9947 (TIGHT --
//                                     JOINT with PTSQCNM 0.9947 at
//                                     M_146).
//   * small [10, 1, 1]              -> SPQCNM ~= 9.9255, range 9,
//                                     ptspqcnm ~= 0.9068 (tight --
//                                     JOINT with PTSQCNM 0.9068 at
//                                     M_146).
//   * pool_count=100 [1x99, 100]    -> SPQCNM ~= 96.9158, range 99,
//                                     ptspqcnm ~= 1.0215 (SPREAD --
//                                     FURTHER ABSORBED from PTSQCNM
//                                     M_146's 1.0217 spread; the
//                                     100-partner asymptote
//                                     100^(1/147) ~ 1.0318 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_147 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptspqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septquadragintcentinagintic_mean == 0
//   * tight                ptspqcnm < 1.005
//   * spread               ptspqcnm in [1.005, 1.09)
//   * wide                 ptspqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspqcnm_max /
// wide_ptspqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.549):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesquadragintcentinaginticMeanSection
// (P11.547) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septquadragintcentinagintic-center
// after the P11.547 range-against-sesquadragintcentinagintic-center landing.
//
// Naming: septquadragintcentinagintic = sep (7) + quadragint (40) +
// centinagintic (100) following the septvigintcentinagintic (M_127) +
// septtrigintcentinagintic (M_137) systematic pattern; abbreviation
// PTSPQCNM (P-T-Sep-Quadragint-Centi-Nagintic-M) is distinct from PTSQCNM
// (M_146 sesquadragintcentinagintic) by the extra 'P' for the 'sep'
// segment vs 'ses', from PTSPTCNM (M_137 septtrigintcentinagintic) by
// the 'Q' (quadragint) vs 'T' (trigint) segment, and from PTSPVCNM
// (M_127 septvigintcentinagintic) by the 'Q' (quadragint) vs 'V'
// (vigint) segment.

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
type PtspqcnmLabel =
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

// Bands on raw ptspqcnm (fixed cutoffs since septquadragintcentinagintic_mean
// scales with cell counts and typical septquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_147 is 0.9142
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0159
// (M_146) to 1.0158 (M_147), 20-partner drops from 1.0207 to 1.0206,
// 30-partner drops from 1.0236 to 1.0234, 40-partner drops from
// 1.0256 to 1.0254, 50-partner drops from 1.0272 to 1.0270,
// 60-partner drops from 1.0284 to 1.0282, 70-partner drops from
// 1.0295 to 1.0293, 80-partner drops from 1.0305 to 1.0303,
// 85-partner drops from 1.0309 to 1.0307, 89-partner drops from
// 1.0312 to 1.0310, 90-partner drops from 1.0313 to 1.0311 -- so
// pool_count >= 100 (100^(1/147) ~ 1.0318) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSQCNM 1.0217 spread to PTSPQCNM 1.0215 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPQCNM_MAX = 1.005;
const WIDE_PTSPQCNM_MIN = 1.09;

// PTSPQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspqcnm_max: number;
  readonly wide_ptspqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanMap;
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

// Peak-to-septquadragintcentinagintic-mean of a discrete distribution:
//   PTSPQCNM = (max - min) / septquadragintcentinagintic_mean
// where septquadragintcentinagintic_mean = ((sum x_i^147) / n)^(1/147).
// Returns null on empty, solo, and degenerate (zero
// septquadragintcentinagintic_mean or non-finite hundred-and-forty-seventh-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^147 = x^128 * x^16 * x^2 * x^1 = p128 * p16 * sq * v --
    // (128 + 16 + 2 + 1) decomposition reuses the p128 rung shared
    // with the M_128..M_146 siblings and multiplies by p16, sq, v
    // to hit the next order.
    hundredFortySeventhSum += p128 * p16 * sq * v;
  }
  if (
    !Number.isFinite(hundredFortySeventhSum) ||
    hundredFortySeventhSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquadragintcentinagintic_mean: null,
    };
  }
  const septquadragintcentinagintic_mean = Math.pow(
    hundredFortySeventhSum / pool_count,
    1 / 147,
  );
  if (
    !Number.isFinite(septquadragintcentinagintic_mean) ||
    septquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspqcnm = range / septquadragintcentinagintic_mean;
  const clamped = ptspqcnm < 0 ? 0 : ptspqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septquadragintcentinagintic_mean: roundTo(clamped, PTSPQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septquadragintcentinagintic_mean:
      partner.peak_to_septquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septquadragintcentinagintic_mean:
      metric.peak_to_septquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMean {
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
    tight_ptspqcnm_max: TIGHT_PTSPQCNM_MAX,
    wide_ptspqcnm_min: WIDE_PTSPQCNM_MIN,
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

function labelForPtspqcnm(
  pool_count: number,
  pool_cells: number,
  ptspqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtspqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspqcnm === null) return "degenerate";
  if (ptspqcnm >= wide_min) return "wide";
  if (ptspqcnm < tight_max) return "tight";
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

function renderPtspqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptspqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspqcnm(
    pool_count,
    pool_cells,
    ptspqcnm,
    tight_max,
    wide_min,
  );
  const ptspqcnmText = ptspqcnm === null ? "-" : ptspqcnm.toFixed(4);
  return `PTSPQCNM ${ptspqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspqcnm_max, wide_ptspqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septquadragintcentinagintic_mean, tight_ptspqcnm_max, wide_ptspqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septquadragintcentinagintic_mean, tight_ptspqcnm_max, wide_ptspqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspqcnm = (max - min) / septquadragintcentinagintic_mean where septquadragintcentinagintic_mean = ((sum x_i^147) / n)^(1/147). Reads the pool's total RANGE in units of its SEPTQUADRAGINTCENTINAGINTIC (power-mean-of-order-147, M_147) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.546 PTSQCNM because raising to the ONE-HUNDRED-AND-FORTY-SEVENTH power lifts the anchor MORE than raising to the hundred-and-forty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesquadragintcentinagintic) power-mean OCTOSEPTUAGINTUPLET into a NOVEMSEPTUAGINTUPLET with the M_147 septquadragintcentinagintic mean, seventh step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspqcnm approaches n^(1/147) so 10-partner pools cap near 1.0158, 20-partner near 1.0206, 30-partner near 1.0234, 40-partner near 1.0254, 50-partner near 1.0270, 60-partner near 1.0282, 70-partner near 1.0293, 80-partner near 1.0303, 85-partner near 1.0307, 89-partner near 1.0310 and 90-partner near 1.0311 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/147) ~= 1.0318) are required to escape into wide with a modest outlier. Composite regime labels: PTSPQCNM tight + PTSQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPQCNM 0.9142 tight -- rejoining the uniform ramp's 0.9142 for the sixty-fifth tick in the sequence after PTSQCNM's 0.9143 joint bucket at M_146); PTSPQCNM spread + PTSQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPQCNM 1.0056 spread -- one 4-decimal tick below PTSQCNM's 1.0057); PTSPQCNM spread + PTSQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_147 ([1x99, 100] reads 1.0215 spread after M_146's 1.0217 spread landing -- two 4-decimal ticks of absorption); PTSPQCNM tight + PTSQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_146 ([1, 100] reads 0.9947 tight, unchanged from M_146's 0.9947 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptspqcnm &lt; ${tight_ptspqcnm_max}, spread = ptspqcnm in [${tight_ptspqcnm_max}, ${wide_ptspqcnm_min}), wide = ptspqcnm &ge; ${wide_ptspqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
