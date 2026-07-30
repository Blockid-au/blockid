// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MEDIAN ABSOLUTE
// DEVIATION pure-lib (P11.201).
//
// ADDITIVE robust-stats dispersion scalar over the P11.161 pool that
// averages the absolute deviation of every pool cell from the MEDIAN:
//
//   madm = mean(|xi - median(x)|)
//
// Robust cousin of the P11.199 MAD-from-mean. Both live at the ADDITIVE
// + WHOLE-POOL corner of the dispersion grid, both fold every pool
// cell into ONE non-negative magnitude in raw cell-count units, and
// both use the solo / tight / spread / wide inequality vocabulary with
// the same 0.5 / 2.0 band cutoffs. They differ ONLY in the anchor:
//   • P11.199 MAD anchors on the ARITHMETIC MEAN — pulled by outliers
//     into the tail so a single leader inflates the reading (pool
//     [10,1,1] reads mean 4, MAD 4).
//   • P11.201 MADm anchors on the MEDIAN — robust to single-outlier
//     influence so the same [10,1,1] reads median 1, MADm 3 (still
//     wide, but a smaller magnitude than MAD).
// Two pools [10,1,1] and [10,10,1] that both read MAD 4 differ under
// MADm (3 vs 3 — same because MADm is symmetric under reflection
// through the median, and both have median-to-outlier distance 9 on
// one side and 0 on the other), while pools like [5,4,1,1,1] read
// MAD 1.6 vs MADm 1 (interior cluster + one outlier — the median
// tracks the cluster, the mean drifts toward the outlier).
//
// Companion to two existing dispersion siblings and one mean-based
// twin:
//   • P11.175 CV        = std_cells / mean_cells    (MULTIPLICATIVE
//                                                    whole-pool)
//   • P11.181 range     = max_cells - min_cells     (ADDITIVE
//                                                    endpoint-only)
//   • P11.199 MAD       = mean(|xi - mean(x)|)      (ADDITIVE
//                                                    whole-pool,
//                                                    MEAN-anchored)
// MADm is the ROBUST additive whole-pool analog: like MAD it stays
// on the additive axis and folds every cell, but the median anchor
// makes it resistant to a single outlier flipping the label.
//
// Well-defined for every non-empty pool:
//   • pool_count 0            → madm null (empty pool).
//   • pool_count 1            → madm = 0 by definition (solo — single
//                               cell coincides with its own median).
//   • pool_count >= 2         → madm = mean(|cell_i - median_cells|)
//                               in raw cell-count units; rounded to 4
//                               decimals. Same well-defined behaviour
//                               as MAD on pool_count 2: pool [3,1]
//                               reads median 2, MADm (1+1)/2 = 1.
//
// Median convention: for even-n pools use the arithmetic midpoint of
// the two central order statistics — matches the P11.195 median-mean
// ratio and P11.197 mean-median absolute gap conventions used by every
// median-consuming sibling.
//
// Cutoffs use plain-language additive-dispersion bands. Same 0.5 / 2.0
// edges as P11.199 MAD so the vocabulary transfers cleanly between the
// mean-anchored and median-anchored surfaces:
//   • pool [1,1,1]     → madm 0     (tight; flat pool)
//   • pool [4,3,2]     → madm 2/3   (spread — median 3, deviations
//                                    1/0/1)
//   • pool [3,1]       → madm 1     (spread — 2-slot pool, median 2)
//   • pool [3,2,1]     → madm 2/3   (spread — median 2, deviations
//                                    1/0/1)
//   • pool [3,1,1]     → madm 2/3   (spread — median 1, deviations
//                                    2/0/0)
//   • pool [5,3,2]     → madm 1     (spread — median 3, deviations
//                                    2/0/1)
//   • pool [10,1,1]    → madm 3     (wide — median 1, deviations
//                                    9/0/0)
//   • pool [10,10,1]   → madm 3     (wide — median 10, deviations
//                                    0/0/9)
//   • pool [4,3,2,1]   → madm 1     (spread — median 2.5, deviations
//                                    1.5/0.5/0.5/1.5)
// Both cutoffs are exposed on the envelope as tight_madm_max /
// wide_madm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same INEQUALITY framing as MAD
// (HIGH madm = MORE dispersion). Chosen because the median absolute
// deviation is a magnitude read: "how far cells sit from the median
// on average" is naturally larger when the pool is more dispersed.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — MADm is a
// pool-wide fold that consumes every cell.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.202):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection
// (P11.199) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1
// RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN
// ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION (P11.199) →
// MEDIAN ABSOLUTE DEVIATION (this module) → per-pair hot-cells
// GRANULAR (P11.139). MAD (P11.199) and MADm (this module) stay
// adjacent because both are ADDITIVE whole-pool folds; the anchor
// (mean vs median) is the differentiator.

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
type MadmLabel = "empty" | "solo" | "tight" | "spread" | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language additive-dispersion bands anchored to what small
// pools emit under the median-absolute-deviation fold. Same edges as
// P11.199 MAD (0.5 / 2.0) so the vocabulary transfers cleanly between
// the mean-anchored and median-anchored surfaces.
const TIGHT_MADM_MAX = 0.5;
const WIDE_MADM_MIN = 2.0;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const MADM_DECIMALS = 4;

