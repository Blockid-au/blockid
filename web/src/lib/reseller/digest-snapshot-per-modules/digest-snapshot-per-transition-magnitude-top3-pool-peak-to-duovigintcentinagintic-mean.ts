// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.498).
//
// WHOLE-POOL RANGE-AGAINST-DUOVIGINTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's DUOVIGINTCENTINAGINTIC MEAN (a.k.a. power mean of
// order 122, M_122):
//
//   ptdvcnm = (max - min) / duovigintcentinagintic_mean
//
// where duovigintcentinagintic_mean = ((sum x_i^122) / n)^(1/122).
// Reads the peak spread against the DUOVIGINTCENTINAGINTIC
// (power-mean-of-order-122) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.496 PTUVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-SECOND power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-first does,
// dampening the ratio against the range even harder.
//
// PTDVCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUOVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-122) CENTER.
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
// vigintcentinagintic M_120, unvigintcentinagintic M_121) power-mean
// TRESQUINQUAGINTASEPTUAGINTUPLET into a
// QUATTUORQUINQUAGINTASEPTUAGINTUPLET with the M_122
// duovigintcentinagintic mean -- climbing one step further into the
// third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_122 >= M_121, so duovigintcentinagintic_mean
// >= unvigintcentinagintic_mean and ptdvcnm <= ptuvcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duovigintcentinagintic_mean approaches x_max / n^(1/122), so
// ptdvcnm approaches n^(1/122) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/122) ~= 1.0191, for n=20 ~= 1.0249, for n=30 ~= 1.0283,
// for n=40 ~= 1.0307, for n=50 ~= 1.0326, for n=60 ~= 1.0341,
// for n=70 ~= 1.0354, for n=80 ~= 1.0366, for n=85 ~= 1.0371,
// for n=89 ~= 1.0375, for n=90 ~= 1.0376 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/122) ~= 1.0385)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/122) ~= 1.0385, and the pool100
// [1x99, 100] reference reads 1.0281 spread (further absorbed
// from PTUVCNM's 1.0284 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_122.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duovigintcentinagintic_mean = k,
//                                     range 0, ptdvcnm 0 (tight).
//   * uniform ramp [1..10]          -> DVCNM ~= 9.8130, range 9,
//                                     ptdvcnm ~= 0.9171 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUVCNM 0.9173 at M_121).
//   * upper-outlier [1x9, 10]       -> DVCNM ~= 9.8130, range 9,
//                                     ptdvcnm ~= 0.9171 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_122;
//                                     the M_121 joint collapse at
//                                     0.9173 persists at M_122 as a
//                                     joint 0.9171 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/122) ~ 9.8130 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> DVCNM ~= 4.9345, range 4,
//                                     ptdvcnm ~= 0.8106 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUVCNM 0.8107 at M_121).
//   * 50/50 split [1x5, 10x5]       -> DVCNM ~= 9.9433, range 9,
//                                     ptdvcnm ~= 0.9051 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUVCNM 0.9052 at M_121).
//   * extreme outlier [1x9, 100]    -> DVCNM ~= 98.1303, range 99,
//                                     ptdvcnm ~= 1.0089 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/122) ~ 1.0191 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTUVCNM 1.0090 at M_121).
//   * two-partner [1, 9]            -> DVCNM ~= 8.9490, range 8,
//                                     ptdvcnm ~= 0.8940 (tight --
//                                     JOINT with PTUVCNM 0.8940 at
//                                     M_121).
//   * two-partner [1, 100]          -> DVCNM ~= 99.4335, range 99,
//                                     ptdvcnm ~= 0.9956 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUVCNM 0.9957 at M_121).
//   * small [10, 1, 1]              -> DVCNM ~= 9.9104, range 9,
//                                     ptdvcnm ~= 0.9081 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUVCNM 0.9082 at M_121).
//   * pool_count=100 [1x99, 100]    -> DVCNM ~= 96.2956, range 99,
//                                     ptdvcnm ~= 1.0281 (SPREAD --
//                                     FURTHER ABSORBED from PTUVCNM
//                                     M_121's 1.0284 spread; the
//                                     100-partner asymptote
//                                     100^(1/122) ~ 1.0385 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_122
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptdvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duovigintcentinagintic_mean == 0
//   * tight                ptdvcnm < 1.005
//   * spread               ptdvcnm in [1.005, 1.09)
//   * wide                 ptdvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdvcnm_max /
// wide_ptdvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.499):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnvigintcentinaginticMeanSection
// (P11.497) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duovigintcentinagintic-center
// after the P11.497 range-against-unvigintcentinagintic-center landing.

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
type PtdvcnmLabel =
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

