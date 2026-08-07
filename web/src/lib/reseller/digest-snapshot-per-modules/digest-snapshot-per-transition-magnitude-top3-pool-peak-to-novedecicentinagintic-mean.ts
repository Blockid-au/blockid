// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEDECICENTINAGINTIC-MEAN
// pure-lib (P11.492).
//
// WHOLE-POOL RANGE-AGAINST-NOVEDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's NOVEDECICENTINAGINTIC MEAN (a.k.a. power mean of
// order 119, M_119):
//
//   ptndcnm = (max - min) / novedecicentinagintic_mean
//
// where novedecicentinagintic_mean = ((sum x_i^119) / n)^(1/119).
// Reads the peak spread against the NOVEDECICENTINAGINTIC
// (power-mean-of-order-119) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.490 PTODCNM, because raising to
// the ONE-HUNDRED-AND-NINETEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-eighteenth does,
// dampening the ratio against the range even harder.
//
// PTNDCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-119) CENTER.
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
// octodecicentinagintic M_118) power-mean QUINQUAGINTASEPTUAGINTUPLET
// into an UNQUINQUAGINTASEPTUAGINTUPLET with the M_119
// novedecicentinagintic mean -- climbing one step further into the
// second dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_119 >= M_118, so
// novedecicentinagintic_mean >= octodecicentinagintic_mean and
// ptndcnm <= ptodcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novedecicentinagintic_mean approaches x_max / n^(1/119), so
// ptndcnm approaches n^(1/119) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/119) ~= 1.0195, for n=20 ~= 1.0255, for n=30 ~= 1.0290,
// for n=40 ~= 1.0315, for n=50 ~= 1.0334, for n=60 ~= 1.0350,
// for n=70 ~= 1.0363, for n=80 ~= 1.0375, for n=85 ~= 1.0380,
// for n=89 ~= 1.0384, for n=90 ~= 1.0385 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/119) ~= 1.0395)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/119) ~= 1.0395, and the pool100
// [1x99, 100] reference reads 1.0291 spread (further absorbed
// from PTODCNM's 1.0294 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_119.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novedecicentinagintic_mean = k,
//                                     range 0, ptndcnm 0 (tight).
//   * uniform ramp [1..10]          -> NDCNM ~= 9.8084, range 9,
//                                     ptndcnm ~= 0.9176 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTODCNM 0.9177 at M_118).
//   * upper-outlier [1x9, 10]       -> NDCNM ~= 9.8084, range 9,
//                                     ptndcnm ~= 0.9176 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_119;
//                                     the M_118 joint collapse at
//                                     0.9177 persists at M_119 as a
//                                     joint 0.9176 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/119) ~ 9.8084 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> NDCNM ~= 4.9328, range 4,
//                                     ptndcnm ~= 0.8109 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTODCNM 0.8110 at M_118).
//   * 50/50 split [1x5, 10x5]       -> NDCNM ~= 9.9419, range 9,
//                                     ptndcnm ~= 0.9053 (tight --
//                                     JOINT with PTODCNM 0.9053 at
//                                     M_118; half-and-half anchor sits
//                                     inside the same 4-decimal bucket
//                                     for a 3rd consecutive M order at
//                                     M_119).
//   * extreme outlier [1x9, 100]    -> NDCNM ~= 98.0837, range 99,
//                                     ptndcnm ~= 1.0093 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/119) ~ 1.0195 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTODCNM 1.0095 at M_118).
//   * two-partner [1, 9]            -> NDCNM ~= 8.9477, range 8,
//                                     ptndcnm ~= 0.8941 (tight --
//                                     JOINT with PTODCNM 0.8941 at
//                                     M_118).
//   * two-partner [1, 100]          -> NDCNM ~= 99.4192, range 99,
//                                     ptndcnm ~= 0.9958 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTODCNM 0.9958 at
//                                     M_118).
//   * small [10, 1, 1]              -> NDCNM ~= 9.9081, range 9,
//                                     ptndcnm ~= 0.9083 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTODCNM 0.9084 at M_118).
//   * pool_count=100 [1x99, 100]    -> NDCNM ~= 96.2040, range 99,
//                                     ptndcnm ~= 1.0291 (SPREAD --
//                                     FURTHER ABSORBED from PTODCNM
//                                     M_118's 1.0294 spread; the
//                                     100-partner asymptote
//                                     100^(1/119) ~ 1.0395 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_119
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptndcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novedecicentinagintic_mean == 0
//   * tight                ptndcnm < 1.005
//   * spread               ptndcnm in [1.005, 1.09)
//   * wide                 ptndcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptndcnm_max /
// wide_ptndcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.493):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctodecicentinaginticMeanSection
// (P11.491) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novedecicentinagintic-center
// after the P11.491 range-against-octodecicentinagintic-center landing.

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
type PtndcnmLabel =
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

