// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL INTERQUARTILE
// RANGE pure-lib (P11.207).
//
// ADDITIVE robust-stats INTERIOR-MASS dispersion scalar over the
// P11.161 pool that names the width of the pool's middle 50%:
//
//   iqr = Q3 - Q1
//     where Q1 = 25th percentile (Tukey exclusive hinge)
//           Q3 = 75th percentile (Tukey exclusive hinge)
//
// Sits on the ADDITIVE + INTERIOR-MASS corner of the dispersion grid —
// a fresh axis alongside the four existing dispersion siblings:
//   • P11.175 CV        = std_cells / mean_cells       (MULTIPLICATIVE
//                                                       whole-pool)
//   • P11.181 range     = max_cells - min_cells        (ADDITIVE
//                                                       endpoint-only)
//   • P11.199 MAD       = mean(|xi - mean(x)|)         (ADDITIVE
//                                                       whole-pool,
//                                                       MEAN-anchored)
//   • P11.201 MADm      = mean(|xi - median(x)|)       (ADDITIVE
//                                                       whole-pool,
//                                                       MEDIAN-anchored)
// IQR is the ADDITIVE INTERIOR-MASS analog: it ignores both endpoints
// (unlike range which uses only them, and unlike MAD/MADm which
// average over ALL cells) and reports the raw cell-count spread of the
// central 50%. This makes it the most outlier-robust dispersion read
// in the family — a single-outlier pool like [10,1,1,1,1,1] (n=6)
// reads range 9, MAD ~2.5, MADm ~1.5, but IQR 0 (both hinges land on
// the interior cluster). The (range, IQR) pair sandwiches the
// endpoint-only and interior-only extremes, and MAD / MADm live at
// the whole-pool middle ground.
//
// Uses TUKEY EXCLUSIVE hinges (Method 1 in every intro-stats text):
// sort the pool, exclude the middle value on odd n, then take the
// median of each half. Matches the "hinge" convention Tukey introduced
// in Exploratory Data Analysis (1977) and the R quantile type=1
// default. Chosen over the linear-interpolation convention (R type=7,
// Excel PERCENTILE) because the pool values are integer cell counts —
// no fractional-quantile signal to preserve — and Tukey's method is
// the standard classroom presentation the reader will recognise.
//
// Well-defined for every pool with pool_count >= 4 (the natural
// threshold for a meaningful middle 50% split):
//   • pool_count 0            → iqr null, q1_cells + q3_cells null
//                               (empty pool).
//   • pool_count 1..3         → iqr null, q1_cells + q3_cells null.
//                               Distinct "small_pool" label so the
//                               reader knows the value is
//                               structurally-undefined rather than a
//                               computed tight verdict — quartiles
//                               don't have a stable meaning below n=4
//                               and would collapse to the P11.181
//                               range surface anyway (Tukey exclusive
//                               on n=2 gives Q1=x0, Q3=x1 which is
//                               range in raw cell-count units, and
//                               n=3 gives Q1=x0, Q3=x2 which is range
//                               as well — redundant surface).
//   • pool_count >= 4         → iqr = Q3 - Q1 in raw cell-count units;
//                               rounded to 4 decimals.
//
// Cutoffs use plain-language additive-dispersion bands. Same 0.5 / 2.0
// edges as P11.199 MAD and P11.201 MADm so the vocabulary transfers
// cleanly across every ADDITIVE dispersion surface — a reader who
// scans MAD, MADm, and IQR uses the same numeric mental anchor for
// "tight" vs "wide" and only the anchor definition differs:
//   • pool [1,1,1,1]         → iqr 0     (tight; flat pool)
//   • pool [4,3,2,1]         → iqr 2     (spread — Q1 1.5, Q3 3.5)
//   • pool [10,1,1,1]        → iqr 4.5   (wide — Q1 1, Q3 5.5)
//   • pool [5,4,3,2,1]       → iqr 3     (wide — n=5, exclude middle
//                                          3, Q1 1.5, Q3 4.5)
//   • pool [6,5,4,3,2,1]     → iqr 3     (wide — Q1 2, Q3 5)
//   • pool [10,1,1,1,1,1]    → iqr 0     (tight — outlier tucked into
//                                          the upper half's max; Q3
//                                          median of [1,1,10] = 1;
//                                          classic IQR robustness)
//   • pool [10,10,1,1,1,1]   → iqr 9     (wide — Q1 1, Q3 10; two
//                                          outliers cross the hinge
//                                          boundary and stretch the
//                                          middle 50%)
// Both cutoffs are exposed on the envelope as tight_iqr_max /
// wide_iqr_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same INEQUALITY framing as MAD /
// MADm / range (HIGH iqr = MORE interior dispersion). The choice to
// report the raw Q3 - Q1 rather than the interquartile RATIO
// (Q3 / Q1) is picked because raw cell-count units keep the IQR
// magnitude directly comparable to MAD / MADm / range values in the
// same digest row — a reader can scan the four ADDITIVE surfaces
// side by side and compare magnitudes without unit conversion.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — IQR is a pool-wide fold that consumes every cell to compute the
// two hinges.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.208):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolExcessKurtosisSection
// (P11.205) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177)
// → TOP-1 SHARE (P11.165) → TOP-2 COMBINED SHARE (P11.167) →
// BOTTOM-1 SHARE (P11.179) → RANGE (P11.181) → BOTTOM-2 COMBINED
// SHARE (P11.183) → TOP1/BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2
// RATIO (P11.187) → MID-MASS SHARE (P11.189) → TOP1/BOTTOM2 RATIO
// (P11.191) → TOP2/BOTTOM1 RATIO (P11.193) → MEDIAN/MEAN RATIO
// (P11.195) → MEAN-MEDIAN ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE
// DEVIATION (P11.199) → MEDIAN ABSOLUTE DEVIATION (P11.201) →
// SKEWNESS (P11.203) → EXCESS KURTOSIS (P11.205) → IQR (this module)
// → per-pair hot-cells GRANULAR (P11.139). IQR sits IMMEDIATELY
// BELOW the higher-moment (g1, g2) pair because it closes the
// dispersion axis with the outlier-robust interior-mass read after
// the SIGNED asymmetry + TAIL-HEAVINESS reads have named the pool's
// shape — the reader gets endpoint-only (range), whole-pool
// (MAD/MADm), interior-only (IQR) additive dispersion surfaces
// alongside the multiplicative CV, giving a complete dispersion
// picture before the per-pair granular table.

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
type IqrLabel =
  | "empty"
  | "small_pool"
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

