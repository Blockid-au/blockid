// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.530).
//
// WHOLE-POOL RANGE-AGAINST-OCTOTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's OCTOTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 138, M_138):
//
//   ptotcnm = (max - min) / octotrigintcentinagintic_mean
//
// where octotrigintcentinagintic_mean = ((sum x_i^138) / n)^(1/138).
// Reads the peak spread against the OCTOTRIGINTCENTINAGINTIC
// (power-mean-of-order-138) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.528 PTSPTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-EIGHTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-seventh does,
// dampening the ratio against the range even harder.
//
// PTOTCNM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-138) CENTER.
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
// septtrigintcentinagintic M_137) power-mean
// NOVEMSEXAGINTASEPTUAGINTUPLET into a
// SEPTUAGINTUPLET with the M_138
// octotrigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_138 >= M_137, so
// octotrigintcentinagintic_mean >= septtrigintcentinagintic_mean
// and ptotcnm <= ptsptcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octotrigintcentinagintic_mean approaches x_max / n^(1/138), so
// ptotcnm approaches n^(1/138) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/138) ~= 1.0168, for n=20 ~= 1.0219, for n=30 ~= 1.0250,
// for n=40 ~= 1.0271, for n=50 ~= 1.0288, for n=60 ~= 1.0301,
// for n=70 ~= 1.0313, for n=80 ~= 1.0323, for n=85 ~= 1.0327,
// for n=89 ~= 1.0331, for n=90 ~= 1.0331 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/138) ~= 1.0339)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/138) ~= 1.0339, and the pool100
// [1x99, 100] reference reads 1.0236 spread (further absorbed
// from PTSPTCNM's 1.0238 spread landing -- TWO 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_138.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octotrigintcentinagintic_mean = k,
//                                     range 0, ptotcnm 0 (tight).
//   * uniform ramp [1..10]          -> OTCNM ~= 9.8347, range 9,
//                                     ptotcnm ~= 0.9151 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPTCNM 0.9153 at M_137).
//   * upper-outlier [1x9, 10]       -> OTCNM ~= 9.8347, range 9,
//                                     ptotcnm ~= 0.9151 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_138;
//                                     the M_137 joint collapse at
//                                     0.9153 persists at M_138 as a
//                                     joint 0.9151 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/138) ~ 9.8347 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> OTCNM ~= 4.9422, range 4,
//                                     ptotcnm ~= 0.8094 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPTCNM 0.8095 at M_137).
//   * 50/50 split [1x5, 10x5]       -> OTCNM ~= 9.9502, range 9,
//                                     ptotcnm ~= 0.9045 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPTCNM 0.9046 at M_137).
//   * extreme outlier [1x9, 100]    -> OTCNM ~= 98.3462, range 99,
//                                     ptotcnm ~= 1.0067 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/138) ~ 1.0168 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPTCNM 1.0068 at M_137).
//   * two-partner [1, 9]            -> OTCNM ~= 8.9553, range 8,
//                                     ptotcnm ~= 0.8934 (tight --
//                                     JOINT with PTSPTCNM 0.8934 at
//                                     M_137).
//   * two-partner [1, 100]          -> OTCNM ~= 99.4988, range 99,
//                                     ptotcnm ~= 0.9950 (TIGHT --
//                                     JOINT with PTSPTCNM 0.9950 at
//                                     M_137).
//   * small [10, 1, 1]              -> OTCNM ~= 9.9208, range 9,
//                                     ptotcnm ~= 0.9072 (tight --
//                                     JOINT with PTSPTCNM 0.9072 at
//                                     M_137).
//   * pool_count=100 [1x99, 100]    -> OTCNM ~= 96.7135, range 99,
//                                     ptotcnm ~= 1.0236 (SPREAD --
//                                     FURTHER ABSORBED from PTSPTCNM
//                                     M_137's 1.0238 spread; the
//                                     100-partner asymptote
//                                     100^(1/138) ~ 1.0339 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_138 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptotcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octotrigintcentinagintic_mean == 0
//   * tight                ptotcnm < 1.005
//   * spread               ptotcnm in [1.005, 1.09)
//   * wide                 ptotcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptotcnm_max /
// wide_ptotcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.531):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanSection
// (P11.529) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octotrigintcentinagintic-center
// after the P11.529 range-against-septtrigintcentinagintic-center landing.
//
// Naming: octotrigintcentinagintic = octo (8) + trigint (30) +
// centinagintic (100) following the octvigintcentinagintic (M_128)
// systematic pattern; abbreviation PTOTCNM (P-T-Octo-Trigint-Centi-
// Nagintic-M) is distinct from PTOCNM (M_108 octocentinagintic) by
// the extra 'T' for the 'trigint' segment, and from PTOVCNM (M_128
// octvigintcentinagintic) by the 'T' (trigint) vs 'V' (vigint) segment.

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
type PtotcnmLabel =
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

