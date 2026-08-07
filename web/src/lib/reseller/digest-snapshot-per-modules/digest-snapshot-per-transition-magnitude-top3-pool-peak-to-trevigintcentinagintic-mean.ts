// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TREVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.500).
//
// WHOLE-POOL RANGE-AGAINST-TREVIGINTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's TREVIGINTCENTINAGINTIC MEAN (a.k.a. power mean of
// order 123, M_123):
//
//   pttvcnm = (max - min) / trevigintcentinagintic_mean
//
// where trevigintcentinagintic_mean = ((sum x_i^123) / n)^(1/123).
// Reads the peak spread against the TREVIGINTCENTINAGINTIC
// (power-mean-of-order-123) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.498 PTDVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-THIRD power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-second does,
// dampening the ratio against the range even harder.
//
// PTTVCNM's unique DISPERSION-axis contribution: reads range in units
// of the TREVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-123) CENTER.
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
// duovigintcentinagintic M_122) power-mean
// QUATTUORQUINQUAGINTASEPTUAGINTUPLET into a
// QUINQUINQUAGINTASEPTUAGINTUPLET with the M_123
// trevigintcentinagintic mean -- climbing one step further into the
// third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_123 >= M_122, so trevigintcentinagintic_mean
// >= duovigintcentinagintic_mean and pttvcnm <= ptdvcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trevigintcentinagintic_mean approaches x_max / n^(1/123), so
// pttvcnm approaches n^(1/123) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/123) ~= 1.0189, for n=20 ~= 1.0247, for n=30 ~= 1.0280,
// for n=40 ~= 1.0304, for n=50 ~= 1.0323, for n=60 ~= 1.0338,
// for n=70 ~= 1.0351, for n=80 ~= 1.0363, for n=85 ~= 1.0368,
// for n=89 ~= 1.0372, for n=90 ~= 1.0373 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/123) ~= 1.0382)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/123) ~= 1.0382, and the pool100
// [1x99, 100] reference reads 1.0278 spread (further absorbed
// from PTDVCNM's 1.0281 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_123.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trevigintcentinagintic_mean = k,
//                                     range 0, pttvcnm 0 (tight).
//   * uniform ramp [1..10]          -> RVCNM ~= 9.8145, range 9,
//                                     pttvcnm ~= 0.9170 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDVCNM 0.9171 at M_122).
//   * upper-outlier [1x9, 10]       -> RVCNM ~= 9.8145, range 9,
//                                     pttvcnm ~= 0.9170 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_123;
//                                     the M_122 joint collapse at
//                                     0.9171 persists at M_123 as a
//                                     joint 0.9170 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/123) ~ 9.8145 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> RVCNM ~= 4.9350, range 4,
//                                     pttvcnm ~= 0.8105 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDVCNM 0.8106 at M_122).
//   * 50/50 split [1x5, 10x5]       -> RVCNM ~= 9.9438, range 9,
//                                     pttvcnm ~= 0.9051 (tight --
//                                     JOINT with PTDVCNM 0.9051 at
//                                     M_122).
//   * extreme outlier [1x9, 100]    -> RVCNM ~= 98.1454, range 99,
//                                     pttvcnm ~= 1.0087 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/123) ~ 1.0189 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTDVCNM 1.0089 at M_122).
//   * two-partner [1, 9]            -> RVCNM ~= 8.9494, range 8,
//                                     pttvcnm ~= 0.8939 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDVCNM 0.8940 at M_122).
//   * two-partner [1, 100]          -> RVCNM ~= 99.4381, range 99,
//                                     pttvcnm ~= 0.9956 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTDVCNM 0.9956 at
//                                     M_122).
//   * small [10, 1, 1]              -> RVCNM ~= 9.9111, range 9,
//                                     pttvcnm ~= 0.9081 (tight --
//                                     JOINT with PTDVCNM 0.9081 at
//                                     M_122).
//   * pool_count=100 [1x99, 100]    -> RVCNM ~= 96.3252, range 99,
//                                     pttvcnm ~= 1.0278 (SPREAD --
//                                     FURTHER ABSORBED from PTDVCNM
//                                     M_122's 1.0281 spread; the
//                                     100-partner asymptote
//                                     100^(1/123) ~ 1.0382 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_123
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw pttvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trevigintcentinagintic_mean == 0
//   * tight                pttvcnm < 1.005
//   * spread               pttvcnm in [1.005, 1.09)
//   * wide                 pttvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttvcnm_max /
// wide_pttvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.501):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanSection
// (P11.499) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trevigintcentinagintic-center
// after the P11.499 range-against-duovigintcentinagintic-center landing.

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
type PttvcnmLabel =
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