// Plain-language additive-dispersion bands. Same 0.5 / 2.0 edges as
// P11.199 MAD and P11.201 MADm so the vocabulary transfers cleanly
// across every ADDITIVE dispersion surface.
const TIGHT_IQR_MAX = 0.5;
const WIDE_IQR_MIN = 2.0;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const IQR_DECIMALS = 4;

// Threshold below which the middle 50% has no meaningful spread — for
// pool_count in [1, 3] Tukey exclusive hinges collapse to endpoints
// which duplicates the P11.181 range surface. Bumped to 4 so the IQR
// surface is a distinct interior-mass read rather than a range clone.
const MIN_POOL_COUNT_FOR_IQR = 4;

export interface PerTransitionMagnitudeTop3PoolIqrBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_q1_cells: number | null;
  readonly partner_q3_cells: number | null;
  readonly partner_iqr: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_q1_cells: number | null;
  readonly metric_q3_cells: number | null;
  readonly metric_iqr: number | null;
}

export interface PerTransitionMagnitudeTop3PoolIqrBands {
  readonly small: PerTransitionMagnitudeTop3PoolIqrBand;
  readonly medium: PerTransitionMagnitudeTop3PoolIqrBand;
  readonly large: PerTransitionMagnitudeTop3PoolIqrBand;
}

export interface PerTransitionMagnitudeTop3PoolIqrEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolIqrBands;
}

