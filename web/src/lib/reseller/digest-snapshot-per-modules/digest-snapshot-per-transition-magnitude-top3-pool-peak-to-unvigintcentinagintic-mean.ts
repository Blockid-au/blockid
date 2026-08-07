// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.496).
//
// WHOLE-POOL RANGE-AGAINST-UNVIGINTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's UNVIGINTCENTINAGINTIC MEAN (a.k.a. power mean of
// order 121, M_121):
//
//   ptuvcnm = (max - min) / unvigintcentinagintic_mean
//
// where unvigintcentinagintic_mean = ((sum x_i^121) / n)^(1/121).
// Reads the peak spread against the UNVIGINTCENTINAGINTIC
// (power-mean-of-order-121) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.494 PTVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-FIRST power before averaging lifts the
// anchor MORE than raising to the hundred-and-twentieth does,
// dampening the ratio against the range even harder.
//
// PTUVCNM's unique DISPERSION-axis contribution: reads range in units
// of the UNVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-121) CENTER.
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
// vigintcentinagintic M_120) power-mean DUOQUINQUAGINTASEPTUAGINTUPLET
// into a TRESQUINQUAGINTASEPTUAGINTUPLET with the M_121
// unvigintcentinagintic mean -- climbing one step further into the
// third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_121 >= M_120, so unvigintcentinagintic_mean
// >= vigintcentinagintic_mean and ptuvcnm <= ptvcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unvigintcentinagintic_mean approaches x_max / n^(1/121), so
// ptuvcnm approaches n^(1/121) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/121) ~= 1.0192, for n=20 ~= 1.0251, for n=30 ~= 1.0285,
// for n=40 ~= 1.0310, for n=50 ~= 1.0329, for n=60 ~= 1.0344,
// for n=70 ~= 1.0357, for n=80 ~= 1.0369, for n=85 ~= 1.0374,
// for n=89 ~= 1.0378, for n=90 ~= 1.0379 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/121) ~= 1.0388)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/121) ~= 1.0388, and the pool100
// [1x99, 100] reference reads 1.0284 spread (further absorbed
// from PTVCNM's 1.0287 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_121.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unvigintcentinagintic_mean = k,
//                                     range 0, ptuvcnm 0 (tight).
//   * uniform ramp [1..10]          -> UVCNM ~= 9.8115, range 9,
//                                     ptuvcnm ~= 0.9173 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTVCNM 0.9174 at M_120).
//   * upper-outlier [1x9, 10]       -> UVCNM ~= 9.8115, range 9,
//                                     ptuvcnm ~= 0.9173 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_121;
//                                     the M_120 joint collapse at
//                                     0.9174 persists at M_121 as a
//                                     joint 0.9173 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/121) ~ 9.8115 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> UVCNM ~= 4.9339, range 4,
//                                     ptuvcnm ~= 0.8107 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTVCNM 0.8108 at M_120).
//   * 50/50 split [1x5, 10x5]       -> UVCNM ~= 9.9429, range 9,
//                                     ptuvcnm ~= 0.9052 (tight --
//                                     JOINT with PTVCNM 0.9052 at
//                                     M_120).
//   * extreme outlier [1x9, 100]    -> UVCNM ~= 98.1150, range 99,
//                                     ptuvcnm ~= 1.0090 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/121) ~ 1.0192 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTVCNM 1.0092 at M_120).
//   * two-partner [1, 9]            -> UVCNM ~= 8.9486, range 8,
//                                     ptuvcnm ~= 0.8940 (tight --
//                                     JOINT with PTVCNM 0.8940 at
//                                     M_120).
//   * two-partner [1, 100]          -> UVCNM ~= 99.4288, range 99,
//                                     ptuvcnm ~= 0.9957 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTVCNM 0.9957 at
//                                     M_120).
//   * small [10, 1, 1]              -> UVCNM ~= 9.9096, range 9,
//                                     ptuvcnm ~= 0.9082 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTVCNM 0.9083 at M_120).
//   * pool_count=100 [1x99, 100]    -> UVCNM ~= 96.2656, range 99,
//                                     ptuvcnm ~= 1.0284 (SPREAD --
//                                     FURTHER ABSORBED from PTVCNM
//                                     M_120's 1.0287 spread; the
//                                     100-partner asymptote
//                                     100^(1/121) ~ 1.0388 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_121
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptuvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unvigintcentinagintic_mean == 0
//   * tight                ptuvcnm < 1.005
//   * spread               ptuvcnm in [1.005, 1.09)
//   * wide                 ptuvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptuvcnm_max /
// wide_ptuvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.497):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanSection
// (P11.495) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unvigintcentinagintic-center
// after the P11.495 range-against-vigintcentinagintic-center landing.

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
type PtuvcnmLabel =
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

