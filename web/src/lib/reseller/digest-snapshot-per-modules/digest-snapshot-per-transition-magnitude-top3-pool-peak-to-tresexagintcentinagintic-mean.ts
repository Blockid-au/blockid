// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL
// PEAK-TO-TRESEXAGINTCENTINAGINTIC-MEAN pure-lib (P11.580).
//
// WHOLE-POOL RANGE-AGAINST-TRESEXAGINTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. M_163 = ((sum x_i^163)/n)^(1/163);
// pttsxcnm = (max - min) / M_163. Thirteenth step into the SIXTH DOZEN
// of the triple-digit power-mean family past M_162 PTDSXCNM. By the
// Power Mean inequality M_163 >= M_162, so pttsxcnm <= ptdsxcnm for
// every non-flat pool with finite folds.
//
// OVERFLOW REGIME INHERITED from M_155: 100^163 = 10^326 exceeds
// Number.MAX_VALUE (~1.7976e308), so any pool containing a cell with
// value >= 100 folds to a non-finite hundredSixtyThirdPowerSum and
// returns null (degenerate). Reference distributions extreme[1x9,100],
// twoPart[1,100] and pool100[1x99,100] remain degenerate at M_163.
//
// x^163 decomposition: x^128 * x^32 * x^2 * x^1 = p128 * p32 * sq * v
// (128+32+2+1 rungs reuse the p128 rung shared with M_128..M_162).

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
type PttsxcnmLabel =
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

const TIGHT_PTTSXCNM_MAX = 1.005;
const WIDE_PTTSXCNM_MIN = 1.09;
const PTTSXCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresexagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresexagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttsxcnm_max: number;
  readonly wide_pttsxcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanMap;
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

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresexagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_count === 1 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSixtyThirdPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^163 = x^128 * x^32 * x^2 * x^1 = p128 * p32 * sq * v
    hundredSixtyThirdPowerSum += p128 * p32 * sq * v;
  }
  if (
    !Number.isFinite(hundredSixtyThirdPowerSum) ||
    hundredSixtyThirdPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintcentinagintic_mean: null,
    };
  }
  const tresexagintcentinagintic_mean = Math.pow(
    hundredSixtyThirdPowerSum / pool_count,
    1 / 163,
  );
  if (
    !Number.isFinite(tresexagintcentinagintic_mean) ||
    tresexagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresexagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttsxcnm = range / tresexagintcentinagintic_mean;
  const clamped = pttsxcnm < 0 ? 0 : pttsxcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresexagintcentinagintic_mean: roundTo(clamped, PTTSXCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresexagintcentinagintic_mean:
      partner.peak_to_tresexagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresexagintcentinagintic_mean:
      metric.peak_to_tresexagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMean {
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
    tight_pttsxcnm_max: TIGHT_PTTSXCNM_MAX,
    wide_pttsxcnm_min: WIDE_PTTSXCNM_MIN,
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

function labelForPttsxcnm(
  pool_count: number,
  pool_cells: number,
  pttsxcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttsxcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttsxcnm === null) return "degenerate";
  if (pttsxcnm >= wide_min) return "wide";
  if (pttsxcnm < tight_max) return "tight";
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

function renderPttsxcnmCell(
  pool_count: number,
  pool_cells: number,
  pttsxcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttsxcnm(pool_count, pool_cells, pttsxcnm, tight_max, wide_min);
  const pttsxcnmText = pttsxcnm === null ? "-" : pttsxcnm.toFixed(4);
  return `PTTSXCNM ${pttsxcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresexagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttsxcnm_max, wide_pttsxcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttsxcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresexagintcentinagintic_mean, tight_pttsxcnm_max, wide_pttsxcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttsxcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresexagintcentinagintic_mean, tight_pttsxcnm_max, wide_pttsxcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESEXAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESEXAGINTCENTINAGINTIC-CENTER scalar &mdash; pttsxcnm = (max - min) / tresexagintcentinagintic_mean where tresexagintcentinagintic_mean = ((sum x_i^163) / n)^(1/163). Thirteenth step into the SIXTH DOZEN of the triple-digit power-mean family past M_162 PTDSXCNM. OVERFLOW REGIME INHERITED from M_155: 100^163 exceeds Number.MAX_VALUE so any pool with a cell &ge; 100 folds to null (degenerate). Labels: solo = pool_count == 1, degenerate = pool_cells == 0 OR tresexagintcentinagintic_mean == 0 OR overflow, tight = pttsxcnm &lt; ${tight_pttsxcnm_max}, spread = pttsxcnm in [${tight_pttsxcnm_max}, ${wide_pttsxcnm_min}), wide = pttsxcnm &ge; ${wide_pttsxcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+).</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTSXCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTSXCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
