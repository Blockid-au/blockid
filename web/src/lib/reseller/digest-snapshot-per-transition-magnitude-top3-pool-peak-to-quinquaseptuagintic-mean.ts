// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUASEPTUAGINTIC-MEAN
// pure-lib (P11.404).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUASEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUASEPTUAGINTIC MEAN (a.k.a. power mean of order 75, M_75):
//
//   ptqispqm = (max - min) / quinquaseptuagintic_mean
//
// where quinquaseptuagintic_mean = ((sum x_i^75) / n)^(1/75). Reads
// the peak spread against the QUINQUASEPTUAGINTIC (power-mean-of-
// order-75) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.402 PTQSPQM, because raising to the SEVENTY-FIFTH
// power before averaging lifts the anchor MORE than raising to the
// seventy-fourth does, dampening the ratio against the range even harder.
//
// PTQISPQM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUASEPTUAGINTIC (POWER-MEAN-OF-ORDER-75) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... treseptuagintic M_73, quattuorseptuagintic M_74)
// power-mean SESEPTUAGINTUPLET into a SEPTENSEPTUAGINTUPLET with the
// M_75 quinquaseptuagintic mean. By Power Mean inequality M_75 >= M_74,
// so quinquaseptuagintic_mean >= quattuorseptuagintic_mean and
// ptqispqm <= ptqspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquaseptuagintic_mean approaches x_max / n^(1/75), so ptqispqm
// approaches n^(1/75) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/75) ~= 1.0312, for n=20 ~= 1.0408, for n=30 ~= 1.0464, for
// n=40 ~= 1.0504, for n=50 ~= 1.0535, for n=60 ~= 1.0561, for n=70
// ~= 1.0583, for n=80 ~= 1.0602, for n=85 ~= 1.0610, for n=89 ~= 1.0617
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/75) ~= 1.0633) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/75) ~= 1.0633, and the
// pool100 [1x99, 100] reference reads 1.0527 spread (further absorbed
// from PTQSPQM's 1.0536 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_75.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquaseptuagintic_mean = k,
//                                     range 0, ptqispqm 0 (tight).
//   * uniform ramp [1..10]          -> QISPQM ~= 9.6977, range 9,
//                                     ptqispqm ~= 0.9281 (tight).
//   * upper-outlier [1x9, 10]       -> QISPQM ~= 9.6977, range 9,
//                                     ptqispqm ~= 0.9281 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.402 PTQSPQM's 0.9284
//                                     tick; at M_75 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9281 tick as the
//                                     anchor keeps drifting past M_74).
//   * two-shoulders [1x8, 5x2]      -> QISPQM ~= 4.8938, range 4,
//                                     ptqispqm ~= 0.8174 (tight).
//   * 50/50 split [1x5, 10x5]       -> QISPQM ~= 9.9080, range 9,
//                                     ptqispqm ~= 0.9084 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QISPQM ~= 96.9765, range 99,
//                                     ptqispqm ~= 1.0209 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/75) ~ 1.0312 asymptote).
//   * two-partner [1, 9]            -> QISPQM ~= 8.9172, range 8,
//                                     ptqispqm ~= 0.8971 (tight).
//   * two-partner [1, 100]          -> QISPQM ~= 99.0801, range 99,
//                                     ptqispqm ~= 0.9992 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTQSPQM's 0.9993
//                                     tick; mean_75 tips further past
//                                     the range, so ptqispqm rounds to
//                                     0.9992 from below).
//   * small [10, 1, 1]              -> QISPQM ~= 9.8546, range 9,
//                                     ptqispqm ~= 0.9133 (tight).
//   * pool_count=100 [1x99, 100]    -> QISPQM ~= 94.0445, range 99,
//                                     ptqispqm ~= 1.0527 (SPREAD --
//                                     FURTHER ABSORBED from PTQSPQM
//                                     M_74's 1.0536 spread;
//                                     100-partner asymptote
//                                     100^(1/75) ~ 1.0633 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqispqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquaseptuagintic_mean == 0
//   * tight                ptqispqm < 1.005
//   * spread               ptqispqm in [1.005, 1.09)
//   * wide                 ptqispqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqispqm_max /
// wide_ptqispqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.405):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorseptuaginticMeanSection
// (P11.403) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquaseptuagintic-center
// after the P11.403 range-against-quattuorseptuagintic-center landing.

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
type PtqispqmLabel =
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