// Bands on raw ptuvcnm (fixed cutoffs since unvigintcentinagintic_mean
// scales with cell counts and typical unvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_121 is 0.9173
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0194
// (M_120) to 1.0192 (M_121), 20-partner drops from 1.0253 to 1.0251,
// 30-partner drops from 1.0287 to 1.0285, 40-partner drops from
// 1.0312 to 1.0310, 50-partner drops from 1.0331 to 1.0329,
// 60-partner drops from 1.0347 to 1.0344, 70-partner drops from
// 1.0360 to 1.0357, 80-partner drops from 1.0372 to 1.0369,
// 85-partner drops from 1.0377 to 1.0374, 89-partner drops from
// 1.0381 to 1.0378, 90-partner drops from 1.0382 to 1.0379 -- so
// pool_count >= 100 (100^(1/121) ~ 1.0388) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTVCNM 1.0287 spread to PTUVCNM 1.0284 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUVCNM_MAX = 1.005;
const WIDE_PTUVCNM_MIN = 1.09;

// PTUVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuvcnm_max: number;
  readonly wide_ptuvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanMap;
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

// Peak-to-unvigintcentinagintic-mean of a discrete distribution:
//   PTUVCNM = (max - min) / unvigintcentinagintic_mean
// where unvigintcentinagintic_mean = ((sum x_i^121) / n)^(1/121).
// Returns null on empty, solo, and degenerate (zero
// unvigintcentinagintic_mean or non-finite hundred-and-twenty-first-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^121 = x^64 * x^32 * x^16 * x^8 * x^1 = p64 * p32 * p16 * oct * v
    hundredTwentyFirstSum += p64 * p32 * p16 * oct * v;
  }
  if (
    !Number.isFinite(hundredTwentyFirstSum) ||
    hundredTwentyFirstSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unvigintcentinagintic_mean: null,
    };
  }
  const unvigintcentinagintic_mean = Math.pow(
    hundredTwentyFirstSum / pool_count,
    1 / 121,
  );
  if (
    !Number.isFinite(unvigintcentinagintic_mean) ||
    unvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptuvcnm = range / unvigintcentinagintic_mean;
  const clamped = ptuvcnm < 0 ? 0 : ptuvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_unvigintcentinagintic_mean: roundTo(clamped, PTUVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unvigintcentinagintic_mean:
      partner.peak_to_unvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unvigintcentinagintic_mean:
      metric.peak_to_unvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMean {
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
    tight_ptuvcnm_max: TIGHT_PTUVCNM_MAX,
    wide_ptuvcnm_min: WIDE_PTUVCNM_MIN,
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

function labelForPtuvcnm(
  pool_count: number,
  pool_cells: number,
  ptuvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtuvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuvcnm === null) return "degenerate";
  if (ptuvcnm >= wide_min) return "wide";
  if (ptuvcnm < tight_max) return "tight";
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

function renderPtuvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptuvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuvcnm(
    pool_count,
    pool_cells,
    ptuvcnm,
    tight_max,
    wide_min,
  );
  const ptuvcnmText = ptuvcnm === null ? "-" : ptuvcnm.toFixed(4);
  return `PTUVCNM ${ptuvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuvcnm_max, wide_ptuvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unvigintcentinagintic_mean, tight_ptuvcnm_max, wide_ptuvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unvigintcentinagintic_mean, tight_ptuvcnm_max, wide_ptuvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuvcnm = (max - min) / unvigintcentinagintic_mean where unvigintcentinagintic_mean = ((sum x_i^121) / n)^(1/121). Reads the pool's total RANGE in units of its UNVIGINTCENTINAGINTIC (power-mean-of-order-121, M_121) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.494 PTVCNM because raising to the ONE-HUNDRED-AND-TWENTY-FIRST power lifts the anchor MORE than raising to the hundred-and-twentieth does. Unique DISPERSION-axis contribution extends the (harmonic..vigintcentinagintic) power-mean DUOQUINQUAGINTASEPTUAGINTUPLET into a TRESQUINQUAGINTASEPTUAGINTUPLET with the M_121 unvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuvcnm approaches n^(1/121) so 10-partner pools cap near 1.0192, 20-partner near 1.0251, 30-partner near 1.0285, 40-partner near 1.0310, 50-partner near 1.0329, 60-partner near 1.0344, 70-partner near 1.0357, 80-partner near 1.0369, 85-partner near 1.0374, 89-partner near 1.0378 and 90-partner near 1.0379 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/121) ~= 1.0388) are required to escape into wide with a modest outlier. Composite regime labels: PTUVCNM tight + PTVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUVCNM 0.9173 tight -- rejoining the uniform ramp's 0.9173 for the fortieth tick in the sequence after PTVCNM's 0.9174 joint bucket at M_120); PTUVCNM spread + PTVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUVCNM 1.0090 spread -- two 4-decimal ticks below PTVCNM's 1.0092); PTUVCNM spread + PTVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_121 ([1x99, 100] reads 1.0284 spread after M_120's 1.0287 spread landing); PTUVCNM tight + PTVCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_121 ([1, 100] reads 0.9957 tight rejoining M_120's 0.9957 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptuvcnm &lt; ${tight_ptuvcnm_max}, spread = ptuvcnm in [${tight_ptuvcnm_max}, ${wide_ptuvcnm_min}), wide = ptuvcnm &ge; ${wide_ptuvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
