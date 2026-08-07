// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRETRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.520).
//
// WHOLE-POOL RANGE-AGAINST-TRETRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's TRETRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 133, M_133):
//
//   ptttcnm = (max - min) / tretrigintcentinagintic_mean
//
// where tretrigintcentinagintic_mean = ((sum x_i^133) / n)^(1/133).
// Reads the peak spread against the TRETRIGINTCENTINAGINTIC
// (power-mean-of-order-133) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.518 PTDTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-THIRD power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-second does,
// dampening the ratio against the range even harder.
//
// PTTTCNM's unique DISPERSION-axis contribution: reads range in units
// of the TRETRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-133) CENTER.
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
// duotrigintcentinagintic M_132) power-mean
// QUATTUORSEXAGINTASEPTUAGINTUPLET into a
// QUINSEXAGINTASEPTUAGINTUPLET with the M_133 tretrigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_133 >= M_132, so tretrigintcentinagintic_mean >=
// duotrigintcentinagintic_mean and ptttcnm <= ptdtcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tretrigintcentinagintic_mean approaches x_max / n^(1/133), so
// ptttcnm approaches n^(1/133) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/133) ~= 1.0175, for n=20 ~= 1.0228, for n=30 ~= 1.0259,
// for n=40 ~= 1.0281, for n=50 ~= 1.0299, for n=60 ~= 1.0313,
// for n=70 ~= 1.0325, for n=80 ~= 1.0335, for n=85 ~= 1.0340,
// for n=89 ~= 1.0343, for n=90 ~= 1.0344 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/133) ~= 1.0352)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/133) ~= 1.0352, and the pool100
// [1x99, 100] reference reads 1.0249 spread (further absorbed
// from PTDTCNM's 1.0251 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_133.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tretrigintcentinagintic_mean = k,
//                                     range 0, ptttcnm 0 (tight).
//   * uniform ramp [1..10]          -> TTCNM ~= 9.8284, range 9,
//                                     ptttcnm ~= 0.9157 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDTCNM 0.9158 at M_132).
//   * upper-outlier [1x9, 10]       -> TTCNM ~= 9.8284, range 9,
//                                     ptttcnm ~= 0.9157 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_133;
//                                     the M_132 joint collapse at
//                                     0.9158 persists at M_133 as a
//                                     joint 0.9157 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/133) ~ 9.8284 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> TTCNM ~= 4.9399, range 4,
//                                     ptttcnm ~= 0.8097 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDTCNM 0.8098 at M_132).
//   * 50/50 split [1x5, 10x5]       -> TTCNM ~= 9.9480, range 9,
//                                     ptttcnm ~= 0.9047 (tight --
//                                     JOINT with PTDTCNM 0.9047 at
//                                     M_132).
//   * extreme outlier [1x9, 100]    -> TTCNM ~= 98.2836, range 99,
//                                     ptttcnm ~= 1.0073 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/133) ~ 1.0175 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTDTCNM 1.0074 at M_132).
//   * two-partner [1, 9]            -> TTCNM ~= 8.9532, range 8,
//                                     ptttcnm ~= 0.8935 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDTCNM 0.8936 at M_132).
//   * two-partner [1, 100]          -> TTCNM ~= 99.4802, range 99,
//                                     ptttcnm ~= 0.9952 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTDTCNM 0.9952 at
//                                     M_132).
//   * small [10, 1, 1]              -> TTCNM ~= 9.9177, range 9,
//                                     ptttcnm ~= 0.9075 (tight --
//                                     JOINT with PTDTCNM 0.9075 at
//                                     M_132).
//   * pool_count=100 [1x99, 100]    -> TTCNM ~= 96.5967, range 99,
//                                     ptttcnm ~= 1.0249 (SPREAD --
//                                     FURTHER ABSORBED from PTDTCNM
//                                     M_132's 1.0251 spread; the
//                                     100-partner asymptote
//                                     100^(1/133) ~ 1.0352 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_133
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptttcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tretrigintcentinagintic_mean == 0
//   * tight                ptttcnm < 1.005
//   * spread               ptttcnm in [1.005, 1.09)
//   * wide                 ptttcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptttcnm_max /
// wide_ptttcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.521):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuotrigintcentinaginticMeanSection
// (P11.519) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tretrigintcentinagintic-center
// after the P11.519 range-against-duotrigintcentinagintic-center landing.

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
type PtttcnmLabel =
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

// Bands on raw ptttcnm (fixed cutoffs since tretrigintcentinagintic_mean
// scales with cell counts and typical tretrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_133 is 0.9157
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0176
// (M_132) to 1.0175 (M_133), 20-partner drops from 1.0230 to 1.0228,
// 30-partner drops from 1.0261 to 1.0259, 40-partner drops from
// 1.0283 to 1.0281, 50-partner drops from 1.0301 to 1.0299,
// 60-partner drops from 1.0315 to 1.0313, 70-partner drops from
// 1.0327 to 1.0325, 80-partner drops from 1.0338 to 1.0335,
// 85-partner drops from 1.0342 to 1.0340, 89-partner drops from
// 1.0346 to 1.0343, 90-partner drops from 1.0347 to 1.0344 -- so
// pool_count >= 100 (100^(1/133) ~ 1.0352) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTDTCNM 1.0251 spread to PTTTCNM 1.0249 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTTCNM_MAX = 1.005;
const WIDE_PTTTCNM_MIN = 1.09;

// PTTTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tretrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tretrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptttcnm_max: number;
  readonly wide_ptttcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanMap;
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

// Peak-to-tretrigintcentinagintic-mean of a discrete distribution:
//   PTTTCNM = (max - min) / tretrigintcentinagintic_mean
// where tretrigintcentinagintic_mean = ((sum x_i^133) / n)^(1/133).
// Returns null on empty, solo, and degenerate (zero
// tretrigintcentinagintic_mean or non-finite hundred-and-thirty-third-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tretrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tretrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_tretrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tretrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^133 = x^128 * x^4 * x = p128 * quad * v -- (128 + 4 + 1)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_132 siblings and multiplies by quad and one more v to
    // hit the next order.
    hundredThirtyThirdSum += p128 * quad * v;
  }
  if (
    !Number.isFinite(hundredThirtyThirdSum) ||
    hundredThirtyThirdSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_tretrigintcentinagintic_mean: null,
    };
  }
  const tretrigintcentinagintic_mean = Math.pow(
    hundredThirtyThirdSum / pool_count,
    1 / 133,
  );
  if (
    !Number.isFinite(tretrigintcentinagintic_mean) ||
    tretrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_tretrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptttcnm = range / tretrigintcentinagintic_mean;
  const clamped = ptttcnm < 0 ? 0 : ptttcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_tretrigintcentinagintic_mean: roundTo(clamped, PTTTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tretrigintcentinagintic_mean:
      partner.peak_to_tretrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tretrigintcentinagintic_mean:
      metric.peak_to_tretrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMean {
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
    tight_ptttcnm_max: TIGHT_PTTTCNM_MAX,
    wide_ptttcnm_min: WIDE_PTTTCNM_MIN,
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

function labelForPtttcnm(
  pool_count: number,
  pool_cells: number,
  ptttcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtttcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptttcnm === null) return "degenerate";
  if (ptttcnm >= wide_min) return "wide";
  if (ptttcnm < tight_max) return "tight";
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

function renderPtttcnmCell(
  pool_count: number,
  pool_cells: number,
  ptttcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtttcnm(
    pool_count,
    pool_cells,
    ptttcnm,
    tight_max,
    wide_min,
  );
  const ptttcnmText = ptttcnm === null ? "-" : ptttcnm.toFixed(4);
  return `PTTTCNM ${ptttcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptttcnm_max, wide_ptttcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtttcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tretrigintcentinagintic_mean, tight_ptttcnm_max, wide_ptttcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtttcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tretrigintcentinagintic_mean, tight_ptttcnm_max, wide_ptttcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRETRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRETRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptttcnm = (max - min) / tretrigintcentinagintic_mean where tretrigintcentinagintic_mean = ((sum x_i^133) / n)^(1/133). Reads the pool's total RANGE in units of its TRETRIGINTCENTINAGINTIC (power-mean-of-order-133, M_133) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.518 PTDTCNM because raising to the ONE-HUNDRED-AND-THIRTY-THIRD power lifts the anchor MORE than raising to the hundred-and-thirty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duotrigintcentinagintic) power-mean QUATTUORSEXAGINTASEPTUAGINTUPLET into a QUINSEXAGINTASEPTUAGINTUPLET with the M_133 tretrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptttcnm approaches n^(1/133) so 10-partner pools cap near 1.0175, 20-partner near 1.0228, 30-partner near 1.0259, 40-partner near 1.0281, 50-partner near 1.0299, 60-partner near 1.0313, 70-partner near 1.0325, 80-partner near 1.0335, 85-partner near 1.0340, 89-partner near 1.0343 and 90-partner near 1.0344 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/133) ~= 1.0352) are required to escape into wide with a modest outlier. Composite regime labels: PTTTCNM tight + PTDTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTTCNM 0.9157 tight -- rejoining the uniform ramp's 0.9157 for the fifty-second tick in the sequence after PTDTCNM's 0.9158 joint bucket at M_132); PTTTCNM spread + PTDTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTTCNM 1.0073 spread -- one 4-decimal tick below PTDTCNM's 1.0074); PTTTCNM spread + PTDTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_133 ([1x99, 100] reads 1.0249 spread after M_132's 1.0251 spread landing); PTTTCNM tight + PTDTCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_132 ([1, 100] reads 0.9952 tight identical to M_132's 0.9952 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tretrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptttcnm &lt; ${tight_ptttcnm_max}, spread = ptttcnm in [${tight_ptttcnm_max}, ${wide_ptttcnm_min}), wide = ptttcnm &ge; ${wide_ptttcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptttcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
