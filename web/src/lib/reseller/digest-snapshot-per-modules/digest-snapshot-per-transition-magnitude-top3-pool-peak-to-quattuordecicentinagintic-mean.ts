// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORDECICENTINAGINTIC-MEAN
// pure-lib (P11.482).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's QUATTUORDECICENTINAGINTIC MEAN (a.k.a. power mean of
// order 114, M_114):
//
//   ptqdcnm = (max - min) / quattuordecicentinagintic_mean
//
// where quattuordecicentinagintic_mean = ((sum x_i^114) / n)^(1/114).
// Reads the peak spread against the QUATTUORDECICENTINAGINTIC
// (power-mean-of-order-114) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.480 PTTDCNM, because raising to
// the ONE-HUNDRED-AND-FOURTEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirteenth does,
// dampening the ratio against the range even harder.
//
// PTQDCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-114) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113) power-mean
// QUINQUADRAGINTASEPTUAGINTUPLET into a
// SEXQUADRAGINTASEPTUAGINTUPLET with the M_114
// quattuordecicentinagintic mean -- climbing one step further into
// the second dozen of the triple-digit family opened at PTCNM. By
// Power Mean inequality M_114 >= M_113, so
// quattuordecicentinagintic_mean >= tredecicentinagintic_mean and
// ptqdcnm <= pttdcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuordecicentinagintic_mean approaches x_max / n^(1/114), so
// ptqdcnm approaches n^(1/114) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/114) ~= 1.0204, for n=20 ~= 1.0266, for n=30 ~= 1.0303,
// for n=40 ~= 1.0329, for n=50 ~= 1.0349, for n=60 ~= 1.0366,
// for n=70 ~= 1.0380, for n=80 ~= 1.0392, for n=85 ~= 1.0397,
// for n=89 ~= 1.0402, for n=90 ~= 1.0403 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/114) ~= 1.0412)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/114) ~= 1.0412, and the pool100
// [1x99, 100] reference reads 1.0308 spread (further absorbed
// from PTTDCNM's 1.0312 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_114.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuordecicentinagintic_mean = k,
//                                     range 0, ptqdcnm 0 (tight).
//   * uniform ramp [1..10]          -> QDCNM ~= 9.8001, range 9,
//                                     ptqdcnm ~= 0.9184 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTDCNM 0.9185 at M_113).
//   * upper-outlier [1x9, 10]       -> QDCNM ~= 9.8001, range 9,
//                                     ptqdcnm ~= 0.9184 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_114;
//                                     the M_113 joint collapse at
//                                     0.9185 persists at M_114 as a
//                                     joint 0.9184 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/114) ~ 9.8001 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QDCNM ~= 4.9295, range 4,
//                                     ptqdcnm ~= 0.8114 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTDCNM 0.8115 at M_113).
//   * 50/50 split [1x5, 10x5]       -> QDCNM ~= 9.9394, range 9,
//                                     ptqdcnm ~= 0.9055 (tight --
//                                     JOINT with PTTDCNM 0.9055 at
//                                     M_113 -- the half-and-half
//                                     anchor sits inside the same
//                                     4-decimal bucket for a 2nd
//                                     consecutive M order at M_114
//                                     after unpicking at M_113).
//   * extreme outlier [1x9, 100]    -> QDCNM ~= 98.0014, range 99,
//                                     ptqdcnm ~= 1.0102 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/114) ~ 1.0204 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTTDCNM 1.0104 at M_113).
//   * two-partner [1, 9]            -> QDCNM ~= 8.9457, range 8,
//                                     ptqdcnm ~= 0.8943 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTDCNM 0.8944 at M_113).
//   * two-partner [1, 100]          -> QDCNM ~= 99.3925, range 99,
//                                     ptqdcnm ~= 0.9960 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTDCNM 0.9961 at M_113).
//   * small [10, 1, 1]              -> QDCNM ~= 9.9043, range 9,
//                                     ptqdcnm ~= 0.9087 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTDCNM 0.9088 at M_113).
//   * pool_count=100 [1x99, 100]    -> QDCNM ~= 96.0416, range 99,
//                                     ptqdcnm ~= 1.0308 (SPREAD --
//                                     FURTHER ABSORBED from PTTDCNM
//                                     M_113's 1.0312 spread; the
//                                     100-partner asymptote
//                                     100^(1/114) ~ 1.0412 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_114
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptqdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuordecicentinagintic_mean == 0
//   * tight                ptqdcnm < 1.005
//   * spread               ptqdcnm in [1.005, 1.09)
//   * wide                 ptqdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqdcnm_max /
// wide_ptqdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.483):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanSection
// (P11.481) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuordecicentinagintic-center
// after the P11.481 range-against-tredecicentinagintic-center landing.

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
type PtqdcnmLabel =
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

