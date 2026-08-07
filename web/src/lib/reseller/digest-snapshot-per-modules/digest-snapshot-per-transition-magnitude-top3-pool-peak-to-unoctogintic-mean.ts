// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNOCTOGINTIC-MEAN
// pure-lib (P11.416).
//
// WHOLE-POOL RANGE-AGAINST-UNOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNOCTOGINTIC MEAN (a.k.a. power mean of order 81, M_81):
//
//   ptuogm = (max - min) / unoctogintic_mean
//
// where unoctogintic_mean = ((sum x_i^81) / n)^(1/81). Reads the peak
// spread against the UNOCTOGINTIC (power-mean-of-order-81) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.414
// PTOGM, because raising to the EIGHTY-FIRST power before averaging
// lifts the anchor MORE than raising to the eightieth does,
// dampening the ratio against the range even harder.
//
// PTUOGM's unique DISPERSION-axis contribution: reads range in units
// of the UNOCTOGINTIC (POWER-MEAN-OF-ORDER-81) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... novenseptuagintic M_79, octogintic M_80) power-mean
// DUODECEMSEPTUAGINTUPLET into a TREDECEMSEPTUAGINTUPLET with the M_81
// unoctogintic mean. By Power Mean inequality M_81 >= M_80, so
// unoctogintic_mean >= octogintic_mean and ptuogm <= ptogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unoctogintic_mean approaches x_max / n^(1/81), so ptuogm approaches
// n^(1/81) as x_max -> +Inf. For n=10 the ceiling is 10^(1/81)
// ~= 1.0288, for n=20 ~= 1.0377, for n=30 ~= 1.0429, for n=40
// ~= 1.0466, for n=50 ~= 1.0495, for n=60 ~= 1.0518, for n=70
// ~= 1.0539, for n=80 ~= 1.0556, for n=85 ~= 1.0564, for n=89
// ~= 1.0570 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/81) ~= 1.0585) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/81) ~= 1.0585, and the pool100 [1x99, 100] reference reads
// 1.0479 spread (further absorbed from PTOGM's 1.0487 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_81.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unoctogintic_mean = k,
//                                     range 0, ptuogm 0 (tight).
//   * uniform ramp [1..10]          -> UOGM ~= 9.7198, range 9,
//                                     ptuogm ~= 0.9259 (tight).
//   * upper-outlier [1x9, 10]       -> UOGM ~= 9.7197, range 9,
//                                     ptuogm ~= 0.9260 (tight --
//                                     MILD OUTLIER now reads ONE
//                                     TICK ABOVE the uniform ramp
//                                     for the first time; at M_80
//                                     both rounded together to 0.9263
//                                     but at M_81 the ramp anchor
//                                     narrowly beats the outlier
//                                     anchor across the 0.9259|0.9260
//                                     rounding boundary -- both still
//                                     tight, both still far below
//                                     the 1.005 buffer).
//   * two-shoulders [1x8, 5x2]      -> UOGM ~= 4.9016, range 4,
//                                     ptuogm ~= 0.8161 (tight).
//   * 50/50 split [1x5, 10x5]       -> UOGM ~= 9.9148, range 9,
//                                     ptuogm ~= 0.9077 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> UOGM ~= 97.1973, range 99,
//                                     ptuogm ~= 1.0185 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/81) ~ 1.0288 asymptote).
//   * two-partner [1, 9]            -> UOGM ~= 8.9233, range 8,
//                                     ptuogm ~= 0.8965 (tight).
//   * two-partner [1, 100]          -> UOGM ~= 99.1479, range 99,
//                                     ptuogm ~= 0.9985 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTOGM's 0.9986
//                                     tick; mean_81 tips further past
//                                     the range, so ptuogm rounds to
//                                     0.9985 from below).
//   * small [10, 1, 1]              -> UOGM ~= 9.8653, range 9,
//                                     ptuogm ~= 0.9123 (tight).
//   * pool_count=100 [1x99, 100]    -> UOGM ~= 94.4732, range 99,
//                                     ptuogm ~= 1.0479 (SPREAD --
//                                     FURTHER ABSORBED from PTOGM
//                                     M_80's 1.0487 spread;
//                                     100-partner asymptote
//                                     100^(1/81) ~ 1.0585 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptuogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unoctogintic_mean == 0
//   * tight                ptuogm < 1.005
//   * spread               ptuogm in [1.005, 1.09)
//   * wide                 ptuogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptuogm_max /
// wide_ptuogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.417):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoginticMeanSection
// (P11.415) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unoctogintic-center
// after the P11.415 range-against-octogintic-center landing.

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
type PtuogmLabel =
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

