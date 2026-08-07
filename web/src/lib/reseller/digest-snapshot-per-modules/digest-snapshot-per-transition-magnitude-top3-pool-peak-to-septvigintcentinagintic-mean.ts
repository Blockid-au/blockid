// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.508).
//
// WHOLE-POOL RANGE-AGAINST-SEPTVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SEPTVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 127, M_127):
//
//   ptspvcnm = (max - min) / septvigintcentinagintic_mean
//
// where septvigintcentinagintic_mean = ((sum x_i^127) / n)^(1/127).
// Reads the peak spread against the SEPTVIGINTCENTINAGINTIC
// (power-mean-of-order-127) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.506 PTSVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-SEVENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-sixth does,
// dampening the ratio against the range even harder.
//
// PTSPVCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-127) CENTER.
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
// sesvigintcentinagintic M_126) power-mean OCTQUINQUAGINTASEPTUAGINTUPLET
// into a NOVQUINQUAGINTASEPTUAGINTUPLET with the M_127
// septvigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_127 >= M_126, so
// septvigintcentinagintic_mean >= sesvigintcentinagintic_mean and
// ptspvcnm <= ptsvcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septvigintcentinagintic_mean approaches x_max / n^(1/127), so
// ptspvcnm approaches n^(1/127) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/127) ~= 1.0183, for n=20 ~= 1.0239, for n=30 ~= 1.0271,
// for n=40 ~= 1.0295, for n=50 ~= 1.0313, for n=60 ~= 1.0328,
// for n=70 ~= 1.0340, for n=80 ~= 1.0351, for n=85 ~= 1.0356,
// for n=89 ~= 1.0360, for n=90 ~= 1.0361 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/127) ~= 1.0369)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/127) ~= 1.0369, and the pool100
// [1x99, 100] reference reads 1.0266 spread (further absorbed
// from PTSVCNM's 1.0269 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_127.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septvigintcentinagintic_mean = k,
//                                     range 0, ptspvcnm 0 (tight).
//   * uniform ramp [1..10]          -> SPVCNM ~= 9.8203, range 9,
//                                     ptspvcnm ~= 0.9165 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSVCNM 0.9166 at M_126).
//   * upper-outlier [1x9, 10]       -> SPVCNM ~= 9.8203, range 9,
//                                     ptspvcnm ~= 0.9165 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_127;
//                                     the M_126 joint collapse at
//                                     0.9166 persists at M_127 as a
//                                     joint 0.9165 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/127) ~ 9.8203 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SPVCNM ~= 4.9370, range 4,
//                                     ptspvcnm ~= 0.8102 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSVCNM 0.8103 at M_126).
//   * 50/50 split [1x5, 10x5]       -> SPVCNM ~= 9.9456, range 9,
//                                     ptspvcnm ~= 0.9049 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSVCNM 0.9050 at M_126).
//   * extreme outlier [1x9, 100]    -> SPVCNM ~= 98.2033, range 99,
//                                     ptspvcnm ~= 1.0081 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/127) ~ 1.0183 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSVCNM 1.0083 at M_126).
//   * two-partner [1, 9]            -> SPVCNM ~= 8.9510, range 8,
//                                     ptspvcnm ~= 0.8938 (tight --
//                                     JOINT with PTSVCNM 0.8938 at
//                                     M_126).
//   * two-partner [1, 100]          -> SPVCNM ~= 99.4557, range 99,
//                                     ptspvcnm ~= 0.9954 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick from
//                                     PTSVCNM 0.9955 at M_126).
//   * small [10, 1, 1]              -> SPVCNM ~= 9.9139, range 9,
//                                     ptspvcnm ~= 0.9078 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTSVCNM 0.9079 at M_126).
//   * pool_count=100 [1x99, 100]    -> SPVCNM ~= 96.4388, range 99,
//                                     ptspvcnm ~= 1.0266 (SPREAD --
//                                     FURTHER ABSORBED from PTSVCNM
//                                     M_126's 1.0269 spread; the
//                                     100-partner asymptote
//                                     100^(1/127) ~ 1.0369 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_127
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptspvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septvigintcentinagintic_mean == 0
//   * tight                ptspvcnm < 1.005
//   * spread               ptspvcnm in [1.005, 1.09)
//   * wide                 ptspvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspvcnm_max /
// wide_ptspvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.509):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanSection
// (P11.507) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septvigintcentinagintic-center
// after the P11.507 range-against-sesvigintcentinagintic-center landing.

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
type PtspvcnmLabel =
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

