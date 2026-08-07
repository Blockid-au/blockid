// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINCENTINAGINTIC-MEAN
// pure-lib (P11.464).
//
// WHOLE-POOL RANGE-AGAINST-QUINCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's QUINCENTINAGINTIC MEAN (a.k.a. power mean of order
// 105, M_105):
//
//   ptqicnm = (max - min) / quincentinagintic_mean
//
// where quincentinagintic_mean = ((sum x_i^105) / n)^(1/105).
// Reads the peak spread against the QUINCENTINAGINTIC
// (power-mean-of-order-105) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.462 PTQCNM, because raising to
// the ONE-HUNDRED-AND-FIFTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-fourth does, dampening the
// ratio against the range even harder.
//
// PTQICNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINCENTINAGINTIC (POWER-MEAN-OF-ORDER-105) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104) power-mean SEXTRIGINTASEPTUAGINTUPLET
// into a SEPTITRIGINTASEPTUAGINTUPLET with the M_105 quincentinagintic
// mean -- climbing further into the TRIPLE-DIGIT power-mean family
// opened at PTCNM by cracking past the round-hundred threshold. By
// Power Mean inequality M_105 >= M_104, so quincentinagintic_mean >=
// quattuorcentinagintic_mean and ptqicnm <= ptqcnm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quincentinagintic_mean approaches x_max / n^(1/105), so ptqicnm
// approaches n^(1/105) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/105) ~= 1.0222, for n=20 ~= 1.0289, for n=30 ~= 1.0329,
// for n=40 ~= 1.0358, for n=50 ~= 1.0380, for n=60 ~= 1.0398,
// for n=70 ~= 1.0413, for n=80 ~= 1.0426, for n=85 ~= 1.0432,
// for n=89 ~= 1.0437, for n=90 ~= 1.0438 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/105) ~= 1.0448)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/105) ~= 1.0448, and the pool100
// [1x99, 100] reference reads 1.0344 spread (further absorbed
// from PTQCNM's 1.0348 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_105.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quincentinagintic_mean = k,
//                                     range 0, ptqicnm 0 (tight).
//   * uniform ramp [1..10]          -> QINCNM ~= 9.7830, range 9,
//                                     ptqicnm ~= 0.9200 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQCNM 0.9201 at M_104).
//   * upper-outlier [1x9, 10]       -> QINCNM ~= 9.7830, range 9,
//                                     ptqicnm ~= 0.9200 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_105;
//                                     the M_104 joint collapse at
//                                     0.9201 persists at M_105 as a
//                                     joint 0.9200 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/105) ~ 9.7830 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> QINCNM ~= 4.9239, range 4,
//                                     ptqicnm ~= 0.8124 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQCNM 0.8125 at M_104).
//   * 50/50 split [1x5, 10x5]       -> QINCNM ~= 9.9342, range 9,
//                                     ptqicnm ~= 0.9060 (tight --
//                                     JOINT with PTQCNM 0.9060 at
//                                     M_104; BIMODAL SPLIT stays
//                                     inside the same 4-decimal
//                                     bucket at M_105 because the
//                                     extra power barely nudges the
//                                     half-and-half anchor).
//   * extreme outlier [1x9, 100]    -> QINCNM ~= 97.8305, range 99,
//                                     ptqicnm ~= 1.0119 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/105) ~ 1.0222 asymptote;
//                                     ADVANCES three 4-decimal ticks
//                                     from PTQCNM 1.0122 at M_104).
//   * two-partner [1, 9]            -> QINCNM ~= 8.9408, range 8,
//                                     ptqicnm ~= 0.8948 (tight --
//                                     JOINT with PTQCNM 0.8948 at
//                                     M_104; the small-n / small-max
//                                     ratio holds inside the same
//                                     4-decimal bucket at M_105).
//   * two-partner [1, 100]          -> QINCNM ~= 99.3421, range 99,
//                                     ptqicnm ~= 0.9966 (TIGHT --
//                                     JOINT with PTQCNM 0.9966 at
//                                     M_104; ISOLATED HIGH PARTNER
//                                     absorption stays in the same
//                                     4-decimal bucket at M_105).
//   * small [10, 1, 1]              -> QINCNM ~= 9.8959, range 9,
//                                     ptqicnm ~= 0.9095 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTQCNM 0.9096 at M_104;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_105).
//   * pool_count=100 [1x99, 100]    -> QINCNM ~= 95.7118, range 99,
//                                     ptqicnm ~= 1.0344 (SPREAD --
//                                     FURTHER ABSORBED from PTQCNM
//                                     M_104's 1.0348 spread;
//                                     100-partner asymptote
//                                     100^(1/105) ~ 1.0448 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqicnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quincentinagintic_mean == 0
//   * tight                ptqicnm < 1.005
//   * spread               ptqicnm in [1.005, 1.09)
//   * wide                 ptqicnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqicnm_max /
// wide_ptqicnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.465):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorcentinaginticMeanSection
// (P11.463) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quincentinagintic-center
// after the P11.463 range-against-quattuorcentinagintic-center landing.

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
type PtqicnmLabel =
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

