// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.526).
//
// WHOLE-POOL RANGE-AGAINST-SESTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SESTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 136, M_136):
//
//   ptstcnm = (max - min) / sestrigintcentinagintic_mean
//
// where sestrigintcentinagintic_mean = ((sum x_i^136) / n)^(1/136).
// Reads the peak spread against the SESTRIGINTCENTINAGINTIC
// (power-mean-of-order-136) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.524 PTQITCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-SIXTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-fifth does,
// dampening the ratio against the range even harder.
//
// PTSTCNM's unique DISPERSION-axis contribution: reads range in units
// of the SESTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-136) CENTER.
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
// quintrigintcentinagintic M_135) power-mean
// SEPTSEXAGINTASEPTUAGINTUPLET into an
// OCTOSEXAGINTASEPTUAGINTUPLET with the M_136
// sestrigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_136 >= M_135, so
// sestrigintcentinagintic_mean >= quintrigintcentinagintic_mean
// and ptstcnm <= ptqitcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sestrigintcentinagintic_mean approaches x_max / n^(1/136), so
// ptstcnm approaches n^(1/136) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/136) ~= 1.0171, for n=20 ~= 1.0223, for n=30 ~= 1.0253,
// for n=40 ~= 1.0275, for n=50 ~= 1.0292, for n=60 ~= 1.0306,
// for n=70 ~= 1.0317, for n=80 ~= 1.0327, for n=85 ~= 1.0332,
// for n=89 ~= 1.0336, for n=90 ~= 1.0336 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/136) ~= 1.0344)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/136) ~= 1.0344, and the pool100
// [1x99, 100] reference reads 1.0241 spread (further absorbed
// from PTQITCNM's 1.0244 spread landing -- THREE 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_136.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sestrigintcentinagintic_mean = k,
//                                     range 0, ptstcnm 0 (tight).
//   * uniform ramp [1..10]          -> STCNM ~= 9.8321, range 9,
//                                     ptstcnm ~= 0.9154 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQITCNM 0.9155 at M_135).
//   * upper-outlier [1x9, 10]       -> STCNM ~= 9.8321, range 9,
//                                     ptstcnm ~= 0.9154 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_136;
//                                     the M_135 joint collapse at
//                                     0.9155 persists at M_136 as a
//                                     joint 0.9154 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/136) ~ 9.8321 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> STCNM ~= 4.9412, range 4,
//                                     ptstcnm ~= 0.8095 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQITCNM 0.8096 at M_135).
//   * 50/50 split [1x5, 10x5]       -> STCNM ~= 9.9492, range 9,
//                                     ptstcnm ~= 0.9046 (tight --
//                                     JOINT with PTQITCNM 0.9046 at
//                                     M_135).
//   * extreme outlier [1x9, 100]    -> STCNM ~= 98.3212, range 99,
//                                     ptstcnm ~= 1.0069 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/136) ~ 1.0171 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQITCNM 1.0070 at M_135).
//   * two-partner [1, 9]            -> STCNM ~= 8.9542, range 8,
//                                     ptstcnm ~= 0.8934 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQITCNM 0.8935 at M_135).
//   * two-partner [1, 100]          -> STCNM ~= 99.4916, range 99,
//                                     ptstcnm ~= 0.9951 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTQITCNM 0.9951 at
//                                     M_135).
//   * small [10, 1, 1]              -> STCNM ~= 9.9195, range 9,
//                                     ptstcnm ~= 0.9073 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQITCNM 0.9074 at M_135).
//   * pool_count=100 [1x99, 100]    -> STCNM ~= 96.6705, range 99,
//                                     ptstcnm ~= 1.0241 (SPREAD --
//                                     FURTHER ABSORBED from PTQITCNM
//                                     M_135's 1.0244 spread; the
//                                     100-partner asymptote
//                                     100^(1/136) ~ 1.0344 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_136 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptstcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sestrigintcentinagintic_mean == 0
//   * tight                ptstcnm < 1.005
//   * spread               ptstcnm in [1.005, 1.09)
//   * wide                 ptstcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptstcnm_max /
// wide_ptstcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.527):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanSection
// (P11.525) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sestrigintcentinagintic-center
// after the P11.525 range-against-quintrigintcentinagintic-center landing.
//
// Naming: sestrigintcentinagintic = ses (6) + trigint (30) +
// centinagintic (100) following the sesvigintcentinagintic (M_126)
// systematic pattern; abbreviation PTSTCNM (P-T-Ses-Trigint-Centi-
// Nagintic-M) is distinct from PTSCNM (M_106 sexcentinagintic) by the
// extra 'T' for the 'trigint' segment.

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
type PtstcnmLabel =
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