// Bands on raw ptotcnm (fixed cutoffs since octotrigintcentinagintic_mean
// scales with cell counts and typical octotrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_138 is 0.9151
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0169
// (M_137) to 1.0168 (M_138), 20-partner drops from 1.0221 to 1.0219,
// 30-partner drops from 1.0251 to 1.0250, 40-partner drops from
// 1.0273 to 1.0271, 50-partner drops from 1.0290 to 1.0288,
// 60-partner drops from 1.0303 to 1.0301, 70-partner drops from
// 1.0315 to 1.0313, 80-partner drops from 1.0325 to 1.0323,
// 85-partner drops from 1.0330 to 1.0327, 89-partner drops from
// 1.0333 to 1.0331, 90-partner drops from 1.0334 to 1.0331 -- so
// pool_count >= 100 (100^(1/138) ~ 1.0339) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSPTCNM 1.0238 spread to PTOTCNM 1.0236 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOTCNM_MAX = 1.005;
const WIDE_PTOTCNM_MIN = 1.09;

// PTOTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octotrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octotrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptotcnm_max: number;
  readonly wide_ptotcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanMap;
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

// Peak-to-octotrigintcentinagintic-mean of a discrete distribution:
//   PTOTCNM = (max - min) / octotrigintcentinagintic_mean
// where octotrigintcentinagintic_mean = ((sum x_i^138) / n)^(1/138).
// Returns null on empty, solo, and degenerate (zero
// octotrigintcentinagintic_mean or non-finite hundred-and-thirty-eighth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octotrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octotrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octotrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octotrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^138 = x^128 * x^8 * x^2 = p128 * oct * sq -- (128 + 8 + 2)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_137 siblings and multiplies by oct * sq to hit the next
    // order.
    hundredThirtyEighthSum += p128 * oct * sq;
  }
  if (
    !Number.isFinite(hundredThirtyEighthSum) ||
    hundredThirtyEighthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octotrigintcentinagintic_mean: null,
    };
  }
  const octotrigintcentinagintic_mean = Math.pow(
    hundredThirtyEighthSum / pool_count,
    1 / 138,
  );
  if (
    !Number.isFinite(octotrigintcentinagintic_mean) ||
    octotrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octotrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptotcnm = range / octotrigintcentinagintic_mean;
  const clamped = ptotcnm < 0 ? 0 : ptotcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_octotrigintcentinagintic_mean: roundTo(clamped, PTOTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octotrigintcentinagintic_mean:
      partner.peak_to_octotrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octotrigintcentinagintic_mean:
      metric.peak_to_octotrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMean {
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
    tight_ptotcnm_max: TIGHT_PTOTCNM_MAX,
    wide_ptotcnm_min: WIDE_PTOTCNM_MIN,
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

function labelForPtotcnm(
  pool_count: number,
  pool_cells: number,
  ptotcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtotcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptotcnm === null) return "degenerate";
  if (ptotcnm >= wide_min) return "wide";
  if (ptotcnm < tight_max) return "tight";
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

function renderPtotcnmCell(
  pool_count: number,
  pool_cells: number,
  ptotcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtotcnm(
    pool_count,
    pool_cells,
    ptotcnm,
    tight_max,
    wide_min,
  );
  const ptotcnmText = ptotcnm === null ? "-" : ptotcnm.toFixed(4);
  return `PTOTCNM ${ptotcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctotrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptotcnm_max, wide_ptotcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtotcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octotrigintcentinagintic_mean, tight_ptotcnm_max, wide_ptotcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtotcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octotrigintcentinagintic_mean, tight_ptotcnm_max, wide_ptotcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptotcnm = (max - min) / octotrigintcentinagintic_mean where octotrigintcentinagintic_mean = ((sum x_i^138) / n)^(1/138). Reads the pool's total RANGE in units of its OCTOTRIGINTCENTINAGINTIC (power-mean-of-order-138, M_138) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.528 PTSPTCNM because raising to the ONE-HUNDRED-AND-THIRTY-EIGHTH power lifts the anchor MORE than raising to the hundred-and-thirty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septtrigintcentinagintic) power-mean NOVEMSEXAGINTASEPTUAGINTUPLET into a SEPTUAGINTUPLET with the M_138 octotrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptotcnm approaches n^(1/138) so 10-partner pools cap near 1.0168, 20-partner near 1.0219, 30-partner near 1.0250, 40-partner near 1.0271, 50-partner near 1.0288, 60-partner near 1.0301, 70-partner near 1.0313, 80-partner near 1.0323, 85-partner near 1.0327, 89-partner near 1.0331 and 90-partner near 1.0331 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/138) ~= 1.0339) are required to escape into wide with a modest outlier. Composite regime labels: PTOTCNM tight + PTSPTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTOTCNM 0.9151 tight -- rejoining the uniform ramp's 0.9151 for the fifty-seventh tick in the sequence after PTSPTCNM's 0.9153 joint bucket at M_137); PTOTCNM spread + PTSPTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOTCNM 1.0067 spread -- one 4-decimal tick below PTSPTCNM's 1.0068); PTOTCNM spread + PTSPTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_138 ([1x99, 100] reads 1.0236 spread after M_137's 1.0238 spread landing); PTOTCNM tight + PTSPTCNM tight = ISOLATED HIGH PARTNER absorption JOINS at M_138 ([1, 100] reads 0.9950 tight jointly with M_137's 0.9950 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octotrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptotcnm &lt; ${tight_ptotcnm_max}, spread = ptotcnm in [${tight_ptotcnm_max}, ${wide_ptotcnm_min}), wide = ptotcnm &ge; ${wide_ptotcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptotcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
