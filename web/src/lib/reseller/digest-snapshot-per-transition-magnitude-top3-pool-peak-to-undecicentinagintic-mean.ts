// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNDECICENTINAGINTIC-MEAN
// pure-lib (P11.476).
//
// WHOLE-POOL RANGE-AGAINST-UNDECICENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's UNDECICENTINAGINTIC MEAN (a.k.a. power mean of order
// 111, M_111):
//
//   ptudcnm = (max - min) / undecicentinagintic_mean
//
// where undecicentinagintic_mean = ((sum x_i^111) / n)^(1/111).
// Reads the peak spread against the UNDECICENTINAGINTIC
// (power-mean-of-order-111) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.474 PTDCNM, because raising to
// the ONE-HUNDRED-AND-ELEVENTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-tenth does, dampening the
// ratio against the range even harder.
//
// PTUDCNM's unique DISPERSION-axis contribution: reads range in units
// of the UNDECICENTINAGINTIC (POWER-MEAN-OF-ORDER-111) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110) power-mean DUOQUADRAGINTASEPTUAGINTUPLET
// into a TRESQUADRAGINTASEPTUAGINTUPLET with the M_111
// undecicentinagintic mean -- climbing one step past the round
// DECI-CENTI threshold into the second dozen of the triple-digit
// family opened at PTCNM. By Power Mean inequality M_111 >= M_110, so
// undecicentinagintic_mean >= decicentinagintic_mean and ptudcnm <=
// ptdcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// undecicentinagintic_mean approaches x_max / n^(1/111), so ptudcnm
// approaches n^(1/111) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/111) ~= 1.0210, for n=20 ~= 1.0274, for n=30 ~= 1.0311,
// for n=40 ~= 1.0338, for n=50 ~= 1.0359, for n=60 ~= 1.0376,
// for n=70 ~= 1.0390, for n=80 ~= 1.0403, for n=85 ~= 1.0408,
// for n=89 ~= 1.0413, for n=90 ~= 1.0414 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/111) ~= 1.0424)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/111) ~= 1.0424, and the pool100
// [1x99, 100] reference reads 1.0319 spread (further absorbed
// from PTDCNM's 1.0323 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_111.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> undecicentinagintic_mean = k,
//                                     range 0, ptudcnm 0 (tight).
//   * uniform ramp [1..10]          -> UDCNM ~= 9.7947, range 9,
//                                     ptudcnm ~= 0.9189 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTDCNM 0.9190 at M_110).
//   * upper-outlier [1x9, 10]       -> UDCNM ~= 9.7947, range 9,
//                                     ptudcnm ~= 0.9189 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_111;
//                                     the M_110 joint collapse at
//                                     0.9190 persists at M_111 as a
//                                     joint 0.9189 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/111) ~ 9.7947 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> UDCNM ~= 4.9280, range 4,
//                                     ptudcnm ~= 0.8117 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDCNM 0.8118 at M_110).
//   * 50/50 split [1x5, 10x5]       -> UDCNM ~= 9.9377, range 9,
//                                     ptudcnm ~= 0.9056 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDCNM 0.9057 at M_110;
//                                     the M_109..M_110 joint 0.9057
//                                     landing finally unpicks at M_111).
//   * extreme outlier [1x9, 100]    -> UDCNM ~= 97.9470, range 99,
//                                     ptudcnm ~= 1.0108 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/111) ~ 1.0210 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTDCNM 1.0109 at M_110).
//   * two-partner [1, 9]            -> UDCNM ~= 8.9440, range 8,
//                                     ptudcnm ~= 0.8945 (tight --
//                                     JOINT with PTDCNM 0.8945 at
//                                     M_110; the small-n / small-max
//                                     ratio sits inside the same
//                                     4-decimal bucket at M_111).
//   * two-partner [1, 100]          -> UDCNM ~= 99.3775, range 99,
//                                     ptudcnm ~= 0.9962 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDCNM 0.9963 at M_110).
//   * small [10, 1, 1]              -> UDCNM ~= 9.9015, range 9,
//                                     ptudcnm ~= 0.9090 (tight --
//                                     JOINT with PTDCNM 0.9090 at
//                                     M_110; small-n / large-max ratio
//                                     sits inside the same 4-decimal
//                                     bucket for a 2nd consecutive
//                                     power-mean order at M_111).
//   * pool_count=100 [1x99, 100]    -> UDCNM ~= 95.9361, range 99,
//                                     ptudcnm ~= 1.0319 (SPREAD --
//                                     FURTHER ABSORBED from PTDCNM
//                                     M_110's 1.0323 spread; the
//                                     100-partner asymptote
//                                     100^(1/111) ~ 1.0424 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_111
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptudcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR undecicentinagintic_mean == 0
//   * tight                ptudcnm < 1.005
//   * spread               ptudcnm in [1.005, 1.09)
//   * wide                 ptudcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptudcnm_max /
// wide_ptudcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.477):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDecicentinaginticMeanSection
// (P11.475) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-undecicentinagintic-center
// after the P11.475 range-against-decicentinagintic-center landing.

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
type PtudcnmLabel =
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

