// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUOROCTOGINTIC-MEAN
// pure-lib (P11.422).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUOROCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUATTUOROCTOGINTIC MEAN (a.k.a. power mean of order 84, M_84):
//
//   ptqogm = (max - min) / quattuoroctogintic_mean
//
// where quattuoroctogintic_mean = ((sum x_i^84) / n)^(1/84). Reads the
// peak spread against the QUATTUOROCTOGINTIC (power-mean-of-order-84)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.420 PTTOGM, because raising to the EIGHTY-FOURTH power before
// averaging lifts the anchor MORE than raising to the eighty-third
// does, dampening the ratio against the range even harder.
//
// PTQOGM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUOROCTOGINTIC (POWER-MEAN-OF-ORDER-84) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... duooctogintic M_82, tresoctogintic M_83) power-mean
// QUINDECEMSEPTUAGINTUPLET into a SEDECEMSEPTUAGINTUPLET with the
// M_84 quattuoroctogintic mean. By Power Mean inequality M_84 >= M_83,
// so quattuoroctogintic_mean >= tresoctogintic_mean and ptqogm <=
// pttogm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuoroctogintic_mean approaches x_max / n^(1/84), so ptqogm
// approaches n^(1/84) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/84) ~= 1.0278, for n=20 ~= 1.0363, for n=30 ~= 1.0413,
// for n=40 ~= 1.0449, for n=50 ~= 1.0477, for n=60 ~= 1.0499,
// for n=70 ~= 1.0519, for n=80 ~= 1.0536, for n=85 ~= 1.0543,
// for n=89 ~= 1.0549 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/84) ~= 1.0564) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/84) ~= 1.0564, and the pool100 [1x99, 100] reference reads
// 1.0458 spread (further absorbed from PTTOGM's 1.0465 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_84.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuoroctogintic_mean = k,
//                                     range 0, ptqogm 0 (tight).
//   * uniform ramp [1..10]          -> QOGM ~= 9.7296, range 9,
//                                     ptqogm ~= 0.9250 (tight).
//   * upper-outlier [1x9, 10]       -> QOGM ~= 9.7296, range 9,
//                                     ptqogm ~= 0.9250 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_84;
//                                     the M_83 joint collapse persists
//                                     at M_84 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/84) ~ 9.7296 in
//                                     lock-step, so pttogm's 0.9253
//                                     joint bucket at M_83 remains a
//                                     joint 0.9250 bucket at M_84).
//   * two-shoulders [1x8, 5x2]      -> QOGM ~= 4.9051, range 4,
//                                     ptqogm ~= 0.8155 (tight).
//   * 50/50 split [1x5, 10x5]       -> QOGM ~= 9.9178, range 9,
//                                     ptqogm ~= 0.9075 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QOGM ~= 97.2961, range 99,
//                                     ptqogm ~= 1.0175 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/84) ~ 1.0278 asymptote).
//   * two-partner [1, 9]            -> QOGM ~= 8.9260, range 8,
//                                     ptqogm ~= 0.8963 (tight).
//   * two-partner [1, 100]          -> QOGM ~= 99.1782, range 99,
//                                     ptqogm ~= 0.9982 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTTOGM's 0.9983
//                                     tick; mean_84 tips further past
//                                     the range, so ptqogm rounds to
//                                     0.9982 from below).
//   * small [10, 1, 1]              -> QOGM ~= 9.8701, range 9,
//                                     ptqogm ~= 0.9118 (tight).
//   * pool_count=100 [1x99, 100]    -> QOGM ~= 94.6652, range 99,
//                                     ptqogm ~= 1.0458 (SPREAD --
//                                     FURTHER ABSORBED from PTTOGM
//                                     M_83's 1.0465 spread;
//                                     100-partner asymptote
//                                     100^(1/84) ~ 1.0564 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuoroctogintic_mean == 0
//   * tight                ptqogm < 1.005
//   * spread               ptqogm in [1.005, 1.09)
//   * wide                 ptqogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqogm_max /
// wide_ptqogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.423):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanSection
// (P11.421) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuoroctogintic-center
// after the P11.421 range-against-tresoctogintic-center landing.

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
type PtqogmLabel =
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

