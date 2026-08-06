// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUOCTOGINTIC-MEAN
// pure-lib (P11.424).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUOCTOGINTIC MEAN (a.k.a. power mean of order 85, M_85):
//
//   ptqiogm = (max - min) / quinquoctogintic_mean
//
// where quinquoctogintic_mean = ((sum x_i^85) / n)^(1/85). Reads the
// peak spread against the QUINQUOCTOGINTIC (power-mean-of-order-85)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.422 PTQOGM, because raising to the EIGHTY-FIFTH power before
// averaging lifts the anchor MORE than raising to the eighty-fourth
// does, dampening the ratio against the range even harder.
//
// PTQIOGM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUOCTOGINTIC (POWER-MEAN-OF-ORDER-85) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tresoctogintic M_83, quattuoroctogintic M_84)
// power-mean SEDECEMSEPTUAGINTUPLET into a SEPTEMDECIMSEPTUAGINTUPLET
// with the M_85 quinquoctogintic mean. By Power Mean inequality M_85
// >= M_84, so quinquoctogintic_mean >= quattuoroctogintic_mean and
// ptqiogm <= ptqogm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquoctogintic_mean approaches x_max / n^(1/85), so ptqiogm
// approaches n^(1/85) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/85) ~= 1.0275, for n=20 ~= 1.0359, for n=30 ~= 1.0408,
// for n=40 ~= 1.0444, for n=50 ~= 1.0471, for n=60 ~= 1.0494,
// for n=70 ~= 1.0513, for n=80 ~= 1.0529, for n=85 ~= 1.0537,
// for n=89 ~= 1.0542 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/85) ~= 1.0557) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/85) ~= 1.0557, and the pool100 [1x99, 100] reference reads
// 1.0451 spread (further absorbed from PTQOGM's 1.0458 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_85.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquoctogintic_mean = k,
//                                     range 0, ptqiogm 0 (tight).
//   * uniform ramp [1..10]          -> QIOGM ~= 9.7328, range 9,
//                                     ptqiogm ~= 0.9247 (tight).
//   * upper-outlier [1x9, 10]       -> QIOGM ~= 9.7328, range 9,
//                                     ptqiogm ~= 0.9247 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_85;
//                                     the M_84 joint collapse persists
//                                     at M_85 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/85) ~ 9.7328 in
//                                     lock-step, so ptqogm's 0.9250
//                                     joint bucket at M_84 remains a
//                                     joint 0.9247 bucket at M_85).
//   * two-shoulders [1x8, 5x2]      -> QIOGM ~= 4.9062, range 4,
//                                     ptqiogm ~= 0.8153 (tight).
//   * 50/50 split [1x5, 10x5]       -> QIOGM ~= 9.9188, range 9,
//                                     ptqiogm ~= 0.9074 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QIOGM ~= 97.3275, range 99,
//                                     ptqiogm ~= 1.0172 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/85) ~ 1.0275 asymptote).
//   * two-partner [1, 9]            -> QIOGM ~= 8.9269, range 8,
//                                     ptqiogm ~= 0.8962 (tight).
//   * two-partner [1, 100]          -> QIOGM ~= 99.1880, range 99,
//                                     ptqiogm ~= 0.9981 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTQOGM's 0.9982
//                                     tick; mean_85 tips further past
//                                     the range, so ptqiogm rounds to
//                                     0.9981 from below).
//   * small [10, 1, 1]              -> QIOGM ~= 9.8716, range 9,
//                                     ptqiogm ~= 0.9117 (tight).
//   * pool_count=100 [1x99, 100]    -> QIOGM ~= 94.7261, range 99,
//                                     ptqiogm ~= 1.0451 (SPREAD --
//                                     FURTHER ABSORBED from PTQOGM
//                                     M_84's 1.0458 spread;
//                                     100-partner asymptote
//                                     100^(1/85) ~ 1.0557 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqiogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquoctogintic_mean == 0
//   * tight                ptqiogm < 1.005
//   * spread               ptqiogm in [1.005, 1.09)
//   * wide                 ptqiogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqiogm_max /
// wide_ptqiogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.425):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuoroctoginticMeanSection
// (P11.423) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquoctogintic-center
// after the P11.423 range-against-quattuoroctogintic-center landing.

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
type PtqiogmLabel =
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

