// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TREDECICENTINAGINTIC-MEAN
// pure-lib (P11.480).
//
// WHOLE-POOL RANGE-AGAINST-TREDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's TREDECICENTINAGINTIC MEAN (a.k.a. power mean of order
// 113, M_113):
//
//   pttdcnm = (max - min) / tredecicentinagintic_mean
//
// where tredecicentinagintic_mean = ((sum x_i^113) / n)^(1/113).
// Reads the peak spread against the TREDECICENTINAGINTIC
// (power-mean-of-order-113) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.478 PTDDCNM, because raising to
// the ONE-HUNDRED-AND-THIRTEENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twelfth does, dampening
// the ratio against the range even harder.
//
// PTTDCNM's unique DISPERSION-axis contribution: reads range in units
// of the TREDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-113) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112) power-mean
// QUATTUORQUADRAGINTASEPTUAGINTUPLET into a
// QUINQUADRAGINTASEPTUAGINTUPLET with the M_113
// tredecicentinagintic mean -- climbing one step further into the
// second dozen of the triple-digit family opened at PTCNM. By Power
// Mean inequality M_113 >= M_112, so tredecicentinagintic_mean >=
// duodecicentinagintic_mean and pttdcnm <= ptddcnm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tredecicentinagintic_mean approaches x_max / n^(1/113), so pttdcnm
// approaches n^(1/113) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/113) ~= 1.0206, for n=20 ~= 1.0269, for n=30 ~= 1.0306,
// for n=40 ~= 1.0332, for n=50 ~= 1.0352, for n=60 ~= 1.0369,
// for n=70 ~= 1.0383, for n=80 ~= 1.0395, for n=85 ~= 1.0401,
// for n=89 ~= 1.0405, for n=90 ~= 1.0406 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/113) ~= 1.0416)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/113) ~= 1.0416, and the pool100
// [1x99, 100] reference reads 1.0312 spread (further absorbed
// from PTDDCNM's 1.0316 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_113.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tredecicentinagintic_mean = k,
//                                     range 0, pttdcnm 0 (tight).
//   * uniform ramp [1..10]          -> TDCNM ~= 9.7983, range 9,
//                                     pttdcnm ~= 0.9185 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTDDCNM 0.9187 at M_112).
//   * upper-outlier [1x9, 10]       -> TDCNM ~= 9.7983, range 9,
//                                     pttdcnm ~= 0.9185 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_113;
//                                     the M_112 joint collapse at
//                                     0.9187 persists at M_113 as a
//                                     joint 0.9185 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/113) ~ 9.7983 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> TDCNM ~= 4.9293, range 4,
//                                     pttdcnm ~= 0.8115 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDDCNM 0.8116 at M_112).
//   * 50/50 split [1x5, 10x5]       -> TDCNM ~= 9.9388, range 9,
//                                     pttdcnm ~= 0.9055 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDDCNM 0.9056 at M_112;
//                                     the M_111..M_112 joint 0.9056
//                                     landing unpicks at M_113).
//   * extreme outlier [1x9, 100]    -> TDCNM ~= 97.9829, range 99,
//                                     pttdcnm ~= 1.0104 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/113) ~ 1.0206 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTDDCNM 1.0106 at M_112).
//   * two-partner [1, 9]            -> TDCNM ~= 8.9450, range 8,
//                                     pttdcnm ~= 0.8944 (tight --
//                                     JOINT with PTDDCNM 0.8944 at
//                                     M_112; the small-n / small-max
//                                     ratio sits inside the same
//                                     4-decimal bucket at M_113).
//   * two-partner [1, 100]          -> TDCNM ~= 99.3885, range 99,
//                                     pttdcnm ~= 0.9961 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTDDCNM 0.9961 at
//                                     M_112; 2nd consecutive
//                                     power-mean order landing in
//                                     the same 4-decimal bucket).
//   * small [10, 1, 1]              -> TDCNM ~= 9.9032, range 9,
//                                     pttdcnm ~= 0.9088 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDDCNM 0.9089 at M_112).
//   * pool_count=100 [1x99, 100]    -> TDCNM ~= 96.0066, range 99,
//                                     pttdcnm ~= 1.0312 (SPREAD --
//                                     FURTHER ABSORBED from PTDDCNM
//                                     M_112's 1.0316 spread; the
//                                     100-partner asymptote
//                                     100^(1/113) ~ 1.0416 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_113
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw pttdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tredecicentinagintic_mean == 0
//   * tight                pttdcnm < 1.005
//   * spread               pttdcnm in [1.005, 1.09)
//   * wide                 pttdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttdcnm_max /
// wide_pttdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.481):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanSection
// (P11.479) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tredecicentinagintic-center
// after the P11.479 range-against-duodecicentinagintic-center landing.

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
type PttdcnmLabel =
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

