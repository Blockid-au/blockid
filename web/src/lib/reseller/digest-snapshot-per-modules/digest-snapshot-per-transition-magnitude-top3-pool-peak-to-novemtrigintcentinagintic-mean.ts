// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.532).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's NOVEMTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 139, M_139):
//
//   ptntcnm = (max - min) / novemtrigintcentinagintic_mean
//
// where novemtrigintcentinagintic_mean = ((sum x_i^139) / n)^(1/139).
// Reads the peak spread against the NOVEMTRIGINTCENTINAGINTIC
// (power-mean-of-order-139) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.530 PTOTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-NINTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-eighth does,
// dampening the ratio against the range even harder.
//
// PTNTCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-139) CENTER.
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
// octotrigintcentinagintic M_138) power-mean
// SEPTUAGINTUPLET into an
// UNSEPTUAGINTUPLET with the M_139
// novemtrigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_139 >= M_138, so
// novemtrigintcentinagintic_mean >= octotrigintcentinagintic_mean
// and ptntcnm <= ptotcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemtrigintcentinagintic_mean approaches x_max / n^(1/139), so
// ptntcnm approaches n^(1/139) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/139) ~= 1.0167, for n=20 ~= 1.0218, for n=30 ~= 1.0248,
// for n=40 ~= 1.0269, for n=50 ~= 1.0285, for n=60 ~= 1.0299,
// for n=70 ~= 1.0310, for n=80 ~= 1.0320, for n=85 ~= 1.0325,
// for n=89 ~= 1.0328, for n=90 ~= 1.0329 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/139) ~= 1.0337)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/139) ~= 1.0337, and the pool100
// [1x99, 100] reference reads 1.0233 spread (further absorbed
// from PTOTCNM's 1.0236 spread landing -- THREE 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_139.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemtrigintcentinagintic_mean = k,
//                                     range 0, ptntcnm 0 (tight).
//   * uniform ramp [1..10]          -> NTCNM ~= 9.8357, range 9,
//                                     ptntcnm ~= 0.9150 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOTCNM 0.9151 at M_138).
//   * upper-outlier [1x9, 10]       -> NTCNM ~= 9.8357, range 9,
//                                     ptntcnm ~= 0.9150 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_139;
//                                     the M_138 joint collapse at
//                                     0.9151 persists at M_139 as a
//                                     joint 0.9150 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/139) ~ 9.8357 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> NTCNM ~= 4.9424, range 4,
//                                     ptntcnm ~= 0.8093 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOTCNM 0.8094 at M_138).
//   * 50/50 split [1x5, 10x5]       -> NTCNM ~= 9.9503, range 9,
//                                     ptntcnm ~= 0.9045 (tight --
//                                     JOINT with PTOTCNM 0.9045 at
//                                     M_138).
//   * extreme outlier [1x9, 100]    -> NTCNM ~= 98.3571, range 99,
//                                     ptntcnm ~= 1.0065 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/139) ~ 1.0167 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTOTCNM 1.0067 at M_138).
//   * two-partner [1, 9]            -> NTCNM ~= 8.9552, range 8,
//                                     ptntcnm ~= 0.8933 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOTCNM 0.8934 at M_138).
//   * two-partner [1, 100]          -> NTCNM ~= 99.5026, range 99,
//                                     ptntcnm ~= 0.9949 (TIGHT --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOTCNM 0.9950 at M_138).
//   * small [10, 1, 1]              -> NTCNM ~= 9.9213, range 9,
//                                     ptntcnm ~= 0.9071 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOTCNM 0.9072 at M_138).
//   * pool_count=100 [1x99, 100]    -> NTCNM ~= 96.7412, range 99,
//                                     ptntcnm ~= 1.0233 (SPREAD --
//                                     FURTHER ABSORBED from PTOTCNM
//                                     M_138's 1.0236 spread; the
//                                     100-partner asymptote
//                                     100^(1/139) ~ 1.0337 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_139 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptntcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemtrigintcentinagintic_mean == 0
//   * tight                ptntcnm < 1.005
//   * spread               ptntcnm in [1.005, 1.09)
//   * wide                 ptntcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptntcnm_max /
// wide_ptntcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.533):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanSection
// (P11.531) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemtrigintcentinagintic-center
// after the P11.531 range-against-octotrigintcentinagintic-center landing.
//
// Naming: novemtrigintcentinagintic = novem (9) + trigint (30) +
// centinagintic (100) following the novemvigintcentinagintic (M_129)
// systematic pattern; abbreviation PTNTCNM (P-T-Novem-Trigint-Centi-
// Nagintic-M) is distinct from PTNCNM (M_109 novecentinagintic) by
// the extra 'T' for the 'trigint' segment, and from PTNVCNM (M_129
// novemvigintcentinagintic) by the 'T' (trigint) vs 'V' (vigint) segment.

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
type PtntcnmLabel =
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

