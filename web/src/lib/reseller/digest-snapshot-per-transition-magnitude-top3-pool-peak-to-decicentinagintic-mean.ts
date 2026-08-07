// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DECICENTINAGINTIC-MEAN
// pure-lib (P11.474).
//
// WHOLE-POOL RANGE-AGAINST-DECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's DECICENTINAGINTIC MEAN (a.k.a. power mean of order
// 110, M_110):
//
//   ptdcnm = (max - min) / decicentinagintic_mean
//
// where decicentinagintic_mean = ((sum x_i^110) / n)^(1/110).
// Reads the peak spread against the DECICENTINAGINTIC
// (power-mean-of-order-110) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.472 PTNCNM, because raising to
// the ONE-HUNDRED-AND-TENTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-ninth does, dampening the
// ratio against the range even harder.
//
// PTDCNM's unique DISPERSION-axis contribution: reads range in units
// of the DECICENTINAGINTIC (POWER-MEAN-OF-ORDER-110) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109) power-mean
// UNQUADRAGINTASEPTUAGINTUPLET into a
// DUOQUADRAGINTASEPTUAGINTUPLET with the M_110 decicentinagintic
// mean -- crossing the round DECI-CENTI threshold into the second
// dozen of the triple-digit family opened at PTCNM. By Power Mean
// inequality M_110 >= M_109, so decicentinagintic_mean >=
// novecentinagintic_mean and ptdcnm <= ptncnm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// decicentinagintic_mean approaches x_max / n^(1/110), so ptdcnm
// approaches n^(1/110) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/110) ~= 1.0212, for n=20 ~= 1.0276, for n=30 ~= 1.0314,
// for n=40 ~= 1.0341, for n=50 ~= 1.0362, for n=60 ~= 1.0379,
// for n=70 ~= 1.0394, for n=80 ~= 1.0406, for n=85 ~= 1.0412,
// for n=89 ~= 1.0417, for n=90 ~= 1.0418 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/110) ~= 1.0428)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/110) ~= 1.0428, and the pool100
// [1x99, 100] reference reads 1.0323 spread (further absorbed
// from PTNCNM's 1.0327 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_110.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> decicentinagintic_mean = k,
//                                     range 0, ptdcnm 0 (tight).
//   * uniform ramp [1..10]          -> DCNM ~= 9.7928, range 9,
//                                     ptdcnm ~= 0.9190 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTNCNM 0.9192 at M_109).
//   * upper-outlier [1x9, 10]       -> DCNM ~= 9.7928, range 9,
//                                     ptdcnm ~= 0.9190 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_110;
//                                     the M_109 joint collapse at
//                                     0.9192 persists at M_110 as a
//                                     joint 0.9190 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/110) ~ 9.7928 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> DCNM ~= 4.9272, range 4,
//                                     ptdcnm ~= 0.8118 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNCNM 0.8119 at M_109).
//   * 50/50 split [1x5, 10x5]       -> DCNM ~= 9.9372, range 9,
//                                     ptdcnm ~= 0.9057 (tight --
//                                     JOINT with PTNCNM 0.9057 at
//                                     M_109; the half-and-half anchor
//                                     sits inside the same 4-decimal
//                                     bucket for a 2nd consecutive
//                                     power-mean order at M_110).
//   * extreme outlier [1x9, 100]    -> DCNM ~= 97.9284, range 99,
//                                     ptdcnm ~= 1.0109 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/110) ~ 1.0212 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTNCNM 1.0111 at M_109).
//   * two-partner [1, 9]            -> DCNM ~= 8.9435, range 8,
//                                     ptdcnm ~= 0.8945 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNCNM 0.8946 at M_109).
//   * two-partner [1, 100]          -> DCNM ~= 99.3720, range 99,
//                                     ptdcnm ~= 0.9963 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTNCNM 0.9963 at
//                                     M_109; the two-partner high-max
//                                     anchor sits inside the same
//                                     4-decimal bucket for a 2nd
//                                     consecutive power-mean order at
//                                     M_110).
//   * small [10, 1, 1]              -> DCNM ~= 9.9006, range 9,
//                                     ptdcnm ~= 0.9090 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNCNM 0.9091 at M_109;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_110).
//   * pool_count=100 [1x99, 100]    -> DCNM ~= 95.8990, range 99,
//                                     ptdcnm ~= 1.0323 (SPREAD --
//                                     FURTHER ABSORBED from PTNCNM
//                                     M_109's 1.0327 spread; the
//                                     100-partner asymptote
//                                     100^(1/110) ~ 1.0428 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_110
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR decicentinagintic_mean == 0
//   * tight                ptdcnm < 1.005
//   * spread               ptdcnm in [1.005, 1.09)
//   * wide                 ptdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdcnm_max /
// wide_ptdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.475):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanSection
// (P11.473) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-decicentinagintic-center
// after the P11.473 range-against-novecentinagintic-center landing.

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
type PtdcnmLabel =
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

