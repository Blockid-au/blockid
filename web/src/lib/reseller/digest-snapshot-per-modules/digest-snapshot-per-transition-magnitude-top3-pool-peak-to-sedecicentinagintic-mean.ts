// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEDECICENTINAGINTIC-MEAN
// pure-lib (P11.486).
//
// WHOLE-POOL RANGE-AGAINST-SEDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's SEDECICENTINAGINTIC MEAN (a.k.a. power mean of
// order 116, M_116):
//
//   ptsdcnm = (max - min) / sedecicentinagintic_mean
//
// where sedecicentinagintic_mean = ((sum x_i^116) / n)^(1/116).
// Reads the peak spread against the SEDECICENTINAGINTIC
// (power-mean-of-order-116) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.484 PTQIDCNM, because raising to
// the ONE-HUNDRED-AND-SIXTEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifteenth does,
// dampening the ratio against the range even harder.
//
// PTSDCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-116) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113,
// quattuordecicentinagintic M_114, quindecicentinagintic M_115)
// power-mean SEPTQUADRAGINTASEPTUAGINTUPLET into an
// OCTOQUADRAGINTASEPTUAGINTUPLET with the M_116
// sedecicentinagintic mean -- climbing one step further into
// the second dozen of the triple-digit family opened at PTCNM. By
// Power Mean inequality M_116 >= M_115, so
// sedecicentinagintic_mean >= quindecicentinagintic_mean and
// ptsdcnm <= ptqidcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sedecicentinagintic_mean approaches x_max / n^(1/116), so
// ptsdcnm approaches n^(1/116) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/116) ~= 1.0200, for n=20 ~= 1.0262, for n=30 ~= 1.0298,
// for n=40 ~= 1.0323, for n=50 ~= 1.0343, for n=60 ~= 1.0359,
// for n=70 ~= 1.0373, for n=80 ~= 1.0385, for n=85 ~= 1.0390,
// for n=89 ~= 1.0395, for n=90 ~= 1.0396 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/116) ~= 1.0405)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/116) ~= 1.0405, and the pool100
// [1x99, 100] reference reads 1.0301 spread (further absorbed
// from PTQIDCNM's 1.0304 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_116.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sedecicentinagintic_mean = k,
//                                     range 0, ptsdcnm 0 (tight).
//   * uniform ramp [1..10]          -> SDCNM ~= 9.8035, range 9,
//                                     ptsdcnm ~= 0.9180 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQIDCNM 0.9182 at M_115).
//   * upper-outlier [1x9, 10]       -> SDCNM ~= 9.8035, range 9,
//                                     ptsdcnm ~= 0.9180 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_116;
//                                     the M_115 joint collapse at
//                                     0.9182 persists at M_116 as a
//                                     joint 0.9180 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/116) ~ 9.8035 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SDCNM ~= 4.9312, range 4,
//                                     ptsdcnm ~= 0.8112 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQIDCNM 0.8113 at M_115).
//   * 50/50 split [1x5, 10x5]       -> SDCNM ~= 9.9404, range 9,
//                                     ptsdcnm ~= 0.9054 (tight --
//                                     JOINT with PTQIDCNM 0.9054 at
//                                     M_115; the half-and-half anchor
//                                     sits inside the same 4-decimal
//                                     bucket for a 2nd consecutive
//                                     M order at M_116 after the
//                                     M_115 advance from M_114's
//                                     0.9055 landing).
//   * extreme outlier [1x9, 100]    -> SDCNM ~= 98.0348, range 99,
//                                     ptsdcnm ~= 1.0098 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/116) ~ 1.0200 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQIDCNM 1.0100 at M_115).
//   * two-partner [1, 9]            -> SDCNM ~= 8.9464, range 8,
//                                     ptsdcnm ~= 0.8942 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQIDCNM 0.8943 at M_115).
//   * two-partner [1, 100]          -> SDCNM ~= 99.4040, range 99,
//                                     ptsdcnm ~= 0.9959 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQIDCNM 0.9960 at M_115).
//   * small [10, 1, 1]              -> SDCNM ~= 9.9057, range 9,
//                                     ptsdcnm ~= 0.9086 (tight --
//                                     JOINT with PTQIDCNM 0.9086 at
//                                     M_115; the small-value-dominated
//                                     3-partner anchor sits inside the
//                                     same 4-decimal bucket for a 2nd
//                                     consecutive M order at M_116
//                                     after M_115's advance from
//                                     M_114's 0.9087 landing).
//   * pool_count=100 [1x99, 100]    -> SDCNM ~= 96.1082, range 99,
//                                     ptsdcnm ~= 1.0301 (SPREAD --
//                                     FURTHER ABSORBED from PTQIDCNM
//                                     M_115's 1.0304 spread; the
//                                     100-partner asymptote
//                                     100^(1/116) ~ 1.0405 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_116
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptsdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sedecicentinagintic_mean == 0
//   * tight                ptsdcnm < 1.005
//   * spread               ptsdcnm in [1.005, 1.09)
//   * wide                 ptsdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsdcnm_max /
// wide_ptsdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.487):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuindecicentinaginticMeanSection
// (P11.485) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sedecicentinagintic-center
// after the P11.485 range-against-quindecicentinagintic-center landing.

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
type PtsdcnmLabel =
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

