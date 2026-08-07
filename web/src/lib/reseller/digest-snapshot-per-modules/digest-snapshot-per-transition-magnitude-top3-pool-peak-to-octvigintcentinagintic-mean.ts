// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.510).
//
// WHOLE-POOL RANGE-AGAINST-OCTVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's OCTVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 128, M_128):
//
//   ptovcnm = (max - min) / octvigintcentinagintic_mean
//
// where octvigintcentinagintic_mean = ((sum x_i^128) / n)^(1/128).
// Reads the peak spread against the OCTVIGINTCENTINAGINTIC
// (power-mean-of-order-128) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.508 PTSPVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-EIGHTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-seventh does,
// dampening the ratio against the range even harder.
//
// PTOVCNM's unique DISPERSION-axis contribution: reads range in units
// of the OCTVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-128) CENTER.
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
// sesvigintcentinagintic M_126, septvigintcentinagintic M_127)
// power-mean NOVQUINQUAGINTASEPTUAGINTUPLET into a SEXAGINTASEPTUAGINTUPLET
// with the M_128 octvigintcentinagintic mean -- climbing one step
// further into the third dozen of the triple-digit family opened
// at PTCNM. By the Power Mean inequality M_128 >= M_127, so
// octvigintcentinagintic_mean >= septvigintcentinagintic_mean and
// ptovcnm <= ptspvcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octvigintcentinagintic_mean approaches x_max / n^(1/128), so
// ptovcnm approaches n^(1/128) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/128) ~= 1.0182, for n=20 ~= 1.0237, for n=30 ~= 1.0269,
// for n=40 ~= 1.0292, for n=50 ~= 1.0310, for n=60 ~= 1.0325,
// for n=70 ~= 1.0337, for n=80 ~= 1.0348, for n=85 ~= 1.0353,
// for n=89 ~= 1.0357, for n=90 ~= 1.0358 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/128) ~= 1.0366)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/128) ~= 1.0366, and the pool100
// [1x99, 100] reference reads 1.0263 spread (further absorbed
// from PTSPVCNM's 1.0266 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_128.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octvigintcentinagintic_mean = k,
//                                     range 0, ptovcnm 0 (tight).
//   * uniform ramp [1..10]          -> OVCNM ~= 9.8217, range 9,
//                                     ptovcnm ~= 0.9163 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPVCNM 0.9165 at M_127).
//   * upper-outlier [1x9, 10]       -> OVCNM ~= 9.8217, range 9,
//                                     ptovcnm ~= 0.9163 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_128;
//                                     the M_127 joint collapse at
//                                     0.9165 persists at M_128 as a
//                                     joint 0.9163 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/128) ~ 9.8217 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> OVCNM ~= 4.9375, range 4,
//                                     ptovcnm ~= 0.8101 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPVCNM 0.8102 at M_127).
//   * 50/50 split [1x5, 10x5]       -> OVCNM ~= 9.9460, range 9,
//                                     ptovcnm ~= 0.9049 (tight --
//                                     JOINT with PTSPVCNM 0.9049 at
//                                     M_127).
//   * extreme outlier [1x9, 100]    -> OVCNM ~= 98.2172, range 99,
//                                     ptovcnm ~= 1.0080 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/128) ~ 1.0182 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPVCNM 1.0081 at M_127).
//   * two-partner [1, 9]            -> OVCNM ~= 8.9514, range 8,
//                                     ptovcnm ~= 0.8937 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTSPVCNM 0.8938 at M_127).
//   * two-partner [1, 100]          -> OVCNM ~= 99.4599, range 99,
//                                     ptovcnm ~= 0.9954 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTSPVCNM 0.9954 at
//                                     M_127).
//   * small [10, 1, 1]              -> OVCNM ~= 9.9145, range 9,
//                                     ptovcnm ~= 0.9078 (tight --
//                                     JOINT with PTSPVCNM 0.9078 at
//                                     M_127).
//   * pool_count=100 [1x99, 100]    -> OVCNM ~= 96.4662, range 99,
//                                     ptovcnm ~= 1.0263 (SPREAD --
//                                     FURTHER ABSORBED from PTSPVCNM
//                                     M_127's 1.0266 spread; the
//                                     100-partner asymptote
//                                     100^(1/128) ~ 1.0366 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_128
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptovcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octvigintcentinagintic_mean == 0
//   * tight                ptovcnm < 1.005
//   * spread               ptovcnm in [1.005, 1.09)
//   * wide                 ptovcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptovcnm_max /
// wide_ptovcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.511):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanSection
// (P11.509) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octvigintcentinagintic-center
// after the P11.509 range-against-septvigintcentinagintic-center landing.

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
type PtovcnmLabel =
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