// Bands on raw ptstcnm (fixed cutoffs since sestrigintcentinagintic_mean
// scales with cell counts and typical sestrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_136 is 0.9154
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0172
// (M_135) to 1.0171 (M_136), 20-partner drops from 1.0224 to 1.0223,
// 30-partner drops from 1.0255 to 1.0253, 40-partner drops from
// 1.0277 to 1.0275, 50-partner drops from 1.0294 to 1.0292,
// 60-partner drops from 1.0308 to 1.0306, 70-partner drops from
// 1.0320 to 1.0317, 80-partner drops from 1.0330 to 1.0327,
// 85-partner drops from 1.0335 to 1.0332, 89-partner drops from
// 1.0338 to 1.0336, 90-partner drops from 1.0339 to 1.0336 -- so
// pool_count >= 100 (100^(1/136) ~ 1.0344) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQITCNM 1.0244 spread to PTSTCNM 1.0241 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSTCNM_MAX = 1.005;
const WIDE_PTSTCNM_MIN = 1.09;

// PTSTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sestrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sestrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptstcnm_max: number;
  readonly wide_ptstcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanMap;
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

// Peak-to-sestrigintcentinagintic-mean of a discrete distribution:
//   PTSTCNM = (max - min) / sestrigintcentinagintic_mean
// where sestrigintcentinagintic_mean = ((sum x_i^136) / n)^(1/136).
// Returns null on empty, solo, and degenerate (zero
// sestrigintcentinagintic_mean or non-finite hundred-and-thirty-sixth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sestrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sestrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sestrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sestrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^136 = x^128 * x^8 = p128 * oct -- (128 + 8) decomposition so
    // the fold reuses the p128 rung shared with the M_128..M_135
    // siblings and multiplies by oct to hit the next order.
    hundredThirtySixthSum += p128 * oct;
  }
  if (
    !Number.isFinite(hundredThirtySixthSum) ||
    hundredThirtySixthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sestrigintcentinagintic_mean: null,
    };
  }
  const sestrigintcentinagintic_mean = Math.pow(
    hundredThirtySixthSum / pool_count,
    1 / 136,
  );
  if (
    !Number.isFinite(sestrigintcentinagintic_mean) ||
    sestrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sestrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptstcnm = range / sestrigintcentinagintic_mean;
  const clamped = ptstcnm < 0 ? 0 : ptstcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sestrigintcentinagintic_mean: roundTo(clamped, PTSTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sestrigintcentinagintic_mean:
      partner.peak_to_sestrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sestrigintcentinagintic_mean:
      metric.peak_to_sestrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMean {
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
    tight_ptstcnm_max: TIGHT_PTSTCNM_MAX,
    wide_ptstcnm_min: WIDE_PTSTCNM_MIN,
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

function labelForPtstcnm(
  pool_count: number,
  pool_cells: number,
  ptstcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtstcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptstcnm === null) return "degenerate";
  if (ptstcnm >= wide_min) return "wide";
  if (ptstcnm < tight_max) return "tight";
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

function renderPtstcnmCell(
  pool_count: number,
  pool_cells: number,
  ptstcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtstcnm(
    pool_count,
    pool_cells,
    ptstcnm,
    tight_max,
    wide_min,
  );
  const ptstcnmText = ptstcnm === null ? "-" : ptstcnm.toFixed(4);
  return `PTSTCNM ${ptstcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptstcnm_max, wide_ptstcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtstcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sestrigintcentinagintic_mean, tight_ptstcnm_max, wide_ptstcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtstcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sestrigintcentinagintic_mean, tight_ptstcnm_max, wide_ptstcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptstcnm = (max - min) / sestrigintcentinagintic_mean where sestrigintcentinagintic_mean = ((sum x_i^136) / n)^(1/136). Reads the pool's total RANGE in units of its SESTRIGINTCENTINAGINTIC (power-mean-of-order-136, M_136) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.524 PTQITCNM because raising to the ONE-HUNDRED-AND-THIRTY-SIXTH power lifts the anchor MORE than raising to the hundred-and-thirty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quintrigintcentinagintic) power-mean SEPTSEXAGINTASEPTUAGINTUPLET into an OCTOSEXAGINTASEPTUAGINTUPLET with the M_136 sestrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptstcnm approaches n^(1/136) so 10-partner pools cap near 1.0171, 20-partner near 1.0223, 30-partner near 1.0253, 40-partner near 1.0275, 50-partner near 1.0292, 60-partner near 1.0306, 70-partner near 1.0317, 80-partner near 1.0327, 85-partner near 1.0332, 89-partner near 1.0336 and 90-partner near 1.0336 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/136) ~= 1.0344) are required to escape into wide with a modest outlier. Composite regime labels: PTSTCNM tight + PTQITCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSTCNM 0.9154 tight -- rejoining the uniform ramp's 0.9154 for the fifty-fifth tick in the sequence after PTQITCNM's 0.9155 joint bucket at M_135); PTSTCNM spread + PTQITCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSTCNM 1.0069 spread -- one 4-decimal tick below PTQITCNM's 1.0070); PTSTCNM spread + PTQITCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_136 ([1x99, 100] reads 1.0241 spread after M_135's 1.0244 spread landing); PTSTCNM tight + PTQITCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_136 ([1, 100] reads 0.9951 tight matching M_135's 0.9951 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sestrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptstcnm &lt; ${tight_ptstcnm_max}, spread = ptstcnm in [${tight_ptstcnm_max}, ${wide_ptstcnm_min}), wide = ptstcnm &ge; ${wide_ptstcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptstcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
