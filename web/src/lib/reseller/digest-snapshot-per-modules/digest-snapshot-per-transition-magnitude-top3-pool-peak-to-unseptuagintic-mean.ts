// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNSEPTUAGINTIC-MEAN
// pure-lib (P11.396).
//
// WHOLE-POOL RANGE-AGAINST-UNSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNSEPTUAGINTIC MEAN (a.k.a. power mean of order 71, M_71):
//
//   ptuspqm = (max - min) / unseptuagintic_mean
//
// where unseptuagintic_mean = ((sum x_i^71) / n)^(1/71). Reads the
// peak spread against the UNSEPTUAGINTIC (power-mean-of-order-71)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.394 PTSPQM, because raising to the SEVENTY-FIRST power before
// averaging lifts the anchor MORE than raising to the seventieth
// does, dampening the ratio against the range even harder.
//
// PTUSPQM's unique DISPERSION-axis contribution: reads range in units
// of the UNSEPTUAGINTIC (POWER-MEAN-OF-ORDER-71) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novemsexagintic M_69, septuagintic M_70) power-mean
// DUOSEPTUAGINTUPLET into a TRESEPTUAGINTUPLET with the M_71
// unseptuagintic mean. By Power Mean inequality M_71 >= M_70, so
// unseptuagintic_mean >= septuagintic_mean and
// ptuspqm <= ptspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unseptuagintic_mean approaches x_max / n^(1/71), so ptuspqm
// approaches n^(1/71) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/71) ~= 1.0330, for n=20 ~= 1.0431, for n=30 ~= 1.0491, for
// n=40 ~= 1.0533, for n=50 ~= 1.0566, for n=60 ~= 1.0594, for n=70
// ~= 1.0617, for n=80 ~= 1.0637, for n=85 ~= 1.0646, for n=89 ~= 1.0653
// -- all still just under wide -- so pools with pool_count >= 99
// (99^(1/71) ~= 1.0669) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/71) ~= 1.0670, and the
// pool100 [1x99, 100] reference reads 1.0563 spread (further absorbed
// from PTSPQM's 1.0573 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_71.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unseptuagintic_mean = k,
//                                     range 0, ptuspqm 0 (tight).
//   * uniform ramp [1..10]          -> USPQM ~= 9.6810, range 9,
//                                     ptuspqm ~= 0.9297 (tight).
//   * upper-outlier [1x9, 10]       -> USPQM ~= 9.6809, range 9,
//                                     ptuspqm ~= 0.9297 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.394 PTSPQM's 0.9301
//                                     tick; at M_71 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9297 tick as the
//                                     anchor keeps drifting past M_70).
//   * two-shoulders [1x8, 5x2]      -> USPQM ~= 4.8879, range 4,
//                                     ptuspqm ~= 0.8183 (tight).
//   * 50/50 split [1x5, 10x5]       -> USPQM ~= 9.9028, range 9,
//                                     ptuspqm ~= 0.9088 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> USPQM ~= 96.8089, range 99,
//                                     ptuspqm ~= 1.0226 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/71) ~ 1.0330 asymptote).
//   * two-partner [1, 9]            -> USPQM ~= 8.9126, range 8,
//                                     ptuspqm ~= 0.8976 (tight).
//   * two-partner [1, 100]          -> USPQM ~= 99.0285, range 99,
//                                     ptuspqm ~= 0.9997 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTSPQM's 0.9999
//                                     tick; mean_71 tips further past
//                                     the range, so ptuspqm rounds to
//                                     0.9997 from below).
//   * small [10, 1, 1]              -> USPQM ~= 9.8465, range 9,
//                                     ptuspqm ~= 0.9140 (tight).
//   * pool_count=100 [1x99, 100]    -> USPQM ~= 93.7197, range 99,
//                                     ptuspqm ~= 1.0563 (SPREAD --
//                                     FURTHER ABSORBED from PTSPQM
//                                     M_70's 1.0573 spread;
//                                     100-partner asymptote
//                                     100^(1/71) ~ 1.0670 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptuspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unseptuagintic_mean == 0
//   * tight                ptuspqm < 1.005
//   * spread               ptuspqm in [1.005, 1.09)
//   * wide                 ptuspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptuspqm_max /
// wide_ptuspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.397):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptuaginticMeanSection
// (P11.395) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unseptuagintic-center
// after the P11.395 range-against-septuagintic-center landing.

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
type PtuspqmLabel =
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

