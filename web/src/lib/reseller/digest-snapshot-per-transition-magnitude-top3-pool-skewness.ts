// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL SKEWNESS pure-lib
// (P11.203).
//
// Fisher-Pearson standardised third-moment coefficient over the P11.161
// pool that folds every pool cell into ONE signed asymmetry scalar:
//
//   g1 = m3 / m2^(3/2)
//     where m2 = (1/n) * sum((xi - mean)^2)
//           m3 = (1/n) * sum((xi - mean)^3)
//
// Sits on a NEW axis of the pool-shape family: every P11.163..P11.202
// surface measures SIZE (P11.161), CONCENTRATION (HHI/GINI/THEIL/
// ATKINSON/H_norm/top-share/bottom-share family) or DISPERSION (CV/
// range/MAD/MADm/median-mean-ratio/mean-median-absolute-gap). None
// measures ASYMMETRY directly — the P11.195 median/mean ratio and
// P11.197 mean-median absolute gap encode it INDIRECTLY as the
// difference (or ratio) between two centre-of-mass summaries; the
// P11.199/P11.201 MAD-vs-MADm pair encodes it INDIRECTLY as the
// magnitude gap between anchor-swap dispersion reads. Skewness is the
// DIRECT anchor-free measurement and complements every existing
// asymmetry proxy by giving readers a single SIGNED scalar: positive =
// right-tail heavy (leader inflates the mean above the median),
// negative = left-tail heavy (laggard drags the mean below the median),
// near zero = symmetric.
//
// Well-defined for every pool with pool_count >= 2 and nonzero
// variance:
//   • pool_count 0            → skewness null (empty pool).
//   • pool_count 1            → skewness 0 by definition (solo — a
//                               single cell is trivially symmetric
//                               around itself).
//   • pool_count >= 2 and     → skewness 0 by definition (flat pool —
//     variance 0                every cell equals the mean; no
//                               asymmetry axis to measure). Pinned
//                               rather than division-by-zero.
//   • pool_count >= 2 and     → g1 as above; rounded to 4 decimals.
//     variance > 0              Range [-inf, +inf) but small pools
//                               (n=3) rarely exceed |g1| ~ 1.4 given
//                               the geometry of three positive counts.
//
// Uses POPULATION moments (divide by n, not n-1) — matches the
// convention baked into P11.199 MAD and P11.201 MADm which are also
// population averages of deviations. Sample-corrected skewness (adjust
// by sqrt(n(n-1))/(n-2)) is undefined at n=2 and unstable at n=3, so
// the population form is chosen for continuity across pool_count
// boundaries.
//
// Label vocabulary (five bands, matching the five-band shape of
// P11.199/P11.201):
//   • empty        pool_count == 0
//   • solo         pool_count == 1 (structurally symmetric)
//   • symmetric    |g1| < 0.5
//   • right_leaning g1 >= +0.5 (positive skew; leader on the right tail
//                   pulls the mean above the median — e.g. pool
//                   [10,1,1] with mean 4, median 1, g1 ~ +0.707)
//   • left_leaning  g1 <= -0.5 (negative skew; laggard on the left
//                   tail pulls the mean below the median — e.g. pool
//                   [10,10,1] with mean 7, median 10, g1 ~ -0.707)
//
// The +/-0.5 band edge matches the classic "fairly symmetric" cutoff
// used in introductory stats and is symmetric around zero so the
// vocabulary treats positive and negative skew identically. Both
// cutoffs are exposed on the envelope as symmetric_skewness_abs_max
// so downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// LABEL ORIENTATION follows a SIGNED framing (POSITIVE skew = right
// tail heavy) — the natural convention for third-moment coefficients,
// picked so a reader who sees "right_leaning" immediately knows the
// large-magnitude cell is on the RIGHT of the ordered pool (matches
// the visual convention of ordered pools plotted left-to-right).
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — skewness
// is a pool-wide fold that consumes every cell.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.204):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection
// (P11.201) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1
// RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN
// ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION (P11.199) →
// MEDIAN ABSOLUTE DEVIATION (P11.201) → SKEWNESS (this module) →
// per-pair hot-cells GRANULAR (P11.139). Skewness opens the
// ASYMMETRY axis of the family — the MAD/MADm pair (P11.199/P11.201)
// stays adjacent as the ADDITIVE whole-pool dispersion pair; this
// module sits IMMEDIATELY BELOW them as the anchor-free direct
// asymmetry read that pairs naturally with the anchor-swap dispersion
// contrast readers already have.

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
type SkewnessLabel =
  | "empty"
  | "solo"
  | "symmetric"
  | "right_leaning"
  | "left_leaning";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Symmetric zero-centred band edge. |g1| < 0.5 is treated as fairly
// symmetric — matches the introductory-stats convention and pairs
// naturally with the MAD/MADm 0.5 dispersion floor so a reader who
// scans both surfaces uses the same numeric mental anchor.
const SYMMETRIC_SKEWNESS_ABS_MAX = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const SKEWNESS_DECIMALS = 4;