// Bands on raw ptovcnm (fixed cutoffs since octvigintcentinagintic_mean
// scales with cell counts and typical octvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_128 is 0.9163
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0183
// (M_127) to 1.0182 (M_128), 20-partner drops from 1.0239 to 1.0237,
// 30-partner drops from 1.0271 to 1.0269, 40-partner drops from
// 1.0295 to 1.0292, 50-partner drops from 1.0313 to 1.0310,
// 60-partner drops from 1.0328 to 1.0325, 70-partner drops from
// 1.0340 to 1.0337, 80-partner drops from 1.0351 to 1.0348,
// 85-partner drops from 1.0356 to 1.0353, 89-partner drops from
// 1.0360 to 1.0357, 90-partner drops from 1.0361 to 1.0358 -- so
// pool_count >= 100 (100^(1/128) ~ 1.0366) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSPVCNM 1.0266 spread to PTOVCNM 1.0263 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOVCNM_MAX = 1.005;
const WIDE_PTOVCNM_MIN = 1.09;

// PTOVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptovcnm_max: number;
  readonly wide_ptovcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanMap;
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

// Peak-to-octvigintcentinagintic-mean of a discrete distribution:
//   PTOVCNM = (max - min) / octvigintcentinagintic_mean
// where octvigintcentinagintic_mean = ((sum x_i^128) / n)^(1/128).
// Returns null on empty, solo, and degenerate (zero
// octvigintcentinagintic_mean or non-finite hundred-and-twenty-eighth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^128 = (x^64)^2 = p64 * p64 -- clean power-of-two decomposition
    // (128 = 2^7) so the fold reduces to a single multiplication above
    // the p64 rung shared with every M_65..M_127 sibling.
    hundredTwentyEighthSum += p64 * p64;
  }
  if (
    !Number.isFinite(hundredTwentyEighthSum) ||
    hundredTwentyEighthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octvigintcentinagintic_mean: null,
    };
  }
  const octvigintcentinagintic_mean = Math.pow(
    hundredTwentyEighthSum / pool_count,
    1 / 128,
  );
  if (
    !Number.isFinite(octvigintcentinagintic_mean) ||
    octvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptovcnm = range / octvigintcentinagintic_mean;
  const clamped = ptovcnm < 0 ? 0 : ptovcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_octvigintcentinagintic_mean: roundTo(clamped, PTOVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octvigintcentinagintic_mean:
      partner.peak_to_octvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octvigintcentinagintic_mean:
      metric.peak_to_octvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMean {
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
    tight_ptovcnm_max: TIGHT_PTOVCNM_MAX,
    wide_ptovcnm_min: WIDE_PTOVCNM_MIN,
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

function labelForPtovcnm(
  pool_count: number,
  pool_cells: number,
  ptovcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtovcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptovcnm === null) return "degenerate";
  if (ptovcnm >= wide_min) return "wide";
  if (ptovcnm < tight_max) return "tight";
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

function renderPtovcnmCell(
  pool_count: number,
  pool_cells: number,
  ptovcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtovcnm(
    pool_count,
    pool_cells,
    ptovcnm,
    tight_max,
    wide_min,
  );
  const ptovcnmText = ptovcnm === null ? "-" : ptovcnm.toFixed(4);
  return `PTOVCNM ${ptovcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptovcnm_max, wide_ptovcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtovcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octvigintcentinagintic_mean, tight_ptovcnm_max, wide_ptovcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtovcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octvigintcentinagintic_mean, tight_ptovcnm_max, wide_ptovcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptovcnm = (max - min) / octvigintcentinagintic_mean where octvigintcentinagintic_mean = ((sum x_i^128) / n)^(1/128). Reads the pool's total RANGE in units of its OCTVIGINTCENTINAGINTIC (power-mean-of-order-128, M_128) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.508 PTSPVCNM because raising to the ONE-HUNDRED-AND-TWENTY-EIGHTH power lifts the anchor MORE than raising to the hundred-and-twenty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septvigintcentinagintic) power-mean NOVQUINQUAGINTASEPTUAGINTUPLET into a SEXAGINTASEPTUAGINTUPLET with the M_128 octvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptovcnm approaches n^(1/128) so 10-partner pools cap near 1.0182, 20-partner near 1.0237, 30-partner near 1.0269, 40-partner near 1.0292, 50-partner near 1.0310, 60-partner near 1.0325, 70-partner near 1.0337, 80-partner near 1.0348, 85-partner near 1.0353, 89-partner near 1.0357 and 90-partner near 1.0358 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/128) ~= 1.0366) are required to escape into wide with a modest outlier. Composite regime labels: PTOVCNM tight + PTSPVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTOVCNM 0.9163 tight -- rejoining the uniform ramp's 0.9163 for the forty-seventh tick in the sequence after PTSPVCNM's 0.9165 joint bucket at M_127); PTOVCNM spread + PTSPVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOVCNM 1.0080 spread -- one 4-decimal tick below PTSPVCNM's 1.0081); PTOVCNM spread + PTSPVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_128 ([1x99, 100] reads 1.0263 spread after M_127's 1.0266 spread landing); PTOVCNM tight + PTSPVCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_128 ([1, 100] reads 0.9954 tight rejoining M_127's 0.9954 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptovcnm &lt; ${tight_ptovcnm_max}, spread = ptovcnm in [${tight_ptovcnm_max}, ${wide_ptovcnm_min}), wide = ptovcnm &ge; ${wide_ptovcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptovcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
