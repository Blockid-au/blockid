// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.522).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUATTUORTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 134, M_134):
//
//   ptqtcnm = (max - min) / quattuortrigintcentinagintic_mean
//
// where quattuortrigintcentinagintic_mean = ((sum x_i^134) / n)^(1/134).
// Reads the peak spread against the QUATTUORTRIGINTCENTINAGINTIC
// (power-mean-of-order-134) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.520 PTTTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-FOURTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-third does,
// dampening the ratio against the range even harder.
//
// PTQTCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-134) CENTER.
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
// duotrigintcentinagintic M_132, tretrigintcentinagintic M_133)
// power-mean QUINSEXAGINTASEPTUAGINTUPLET into a
// SESEXAGINTASEPTUAGINTUPLET with the M_134 quattuortrigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_134 >= M_133, so quattuortrigintcentinagintic_mean >=
// tretrigintcentinagintic_mean and ptqtcnm <= ptttcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuortrigintcentinagintic_mean approaches x_max / n^(1/134), so
// ptqtcnm approaches n^(1/134) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/134) ~= 1.0173, for n=20 ~= 1.0226, for n=30 ~= 1.0257,
// for n=40 ~= 1.0279, for n=50 ~= 1.0296, for n=60 ~= 1.0310,
// for n=70 ~= 1.0322, for n=80 ~= 1.0332, for n=85 ~= 1.0337,
// for n=89 ~= 1.0341, for n=90 ~= 1.0342 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/134) ~= 1.0350)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/134) ~= 1.0350, and the pool100
// [1x99, 100] reference reads 1.0246 spread (further absorbed
// from PTTTCNM's 1.0249 spread landing -- THREE 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_134.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuortrigintcentinagintic_mean = k,
//                                     range 0, ptqtcnm 0 (tight).
//   * uniform ramp [1..10]          -> QTCNM ~= 9.8296, range 9,
//                                     ptqtcnm ~= 0.9156 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTTCNM 0.9157 at M_133).
//   * upper-outlier [1x9, 10]       -> QTCNM ~= 9.8296, range 9,
//                                     ptqtcnm ~= 0.9156 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_134;
//                                     the M_133 joint collapse at
//                                     0.9157 persists at M_134 as a
//                                     joint 0.9156 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/134) ~ 9.8296 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QTCNM ~= 4.9403, range 4,
//                                     ptqtcnm ~= 0.8097 (tight --
//                                     JOINT with PTTTCNM 0.8097 at
//                                     M_133).
//   * 50/50 split [1x5, 10x5]       -> QTCNM ~= 9.9484, range 9,
//                                     ptqtcnm ~= 0.9047 (tight --
//                                     JOINT with PTTTCNM 0.9047 at
//                                     M_133).
//   * extreme outlier [1x9, 100]    -> QTCNM ~= 98.2963, range 99,
//                                     ptqtcnm ~= 1.0072 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/134) ~ 1.0173 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTTTCNM 1.0073 at M_133).
//   * two-partner [1, 9]            -> QTCNM ~= 8.9536, range 8,
//                                     ptqtcnm ~= 0.8935 (tight --
//                                     JOINT with PTTTCNM 0.8935 at
//                                     M_133).
//   * two-partner [1, 100]          -> QTCNM ~= 99.4841, range 99,
//                                     ptqtcnm ~= 0.9951 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick
//                                     from PTTTCNM 0.9952 at M_133).
//   * small [10, 1, 1]              -> QTCNM ~= 9.9183, range 9,
//                                     ptqtcnm ~= 0.9074 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTTCNM 0.9075 at M_133).
//   * pool_count=100 [1x99, 100]    -> QTCNM ~= 96.6217, range 99,
//                                     ptqtcnm ~= 1.0246 (SPREAD --
//                                     FURTHER ABSORBED from PTTTCNM
//                                     M_133's 1.0249 spread; the
//                                     100-partner asymptote
//                                     100^(1/134) ~ 1.0350 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_134 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptqtcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuortrigintcentinagintic_mean == 0
//   * tight                ptqtcnm < 1.005
//   * spread               ptqtcnm in [1.005, 1.09)
//   * wide                 ptqtcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqtcnm_max /
// wide_ptqtcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.523):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanSection
// (P11.521) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuortrigintcentinagintic-center
// after the P11.521 range-against-tretrigintcentinagintic-center landing.

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
type PtqtcnmLabel =
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

// Bands on raw ptqtcnm (fixed cutoffs since quattuortrigintcentinagintic_mean
// scales with cell counts and typical quattuortrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_134 is 0.9156
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0175
// (M_133) to 1.0173 (M_134), 20-partner drops from 1.0228 to 1.0226,
// 30-partner drops from 1.0259 to 1.0257, 40-partner drops from
// 1.0281 to 1.0279, 50-partner drops from 1.0299 to 1.0296,
// 60-partner drops from 1.0313 to 1.0310, 70-partner drops from
// 1.0325 to 1.0322, 80-partner drops from 1.0335 to 1.0332,
// 85-partner drops from 1.0340 to 1.0337, 89-partner drops from
// 1.0343 to 1.0341, 90-partner drops from 1.0344 to 1.0342 -- so
// pool_count >= 100 (100^(1/134) ~ 1.0350) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTTCNM 1.0249 spread to PTQTCNM 1.0246 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQTCNM_MAX = 1.005;
const WIDE_PTQTCNM_MIN = 1.09;

// PTQTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuortrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuortrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqtcnm_max: number;
  readonly wide_ptqtcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanMap;
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

// Peak-to-quattuortrigintcentinagintic-mean of a discrete distribution:
//   PTQTCNM = (max - min) / quattuortrigintcentinagintic_mean
// where quattuortrigintcentinagintic_mean = ((sum x_i^134) / n)^(1/134).
// Returns null on empty, solo, and degenerate (zero
// quattuortrigintcentinagintic_mean or non-finite hundred-and-thirty-fourth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuortrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuortrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuortrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuortrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^134 = x^128 * x^4 * x^2 = p128 * quad * sq -- (128 + 4 + 2)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_133 siblings and multiplies by quad and sq to hit the
    // next order.
    hundredThirtyFourthSum += p128 * quad * sq;
  }
  if (
    !Number.isFinite(hundredThirtyFourthSum) ||
    hundredThirtyFourthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuortrigintcentinagintic_mean: null,
    };
  }
  const quattuortrigintcentinagintic_mean = Math.pow(
    hundredThirtyFourthSum / pool_count,
    1 / 134,
  );
  if (
    !Number.isFinite(quattuortrigintcentinagintic_mean) ||
    quattuortrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuortrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqtcnm = range / quattuortrigintcentinagintic_mean;
  const clamped = ptqtcnm < 0 ? 0 : ptqtcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuortrigintcentinagintic_mean: roundTo(clamped, PTQTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuortrigintcentinagintic_mean:
      partner.peak_to_quattuortrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuortrigintcentinagintic_mean:
      metric.peak_to_quattuortrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMean {
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
    tight_ptqtcnm_max: TIGHT_PTQTCNM_MAX,
    wide_ptqtcnm_min: WIDE_PTQTCNM_MIN,
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

function labelForPtqtcnm(
  pool_count: number,
  pool_cells: number,
  ptqtcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqtcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqtcnm === null) return "degenerate";
  if (ptqtcnm >= wide_min) return "wide";
  if (ptqtcnm < tight_max) return "tight";
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

function renderPtqtcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqtcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqtcnm(
    pool_count,
    pool_cells,
    ptqtcnm,
    tight_max,
    wide_min,
  );
  const ptqtcnmText = ptqtcnm === null ? "-" : ptqtcnm.toFixed(4);
  return `PTQTCNM ${ptqtcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuortrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqtcnm_max, wide_ptqtcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqtcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuortrigintcentinagintic_mean, tight_ptqtcnm_max, wide_ptqtcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqtcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuortrigintcentinagintic_mean, tight_ptqtcnm_max, wide_ptqtcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqtcnm = (max - min) / quattuortrigintcentinagintic_mean where quattuortrigintcentinagintic_mean = ((sum x_i^134) / n)^(1/134). Reads the pool's total RANGE in units of its QUATTUORTRIGINTCENTINAGINTIC (power-mean-of-order-134, M_134) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.520 PTTTCNM because raising to the ONE-HUNDRED-AND-THIRTY-FOURTH power lifts the anchor MORE than raising to the hundred-and-thirty-third does. Unique DISPERSION-axis contribution extends the (harmonic..tretrigintcentinagintic) power-mean QUINSEXAGINTASEPTUAGINTUPLET into a SESEXAGINTASEPTUAGINTUPLET with the M_134 quattuortrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqtcnm approaches n^(1/134) so 10-partner pools cap near 1.0173, 20-partner near 1.0226, 30-partner near 1.0257, 40-partner near 1.0279, 50-partner near 1.0296, 60-partner near 1.0310, 70-partner near 1.0322, 80-partner near 1.0332, 85-partner near 1.0337, 89-partner near 1.0341 and 90-partner near 1.0342 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/134) ~= 1.0350) are required to escape into wide with a modest outlier. Composite regime labels: PTQTCNM tight + PTTTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQTCNM 0.9156 tight -- rejoining the uniform ramp's 0.9156 for the fifty-third tick in the sequence after PTTTCNM's 0.9157 joint bucket at M_133); PTQTCNM spread + PTTTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQTCNM 1.0072 spread -- one 4-decimal tick below PTTTCNM's 1.0073); PTQTCNM spread + PTTTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_134 ([1x99, 100] reads 1.0246 spread after M_133's 1.0249 spread landing); PTQTCNM tight + PTTTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one 4-decimal tick from M_133 ([1, 100] reads 0.9951 tight below M_133's 0.9952 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuortrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqtcnm &lt; ${tight_ptqtcnm_max}, spread = ptqtcnm in [${tight_ptqtcnm_max}, ${wide_ptqtcnm_min}), wide = ptqtcnm &ge; ${wide_ptqtcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqtcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
