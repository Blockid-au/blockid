// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.534).
//
// WHOLE-POOL RANGE-AGAINST-QUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUADRAGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 140, M_140):
//
//   ptqcnm = (max - min) / quadragintcentinagintic_mean
//
// where quadragintcentinagintic_mean = ((sum x_i^140) / n)^(1/140).
// Reads the peak spread against the QUADRAGINTCENTINAGINTIC
// (power-mean-of-order-140) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.532 PTNTCNM, because raising to
// the ONE-HUNDRED-AND-FORTIETH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-ninth does,
// dampening the ratio against the range even harder. First entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (crossing the quadraginta prefix boundary above the trigint dozen).
//
// PTQCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-140) CENTER.
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
// novemtrigintcentinagintic M_139) power-mean
// UNSEPTUAGINTUPLET into a
// DUOSEPTUAGINTUPLET with the M_140
// quadragintcentinagintic mean -- opening the FOURTH DOZEN of the
// triple-digit family above the trigint dozen that closed at PTNTCNM.
// By the Power Mean inequality M_140 >= M_139, so
// quadragintcentinagintic_mean >= novemtrigintcentinagintic_mean
// and ptqcnm <= ptntcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quadragintcentinagintic_mean approaches x_max / n^(1/140), so
// ptqcnm approaches n^(1/140) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/140) ~= 1.0166, for n=20 ~= 1.0216, for n=30 ~= 1.0246,
// for n=40 ~= 1.0267, for n=50 ~= 1.0283, for n=60 ~= 1.0297,
// for n=70 ~= 1.0308, for n=80 ~= 1.0318, for n=85 ~= 1.0322,
// for n=89 ~= 1.0326, for n=90 ~= 1.0327 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/140) ~= 1.0334)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/140) ~= 1.0334, and the pool100
// [1x99, 100] reference reads 1.0231 spread (further absorbed
// from PTNTCNM's 1.0233 spread landing -- TWO 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_140.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quadragintcentinagintic_mean = k,
//                                     range 0, ptqcnm 0 (tight).
//   * uniform ramp [1..10]          -> QCNM ~= 9.8369, range 9,
//                                     ptqcnm ~= 0.9149 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNTCNM 0.9150 at M_139).
//   * upper-outlier [1x9, 10]       -> QCNM ~= 9.8369, range 9,
//                                     ptqcnm ~= 0.9149 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_140;
//                                     the M_139 joint collapse at
//                                     0.9150 persists at M_140 as a
//                                     joint 0.9149 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/140) ~ 9.8369 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QCNM ~= 4.9428, range 4,
//                                     ptqcnm ~= 0.8092 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNTCNM 0.8093 at M_139).
//   * 50/50 split [1x5, 10x5]       -> QCNM ~= 9.9506, range 9,
//                                     ptqcnm ~= 0.9045 (tight --
//                                     JOINT with PTNTCNM 0.9045 at
//                                     M_139).
//   * extreme outlier [1x9, 100]    -> QCNM ~= 98.3687, range 99,
//                                     ptqcnm ~= 1.0064 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/140) ~ 1.0166 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTNTCNM 1.0065 at M_139).
//   * two-partner [1, 9]            -> QCNM ~= 8.9556, range 8,
//                                     ptqcnm ~= 0.8933 (tight --
//                                     JOINT with PTNTCNM 0.8933 at
//                                     M_139).
//   * two-partner [1, 100]          -> QCNM ~= 99.5061, range 99,
//                                     ptqcnm ~= 0.9949 (TIGHT --
//                                     JOINT with PTNTCNM 0.9949 at
//                                     M_139).
//   * small [10, 1, 1]              -> QCNM ~= 9.9218, range 9,
//                                     ptqcnm ~= 0.9071 (tight --
//                                     JOINT with PTNTCNM 0.9071 at
//                                     M_139).
//   * pool_count=100 [1x99, 100]    -> QCNM ~= 96.7641, range 99,
//                                     ptqcnm ~= 1.0231 (SPREAD --
//                                     FURTHER ABSORBED from PTNTCNM
//                                     M_139's 1.0233 spread; the
//                                     100-partner asymptote
//                                     100^(1/140) ~ 1.0334 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_140 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family into the
//                                     fourth dozen).
//
// Bands on raw ptqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quadragintcentinagintic_mean == 0
//   * tight                ptqcnm < 1.005
//   * spread               ptqcnm in [1.005, 1.09)
//   * wide                 ptqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqcnm_max /
// wide_ptqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.535):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanSection
// (P11.533) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quadragintcentinagintic-center
// after the P11.533 range-against-novemtrigintcentinagintic-center landing.
//
// Naming: quadragintcentinagintic = quadragint (40) + centinagintic
// (100) following the tens-only vigintcentinagintic (M_120) +
// trigintcentinagintic (M_130) systematic pattern; abbreviation PTQCNM
// (P-T-Quadragint-Centi-Nagintic-M) is distinct from the module-local
// PTQCNM of M_104 quattuorcentinagintic by the module boundary
// (each snapshot ships its own top-level envelope so the tight/wide
// key names do not collide at runtime), mirroring the precedent
// where M_103 trecentinagintic and M_130 trigintcentinagintic both
// carry PTTCNM within their own module.

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
type PtqcnmLabel =
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