// Bands on raw ptqicnm (fixed cutoffs since quincentinagintic_mean
// scales with cell counts and typical quincentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_105 is 0.9200
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0224
// (M_104) to 1.0222 (M_105), 20-partner drops from 1.0292 to 1.0289,
// 30-partner drops from 1.0332 to 1.0329, 40-partner drops from
// 1.0361 to 1.0358, 50-partner drops from 1.0383 to 1.0380,
// 60-partner drops from 1.0402 to 1.0398, 70-partner drops from
// 1.0417 to 1.0413, 80-partner drops from 1.0430 to 1.0426,
// 85-partner drops from 1.0436 to 1.0432, 89-partner drops from
// 1.0441 to 1.0437, 90-partner drops from 1.0442 to 1.0438 -- so
// pool_count >= 100 (100^(1/105) ~ 1.0448) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQCNM 1.0348 spread to PTQICNM 1.0344 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQICNM_MAX = 1.005;
const WIDE_PTQICNM_MIN = 1.09;

// PTQICNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQICNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quincentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quincentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqicnm_max: number;
  readonly wide_ptqicnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanMap;
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

// Peak-to-quincentinagintic-mean of a discrete distribution:
//   PTQICNM = (max - min) / quincentinagintic_mean
// where quincentinagintic_mean = ((sum x_i^105) / n)^(1/105).
// Returns null on empty, solo, and degenerate (zero
// quincentinagintic_mean or non-finite hundred-and-fifth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quincentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quincentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quincentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quincentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^105 = (x^8)^13 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*v
    hundredFifthSum +=
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
  if (!Number.isFinite(hundredFifthSum) || hundredFifthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quincentinagintic_mean: null,
    };
  }
  const quincentinagintic_mean = Math.pow(
    hundredFifthSum / pool_count,
    1 / 105,
  );
  if (
    !Number.isFinite(quincentinagintic_mean) ||
    quincentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quincentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqicnm = range / quincentinagintic_mean;
  const clamped = ptqicnm < 0 ? 0 : ptqicnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quincentinagintic_mean: roundTo(clamped, PTQICNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quincentinagintic_mean:
      partner.peak_to_quincentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quincentinagintic_mean:
      metric.peak_to_quincentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMean {
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
    tight_ptqicnm_max: TIGHT_PTQICNM_MAX,
    wide_ptqicnm_min: WIDE_PTQICNM_MIN,
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

function labelForPtqicnm(
  pool_count: number,
  pool_cells: number,
  ptqicnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqicnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqicnm === null) return "degenerate";
  if (ptqicnm >= wide_min) return "wide";
  if (ptqicnm < tight_max) return "tight";
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

function renderPtqicnmCell(
  pool_count: number,
  pool_cells: number,
  ptqicnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqicnm(
    pool_count,
    pool_cells,
    ptqicnm,
    tight_max,
    wide_min,
  );
  const ptqicnmText = ptqicnm === null ? "-" : ptqicnm.toFixed(4);
  return `PTQICNM ${ptqicnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuincentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqicnm_max, wide_ptqicnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqicnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quincentinagintic_mean, tight_ptqicnm_max, wide_ptqicnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqicnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quincentinagintic_mean, tight_ptqicnm_max, wide_ptqicnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqicnm = (max - min) / quincentinagintic_mean where quincentinagintic_mean = ((sum x_i^105) / n)^(1/105). Reads the pool's total RANGE in units of its QUINCENTINAGINTIC (power-mean-of-order-105, M_105) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.462 PTQCNM because raising to the ONE-HUNDRED-AND-FIFTH power lifts the anchor MORE than raising to the hundred-and-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorcentinagintic) power-mean SEXTRIGINTASEPTUAGINTUPLET into a SEPTITRIGINTASEPTUAGINTUPLET with the M_105 quincentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqicnm approaches n^(1/105) so 10-partner pools cap near 1.0222, 20-partner near 1.0289, 30-partner near 1.0329, 40-partner near 1.0358, 50-partner near 1.0380, 60-partner near 1.0398, 70-partner near 1.0413, 80-partner near 1.0426, 85-partner near 1.0432, 89-partner near 1.0437 and 90-partner near 1.0438 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/105) ~= 1.0448) are required to escape into wide with a modest outlier. Composite regime labels: PTQICNM tight + PTQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQICNM 0.9200 tight -- rejoining the uniform ramp's 0.9200 for the twenty-fourth tick in the sequence after PTQCNM's 0.9201 joint bucket at M_104); PTQICNM spread + PTQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQICNM 1.0119 spread -- three 4-decimal ticks below PTQCNM's 1.0122); PTQICNM spread + PTQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_105 ([1x99, 100] reads 1.0344 spread after M_104's 1.0348 spread landing); PTQICNM tight + PTQCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_105 ([1, 100] reads 0.9966 tight matching M_104's 0.9966 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quincentinagintic_mean == 0 (guarded but unreachable), tight = ptqicnm &lt; ${tight_ptqicnm_max}, spread = ptqicnm in [${tight_ptqicnm_max}, ${wide_ptqicnm_min}), wide = ptqicnm &ge; ${wide_ptqicnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqicnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQICNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQICNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