// Bands on raw pttdcnm (fixed cutoffs since tredecicentinagintic_mean
// scales with cell counts and typical tredecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_113 is 0.9185
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0208
// (M_112) to 1.0206 (M_113), 20-partner drops from 1.0271 to 1.0269,
// 30-partner drops from 1.0308 to 1.0306, 40-partner drops from
// 1.0335 to 1.0332, 50-partner drops from 1.0355 to 1.0352,
// 60-partner drops from 1.0372 to 1.0369, 70-partner drops from
// 1.0387 to 1.0383, 80-partner drops from 1.0399 to 1.0395,
// 85-partner drops from 1.0405 to 1.0401, 89-partner drops from
// 1.0409 to 1.0405, 90-partner drops from 1.0410 to 1.0406 -- so
// pool_count >= 100 (100^(1/113) ~ 1.0416) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTDDCNM 1.0316 spread to PTTDCNM 1.0312 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTDCNM_MAX = 1.005;
const WIDE_PTTDCNM_MIN = 1.09;

// PTTDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tredecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tredecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttdcnm_max: number;
  readonly wide_pttdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanMap;
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

// Peak-to-tredecicentinagintic-mean of a discrete distribution:
//   PTTDCNM = (max - min) / tredecicentinagintic_mean
// where tredecicentinagintic_mean = ((sum x_i^113) / n)^(1/113).
// Returns null on empty, solo, and degenerate (zero
// tredecicentinagintic_mean or non-finite hundred-and-thirteenth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tredecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tredecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_tredecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tredecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirteenthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^113 = (x^8)^14 * x = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*v
    hundredThirteenthSum +=
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
      v;
  }
  if (!Number.isFinite(hundredThirteenthSum) || hundredThirteenthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tredecicentinagintic_mean: null,
    };
  }
  const tredecicentinagintic_mean = Math.pow(
    hundredThirteenthSum / pool_count,
    1 / 113,
  );
  if (
    !Number.isFinite(tredecicentinagintic_mean) ||
    tredecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_tredecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttdcnm = range / tredecicentinagintic_mean;
  const clamped = pttdcnm < 0 ? 0 : pttdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_tredecicentinagintic_mean: roundTo(clamped, PTTDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tredecicentinagintic_mean:
      partner.peak_to_tredecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tredecicentinagintic_mean:
      metric.peak_to_tredecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMean {
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
    tight_pttdcnm_max: TIGHT_PTTDCNM_MAX,
    wide_pttdcnm_min: WIDE_PTTDCNM_MIN,
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

function labelForPttdcnm(
  pool_count: number,
  pool_cells: number,
  pttdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttdcnm === null) return "degenerate";
  if (pttdcnm >= wide_min) return "wide";
  if (pttdcnm < tight_max) return "tight";
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

function renderPttdcnmCell(
  pool_count: number,
  pool_cells: number,
  pttdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttdcnm(
    pool_count,
    pool_cells,
    pttdcnm,
    tight_max,
    wide_min,
  );
  const pttdcnmText = pttdcnm === null ? "-" : pttdcnm.toFixed(4);
  return `PTTDCNM ${pttdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTredecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttdcnm_max, wide_pttdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tredecicentinagintic_mean, tight_pttdcnm_max, wide_pttdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tredecicentinagintic_mean, tight_pttdcnm_max, wide_pttdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TREDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TREDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttdcnm = (max - min) / tredecicentinagintic_mean where tredecicentinagintic_mean = ((sum x_i^113) / n)^(1/113). Reads the pool's total RANGE in units of its TREDECICENTINAGINTIC (power-mean-of-order-113, M_113) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.478 PTDDCNM because raising to the ONE-HUNDRED-AND-THIRTEENTH power lifts the anchor MORE than raising to the hundred-and-twelfth does. Unique DISPERSION-axis contribution extends the (harmonic..duodecicentinagintic) power-mean QUATTUORQUADRAGINTASEPTUAGINTUPLET into a QUINQUADRAGINTASEPTUAGINTUPLET with the M_113 tredecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttdcnm approaches n^(1/113) so 10-partner pools cap near 1.0206, 20-partner near 1.0269, 30-partner near 1.0306, 40-partner near 1.0332, 50-partner near 1.0352, 60-partner near 1.0369, 70-partner near 1.0383, 80-partner near 1.0395, 85-partner near 1.0401, 89-partner near 1.0405 and 90-partner near 1.0406 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/113) ~= 1.0416) are required to escape into wide with a modest outlier. Composite regime labels: PTTDCNM tight + PTDDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTDCNM 0.9185 tight -- rejoining the uniform ramp's 0.9185 for the thirty-second tick in the sequence after PTDDCNM's 0.9187 joint bucket at M_112); PTTDCNM spread + PTDDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTDCNM 1.0104 spread -- two 4-decimal ticks below PTDDCNM's 1.0106); PTTDCNM spread + PTDDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_113 ([1x99, 100] reads 1.0312 spread after M_112's 1.0316 spread landing); PTTDCNM tight + PTDDCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_113 ([1, 100] reads 0.9961 tight jointly with M_112's 0.9961 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tredecicentinagintic_mean == 0 (guarded but unreachable), tight = pttdcnm &lt; ${tight_pttdcnm_max}, spread = pttdcnm in [${tight_pttdcnm_max}, ${wide_pttdcnm_min}), wide = pttdcnm &ge; ${wide_pttdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