// Bands on raw ptdcnm (fixed cutoffs since decicentinagintic_mean
// scales with cell counts and typical decicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_110 is 0.9190
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0213
// (M_109) to 1.0212 (M_110), 20-partner drops from 1.0279 to 1.0276,
// 30-partner drops from 1.0317 to 1.0314, 40-partner drops from
// 1.0344 to 1.0341, 50-partner drops from 1.0365 to 1.0362,
// 60-partner drops from 1.0383 to 1.0379, 70-partner drops from
// 1.0398 to 1.0394, 80-partner drops from 1.0410 to 1.0406,
// 85-partner drops from 1.0416 to 1.0412, 89-partner drops from
// 1.0420 to 1.0417, 90-partner drops from 1.0421 to 1.0418 -- so
// pool_count >= 100 (100^(1/110) ~ 1.0428) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTNCNM 1.0327 spread to PTDCNM 1.0323 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDCNM_MAX = 1.005;
const WIDE_PTDCNM_MIN = 1.09;

// PTDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_decicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_decicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdcnm_max: number;
  readonly wide_ptdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanMap;
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

// Peak-to-decicentinagintic-mean of a discrete distribution:
//   PTDCNM = (max - min) / decicentinagintic_mean
// where decicentinagintic_mean = ((sum x_i^110) / n)^(1/110).
// Returns null on empty, solo, and degenerate (zero
// decicentinagintic_mean or non-finite hundred-and-tenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_decicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_decicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_decicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_decicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^110 = (x^8)^13 * x^6 = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*sq
    hundredTenthSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      quad *
      sq;
  }
  if (!Number.isFinite(hundredTenthSum) || hundredTenthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_decicentinagintic_mean: null,
    };
  }
  const decicentinagintic_mean = Math.pow(
    hundredTenthSum / pool_count,
    1 / 110,
  );
  if (
    !Number.isFinite(decicentinagintic_mean) ||
    decicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_decicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdcnm = range / decicentinagintic_mean;
  const clamped = ptdcnm < 0 ? 0 : ptdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_decicentinagintic_mean: roundTo(clamped, PTDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_decicentinagintic_mean:
      partner.peak_to_decicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_decicentinagintic_mean:
      metric.peak_to_decicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMean {
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
    tight_ptdcnm_max: TIGHT_PTDCNM_MAX,
    wide_ptdcnm_min: WIDE_PTDCNM_MIN,
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

function labelForPtdcnm(
  pool_count: number,
  pool_cells: number,
  ptdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdcnm === null) return "degenerate";
  if (ptdcnm >= wide_min) return "wide";
  if (ptdcnm < tight_max) return "tight";
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

function renderPtdcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdcnm(
    pool_count,
    pool_cells,
    ptdcnm,
    tight_max,
    wide_min,
  );
  const ptdcnmText = ptdcnm === null ? "-" : ptdcnm.toFixed(4);
  return `PTDCNM ${ptdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdcnm_max, wide_ptdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_decicentinagintic_mean, tight_ptdcnm_max, wide_ptdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_decicentinagintic_mean, tight_ptdcnm_max, wide_ptdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdcnm = (max - min) / decicentinagintic_mean where decicentinagintic_mean = ((sum x_i^110) / n)^(1/110). Reads the pool's total RANGE in units of its DECICENTINAGINTIC (power-mean-of-order-110, M_110) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.472 PTNCNM because raising to the ONE-HUNDRED-AND-TENTH power lifts the anchor MORE than raising to the hundred-and-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novecentinagintic) power-mean UNQUADRAGINTASEPTUAGINTUPLET into a DUOQUADRAGINTASEPTUAGINTUPLET with the M_110 decicentinagintic mean, crossing the round DECI-CENTI threshold into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdcnm approaches n^(1/110) so 10-partner pools cap near 1.0212, 20-partner near 1.0276, 30-partner near 1.0314, 40-partner near 1.0341, 50-partner near 1.0362, 60-partner near 1.0379, 70-partner near 1.0394, 80-partner near 1.0406, 85-partner near 1.0412, 89-partner near 1.0417 and 90-partner near 1.0418 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/110) ~= 1.0428) are required to escape into wide with a modest outlier. Composite regime labels: PTDCNM tight + PTNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDCNM 0.9190 tight -- rejoining the uniform ramp's 0.9190 for the twenty-ninth tick in the sequence after PTNCNM's 0.9192 joint bucket at M_109); PTDCNM spread + PTNCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDCNM 1.0109 spread -- two 4-decimal ticks below PTNCNM's 1.0111); PTDCNM spread + PTNCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_110 ([1x99, 100] reads 1.0323 spread after M_109's 1.0327 spread landing); PTDCNM tight + PTNCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_110 ([1, 100] reads 0.9963 tight rejoining M_109's 0.9963 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR decicentinagintic_mean == 0 (guarded but unreachable), tight = ptdcnm &lt; ${tight_ptdcnm_max}, spread = ptdcnm in [${tight_ptdcnm_max}, ${wide_ptdcnm_min}), wide = ptdcnm &ge; ${wide_ptdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