// Bands on raw ptqispqm (fixed cutoffs since quinquaseptuagintic_mean
// scales with cell counts and typical quinquaseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_75 is 0.9281
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0316 (M_74) to
// 1.0312 (M_75), 20-partner drops from 1.0413 to 1.0408, 30-partner
// drops from 1.0470 to 1.0464, 40-partner drops from 1.0511 to 1.0504,
// 50-partner drops from 1.0543 to 1.0535, 60-partner drops from 1.0569
// to 1.0561, 70-partner drops from 1.0591 to 1.0583, 80-partner drops
// from 1.0610 to 1.0602, 85-partner drops from 1.0619 to 1.0610,
// 89-partner drops from 1.0625 to 1.0617 -- so pool_count >= 100
// (100^(1/75) ~ 1.0633) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTQSPQM 1.0536 spread to PTQISPQM 1.0527 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTQISPQM_MAX = 1.005;
const WIDE_PTQISPQM_MIN = 1.09;

// PTQISPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQISPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquaseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquaseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqispqm_max: number;
  readonly wide_ptqispqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanMap;
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

// Peak-to-quinquaseptuagintic-mean of a discrete distribution:
//   PTQISPQM = (max - min) / quinquaseptuagintic_mean
// where quinquaseptuagintic_mean = ((sum x_i^75) / n)^(1/75). Returns
// null on empty, solo, and degenerate (zero quinquaseptuagintic_mean
// or non-finite seventy-fifth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquaseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquaseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquaseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquaseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyFifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const cube = sq * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^75 = (x^8)^9 * x^3 -> oct*oct*oct*oct*oct*oct*oct*oct*oct * cube
    seventyFifthSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * cube;
  }
  if (!Number.isFinite(seventyFifthSum) || seventyFifthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquaseptuagintic_mean: null,
    };
  }
  const quinquaseptuagintic_mean = Math.pow(
    seventyFifthSum / pool_count,
    1 / 75,
  );
  if (
    !Number.isFinite(quinquaseptuagintic_mean) ||
    quinquaseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquaseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqispqm = range / quinquaseptuagintic_mean;
  const clamped = ptqispqm < 0 ? 0 : ptqispqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquaseptuagintic_mean: roundTo(clamped, PTQISPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquaseptuagintic_mean:
      partner.peak_to_quinquaseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquaseptuagintic_mean:
      metric.peak_to_quinquaseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMean {
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
    tight_ptqispqm_max: TIGHT_PTQISPQM_MAX,
    wide_ptqispqm_min: WIDE_PTQISPQM_MIN,
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

function labelForPtqispqm(
  pool_count: number,
  pool_cells: number,
  ptqispqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqispqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqispqm === null) return "degenerate";
  if (ptqispqm >= wide_min) return "wide";
  if (ptqispqm < tight_max) return "tight";
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

function renderPtqispqmCell(
  pool_count: number,
  pool_cells: number,
  ptqispqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqispqm(
    pool_count,
    pool_cells,
    ptqispqm,
    tight_max,
    wide_min,
  );
  const ptqispqmText = ptqispqm === null ? "-" : ptqispqm.toFixed(4);
  return `PTQISPQM ${ptqispqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqispqm_max, wide_ptqispqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqispqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquaseptuagintic_mean, tight_ptqispqm_max, wide_ptqispqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqispqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquaseptuagintic_mean, tight_ptqispqm_max, wide_ptqispqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUASEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUASEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqispqm = (max - min) / quinquaseptuagintic_mean where quinquaseptuagintic_mean = ((sum x_i^75) / n)^(1/75). Reads the pool's total RANGE in units of its QUINQUASEPTUAGINTIC (power-mean-of-order-75, M_75) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.402 PTQSPQM because raising to the SEVENTY-FIFTH power lifts the anchor MORE than raising to the seventy-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorseptuagintic) power-mean SESEPTUAGINTUPLET into a SEPTENSEPTUAGINTUPLET with the M_75 quinquaseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqispqm approaches n^(1/75) so 10-partner pools cap near 1.0312, 20-partner near 1.0408, 30-partner near 1.0464, 40-partner near 1.0504, 50-partner near 1.0535, 60-partner near 1.0561, 70-partner near 1.0583, 80-partner near 1.0602, 85-partner near 1.0610 and 89-partner near 1.0617 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/75) ~= 1.0633) are required to escape into wide with a modest outlier. Composite regime labels: PTQISPQM tight + PTQSPQM tight = MILD OUTLIER absorbed by quinquaseptuagintic ([1x9, 10] reads PTQISPQM 0.9281 tight); PTQISPQM spread + PTQSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQISPQM 1.0209 spread); PTQISPQM spread + PTQSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_75 ([1x99, 100] reads 1.0527 spread after M_74's 1.0536 spread landing); PTQISPQM tight + PTQSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_74 into M_75 ([1, 100] reads 0.9992 tight after M_74's 0.9993 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquaseptuagintic_mean == 0 (guarded but unreachable), tight = ptqispqm &lt; ${tight_ptqispqm_max}, spread = ptqispqm in [${tight_ptqispqm_max}, ${wide_ptqispqm_min}), wide = ptqispqm &ge; ${wide_ptqispqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqispqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQISPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQISPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
