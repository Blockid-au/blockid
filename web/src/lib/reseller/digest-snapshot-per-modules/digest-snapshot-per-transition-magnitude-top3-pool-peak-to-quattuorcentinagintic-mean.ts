// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORCENTINAGINTIC-MEAN
// pure-lib (P11.462).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's QUATTUORCENTINAGINTIC MEAN (a.k.a. power mean of order
// 104, M_104):
//
//   ptqcnm = (max - min) / quattuorcentinagintic_mean
//
// where quattuorcentinagintic_mean = ((sum x_i^104) / n)^(1/104).
// Reads the peak spread against the QUATTUORCENTINAGINTIC
// (power-mean-of-order-104) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.460 PTTCNM, because raising to
// the ONE-HUNDRED-AND-FOURTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-third does, dampening the
// ratio against the range even harder.
//
// PTQCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORCENTINAGINTIC (POWER-MEAN-OF-ORDER-104) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103) power-mean
// QUINQUATRIGINTASEPTUAGINTUPLET into a SEXTRIGINTASEPTUAGINTUPLET
// with the M_104 quattuorcentinagintic mean -- climbing further into
// the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking
// past the round-hundred threshold. By Power Mean inequality
// M_104 >= M_103, so quattuorcentinagintic_mean >=
// trecentinagintic_mean and ptqcnm <= pttcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorcentinagintic_mean approaches x_max / n^(1/104), so ptqcnm
// approaches n^(1/104) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/104) ~= 1.0224, for n=20 ~= 1.0292, for n=30 ~= 1.0332,
// for n=40 ~= 1.0361, for n=50 ~= 1.0383, for n=60 ~= 1.0402,
// for n=70 ~= 1.0417, for n=80 ~= 1.0430, for n=85 ~= 1.0436,
// for n=89 ~= 1.0441, for n=90 ~= 1.0442 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/104) ~= 1.0453)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/104) ~= 1.0453, and the pool100
// [1x99, 100] reference reads 1.0348 spread (further absorbed
// from PTTCNM's 1.0353 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_104.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorcentinagintic_mean = k,
//                                     range 0, ptqcnm 0 (tight).
//   * uniform ramp [1..10]          -> QCNM ~= 9.7810, range 9,
//                                     ptqcnm ~= 0.9201 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTTCNM 0.9203 at M_103).
//   * upper-outlier [1x9, 10]       -> QCNM ~= 9.7810, range 9,
//                                     ptqcnm ~= 0.9201 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_104;
//                                     the M_103 joint collapse at
//                                     0.9203 persists at M_104 as a
//                                     joint 0.9201 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/104) ~ 9.7810 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QCNM ~= 4.9231, range 4,
//                                     ptqcnm ~= 0.8125 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTCNM 0.8126 at M_103).
//   * 50/50 split [1x5, 10x5]       -> QCNM ~= 9.9336, range 9,
//                                     ptqcnm ~= 0.9060 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTCNM 0.9061 at M_103;
//                                     BIMODAL SPLIT continues to
//                                     absorb one 4-decimal tick under
//                                     the extra power at M_104).
//   * extreme outlier [1x9, 100]    -> QCNM ~= 97.8080, range 99,
//                                     ptqcnm ~= 1.0122 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/104) ~ 1.0224 asymptote;
//                                     ADVANCES from PTTCNM 1.0124 at
//                                     M_103 by two 4-decimal ticks).
//   * two-partner [1, 9]            -> QCNM ~= 8.9403, range 8,
//                                     ptqcnm ~= 0.8948 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTCNM 0.8949 at M_103;
//                                     the small-n / small-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_104).
//   * two-partner [1, 100]          -> QCNM ~= 99.3399, range 99,
//                                     ptqcnm ~= 0.9966 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket at
//                                     M_104; from PTTCNM 0.9967 at M_103
//                                     because the quattuorcentinagintic
//                                     anchor tips further past the
//                                     range at n=2).
//   * small [10, 1, 1]              -> QCNM ~= 9.8949, range 9,
//                                     ptqcnm ~= 0.9096 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTTCNM 0.9097 at M_103;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_104).
//   * pool_count=100 [1x99, 100]    -> QCNM ~= 95.6698, range 99,
//                                     ptqcnm ~= 1.0348 (SPREAD --
//                                     FURTHER ABSORBED from PTTCNM
//                                     M_103's 1.0353 spread;
//                                     100-partner asymptote
//                                     100^(1/104) ~ 1.0453 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorcentinagintic_mean == 0
//   * tight                ptqcnm < 1.005
//   * spread               ptqcnm in [1.005, 1.09)
//   * wide                 ptqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqcnm_max /
// wide_ptqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.463):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanSection
// (P11.461) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorcentinagintic-center
// after the P11.461 range-against-trecentinagintic-center landing.

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
type PtqcnmLabel =
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

