// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUODECICENTINAGINTIC-MEAN
// pure-lib (P11.478).
//
// WHOLE-POOL RANGE-AGAINST-DUODECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's DUODECICENTINAGINTIC MEAN (a.k.a. power mean of order
// 112, M_112):
//
//   ptddcnm = (max - min) / duodecicentinagintic_mean
//
// where duodecicentinagintic_mean = ((sum x_i^112) / n)^(1/112).
// Reads the peak spread against the DUODECICENTINAGINTIC
// (power-mean-of-order-112) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.476 PTUDCNM, because raising to
// the ONE-HUNDRED-AND-TWELFTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-eleventh does, dampening the
// ratio against the range even harder.
//
// PTDDCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUODECICENTINAGINTIC (POWER-MEAN-OF-ORDER-112) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111) power-mean
// TRESQUADRAGINTASEPTUAGINTUPLET into a
// QUATTUORQUADRAGINTASEPTUAGINTUPLET with the M_112
// duodecicentinagintic mean -- climbing one step further into the
// second dozen of the triple-digit family opened at PTCNM. By Power
// Mean inequality M_112 >= M_111, so duodecicentinagintic_mean >=
// undecicentinagintic_mean and ptddcnm <= ptudcnm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duodecicentinagintic_mean approaches x_max / n^(1/112), so ptddcnm
// approaches n^(1/112) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/112) ~= 1.0208, for n=20 ~= 1.0271, for n=30 ~= 1.0308,
// for n=40 ~= 1.0335, for n=50 ~= 1.0355, for n=60 ~= 1.0372,
// for n=70 ~= 1.0387, for n=80 ~= 1.0399, for n=85 ~= 1.0405,
// for n=89 ~= 1.0409, for n=90 ~= 1.0410 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/112) ~= 1.0420)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/112) ~= 1.0420, and the pool100
// [1x99, 100] reference reads 1.0316 spread (further absorbed
// from PTUDCNM's 1.0319 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_112.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duodecicentinagintic_mean = k,
//                                     range 0, ptddcnm 0 (tight).
//   * uniform ramp [1..10]          -> DDCNM ~= 9.7965, range 9,
//                                     ptddcnm ~= 0.9187 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUDCNM 0.9189 at M_111).
//   * upper-outlier [1x9, 10]       -> DDCNM ~= 9.7965, range 9,
//                                     ptddcnm ~= 0.9187 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_112;
//                                     the M_111 joint collapse at
//                                     0.9189 persists at M_112 as a
//                                     joint 0.9187 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/112) ~ 9.7965 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> DDCNM ~= 4.9287, range 4,
//                                     ptddcnm ~= 0.8116 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUDCNM 0.8117 at M_111).
//   * 50/50 split [1x5, 10x5]       -> DDCNM ~= 9.9383, range 9,
//                                     ptddcnm ~= 0.9056 (tight --
//                                     JOINT with PTUDCNM 0.9056 at
//                                     M_111; half-and-half anchor sits
//                                     inside same 4-decimal bucket for
//                                     a 2nd consecutive M order at
//                                     M_112 after unpicking at M_111).
//   * extreme outlier [1x9, 100]    -> DDCNM ~= 97.9651, range 99,
//                                     ptddcnm ~= 1.0106 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/112) ~ 1.0208 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUDCNM 1.0108 at M_111).
//   * two-partner [1, 9]            -> DDCNM ~= 8.9445, range 8,
//                                     ptddcnm ~= 0.8944 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUDCNM 0.8945 at M_111).
//   * two-partner [1, 100]          -> DDCNM ~= 99.3830, range 99,
//                                     ptddcnm ~= 0.9961 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUDCNM 0.9962 at M_111).
//   * small [10, 1, 1]              -> DDCNM ~= 9.9024, range 9,
//                                     ptddcnm ~= 0.9089 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUDCNM 0.9090 at M_111;
//                                     the M_110..M_111 joint 0.9090
//                                     landing unpicks at M_112).
//   * pool_count=100 [1x99, 100]    -> DDCNM ~= 95.9716, range 99,
//                                     ptddcnm ~= 1.0316 (SPREAD --
//                                     FURTHER ABSORBED from PTUDCNM
//                                     M_111's 1.0319 spread; the
//                                     100-partner asymptote
//                                     100^(1/112) ~ 1.0420 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_112
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptddcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duodecicentinagintic_mean == 0
//   * tight                ptddcnm < 1.005
//   * spread               ptddcnm in [1.005, 1.09)
//   * wide                 ptddcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptddcnm_max /
// wide_ptddcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.479):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanSection
// (P11.477) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duodecicentinagintic-center
// after the P11.477 range-against-undecicentinagintic-center landing.

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
type PtddcnmLabel =
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

