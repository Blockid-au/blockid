// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.518).
//
// WHOLE-POOL RANGE-AGAINST-DUOTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's DUOTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 132, M_132):
//
//   ptdtcnm = (max - min) / duotrigintcentinagintic_mean
//
// where duotrigintcentinagintic_mean = ((sum x_i^132) / n)^(1/132).
// Reads the peak spread against the DUOTRIGINTCENTINAGINTIC
// (power-mean-of-order-132) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.516 PTUTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-SECOND power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-first does,
// dampening the ratio against the range even harder.
//
// PTDTCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUOTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-132) CENTER.
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
// trigintcentinagintic M_130, untrigintcentinagintic M_131)
// power-mean TRESEXAGINTASEPTUAGINTUPLET into a
// QUATTUORSEXAGINTASEPTUAGINTUPLET with the M_132 duotrigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_132 >= M_131, so duotrigintcentinagintic_mean >=
// untrigintcentinagintic_mean and ptdtcnm <= ptutcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duotrigintcentinagintic_mean approaches x_max / n^(1/132), so
// ptdtcnm approaches n^(1/132) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/132) ~= 1.0176, for n=20 ~= 1.0230, for n=30 ~= 1.0261,
// for n=40 ~= 1.0283, for n=50 ~= 1.0301, for n=60 ~= 1.0315,
// for n=70 ~= 1.0327, for n=80 ~= 1.0338, for n=85 ~= 1.0342,
// for n=89 ~= 1.0346, for n=90 ~= 1.0347 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/132) ~= 1.0355)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/132) ~= 1.0355, and the pool100
// [1x99, 100] reference reads 1.0251 spread (further absorbed
// from PTUTCNM's 1.0254 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_132.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duotrigintcentinagintic_mean = k,
//                                     range 0, ptdtcnm 0 (tight).
//   * uniform ramp [1..10]          -> DTCNM ~= 9.8271, range 9,
//                                     ptdtcnm ~= 0.9158 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUTCNM 0.9160 at M_131).
//   * upper-outlier [1x9, 10]       -> DTCNM ~= 9.8271, range 9,
//                                     ptdtcnm ~= 0.9158 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_132;
//                                     the M_131 joint collapse at
//                                     0.9160 persists at M_132 as a
//                                     joint 0.9158 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/132) ~ 9.8271 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> DTCNM ~= 4.9394, range 4,
//                                     ptdtcnm ~= 0.8098 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUTCNM 0.8099 at M_131).
//   * 50/50 split [1x5, 10x5]       -> DTCNM ~= 9.9476, range 9,
//                                     ptdtcnm ~= 0.9047 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUTCNM 0.9048 at M_131).
//   * extreme outlier [1x9, 100]    -> DTCNM ~= 98.2707, range 99,
//                                     ptdtcnm ~= 1.0074 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/132) ~ 1.0176 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUTCNM 1.0076 at M_131).
//   * two-partner [1, 9]            -> DTCNM ~= 8.9529, range 8,
//                                     ptdtcnm ~= 0.8936 (tight --
//                                     JOINT with PTUTCNM 0.8936 at
//                                     M_131).
//   * two-partner [1, 100]          -> DTCNM ~= 99.4763, range 99,
//                                     ptdtcnm ~= 0.9952 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick from
//                                     PTUTCNM 0.9953 at M_131).
//   * small [10, 1, 1]              -> DTCNM ~= 9.9171, range 9,
//                                     ptdtcnm ~= 0.9075 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUTCNM 0.9076 at M_131).
//   * pool_count=100 [1x99, 100]    -> DTCNM ~= 96.5714, range 99,
//                                     ptdtcnm ~= 1.0251 (SPREAD --
//                                     FURTHER ABSORBED from PTUTCNM
//                                     M_131's 1.0254 spread; the
//                                     100-partner asymptote
//                                     100^(1/132) ~ 1.0355 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_132
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptdtcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duotrigintcentinagintic_mean == 0
//   * tight                ptdtcnm < 1.005
//   * spread               ptdtcnm in [1.005, 1.09)
//   * wide                 ptdtcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdtcnm_max /
// wide_ptdtcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.519):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUntrigintcentinaginticMeanSection
// (P11.517) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duotrigintcentinagintic-center
// after the P11.517 range-against-untrigintcentinagintic-center landing.

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
type PtdtcnmLabel =
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

// Bands on raw ptdtcnm (fixed cutoffs since duotrigintcentinagintic_mean
// scales with cell counts and typical duotrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_132 is 0.9158
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0177
// (M_131) to 1.0176 (M_132), 20-partner drops from 1.0231 to 1.0230,
// 30-partner drops from 1.0263 to 1.0261, 40-partner drops from
// 1.0286 to 1.0283, 50-partner drops from 1.0303 to 1.0301,
// 60-partner drops from 1.0317 to 1.0315, 70-partner drops from
// 1.0330 to 1.0327, 80-partner drops from 1.0340 to 1.0338,
// 85-partner drops from 1.0345 to 1.0342, 89-partner drops from
// 1.0349 to 1.0346, 90-partner drops from 1.0349 to 1.0347 -- so
// pool_count >= 100 (100^(1/132) ~ 1.0355) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTUTCNM 1.0254 spread to PTDTCNM 1.0251 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDTCNM_MAX = 1.005;
const WIDE_PTDTCNM_MIN = 1.09;

// PTDTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duotrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duotrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdtcnm_max: number;
  readonly wide_ptdtcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanMap;
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

// Peak-to-duotrigintcentinagintic-mean of a discrete distribution:
//   PTDTCNM = (max - min) / duotrigintcentinagintic_mean
// where duotrigintcentinagintic_mean = ((sum x_i^132) / n)^(1/132).
// Returns null on empty, solo, and degenerate (zero
// duotrigintcentinagintic_mean or non-finite hundred-and-thirty-second-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duotrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duotrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duotrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duotrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^132 = x^128 * x^4 = p128 * quad -- (128 + 4) decomposition so
    // the fold reuses the p128 rung shared with the M_128..M_131 siblings
    // and multiplies by quad once more to hit the next order.
    hundredThirtySecondSum += p128 * quad;
  }
  if (
    !Number.isFinite(hundredThirtySecondSum) ||
    hundredThirtySecondSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duotrigintcentinagintic_mean: null,
    };
  }
  const duotrigintcentinagintic_mean = Math.pow(
    hundredThirtySecondSum / pool_count,
    1 / 132,
  );
  if (
    !Number.isFinite(duotrigintcentinagintic_mean) ||
    duotrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duotrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdtcnm = range / duotrigintcentinagintic_mean;
  const clamped = ptdtcnm < 0 ? 0 : ptdtcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duotrigintcentinagintic_mean: roundTo(clamped, PTDTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duotrigintcentinagintic_mean:
      partner.peak_to_duotrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duotrigintcentinagintic_mean:
      metric.peak_to_duotrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMean {
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
    tight_ptdtcnm_max: TIGHT_PTDTCNM_MAX,
    wide_ptdtcnm_min: WIDE_PTDTCNM_MIN,
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

function labelForPtdtcnm(
  pool_count: number,
  pool_cells: number,
  ptdtcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdtcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdtcnm === null) return "degenerate";
  if (ptdtcnm >= wide_min) return "wide";
  if (ptdtcnm < tight_max) return "tight";
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

function renderPtdtcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdtcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdtcnm(
    pool_count,
    pool_cells,
    ptdtcnm,
    tight_max,
    wide_min,
  );
  const ptdtcnmText = ptdtcnm === null ? "-" : ptdtcnm.toFixed(4);
  return `PTDTCNM ${ptdtcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdtcnm_max, wide_ptdtcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdtcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duotrigintcentinagintic_mean, tight_ptdtcnm_max, wide_ptdtcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdtcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duotrigintcentinagintic_mean, tight_ptdtcnm_max, wide_ptdtcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdtcnm = (max - min) / duotrigintcentinagintic_mean where duotrigintcentinagintic_mean = ((sum x_i^132) / n)^(1/132). Reads the pool's total RANGE in units of its DUOTRIGINTCENTINAGINTIC (power-mean-of-order-132, M_132) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.516 PTUTCNM because raising to the ONE-HUNDRED-AND-THIRTY-SECOND power lifts the anchor MORE than raising to the hundred-and-thirty-first does. Unique DISPERSION-axis contribution extends the (harmonic..untrigintcentinagintic) power-mean TRESEXAGINTASEPTUAGINTUPLET into a QUATTUORSEXAGINTASEPTUAGINTUPLET with the M_132 duotrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdtcnm approaches n^(1/132) so 10-partner pools cap near 1.0176, 20-partner near 1.0230, 30-partner near 1.0261, 40-partner near 1.0283, 50-partner near 1.0301, 60-partner near 1.0315, 70-partner near 1.0327, 80-partner near 1.0338, 85-partner near 1.0342, 89-partner near 1.0346 and 90-partner near 1.0347 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/132) ~= 1.0355) are required to escape into wide with a modest outlier. Composite regime labels: PTDTCNM tight + PTUTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDTCNM 0.9158 tight -- rejoining the uniform ramp's 0.9158 for the fifty-first tick in the sequence after PTUTCNM's 0.9160 joint bucket at M_131); PTDTCNM spread + PTUTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDTCNM 1.0074 spread -- two 4-decimal ticks below PTUTCNM's 1.0076); PTDTCNM spread + PTUTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_132 ([1x99, 100] reads 1.0251 spread after M_131's 1.0254 spread landing); PTDTCNM tight + PTUTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one tick at M_132 ([1, 100] reads 0.9952 tight after M_131's 0.9953 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duotrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptdtcnm &lt; ${tight_ptdtcnm_max}, spread = ptdtcnm in [${tight_ptdtcnm_max}, ${wide_ptdtcnm_min}), wide = ptdtcnm &ge; ${wide_ptdtcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdtcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