// Bands on raw ptqcnm (fixed cutoffs since quattuorcentinagintic_mean
// scales with cell counts and typical quattuorcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_104 is 0.9201
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0226
// (M_103) to 1.0224 (M_104), 20-partner drops from 1.0295 to 1.0292,
// 30-partner drops from 1.0336 to 1.0332, 40-partner drops from
// 1.0364 to 1.0361, 50-partner drops from 1.0387 to 1.0383,
// 60-partner drops from 1.0406 to 1.0402, 70-partner drops from
// 1.0421 to 1.0417, 80-partner drops from 1.0435 to 1.0430,
// 85-partner drops from 1.0441 to 1.0436, 89-partner drops from
// 1.0446 to 1.0441, 90-partner drops from 1.0447 to 1.0442 -- so
// pool_count >= 100 (100^(1/104) ~ 1.0453) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTCNM 1.0353 spread to PTQCNM 1.0348 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQCNM_MAX = 1.005;
const WIDE_PTQCNM_MIN = 1.09;

// PTQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqcnm_max: number;
  readonly wide_ptqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanMap;
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

// Peak-to-quattuorcentinagintic-mean of a discrete distribution:
//   PTQCNM = (max - min) / quattuorcentinagintic_mean
// where quattuorcentinagintic_mean = ((sum x_i^104) / n)^(1/104).
// Returns null on empty, solo, and degenerate (zero
// quattuorcentinagintic_mean or non-finite hundred-and-fourth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^104 = (x^8)^13 -> oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct
    hundredFourthSum +=
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
  if (!Number.isFinite(hundredFourthSum) || hundredFourthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorcentinagintic_mean: null,
    };
  }
  const quattuorcentinagintic_mean = Math.pow(
    hundredFourthSum / pool_count,
    1 / 104,
  );
  if (
    !Number.isFinite(quattuorcentinagintic_mean) ||
    quattuorcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqcnm = range / quattuorcentinagintic_mean;
  const clamped = ptqcnm < 0 ? 0 : ptqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorcentinagintic_mean: roundTo(clamped, PTQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorcentinagintic_mean:
      partner.peak_to_quattuorcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorcentinagintic_mean:
      metric.peak_to_quattuorcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMean {
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
    tight_ptqcnm_max: TIGHT_PTQCNM_MAX,
    wide_ptqcnm_min: WIDE_PTQCNM_MIN,
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

function labelForPtqcnm(
  pool_count: number,
  pool_cells: number,
  ptqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqcnm === null) return "degenerate";
  if (ptqcnm >= wide_min) return "wide";
  if (ptqcnm < tight_max) return "tight";
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

function renderPtqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqcnm(
    pool_count,
    pool_cells,
    ptqcnm,
    tight_max,
    wide_min,
  );
  const ptqcnmText = ptqcnm === null ? "-" : ptqcnm.toFixed(4);
  return `PTQCNM ${ptqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqcnm_max, wide_ptqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorcentinagintic_mean, tight_ptqcnm_max, wide_ptqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorcentinagintic_mean, tight_ptqcnm_max, wide_ptqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqcnm = (max - min) / quattuorcentinagintic_mean where quattuorcentinagintic_mean = ((sum x_i^104) / n)^(1/104). Reads the pool's total RANGE in units of its QUATTUORCENTINAGINTIC (power-mean-of-order-104, M_104) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.460 PTTCNM because raising to the ONE-HUNDRED-AND-FOURTH power lifts the anchor MORE than raising to the hundred-and-third does. Unique DISPERSION-axis contribution extends the (harmonic..trecentinagintic) power-mean QUINQUATRIGINTASEPTUAGINTUPLET into a SEXTRIGINTASEPTUAGINTUPLET with the M_104 quattuorcentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqcnm approaches n^(1/104) so 10-partner pools cap near 1.0224, 20-partner near 1.0292, 30-partner near 1.0332, 40-partner near 1.0361, 50-partner near 1.0383, 60-partner near 1.0402, 70-partner near 1.0417, 80-partner near 1.0430, 85-partner near 1.0436, 89-partner near 1.0441 and 90-partner near 1.0442 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/104) ~= 1.0453) are required to escape into wide with a modest outlier. Composite regime labels: PTQCNM tight + PTTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQCNM 0.9201 tight -- rejoining the uniform ramp's 0.9201 for the twenty-third tick in the sequence after PTTCNM's 0.9203 joint bucket at M_103); PTQCNM spread + PTTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQCNM 1.0122 spread -- two 4-decimal ticks below PTTCNM's 1.0124); PTQCNM spread + PTTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_104 ([1x99, 100] reads 1.0348 spread after M_103's 1.0353 spread landing); PTQCNM tight + PTTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one bucket at M_104 ([1, 100] reads 0.9966 tight after M_103's 0.9967 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorcentinagintic_mean == 0 (guarded but unreachable), tight = ptqcnm &lt; ${tight_ptqcnm_max}, spread = ptqcnm in [${tight_ptqcnm_max}, ${wide_ptqcnm_min}), wide = ptqcnm &ge; ${wide_ptqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
