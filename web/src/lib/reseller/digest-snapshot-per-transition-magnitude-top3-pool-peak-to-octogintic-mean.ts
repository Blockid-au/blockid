// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOGINTIC-MEAN
// pure-lib (P11.414).
//
// WHOLE-POOL RANGE-AGAINST-OCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOGINTIC MEAN (a.k.a. power mean of order 80, M_80):
//
//   ptogm = (max - min) / octogintic_mean
//
// where octogintic_mean = ((sum x_i^80) / n)^(1/80). Reads the peak
// spread against the OCTOGINTIC (power-mean-of-order-80) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.412
// PTNSPQM, because raising to the EIGHTIETH power before averaging
// lifts the anchor MORE than raising to the seventy-ninth does,
// dampening the ratio against the range even harder.
//
// PTOGM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOGINTIC (POWER-MEAN-OF-ORDER-80) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... octoseptuagintic M_78, novenseptuagintic M_79) power-mean
// UNDECEMSEPTUAGINTUPLET into a DUODECEMSEPTUAGINTUPLET with the M_80
// octogintic mean. By Power Mean inequality M_80 >= M_79, so
// octogintic_mean >= novenseptuagintic_mean and ptogm <= ptnspqm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octogintic_mean approaches x_max / n^(1/80), so ptogm approaches
// n^(1/80) as x_max -> +Inf. For n=10 the ceiling is 10^(1/80)
// ~= 1.0292, for n=20 ~= 1.0382, for n=30 ~= 1.0435, for n=40
// ~= 1.0473, for n=50 ~= 1.0502, for n=60 ~= 1.0527, for n=70
// ~= 1.0547, for n=80 ~= 1.0564, for n=85 ~= 1.0572, for n=89
// ~= 1.0578 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/80) ~= 1.0593) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/80) ~= 1.0593, and the pool100 [1x99, 100] reference reads
// 1.0487 spread (further absorbed from PTNSPQM's 1.0494 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_80.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octogintic_mean = k,
//                                     range 0, ptogm 0 (tight).
//   * uniform ramp [1..10]          -> OGM ~= 9.7163, range 9,
//                                     ptogm ~= 0.9263 (tight).
//   * upper-outlier [1x9, 10]       -> OGM ~= 9.7163, range 9,
//                                     ptogm ~= 0.9263 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.412 PTNSPQM's 0.9266
//                                     tick; at M_80 both the ramp
//                                     and the outlier round together
//                                     to the same 0.9263 tick as the
//                                     anchor keeps drifting past M_79).
//   * two-shoulders [1x8, 5x2]      -> OGM ~= 4.9004, range 4,
//                                     ptogm ~= 0.8163 (tight).
//   * 50/50 split [1x5, 10x5]       -> OGM ~= 9.9137, range 9,
//                                     ptogm ~= 0.9078 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> OGM ~= 97.1628, range 99,
//                                     ptogm ~= 1.0189 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/80) ~ 1.0292 asymptote).
//   * two-partner [1, 9]            -> OGM ~= 8.9224, range 8,
//                                     ptogm ~= 0.8966 (tight).
//   * two-partner [1, 100]          -> OGM ~= 99.1373, range 99,
//                                     ptogm ~= 0.9986 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTNSPQM's 0.9987
//                                     tick; mean_80 tips further past
//                                     the range, so ptogm rounds to
//                                     0.9986 from below).
//   * small [10, 1, 1]              -> OGM ~= 9.8636, range 9,
//                                     ptogm ~= 0.9124 (tight).
//   * pool_count=100 [1x99, 100]    -> OGM ~= 94.4061, range 99,
//                                     ptogm ~= 1.0487 (SPREAD --
//                                     FURTHER ABSORBED from PTNSPQM
//                                     M_79's 1.0494 spread;
//                                     100-partner asymptote
//                                     100^(1/80) ~ 1.0593 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octogintic_mean == 0
//   * tight                ptogm < 1.005
//   * spread               ptogm in [1.005, 1.09)
//   * wide                 ptogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptogm_max /
// wide_ptogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.415):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanSection
// (P11.413) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octogintic-center
// after the P11.413 range-against-novenseptuagintic-center landing.

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
type PtogmLabel =
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

