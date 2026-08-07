// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.504).
//
// WHOLE-POOL RANGE-AGAINST-QUINVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUINVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 125, M_125):
//
//   ptqivcnm = (max - min) / quinvigintcentinagintic_mean
//
// where quinvigintcentinagintic_mean = ((sum x_i^125) / n)^(1/125).
// Reads the peak spread against the QUINVIGINTCENTINAGINTIC
// (power-mean-of-order-125) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.502 PTQVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-FIFTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-fourth does,
// dampening the ratio against the range even harder.
//
// PTQIVCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-125) CENTER.
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
// quattuorvigintcentinagintic M_124) power-mean
// SEXQUINQUAGINTASEPTUAGINTUPLET into a
// SEPTQUINQUAGINTASEPTUAGINTUPLET with the M_125
// quinvigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_125 >= M_124, so
// quinvigintcentinagintic_mean >= quattuorvigintcentinagintic_mean and
// ptqivcnm <= ptqvcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinvigintcentinagintic_mean approaches x_max / n^(1/125), so
// ptqivcnm approaches n^(1/125) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/125) ~= 1.0186, for n=20 ~= 1.0243, for n=30 ~= 1.0276,
// for n=40 ~= 1.0300, for n=50 ~= 1.0318, for n=60 ~= 1.0333,
// for n=70 ~= 1.0346, for n=80 ~= 1.0357, for n=85 ~= 1.0362,
// for n=89 ~= 1.0366, for n=90 ~= 1.0367 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/125) ~= 1.0375)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/125) ~= 1.0375, and the pool100
// [1x99, 100] reference reads 1.0272 spread (further absorbed
// from PTQVCNM's 1.0275 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_125.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinvigintcentinagintic_mean = k,
//                                     range 0, ptqivcnm 0 (tight).
//   * uniform ramp [1..10]          -> QICNM ~= 9.8175, range 9,
//                                     ptqivcnm ~= 0.9167 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQVCNM 0.9169 at M_124).
//   * upper-outlier [1x9, 10]       -> QICNM ~= 9.8175, range 9,
//                                     ptqivcnm ~= 0.9167 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_125;
//                                     the M_124 joint collapse at
//                                     0.9169 persists at M_125 as a
//                                     joint 0.9167 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/125) ~ 9.8175 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QICNM ~= 4.9360, range 4,
//                                     ptqivcnm ~= 0.8104 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQVCNM 0.8105 at M_124).
//   * 50/50 split [1x5, 10x5]       -> QICNM ~= 9.9447, range 9,
//                                     ptqivcnm ~= 0.9050 (tight --
//                                     JOINT with PTQVCNM 0.9050 at
//                                     M_124).
//   * extreme outlier [1x9, 100]    -> QICNM ~= 98.1748, range 99,
//                                     ptqivcnm ~= 1.0084 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/125) ~ 1.0186 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQVCNM 1.0086 at M_124).
//   * two-partner [1, 9]            -> QICNM ~= 8.9502, range 8,
//                                     ptqivcnm ~= 0.8938 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQVCNM 0.8939 at M_124).
//   * two-partner [1, 100]          -> QICNM ~= 99.4470, range 99,
//                                     ptqivcnm ~= 0.9955 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTQVCNM 0.9955 at
//                                     M_124).
//   * small [10, 1, 1]              -> QICNM ~= 9.9125, range 9,
//                                     ptqivcnm ~= 0.9079 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQVCNM 0.9080 at M_124).
//   * pool_count=100 [1x99, 100]    -> QICNM ~= 96.3829, range 99,
//                                     ptqivcnm ~= 1.0272 (SPREAD --
//                                     FURTHER ABSORBED from PTQVCNM
//                                     M_124's 1.0275 spread; the
//                                     100-partner asymptote
//                                     100^(1/125) ~ 1.0375 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_125
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptqivcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinvigintcentinagintic_mean == 0
//   * tight                ptqivcnm < 1.005
//   * spread               ptqivcnm in [1.005, 1.09)
//   * wide                 ptqivcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqivcnm_max /
// wide_ptqivcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.505):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorvigintcentinaginticMeanSection
// (P11.503) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinvigintcentinagintic-center
// after the P11.503 range-against-quattuorvigintcentinagintic-center landing.

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
type PtqivcnmLabel =
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

// Bands on raw ptqivcnm (fixed cutoffs since quinvigintcentinagintic_mean
// scales with cell counts and typical quinvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_125 is 0.9167
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0187
// (M_124) to 1.0186 (M_125), 20-partner drops from 1.0245 to 1.0243,
// 30-partner drops from 1.0278 to 1.0276, 40-partner drops from
// 1.0302 to 1.0300, 50-partner drops from 1.0321 to 1.0318,
// 60-partner drops from 1.0336 to 1.0333, 70-partner drops from
// 1.0349 to 1.0346, 80-partner drops from 1.0360 to 1.0357,
// 85-partner drops from 1.0365 to 1.0362, 89-partner drops from
// 1.0369 to 1.0366, 90-partner drops from 1.0370 to 1.0367 -- so
// pool_count >= 100 (100^(1/125) ~ 1.0375) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQVCNM 1.0275 spread to PTQIVCNM 1.0272 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQIVCNM_MAX = 1.005;
const WIDE_PTQIVCNM_MIN = 1.09;

// PTQIVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQIVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqivcnm_max: number;
  readonly wide_ptqivcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanMap;
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

// Peak-to-quinvigintcentinagintic-mean of a discrete distribution:
//   PTQIVCNM = (max - min) / quinvigintcentinagintic_mean
// where quinvigintcentinagintic_mean = ((sum x_i^125) / n)^(1/125).
// Returns null on empty, solo, and degenerate (zero
// quinvigintcentinagintic_mean or non-finite hundred-and-twenty-fifth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^125 = x^64 * x^32 * x^16 * x^8 * x^4 * x^1 = p64 * p32 * p16 * oct * quad * v
    hundredTwentyFifthSum += p64 * p32 * p16 * oct * quad * v;
  }
  if (
    !Number.isFinite(hundredTwentyFifthSum) ||
    hundredTwentyFifthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinvigintcentinagintic_mean: null,
    };
  }
  const quinvigintcentinagintic_mean = Math.pow(
    hundredTwentyFifthSum / pool_count,
    1 / 125,
  );
  if (
    !Number.isFinite(quinvigintcentinagintic_mean) ||
    quinvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqivcnm = range / quinvigintcentinagintic_mean;
  const clamped = ptqivcnm < 0 ? 0 : ptqivcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinvigintcentinagintic_mean: roundTo(clamped, PTQIVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinvigintcentinagintic_mean:
      partner.peak_to_quinvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinvigintcentinagintic_mean:
      metric.peak_to_quinvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMean {
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
    tight_ptqivcnm_max: TIGHT_PTQIVCNM_MAX,
    wide_ptqivcnm_min: WIDE_PTQIVCNM_MIN,
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

function labelForPtqivcnm(
  pool_count: number,
  pool_cells: number,
  ptqivcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqivcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqivcnm === null) return "degenerate";
  if (ptqivcnm >= wide_min) return "wide";
  if (ptqivcnm < tight_max) return "tight";
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

function renderPtqivcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqivcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqivcnm(
    pool_count,
    pool_cells,
    ptqivcnm,
    tight_max,
    wide_min,
  );
  const ptqivcnmText = ptqivcnm === null ? "-" : ptqivcnm.toFixed(4);
  return `PTQIVCNM ${ptqivcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqivcnm_max, wide_ptqivcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqivcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinvigintcentinagintic_mean, tight_ptqivcnm_max, wide_ptqivcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqivcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinvigintcentinagintic_mean, tight_ptqivcnm_max, wide_ptqivcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqivcnm = (max - min) / quinvigintcentinagintic_mean where quinvigintcentinagintic_mean = ((sum x_i^125) / n)^(1/125). Reads the pool's total RANGE in units of its QUINVIGINTCENTINAGINTIC (power-mean-of-order-125, M_125) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.502 PTQVCNM because raising to the ONE-HUNDRED-AND-TWENTY-FIFTH power lifts the anchor MORE than raising to the hundred-and-twenty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorvigintcentinagintic) power-mean SEXQUINQUAGINTASEPTUAGINTUPLET into a SEPTQUINQUAGINTASEPTUAGINTUPLET with the M_125 quinvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqivcnm approaches n^(1/125) so 10-partner pools cap near 1.0186, 20-partner near 1.0243, 30-partner near 1.0276, 40-partner near 1.0300, 50-partner near 1.0318, 60-partner near 1.0333, 70-partner near 1.0346, 80-partner near 1.0357, 85-partner near 1.0362, 89-partner near 1.0366 and 90-partner near 1.0367 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/125) ~= 1.0375) are required to escape into wide with a modest outlier. Composite regime labels: PTQIVCNM tight + PTQVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQIVCNM 0.9167 tight -- rejoining the uniform ramp's 0.9167 for the forty-fourth tick in the sequence after PTQVCNM's 0.9169 joint bucket at M_124); PTQIVCNM spread + PTQVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQIVCNM 1.0084 spread -- two 4-decimal ticks below PTQVCNM's 1.0086); PTQIVCNM spread + PTQVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_125 ([1x99, 100] reads 1.0272 spread after M_124's 1.0275 spread landing); PTQIVCNM tight + PTQVCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_125 ([1, 100] reads 0.9955 tight matching M_124's 0.9955 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqivcnm &lt; ${tight_ptqivcnm_max}, spread = ptqivcnm in [${tight_ptqivcnm_max}, ${wide_ptqivcnm_min}), wide = ptqivcnm &ge; ${wide_ptqivcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqivcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