// Threshold below which a pool has no meaningful asymmetry distinction
// (a single cell is trivially symmetric around itself).
const SOLO_MAX_POOL_COUNT = 1;

export interface PerTransitionMagnitudeTop3PoolSkewnessBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_mean_cells: number | null;
  readonly partner_skewness: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_mean_cells: number | null;
  readonly metric_skewness: number | null;
}

export interface PerTransitionMagnitudeTop3PoolSkewnessBands {
  readonly small: PerTransitionMagnitudeTop3PoolSkewnessBand;
  readonly medium: PerTransitionMagnitudeTop3PoolSkewnessBand;
  readonly large: PerTransitionMagnitudeTop3PoolSkewnessBand;
}

export interface PerTransitionMagnitudeTop3PoolSkewnessEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolSkewnessBands;
}

export interface PerTransitionMagnitudeTop3PoolSkewnessMap {
  readonly improved: PerTransitionMagnitudeTop3PoolSkewnessEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolSkewnessEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolSkewnessEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolSkewnessEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolSkewness {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly symmetric_skewness_abs_max: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolSkewnessMap;
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
  skewness: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      mean_cells: null,
      skewness: null,
    };
  }
  const mean = pool_cells / pool_count;
  // Solo pools are structurally symmetric around themselves. Pin
  // skewness 0 and let the label render as "solo" so downstream readers
  // know the value is structural, not a computed symmetric verdict.
  if (pool_count <= SOLO_MAX_POOL_COUNT) {
    return {
      pool_count,
      pool_cells,
      mean_cells: roundTo(mean, SKEWNESS_DECIMALS),
      skewness: 0,
    };
  }
  let m2 = 0;
  let m3 = 0;
  for (const v of values) {
    const d = v - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= pool_count;
  m3 /= pool_count;
  // Flat pool (all cells equal): variance zero, third moment zero.
  // Pin skewness 0 rather than divide by zero.
  const skewness = m2 === 0 ? 0 : roundTo(m3 / Math.pow(m2, 1.5), SKEWNESS_DECIMALS);
  return {
    pool_count,
    pool_cells,
    mean_cells: roundTo(mean, SKEWNESS_DECIMALS),
    skewness,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolSkewnessBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_mean_cells: partner.mean_cells,
    partner_skewness: partner.skewness,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_mean_cells: metric.mean_cells,
    metric_skewness: metric.skewness,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolSkewnessEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolSkewness {
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
    symmetric_skewness_abs_max: SYMMETRIC_SKEWNESS_ABS_MAX,
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

function labelForSkewness(
  pool_count: number,
  skewness: number | null,
  symmetric_abs_max: number,
): SkewnessLabel {
  if (pool_count === 0 || skewness === null) return "empty";
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (skewness >= symmetric_abs_max) return "right_leaning";
  if (skewness <= -symmetric_abs_max) return "left_leaning";
  return "symmetric";
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

function renderSkewnessCell(
  pool_count: number,
  pool_cells: number,
  mean_cells: number | null,
  skewness: number | null,
  symmetric_abs_max: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForSkewness(pool_count, skewness, symmetric_abs_max);
  const skewnessText = skewness === null ? "-" : skewness.toFixed(2);
  const meanText = mean_cells === null ? "-" : mean_cells.toFixed(2);
  return `g1 ${skewnessText} (mean ${meanText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolSkewness,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { symmetric_skewness_abs_max } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderSkewnessCell(band.partner_pool_count, band.partner_pool_cells, band.partner_mean_cells, band.partner_skewness, symmetric_skewness_abs_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderSkewnessCell(band.metric_pool_count, band.metric_pool_cells, band.metric_mean_cells, band.metric_skewness, symmetric_skewness_abs_max)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool SKEWNESS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">DIRECT anchor-free asymmetry read over the P11.161 pool &mdash; Fisher-Pearson standardised third-moment coefficient folds every pool cell into ONE SIGNED asymmetry scalar: g1 = m3 / m2^(3/2). Opens the ASYMMETRY axis of the pool-shape family (companion to the CONCENTRATION family HHI/GINI/THEIL/ATKINSON/H_norm/top-share/bottom-share and the DISPERSION family CV/range/MAD/MADm/median-mean-ratio/mean-median-absolute-gap). Values in (-&infin;, +&infin;) &mdash; positive = right-tail heavy (leader inflates the mean above the median), negative = left-tail heavy (laggard drags the mean below the median), zero = symmetric. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (a single cell is trivially symmetric around itself), symmetric = |g1| &lt; ${symmetric_skewness_abs_max} (fairly symmetric), right_leaning = g1 &ge; +${symmetric_skewness_abs_max} (positive skew), left_leaning = g1 &le; -${symmetric_skewness_abs_max} (negative skew). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + skewness null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner skewness</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI skewness</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
