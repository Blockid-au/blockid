// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-VIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.494).
//
// WHOLE-POOL RANGE-AGAINST-VIGINTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's VIGINTCENTINAGINTIC MEAN (a.k.a. power mean of
// order 120, M_120):
//
//   ptvcnm = (max - min) / vigintcentinagintic_mean
//
// where vigintcentinagintic_mean = ((sum x_i^120) / n)^(1/120).
// Reads the peak spread against the VIGINTCENTINAGINTIC
// (power-mean-of-order-120) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.492 PTNDCNM, because raising to
// the ONE-HUNDRED-AND-TWENTIETH power before averaging lifts the
// anchor MORE than raising to the hundred-and-nineteenth does,
// dampening the ratio against the range even harder.
//
// PTVCNM's unique DISPERSION-axis contribution: reads range in units
// of the VIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-120) CENTER.
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
// octodecicentinagintic M_118, novedecicentinagintic M_119)
// power-mean UNQUINQUAGINTASEPTUAGINTUPLET into a
// DUOQUINQUAGINTASEPTUAGINTUPLET with the M_120 vigintcentinagintic
// mean -- climbing one step further into the third dozen of the
// triple-digit family opened at PTCNM. By the Power Mean inequality
// M_120 >= M_119, so vigintcentinagintic_mean >=
// novedecicentinagintic_mean and ptvcnm <= ptndcnm for every
// non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// vigintcentinagintic_mean approaches x_max / n^(1/120), so
// ptvcnm approaches n^(1/120) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/120) ~= 1.0194, for n=20 ~= 1.0253, for n=30 ~= 1.0287,
// for n=40 ~= 1.0312, for n=50 ~= 1.0331, for n=60 ~= 1.0347,
// for n=70 ~= 1.0360, for n=80 ~= 1.0372, for n=85 ~= 1.0377,
// for n=89 ~= 1.0381, for n=90 ~= 1.0382 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/120) ~= 1.0391)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/120) ~= 1.0391, and the pool100
// [1x99, 100] reference reads 1.0287 spread (further absorbed
// from PTNDCNM's 1.0291 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_120.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> vigintcentinagintic_mean = k,
//                                     range 0, ptvcnm 0 (tight).
//   * uniform ramp [1..10]          -> VCNM ~= 9.8091, range 9,
//                                     ptvcnm ~= 0.9174 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTNDCNM 0.9176 at M_119).
//   * upper-outlier [1x9, 10]       -> VCNM ~= 9.8091, range 9,
//                                     ptvcnm ~= 0.9174 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_120;
//                                     the M_119 joint collapse at
//                                     0.9176 persists at M_120 as a
//                                     joint 0.9174 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/120) ~ 9.8091 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> VCNM ~= 4.9331, range 4,
//                                     ptvcnm ~= 0.8108 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNDCNM 0.8109 at M_119).
//   * 50/50 split [1x5, 10x5]       -> VCNM ~= 9.9430, range 9,
//                                     ptvcnm ~= 0.9052 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNDCNM 0.9053 at M_119).
//   * extreme outlier [1x9, 100]    -> VCNM ~= 98.0914, range 99,
//                                     ptvcnm ~= 1.0092 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/120) ~ 1.0194 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTNDCNM 1.0093 at M_119).
//   * two-partner [1, 9]            -> VCNM ~= 8.9483, range 8,
//                                     ptvcnm ~= 0.8940 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNDCNM 0.8941 at M_119).
//   * two-partner [1, 100]          -> VCNM ~= 99.4239, range 99,
//                                     ptvcnm ~= 0.9957 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTNDCNM 0.9958 at M_119).
//   * small [10, 1, 1]              -> VCNM ~= 9.9091, range 9,
//                                     ptvcnm ~= 0.9083 (tight --
//                                     JOINT with PTNDCNM 0.9083 at
//                                     M_119).
//   * pool_count=100 [1x99, 100]    -> VCNM ~= 96.2417, range 99,
//                                     ptvcnm ~= 1.0287 (SPREAD --
//                                     FURTHER ABSORBED from PTNDCNM
//                                     M_119's 1.0291 spread; the
//                                     100-partner asymptote
//                                     100^(1/120) ~ 1.0391 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_120
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR vigintcentinagintic_mean == 0
//   * tight                ptvcnm < 1.005
//   * spread               ptvcnm in [1.005, 1.09)
//   * wide                 ptvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptvcnm_max /
// wide_ptvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.495):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovedecicentinaginticMeanSection
// (P11.493) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-vigintcentinagintic-center
// after the P11.493 range-against-novedecicentinagintic-center landing.

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
type PtvcnmLabel =
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