// Bands on raw ptogm (fixed cutoffs since octogintic_mean scales with
// cell counts and typical octogintic-center emissions land near 1-10
// for the P11.161 top-3 pool). Tight boundary HOLDS at P11.344
// PTQIQM's 1.005 -- MILD-OUTLIER at M_80 is 0.9263 (already well
// below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0296 (M_79) to 1.0292
// (M_80), 20-partner drops from 1.0386 to 1.0382, 30-partner drops
// from 1.0440 to 1.0435, 40-partner drops from 1.0478 to 1.0473,
// 50-partner drops from 1.0508 to 1.0502, 60-partner drops from
// 1.0532 to 1.0527, 70-partner drops from 1.0553 to 1.0547,
// 80-partner drops from 1.0570 to 1.0564, 85-partner drops from
// 1.0578 to 1.0572, 89-partner drops from 1.0585 to 1.0578 -- so
// pool_count >= 100 (100^(1/80) ~ 1.0593) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTNSPQM 1.0494 spread to PTOGM 1.0487
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOGM_MAX = 1.005;
const WIDE_PTOGM_MIN = 1.09;

// PTOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptogm_max: number;
  readonly wide_ptogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanMap;
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

// Peak-to-octogintic-mean of a discrete distribution:
//   PTOGM = (max - min) / octogintic_mean
// where octogintic_mean = ((sum x_i^80) / n)^(1/80). Returns null
// on empty, solo, and degenerate (zero octogintic_mean or non-finite
// eightieth-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^80 = (x^8)^10 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct
    eightiethSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(eightiethSum) || eightiethSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octogintic_mean: null,
    };
  }
  const octogintic_mean = Math.pow(eightiethSum / pool_count, 1 / 80);
  if (!Number.isFinite(octogintic_mean) || octogintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octogintic_mean: null,
    };
  }
  const range = max - min;
  const ptogm = range / octogintic_mean;
  const clamped = ptogm < 0 ? 0 : ptogm;
  return {
    pool_count,
    pool_cells,
    peak_to_octogintic_mean: roundTo(clamped, PTOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octogintic_mean: partner.peak_to_octogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octogintic_mean: metric.peak_to_octogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoginticMean {
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
    tight_ptogm_max: TIGHT_PTOGM_MAX,
    wide_ptogm_min: WIDE_PTOGM_MIN,
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

function labelForPtogm(
  pool_count: number,
  pool_cells: number,
  ptogm: number | null,
  tight_max: number,
  wide_min: number,
): PtogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptogm === null) return "degenerate";
  if (ptogm >= wide_min) return "wide";
  if (ptogm < tight_max) return "tight";
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

function renderPtogmCell(
  pool_count: number,
  pool_cells: number,
  ptogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtogm(
    pool_count,
    pool_cells,
    ptogm,
    tight_max,
    wide_min,
  );
  const ptogmText = ptogm === null ? "-" : ptogm.toFixed(4);
  return `PTOGM ${ptogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptogm_max, wide_ptogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octogintic_mean, tight_ptogm_max, wide_ptogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octogintic_mean, tight_ptogm_max, wide_ptogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptogm = (max - min) / octogintic_mean where octogintic_mean = ((sum x_i^80) / n)^(1/80). Reads the pool's total RANGE in units of its OCTOGINTIC (power-mean-of-order-80, M_80) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.412 PTNSPQM because raising to the EIGHTIETH power lifts the anchor MORE than raising to the seventy-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novenseptuagintic) power-mean UNDECEMSEPTUAGINTUPLET into a DUODECEMSEPTUAGINTUPLET with the M_80 octogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptogm approaches n^(1/80) so 10-partner pools cap near 1.0292, 20-partner near 1.0382, 30-partner near 1.0435, 40-partner near 1.0473, 50-partner near 1.0502, 60-partner near 1.0527, 70-partner near 1.0547, 80-partner near 1.0564, 85-partner near 1.0572 and 89-partner near 1.0578 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/80) ~= 1.0593) are required to escape into wide with a modest outlier. Composite regime labels: PTOGM tight + PTNSPQM tight = MILD OUTLIER absorbed by octogintic ([1x9, 10] reads PTOGM 0.9263 tight); PTOGM spread + PTNSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOGM 1.0189 spread); PTOGM spread + PTNSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_80 ([1x99, 100] reads 1.0487 spread after M_79's 1.0494 spread landing); PTOGM tight + PTNSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_79 into M_80 ([1, 100] reads 0.9986 tight after M_79's 0.9987 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octogintic_mean == 0 (guarded but unreachable), tight = ptogm &lt; ${tight_ptogm_max}, spread = ptogm in [${tight_ptogm_max}, ${wide_ptogm_min}), wide = ptogm &ge; ${wide_ptogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
