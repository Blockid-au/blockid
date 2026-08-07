// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTDECICENTINAGINTIC-MEAN
// pure-lib (P11.488).
//
// WHOLE-POOL RANGE-AGAINST-SEPTDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's SEPTDECICENTINAGINTIC MEAN (a.k.a. power mean of
// order 117, M_117):
//
//   ptspdcnm = (max - min) / septdecicentinagintic_mean
//
// where septdecicentinagintic_mean = ((sum x_i^117) / n)^(1/117).
// Reads the peak spread against the SEPTDECICENTINAGINTIC
// (power-mean-of-order-117) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.486 PTSDCNM, because raising to
// the ONE-HUNDRED-AND-SEVENTEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-sixteenth does,
// dampening the ratio against the range even harder.
//
// PTSPDCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-117) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113,
// quattuordecicentinagintic M_114, quindecicentinagintic M_115,
// sedecicentinagintic M_116) power-mean OCTOQUADRAGINTASEPTUAGINTUPLET
// into a NOVEQUADRAGINTASEPTUAGINTUPLET with the M_117
// septdecicentinagintic mean -- climbing one step further into
// the second dozen of the triple-digit family opened at PTCNM. By
// Power Mean inequality M_117 >= M_116, so
// septdecicentinagintic_mean >= sedecicentinagintic_mean and
// ptspdcnm <= ptsdcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septdecicentinagintic_mean approaches x_max / n^(1/117), so
// ptspdcnm approaches n^(1/117) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/117) ~= 1.0199, for n=20 ~= 1.0259, for n=30 ~= 1.0295,
// for n=40 ~= 1.0320, for n=50 ~= 1.0340, for n=60 ~= 1.0356,
// for n=70 ~= 1.0370, for n=80 ~= 1.0382, for n=85 ~= 1.0387,
// for n=89 ~= 1.0391, for n=90 ~= 1.0392 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/117) ~= 1.0401)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/117) ~= 1.0401, and the pool100
// [1x99, 100] reference reads 1.0297 spread (further absorbed
// from PTSDCNM's 1.0301 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_117.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septdecicentinagintic_mean = k,
//                                     range 0, ptspdcnm 0 (tight).
//   * uniform ramp [1..10]          -> SPDCNM ~= 9.8051, range 9,
//                                     ptspdcnm ~= 0.9179 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSDCNM 0.9180 at M_116).
//   * upper-outlier [1x9, 10]       -> SPDCNM ~= 9.8051, range 9,
//                                     ptspdcnm ~= 0.9179 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_117;
//                                     the M_116 joint collapse at
//                                     0.9180 persists at M_117 as a
//                                     joint 0.9179 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/117) ~ 9.8051 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SPDCNM ~= 4.9317, range 4,
//                                     ptspdcnm ~= 0.8111 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSDCNM 0.8112 at M_116).
//   * 50/50 split [1x5, 10x5]       -> SPDCNM ~= 9.9409, range 9,
//                                     ptspdcnm ~= 0.9053 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSDCNM 0.9054 at M_116).
//   * extreme outlier [1x9, 100]    -> SPDCNM ~= 98.0512, range 99,
//                                     ptspdcnm ~= 1.0097 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/117) ~ 1.0199 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSDCNM 1.0098 at M_116).
//   * two-partner [1, 9]            -> SPDCNM ~= 8.9468, range 8,
//                                     ptspdcnm ~= 0.8942 (tight --
//                                     JOINT with PTSDCNM 0.8942 at
//                                     M_116; the two-partner
//                                     [1, 9] anchor sits inside the
//                                     same 4-decimal bucket for a 2nd
//                                     consecutive M order at M_117
//                                     after M_116's advance from
//                                     M_115's 0.8943).
//   * two-partner [1, 100]          -> SPDCNM ~= 99.4093, range 99,
//                                     ptspdcnm ~= 0.9959 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTSDCNM 0.9959 at
//                                     M_116; the [1, 100] anchor sits
//                                     inside the same 4-decimal bucket
//                                     for a 2nd consecutive M order at
//                                     M_117 after M_116's advance from
//                                     M_115's 0.9960).
//   * small [10, 1, 1]              -> SPDCNM ~= 9.9065, range 9,
//                                     ptspdcnm ~= 0.9085 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSDCNM 0.9086 at M_116).
//   * pool_count=100 [1x99, 100]    -> SPDCNM ~= 96.1404, range 99,
//                                     ptspdcnm ~= 1.0297 (SPREAD --
//                                     FURTHER ABSORBED from PTSDCNM
//                                     M_116's 1.0301 spread; the
//                                     100-partner asymptote
//                                     100^(1/117) ~ 1.0401 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_117
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptspdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septdecicentinagintic_mean == 0
//   * tight                ptspdcnm < 1.005
//   * spread               ptspdcnm in [1.005, 1.09)
//   * wide                 ptspdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspdcnm_max /
// wide_ptspdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.489):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSedecicentinaginticMeanSection
// (P11.487) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septdecicentinagintic-center
// after the P11.487 range-against-sedecicentinagintic-center landing.

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
type PtspdcnmLabel =
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

