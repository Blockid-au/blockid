// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESOCTOGINTIC-MEAN
// pure-lib (P11.420).
//
// WHOLE-POOL RANGE-AGAINST-TRESOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESOCTOGINTIC MEAN (a.k.a. power mean of order 83, M_83):
//
//   pttogm = (max - min) / tresoctogintic_mean
//
// where tresoctogintic_mean = ((sum x_i^83) / n)^(1/83). Reads the peak
// spread against the TRESOCTOGINTIC (power-mean-of-order-83) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.418
// PTDOGM, because raising to the EIGHTY-THIRD power before averaging
// lifts the anchor MORE than raising to the eighty-second does,
// dampening the ratio against the range even harder.
//
// PTTOGM's unique DISPERSION-axis contribution: reads range in units
// of the TRESOCTOGINTIC (POWER-MEAN-OF-ORDER-83) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... unoctogintic M_81, duooctogintic M_82) power-mean
// QUATTUORDECEMSEPTUAGINTUPLET into a QUINDECEMSEPTUAGINTUPLET with the
// M_83 tresoctogintic mean. By Power Mean inequality M_83 >= M_82, so
// tresoctogintic_mean >= duooctogintic_mean and pttogm <= ptdogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tresoctogintic_mean approaches x_max / n^(1/83), so pttogm approaches
// n^(1/83) as x_max -> +Inf. For n=10 the ceiling is 10^(1/83)
// ~= 1.0281, for n=20 ~= 1.0368, for n=30 ~= 1.0418, for n=40
// ~= 1.0454, for n=50 ~= 1.0483, for n=60 ~= 1.0506, for n=70
// ~= 1.0525, for n=80 ~= 1.0542, for n=85 ~= 1.0550, for n=89
// ~= 1.0556 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/83) ~= 1.0571) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/83) ~= 1.0571, and the pool100 [1x99, 100] reference reads
// 1.0465 spread (further absorbed from PTDOGM's 1.0472 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_83.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tresoctogintic_mean = k,
//                                     range 0, pttogm 0 (tight).
//   * uniform ramp [1..10]          -> TSOGM ~= 9.7264, range 9,
//                                     pttogm ~= 0.9253 (tight).
//   * upper-outlier [1x9, 10]       -> TSOGM ~= 9.7264, range 9,
//                                     pttogm ~= 0.9253 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_83;
//                                     the M_82 collapse persists at
//                                     M_83 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/83) ~ 9.7264 in
//                                     lock-step, so ptdogm's 0.9256
//                                     rejoin at M_82 remains a joint
//                                     0.9253 rejoin at M_83).
//   * two-shoulders [1x8, 5x2]      -> TSOGM ~= 4.9040, range 4,
//                                     pttogm ~= 0.8157 (tight).
//   * 50/50 split [1x5, 10x5]       -> TSOGM ~= 9.9168, range 9,
//                                     pttogm ~= 0.9075 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> TSOGM ~= 97.2639, range 99,
//                                     pttogm ~= 1.0178 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/83) ~ 1.0281 asymptote).
//   * two-partner [1, 9]            -> TSOGM ~= 8.9252, range 8,
//                                     pttogm ~= 0.8963 (tight).
//   * two-partner [1, 100]          -> TSOGM ~= 99.1684, range 99,
//                                     pttogm ~= 0.9983 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTDOGM's 0.9984
//                                     tick; mean_83 tips further past
//                                     the range, so pttogm rounds to
//                                     0.9983 from below).
//   * small [10, 1, 1]              -> TSOGM ~= 9.8685, range 9,
//                                     pttogm ~= 0.9120 (tight).
//   * pool_count=100 [1x99, 100]    -> TSOGM ~= 94.6027, range 99,
//                                     pttogm ~= 1.0465 (SPREAD --
//                                     FURTHER ABSORBED from PTDOGM
//                                     M_82's 1.0472 spread;
//                                     100-partner asymptote
//                                     100^(1/83) ~ 1.0571 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw pttogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tresoctogintic_mean == 0
//   * tight                pttogm < 1.005
//   * spread               pttogm in [1.005, 1.09)
//   * wide                 pttogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttogm_max /
// wide_pttogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.421):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuooctoginticMeanSection
// (P11.419) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tresoctogintic-center
// after the P11.419 range-against-duooctogintic-center landing.

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
type PttogmLabel =
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