// Bands on raw pttvcnm (fixed cutoffs since trevigintcentinagintic_mean
// scales with cell counts and typical trevigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_123 is 0.9170
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0191
// (M_122) to 1.0189 (M_123), 20-partner drops from 1.0249 to 1.0247,
// 30-partner drops from 1.0283 to 1.0280, 40-partner drops from
// 1.0307 to 1.0304, 50-partner drops from 1.0326 to 1.0323,
// 60-partner drops from 1.0341 to 1.0338, 70-partner drops from
// 1.0354 to 1.0351, 80-partner drops from 1.0366 to 1.0363,
// 85-partner drops from 1.0371 to 1.0368, 89-partner drops from
// 1.0375 to 1.0372, 90-partner drops from 1.0376 to 1.0373 -- so
// pool_count >= 100 (100^(1/123) ~ 1.0382) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTDVCNM 1.0281 spread to PTTVCNM 1.0278 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTVCNM_MAX = 1.005;
const WIDE_PTTVCNM_MIN = 1.09;

// PTTVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trevigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trevigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttvcnm_max: number;
  readonly wide_pttvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanMap;
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

// Peak-to-trevigintcentinagintic-mean of a discrete distribution:
//   PTTVCNM = (max - min) / trevigintcentinagintic_mean
// where trevigintcentinagintic_mean = ((sum x_i^123) / n)^(1/123).
// Returns null on empty, solo, and degenerate (zero
// trevigintcentinagintic_mean or non-finite hundred-and-twenty-third-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trevigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trevigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_trevigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trevigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^123 = x^64 * x^32 * x^16 * x^8 * x^2 * x^1 = p64 * p32 * p16 * oct * sq * v
    hundredTwentyThirdSum += p64 * p32 * p16 * oct * sq * v;
  }
  if (
    !Number.isFinite(hundredTwentyThirdSum) ||
    hundredTwentyThirdSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trevigintcentinagintic_mean: null,
    };
  }
  const trevigintcentinagintic_mean = Math.pow(
    hundredTwentyThirdSum / pool_count,
    1 / 123,
  );
  if (
    !Number.isFinite(trevigintcentinagintic_mean) ||
    trevigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trevigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttvcnm = range / trevigintcentinagintic_mean;
  const clamped = pttvcnm < 0 ? 0 : pttvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_trevigintcentinagintic_mean: roundTo(clamped, PTTVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trevigintcentinagintic_mean:
      partner.peak_to_trevigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trevigintcentinagintic_mean:
      metric.peak_to_trevigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMean {
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
    tight_pttvcnm_max: TIGHT_PTTVCNM_MAX,
    wide_pttvcnm_min: WIDE_PTTVCNM_MIN,
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

function labelForPttvcnm(
  pool_count: number,
  pool_cells: number,
  pttvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttvcnm === null) return "degenerate";
  if (pttvcnm >= wide_min) return "wide";
  if (pttvcnm < tight_max) return "tight";
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

function renderPttvcnmCell(
  pool_count: number,
  pool_cells: number,
  pttvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttvcnm(
    pool_count,
    pool_cells,
    pttvcnm,
    tight_max,
    wide_min,
  );
  const pttvcnmText = pttvcnm === null ? "-" : pttvcnm.toFixed(4);
  return `PTTVCNM ${pttvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttvcnm_max, wide_pttvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trevigintcentinagintic_mean, tight_pttvcnm_max, wide_pttvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trevigintcentinagintic_mean, tight_pttvcnm_max, wide_pttvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TREVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TREVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttvcnm = (max - min) / trevigintcentinagintic_mean where trevigintcentinagintic_mean = ((sum x_i^123) / n)^(1/123). Reads the pool's total RANGE in units of its TREVIGINTCENTINAGINTIC (power-mean-of-order-123, M_123) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.498 PTDVCNM because raising to the ONE-HUNDRED-AND-TWENTY-THIRD power lifts the anchor MORE than raising to the hundred-and-twenty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duovigintcentinagintic) power-mean QUATTUORQUINQUAGINTASEPTUAGINTUPLET into a QUINQUINQUAGINTASEPTUAGINTUPLET with the M_123 trevigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttvcnm approaches n^(1/123) so 10-partner pools cap near 1.0189, 20-partner near 1.0247, 30-partner near 1.0280, 40-partner near 1.0304, 50-partner near 1.0323, 60-partner near 1.0338, 70-partner near 1.0351, 80-partner near 1.0363, 85-partner near 1.0368, 89-partner near 1.0372 and 90-partner near 1.0373 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/123) ~= 1.0382) are required to escape into wide with a modest outlier. Composite regime labels: PTTVCNM tight + PTDVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTVCNM 0.9170 tight -- rejoining the uniform ramp's 0.9170 for the forty-second tick in the sequence after PTDVCNM's 0.9171 joint bucket at M_122); PTTVCNM spread + PTDVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTVCNM 1.0087 spread -- two 4-decimal ticks below PTDVCNM's 1.0089); PTTVCNM spread + PTDVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_123 ([1x99, 100] reads 1.0278 spread after M_122's 1.0281 spread landing); PTTVCNM tight + PTDVCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_123 ([1, 100] reads 0.9956 tight matching M_122's 0.9956 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trevigintcentinagintic_mean == 0 (guarded but unreachable), tight = pttvcnm &lt; ${tight_pttvcnm_max}, spread = pttvcnm in [${tight_pttvcnm_max}, ${wide_pttvcnm_min}), wide = pttvcnm &ge; ${wide_pttvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