// Bands on raw ptvcnm (fixed cutoffs since vigintcentinagintic_mean
// scales with cell counts and typical vigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_120 is 0.9174
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0195
// (M_119) to 1.0194 (M_120), 20-partner drops from 1.0255 to 1.0253,
// 30-partner drops from 1.0290 to 1.0287, 40-partner drops from
// 1.0315 to 1.0312, 50-partner drops from 1.0334 to 1.0331,
// 60-partner drops from 1.0350 to 1.0347, 70-partner drops from
// 1.0363 to 1.0360, 80-partner drops from 1.0375 to 1.0372,
// 85-partner drops from 1.0380 to 1.0377, 89-partner drops from
// 1.0384 to 1.0381, 90-partner drops from 1.0385 to 1.0382 -- so
// pool_count >= 100 (100^(1/120) ~ 1.0391) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTNDCNM 1.0291 spread to PTVCNM 1.0287 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTVCNM_MAX = 1.005;
const WIDE_PTVCNM_MIN = 1.09;

// PTVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_vigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_vigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptvcnm_max: number;
  readonly wide_ptvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanMap;
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

// Peak-to-vigintcentinagintic-mean of a discrete distribution:
//   PTVCNM = (max - min) / vigintcentinagintic_mean
// where vigintcentinagintic_mean = ((sum x_i^120) / n)^(1/120).
// Returns null on empty, solo, and degenerate (zero
// vigintcentinagintic_mean or non-finite hundred-and-twentieth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_vigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_vigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_vigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_vigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^120 = x^64 * x^32 * x^16 * x^8 = p64 * p32 * p16 * oct
    hundredTwentiethSum += p64 * p32 * p16 * oct;
  }
  if (
    !Number.isFinite(hundredTwentiethSum) ||
    hundredTwentiethSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_vigintcentinagintic_mean: null,
    };
  }
  const vigintcentinagintic_mean = Math.pow(
    hundredTwentiethSum / pool_count,
    1 / 120,
  );
  if (
    !Number.isFinite(vigintcentinagintic_mean) ||
    vigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_vigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptvcnm = range / vigintcentinagintic_mean;
  const clamped = ptvcnm < 0 ? 0 : ptvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_vigintcentinagintic_mean: roundTo(clamped, PTVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_vigintcentinagintic_mean:
      partner.peak_to_vigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_vigintcentinagintic_mean:
      metric.peak_to_vigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMean {
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
    tight_ptvcnm_max: TIGHT_PTVCNM_MAX,
    wide_ptvcnm_min: WIDE_PTVCNM_MIN,
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

function labelForPtvcnm(
  pool_count: number,
  pool_cells: number,
  ptvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptvcnm === null) return "degenerate";
  if (ptvcnm >= wide_min) return "wide";
  if (ptvcnm < tight_max) return "tight";
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

function renderPtvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtvcnm(
    pool_count,
    pool_cells,
    ptvcnm,
    tight_max,
    wide_min,
  );
  const ptvcnmText = ptvcnm === null ? "-" : ptvcnm.toFixed(4);
  return `PTVCNM ${ptvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToVigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptvcnm_max, wide_ptvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_vigintcentinagintic_mean, tight_ptvcnm_max, wide_ptvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_vigintcentinagintic_mean, tight_ptvcnm_max, wide_ptvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-VIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-VIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptvcnm = (max - min) / vigintcentinagintic_mean where vigintcentinagintic_mean = ((sum x_i^120) / n)^(1/120). Reads the pool's total RANGE in units of its VIGINTCENTINAGINTIC (power-mean-of-order-120, M_120) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.492 PTNDCNM because raising to the ONE-HUNDRED-AND-TWENTIETH power lifts the anchor MORE than raising to the hundred-and-nineteenth does. Unique DISPERSION-axis contribution extends the (harmonic..novedecicentinagintic) power-mean UNQUINQUAGINTASEPTUAGINTUPLET into a DUOQUINQUAGINTASEPTUAGINTUPLET with the M_120 vigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptvcnm approaches n^(1/120) so 10-partner pools cap near 1.0194, 20-partner near 1.0253, 30-partner near 1.0287, 40-partner near 1.0312, 50-partner near 1.0331, 60-partner near 1.0347, 70-partner near 1.0360, 80-partner near 1.0372, 85-partner near 1.0377, 89-partner near 1.0381 and 90-partner near 1.0382 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/120) ~= 1.0391) are required to escape into wide with a modest outlier. Composite regime labels: PTVCNM tight + PTNDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTVCNM 0.9174 tight -- rejoining the uniform ramp's 0.9174 for the thirty-ninth tick in the sequence after PTNDCNM's 0.9176 joint bucket at M_119); PTVCNM spread + PTNDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTVCNM 1.0092 spread -- one 4-decimal tick below PTNDCNM's 1.0093); PTVCNM spread + PTNDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_120 ([1x99, 100] reads 1.0287 spread after M_119's 1.0291 spread landing); PTVCNM tight + PTNDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCE at M_120 ([1, 100] reads 0.9957 tight after M_119's 0.9958 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR vigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptvcnm &lt; ${tight_ptvcnm_max}, spread = ptvcnm in [${tight_ptvcnm_max}, ${wide_ptvcnm_min}), wide = ptvcnm &ge; ${wide_ptvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