// Bands on raw ptdvcnm (fixed cutoffs since duovigintcentinagintic_mean
// scales with cell counts and typical duovigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_122 is 0.9171
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0192
// (M_121) to 1.0191 (M_122), 20-partner drops from 1.0251 to 1.0249,
// 30-partner drops from 1.0285 to 1.0283, 40-partner drops from
// 1.0310 to 1.0307, 50-partner drops from 1.0329 to 1.0326,
// 60-partner drops from 1.0344 to 1.0341, 70-partner drops from
// 1.0357 to 1.0354, 80-partner drops from 1.0369 to 1.0366,
// 85-partner drops from 1.0374 to 1.0371, 89-partner drops from
// 1.0378 to 1.0375, 90-partner drops from 1.0379 to 1.0376 -- so
// pool_count >= 100 (100^(1/122) ~ 1.0385) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTUVCNM 1.0284 spread to PTDVCNM 1.0281 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDVCNM_MAX = 1.005;
const WIDE_PTDVCNM_MIN = 1.09;

// PTDVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duovigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duovigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdvcnm_max: number;
  readonly wide_ptdvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanMap;
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

// Peak-to-duovigintcentinagintic-mean of a discrete distribution:
//   PTDVCNM = (max - min) / duovigintcentinagintic_mean
// where duovigintcentinagintic_mean = ((sum x_i^122) / n)^(1/122).
// Returns null on empty, solo, and degenerate (zero
// duovigintcentinagintic_mean or non-finite hundred-and-twenty-second-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duovigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duovigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duovigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duovigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^122 = x^64 * x^32 * x^16 * x^8 * x^2 = p64 * p32 * p16 * oct * sq
    hundredTwentySecondSum += p64 * p32 * p16 * oct * sq;
  }
  if (
    !Number.isFinite(hundredTwentySecondSum) ||
    hundredTwentySecondSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duovigintcentinagintic_mean: null,
    };
  }
  const duovigintcentinagintic_mean = Math.pow(
    hundredTwentySecondSum / pool_count,
    1 / 122,
  );
  if (
    !Number.isFinite(duovigintcentinagintic_mean) ||
    duovigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duovigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdvcnm = range / duovigintcentinagintic_mean;
  const clamped = ptdvcnm < 0 ? 0 : ptdvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duovigintcentinagintic_mean: roundTo(clamped, PTDVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duovigintcentinagintic_mean:
      partner.peak_to_duovigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duovigintcentinagintic_mean:
      metric.peak_to_duovigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMean {
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
    tight_ptdvcnm_max: TIGHT_PTDVCNM_MAX,
    wide_ptdvcnm_min: WIDE_PTDVCNM_MIN,
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

function labelForPtdvcnm(
  pool_count: number,
  pool_cells: number,
  ptdvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdvcnm === null) return "degenerate";
  if (ptdvcnm >= wide_min) return "wide";
  if (ptdvcnm < tight_max) return "tight";
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

function renderPtdvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdvcnm(
    pool_count,
    pool_cells,
    ptdvcnm,
    tight_max,
    wide_min,
  );
  const ptdvcnmText = ptdvcnm === null ? "-" : ptdvcnm.toFixed(4);
  return `PTDVCNM ${ptdvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuovigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdvcnm_max, wide_ptdvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duovigintcentinagintic_mean, tight_ptdvcnm_max, wide_ptdvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duovigintcentinagintic_mean, tight_ptdvcnm_max, wide_ptdvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdvcnm = (max - min) / duovigintcentinagintic_mean where duovigintcentinagintic_mean = ((sum x_i^122) / n)^(1/122). Reads the pool's total RANGE in units of its DUOVIGINTCENTINAGINTIC (power-mean-of-order-122, M_122) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.496 PTUVCNM because raising to the ONE-HUNDRED-AND-TWENTY-SECOND power lifts the anchor MORE than raising to the hundred-and-twenty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unvigintcentinagintic) power-mean TRESQUINQUAGINTASEPTUAGINTUPLET into a QUATTUORQUINQUAGINTASEPTUAGINTUPLET with the M_122 duovigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdvcnm approaches n^(1/122) so 10-partner pools cap near 1.0191, 20-partner near 1.0249, 30-partner near 1.0283, 40-partner near 1.0307, 50-partner near 1.0326, 60-partner near 1.0341, 70-partner near 1.0354, 80-partner near 1.0366, 85-partner near 1.0371, 89-partner near 1.0375 and 90-partner near 1.0376 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/122) ~= 1.0385) are required to escape into wide with a modest outlier. Composite regime labels: PTDVCNM tight + PTUVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDVCNM 0.9171 tight -- rejoining the uniform ramp's 0.9171 for the forty-first tick in the sequence after PTUVCNM's 0.9173 joint bucket at M_121); PTDVCNM spread + PTUVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDVCNM 1.0089 spread -- one 4-decimal tick below PTUVCNM's 1.0090); PTDVCNM spread + PTUVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_122 ([1x99, 100] reads 1.0281 spread after M_121's 1.0284 spread landing); PTDVCNM tight + PTUVCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_122 ([1, 100] reads 0.9956 tight one tick below M_121's 0.9957 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duovigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptdvcnm &lt; ${tight_ptdvcnm_max}, spread = ptdvcnm in [${tight_ptdvcnm_max}, ${wide_ptdvcnm_min}), wide = ptdvcnm &ge; ${wide_ptdvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