// Bands on raw ptuogm (fixed cutoffs since unoctogintic_mean scales with
// cell counts and typical unoctogintic-center emissions land near 1-10
// for the P11.161 top-3 pool). Tight boundary HOLDS at P11.344
// PTQIQM's 1.005 -- MILD-OUTLIER at M_81 is 0.9260 (already well
// below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0292 (M_80) to 1.0288
// (M_81), 20-partner drops from 1.0382 to 1.0377, 30-partner drops
// from 1.0435 to 1.0429, 40-partner drops from 1.0473 to 1.0466,
// 50-partner drops from 1.0502 to 1.0495, 60-partner drops from
// 1.0527 to 1.0518, 70-partner drops from 1.0547 to 1.0539,
// 80-partner drops from 1.0564 to 1.0556, 85-partner drops from
// 1.0572 to 1.0564, 89-partner drops from 1.0578 to 1.0570 -- so
// pool_count >= 100 (100^(1/81) ~ 1.0585) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTOGM 1.0487 spread to PTUOGM 1.0479
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUOGM_MAX = 1.005;
const WIDE_PTUOGM_MIN = 1.09;

// PTUOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuogm_max: number;
  readonly wide_ptuogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanMap;
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

// Peak-to-unoctogintic-mean of a discrete distribution:
//   PTUOGM = (max - min) / unoctogintic_mean
// where unoctogintic_mean = ((sum x_i^81) / n)^(1/81). Returns null
// on empty, solo, and degenerate (zero unoctogintic_mean or non-finite
// eighty-first-power sum) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^81 = (x^8)^10 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * v
    eightyFirstSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(eightyFirstSum) || eightyFirstSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unoctogintic_mean: null,
    };
  }
  const unoctogintic_mean = Math.pow(eightyFirstSum / pool_count, 1 / 81);
  if (!Number.isFinite(unoctogintic_mean) || unoctogintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptuogm = range / unoctogintic_mean;
  const clamped = ptuogm < 0 ? 0 : ptuogm;
  return {
    pool_count,
    pool_cells,
    peak_to_unoctogintic_mean: roundTo(clamped, PTUOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unoctogintic_mean: partner.peak_to_unoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unoctogintic_mean: metric.peak_to_unoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnoctoginticMean {
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
    tight_ptuogm_max: TIGHT_PTUOGM_MAX,
    wide_ptuogm_min: WIDE_PTUOGM_MIN,
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

function labelForPtuogm(
  pool_count: number,
  pool_cells: number,
  ptuogm: number | null,
  tight_max: number,
  wide_min: number,
): PtuogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuogm === null) return "degenerate";
  if (ptuogm >= wide_min) return "wide";
  if (ptuogm < tight_max) return "tight";
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

function renderPtuogmCell(
  pool_count: number,
  pool_cells: number,
  ptuogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuogm(
    pool_count,
    pool_cells,
    ptuogm,
    tight_max,
    wide_min,
  );
  const ptuogmText = ptuogm === null ? "-" : ptuogm.toFixed(4);
  return `PTUOGM ${ptuogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuogm_max, wide_ptuogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unoctogintic_mean, tight_ptuogm_max, wide_ptuogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unoctogintic_mean, tight_ptuogm_max, wide_ptuogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuogm = (max - min) / unoctogintic_mean where unoctogintic_mean = ((sum x_i^81) / n)^(1/81). Reads the pool's total RANGE in units of its UNOCTOGINTIC (power-mean-of-order-81, M_81) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.414 PTOGM because raising to the EIGHTY-FIRST power lifts the anchor MORE than raising to the eightieth does. Unique DISPERSION-axis contribution extends the (harmonic..octogintic) power-mean DUODECEMSEPTUAGINTUPLET into a TREDECEMSEPTUAGINTUPLET with the M_81 unoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuogm approaches n^(1/81) so 10-partner pools cap near 1.0288, 20-partner near 1.0377, 30-partner near 1.0429, 40-partner near 1.0466, 50-partner near 1.0495, 60-partner near 1.0518, 70-partner near 1.0539, 80-partner near 1.0556, 85-partner near 1.0564 and 89-partner near 1.0570 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/81) ~= 1.0585) are required to escape into wide with a modest outlier. Composite regime labels: PTUOGM tight + PTOGM tight = MILD OUTLIER absorbed by unoctogintic ([1x9, 10] reads PTUOGM 0.9260 tight -- one tick above the uniform ramp's 0.9259 for the first time in the sequence); PTUOGM spread + PTOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUOGM 1.0185 spread); PTUOGM spread + PTOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_81 ([1x99, 100] reads 1.0479 spread after M_80's 1.0487 spread landing); PTUOGM tight + PTOGM tight = ISOLATED HIGH PARTNER continues absorption past M_80 into M_81 ([1, 100] reads 0.9985 tight after M_80's 0.9986 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unoctogintic_mean == 0 (guarded but unreachable), tight = ptuogm &lt; ${tight_ptuogm_max}, spread = ptuogm in [${tight_ptuogm_max}, ${wide_ptuogm_min}), wide = ptuogm &ge; ${wide_ptuogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