// Bands on raw ptuspqm (fixed cutoffs since unseptuagintic_mean
// scales with cell counts and typical unseptuagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_71 is 0.9297 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0334 (M_70) to
// 1.0330 (M_71), 20-partner drops from 1.0437 to 1.0431, 30-partner
// drops from 1.0498 to 1.0491, 40-partner drops from 1.0541 to 1.0533,
// 50-partner drops from 1.0575 to 1.0566, 60-partner drops from 1.0602
// to 1.0594, 70-partner drops from 1.0626 to 1.0617, 80-partner drops
// from 1.0646 to 1.0637, 85-partner drops from 1.0655 to 1.0646,
// 89-partner drops from 1.0662 to 1.0653 -- so pool_count >= 99
// (99^(1/71) ~ 1.0669) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTSPQM 1.0573 spread to PTUSPQM 1.0563 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTUSPQM_MAX = 1.005;
const WIDE_PTUSPQM_MIN = 1.09;

// PTUSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuspqm_max: number;
  readonly wide_ptuspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanMap;
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

// Peak-to-unseptuagintic-mean of a discrete distribution:
//   PTUSPQM = (max - min) / unseptuagintic_mean
// where unseptuagintic_mean = ((sum x_i^71) / n)^(1/71). Returns
// null on empty, solo, and degenerate (zero unseptuagintic_mean
// or non-finite seventy-first-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^71 = (x^8)^8 * x^4 * x^2 * x -> oct*oct*oct*oct*oct*oct*oct*oct * quad * sq * v
    seventyFirstSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(seventyFirstSum) || seventyFirstSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unseptuagintic_mean: null,
    };
  }
  const unseptuagintic_mean = Math.pow(seventyFirstSum / pool_count, 1 / 71);
  if (!Number.isFinite(unseptuagintic_mean) || unseptuagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptuspqm = range / unseptuagintic_mean;
  const clamped = ptuspqm < 0 ? 0 : ptuspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_unseptuagintic_mean: roundTo(clamped, PTUSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unseptuagintic_mean: partner.peak_to_unseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unseptuagintic_mean: metric.peak_to_unseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMean {
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
    tight_ptuspqm_max: TIGHT_PTUSPQM_MAX,
    wide_ptuspqm_min: WIDE_PTUSPQM_MIN,
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

function labelForPtuspqm(
  pool_count: number,
  pool_cells: number,
  ptuspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtuspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuspqm === null) return "degenerate";
  if (ptuspqm >= wide_min) return "wide";
  if (ptuspqm < tight_max) return "tight";
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

function renderPtuspqmCell(
  pool_count: number,
  pool_cells: number,
  ptuspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuspqm(
    pool_count,
    pool_cells,
    ptuspqm,
    tight_max,
    wide_min,
  );
  const ptuspqmText = ptuspqm === null ? "-" : ptuspqm.toFixed(4);
  return `PTUSPQM ${ptuspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuspqm_max, wide_ptuspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unseptuagintic_mean, tight_ptuspqm_max, wide_ptuspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unseptuagintic_mean, tight_ptuspqm_max, wide_ptuspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuspqm = (max - min) / unseptuagintic_mean where unseptuagintic_mean = ((sum x_i^71) / n)^(1/71). Reads the pool's total RANGE in units of its UNSEPTUAGINTIC (power-mean-of-order-71, M_71) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.394 PTSPQM because raising to the SEVENTY-FIRST power lifts the anchor MORE than raising to the seventieth does. Unique DISPERSION-axis contribution extends the (harmonic..septuagintic) power-mean DUOSEPTUAGINTUPLET into a TRESEPTUAGINTUPLET with the M_71 unseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuspqm approaches n^(1/71) so 10-partner pools cap near 1.0330, 20-partner near 1.0431, 30-partner near 1.0491, 40-partner near 1.0533, 50-partner near 1.0566, 60-partner near 1.0594, 70-partner near 1.0617, 80-partner near 1.0637, 85-partner near 1.0646 and 89-partner near 1.0653 (all below the wide floor); pools with pool_count &gt;= 99 (99^(1/71) ~= 1.0669) are required to escape into wide with a modest outlier. Composite regime labels: PTUSPQM tight + PTSPQM tight = MILD OUTLIER absorbed by unseptuagintic ([1x9, 10] reads PTUSPQM 0.9297 tight); PTUSPQM spread + PTSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUSPQM 1.0226 spread); PTUSPQM spread + PTSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_71 ([1x99, 100] reads 1.0563 spread after M_70's 1.0573 spread landing); PTUSPQM tight + PTSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_70 into M_71 ([1, 100] reads 0.9997 tight after M_70's 0.9999 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unseptuagintic_mean == 0 (guarded but unreachable), tight = ptuspqm &lt; ${tight_ptuspqm_max}, spread = ptuspqm in [${tight_ptuspqm_max}, ${wide_ptuspqm_min}), wide = ptuspqm &ge; ${wide_ptuspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