export interface PerTransitionMagnitudeTop3PoolIqrMap {
  readonly improved: PerTransitionMagnitudeTop3PoolIqrEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolIqrEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolIqrEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolIqrEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolIqr {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_iqr: number;
  readonly tight_iqr_max: number;
  readonly wide_iqr_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolIqrMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n. Same
// convention as P11.195 median/mean ratio + P11.197 mean-median
// absolute gap + P11.201 MADm so the median definition is shared
// across every median-consuming sibling.
function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1/Q3 hinges: for odd n exclude the central value
// then take the median of each half; for even n split at the midpoint
// and take the median of each half. Standard "Method 1" from every
// intro-stats text (also matches R quantile type=1 default).
function tukeyHinges(sorted: number[]): { q1: number; q3: number } {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  const upper = n % 2 === 1 ? sorted.slice(half + 1) : sorted.slice(half);
  return {
    q1: medianOfSorted(lower),
    q3: medianOfSorted(upper),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  q1_cells: number | null;
  q3_cells: number | null;
  iqr: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_IQR || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      q1_cells: null,
      q3_cells: null,
      iqr: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { q1, q3 } = tukeyHinges(sorted);
  return {
    pool_count,
    pool_cells,
    q1_cells: roundTo(q1, IQR_DECIMALS),
    q3_cells: roundTo(q3, IQR_DECIMALS),
    iqr: roundTo(q3 - q1, IQR_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolIqrBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_q1_cells: partner.q1_cells,
    partner_q3_cells: partner.q3_cells,
    partner_iqr: partner.iqr,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_q1_cells: metric.q1_cells,
    metric_q3_cells: metric.q3_cells,
    metric_iqr: metric.iqr,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolIqrEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqr(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolIqr {
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
    min_pool_count_for_iqr: MIN_POOL_COUNT_FOR_IQR,
    tight_iqr_max: TIGHT_IQR_MAX,
    wide_iqr_min: WIDE_IQR_MIN,
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

function labelForIqr(
  pool_count: number,
  iqr: number | null,
  min_pool_count_for_iqr: number,
  tight_iqr_max: number,
  wide_iqr_min: number,
): IqrLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_iqr || iqr === null) return "small_pool";
  if (iqr >= wide_iqr_min) return "wide";
  if (iqr < tight_iqr_max) return "tight";
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

function renderIqrCell(
  pool_count: number,
  pool_cells: number,
  q1_cells: number | null,
  q3_cells: number | null,
  iqr: number | null,
  min_pool_count_for_iqr: number,
  tight_iqr_max: number,
  wide_iqr_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForIqr(
    pool_count,
    iqr,
    min_pool_count_for_iqr,
    tight_iqr_max,
    wide_iqr_min,
  );
  const iqrText = iqr === null ? "-" : iqr.toFixed(2);
  const q1Text = q1_cells === null ? "-" : q1_cells.toFixed(2);
  const q3Text = q3_cells === null ? "-" : q3_cells.toFixed(2);
  return `iqr ${iqrText} (Q1 ${q1Text}, Q3 ${q3Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolIqr,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { min_pool_count_for_iqr, tight_iqr_max, wide_iqr_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIqrCell(band.partner_pool_count, band.partner_pool_cells, band.partner_q1_cells, band.partner_q3_cells, band.partner_iqr, min_pool_count_for_iqr, tight_iqr_max, wide_iqr_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIqrCell(band.metric_pool_count, band.metric_pool_cells, band.metric_q1_cells, band.metric_q3_cells, band.metric_iqr, min_pool_count_for_iqr, tight_iqr_max, wide_iqr_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool INTERQUARTILE RANGE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">ADDITIVE robust-stats INTERIOR-MASS dispersion scalar over the P11.161 pool &mdash; Tukey exclusive hinges name the width of the pool's middle 50% into ONE non-negative magnitude in raw cell-count units: iqr = Q3 - Q1. Outlier-robust cousin of P11.181 range (endpoint-only), P11.199 MAD (whole-pool, mean-anchored), and P11.201 MADm (whole-pool, median-anchored). Values in [0, &infin;) in raw cell-count units. Labels: small_pool = pool_count &lt; ${min_pool_count_for_iqr} (Tukey exclusive hinges collapse to endpoints below n=4 which duplicates the P11.181 range surface; iqr null structurally), tight = iqr &lt; ${tight_iqr_max} (middle 50% within half a cell; near-flat interior), spread = iqr in [${tight_iqr_max}, ${wide_iqr_min}) (middle 50% spans 0.5-2 cells; noticeable interior dispersion), wide = iqr &ge; ${wide_iqr_min} (middle 50% spans 2+ cells; extreme interior dispersion). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + iqr null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner iqr</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI iqr</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