// Bands on raw ptntcnm (fixed cutoffs since novemtrigintcentinagintic_mean
// scales with cell counts and typical novemtrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_139 is 0.9150
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0168
// (M_138) to 1.0167 (M_139), 20-partner drops from 1.0219 to 1.0218,
// 30-partner drops from 1.0250 to 1.0248, 40-partner drops from
// 1.0271 to 1.0269, 50-partner drops from 1.0288 to 1.0285,
// 60-partner drops from 1.0301 to 1.0299, 70-partner drops from
// 1.0313 to 1.0310, 80-partner drops from 1.0323 to 1.0320,
// 85-partner drops from 1.0327 to 1.0325, 89-partner drops from
// 1.0331 to 1.0328, 90-partner drops from 1.0331 to 1.0329 -- so
// pool_count >= 100 (100^(1/139) ~ 1.0337) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTOTCNM 1.0236 spread to PTNTCNM 1.0233 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNTCNM_MAX = 1.005;
const WIDE_PTNTCNM_MIN = 1.09;

// PTNTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemtrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemtrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptntcnm_max: number;
  readonly wide_ptntcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanMap;
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

// Peak-to-novemtrigintcentinagintic-mean of a discrete distribution:
//   PTNTCNM = (max - min) / novemtrigintcentinagintic_mean
// where novemtrigintcentinagintic_mean = ((sum x_i^139) / n)^(1/139).
// Returns null on empty, solo, and degenerate (zero
// novemtrigintcentinagintic_mean or non-finite hundred-and-thirty-ninth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemtrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemtrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemtrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemtrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^139 = x^128 * x^8 * x^2 * x = p128 * oct * sq * v -- (128 + 8 + 2 + 1)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_138 siblings and multiplies by oct * sq * v to hit the next
    // order.
    hundredThirtyNinthSum += p128 * oct * sq * v;
  }
  if (
    !Number.isFinite(hundredThirtyNinthSum) ||
    hundredThirtyNinthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemtrigintcentinagintic_mean: null,
    };
  }
  const novemtrigintcentinagintic_mean = Math.pow(
    hundredThirtyNinthSum / pool_count,
    1 / 139,
  );
  if (
    !Number.isFinite(novemtrigintcentinagintic_mean) ||
    novemtrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemtrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptntcnm = range / novemtrigintcentinagintic_mean;
  const clamped = ptntcnm < 0 ? 0 : ptntcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemtrigintcentinagintic_mean: roundTo(clamped, PTNTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemtrigintcentinagintic_mean:
      partner.peak_to_novemtrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemtrigintcentinagintic_mean:
      metric.peak_to_novemtrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMean {
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
    tight_ptntcnm_max: TIGHT_PTNTCNM_MAX,
    wide_ptntcnm_min: WIDE_PTNTCNM_MIN,
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

function labelForPtntcnm(
  pool_count: number,
  pool_cells: number,
  ptntcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtntcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptntcnm === null) return "degenerate";
  if (ptntcnm >= wide_min) return "wide";
  if (ptntcnm < tight_max) return "tight";
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

function renderPtntcnmCell(
  pool_count: number,
  pool_cells: number,
  ptntcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtntcnm(
    pool_count,
    pool_cells,
    ptntcnm,
    tight_max,
    wide_min,
  );
  const ptntcnmText = ptntcnm === null ? "-" : ptntcnm.toFixed(4);
  return `PTNTCNM ${ptntcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptntcnm_max, wide_ptntcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtntcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemtrigintcentinagintic_mean, tight_ptntcnm_max, wide_ptntcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtntcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemtrigintcentinagintic_mean, tight_ptntcnm_max, wide_ptntcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptntcnm = (max - min) / novemtrigintcentinagintic_mean where novemtrigintcentinagintic_mean = ((sum x_i^139) / n)^(1/139). Reads the pool's total RANGE in units of its NOVEMTRIGINTCENTINAGINTIC (power-mean-of-order-139, M_139) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.530 PTOTCNM because raising to the ONE-HUNDRED-AND-THIRTY-NINTH power lifts the anchor MORE than raising to the hundred-and-thirty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octotrigintcentinagintic) power-mean SEPTUAGINTUPLET into an UNSEPTUAGINTUPLET with the M_139 novemtrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptntcnm approaches n^(1/139) so 10-partner pools cap near 1.0167, 20-partner near 1.0218, 30-partner near 1.0248, 40-partner near 1.0269, 50-partner near 1.0285, 60-partner near 1.0299, 70-partner near 1.0310, 80-partner near 1.0320, 85-partner near 1.0325, 89-partner near 1.0328 and 90-partner near 1.0329 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/139) ~= 1.0337) are required to escape into wide with a modest outlier. Composite regime labels: PTNTCNM tight + PTOTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNTCNM 0.9150 tight -- rejoining the uniform ramp's 0.9150 for the fifty-eighth tick in the sequence after PTOTCNM's 0.9151 joint bucket at M_138); PTNTCNM spread + PTOTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNTCNM 1.0065 spread -- two 4-decimal ticks below PTOTCNM's 1.0067); PTNTCNM spread + PTOTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_139 ([1x99, 100] reads 1.0233 spread after M_138's 1.0236 spread landing); PTNTCNM tight + PTOTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_139 ([1, 100] reads 0.9949 tight after M_138's 0.9950 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemtrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptntcnm &lt; ${tight_ptntcnm_max}, spread = ptntcnm in [${tight_ptntcnm_max}, ${wide_ptntcnm_min}), wide = ptntcnm &ge; ${wide_ptntcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptntcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
