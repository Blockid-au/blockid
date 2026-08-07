// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MEAN ABSOLUTE
// DEVIATION pure-lib (P11.199).
//
// ADDITIVE dispersion scalar over the P11.161 pool that averages the
// absolute deviation of every pool cell from the arithmetic mean:
//
//   mad = mean(|xi - mean(x)|)
//       = (1 / pool_count) * SUM_i |cell_i - mean_cells|
//
// Companion to two existing dispersion surfaces:
//   • P11.175 CV        = std_cells / mean_cells   (MULTIPLICATIVE)
//   • P11.181 range     = max_cells - min_cells    (ADDITIVE, ENDPOINT-ONLY)
// MAD is the ADDITIVE, WHOLE-POOL analog: like CV it consumes every
// pool cell (not just the endpoint pair), and like range it lives on
// the additive axis in raw cell-count units. It answers a genuinely
// different question from both siblings: "on average, how far does a
// pool cell sit from the pool mean?" — a robust one-number summary of
// dispersion that is proportional to spread but insensitive to the
// axis (additive) and does not privilege endpoints (unlike range).
//
// The additive whole-pool fold produces a genuinely different reading
// from every existing pool-shape scalar because:
//   • CV normalises by the mean, so a pool [10,10,10] and [1,1,1]
//     read CV 0 both — dimensionless. MAD reads 0 both too, but two
//     pools [3,1] and [30,10] that both read CV 0.5 differ under MAD
//     (1 vs 10) — MAD names magnitude in the same units the digest
//     reader is already reading (raw hot-cell counts).
//   • Range reads only the endpoint pair, so pool [10,5,5,5,5,5,1]
//     and [10,10,10,5,1,1,1] both read range 9 but the interior
//     shape is completely different. MAD folds the interior: pool
//     [10,5,5,5,5,5,1] reads MAD ~1.71 (most cells near the median),
//     pool [10,10,10,5,1,1,1] reads MAD ~3.43 (mass split into two
//     clumps at the endpoints).
//   • Mean-median gap (P11.197) folds only the two center-of-mass
//     summaries into ONE displacement; MAD folds all pool cells into
//     the same additive axis. Pool [10,10,1] where P11.197 reads
//     gap 3 (extreme mean-vs-median displacement) reads MAD 4 under
//     this surface (extreme cell-vs-mean displacement on average) —
//     both extremes but on different primitives.
//
// Well-defined for every non-empty pool:
//   • pool_count 0            → mad null (empty pool).
//   • pool_count 1            → mad = |value - value| = 0 by definition
//                               (solo — single cell coincides with
//                               its own mean; no notion of dispersion).
//   • pool_count >= 2         → mad = mean(|cell_i - mean_cells|) in
//                               raw cell-count units; rounded to 4
//                               decimals. Note that unlike P11.197
//                               where pool_count 2 collapses skewness
//                               distinction (median coincides with
//                               mean), MAD is well-defined for
//                               pool_count 2: pool [3,1] reads mean 2,
//                               MAD (1+1)/2 = 1 — a meaningful additive
//                               dispersion read on a 2-slot pool that
//                               is fully spread.
//
// Cutoffs use plain-language additive-dispersion bands. Anchored to
// what small pools naturally emit under the mean-absolute-deviation
// fold:
//   • pool [1,1,1]     → mad 0     (tight; flat pool)
//   • pool [4,3,2]     → mad 2/3   (spread — mean 3, deviations 1/0/1)
//   • pool [3,1]       → mad 1     (spread — 2-slot fully-spread pool)
//   • pool [3,2,1]     → mad 2/3   (spread — mean 2, deviations 1/0/1)
//   • pool [3,1,1]     → mad 8/9   (spread — mean 5/3, deviations
//                                   4/3, 2/3, 2/3)
//   • pool [5,3,2]     → mad 10/9  (spread — mean 10/3, deviations
//                                   5/3, 1/3, 4/3)
//   • pool [10,1,1]    → mad 4     (wide — mean 4, deviations 6/3/3)
//   • pool [10,10,1]   → mad 4     (wide — mean 7, deviations 3/3/6)
//   • pool [4,3,2,1]   → mad 1     (spread — mean 2.5, deviations
//                                   1.5/0.5/0.5/1.5)
// Cutoffs 0.5 / 2.0 chosen so pool [4,3,2] reads spread (mad 0.667 —
// noticeable dispersion but not extreme) and pool [10,1,1] reads wide
// (mad 4 — extreme dispersion, mass concentrated in a single leader).
//   • tight   (mad < 0.5)         — cells cluster within half a unit
//                                    of the mean on average; nearly
//                                    flat pool.
//   • spread  (mad in [0.5, 2.0)) — cells sit 0.5-2 units from the
//                                    mean on average; noticeable
//                                    dispersion but no dominant
//                                    outlier.
//   • wide    (mad >= 2.0)        — cells sit 2+ units from the mean
//                                    on average; extreme dispersion,
//                                    typically driven by a dominant
//                                    leader or fat tail.
// Both cutoffs are exposed on the envelope as tight_mad_max /
// wide_mad_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows an INEQUALITY framing (HIGH mad = MORE
// dispersion = MORE inequality; matches P11.163/P11.169/P11.171/
// P11.173/P11.175 SEXTET + P11.181 range + P11.185/P11.187/P11.191/
// P11.193 ratio-grid + P11.197 mean-median gap inequality framing;
// inverts P11.177 H_norm / P11.179 / P11.183 / P11.189 / P11.195
// evenness framing). Chosen because the mean absolute deviation is a
// magnitude read: "how far cells sit from the mean on average" is
// naturally larger when the pool is more dispersed, so "high value =
// more dispersed" is the direct reading.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — MAD is a
// pool-wide fold that consumes every cell.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.200):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection
// (P11.197) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1
// RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN
// ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION (this module) →
// per-pair hot-cells GRANULAR (P11.139). The mean-median gap and the
// mean absolute deviation stay adjacent because both are ADDITIVE
// robust-stats folds on the mean, matching how the multiplicative
// SEXTET (HHI + GINI + THEIL + ATKINSON + CV + H_norm) stays
// contiguous by shared multiplicative framing.

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
type MadLabel = "empty" | "solo" | "tight" | "spread" | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language additive-dispersion bands anchored to what small
// pools emit under the mean-absolute-deviation fold. Pool [1,1,1]
// mad 0 (tight); pool [4,3,2] mad 0.667 (spread — mean 3, deviations
// 1/0/1); pool [10,1,1] mad 4 (wide — mean 4, deviations 6/3/3).
const TIGHT_MAD_MAX = 0.5;
const WIDE_MAD_MIN = 2.0;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const MAD_DECIMALS = 4;