// Bands on raw ptndcnm (fixed cutoffs since novedecicentinagintic_mean
// scales with cell counts and typical novedecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_119 is 0.9176
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0197
// (M_118) to 1.0195 (M_119), 20-partner drops from 1.0257 to 1.0255,
// 30-partner drops from 1.0292 to 1.0290, 40-partner drops from
// 1.0318 to 1.0315, 50-partner drops from 1.0337 to 1.0334,
// 60-partner drops from 1.0353 to 1.0350, 70-partner drops from
// 1.0367 to 1.0363, 80-partner drops from 1.0378 to 1.0375,
// 85-partner drops from 1.0384 to 1.0380, 89-partner drops from
// 1.0388 to 1.0384, 90-partner drops from 1.0389 to 1.0385 -- so
// pool_count >= 100 (100^(1/119) ~ 1.0395) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTODCNM 1.0294 spread to PTNDCNM 1.0291 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNDCNM_MAX = 1.005;
const WIDE_PTNDCNM_MIN = 1.09;

// PTNDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novedecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novedecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptndcnm_max: number;
  readonly wide_ptndcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanMap;
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

// Peak-to-novedecicentinagintic-mean of a discrete distribution:
//   PTNDCNM = (max - min) / novedecicentinagintic_mean
// where novedecicentinagintic_mean = ((sum x_i^119) / n)^(1/119).
// Returns null on empty, solo, and degenerate (zero
// novedecicentinagintic_mean or non-finite hundred-and-nineteenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novedecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novedecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novedecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novedecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredNineteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^119 = x^64 * x^32 * x^16 * x^4 * x^2 * x = p64 * p32 * p16 * quad * sq * v
    hundredNineteenthSum += p64 * p32 * p16 * quad * sq * v;
  }
  if (
    !Number.isFinite(hundredNineteenthSum) ||
    hundredNineteenthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novedecicentinagintic_mean: null,
    };
  }
  const novedecicentinagintic_mean = Math.pow(
    hundredNineteenthSum / pool_count,
    1 / 119,
  );
  if (
    !Number.isFinite(novedecicentinagintic_mean) ||
    novedecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novedecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptndcnm = range / novedecicentinagintic_mean;
  const clamped = ptndcnm < 0 ? 0 : ptndcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novedecicentinagintic_mean: roundTo(clamped, PTNDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novedecicentinagintic_mean:
      partner.peak_to_novedecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novedecicentinagintic_mean:
      metric.peak_to_novedecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMean {
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
    tight_ptndcnm_max: TIGHT_PTNDCNM_MAX,
    wide_ptndcnm_min: WIDE_PTNDCNM_MIN,
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

function labelForPtndcnm(
  pool_count: number,
  pool_cells: number,
  ptndcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtndcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptndcnm === null) return "degenerate";
  if (ptndcnm >= wide_min) return "wide";
  if (ptndcnm < tight_max) return "tight";
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

function renderPtndcnmCell(
  pool_count: number,
  pool_cells: number,
  ptndcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtndcnm(
    pool_count,
    pool_cells,
    ptndcnm,
    tight_max,
    wide_min,
  );
  const ptndcnmText = ptndcnm === null ? "-" : ptndcnm.toFixed(4);
  return `PTNDCNM ${ptndcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptndcnm_max, wide_ptndcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtndcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novedecicentinagintic_mean, tight_ptndcnm_max, wide_ptndcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtndcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novedecicentinagintic_mean, tight_ptndcnm_max, wide_ptndcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptndcnm = (max - min) / novedecicentinagintic_mean where novedecicentinagintic_mean = ((sum x_i^119) / n)^(1/119). Reads the pool's total RANGE in units of its NOVEDECICENTINAGINTIC (power-mean-of-order-119, M_119) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.490 PTODCNM because raising to the ONE-HUNDRED-AND-NINETEENTH power lifts the anchor MORE than raising to the hundred-and-eighteenth does. Unique DISPERSION-axis contribution extends the (harmonic..octodecicentinagintic) power-mean QUINQUAGINTASEPTUAGINTUPLET into an UNQUINQUAGINTASEPTUAGINTUPLET with the M_119 novedecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptndcnm approaches n^(1/119) so 10-partner pools cap near 1.0195, 20-partner near 1.0255, 30-partner near 1.0290, 40-partner near 1.0315, 50-partner near 1.0334, 60-partner near 1.0350, 70-partner near 1.0363, 80-partner near 1.0375, 85-partner near 1.0380, 89-partner near 1.0384 and 90-partner near 1.0385 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/119) ~= 1.0395) are required to escape into wide with a modest outlier. Composite regime labels: PTNDCNM tight + PTODCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNDCNM 0.9176 tight -- rejoining the uniform ramp's 0.9176 for the thirty-eighth tick in the sequence after PTODCNM's 0.9177 joint bucket at M_118); PTNDCNM spread + PTODCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNDCNM 1.0093 spread -- two 4-decimal ticks below PTODCNM's 1.0095); PTNDCNM spread + PTODCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_119 ([1x99, 100] reads 1.0291 spread after M_118's 1.0294 spread landing); PTNDCNM tight + PTODCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_119 ([1, 100] reads 0.9958 tight matching M_118's 0.9958 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novedecicentinagintic_mean == 0 (guarded but unreachable), tight = ptndcnm &lt; ${tight_ptndcnm_max}, spread = ptndcnm in [${tight_ptndcnm_max}, ${wide_ptndcnm_min}), wide = ptndcnm &ge; ${wide_ptndcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptndcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