// Bands on raw ptqcnm (fixed cutoffs since quadragintcentinagintic_mean
// scales with cell counts and typical quadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_140 is 0.9149
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0167
// (M_139) to 1.0166 (M_140), 20-partner drops from 1.0218 to 1.0216,
// 30-partner drops from 1.0248 to 1.0246, 40-partner drops from
// 1.0269 to 1.0267, 50-partner drops from 1.0285 to 1.0283,
// 60-partner drops from 1.0299 to 1.0297, 70-partner drops from
// 1.0310 to 1.0308, 80-partner drops from 1.0320 to 1.0318,
// 85-partner drops from 1.0325 to 1.0322, 89-partner drops from
// 1.0328 to 1.0326, 90-partner drops from 1.0329 to 1.0327 -- so
// pool_count >= 100 (100^(1/140) ~ 1.0334) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTNTCNM 1.0233 spread to PTQCNM 1.0231 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQCNM_MAX = 1.005;
const WIDE_PTQCNM_MIN = 1.09;

// PTQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqcnm_max: number;
  readonly wide_ptqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanMap;
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

// Peak-to-quadragintcentinagintic-mean of a discrete distribution:
//   PTQCNM = (max - min) / quadragintcentinagintic_mean
// where quadragintcentinagintic_mean = ((sum x_i^140) / n)^(1/140).
// Returns null on empty, solo, and degenerate (zero
// quadragintcentinagintic_mean or non-finite hundred-and-fortieth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^140 = x^128 * x^8 * x^4 = p128 * oct * quad -- (128 + 8 + 4)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_139 siblings and multiplies by oct * quad to hit the next
    // order.
    hundredFortiethSum += p128 * oct * quad;
  }
  if (
    !Number.isFinite(hundredFortiethSum) ||
    hundredFortiethSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quadragintcentinagintic_mean: null,
    };
  }
  const quadragintcentinagintic_mean = Math.pow(
    hundredFortiethSum / pool_count,
    1 / 140,
  );
  if (
    !Number.isFinite(quadragintcentinagintic_mean) ||
    quadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqcnm = range / quadragintcentinagintic_mean;
  const clamped = ptqcnm < 0 ? 0 : ptqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quadragintcentinagintic_mean: roundTo(clamped, PTQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quadragintcentinagintic_mean:
      partner.peak_to_quadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quadragintcentinagintic_mean:
      metric.peak_to_quadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMean {
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
    tight_ptqcnm_max: TIGHT_PTQCNM_MAX,
    wide_ptqcnm_min: WIDE_PTQCNM_MIN,
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

function labelForPtqcnm(
  pool_count: number,
  pool_cells: number,
  ptqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqcnm === null) return "degenerate";
  if (ptqcnm >= wide_min) return "wide";
  if (ptqcnm < tight_max) return "tight";
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

function renderPtqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqcnm(
    pool_count,
    pool_cells,
    ptqcnm,
    tight_max,
    wide_min,
  );
  const ptqcnmText = ptqcnm === null ? "-" : ptqcnm.toFixed(4);
  return `PTQCNM ${ptqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqcnm_max, wide_ptqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quadragintcentinagintic_mean, tight_ptqcnm_max, wide_ptqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quadragintcentinagintic_mean, tight_ptqcnm_max, wide_ptqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqcnm = (max - min) / quadragintcentinagintic_mean where quadragintcentinagintic_mean = ((sum x_i^140) / n)^(1/140). Reads the pool's total RANGE in units of its QUADRAGINTCENTINAGINTIC (power-mean-of-order-140, M_140) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.532 PTNTCNM because raising to the ONE-HUNDRED-AND-FORTIETH power lifts the anchor MORE than raising to the hundred-and-thirty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemtrigintcentinagintic) power-mean UNSEPTUAGINTUPLET into a DUOSEPTUAGINTUPLET with the M_140 quadragintcentinagintic mean, opening the FOURTH DOZEN of the triple-digit family above the trigint dozen that closed at PTNTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqcnm approaches n^(1/140) so 10-partner pools cap near 1.0166, 20-partner near 1.0216, 30-partner near 1.0246, 40-partner near 1.0267, 50-partner near 1.0283, 60-partner near 1.0297, 70-partner near 1.0308, 80-partner near 1.0318, 85-partner near 1.0322, 89-partner near 1.0326 and 90-partner near 1.0327 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/140) ~= 1.0334) are required to escape into wide with a modest outlier. Composite regime labels: PTQCNM tight + PTNTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQCNM 0.9149 tight -- rejoining the uniform ramp's 0.9149 for the fifty-ninth tick in the sequence after PTNTCNM's 0.9150 joint bucket at M_139); PTQCNM spread + PTNTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQCNM 1.0064 spread -- one 4-decimal tick below PTNTCNM's 1.0065); PTQCNM spread + PTNTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_140 ([1x99, 100] reads 1.0231 spread after M_139's 1.0233 spread landing); PTQCNM tight + PTNTCNM tight = ISOLATED HIGH PARTNER absorption HOLDS at M_140 ([1, 100] reads 0.9949 tight, joint with M_139's 0.9949 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqcnm &lt; ${tight_ptqcnm_max}, spread = ptqcnm in [${tight_ptqcnm_max}, ${wide_ptqcnm_min}), wide = ptqcnm &ge; ${wide_ptqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
