// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL GINI MEAN
// DIFFERENCE pure-lib (P11.238).
//
// WHOLE-POOL PAIRWISE-DIFFERENCE dispersion scalar over the P11.161
// pool. Folds every ordered pair of cells into ONE additive dispersion
// read that reports the AVERAGE ABSOLUTE DIFFERENCE between two
// distinct partners:
//
//   GMD = (2 / (n * (n - 1))) * sum_{i<j} |x_i - x_j|
//
// where n = pool_count and x_i, x_j are cell counts of two distinct
// partners. The unordered-pair formulation above is algebraically
// equivalent to (1 / (n * (n - 1))) * sum_{i != j} |x_i - x_j| — the
// mean absolute difference across all ORDERED pairs with i != j. Uses
// the UNBIASED n*(n-1) denominator (not the biased n^2 which includes
// the always-zero diagonal) so GMD is a strict unbiased estimator of
// the population mean absolute difference: E|X_i - X_j| for two
// randomly chosen distinct partners.
//
// Named after Corrado Gini's 1912 monograph "Variabilita e
// mutabilita" where GMD is the primitive from which the Gini
// coefficient is derived: G = GMD / (2 * mean). So GMD carries the
// same pairwise-difference information as Gini but in RAW CELL-COUNT
// UNITS rather than as a bounded [0, 1] ratio, letting a reader see
// "on average, two randomly chosen partners differ by X cells" without
// multiplying mean by Gini in their head.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units. Reads
//                                    the ABSOLUTE spread. Unbounded
//                                    above; ENDPOINT-ONLY (ignores
//                                    interior shape).
//   * P11.199 MAD                  - mean(|x_i - mean|). Reads
//                                    MEAN-ANCHORED dispersion. Every
//                                    cell contributes; requires the
//                                    mean as a reference center.
//   * P11.201 MedAD                - median(|x_i - median|). Reads
//                                    MEDIAN-ANCHORED dispersion.
//                                    Robust to outliers.
//   * P11.145 CV                   - sigma / mean. Reads spread in
//                                    units of the CENTER.
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1). Reads
//                                    INTERIOR-HINGE spread.
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min). Reads
//                                    absolute range in units of the
//                                    total span. Bounded [0, 1].
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//                                    Reads range in units of sigma
//                                    (peak-to-spread ratio).
//
// GMD's unique DISPERSION-axis contribution: reads PAIRWISE
// DIFFERENCE with NO CENTER ANCHOR. Every other DISPERSION surface
// either anchors on a center (mean for MAD/CV; median for MedAD),
// anchors on endpoints (max/min for range, COR, studentized-range),
// or anchors on hinges (Q1/Q3 for QCD, IQR). GMD asks the pool the
// question "how far apart do two RANDOMLY CHOSEN distinct partners
// typically sit?" without picking a reference partner or reference
// summary statistic first. This makes GMD uniquely robust to the
// choice of center: for a right-skewed pool [1x9, 10] MedAD reads
// 0 (median coincides with 9 out of 10 values so 9 zero-deviations
// dominate the median-of-deviations), while GMD reads 1.8 - a
// nonzero pairwise dispersion read that a median-anchored fold
// silences entirely.
//
// Well-defined for every pool with pool_count >= 1:
//   * pool_count 0                  -> gmd null (empty pool).
//   * pool_count 1                  -> gmd null (solo - no pair
//                                     exists so the pairwise fold is
//                                     undefined; distinct "solo"
//                                     label so downstream consumers
//                                     can distinguish from the empty
//                                     and uniform cases).
//   * pool_count >= 2 and           -> gmd null (degenerate - cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> gmd in [0, +Inf) rounded to 4
//     pool_cells > 0                  decimals. Zero iff all shares
//                                     are equal (flat pool).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> gmd 0 (every pair difference
//                                     is zero -> tight).
//   * uniform ramp [1..10]          -> sum_{i<j}|x_i-x_j| = 165 (see
//                                     below), gmd = 2*165/90 = 3.6667
//                                     (spread - uniform ramp cadence).
//   * upper-outlier [1x9, 10]       -> 9 pairs of (1,10) contribute 9
//                                     each, 36 pairs of (1,1)
//                                     contribute 0. Sum 81. gmd =
//                                     2*81/90 = 1.8 (spread - single
//                                     outlier only affects 9/45 pairs
//                                     so GMD stays modest).
//   * two-shoulders [1x8, 5x2]      -> 16 pairs of (1,5) contribute 4
//                                     each. Sum 64. gmd = 2*64/90 =
//                                     1.4222 (spread).
//   * 50/50 split [1x5, 10x5]       -> 25 pairs of (1,10) contribute
//                                     9 each. Sum 225. gmd = 2*225/90
//                                     = 5.0 (wide - bimodal split
//                                     lands at the wide-band floor).
//   * extreme outlier [1x9, 100]    -> 9 pairs of (1,100) contribute
//                                     99 each. Sum 891. gmd =
//                                     2*891/90 = 19.8 (wide - extreme
//                                     outlier dominates the pairwise
//                                     average).
//   * two-partner [1, 9]            -> 1 pair contributes 8. gmd =
//                                     2*8/2 = 8.0 (wide).
//   * two-partner [1, 100]          -> 1 pair contributes 99. gmd =
//                                     2*99/2 = 99.0 (wide).
//
// Relation to MAD: GMD tends to run ABOVE MAD on outlier pools
// because every outlier participates in n-1 non-zero pairs while
// contributing to just one mean-deviation term. Concretely GMD
// (unbiased) = 2 * mean * G_biased * n / (n - 1), so on pool
// [10, 1, 1] MAD reads 4 (wide) and GMD reads 6 (wide) - both flag
// the pool as wide but GMD lands higher. Documented so a future
// reader does not assume GMD dilutes outliers relative to MAD.
//
// Bands on raw gmd (fixed cutoffs since pool_cells varies with band
// and transition; the cutoffs are calibrated against the n=10
// reference distributions above so they read cleanly for medium
// pools and remain meaningful for smaller pools):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//   * tight                gmd < 1.0 (near-uniform pool; catches the
//                          two-shoulders and mild-outlier reference
//                          pools that GMD naturally reads as modest
//                          because pairwise dilution dampens single
//                          outliers)
//   * spread               gmd in [1.0, 5.0) (uniform-ramp regime
//                          and single-outlier pools)
//   * wide                 gmd >= 5.0 (bimodal splits, two-partner
//                          pools, and extreme outliers)
//
// Both cutoffs are exposed on the envelope as tight_gmd_max /
// wide_gmd_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the additive-dispersion INEQUALITY
// framing (HIGH gmd = MORE pairwise separation = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD tight/spread/wide vocabulary).
// Reuses the exact 3-band label set (tight/spread/wide) so a reader
// scanning the additive-dispersion trio (MAD mean-anchored / MedAD
// median-anchored / GMD pairwise) sees the same vocabulary across
// all three surfaces and can compare labels directly.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.239):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolStudentizedRangeSection
// (P11.237) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with pairwise-difference after the
// P11.237 studentized-range peak-to-spread landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) ->
// ... -> ROSENBLUTH (P11.234) -> STUDENTIZED RANGE (P11.237) ->
// GINI MEAN DIFFERENCE (this module) -> per-pair hot-cells GRANULAR
// (P11.139).

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
type GmdLabel =
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