// Bands on raw ptqogm (fixed cutoffs since quattuoroctogintic_mean scales
// with cell counts and typical quattuoroctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_84 is 0.9250 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0281 (M_83) to 1.0278
// (M_84), 20-partner drops from 1.0368 to 1.0363, 30-partner drops
// from 1.0418 to 1.0413, 40-partner drops from 1.0454 to 1.0449,
// 50-partner drops from 1.0483 to 1.0477, 60-partner drops from
// 1.0506 to 1.0499, 70-partner drops from 1.0525 to 1.0519,
// 80-partner drops from 1.0542 to 1.0536, 85-partner drops from
// 1.0550 to 1.0543, 89-partner drops from 1.0556 to 1.0549 -- so
// pool_count >= 100 (100^(1/84) ~ 1.0564) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTTOGM 1.0465 spread to PTQOGM 1.0458
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQOGM_MAX = 1.005;
const WIDE_PTQOGM_MIN = 1.09;

// PTQOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuoroctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuoroctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqogm_max: number;
  readonly wide_ptqogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanMap;
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

// Peak-to-quattuoroctogintic-mean of a discrete distribution:
//   PTQOGM = (max - min) / quattuoroctogintic_mean
// where quattuoroctogintic_mean = ((sum x_i^84) / n)^(1/84). Returns
// null on empty, solo, and degenerate (zero quattuoroctogintic_mean or
// non-finite eighty-fourth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuoroctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuoroctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuoroctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuoroctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyFourSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^84 = (x^8)^10 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quad
    eightyFourSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(eightyFourSum) || eightyFourSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuoroctogintic_mean: null,
    };
  }
  const quattuoroctogintic_mean = Math.pow(eightyFourSum / pool_count, 1 / 84);
  if (
    !Number.isFinite(quattuoroctogintic_mean) ||
    quattuoroctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuoroctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptqogm = range / quattuoroctogintic_mean;
  const clamped = ptqogm < 0 ? 0 : ptqogm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuoroctogintic_mean: roundTo(clamped, PTQOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuoroctogintic_mean:
      partner.peak_to_quattuoroctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuoroctogintic_mean:
      metric.peak_to_quattuoroctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMean {
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
    tight_ptqogm_max: TIGHT_PTQOGM_MAX,
    wide_ptqogm_min: WIDE_PTQOGM_MIN,
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

function labelForPtqogm(
  pool_count: number,
  pool_cells: number,
  ptqogm: number | null,
  tight_max: number,
  wide_min: number,
): PtqogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqogm === null) return "degenerate";
  if (ptqogm >= wide_min) return "wide";
  if (ptqogm < tight_max) return "tight";
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

function renderPtqogmCell(
  pool_count: number,
  pool_cells: number,
  ptqogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqogm(
    pool_count,
    pool_cells,
    ptqogm,
    tight_max,
    wide_min,
  );
  const ptqogmText = ptqogm === null ? "-" : ptqogm.toFixed(4);
  return `PTQOGM ${ptqogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqogm_max, wide_ptqogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuoroctogintic_mean, tight_ptqogm_max, wide_ptqogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuoroctogintic_mean, tight_ptqogm_max, wide_ptqogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUOROCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUOROCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqogm = (max - min) / quattuoroctogintic_mean where quattuoroctogintic_mean = ((sum x_i^84) / n)^(1/84). Reads the pool's total RANGE in units of its QUATTUOROCTOGINTIC (power-mean-of-order-84, M_84) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.420 PTTOGM because raising to the EIGHTY-FOURTH power lifts the anchor MORE than raising to the eighty-third does. Unique DISPERSION-axis contribution extends the (harmonic..tresoctogintic) power-mean QUINDECEMSEPTUAGINTUPLET into a SEDECEMSEPTUAGINTUPLET with the M_84 quattuoroctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqogm approaches n^(1/84) so 10-partner pools cap near 1.0278, 20-partner near 1.0363, 30-partner near 1.0413, 40-partner near 1.0449, 50-partner near 1.0477, 60-partner near 1.0499, 70-partner near 1.0519, 80-partner near 1.0536, 85-partner near 1.0543 and 89-partner near 1.0549 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/84) ~= 1.0564) are required to escape into wide with a modest outlier. Composite regime labels: PTQOGM tight + PTTOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQOGM 0.9250 tight -- rejoining the uniform ramp's 0.9250 for the third tick in the sequence after PTTOGM's 0.9253 joint bucket at M_83); PTQOGM spread + PTTOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQOGM 1.0175 spread); PTQOGM spread + PTTOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_84 ([1x99, 100] reads 1.0458 spread after M_83's 1.0465 spread landing); PTQOGM tight + PTTOGM tight = ISOLATED HIGH PARTNER continues absorption past M_83 into M_84 ([1, 100] reads 0.9982 tight after M_83's 0.9983 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuoroctogintic_mean == 0 (guarded but unreachable), tight = ptqogm &lt; ${tight_ptqogm_max}, spread = ptqogm in [${tight_ptqogm_max}, ${wide_ptqogm_min}), wide = ptqogm &ge; ${wide_ptqogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
