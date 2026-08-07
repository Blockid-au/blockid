// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.502).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUATTUORVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 124, M_124):
//
//   ptqvcnm = (max - min) / quattuorvigintcentinagintic_mean
//
// where quattuorvigintcentinagintic_mean = ((sum x_i^124) / n)^(1/124).
// Reads the peak spread against the QUATTUORVIGINTCENTINAGINTIC
// (power-mean-of-order-124) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.500 PTTVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-FOURTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-third does,
// dampening the ratio against the range even harder.
//
// PTQVCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-124) CENTER.
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
// duovigintcentinagintic M_122, trevigintcentinagintic M_123)
// power-mean QUINQUINQUAGINTASEPTUAGINTUPLET into a
// SEXQUINQUAGINTASEPTUAGINTUPLET with the M_124
// quattuorvigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_124 >= M_123, so
// quattuorvigintcentinagintic_mean >= trevigintcentinagintic_mean and
// ptqvcnm <= pttvcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorvigintcentinagintic_mean approaches x_max / n^(1/124), so
// ptqvcnm approaches n^(1/124) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/124) ~= 1.0187, for n=20 ~= 1.0245, for n=30 ~= 1.0278,
// for n=40 ~= 1.0302, for n=50 ~= 1.0321, for n=60 ~= 1.0336,
// for n=70 ~= 1.0349, for n=80 ~= 1.0360, for n=85 ~= 1.0365,
// for n=89 ~= 1.0369, for n=90 ~= 1.0370 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/124) ~= 1.0378)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/124) ~= 1.0378, and the pool100
// [1x99, 100] reference reads 1.0275 spread (further absorbed
// from PTTVCNM's 1.0278 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_124.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorvigintcentinagintic_mean = k,
//                                     range 0, ptqvcnm 0 (tight).
//   * uniform ramp [1..10]          -> QVCNM ~= 9.8160, range 9,
//                                     ptqvcnm ~= 0.9169 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTVCNM 0.9170 at M_123).
//   * upper-outlier [1x9, 10]       -> QVCNM ~= 9.8160, range 9,
//                                     ptqvcnm ~= 0.9169 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_124;
//                                     the M_123 joint collapse at
//                                     0.9170 persists at M_124 as a
//                                     joint 0.9169 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/124) ~ 9.8160 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QVCNM ~= 4.9355, range 4,
//                                     ptqvcnm ~= 0.8104 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTVCNM 0.8105 at M_123).
//   * 50/50 split [1x5, 10x5]       -> QVCNM ~= 9.9443, range 9,
//                                     ptqvcnm ~= 0.9050 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTVCNM 0.9051 at M_123).
//   * extreme outlier [1x9, 100]    -> QVCNM ~= 98.1602, range 99,
//                                     ptqvcnm ~= 1.0086 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/124) ~ 1.0187 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTTVCNM 1.0087 at M_123).
//   * two-partner [1, 9]            -> QVCNM ~= 8.9498, range 8,
//                                     ptqvcnm ~= 0.8939 (tight --
//                                     JOINT with PTTVCNM 0.8939 at
//                                     M_123).
//   * two-partner [1, 100]          -> QVCNM ~= 99.4426, range 99,
//                                     ptqvcnm ~= 0.9955 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick from
//                                     PTTVCNM 0.9956 at M_123).
//   * small [10, 1, 1]              -> QVCNM ~= 9.9118, range 9,
//                                     ptqvcnm ~= 0.9080 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTVCNM 0.9081 at M_123).
//   * pool_count=100 [1x99, 100]    -> QVCNM ~= 96.3543, range 99,
//                                     ptqvcnm ~= 1.0275 (SPREAD --
//                                     FURTHER ABSORBED from PTTVCNM
//                                     M_123's 1.0278 spread; the
//                                     100-partner asymptote
//                                     100^(1/124) ~ 1.0378 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_124
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptqvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorvigintcentinagintic_mean == 0
//   * tight                ptqvcnm < 1.005
//   * spread               ptqvcnm in [1.005, 1.09)
//   * wide                 ptqvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqvcnm_max /
// wide_ptqvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.503):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTrevigintcentinaginticMeanSection
// (P11.501) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorvigintcentinagintic-center
// after the P11.501 range-against-trevigintcentinagintic-center landing.

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
type PtqvcnmLabel =
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

// Bands on raw ptqvcnm (fixed cutoffs since quattuorvigintcentinagintic_mean
// scales with cell counts and typical quattuorvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_124 is 0.9169
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0189
// (M_123) to 1.0187 (M_124), 20-partner drops from 1.0247 to 1.0245,
// 30-partner drops from 1.0280 to 1.0278, 40-partner drops from
// 1.0304 to 1.0302, 50-partner drops from 1.0323 to 1.0321,
// 60-partner drops from 1.0338 to 1.0336, 70-partner drops from
// 1.0351 to 1.0349, 80-partner drops from 1.0363 to 1.0360,
// 85-partner drops from 1.0368 to 1.0365, 89-partner drops from
// 1.0372 to 1.0369, 90-partner drops from 1.0373 to 1.0370 -- so
// pool_count >= 100 (100^(1/124) ~ 1.0378) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTVCNM 1.0278 spread to PTQVCNM 1.0275 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQVCNM_MAX = 1.005;
const WIDE_PTQVCNM_MIN = 1.09;

// PTQVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqvcnm_max: number;
  readonly wide_ptqvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanMap;
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

// Peak-to-quattuorvigintcentinagintic-mean of a discrete distribution:
//   PTQVCNM = (max - min) / quattuorvigintcentinagintic_mean
// where quattuorvigintcentinagintic_mean = ((sum x_i^124) / n)^(1/124).
// Returns null on empty, solo, and degenerate (zero
// quattuorvigintcentinagintic_mean or non-finite hundred-and-twenty-fourth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^124 = x^64 * x^32 * x^16 * x^8 * x^4 = p64 * p32 * p16 * oct * quad
    hundredTwentyFourthSum += p64 * p32 * p16 * oct * quad;
  }
  if (
    !Number.isFinite(hundredTwentyFourthSum) ||
    hundredTwentyFourthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorvigintcentinagintic_mean: null,
    };
  }
  const quattuorvigintcentinagintic_mean = Math.pow(
    hundredTwentyFourthSum / pool_count,
    1 / 124,
  );
  if (
    !Number.isFinite(quattuorvigintcentinagintic_mean) ||
    quattuorvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqvcnm = range / quattuorvigintcentinagintic_mean;
  const clamped = ptqvcnm < 0 ? 0 : ptqvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorvigintcentinagintic_mean: roundTo(clamped, PTQVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorvigintcentinagintic_mean:
      partner.peak_to_quattuorvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorvigintcentinagintic_mean:
      metric.peak_to_quattuorvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMean {
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
    tight_ptqvcnm_max: TIGHT_PTQVCNM_MAX,
    wide_ptqvcnm_min: WIDE_PTQVCNM_MIN,
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

function labelForPtqvcnm(
  pool_count: number,
  pool_cells: number,
  ptqvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqvcnm === null) return "degenerate";
  if (ptqvcnm >= wide_min) return "wide";
  if (ptqvcnm < tight_max) return "tight";
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

function renderPtqvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqvcnm(
    pool_count,
    pool_cells,
    ptqvcnm,
    tight_max,
    wide_min,
  );
  const ptqvcnmText = ptqvcnm === null ? "-" : ptqvcnm.toFixed(4);
  return `PTQVCNM ${ptqvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqvcnm_max, wide_ptqvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorvigintcentinagintic_mean, tight_ptqvcnm_max, wide_ptqvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorvigintcentinagintic_mean, tight_ptqvcnm_max, wide_ptqvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqvcnm = (max - min) / quattuorvigintcentinagintic_mean where quattuorvigintcentinagintic_mean = ((sum x_i^124) / n)^(1/124). Reads the pool's total RANGE in units of its QUATTUORVIGINTCENTINAGINTIC (power-mean-of-order-124, M_124) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.500 PTTVCNM because raising to the ONE-HUNDRED-AND-TWENTY-FOURTH power lifts the anchor MORE than raising to the hundred-and-twenty-third does. Unique DISPERSION-axis contribution extends the (harmonic..trevigintcentinagintic) power-mean QUINQUINQUAGINTASEPTUAGINTUPLET into a SEXQUINQUAGINTASEPTUAGINTUPLET with the M_124 quattuorvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqvcnm approaches n^(1/124) so 10-partner pools cap near 1.0187, 20-partner near 1.0245, 30-partner near 1.0278, 40-partner near 1.0302, 50-partner near 1.0321, 60-partner near 1.0336, 70-partner near 1.0349, 80-partner near 1.0360, 85-partner near 1.0365, 89-partner near 1.0369 and 90-partner near 1.0370 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/124) ~= 1.0378) are required to escape into wide with a modest outlier. Composite regime labels: PTQVCNM tight + PTTVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQVCNM 0.9169 tight -- rejoining the uniform ramp's 0.9169 for the forty-third tick in the sequence after PTTVCNM's 0.9170 joint bucket at M_123); PTQVCNM spread + PTTVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQVCNM 1.0086 spread -- one 4-decimal tick below PTTVCNM's 1.0087); PTQVCNM spread + PTTVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_124 ([1x99, 100] reads 1.0275 spread after M_123's 1.0278 spread landing); PTQVCNM tight + PTTVCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_124 ([1, 100] reads 0.9955 tight advancing one tick from M_123's 0.9956 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqvcnm &lt; ${tight_ptqvcnm_max}, spread = ptqvcnm in [${tight_ptqvcnm_max}, ${wide_ptqvcnm_min}), wide = ptqvcnm &ge; ${wide_ptqvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