// Bands on raw ptspdcnm (fixed cutoffs since septdecicentinagintic_mean
// scales with cell counts and typical septdecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_117 is 0.9179
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0200
// (M_116) to 1.0199 (M_117), 20-partner drops from 1.0262 to 1.0259,
// 30-partner drops from 1.0298 to 1.0295, 40-partner drops from
// 1.0323 to 1.0320, 50-partner drops from 1.0343 to 1.0340,
// 60-partner drops from 1.0359 to 1.0356, 70-partner drops from
// 1.0373 to 1.0370, 80-partner drops from 1.0385 to 1.0382,
// 85-partner drops from 1.0390 to 1.0387, 89-partner drops from
// 1.0395 to 1.0391, 90-partner drops from 1.0396 to 1.0392 -- so
// pool_count >= 100 (100^(1/117) ~ 1.0401) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSDCNM 1.0301 spread to PTSPDCNM 1.0297 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPDCNM_MAX = 1.005;
const WIDE_PTSPDCNM_MIN = 1.09;

// PTSPDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septdecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septdecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspdcnm_max: number;
  readonly wide_ptspdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanMap;
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

// Peak-to-septdecicentinagintic-mean of a discrete distribution:
//   PTSPDCNM = (max - min) / septdecicentinagintic_mean
// where septdecicentinagintic_mean = ((sum x_i^117) / n)^(1/117).
// Returns null on empty, solo, and degenerate (zero
// septdecicentinagintic_mean or non-finite hundred-and-seventeenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septdecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septdecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septdecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septdecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSeventeenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^117 = x^64 * x^32 * x^16 * x^4 * x = p64 * p32 * p16 * quad * v
    hundredSeventeenthSum += p64 * p32 * p16 * quad * v;
  }
  if (
    !Number.isFinite(hundredSeventeenthSum) ||
    hundredSeventeenthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septdecicentinagintic_mean: null,
    };
  }
  const septdecicentinagintic_mean = Math.pow(
    hundredSeventeenthSum / pool_count,
    1 / 117,
  );
  if (
    !Number.isFinite(septdecicentinagintic_mean) ||
    septdecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septdecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspdcnm = range / septdecicentinagintic_mean;
  const clamped = ptspdcnm < 0 ? 0 : ptspdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septdecicentinagintic_mean: roundTo(clamped, PTSPDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septdecicentinagintic_mean:
      partner.peak_to_septdecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septdecicentinagintic_mean:
      metric.peak_to_septdecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMean {
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
    tight_ptspdcnm_max: TIGHT_PTSPDCNM_MAX,
    wide_ptspdcnm_min: WIDE_PTSPDCNM_MIN,
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

function labelForPtspdcnm(
  pool_count: number,
  pool_cells: number,
  ptspdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtspdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspdcnm === null) return "degenerate";
  if (ptspdcnm >= wide_min) return "wide";
  if (ptspdcnm < tight_max) return "tight";
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

function renderPtspdcnmCell(
  pool_count: number,
  pool_cells: number,
  ptspdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspdcnm(
    pool_count,
    pool_cells,
    ptspdcnm,
    tight_max,
    wide_min,
  );
  const ptspdcnmText = ptspdcnm === null ? "-" : ptspdcnm.toFixed(4);
  return `PTSPDCNM ${ptspdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptdecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspdcnm_max, wide_ptspdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septdecicentinagintic_mean, tight_ptspdcnm_max, wide_ptspdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septdecicentinagintic_mean, tight_ptspdcnm_max, wide_ptspdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspdcnm = (max - min) / septdecicentinagintic_mean where septdecicentinagintic_mean = ((sum x_i^117) / n)^(1/117). Reads the pool's total RANGE in units of its SEPTDECICENTINAGINTIC (power-mean-of-order-117, M_117) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.486 PTSDCNM because raising to the ONE-HUNDRED-AND-SEVENTEENTH power lifts the anchor MORE than raising to the hundred-and-sixteenth does. Unique DISPERSION-axis contribution extends the (harmonic..sedecicentinagintic) power-mean OCTOQUADRAGINTASEPTUAGINTUPLET into a NOVEQUADRAGINTASEPTUAGINTUPLET with the M_117 septdecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspdcnm approaches n^(1/117) so 10-partner pools cap near 1.0199, 20-partner near 1.0259, 30-partner near 1.0295, 40-partner near 1.0320, 50-partner near 1.0340, 60-partner near 1.0356, 70-partner near 1.0370, 80-partner near 1.0382, 85-partner near 1.0387, 89-partner near 1.0391 and 90-partner near 1.0392 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/117) ~= 1.0401) are required to escape into wide with a modest outlier. Composite regime labels: PTSPDCNM tight + PTSDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPDCNM 0.9179 tight -- rejoining the uniform ramp's 0.9179 for the thirty-sixth tick in the sequence after PTSDCNM's 0.9180 joint bucket at M_116); PTSPDCNM spread + PTSDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPDCNM 1.0097 spread -- one 4-decimal tick below PTSDCNM's 1.0098); PTSPDCNM spread + PTSDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_117 ([1x99, 100] reads 1.0297 spread after M_116's 1.0301 spread landing); PTSPDCNM tight + PTSDCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_117 ([1, 100] reads 0.9959 tight after M_116's 0.9959 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septdecicentinagintic_mean == 0 (guarded but unreachable), tight = ptspdcnm &lt; ${tight_ptspdcnm_max}, spread = ptspdcnm in [${tight_ptspdcnm_max}, ${wide_ptspdcnm_min}), wide = ptspdcnm &ge; ${wide_ptspdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
