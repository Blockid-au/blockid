// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORSEPTUAGINTIC-MEAN
// pure-lib (P11.402).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUATTUORSEPTUAGINTIC MEAN (a.k.a. power mean of order 74, M_74):
//
//   ptqspqm = (max - min) / quattuorseptuagintic_mean
//
// where quattuorseptuagintic_mean = ((sum x_i^74) / n)^(1/74). Reads
// the peak spread against the QUATTUORSEPTUAGINTIC (power-mean-of-
// order-74) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.400 PTTSPQM, because raising to the SEVENTY-FOURTH
// power before averaging lifts the anchor MORE than raising to the
// seventy-third does, dampening the ratio against the range even harder.
//
// PTQSPQM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORSEPTUAGINTIC (POWER-MEAN-OF-ORDER-74) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... duoseptuagintic M_72, treseptuagintic M_73) power-mean
// QUINQUASEPTUAGINTUPLET into a SESEPTUAGINTUPLET with the M_74
// quattuorseptuagintic mean. By Power Mean inequality M_74 >= M_73, so
// quattuorseptuagintic_mean >= treseptuagintic_mean and
// ptqspqm <= pttspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorseptuagintic_mean approaches x_max / n^(1/74), so ptqspqm
// approaches n^(1/74) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/74) ~= 1.0316, for n=20 ~= 1.0413, for n=30 ~= 1.0470, for
// n=40 ~= 1.0511, for n=50 ~= 1.0543, for n=60 ~= 1.0569, for n=70
// ~= 1.0591, for n=80 ~= 1.0610, for n=85 ~= 1.0619, for n=89 ~= 1.0625
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/74) ~= 1.0642) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/74) ~= 1.0642, and the
// pool100 [1x99, 100] reference reads 1.0536 spread (further absorbed
// from PTTSPQM's 1.0545 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_74.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorseptuagintic_mean = k,
//                                     range 0, ptqspqm 0 (tight).
//   * uniform ramp [1..10]          -> QSPQM ~= 9.6937, range 9,
//                                     ptqspqm ~= 0.9284 (tight).
//   * upper-outlier [1x9, 10]       -> QSPQM ~= 9.6936, range 9,
//                                     ptqspqm ~= 0.9284 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.400 PTTSPQM's 0.9288
//                                     tick; at M_74 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9284 tick as the
//                                     anchor keeps drifting past M_73).
//   * two-shoulders [1x8, 5x2]      -> QSPQM ~= 4.8924, range 4,
//                                     ptqspqm ~= 0.8176 (tight).
//   * 50/50 split [1x5, 10x5]       -> QSPQM ~= 9.9068, range 9,
//                                     ptqspqm ~= 0.9085 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QSPQM ~= 96.9363, range 99,
//                                     ptqspqm ~= 1.0213 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/74) ~ 1.0316 asymptote).
//   * two-partner [1, 9]            -> QSPQM ~= 8.9161, range 8,
//                                     ptqspqm ~= 0.8973 (tight).
//   * two-partner [1, 100]          -> QSPQM ~= 99.0677, range 99,
//                                     ptqspqm ~= 0.9993 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTTSPQM's 0.9994
//                                     tick; mean_74 tips further past
//                                     the range, so ptqspqm rounds to
//                                     0.9993 from below).
//   * small [10, 1, 1]              -> QSPQM ~= 9.8526, range 9,
//                                     ptqspqm ~= 0.9135 (tight).
//   * pool_count=100 [1x99, 100]    -> QSPQM ~= 93.9665, range 99,
//                                     ptqspqm ~= 1.0536 (SPREAD --
//                                     FURTHER ABSORBED from PTTSPQM
//                                     M_73's 1.0545 spread;
//                                     100-partner asymptote
//                                     100^(1/74) ~ 1.0642 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorseptuagintic_mean == 0
//   * tight                ptqspqm < 1.005
//   * spread               ptqspqm in [1.005, 1.09)
//   * wide                 ptqspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqspqm_max /
// wide_ptqspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.403):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanSection
// (P11.401) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorseptuagintic-center
// after the P11.401 range-against-treseptuagintic-center landing.

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
type PtqspqmLabel =
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