// Bands on raw ptqiogm (fixed cutoffs since quinquoctogintic_mean scales
// with cell counts and typical quinquoctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_85 is 0.9247 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0278 (M_84) to 1.0275
// (M_85), 20-partner drops from 1.0363 to 1.0359, 30-partner drops
// from 1.0413 to 1.0408, 40-partner drops from 1.0449 to 1.0444,
// 50-partner drops from 1.0477 to 1.0471, 60-partner drops from
// 1.0499 to 1.0494, 70-partner drops from 1.0519 to 1.0513,
// 80-partner drops from 1.0536 to 1.0529, 85-partner drops from
// 1.0543 to 1.0537, 89-partner drops from 1.0549 to 1.0542 -- so
// pool_count >= 100 (100^(1/85) ~ 1.0557) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTQOGM 1.0458 spread to PTQIOGM 1.0451
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQIOGM_MAX = 1.005;
const WIDE_PTQIOGM_MIN = 1.09;

// PTQIOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQIOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqiogm_max: number;
  readonly wide_ptqiogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanMap;
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

// Peak-to-quinquoctogintic-mean of a discrete distribution:
//   PTQIOGM = (max - min) / quinquoctogintic_mean
// where quinquoctogintic_mean = ((sum x_i^85) / n)^(1/85). Returns
// null on empty, solo, and degenerate (zero quinquoctogintic_mean or
// non-finite eighty-fifth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyFiveSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const quint = quad * v;
    const oct = quad * quad;
    // x^85 = (x^8)^10 * x^5 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quint
    eightyFiveSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quint;
  }
  if (!Number.isFinite(eightyFiveSum) || eightyFiveSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquoctogintic_mean: null,
    };
  }
  const quinquoctogintic_mean = Math.pow(eightyFiveSum / pool_count, 1 / 85);
  if (
    !Number.isFinite(quinquoctogintic_mean) ||
    quinquoctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptqiogm = range / quinquoctogintic_mean;
  const clamped = ptqiogm < 0 ? 0 : ptqiogm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquoctogintic_mean: roundTo(clamped, PTQIOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquoctogintic_mean:
      partner.peak_to_quinquoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquoctogintic_mean:
      metric.peak_to_quinquoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMean {
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
    tight_ptqiogm_max: TIGHT_PTQIOGM_MAX,
    wide_ptqiogm_min: WIDE_PTQIOGM_MIN,
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

function labelForPtqiogm(
  pool_count: number,
  pool_cells: number,
  ptqiogm: number | null,
  tight_max: number,
  wide_min: number,
): PtqiogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqiogm === null) return "degenerate";
  if (ptqiogm >= wide_min) return "wide";
  if (ptqiogm < tight_max) return "tight";
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

function renderPtqiogmCell(
  pool_count: number,
  pool_cells: number,
  ptqiogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqiogm(
    pool_count,
    pool_cells,
    ptqiogm,
    tight_max,
    wide_min,
  );
  const ptqiogmText = ptqiogm === null ? "-" : ptqiogm.toFixed(4);
  return `PTQIOGM ${ptqiogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqiogm_max, wide_ptqiogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquoctogintic_mean, tight_ptqiogm_max, wide_ptqiogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquoctogintic_mean, tight_ptqiogm_max, wide_ptqiogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqiogm = (max - min) / quinquoctogintic_mean where quinquoctogintic_mean = ((sum x_i^85) / n)^(1/85). Reads the pool's total RANGE in units of its QUINQUOCTOGINTIC (power-mean-of-order-85, M_85) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.422 PTQOGM because raising to the EIGHTY-FIFTH power lifts the anchor MORE than raising to the eighty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuoroctogintic) power-mean SEDECEMSEPTUAGINTUPLET into a SEPTEMDECIMSEPTUAGINTUPLET with the M_85 quinquoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqiogm approaches n^(1/85) so 10-partner pools cap near 1.0275, 20-partner near 1.0359, 30-partner near 1.0408, 40-partner near 1.0444, 50-partner near 1.0471, 60-partner near 1.0494, 70-partner near 1.0513, 80-partner near 1.0529, 85-partner near 1.0537 and 89-partner near 1.0542 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/85) ~= 1.0557) are required to escape into wide with a modest outlier. Composite regime labels: PTQIOGM tight + PTQOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQIOGM 0.9247 tight -- rejoining the uniform ramp's 0.9247 for the fourth tick in the sequence after PTQOGM's 0.9250 joint bucket at M_84); PTQIOGM spread + PTQOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQIOGM 1.0172 spread); PTQIOGM spread + PTQOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_85 ([1x99, 100] reads 1.0451 spread after M_84's 1.0458 spread landing); PTQIOGM tight + PTQOGM tight = ISOLATED HIGH PARTNER continues absorption past M_84 into M_85 ([1, 100] reads 0.9981 tight after M_84's 0.9982 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquoctogintic_mean == 0 (guarded but unreachable), tight = ptqiogm &lt; ${tight_ptqiogm_max}, spread = ptqiogm in [${tight_ptqiogm_max}, ${wide_ptqiogm_min}), wide = ptqiogm &ge; ${wide_ptqiogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqiogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
