// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTODECICENTINAGINTIC-MEAN
// pure-lib (P11.490).
//
// WHOLE-POOL RANGE-AGAINST-OCTODECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's OCTODECICENTINAGINTIC MEAN (a.k.a. power mean of
// order 118, M_118):
//
//   ptodcnm = (max - min) / octodecicentinagintic_mean
//
// where octodecicentinagintic_mean = ((sum x_i^118) / n)^(1/118).
// Reads the peak spread against the OCTODECICENTINAGINTIC
// (power-mean-of-order-118) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.488 PTSPDCNM, because raising to
// the ONE-HUNDRED-AND-EIGHTEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-seventeenth does,
// dampening the ratio against the range even harder.
//
// PTODCNM's unique DISPERSION-axis contribution: reads range in units
// of the OCTODECICENTINAGINTIC (POWER-MEAN-OF-ORDER-118) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113,
// quattuordecicentinagintic M_114, quindecicentinagintic M_115,
// sedecicentinagintic M_116, septdecicentinagintic M_117) power-mean
// NOVEQUADRAGINTASEPTUAGINTUPLET into a QUINQUAGINTASEPTUAGINTUPLET
// with the M_118 octodecicentinagintic mean -- climbing one step
// further into the second dozen of the triple-digit family opened at
// PTCNM. By Power Mean inequality M_118 >= M_117, so
// octodecicentinagintic_mean >= septdecicentinagintic_mean and
// ptodcnm <= ptspdcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octodecicentinagintic_mean approaches x_max / n^(1/118), so
// ptodcnm approaches n^(1/118) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/118) ~= 1.0197, for n=20 ~= 1.0257, for n=30 ~= 1.0292,
// for n=40 ~= 1.0318, for n=50 ~= 1.0337, for n=60 ~= 1.0353,
// for n=70 ~= 1.0367, for n=80 ~= 1.0378, for n=85 ~= 1.0384,
// for n=89 ~= 1.0388, for n=90 ~= 1.0389 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/118) ~= 1.0398)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/118) ~= 1.0398, and the pool100
// [1x99, 100] reference reads 1.0294 spread (further absorbed
// from PTSPDCNM's 1.0297 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_118.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octodecicentinagintic_mean = k,
//                                     range 0, ptodcnm 0 (tight).
//   * uniform ramp [1..10]          -> ODCNM ~= 9.8068, range 9,
//                                     ptodcnm ~= 0.9177 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPDCNM 0.9179 at M_117).
//   * upper-outlier [1x9, 10]       -> ODCNM ~= 9.8068, range 9,
//                                     ptodcnm ~= 0.9177 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_118;
//                                     the M_117 joint collapse at
//                                     0.9179 persists at M_118 as a
//                                     joint 0.9177 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/118) ~ 9.8068 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> ODCNM ~= 4.9323, range 4,
//                                     ptodcnm ~= 0.8110 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPDCNM 0.8111 at M_117).
//   * 50/50 split [1x5, 10x5]       -> ODCNM ~= 9.9414, range 9,
//                                     ptodcnm ~= 0.9053 (tight --
//                                     JOINT with PTSPDCNM 0.9053 at
//                                     M_117; half-and-half anchor sits
//                                     inside the same 4-decimal bucket
//                                     for a 2nd consecutive M order at
//                                     M_118).
//   * extreme outlier [1x9, 100]    -> ODCNM ~= 98.0676, range 99,
//                                     ptodcnm ~= 1.0095 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/118) ~ 1.0197 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPDCNM 1.0097 at M_117).
//   * two-partner [1, 9]            -> ODCNM ~= 8.9473, range 8,
//                                     ptodcnm ~= 0.8941 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPDCNM 0.8942 at M_117).
//   * two-partner [1, 100]          -> ODCNM ~= 99.4143, range 99,
//                                     ptodcnm ~= 0.9958 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPDCNM 0.9959 at M_117).
//   * small [10, 1, 1]              -> ODCNM ~= 9.9073, range 9,
//                                     ptodcnm ~= 0.9084 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPDCNM 0.9085 at M_117).
//   * pool_count=100 [1x99, 100]    -> ODCNM ~= 96.1725, range 99,
//                                     ptodcnm ~= 1.0294 (SPREAD --
//                                     FURTHER ABSORBED from PTSPDCNM
//                                     M_117's 1.0297 spread; the
//                                     100-partner asymptote
//                                     100^(1/118) ~ 1.0398 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_118
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptodcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octodecicentinagintic_mean == 0
//   * tight                ptodcnm < 1.005
//   * spread               ptodcnm in [1.005, 1.09)
//   * wide                 ptodcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptodcnm_max /
// wide_ptodcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.491):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanSection
// (P11.489) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octodecicentinagintic-center
// after the P11.489 range-against-septdecicentinagintic-center landing.

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
type PtodcnmLabel =
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