// Bands on raw ptqspqm (fixed cutoffs since quattuorseptuagintic_mean
// scales with cell counts and typical quattuorseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_74 is 0.9284
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0320 (M_73) to
// 1.0316 (M_74), 20-partner drops from 1.0419 to 1.0413, 30-partner
// drops from 1.0477 to 1.0470, 40-partner drops from 1.0518 to 1.0511,
// 50-partner drops from 1.0551 to 1.0543, 60-partner drops from 1.0577
// to 1.0569, 70-partner drops from 1.0599 to 1.0591, 80-partner drops
// from 1.0619 to 1.0610, 85-partner drops from 1.0627 to 1.0619,
// 89-partner drops from 1.0634 to 1.0625 -- so pool_count >= 100
// (100^(1/74) ~ 1.0642) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTTSPQM 1.0545 spread to PTQSPQM 1.0536 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTQSPQM_MAX = 1.005;
const WIDE_PTQSPQM_MIN = 1.09;

// PTQSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqspqm_max: number;
  readonly wide_ptqspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanMap;
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

// Peak-to-quattuorseptuagintic-mean of a discrete distribution:
//   PTQSPQM = (max - min) / quattuorseptuagintic_mean
// where quattuorseptuagintic_mean = ((sum x_i^74) / n)^(1/74). Returns
// null on empty, solo, and degenerate (zero quattuorseptuagintic_mean
// or non-finite seventy-fourth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^74 = (x^8)^9 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct * sq
    seventyFourthSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(seventyFourthSum) || seventyFourthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorseptuagintic_mean: null,
    };
  }
  const quattuorseptuagintic_mean = Math.pow(
    seventyFourthSum / pool_count,
    1 / 74,
  );
  if (
    !Number.isFinite(quattuorseptuagintic_mean) ||
    quattuorseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqspqm = range / quattuorseptuagintic_mean;
  const clamped = ptqspqm < 0 ? 0 : ptqspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorseptuagintic_mean: roundTo(clamped, PTQSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorseptuagintic_mean:
      partner.peak_to_quattuorseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorseptuagintic_mean:
      metric.peak_to_quattuorseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMean {
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
    tight_ptqspqm_max: TIGHT_PTQSPQM_MAX,
    wide_ptqspqm_min: WIDE_PTQSPQM_MIN,
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

function labelForPtqspqm(
  pool_count: number,
  pool_cells: number,
  ptqspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqspqm === null) return "degenerate";
  if (ptqspqm >= wide_min) return "wide";
  if (ptqspqm < tight_max) return "tight";
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

function renderPtqspqmCell(
  pool_count: number,
  pool_cells: number,
  ptqspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqspqm(
    pool_count,
    pool_cells,
    ptqspqm,
    tight_max,
    wide_min,
  );
  const ptqspqmText = ptqspqm === null ? "-" : ptqspqm.toFixed(4);
  return `PTQSPQM ${ptqspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqspqm_max, wide_ptqspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorseptuagintic_mean, tight_ptqspqm_max, wide_ptqspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorseptuagintic_mean, tight_ptqspqm_max, wide_ptqspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqspqm = (max - min) / quattuorseptuagintic_mean where quattuorseptuagintic_mean = ((sum x_i^74) / n)^(1/74). Reads the pool's total RANGE in units of its QUATTUORSEPTUAGINTIC (power-mean-of-order-74, M_74) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.400 PTTSPQM because raising to the SEVENTY-FOURTH power lifts the anchor MORE than raising to the seventy-third does. Unique DISPERSION-axis contribution extends the (harmonic..treseptuagintic) power-mean QUINQUASEPTUAGINTUPLET into a SESEPTUAGINTUPLET with the M_74 quattuorseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqspqm approaches n^(1/74) so 10-partner pools cap near 1.0316, 20-partner near 1.0413, 30-partner near 1.0470, 40-partner near 1.0511, 50-partner near 1.0543, 60-partner near 1.0569, 70-partner near 1.0591, 80-partner near 1.0610, 85-partner near 1.0619 and 89-partner near 1.0625 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/74) ~= 1.0642) are required to escape into wide with a modest outlier. Composite regime labels: PTQSPQM tight + PTTSPQM tight = MILD OUTLIER absorbed by quattuorseptuagintic ([1x9, 10] reads PTQSPQM 0.9284 tight); PTQSPQM spread + PTTSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQSPQM 1.0213 spread); PTQSPQM spread + PTTSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_74 ([1x99, 100] reads 1.0536 spread after M_73's 1.0545 spread landing); PTQSPQM tight + PTTSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_73 into M_74 ([1, 100] reads 0.9993 tight after M_73's 0.9994 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorseptuagintic_mean == 0 (guarded but unreachable), tight = ptqspqm &lt; ${tight_ptqspqm_max}, spread = ptqspqm in [${tight_ptqspqm_max}, ${wide_ptqspqm_min}), wide = ptqspqm &ge; ${wide_ptqspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
