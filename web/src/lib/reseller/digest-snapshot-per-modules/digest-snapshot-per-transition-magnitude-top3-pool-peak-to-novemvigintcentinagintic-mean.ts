// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.512).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's NOVEMVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 129, M_129):
//
//   ptnvcnm = (max - min) / novemvigintcentinagintic_mean
//
// where novemvigintcentinagintic_mean = ((sum x_i^129) / n)^(1/129).
// Reads the peak spread against the NOVEMVIGINTCENTINAGINTIC
// (power-mean-of-order-129) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.510 PTOVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-NINTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-eighth does,
// dampening the ratio against the range even harder.
//
// PTNVCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-129) CENTER.
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
// octvigintcentinagintic M_128) power-mean SEXAGINTASEPTUAGINTUPLET
// into an UNSEXAGINTASEPTUAGINTUPLET with the M_129 novemvigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_129 >= M_128, so novemvigintcentinagintic_mean >=
// octvigintcentinagintic_mean and ptnvcnm <= ptovcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemvigintcentinagintic_mean approaches x_max / n^(1/129), so
// ptnvcnm approaches n^(1/129) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/129) ~= 1.0180, for n=20 ~= 1.0235, for n=30 ~= 1.0267,
// for n=40 ~= 1.0290, for n=50 ~= 1.0308, for n=60 ~= 1.0322,
// for n=70 ~= 1.0335, for n=80 ~= 1.0346, for n=85 ~= 1.0350,
// for n=89 ~= 1.0354, for n=90 ~= 1.0355 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/129) ~= 1.0363)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/129) ~= 1.0363, and the pool100
// [1x99, 100] reference reads 1.0260 spread (further absorbed
// from PTOVCNM's 1.0263 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_129.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemvigintcentinagintic_mean = k,
//                                     range 0, ptnvcnm 0 (tight).
//   * uniform ramp [1..10]          -> NVCNM ~= 9.8231, range 9,
//                                     ptnvcnm ~= 0.9162 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOVCNM 0.9163 at M_128).
//   * upper-outlier [1x9, 10]       -> NVCNM ~= 9.8231, range 9,
//                                     ptnvcnm ~= 0.9162 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_129;
//                                     the M_128 joint collapse at
//                                     0.9163 persists at M_129 as a
//                                     joint 0.9162 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/129) ~ 9.8231 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> NVCNM ~= 4.9380, range 4,
//                                     ptnvcnm ~= 0.8100 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOVCNM 0.8101 at M_128).
//   * 50/50 split [1x5, 10x5]       -> NVCNM ~= 9.9464, range 9,
//                                     ptnvcnm ~= 0.9048 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOVCNM 0.9049 at M_128).
//   * extreme outlier [1x9, 100]    -> NVCNM ~= 98.2309, range 99,
//                                     ptnvcnm ~= 1.0078 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/129) ~ 1.0180 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTOVCNM 1.0080 at M_128).
//   * two-partner [1, 9]            -> NVCNM ~= 8.9518, range 8,
//                                     ptnvcnm ~= 0.8937 (tight --
//                                     JOINT with PTOVCNM 0.8937 at
//                                     M_128).
//   * two-partner [1, 100]          -> NVCNM ~= 99.4641, range 99,
//                                     ptnvcnm ~= 0.9953 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick from
//                                     PTOVCNM 0.9954 at M_128).
//   * small [10, 1, 1]              -> NVCNM ~= 9.9152, range 9,
//                                     ptnvcnm ~= 0.9077 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTOVCNM 0.9078 at M_128).
//   * pool_count=100 [1x99, 100]    -> NVCNM ~= 96.4931, range 99,
//                                     ptnvcnm ~= 1.0260 (SPREAD --
//                                     FURTHER ABSORBED from PTOVCNM
//                                     M_128's 1.0263 spread; the
//                                     100-partner asymptote
//                                     100^(1/129) ~ 1.0363 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_129
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptnvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemvigintcentinagintic_mean == 0
//   * tight                ptnvcnm < 1.005
//   * spread               ptnvcnm in [1.005, 1.09)
//   * wide                 ptnvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnvcnm_max /
// wide_ptnvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.513):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctvigintcentinaginticMeanSection
// (P11.511) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemvigintcentinagintic-center
// after the P11.511 range-against-octvigintcentinagintic-center landing.

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
type PtnvcnmLabel =
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

// Bands on raw ptnvcnm (fixed cutoffs since novemvigintcentinagintic_mean
// scales with cell counts and typical novemvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_129 is 0.9162
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0182
// (M_128) to 1.0180 (M_129), 20-partner drops from 1.0237 to 1.0235,
// 30-partner drops from 1.0269 to 1.0267, 40-partner drops from
// 1.0292 to 1.0290, 50-partner drops from 1.0310 to 1.0308,
// 60-partner drops from 1.0325 to 1.0322, 70-partner drops from
// 1.0337 to 1.0335, 80-partner drops from 1.0348 to 1.0346,
// 85-partner drops from 1.0353 to 1.0350, 89-partner drops from
// 1.0357 to 1.0354, 90-partner drops from 1.0358 to 1.0355 -- so
// pool_count >= 100 (100^(1/129) ~ 1.0363) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTOVCNM 1.0263 spread to PTNVCNM 1.0260 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNVCNM_MAX = 1.005;
const WIDE_PTNVCNM_MIN = 1.09;

// PTNVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnvcnm_max: number;
  readonly wide_ptnvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanMap;
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

// Peak-to-novemvigintcentinagintic-mean of a discrete distribution:
//   PTNVCNM = (max - min) / novemvigintcentinagintic_mean
// where novemvigintcentinagintic_mean = ((sum x_i^129) / n)^(1/129).
// Returns null on empty, solo, and degenerate (zero
// novemvigintcentinagintic_mean or non-finite hundred-and-twenty-ninth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^129 = x^128 * x = p128 * v -- (128 + 1) decomposition so the
    // fold reuses the p128 rung shared with the M_128 sibling and
    // multiplies by v once more to hit the next order.
    hundredTwentyNinthSum += p128 * v;
  }
  if (
    !Number.isFinite(hundredTwentyNinthSum) ||
    hundredTwentyNinthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemvigintcentinagintic_mean: null,
    };
  }
  const novemvigintcentinagintic_mean = Math.pow(
    hundredTwentyNinthSum / pool_count,
    1 / 129,
  );
  if (
    !Number.isFinite(novemvigintcentinagintic_mean) ||
    novemvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnvcnm = range / novemvigintcentinagintic_mean;
  const clamped = ptnvcnm < 0 ? 0 : ptnvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemvigintcentinagintic_mean: roundTo(clamped, PTNVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemvigintcentinagintic_mean:
      partner.peak_to_novemvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemvigintcentinagintic_mean:
      metric.peak_to_novemvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMean {
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
    tight_ptnvcnm_max: TIGHT_PTNVCNM_MAX,
    wide_ptnvcnm_min: WIDE_PTNVCNM_MIN,
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

function labelForPtnvcnm(
  pool_count: number,
  pool_cells: number,
  ptnvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtnvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnvcnm === null) return "degenerate";
  if (ptnvcnm >= wide_min) return "wide";
  if (ptnvcnm < tight_max) return "tight";
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

function renderPtnvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptnvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnvcnm(
    pool_count,
    pool_cells,
    ptnvcnm,
    tight_max,
    wide_min,
  );
  const ptnvcnmText = ptnvcnm === null ? "-" : ptnvcnm.toFixed(4);
  return `PTNVCNM ${ptnvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnvcnm_max, wide_ptnvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemvigintcentinagintic_mean, tight_ptnvcnm_max, wide_ptnvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemvigintcentinagintic_mean, tight_ptnvcnm_max, wide_ptnvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnvcnm = (max - min) / novemvigintcentinagintic_mean where novemvigintcentinagintic_mean = ((sum x_i^129) / n)^(1/129). Reads the pool's total RANGE in units of its NOVEMVIGINTCENTINAGINTIC (power-mean-of-order-129, M_129) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.510 PTOVCNM because raising to the ONE-HUNDRED-AND-TWENTY-NINTH power lifts the anchor MORE than raising to the hundred-and-twenty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octvigintcentinagintic) power-mean SEXAGINTASEPTUAGINTUPLET into an UNSEXAGINTASEPTUAGINTUPLET with the M_129 novemvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnvcnm approaches n^(1/129) so 10-partner pools cap near 1.0180, 20-partner near 1.0235, 30-partner near 1.0267, 40-partner near 1.0290, 50-partner near 1.0308, 60-partner near 1.0322, 70-partner near 1.0335, 80-partner near 1.0346, 85-partner near 1.0350, 89-partner near 1.0354 and 90-partner near 1.0355 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/129) ~= 1.0363) are required to escape into wide with a modest outlier. Composite regime labels: PTNVCNM tight + PTOVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNVCNM 0.9162 tight -- rejoining the uniform ramp's 0.9162 for the forty-eighth tick in the sequence after PTOVCNM's 0.9163 joint bucket at M_128); PTNVCNM spread + PTOVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNVCNM 1.0078 spread -- two 4-decimal ticks below PTOVCNM's 1.0080); PTNVCNM spread + PTOVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_129 ([1x99, 100] reads 1.0260 spread after M_128's 1.0263 spread landing); PTNVCNM tight + PTOVCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_129 ([1, 100] reads 0.9953 tight advancing one tick from M_128's 0.9954 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptnvcnm &lt; ${tight_ptnvcnm_max}, spread = ptnvcnm in [${tight_ptnvcnm_max}, ${wide_ptnvcnm_min}), wide = ptnvcnm &ge; ${wide_ptnvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
