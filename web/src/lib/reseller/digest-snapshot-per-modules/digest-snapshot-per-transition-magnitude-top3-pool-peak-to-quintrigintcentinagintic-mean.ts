// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.524).
//
// WHOLE-POOL RANGE-AGAINST-QUINTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUINTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 135, M_135):
//
//   ptqitcnm = (max - min) / quintrigintcentinagintic_mean
//
// where quintrigintcentinagintic_mean = ((sum x_i^135) / n)^(1/135).
// Reads the peak spread against the QUINTRIGINTCENTINAGINTIC
// (power-mean-of-order-135) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.522 PTQTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-FIFTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-fourth does,
// dampening the ratio against the range even harder.
//
// PTQITCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-135) CENTER.
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
// quattuortrigintcentinagintic M_134) power-mean
// SESEXAGINTASEPTUAGINTUPLET into a
// SEPTSEXAGINTASEPTUAGINTUPLET with the M_135
// quintrigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_135 >= M_134, so
// quintrigintcentinagintic_mean >= quattuortrigintcentinagintic_mean
// and ptqitcnm <= ptqtcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quintrigintcentinagintic_mean approaches x_max / n^(1/135), so
// ptqitcnm approaches n^(1/135) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/135) ~= 1.0172, for n=20 ~= 1.0224, for n=30 ~= 1.0255,
// for n=40 ~= 1.0277, for n=50 ~= 1.0294, for n=60 ~= 1.0308,
// for n=70 ~= 1.0320, for n=80 ~= 1.0330, for n=85 ~= 1.0335,
// for n=89 ~= 1.0338, for n=90 ~= 1.0339 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/135) ~= 1.0347)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/135) ~= 1.0347, and the pool100
// [1x99, 100] reference reads 1.0244 spread (further absorbed
// from PTQTCNM's 1.0246 spread landing -- TWO 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_135.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quintrigintcentinagintic_mean = k,
//                                     range 0, ptqitcnm 0 (tight).
//   * uniform ramp [1..10]          -> QITCNM ~= 9.8309, range 9,
//                                     ptqitcnm ~= 0.9155 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQTCNM 0.9156 at M_134).
//   * upper-outlier [1x9, 10]       -> QITCNM ~= 9.8309, range 9,
//                                     ptqitcnm ~= 0.9155 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_135;
//                                     the M_134 joint collapse at
//                                     0.9156 persists at M_135 as a
//                                     joint 0.9155 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/135) ~ 9.8309 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QITCNM ~= 4.9407, range 4,
//                                     ptqitcnm ~= 0.8096 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQTCNM 0.8097 at M_134).
//   * 50/50 split [1x5, 10x5]       -> QITCNM ~= 9.9488, range 9,
//                                     ptqitcnm ~= 0.9046 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQTCNM 0.9047 at M_134).
//   * extreme outlier [1x9, 100]    -> QITCNM ~= 98.3088, range 99,
//                                     ptqitcnm ~= 1.0070 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/135) ~ 1.0172 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTQTCNM 1.0072 at M_134).
//   * two-partner [1, 9]            -> QITCNM ~= 8.9539, range 8,
//                                     ptqitcnm ~= 0.8935 (tight --
//                                     JOINT with PTQTCNM 0.8935 at
//                                     M_134).
//   * two-partner [1, 100]          -> QITCNM ~= 99.4879, range 99,
//                                     ptqitcnm ~= 0.9951 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTQTCNM 0.9951 at
//                                     M_134).
//   * small [10, 1, 1]              -> QITCNM ~= 9.9190, range 9,
//                                     ptqitcnm ~= 0.9074 (tight --
//                                     JOINT with PTQTCNM 0.9074 at
//                                     M_134).
//   * pool_count=100 [1x99, 100]    -> QITCNM ~= 96.6463, range 99,
//                                     ptqitcnm ~= 1.0244 (SPREAD --
//                                     FURTHER ABSORBED from PTQTCNM
//                                     M_134's 1.0246 spread; the
//                                     100-partner asymptote
//                                     100^(1/135) ~ 1.0347 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_135 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptqitcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quintrigintcentinagintic_mean == 0
//   * tight                ptqitcnm < 1.005
//   * spread               ptqitcnm in [1.005, 1.09)
//   * wide                 ptqitcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqitcnm_max /
// wide_ptqitcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.525):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanSection
// (P11.523) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quintrigintcentinagintic-center
// after the P11.523 range-against-quattuortrigintcentinagintic-center landing.
//
// Naming: quintrigintcentinagintic = quin (5) + trigint (30) +
// centinagintic (100) following the quinvigintcentinagintic (M_125)
// systematic pattern; abbreviation PTQITCNM (P-T-Quin-Trigint-Centi-
// Nagintic-M) is distinct from PTQTCNM (M_134 quattuortrigintcentinagintic)
// by the extra 'I' for the 'quin' prefix (matching PTQIVCNM at M_125
// vs PTQVCNM at M_124).

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
type PtqitcnmLabel =
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

