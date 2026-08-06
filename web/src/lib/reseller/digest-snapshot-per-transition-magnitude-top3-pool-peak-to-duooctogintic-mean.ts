// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOOCTOGINTIC-MEAN
// pure-lib (P11.418).
//
// WHOLE-POOL RANGE-AGAINST-DUOOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUOOCTOGINTIC MEAN (a.k.a. power mean of order 82, M_82):
//
//   ptdogm = (max - min) / duooctogintic_mean
//
// where duooctogintic_mean = ((sum x_i^82) / n)^(1/82). Reads the peak
// spread against the DUOOCTOGINTIC (power-mean-of-order-82) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.416
// PTUOGM, because raising to the EIGHTY-SECOND power before averaging
// lifts the anchor MORE than raising to the eighty-first does,
// dampening the ratio against the range even harder.
//
// PTDOGM's unique DISPERSION-axis contribution: reads range in units
// of the DUOOCTOGINTIC (POWER-MEAN-OF-ORDER-82) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... octogintic M_80, unoctogintic M_81) power-mean
// TREDECEMSEPTUAGINTUPLET into a QUATTUORDECEMSEPTUAGINTUPLET with the
// M_82 duooctogintic mean. By Power Mean inequality M_82 >= M_81, so
// duooctogintic_mean >= unoctogintic_mean and ptdogm <= ptuogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duooctogintic_mean approaches x_max / n^(1/82), so ptdogm approaches
// n^(1/82) as x_max -> +Inf. For n=10 the ceiling is 10^(1/82)
// ~= 1.0285, for n=20 ~= 1.0372, for n=30 ~= 1.0424, for n=40
// ~= 1.0460, for n=50 ~= 1.0489, for n=60 ~= 1.0512, for n=70
// ~= 1.0532, for n=80 ~= 1.0549, for n=85 ~= 1.0557, for n=89
// ~= 1.0563 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/82) ~= 1.0578) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/82) ~= 1.0578, and the pool100 [1x99, 100] reference reads
// 1.0472 spread (further absorbed from PTUOGM's 1.0479 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_82.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duooctogintic_mean = k,
//                                     range 0, ptdogm 0 (tight).
//   * uniform ramp [1..10]          -> DOGM ~= 9.7231, range 9,
//                                     ptdogm ~= 0.9256 (tight).
//   * upper-outlier [1x9, 10]       -> DOGM ~= 9.7231, range 9,
//                                     ptdogm ~= 0.9256 (tight --
//                                     MILD OUTLIER now COLLAPSES BACK
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_82;
//                                     the M_81 split at the
//                                     0.9259|0.9260 rounding boundary
//                                     narrows on the raw scale as both
//                                     anchors approach 10 / 10^(1/82)
//                                     ~ 9.7231, so the outlier ticks
//                                     from PTUOGM's 0.9260 DOWN into
//                                     PTDOGM's 0.9256 alongside the
//                                     ramp).
//   * two-shoulders [1x8, 5x2]      -> DOGM ~= 4.9028, range 4,
//                                     ptdogm ~= 0.8159 (tight).
//   * 50/50 split [1x5, 10x5]       -> DOGM ~= 9.9158, range 9,
//                                     ptdogm ~= 0.9076 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> DOGM ~= 97.2310, range 99,
//                                     ptdogm ~= 1.0182 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/82) ~ 1.0285 asymptote).
//   * two-partner [1, 9]            -> DOGM ~= 8.9242, range 8,
//                                     ptdogm ~= 0.8964 (tight).
//   * two-partner [1, 100]          -> DOGM ~= 99.1583, range 99,
//                                     ptdogm ~= 0.9984 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTUOGM's 0.9985
//                                     tick; mean_82 tips further past
//                                     the range, so ptdogm rounds to
//                                     0.9984 from below).
//   * small [10, 1, 1]              -> DOGM ~= 9.8669, range 9,
//                                     ptdogm ~= 0.9121 (tight).
//   * pool_count=100 [1x99, 100]    -> DOGM ~= 94.5387, range 99,
//                                     ptdogm ~= 1.0472 (SPREAD --
//                                     FURTHER ABSORBED from PTUOGM
//                                     M_81's 1.0479 spread;
//                                     100-partner asymptote
//                                     100^(1/82) ~ 1.0578 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptdogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duooctogintic_mean == 0
//   * tight                ptdogm < 1.005
//   * spread               ptdogm in [1.005, 1.09)
//   * wide                 ptdogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdogm_max /
// wide_ptdogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.419):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanSection
// (P11.417) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duooctogintic-center
// after the P11.417 range-against-unoctogintic-center landing.

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
type PtdogmLabel =
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