// Bands on raw ptodcnm (fixed cutoffs since octodecicentinagintic_mean
// scales with cell counts and typical octodecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_118 is 0.9177
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0199
// (M_117) to 1.0197 (M_118), 20-partner drops from 1.0259 to 1.0257,
// 30-partner drops from 1.0295 to 1.0292, 40-partner drops from
// 1.0320 to 1.0318, 50-partner drops from 1.0340 to 1.0337,
// 60-partner drops from 1.0356 to 1.0353, 70-partner drops from
// 1.0370 to 1.0367, 80-partner drops from 1.0382 to 1.0378,
// 85-partner drops from 1.0387 to 1.0384, 89-partner drops from
// 1.0391 to 1.0388, 90-partner drops from 1.0392 to 1.0389 -- so
// pool_count >= 100 (100^(1/118) ~ 1.0398) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSPDCNM 1.0297 spread to PTODCNM 1.0294 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTODCNM_MAX = 1.005;
const WIDE_PTODCNM_MIN = 1.09;

// PTODCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTODCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octodecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octodecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptodcnm_max: number;
  readonly wide_ptodcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanMap;
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

// Peak-to-octodecicentinagintic-mean of a discrete distribution:
//   PTODCNM = (max - min) / octodecicentinagintic_mean
// where octodecicentinagintic_mean = ((sum x_i^118) / n)^(1/118).
// Returns null on empty, solo, and degenerate (zero
// octodecicentinagintic_mean or non-finite hundred-and-eighteenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octodecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octodecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octodecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octodecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredEighteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^118 = x^64 * x^32 * x^16 * x^4 * x^2 = p64 * p32 * p16 * quad * sq
    hundredEighteenthSum += p64 * p32 * p16 * quad * sq;
  }
  if (
    !Number.isFinite(hundredEighteenthSum) ||
    hundredEighteenthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octodecicentinagintic_mean: null,
    };
  }
  const octodecicentinagintic_mean = Math.pow(
    hundredEighteenthSum / pool_count,
    1 / 118,
  );
  if (
    !Number.isFinite(octodecicentinagintic_mean) ||
    octodecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octodecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptodcnm = range / octodecicentinagintic_mean;
  const clamped = ptodcnm < 0 ? 0 : ptodcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_octodecicentinagintic_mean: roundTo(clamped, PTODCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octodecicentinagintic_mean:
      partner.peak_to_octodecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octodecicentinagintic_mean:
      metric.peak_to_octodecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMean {
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
    tight_ptodcnm_max: TIGHT_PTODCNM_MAX,
    wide_ptodcnm_min: WIDE_PTODCNM_MIN,
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

function labelForPtodcnm(
  pool_count: number,
  pool_cells: number,
  ptodcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtodcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptodcnm === null) return "degenerate";
  if (ptodcnm >= wide_min) return "wide";
  if (ptodcnm < tight_max) return "tight";
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

function renderPtodcnmCell(
  pool_count: number,
  pool_cells: number,
  ptodcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtodcnm(
    pool_count,
    pool_cells,
    ptodcnm,
    tight_max,
    wide_min,
  );
  const ptodcnmText = ptodcnm === null ? "-" : ptodcnm.toFixed(4);
  return `PTODCNM ${ptodcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptodcnm_max, wide_ptodcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtodcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octodecicentinagintic_mean, tight_ptodcnm_max, wide_ptodcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtodcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octodecicentinagintic_mean, tight_ptodcnm_max, wide_ptodcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTODECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTODECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptodcnm = (max - min) / octodecicentinagintic_mean where octodecicentinagintic_mean = ((sum x_i^118) / n)^(1/118). Reads the pool's total RANGE in units of its OCTODECICENTINAGINTIC (power-mean-of-order-118, M_118) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.488 PTSPDCNM because raising to the ONE-HUNDRED-AND-EIGHTEENTH power lifts the anchor MORE than raising to the hundred-and-seventeenth does. Unique DISPERSION-axis contribution extends the (harmonic..septdecicentinagintic) power-mean NOVEQUADRAGINTASEPTUAGINTUPLET into a QUINQUAGINTASEPTUAGINTUPLET with the M_118 octodecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptodcnm approaches n^(1/118) so 10-partner pools cap near 1.0197, 20-partner near 1.0257, 30-partner near 1.0292, 40-partner near 1.0318, 50-partner near 1.0337, 60-partner near 1.0353, 70-partner near 1.0367, 80-partner near 1.0378, 85-partner near 1.0384, 89-partner near 1.0388 and 90-partner near 1.0389 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/118) ~= 1.0398) are required to escape into wide with a modest outlier. Composite regime labels: PTODCNM tight + PTSPDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTODCNM 0.9177 tight -- rejoining the uniform ramp's 0.9177 for the thirty-seventh tick in the sequence after PTSPDCNM's 0.9179 joint bucket at M_117); PTODCNM spread + PTSPDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTODCNM 1.0095 spread -- two 4-decimal ticks below PTSPDCNM's 1.0097); PTODCNM spread + PTSPDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_118 ([1x99, 100] reads 1.0294 spread after M_117's 1.0297 spread landing); PTODCNM tight + PTSPDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_118 ([1, 100] reads 0.9958 tight after M_117's 0.9959 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octodecicentinagintic_mean == 0 (guarded but unreachable), tight = ptodcnm &lt; ${tight_ptodcnm_max}, spread = ptodcnm in [${tight_ptodcnm_max}, ${wide_ptodcnm_min}), wide = ptodcnm &ge; ${wide_ptodcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptodcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTODCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTODCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