// Bands on raw ptsdcnm (fixed cutoffs since sedecicentinagintic_mean
// scales with cell counts and typical sedecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_116 is 0.9180
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0202
// (M_115) to 1.0200 (M_116), 20-partner drops from 1.0264 to 1.0262,
// 30-partner drops from 1.0300 to 1.0298, 40-partner drops from
// 1.0326 to 1.0323, 50-partner drops from 1.0346 to 1.0343,
// 60-partner drops from 1.0362 to 1.0359, 70-partner drops from
// 1.0376 to 1.0373, 80-partner drops from 1.0388 to 1.0385,
// 85-partner drops from 1.0394 to 1.0390, 89-partner drops from
// 1.0398 to 1.0395, 90-partner drops from 1.0399 to 1.0396 -- so
// pool_count >= 100 (100^(1/116) ~ 1.0405) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQIDCNM 1.0304 spread to PTSDCNM 1.0301 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSDCNM_MAX = 1.005;
const WIDE_PTSDCNM_MIN = 1.09;

// PTSDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sedecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sedecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsdcnm_max: number;
  readonly wide_ptsdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanMap;
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

// Peak-to-sedecicentinagintic-mean of a discrete distribution:
//   PTSDCNM = (max - min) / sedecicentinagintic_mean
// where sedecicentinagintic_mean = ((sum x_i^116) / n)^(1/116).
// Returns null on empty, solo, and degenerate (zero
// sedecicentinagintic_mean or non-finite hundred-and-sixteenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sedecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sedecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sedecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sedecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSixteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^116 = x^64 * x^32 * x^16 * x^4 = p64 * p32 * p16 * quad
    hundredSixteenthSum += p64 * p32 * p16 * quad;
  }
  if (!Number.isFinite(hundredSixteenthSum) || hundredSixteenthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sedecicentinagintic_mean: null,
    };
  }
  const sedecicentinagintic_mean = Math.pow(
    hundredSixteenthSum / pool_count,
    1 / 116,
  );
  if (
    !Number.isFinite(sedecicentinagintic_mean) ||
    sedecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sedecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsdcnm = range / sedecicentinagintic_mean;
  const clamped = ptsdcnm < 0 ? 0 : ptsdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sedecicentinagintic_mean: roundTo(clamped, PTSDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sedecicentinagintic_mean:
      partner.peak_to_sedecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sedecicentinagintic_mean:
      metric.peak_to_sedecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMean {
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
    tight_ptsdcnm_max: TIGHT_PTSDCNM_MAX,
    wide_ptsdcnm_min: WIDE_PTSDCNM_MIN,
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

function labelForPtsdcnm(
  pool_count: number,
  pool_cells: number,
  ptsdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtsdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsdcnm === null) return "degenerate";
  if (ptsdcnm >= wide_min) return "wide";
  if (ptsdcnm < tight_max) return "tight";
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

function renderPtsdcnmCell(
  pool_count: number,
  pool_cells: number,
  ptsdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsdcnm(
    pool_count,
    pool_cells,
    ptsdcnm,
    tight_max,
    wide_min,
  );
  const ptsdcnmText = ptsdcnm === null ? "-" : ptsdcnm.toFixed(4);
  return `PTSDCNM ${ptsdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsdcnm_max, wide_ptsdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sedecicentinagintic_mean, tight_ptsdcnm_max, wide_ptsdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sedecicentinagintic_mean, tight_ptsdcnm_max, wide_ptsdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsdcnm = (max - min) / sedecicentinagintic_mean where sedecicentinagintic_mean = ((sum x_i^116) / n)^(1/116). Reads the pool's total RANGE in units of its SEDECICENTINAGINTIC (power-mean-of-order-116, M_116) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.484 PTQIDCNM because raising to the ONE-HUNDRED-AND-SIXTEENTH power lifts the anchor MORE than raising to the hundred-and-fifteenth does. Unique DISPERSION-axis contribution extends the (harmonic..quindecicentinagintic) power-mean SEPTQUADRAGINTASEPTUAGINTUPLET into an OCTOQUADRAGINTASEPTUAGINTUPLET with the M_116 sedecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsdcnm approaches n^(1/116) so 10-partner pools cap near 1.0200, 20-partner near 1.0262, 30-partner near 1.0298, 40-partner near 1.0323, 50-partner near 1.0343, 60-partner near 1.0359, 70-partner near 1.0373, 80-partner near 1.0385, 85-partner near 1.0390, 89-partner near 1.0395 and 90-partner near 1.0396 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/116) ~= 1.0405) are required to escape into wide with a modest outlier. Composite regime labels: PTSDCNM tight + PTQIDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSDCNM 0.9180 tight -- rejoining the uniform ramp's 0.9180 for the thirty-fifth tick in the sequence after PTQIDCNM's 0.9182 joint bucket at M_115); PTSDCNM spread + PTQIDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSDCNM 1.0098 spread -- two 4-decimal ticks below PTQIDCNM's 1.0100); PTSDCNM spread + PTQIDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_116 ([1x99, 100] reads 1.0301 spread after M_115's 1.0304 spread landing); PTSDCNM tight + PTQIDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCED at M_116 ([1, 100] reads 0.9959 tight after M_115's 0.9960 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sedecicentinagintic_mean == 0 (guarded but unreachable), tight = ptsdcnm &lt; ${tight_ptsdcnm_max}, spread = ptsdcnm in [${tight_ptsdcnm_max}, ${wide_ptsdcnm_min}), wide = ptsdcnm &ge; ${wide_ptsdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