// Bands on raw ptdogm (fixed cutoffs since duooctogintic_mean scales with
// cell counts and typical duooctogintic-center emissions land near 1-10
// for the P11.161 top-3 pool). Tight boundary HOLDS at P11.344
// PTQIQM's 1.005 -- MILD-OUTLIER at M_82 is 0.9256 (already well
// below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0288 (M_81) to 1.0285
// (M_82), 20-partner drops from 1.0377 to 1.0372, 30-partner drops
// from 1.0429 to 1.0424, 40-partner drops from 1.0466 to 1.0460,
// 50-partner drops from 1.0495 to 1.0489, 60-partner drops from
// 1.0518 to 1.0512, 70-partner drops from 1.0539 to 1.0532,
// 80-partner drops from 1.0556 to 1.0549, 85-partner drops from
// 1.0564 to 1.0557, 89-partner drops from 1.0570 to 1.0563 -- so
// pool_count >= 100 (100^(1/82) ~ 1.0578) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTUOGM 1.0479 spread to PTDOGM 1.0472
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDOGM_MAX = 1.005;
const WIDE_PTDOGM_MIN = 1.09;

// PTDOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duooctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duooctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuooctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdogm_max: number;
  readonly wide_ptdogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanMap;
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

// Peak-to-duooctogintic-mean of a discrete distribution:
//   PTDOGM = (max - min) / duooctogintic_mean
// where duooctogintic_mean = ((sum x_i^82) / n)^(1/82). Returns null
// on empty, solo, and degenerate (zero duooctogintic_mean or non-finite
// eighty-second-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duooctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duooctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duooctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duooctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyTwoSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^82 = (x^8)^10 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * sq
    eightyTwoSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(eightyTwoSum) || eightyTwoSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duooctogintic_mean: null,
    };
  }
  const duooctogintic_mean = Math.pow(eightyTwoSum / pool_count, 1 / 82);
  if (!Number.isFinite(duooctogintic_mean) || duooctogintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duooctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptdogm = range / duooctogintic_mean;
  const clamped = ptdogm < 0 ? 0 : ptdogm;
  return {
    pool_count,
    pool_cells,
    peak_to_duooctogintic_mean: roundTo(clamped, PTDOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duooctogintic_mean: partner.peak_to_duooctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duooctogintic_mean: metric.peak_to_duooctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuooctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuooctoginticMean {
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
    tight_ptdogm_max: TIGHT_PTDOGM_MAX,
    wide_ptdogm_min: WIDE_PTDOGM_MIN,
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

function labelForPtdogm(
  pool_count: number,
  pool_cells: number,
  ptdogm: number | null,
  tight_max: number,
  wide_min: number,
): PtdogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdogm === null) return "degenerate";
  if (ptdogm >= wide_min) return "wide";
  if (ptdogm < tight_max) return "tight";
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

function renderPtdogmCell(
  pool_count: number,
  pool_cells: number,
  ptdogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdogm(
    pool_count,
    pool_cells,
    ptdogm,
    tight_max,
    wide_min,
  );
  const ptdogmText = ptdogm === null ? "-" : ptdogm.toFixed(4);
  return `PTDOGM ${ptdogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuooctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdogm_max, wide_ptdogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duooctogintic_mean, tight_ptdogm_max, wide_ptdogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duooctogintic_mean, tight_ptdogm_max, wide_ptdogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdogm = (max - min) / duooctogintic_mean where duooctogintic_mean = ((sum x_i^82) / n)^(1/82). Reads the pool's total RANGE in units of its DUOOCTOGINTIC (power-mean-of-order-82, M_82) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.416 PTUOGM because raising to the EIGHTY-SECOND power lifts the anchor MORE than raising to the eighty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unoctogintic) power-mean TREDECEMSEPTUAGINTUPLET into a QUATTUORDECEMSEPTUAGINTUPLET with the M_82 duooctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdogm approaches n^(1/82) so 10-partner pools cap near 1.0285, 20-partner near 1.0372, 30-partner near 1.0424, 40-partner near 1.0460, 50-partner near 1.0489, 60-partner near 1.0512, 70-partner near 1.0532, 80-partner near 1.0549, 85-partner near 1.0557 and 89-partner near 1.0563 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/82) ~= 1.0578) are required to escape into wide with a modest outlier. Composite regime labels: PTDOGM tight + PTUOGM tight = MILD OUTLIER COLLAPSED BACK into the ramp's bucket ([1x9, 10] reads PTDOGM 0.9256 tight -- rejoining the uniform ramp's 0.9256 after the M_81 split at the 0.9259|0.9260 rounding boundary); PTDOGM spread + PTUOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDOGM 1.0182 spread); PTDOGM spread + PTUOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_82 ([1x99, 100] reads 1.0472 spread after M_81's 1.0479 spread landing); PTDOGM tight + PTUOGM tight = ISOLATED HIGH PARTNER continues absorption past M_81 into M_82 ([1, 100] reads 0.9984 tight after M_81's 0.9985 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duooctogintic_mean == 0 (guarded but unreachable), tight = ptdogm &lt; ${tight_ptdogm_max}, spread = ptdogm in [${tight_ptdogm_max}, ${wide_ptdogm_min}), wide = ptdogm &ge; ${wide_ptdogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
