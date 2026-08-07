// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.514).
//
// WHOLE-POOL RANGE-AGAINST-TRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's TRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 130, M_130):
//
//   pttcnm = (max - min) / trigintcentinagintic_mean
//
// where trigintcentinagintic_mean = ((sum x_i^130) / n)^(1/130).
// Reads the peak spread against the TRIGINTCENTINAGINTIC
// (power-mean-of-order-130) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.512 PTNVCNM, because raising to
// the ONE-HUNDRED-AND-THIRTIETH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-ninth does,
// dampening the ratio against the range even harder.
//
// PTTCNM's unique DISPERSION-axis contribution: reads range in units
// of the TRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-130) CENTER.
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
// octvigintcentinagintic M_128, novemvigintcentinagintic M_129)
// power-mean UNSEXAGINTASEPTUAGINTUPLET into a
// DUOSEXAGINTASEPTUAGINTUPLET with the M_130 trigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_130 >= M_129, so trigintcentinagintic_mean >=
// novemvigintcentinagintic_mean and pttcnm <= ptnvcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trigintcentinagintic_mean approaches x_max / n^(1/130), so
// pttcnm approaches n^(1/130) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/130) ~= 1.0179, for n=20 ~= 1.0233, for n=30 ~= 1.0264,
// for n=40 ~= 1.0288, for n=50 ~= 1.0306, for n=60 ~= 1.0320,
// for n=70 ~= 1.0333, for n=80 ~= 1.0343, for n=85 ~= 1.0348,
// for n=89 ~= 1.0351, for n=90 ~= 1.0352 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/130) ~= 1.0361)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/130) ~= 1.0361, and the pool100
// [1x99, 100] reference reads 1.0257 spread (further absorbed
// from PTNVCNM's 1.0260 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_130.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trigintcentinagintic_mean = k,
//                                     range 0, pttcnm 0 (tight).
//   * uniform ramp [1..10]          -> TCNM ~= 9.8244, range 9,
//                                     pttcnm ~= 0.9161 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNVCNM 0.9162 at M_129).
//   * upper-outlier [1x9, 10]       -> TCNM ~= 9.8244, range 9,
//                                     pttcnm ~= 0.9161 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_130;
//                                     the M_129 joint collapse at
//                                     0.9162 persists at M_130 as a
//                                     joint 0.9161 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/130) ~ 9.8244 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> TCNM ~= 4.9385, range 4,
//                                     pttcnm ~= 0.8100 (tight --
//                                     JOINT with PTNVCNM 0.8100 at
//                                     M_129).
//   * 50/50 split [1x5, 10x5]       -> TCNM ~= 9.9468, range 9,
//                                     pttcnm ~= 0.9048 (tight --
//                                     JOINT with PTNVCNM 0.9048 at
//                                     M_129).
//   * extreme outlier [1x9, 100]    -> TCNM ~= 98.2445, range 99,
//                                     pttcnm ~= 1.0077 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/130) ~ 1.0179 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTNVCNM 1.0078 at M_129).
//   * two-partner [1, 9]            -> TCNM ~= 8.9521, range 8,
//                                     pttcnm ~= 0.8936 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNVCNM 0.8937 at M_129).
//   * two-partner [1, 100]          -> TCNM ~= 99.4682, range 99,
//                                     pttcnm ~= 0.9953 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTNVCNM 0.9953 at
//                                     M_129).
//   * small [10, 1, 1]              -> TCNM ~= 9.9158, range 9,
//                                     pttcnm ~= 0.9076 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTNVCNM 0.9077 at M_129).
//   * pool_count=100 [1x99, 100]    -> TCNM ~= 96.5216, range 99,
//                                     pttcnm ~= 1.0257 (SPREAD --
//                                     FURTHER ABSORBED from PTNVCNM
//                                     M_129's 1.0260 spread; the
//                                     100-partner asymptote
//                                     100^(1/130) ~ 1.0361 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_130
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw pttcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trigintcentinagintic_mean == 0
//   * tight                pttcnm < 1.005
//   * spread               pttcnm in [1.005, 1.09)
//   * wide                 pttcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttcnm_max /
// wide_pttcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.515):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanSection
// (P11.513) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trigintcentinagintic-center
// after the P11.513 range-against-novemvigintcentinagintic-center landing.

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
type PttcnmLabel =
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

// Bands on raw pttcnm (fixed cutoffs since trigintcentinagintic_mean
// scales with cell counts and typical trigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_130 is 0.9161
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0180
// (M_129) to 1.0179 (M_130), 20-partner drops from 1.0235 to 1.0233,
// 30-partner drops from 1.0267 to 1.0264, 40-partner drops from
// 1.0290 to 1.0288, 50-partner drops from 1.0308 to 1.0306,
// 60-partner drops from 1.0322 to 1.0320, 70-partner drops from
// 1.0335 to 1.0333, 80-partner drops from 1.0346 to 1.0343,
// 85-partner drops from 1.0350 to 1.0348, 89-partner drops from
// 1.0354 to 1.0351, 90-partner drops from 1.0355 to 1.0352 -- so
// pool_count >= 100 (100^(1/130) ~ 1.0361) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTNVCNM 1.0260 spread to PTTCNM 1.0257 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTCNM_MAX = 1.005;
const WIDE_PTTCNM_MIN = 1.09;

// PTTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttcnm_max: number;
  readonly wide_pttcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanMap;
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

// Peak-to-trigintcentinagintic-mean of a discrete distribution:
//   PTTCNM = (max - min) / trigintcentinagintic_mean
// where trigintcentinagintic_mean = ((sum x_i^130) / n)^(1/130).
// Returns null on empty, solo, and degenerate (zero
// trigintcentinagintic_mean or non-finite hundred-and-thirtieth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_trigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^130 = x^128 * x^2 = p128 * sq -- (128 + 2) decomposition so the
    // fold reuses the p128 rung shared with the M_128/M_129 siblings and
    // multiplies by sq once more to hit the next order.
    hundredThirtiethSum += p128 * sq;
  }
  if (
    !Number.isFinite(hundredThirtiethSum) ||
    hundredThirtiethSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trigintcentinagintic_mean: null,
    };
  }
  const trigintcentinagintic_mean = Math.pow(
    hundredThirtiethSum / pool_count,
    1 / 130,
  );
  if (
    !Number.isFinite(trigintcentinagintic_mean) ||
    trigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttcnm = range / trigintcentinagintic_mean;
  const clamped = pttcnm < 0 ? 0 : pttcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_trigintcentinagintic_mean: roundTo(clamped, PTTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trigintcentinagintic_mean:
      partner.peak_to_trigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trigintcentinagintic_mean:
      metric.peak_to_trigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMean {
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
    tight_pttcnm_max: TIGHT_PTTCNM_MAX,
    wide_pttcnm_min: WIDE_PTTCNM_MIN,
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

function labelForPttcnm(
  pool_count: number,
  pool_cells: number,
  pttcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttcnm === null) return "degenerate";
  if (pttcnm >= wide_min) return "wide";
  if (pttcnm < tight_max) return "tight";
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

function renderPttcnmCell(
  pool_count: number,
  pool_cells: number,
  pttcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttcnm(
    pool_count,
    pool_cells,
    pttcnm,
    tight_max,
    wide_min,
  );
  const pttcnmText = pttcnm === null ? "-" : pttcnm.toFixed(4);
  return `PTTCNM ${pttcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttcnm_max, wide_pttcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trigintcentinagintic_mean, tight_pttcnm_max, wide_pttcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trigintcentinagintic_mean, tight_pttcnm_max, wide_pttcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttcnm = (max - min) / trigintcentinagintic_mean where trigintcentinagintic_mean = ((sum x_i^130) / n)^(1/130). Reads the pool's total RANGE in units of its TRIGINTCENTINAGINTIC (power-mean-of-order-130, M_130) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.512 PTNVCNM because raising to the ONE-HUNDRED-AND-THIRTIETH power lifts the anchor MORE than raising to the hundred-and-twenty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemvigintcentinagintic) power-mean UNSEXAGINTASEPTUAGINTUPLET into a DUOSEXAGINTASEPTUAGINTUPLET with the M_130 trigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttcnm approaches n^(1/130) so 10-partner pools cap near 1.0179, 20-partner near 1.0233, 30-partner near 1.0264, 40-partner near 1.0288, 50-partner near 1.0306, 60-partner near 1.0320, 70-partner near 1.0333, 80-partner near 1.0343, 85-partner near 1.0348, 89-partner near 1.0351 and 90-partner near 1.0352 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/130) ~= 1.0361) are required to escape into wide with a modest outlier. Composite regime labels: PTTCNM tight + PTNVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTCNM 0.9161 tight -- rejoining the uniform ramp's 0.9161 for the forty-ninth tick in the sequence after PTNVCNM's 0.9162 joint bucket at M_129); PTTCNM spread + PTNVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTCNM 1.0077 spread -- one 4-decimal tick below PTNVCNM's 1.0078); PTTCNM spread + PTNVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_130 ([1x99, 100] reads 1.0257 spread after M_129's 1.0260 spread landing); PTTCNM tight + PTNVCNM tight = ISOLATED HIGH PARTNER absorption HOLDS at M_130 ([1, 100] reads 0.9953 tight joint with M_129's 0.9953 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trigintcentinagintic_mean == 0 (guarded but unreachable), tight = pttcnm &lt; ${tight_pttcnm_max}, spread = pttcnm in [${tight_pttcnm_max}, ${wide_pttcnm_min}), wide = pttcnm &ge; ${wide_pttcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
