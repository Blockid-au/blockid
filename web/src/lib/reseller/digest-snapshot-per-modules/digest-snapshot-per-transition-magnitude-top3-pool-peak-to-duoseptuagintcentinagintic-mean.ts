// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL
// PEAK-TO-DUOSEPTUAGINTCENTINAGINTIC-MEAN pure-lib (P11.598).
//
// WHOLE-POOL RANGE-AGAINST-DUOSEPTUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. M_172 = ((sum x_i^172)/n)^(1/172);
// ptdspcnm = (max - min) / M_172. Twenty-second step into the SIXTH DOZEN
// of the triple-digit power-mean family past M_171 PTUSPCNM. By the
// Power Mean inequality M_172 >= M_171, so ptdspcnm <= ptuspcnm for
// every non-flat pool with finite folds.
//
// OVERFLOW REGIME INHERITED from M_155: 100^172 = 10^344 exceeds
// Number.MAX_VALUE (~1.7976e308), so any pool containing a cell with
// value >= 100 folds to a non-finite hundredSeventySecondPowerSum and
// returns null (degenerate). Reference distributions extreme[1x9,100],
// twoPart[1,100] and pool100[1x99,100] remain degenerate at M_172.
//
// x^172 decomposition: x^128 * x^32 * x^8 * x^4 = p128 * p32 * oct * quad
// (128+32+8+4 rungs reuse the p128 rung shared with M_128..M_171).

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
type PtdspcnmLabel =
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

const TIGHT_PTDSPCNM_MAX = 1.005;
const WIDE_PTDSPCNM_MIN = 1.09;
const PTDSPCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duoseptuagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duoseptuagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdspcnm_max: number;
  readonly wide_ptdspcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanMap;
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
  peak_to_duoseptuagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_count === 1 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSeventySecondPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^172 = x^128 * x^32 * x^8 * x^4 = p128 * p32 * oct * quad
    hundredSeventySecondPowerSum += p128 * p32 * oct * quad;
  }
  if (
    !Number.isFinite(hundredSeventySecondPowerSum) ||
    hundredSeventySecondPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintcentinagintic_mean: null,
    };
  }
  const duoseptuagintcentinagintic_mean = Math.pow(
    hundredSeventySecondPowerSum / pool_count,
    1 / 172,
  );
  if (
    !Number.isFinite(duoseptuagintcentinagintic_mean) ||
    duoseptuagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdspcnm = range / duoseptuagintcentinagintic_mean;
  const clamped = ptdspcnm < 0 ? 0 : ptdspcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duoseptuagintcentinagintic_mean: roundTo(clamped, PTDSPCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duoseptuagintcentinagintic_mean:
      partner.peak_to_duoseptuagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duoseptuagintcentinagintic_mean:
      metric.peak_to_duoseptuagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMean {
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
    tight_ptdspcnm_max: TIGHT_PTDSPCNM_MAX,
    wide_ptdspcnm_min: WIDE_PTDSPCNM_MIN,
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

function labelForPtdspcnm(
  pool_count: number,
  pool_cells: number,
  ptdspcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdspcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdspcnm === null) return "degenerate";
  if (ptdspcnm >= wide_min) return "wide";
  if (ptdspcnm < tight_max) return "tight";
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

function renderPtdspcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdspcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdspcnm(pool_count, pool_cells, ptdspcnm, tight_max, wide_min);
  const ptdspcnmText = ptdspcnm === null ? "-" : ptdspcnm.toFixed(4);
  return `PTDSPCNM ${ptdspcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdspcnm_max, wide_ptdspcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdspcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duoseptuagintcentinagintic_mean, tight_ptdspcnm_max, wide_ptdspcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdspcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duoseptuagintcentinagintic_mean, tight_ptdspcnm_max, wide_ptdspcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOSEPTUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOSEPTUAGINTCENTINAGINTIC-CENTER scalar &mdash; ptdspcnm = (max - min) / duoseptuagintcentinagintic_mean where duoseptuagintcentinagintic_mean = ((sum x_i^172) / n)^(1/172). Twenty-second step into the SIXTH DOZEN of the triple-digit power-mean family past M_171 PTUSPCNM. OVERFLOW REGIME INHERITED from M_155: 100^172 exceeds Number.MAX_VALUE so any pool with a cell &ge; 100 folds to null (degenerate). Labels: solo = pool_count == 1, degenerate = pool_cells == 0 OR duoseptuagintcentinagintic_mean == 0 OR overflow, tight = ptdspcnm &lt; ${tight_ptdspcnm_max}, spread = ptdspcnm in [${tight_ptdspcnm_max}, ${wide_ptdspcnm_min}), wide = ptdspcnm &ge; ${wide_ptdspcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+).</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDSPCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDSPCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