// Bands on raw ptqitcnm (fixed cutoffs since quintrigintcentinagintic_mean
// scales with cell counts and typical quintrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_135 is 0.9155
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0173
// (M_134) to 1.0172 (M_135), 20-partner drops from 1.0226 to 1.0224,
// 30-partner drops from 1.0257 to 1.0255, 40-partner drops from
// 1.0279 to 1.0277, 50-partner drops from 1.0296 to 1.0294,
// 60-partner drops from 1.0310 to 1.0308, 70-partner drops from
// 1.0322 to 1.0320, 80-partner drops from 1.0332 to 1.0330,
// 85-partner drops from 1.0337 to 1.0335, 89-partner drops from
// 1.0341 to 1.0338, 90-partner drops from 1.0342 to 1.0339 -- so
// pool_count >= 100 (100^(1/135) ~ 1.0347) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQTCNM 1.0246 spread to PTQITCNM 1.0244 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQITCNM_MAX = 1.005;
const WIDE_PTQITCNM_MIN = 1.09;

// PTQITCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQITCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quintrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quintrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqitcnm_max: number;
  readonly wide_ptqitcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanMap;
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

// Peak-to-quintrigintcentinagintic-mean of a discrete distribution:
//   PTQITCNM = (max - min) / quintrigintcentinagintic_mean
// where quintrigintcentinagintic_mean = ((sum x_i^135) / n)^(1/135).
// Returns null on empty, solo, and degenerate (zero
// quintrigintcentinagintic_mean or non-finite hundred-and-thirty-fifth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quintrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quintrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quintrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quintrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtyFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^135 = x^128 * x^4 * x^2 * x = p128 * quad * sq * v -- (128 + 4
    // + 2 + 1) decomposition so the fold reuses the p128 rung shared
    // with the M_128..M_134 siblings and multiplies by quad, sq and v
    // to hit the next order.
    hundredThirtyFifthSum += p128 * quad * sq * v;
  }
  if (
    !Number.isFinite(hundredThirtyFifthSum) ||
    hundredThirtyFifthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quintrigintcentinagintic_mean: null,
    };
  }
  const quintrigintcentinagintic_mean = Math.pow(
    hundredThirtyFifthSum / pool_count,
    1 / 135,
  );
  if (
    !Number.isFinite(quintrigintcentinagintic_mean) ||
    quintrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quintrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqitcnm = range / quintrigintcentinagintic_mean;
  const clamped = ptqitcnm < 0 ? 0 : ptqitcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quintrigintcentinagintic_mean: roundTo(clamped, PTQITCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quintrigintcentinagintic_mean:
      partner.peak_to_quintrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quintrigintcentinagintic_mean:
      metric.peak_to_quintrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMean {
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
    tight_ptqitcnm_max: TIGHT_PTQITCNM_MAX,
    wide_ptqitcnm_min: WIDE_PTQITCNM_MIN,
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

function labelForPtqitcnm(
  pool_count: number,
  pool_cells: number,
  ptqitcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqitcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqitcnm === null) return "degenerate";
  if (ptqitcnm >= wide_min) return "wide";
  if (ptqitcnm < tight_max) return "tight";
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

function renderPtqitcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqitcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqitcnm(
    pool_count,
    pool_cells,
    ptqitcnm,
    tight_max,
    wide_min,
  );
  const ptqitcnmText = ptqitcnm === null ? "-" : ptqitcnm.toFixed(4);
  return `PTQITCNM ${ptqitcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuintrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqitcnm_max, wide_ptqitcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqitcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quintrigintcentinagintic_mean, tight_ptqitcnm_max, wide_ptqitcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqitcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quintrigintcentinagintic_mean, tight_ptqitcnm_max, wide_ptqitcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqitcnm = (max - min) / quintrigintcentinagintic_mean where quintrigintcentinagintic_mean = ((sum x_i^135) / n)^(1/135). Reads the pool's total RANGE in units of its QUINTRIGINTCENTINAGINTIC (power-mean-of-order-135, M_135) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.522 PTQTCNM because raising to the ONE-HUNDRED-AND-THIRTY-FIFTH power lifts the anchor MORE than raising to the hundred-and-thirty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuortrigintcentinagintic) power-mean SESEXAGINTASEPTUAGINTUPLET into a SEPTSEXAGINTASEPTUAGINTUPLET with the M_135 quintrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqitcnm approaches n^(1/135) so 10-partner pools cap near 1.0172, 20-partner near 1.0224, 30-partner near 1.0255, 40-partner near 1.0277, 50-partner near 1.0294, 60-partner near 1.0308, 70-partner near 1.0320, 80-partner near 1.0330, 85-partner near 1.0335, 89-partner near 1.0338 and 90-partner near 1.0339 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/135) ~= 1.0347) are required to escape into wide with a modest outlier. Composite regime labels: PTQITCNM tight + PTQTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQITCNM 0.9155 tight -- rejoining the uniform ramp's 0.9155 for the fifty-fourth tick in the sequence after PTQTCNM's 0.9156 joint bucket at M_134); PTQITCNM spread + PTQTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQITCNM 1.0070 spread -- two 4-decimal ticks below PTQTCNM's 1.0072); PTQITCNM spread + PTQTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_135 ([1x99, 100] reads 1.0244 spread after M_134's 1.0246 spread landing); PTQITCNM tight + PTQTCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_135 ([1, 100] reads 0.9951 tight matching M_134's 0.9951 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quintrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqitcnm &lt; ${tight_ptqitcnm_max}, spread = ptqitcnm in [${tight_ptqitcnm_max}, ${wide_ptqitcnm_min}), wide = ptqitcnm &ge; ${wide_ptqitcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqitcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQITCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQITCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