// Bands on raw ptudcnm (fixed cutoffs since undecicentinagintic_mean
// scales with cell counts and typical undecicentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_111 is 0.9189
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0212
// (M_110) to 1.0210 (M_111), 20-partner drops from 1.0276 to 1.0274,
// 30-partner drops from 1.0314 to 1.0311, 40-partner drops from
// 1.0341 to 1.0338, 50-partner drops from 1.0362 to 1.0359,
// 60-partner drops from 1.0379 to 1.0376, 70-partner drops from
// 1.0394 to 1.0390, 80-partner drops from 1.0406 to 1.0403,
// 85-partner drops from 1.0412 to 1.0408, 89-partner drops from
// 1.0417 to 1.0413, 90-partner drops from 1.0418 to 1.0414 -- so
// pool_count >= 100 (100^(1/111) ~ 1.0424) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTDCNM 1.0323 spread to PTUDCNM 1.0319 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUDCNM_MAX = 1.005;
const WIDE_PTUDCNM_MIN = 1.09;

// PTUDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_undecicentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_undecicentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptudcnm_max: number;
  readonly wide_ptudcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanMap;
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

// Peak-to-undecicentinagintic-mean of a discrete distribution:
//   PTUDCNM = (max - min) / undecicentinagintic_mean
// where undecicentinagintic_mean = ((sum x_i^111) / n)^(1/111).
// Returns null on empty, solo, and degenerate (zero
// undecicentinagintic_mean or non-finite hundred-and-eleventh-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_undecicentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_undecicentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_undecicentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_undecicentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredEleventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^111 = (x^8)^13 * x^7 = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*sq*v
    hundredEleventhSum +=
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
      sq *
      v;
  }
  if (!Number.isFinite(hundredEleventhSum) || hundredEleventhSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_undecicentinagintic_mean: null,
    };
  }
  const undecicentinagintic_mean = Math.pow(
    hundredEleventhSum / pool_count,
    1 / 111,
  );
  if (
    !Number.isFinite(undecicentinagintic_mean) ||
    undecicentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_undecicentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptudcnm = range / undecicentinagintic_mean;
  const clamped = ptudcnm < 0 ? 0 : ptudcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_undecicentinagintic_mean: roundTo(clamped, PTUDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_undecicentinagintic_mean:
      partner.peak_to_undecicentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_undecicentinagintic_mean:
      metric.peak_to_undecicentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMean {
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
    tight_ptudcnm_max: TIGHT_PTUDCNM_MAX,
    wide_ptudcnm_min: WIDE_PTUDCNM_MIN,
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

function labelForPtudcnm(
  pool_count: number,
  pool_cells: number,
  ptudcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtudcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptudcnm === null) return "degenerate";
  if (ptudcnm >= wide_min) return "wide";
  if (ptudcnm < tight_max) return "tight";
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

function renderPtudcnmCell(
  pool_count: number,
  pool_cells: number,
  ptudcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtudcnm(
    pool_count,
    pool_cells,
    ptudcnm,
    tight_max,
    wide_min,
  );
  const ptudcnmText = ptudcnm === null ? "-" : ptudcnm.toFixed(4);
  return `PTUDCNM ${ptudcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUndecicentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptudcnm_max, wide_ptudcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtudcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_undecicentinagintic_mean, tight_ptudcnm_max, wide_ptudcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtudcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_undecicentinagintic_mean, tight_ptudcnm_max, wide_ptudcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNDECICENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNDECICENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptudcnm = (max - min) / undecicentinagintic_mean where undecicentinagintic_mean = ((sum x_i^111) / n)^(1/111). Reads the pool's total RANGE in units of its UNDECICENTINAGINTIC (power-mean-of-order-111, M_111) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.474 PTDCNM because raising to the ONE-HUNDRED-AND-ELEVENTH power lifts the anchor MORE than raising to the hundred-and-tenth does. Unique DISPERSION-axis contribution extends the (harmonic..decicentinagintic) power-mean DUOQUADRAGINTASEPTUAGINTUPLET into a TRESQUADRAGINTASEPTUAGINTUPLET with the M_111 undecicentinagintic mean, climbing one step past the round DECI-CENTI threshold into the second dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptudcnm approaches n^(1/111) so 10-partner pools cap near 1.0210, 20-partner near 1.0274, 30-partner near 1.0311, 40-partner near 1.0338, 50-partner near 1.0359, 60-partner near 1.0376, 70-partner near 1.0390, 80-partner near 1.0403, 85-partner near 1.0408, 89-partner near 1.0413 and 90-partner near 1.0414 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/111) ~= 1.0424) are required to escape into wide with a modest outlier. Composite regime labels: PTUDCNM tight + PTDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUDCNM 0.9189 tight -- rejoining the uniform ramp's 0.9189 for the thirtieth tick in the sequence after PTDCNM's 0.9190 joint bucket at M_110); PTUDCNM spread + PTDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUDCNM 1.0108 spread -- one 4-decimal tick below PTDCNM's 1.0109); PTUDCNM spread + PTDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_111 ([1x99, 100] reads 1.0319 spread after M_110's 1.0323 spread landing); PTUDCNM tight + PTDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one 4-decimal tick at M_111 ([1, 100] reads 0.9962 tight after M_110's 0.9963 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR undecicentinagintic_mean == 0 (guarded but unreachable), tight = ptudcnm &lt; ${tight_ptudcnm_max}, spread = ptudcnm in [${tight_ptudcnm_max}, ${wide_ptudcnm_min}), wide = ptudcnm &ge; ${wide_ptudcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptudcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