// Plain-language additive-dispersion bands anchored to what small
// pools emit under the pairwise-difference fold. Same 3-band label
// vocabulary as P11.199 MAD and P11.201 MedAD but with cutoffs
// recalibrated for GMD's larger natural scale (uniform ramp [1..10]
// reads MAD 2.5, MedAD 2.5, GMD 3.67 - roughly 1.5x MAD/MedAD).
const TIGHT_GMD_MAX = 1.0;
const WIDE_GMD_MIN = 5.0;

// GMD rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const GMD_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_gmd: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_gmd: number | null;
}

export interface PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBands {
  readonly small: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBand;
  readonly medium: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBand;
  readonly large: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBand;
}

export interface PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBands;
}

export interface PerTransitionMagnitudeTop3PoolGiniMeanDifferenceMap {
  readonly improved: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_gmd_max: number;
  readonly wide_gmd_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolGiniMeanDifferenceMap;
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

// Gini mean difference of a discrete distribution:
//   GMD = (2 / (n * (n - 1))) * sum_{i<j} |x_i - x_j|
// Uses the UNBIASED n*(n-1) denominator so GMD is an unbiased
// estimator of the population mean absolute difference across two
// distinct partners. Sum walks the unordered-pair triangle in O(n^2)
// which is safe for the P11.161 top-3 pool (partner and metric pools
// are bounded at ~30 rows per band per transition).
// Returns null on empty, solo, and degenerate so downstream labels
// fire from distinct guard branches rather than from a NaN.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  gmd: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, gmd: null };
  }
  if (pool_count === 1) {
    // Solo - no pair exists so the pairwise fold is undefined.
    // Report null so downstream label "solo" fires from pool_count
    // == 1 rather than a NaN.
    return { pool_count, pool_cells, gmd: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, gmd: null };
  }
  let sumAbs = 0;
  for (let i = 0; i < pool_count; i++) {
    for (let j = i + 1; j < pool_count; j++) {
      const d = values[i] - values[j];
      sumAbs += d < 0 ? -d : d;
    }
  }
  const gmd = (2 * sumAbs) / (pool_count * (pool_count - 1));
  // Clamp tiny negative float-noise to 0; gmd is non-negative by
  // construction because |x_i - x_j| >= 0.
  const clamped = gmd < 0 ? 0 : gmd;
  return {
    pool_count,
    pool_cells,
    gmd: roundTo(clamped, GMD_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolGiniMeanDifferenceBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_gmd: partner.gmd,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_gmd: metric.gmd,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolGiniMeanDifferenceEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference {
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
    tight_gmd_max: TIGHT_GMD_MAX,
    wide_gmd_min: WIDE_GMD_MIN,
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

function labelForGmd(
  pool_count: number,
  pool_cells: number,
  gmd: number | null,
  tight_max: number,
  wide_min: number,
): GmdLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (gmd === null) return "degenerate";
  if (gmd >= wide_min) return "wide";
  if (gmd < tight_max) return "tight";
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

function renderGmdCell(
  pool_count: number,
  pool_cells: number,
  gmd: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForGmd(pool_count, pool_cells, gmd, tight_max, wide_min);
  const gmdText = gmd === null ? "-" : gmd.toFixed(4);
  return `GMD ${gmdText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_gmd_max, wide_gmd_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGmdCell(band.partner_pool_count, band.partner_pool_cells, band.partner_gmd, tight_gmd_max, wide_gmd_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGmdCell(band.metric_pool_count, band.metric_pool_cells, band.metric_gmd, tight_gmd_max, wide_gmd_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool GINI MEAN DIFFERENCE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL PAIRWISE-DIFFERENCE scalar over the P11.161 pool &mdash; gmd = (2 / (n * (n - 1))) * sum_{i&lt;j} |x_i - x_j|. Reads the AVERAGE ABSOLUTE DIFFERENCE between two distinct partners in raw cell-count units, using the UNBIASED n*(n-1) denominator so GMD is an unbiased estimator of the population mean absolute difference. Named after Corrado Gini's 1912 monograph "Variabilita e mutabilita" where GMD is the primitive from which the Gini coefficient derives: G = GMD / (2 * mean). Unique DISPERSION-axis contribution: reads PAIRWISE difference with NO CENTER ANCHOR &mdash; every other DISPERSION surface either anchors on a center (MAD/CV on mean, MedAD on median), on endpoints (range, COR, studentized-range), or on hinges (QCD, IQR). Complements P11.199 MAD and P11.201 MedAD by reading the same additive-dispersion axis but from a pairwise (not centered) primitive; GMD (unbiased) equals 2 * mean * G_biased * n / (n - 1) so it aggregates outliers MORE strongly than the mean-anchored MAD - on pool [10,1,1] MAD reads 4 and GMD reads 6, both wide. Labels: solo = pool_count == 1 (no pair exists), degenerate = pool_cells == 0 (guarded but unreachable), tight = gmd &lt; ${tight_gmd_max} (near-uniform pool; catches two-shoulders and mild-outlier pools that GMD reads modest), spread = gmd in [${tight_gmd_max}, ${wide_gmd_min}) (uniform-ramp regime and single-outlier pools), wide = gmd &ge; ${wide_gmd_min} (bimodal splits, two-partner pools, and extreme outliers). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + gmd null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner GMD</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI GMD</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