// Bands on raw ptqdcnm (fixed cutoffs since quattuordecicentinagintic_mean
// scales with cell counts and typical quattuordecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_114 is 0.9184
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0206
// (M_113) to 1.0204 (M_114), 20-partner drops from 1.0269 to 1.0266,
// 30-partner drops from 1.0306 to 1.0303, 40-partner drops from
// 1.0332 to 1.0329, 50-partner drops from 1.0352 to 1.0349,
// 60-partner drops from 1.0369 to 1.0366, 70-partner drops from
// 1.0383 to 1.0380, 80-partner drops from 1.0395 to 1.0392,
// 85-partner drops from 1.0401 to 1.0397, 89-partner drops from
// 1.0405 to 1.0402, 90-partner drops from 1.0406 to 1.0403 -- so
// pool_count >= 100 (100^(1/114) ~ 1.0412) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTDCNM 1.0312 spread to PTQDCNM 1.0308 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQDCNM_MAX = 1.005;
const WIDE_PTQDCNM_MIN = 1.09;

// PTQDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuordecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuordecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqdcnm_max: number;
  readonly wide_ptqdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanMap;
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

// Peak-to-quattuordecicentinagintic-mean of a discrete distribution:
//   PTQDCNM = (max - min) / quattuordecicentinagintic_mean
// where quattuordecicentinagintic_mean = ((sum x_i^114) / n)^(1/114).
// Returns null on empty, solo, and degenerate (zero
// quattuordecicentinagintic_mean or non-finite hundred-and-fourteenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuordecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuordecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuordecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuordecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFourteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^114 = (x^8)^14 * x^2 = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*sq
    hundredFourteenthSum +=
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
      oct *
      sq;
  }
  if (!Number.isFinite(hundredFourteenthSum) || hundredFourteenthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuordecicentinagintic_mean: null,
    };
  }
  const quattuordecicentinagintic_mean = Math.pow(
    hundredFourteenthSum / pool_count,
    1 / 114,
  );
  if (
    !Number.isFinite(quattuordecicentinagintic_mean) ||
    quattuordecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuordecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqdcnm = range / quattuordecicentinagintic_mean;
  const clamped = ptqdcnm < 0 ? 0 : ptqdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuordecicentinagintic_mean: roundTo(clamped, PTQDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuordecicentinagintic_mean:
      partner.peak_to_quattuordecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuordecicentinagintic_mean:
      metric.peak_to_quattuordecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMean {
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
    tight_ptqdcnm_max: TIGHT_PTQDCNM_MAX,
    wide_ptqdcnm_min: WIDE_PTQDCNM_MIN,
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

function labelForPtqdcnm(
  pool_count: number,
  pool_cells: number,
  ptqdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqdcnm === null) return "degenerate";
  if (ptqdcnm >= wide_min) return "wide";
  if (ptqdcnm < tight_max) return "tight";
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

function renderPtqdcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqdcnm(
    pool_count,
    pool_cells,
    ptqdcnm,
    tight_max,
    wide_min,
  );
  const ptqdcnmText = ptqdcnm === null ? "-" : ptqdcnm.toFixed(4);
  return `PTQDCNM ${ptqdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuordecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqdcnm_max, wide_ptqdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuordecicentinagintic_mean, tight_ptqdcnm_max, wide_ptqdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuordecicentinagintic_mean, tight_ptqdcnm_max, wide_ptqdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqdcnm = (max - min) / quattuordecicentinagintic_mean where quattuordecicentinagintic_mean = ((sum x_i^114) / n)^(1/114). Reads the pool's total RANGE in units of its QUATTUORDECICENTINAGINTIC (power-mean-of-order-114, M_114) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.480 PTTDCNM because raising to the ONE-HUNDRED-AND-FOURTEENTH power lifts the anchor MORE than raising to the hundred-and-thirteenth does. Unique DISPERSION-axis contribution extends the (harmonic..tredecicentinagintic) power-mean QUINQUADRAGINTASEPTUAGINTUPLET into a SEXQUADRAGINTASEPTUAGINTUPLET with the M_114 quattuordecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqdcnm approaches n^(1/114) so 10-partner pools cap near 1.0204, 20-partner near 1.0266, 30-partner near 1.0303, 40-partner near 1.0329, 50-partner near 1.0349, 60-partner near 1.0366, 70-partner near 1.0380, 80-partner near 1.0392, 85-partner near 1.0397, 89-partner near 1.0402 and 90-partner near 1.0403 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/114) ~= 1.0412) are required to escape into wide with a modest outlier. Composite regime labels: PTQDCNM tight + PTTDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQDCNM 0.9184 tight -- rejoining the uniform ramp's 0.9184 for the thirty-third tick in the sequence after PTTDCNM's 0.9185 joint bucket at M_113); PTQDCNM spread + PTTDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQDCNM 1.0102 spread -- two 4-decimal ticks below PTTDCNM's 1.0104); PTQDCNM spread + PTTDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_114 ([1x99, 100] reads 1.0308 spread after M_113's 1.0312 spread landing); PTQDCNM tight + PTTDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_114 ([1, 100] reads 0.9960 tight after M_113's 0.9961 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuordecicentinagintic_mean == 0 (guarded but unreachable), tight = ptqdcnm &lt; ${tight_ptqdcnm_max}, spread = ptqdcnm in [${tight_ptqdcnm_max}, ${wide_ptqdcnm_min}), wide = ptqdcnm &ge; ${wide_ptqdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