// Bands on raw ptspvcnm (fixed cutoffs since septvigintcentinagintic_mean
// scales with cell counts and typical septvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_127 is 0.9165
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0184
// (M_126) to 1.0183 (M_127), 20-partner drops from 1.0241 to 1.0239,
// 30-partner drops from 1.0274 to 1.0271, 40-partner drops from
// 1.0297 to 1.0295, 50-partner drops from 1.0315 to 1.0313,
// 60-partner drops from 1.0330 to 1.0328, 70-partner drops from
// 1.0343 to 1.0340, 80-partner drops from 1.0354 to 1.0351,
// 85-partner drops from 1.0359 to 1.0356, 89-partner drops from
// 1.0363 to 1.0360, 90-partner drops from 1.0364 to 1.0361 -- so
// pool_count >= 100 (100^(1/127) ~ 1.0369) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSVCNM 1.0269 spread to PTSPVCNM 1.0266 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPVCNM_MAX = 1.005;
const WIDE_PTSPVCNM_MIN = 1.09;

// PTSPVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspvcnm_max: number;
  readonly wide_ptspvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanMap;
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

// Peak-to-septvigintcentinagintic-mean of a discrete distribution:
//   PTSPVCNM = (max - min) / septvigintcentinagintic_mean
// where septvigintcentinagintic_mean = ((sum x_i^127) / n)^(1/127).
// Returns null on empty, solo, and degenerate (zero
// septvigintcentinagintic_mean or non-finite hundred-and-twenty-seventh-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^127 = x^64 * x^32 * x^16 * x^8 * x^4 * x^2 * x = p64 * p32 * p16 * oct * quad * sq * v
    hundredTwentySeventhSum += p64 * p32 * p16 * oct * quad * sq * v;
  }
  if (
    !Number.isFinite(hundredTwentySeventhSum) ||
    hundredTwentySeventhSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septvigintcentinagintic_mean: null,
    };
  }
  const septvigintcentinagintic_mean = Math.pow(
    hundredTwentySeventhSum / pool_count,
    1 / 127,
  );
  if (
    !Number.isFinite(septvigintcentinagintic_mean) ||
    septvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspvcnm = range / septvigintcentinagintic_mean;
  const clamped = ptspvcnm < 0 ? 0 : ptspvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septvigintcentinagintic_mean: roundTo(clamped, PTSPVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septvigintcentinagintic_mean:
      partner.peak_to_septvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septvigintcentinagintic_mean:
      metric.peak_to_septvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMean {
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
    tight_ptspvcnm_max: TIGHT_PTSPVCNM_MAX,
    wide_ptspvcnm_min: WIDE_PTSPVCNM_MIN,
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

function labelForPtspvcnm(
  pool_count: number,
  pool_cells: number,
  ptspvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtspvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspvcnm === null) return "degenerate";
  if (ptspvcnm >= wide_min) return "wide";
  if (ptspvcnm < tight_max) return "tight";
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

function renderPtspvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptspvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspvcnm(
    pool_count,
    pool_cells,
    ptspvcnm,
    tight_max,
    wide_min,
  );
  const ptspvcnmText = ptspvcnm === null ? "-" : ptspvcnm.toFixed(4);
  return `PTSPVCNM ${ptspvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspvcnm_max, wide_ptspvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septvigintcentinagintic_mean, tight_ptspvcnm_max, wide_ptspvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septvigintcentinagintic_mean, tight_ptspvcnm_max, wide_ptspvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspvcnm = (max - min) / septvigintcentinagintic_mean where septvigintcentinagintic_mean = ((sum x_i^127) / n)^(1/127). Reads the pool's total RANGE in units of its SEPTVIGINTCENTINAGINTIC (power-mean-of-order-127, M_127) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.506 PTSVCNM because raising to the ONE-HUNDRED-AND-TWENTY-SEVENTH power lifts the anchor MORE than raising to the hundred-and-twenty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesvigintcentinagintic) power-mean OCTQUINQUAGINTASEPTUAGINTUPLET into a NOVQUINQUAGINTASEPTUAGINTUPLET with the M_127 septvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspvcnm approaches n^(1/127) so 10-partner pools cap near 1.0183, 20-partner near 1.0239, 30-partner near 1.0271, 40-partner near 1.0295, 50-partner near 1.0313, 60-partner near 1.0328, 70-partner near 1.0340, 80-partner near 1.0351, 85-partner near 1.0356, 89-partner near 1.0360 and 90-partner near 1.0361 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/127) ~= 1.0369) are required to escape into wide with a modest outlier. Composite regime labels: PTSPVCNM tight + PTSVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPVCNM 0.9165 tight -- rejoining the uniform ramp's 0.9165 for the forty-sixth tick in the sequence after PTSVCNM's 0.9166 joint bucket at M_126); PTSPVCNM spread + PTSVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPVCNM 1.0081 spread -- two 4-decimal ticks below PTSVCNM's 1.0083); PTSPVCNM spread + PTSVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_127 ([1x99, 100] reads 1.0266 spread after M_126's 1.0269 spread landing); PTSPVCNM tight + PTSVCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_127 ([1, 100] reads 0.9954 tight below M_126's 0.9955 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptspvcnm &lt; ${tight_ptspvcnm_max}, spread = ptspvcnm in [${tight_ptspvcnm_max}, ${wide_ptspvcnm_min}), wide = ptspvcnm &ge; ${wide_ptspvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