// Bands on raw ptddcnm (fixed cutoffs since duodecicentinagintic_mean
// scales with cell counts and typical duodecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_112 is 0.9187
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0210
// (M_111) to 1.0208 (M_112), 20-partner drops from 1.0274 to 1.0271,
// 30-partner drops from 1.0311 to 1.0308, 40-partner drops from
// 1.0338 to 1.0335, 50-partner drops from 1.0359 to 1.0355,
// 60-partner drops from 1.0376 to 1.0372, 70-partner drops from
// 1.0390 to 1.0387, 80-partner drops from 1.0403 to 1.0399,
// 85-partner drops from 1.0408 to 1.0405, 89-partner drops from
// 1.0413 to 1.0409, 90-partner drops from 1.0414 to 1.0410 -- so
// pool_count >= 100 (100^(1/112) ~ 1.0420) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTUDCNM 1.0319 spread to PTDDCNM 1.0316 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDDCNM_MAX = 1.005;
const WIDE_PTDDCNM_MIN = 1.09;

// PTDDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duodecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duodecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptddcnm_max: number;
  readonly wide_ptddcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanMap;
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

// Peak-to-duodecicentinagintic-mean of a discrete distribution:
//   PTDDCNM = (max - min) / duodecicentinagintic_mean
// where duodecicentinagintic_mean = ((sum x_i^112) / n)^(1/112).
// Returns null on empty, solo, and degenerate (zero
// duodecicentinagintic_mean or non-finite hundred-and-twelfth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duodecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duodecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duodecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duodecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwelfthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^112 = (x^8)^14 = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct
    hundredTwelfthSum +=
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
      oct;
  }
  if (!Number.isFinite(hundredTwelfthSum) || hundredTwelfthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duodecicentinagintic_mean: null,
    };
  }
  const duodecicentinagintic_mean = Math.pow(
    hundredTwelfthSum / pool_count,
    1 / 112,
  );
  if (
    !Number.isFinite(duodecicentinagintic_mean) ||
    duodecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duodecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptddcnm = range / duodecicentinagintic_mean;
  const clamped = ptddcnm < 0 ? 0 : ptddcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duodecicentinagintic_mean: roundTo(clamped, PTDDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duodecicentinagintic_mean:
      partner.peak_to_duodecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duodecicentinagintic_mean:
      metric.peak_to_duodecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMean {
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
    tight_ptddcnm_max: TIGHT_PTDDCNM_MAX,
    wide_ptddcnm_min: WIDE_PTDDCNM_MIN,
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

function labelForPtddcnm(
  pool_count: number,
  pool_cells: number,
  ptddcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtddcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptddcnm === null) return "degenerate";
  if (ptddcnm >= wide_min) return "wide";
  if (ptddcnm < tight_max) return "tight";
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

function renderPtddcnmCell(
  pool_count: number,
  pool_cells: number,
  ptddcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtddcnm(
    pool_count,
    pool_cells,
    ptddcnm,
    tight_max,
    wide_min,
  );
  const ptddcnmText = ptddcnm === null ? "-" : ptddcnm.toFixed(4);
  return `PTDDCNM ${ptddcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptddcnm_max, wide_ptddcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtddcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duodecicentinagintic_mean, tight_ptddcnm_max, wide_ptddcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtddcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duodecicentinagintic_mean, tight_ptddcnm_max, wide_ptddcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUODECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUODECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptddcnm = (max - min) / duodecicentinagintic_mean where duodecicentinagintic_mean = ((sum x_i^112) / n)^(1/112). Reads the pool's total RANGE in units of its DUODECICENTINAGINTIC (power-mean-of-order-112, M_112) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.476 PTUDCNM because raising to the ONE-HUNDRED-AND-TWELFTH power lifts the anchor MORE than raising to the hundred-and-eleventh does. Unique DISPERSION-axis contribution extends the (harmonic..undecicentinagintic) power-mean TRESQUADRAGINTASEPTUAGINTUPLET into a QUATTUORQUADRAGINTASEPTUAGINTUPLET with the M_112 duodecicentinagintic mean, climbing one step further into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptddcnm approaches n^(1/112) so 10-partner pools cap near 1.0208, 20-partner near 1.0271, 30-partner near 1.0308, 40-partner near 1.0335, 50-partner near 1.0355, 60-partner near 1.0372, 70-partner near 1.0387, 80-partner near 1.0399, 85-partner near 1.0405, 89-partner near 1.0409 and 90-partner near 1.0410 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/112) ~= 1.0420) are required to escape into wide with a modest outlier. Composite regime labels: PTDDCNM tight + PTUDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDDCNM 0.9187 tight -- rejoining the uniform ramp's 0.9187 for the thirty-first tick in the sequence after PTUDCNM's 0.9189 joint bucket at M_111); PTDDCNM spread + PTUDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDDCNM 1.0106 spread -- two 4-decimal ticks below PTUDCNM's 1.0108); PTDDCNM spread + PTUDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_112 ([1x99, 100] reads 1.0316 spread after M_111's 1.0319 spread landing); PTDDCNM tight + PTUDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one 4-decimal tick at M_112 ([1, 100] reads 0.9961 tight after M_111's 0.9962 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duodecicentinagintic_mean == 0 (guarded but unreachable), tight = ptddcnm &lt; ${tight_ptddcnm_max}, spread = ptddcnm in [${tight_ptddcnm_max}, ${wide_ptddcnm_min}), wide = ptddcnm &ge; ${wide_ptddcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptddcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