// Threshold below which a pool has no meaningful dispersion distinction
// (single cell coincides with its own median by definition).
const SOLO_MAX_POOL_COUNT = 1;

export interface PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_median_cells: number | null;
  readonly partner_madm: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_median_cells: number | null;
  readonly metric_madm: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBands {
  readonly small: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBand;
  readonly large: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBand;
}

export interface PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBands;
}

export interface PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_madm_max: number;
  readonly wide_madm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationMap;
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

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  median_cells: number | null;
  madm: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      median_cells: null,
      madm: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median_cells = medianOf(sorted);
  // For pool_count <= SOLO_MAX_POOL_COUNT the single cell coincides
  // with its own median by definition. Pin madm 0 and let the label
  // render as "solo" so downstream readers know the value is
  // structural, not a computed tight verdict.
  const madm =
    pool_count <= SOLO_MAX_POOL_COUNT
      ? 0
      : roundTo(
          values.reduce((acc, v) => acc + Math.abs(v - median_cells), 0) /
            pool_count,
          MADM_DECIMALS,
        );
  return {
    pool_count,
    pool_cells,
    median_cells: roundTo(median_cells, MADM_DECIMALS),
    madm,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_median_cells: partner.median_cells,
    partner_madm: partner.madm,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_median_cells: metric.median_cells,
    metric_madm: metric.madm,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation {
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
    tight_madm_max: TIGHT_MADM_MAX,
    wide_madm_min: WIDE_MADM_MIN,
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

function labelForMadm(
  pool_count: number,
  madm: number | null,
  tight_madm_max: number,
  wide_madm_min: number,
): MadmLabel {
  if (pool_count === 0 || madm === null) return "empty";
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (madm >= wide_madm_min) return "wide";
  if (madm < tight_madm_max) return "tight";
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

function renderMadmCell(
  pool_count: number,
  pool_cells: number,
  median_cells: number | null,
  madm: number | null,
  tight_madm_max: number,
  wide_madm_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForMadm(pool_count, madm, tight_madm_max, wide_madm_min);
  const madmText = madm === null ? "-" : madm.toFixed(2);
  const medianText = median_cells === null ? "-" : median_cells.toFixed(2);
  return `madm ${madmText} (median ${medianText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_madm_max, wide_madm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMadmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_median_cells, band.partner_madm, tight_madm_max, wide_madm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMadmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_median_cells, band.metric_madm, tight_madm_max, wide_madm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MEDIAN ABSOLUTE DEVIATION across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">ADDITIVE robust-stats dispersion scalar over the P11.161 pool &mdash; averages the absolute deviation of every pool cell from the MEDIAN into ONE non-negative dispersion magnitude: madm = mean(|cell_i - median_cells|). Robust cousin of P11.199 MAD (mean-anchored); both live at the ADDITIVE + WHOLE-POOL corner of the dispersion grid and share the same 0.5 / 2.0 band cutoffs, but MADm anchors on the MEDIAN so it is resistant to a single outlier flipping the label. Companion to two additional dispersion siblings: P11.175 CV (std/mean, MULTIPLICATIVE whole-pool) and P11.181 range (max - min, ADDITIVE endpoint-only). Values in [0, &infin;) in raw cell-count units. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (single cell coincides with its own median by definition), tight = madm &lt; ${tight_madm_max} (cells within half a unit of the median on average; nearly flat pool), spread = madm in [${tight_madm_max}, ${wide_madm_min}) (cells 0.5-2 units from the median on average; noticeable dispersion), wide = madm &ge; ${wide_madm_min} (cells 2+ units from the median on average; extreme dispersion). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + madm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner madm</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI madm</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