// Bands on raw pttogm (fixed cutoffs since tresoctogintic_mean scales with
// cell counts and typical tresoctogintic-center emissions land near 1-10
// for the P11.161 top-3 pool). Tight boundary HOLDS at P11.344
// PTQIQM's 1.005 -- MILD-OUTLIER at M_83 is 0.9253 (already well
// below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0285 (M_82) to 1.0281
// (M_83), 20-partner drops from 1.0372 to 1.0368, 30-partner drops
// from 1.0424 to 1.0418, 40-partner drops from 1.0460 to 1.0454,
// 50-partner drops from 1.0489 to 1.0483, 60-partner drops from
// 1.0512 to 1.0506, 70-partner drops from 1.0532 to 1.0525,
// 80-partner drops from 1.0549 to 1.0542, 85-partner drops from
// 1.0557 to 1.0550, 89-partner drops from 1.0563 to 1.0556 -- so
// pool_count >= 100 (100^(1/83) ~ 1.0571) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTDOGM 1.0472 spread to PTTOGM 1.0465
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTOGM_MAX = 1.005;
const WIDE_PTTOGM_MIN = 1.09;

// PTTOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttogm_max: number;
  readonly wide_pttogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanMap;
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

// Peak-to-tresoctogintic-mean of a discrete distribution:
//   PTTOGM = (max - min) / tresoctogintic_mean
// where tresoctogintic_mean = ((sum x_i^83) / n)^(1/83). Returns null
// on empty, solo, and degenerate (zero tresoctogintic_mean or non-finite
// eighty-third-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyThreeSum = 0;
  for (const v of values) {
    const sq = v * v;
    const cube = sq * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^83 = (x^8)^10 * x^3 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * cube
    eightyThreeSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * cube;
  }
  if (!Number.isFinite(eightyThreeSum) || eightyThreeSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresoctogintic_mean: null,
    };
  }
  const tresoctogintic_mean = Math.pow(eightyThreeSum / pool_count, 1 / 83);
  if (!Number.isFinite(tresoctogintic_mean) || tresoctogintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresoctogintic_mean: null,
    };
  }
  const range = max - min;
  const pttogm = range / tresoctogintic_mean;
  const clamped = pttogm < 0 ? 0 : pttogm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresoctogintic_mean: roundTo(clamped, PTTOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresoctogintic_mean: partner.peak_to_tresoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresoctogintic_mean: metric.peak_to_tresoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresoctoginticMean {
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
    tight_pttogm_max: TIGHT_PTTOGM_MAX,
    wide_pttogm_min: WIDE_PTTOGM_MIN,
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

function labelForPttogm(
  pool_count: number,
  pool_cells: number,
  pttogm: number | null,
  tight_max: number,
  wide_min: number,
): PttogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttogm === null) return "degenerate";
  if (pttogm >= wide_min) return "wide";
  if (pttogm < tight_max) return "tight";
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

function renderPttogmCell(
  pool_count: number,
  pool_cells: number,
  pttogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttogm(
    pool_count,
    pool_cells,
    pttogm,
    tight_max,
    wide_min,
  );
  const pttogmText = pttogm === null ? "-" : pttogm.toFixed(4);
  return `PTTOGM ${pttogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttogm_max, wide_pttogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresoctogintic_mean, tight_pttogm_max, wide_pttogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresoctogintic_mean, tight_pttogm_max, wide_pttogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; pttogm = (max - min) / tresoctogintic_mean where tresoctogintic_mean = ((sum x_i^83) / n)^(1/83). Reads the pool's total RANGE in units of its TRESOCTOGINTIC (power-mean-of-order-83, M_83) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.418 PTDOGM because raising to the EIGHTY-THIRD power lifts the anchor MORE than raising to the eighty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duooctogintic) power-mean QUATTUORDECEMSEPTUAGINTUPLET into a QUINDECEMSEPTUAGINTUPLET with the M_83 tresoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttogm approaches n^(1/83) so 10-partner pools cap near 1.0281, 20-partner near 1.0368, 30-partner near 1.0418, 40-partner near 1.0454, 50-partner near 1.0483, 60-partner near 1.0506, 70-partner near 1.0525, 80-partner near 1.0542, 85-partner near 1.0550 and 89-partner near 1.0556 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/83) ~= 1.0571) are required to escape into wide with a modest outlier. Composite regime labels: PTTOGM tight + PTDOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTOGM 0.9253 tight -- rejoining the uniform ramp's 0.9253 for the second tick in the sequence after PTDOGM's 0.9256 joint bucket at M_82); PTTOGM spread + PTDOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTOGM 1.0178 spread); PTTOGM spread + PTDOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_83 ([1x99, 100] reads 1.0465 spread after M_82's 1.0472 spread landing); PTTOGM tight + PTDOGM tight = ISOLATED HIGH PARTNER continues absorption past M_82 into M_83 ([1, 100] reads 0.9983 tight after M_82's 0.9984 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tresoctogintic_mean == 0 (guarded but unreachable), tight = pttogm &lt; ${tight_pttogm_max}, spread = pttogm in [${tight_pttogm_max}, ${wide_pttogm_min}), wide = pttogm &ge; ${wide_pttogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