// Threshold below which a pool has no meaningful dispersion distinction
// (single cell coincides with its own mean by definition).
const SOLO_MAX_POOL_COUNT = 1;

export interface PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_mean_cells: number | null;
  readonly partner_mad: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_mean_cells: number | null;
  readonly metric_mad: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBands {
  readonly small: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBand;
  readonly large: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBand;
}

export interface PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBands;
}

export interface PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_mad_max: number;
  readonly wide_mad_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationMap;
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
  mean_cells: number | null;
  mad: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      mean_cells: null,
      mad: null,
    };
  }
  const mean_cells = pool_cells / pool_count;
  // For pool_count <= SOLO_MAX_POOL_COUNT the single cell coincides
  // with its own mean by definition. Pin mad 0 and let the label
  // render as "solo" so downstream readers know the value is
  // structural, not a computed tight verdict. For pool_count >= 2 the
  // MAD is a genuine additive dispersion read.
  const mad =
    pool_count <= SOLO_MAX_POOL_COUNT
      ? 0
      : roundTo(
          values.reduce((acc, v) => acc + Math.abs(v - mean_cells), 0) /
            pool_count,
          MAD_DECIMALS,
        );
  return {
    pool_count,
    pool_cells,
    mean_cells: roundTo(mean_cells, MAD_DECIMALS),
    mad,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_mean_cells: partner.mean_cells,
    partner_mad: partner.mad,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_mean_cells: metric.mean_cells,
    metric_mad: metric.mad,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation {
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
    tight_mad_max: TIGHT_MAD_MAX,
    wide_mad_min: WIDE_MAD_MIN,
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

function labelForMad(
  pool_count: number,
  mad: number | null,
  tight_mad_max: number,
  wide_mad_min: number,
): MadLabel {
  if (pool_count === 0 || mad === null) return "empty";
  // pool_count <= SOLO_MAX_POOL_COUNT collapses the dispersion
  // distinction (single cell coincides with its own mean). Surface
  // it as "solo" so downstream readers know the mad=0 is structural,
  // not a computed tight verdict.
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (mad >= wide_mad_min) return "wide";
  if (mad < tight_mad_max) return "tight";
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

function renderMadCell(
  pool_count: number,
  pool_cells: number,
  mean_cells: number | null,
  mad: number | null,
  tight_mad_max: number,
  wide_mad_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForMad(pool_count, mad, tight_mad_max, wide_mad_min);
  const madText = mad === null ? "-" : mad.toFixed(2);
  const meanText = mean_cells === null ? "-" : mean_cells.toFixed(2);
  return `mad ${madText} (mean ${meanText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_mad_max, wide_mad_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMadCell(band.partner_pool_count, band.partner_pool_cells, band.partner_mean_cells, band.partner_mad, tight_mad_max, wide_mad_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMadCell(band.metric_pool_count, band.metric_pool_cells, band.metric_mean_cells, band.metric_mad, tight_mad_max, wide_mad_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MEAN ABSOLUTE DEVIATION across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">ADDITIVE robust-stats dispersion scalar over the P11.161 pool &mdash; averages the absolute deviation of every pool cell from the arithmetic mean into ONE non-negative dispersion magnitude: mad = mean(|cell_i - mean_cells|). Additive whole-pool companion to two existing dispersion siblings: P11.175 CV (std/mean, MULTIPLICATIVE whole-pool) and P11.181 range (max - min, ADDITIVE endpoint-only). MAD is the ADDITIVE + WHOLE-POOL corner of the dispersion grid &mdash; it consumes every pool cell (unlike range) and stays on the additive axis in raw cell-count units (unlike CV). Two pools [3,1] and [30,10] that both read CV 0.5 differ under MAD (1 vs 10). Pool [10,10,10,5,1,1,1] and [10,5,5,5,5,5,1] that both read range 9 differ under MAD (~3.43 vs ~1.71) &mdash; MAD folds the interior shape while range reads only the endpoints. Values in [0, &infin;) in raw cell-count units. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (single cell coincides with its own mean by definition), tight = mad &lt; ${tight_mad_max} (cells within half a unit of the mean on average; nearly flat pool), spread = mad in [${tight_mad_max}, ${wide_mad_min}) (cells 0.5-2 units from the mean on average; noticeable dispersion), wide = mad &ge; ${wide_mad_min} (cells 2+ units from the mean on average; extreme dispersion &mdash; typically dominant-leader or fat-tail). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + mad null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner mad</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI mad</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
