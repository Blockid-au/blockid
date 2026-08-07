// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL STUDENTIZED RANGE
// pure-lib (P11.236).
//
// WHOLE-POOL PEAK-TO-SPREAD scalar over the P11.161 pool. Folds every
// cell into ONE dispersion read that reports the pool's total RANGE
// (max - min) in units of the pool's own STANDARD DEVIATION:
//
//   SR = (max - min) / sigma
//
// where sigma = sqrt(sum((x_i - mean)^2) / n) is the POPULATION
// standard deviation (biased denominator n, not the sample n-1
// denominator — the pool is a finite exhaustive population of
// partner counts, never a sample from a superpopulation).
//
// The name mirrors the "studentized range" used in Tukey's HSD
// post-hoc pairwise test (q = (mean_max - mean_min) / (s * sqrt(1/n)))
// where the numerator is a range and the denominator is a standard
// error. Here the ratio is applied to the raw pool rather than to
// group means, so the numerator is (max - min) directly and the
// denominator is the pool's own sigma; the intuition is identical —
// how many SIGMA-STEPS wide is the pool's total span?
//
// Complements the existing DISPERSION-axis family:
//
//   • P11.181 RANGE                — max - min in raw units. Reads
//                                    the ABSOLUTE spread. Unbounded
//                                    above; depends on the unit
//                                    scale of the pool counts.
//   • P11.145 CV                   — sigma / mean. Reads spread in
//                                    units of the CENTER. Unbounded
//                                    above; scale-invariant.
//   • P11.211 QCD                  — (Q3 - Q1) / (Q3 + Q1). Reads
//                                    interior-hinge spread on
//                                    [0, 1]. Ignores tails.
//   • P11.213 COEFFICIENT-OF-RANGE — (max - min) / (max + min). Reads
//                                    absolute range in units of the
//                                    total span (max + min). Bounded
//                                    [0, 1]. Robust to unit rescaling.
//   • P11.201 IQR + P11.203 IQR-RATIO  — interior-hinge spreads that
//                                    ignore the outer 25% + 25% tails.
//
// Studentized-range's unique DISPERSION-axis contribution: reads
// WHETHER the pool's total span is many-sigma wide (single-outlier
// regime) or few-sigma wide (uniform regime). Every other DISPERSION
// surface either reads a fixed hinge (IQR, QCD), a scale-relative
// spread (CV against mean, COR against total span), or the raw span
// (RANGE) — none read range-in-sigma-units. That specific ratio
// SATURATES around sqrt(n) for pools dominated by a single outlier
// regardless of how extreme the outlier grows: as the outlier value
// diverges, both range and sigma grow together and their ratio
// converges. So SR reads a REGIME rather than a magnitude —
// "one dominant outlier" saturates at ~sqrt(n) while "uniform ramp"
// stays around 3 for n=10 and "flat pool" collapses to 0/0.
//
// Well-defined for every pool with pool_count >= 1:
//   • pool_count 0                  → sr null (empty pool).
//   • pool_count 1                  → sr null (solo — sigma = 0 and
//                                     range = 0 so ratio 0/0 is
//                                     undefined; distinct "solo"
//                                     label so downstream consumers
//                                     can distinguish from the empty
//                                     and uniform cases).
//   • pool_count >= 2 and           → sr null (degenerate — cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream
//                                     robustness).
//   • pool_count >= 2 and           → sr null (uniform label — every
//     sigma == 0 (all shares equal)   partner emits the same count so
//                                     both range and sigma collapse
//                                     to zero simultaneously; distinct
//                                     "uniform" label so the flat-pool
//                                     case reads as a first-class
//                                     regime rather than a NaN).
//   • pool_count >= 2 and           → sr in [0, +Inf) rounded to 4
//     sigma > 0                       decimals; practically bounded
//                                     above by ~sqrt(n) for single-
//                                     outlier regimes.
//
// Reference distributions (pool_count 10):
//   • flat [k,k,...,k]              → sigma = 0, range = 0 → sr null
//                                     with uniform label.
//   • uniform ramp [1..10]          → mean 5.5, sigma ~ 2.8723,
//                                     range = 9 → sr ~ 3.1334
//                                     (even a uniform ramp saturates
//                                     near sqrt(n) for n=10).
//   • upper-outlier [1×9, 10]       → mean 1.9, sigma ~ 2.7, range = 9
//                                     → sr ~ 3.3333 (SR climbs toward
//                                     the sqrt(n) saturation).
//   • extreme outlier [1×9, 100]    → mean 10.9, sigma ~ 29.7,
//                                     range = 99 → sr ~ 3.3333 (SR
//                                     SATURATES at ~sqrt(n) — no
//                                     further movement as the outlier
//                                     grows because range and sigma
//                                     grow together).
//   • two-partner [1, 9]            → mean 5, sigma = 4, range = 8
//                                     → sr = 2 (theoretical
//                                     n=2 upper bound is 2 exactly
//                                     regardless of the actual values).
//   • two-partner [1, 100]          → mean 50.5, sigma = 49.5,
//                                     range = 99 → sr = 2 (identical
//                                     to any other two-partner pool
//                                     with unequal counts).
//
// The theoretical upper bound of SR is NOT sqrt(n*(n-1)) as some
// texts claim — that bound is for the studentized range of MEANS in
// Tukey's HSD, not the studentized range of raw values. For raw
// pools the upper bound is sqrt(n(n-1)/(n-1+1/n)) which is close to
// sqrt(n) as n grows. Do not claim a tight bound in the label
// vocabulary; use fixed cutoffs that are stable across pool sizes
// and read the "single outlier regime" cutoff around sqrt(10) ~ 3.16.
//
// Bands on raw sr (fixed cutoffs since sqrt(n) is not stable across
// pool sizes; the cutoffs are calibrated against the n=10 reference
// distributions above so they read cleanly for medium pools and
// remain meaningful for smaller pools where the n=2 upper bound is 2
// exactly):
//   • empty                pool_count == 0
//   • solo                 pool_count == 1
//   • degenerate           pool_cells == 0 (guarded but unreachable)
//   • uniform              sigma == 0 (all shares equal, flat pool)
//   • balanced             sr < 1.5 (near-uniform — well below the
//                          uniform-ramp reference at 3.13)
//   • moderate             sr in [1.5, 2.5) (below the theoretical
//                          two-partner ceiling)
//   • concentrated         sr in [2.5, 3.0) (uniform-ramp regime and
//                          approaching single-outlier saturation)
//   • highly_concentrated  sr >= 3.0 (single-outlier regime for
//                          n=10 pools; SR saturates at ~sqrt(n))
//
// All cutoffs exposed on the envelope as balanced_sr_max /
// concentrated_sr_min / highly_concentrated_sr_min so downstream
// JSONL consumers render the label vocabulary without importing the
// TS module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.237):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolRosenbluthSection
// (P11.234 / P11.235) AND IMMEDIATELY ABOVE perPairHotCellsSection
// so the hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → ... → HOOVER (P11.232) → ROSENBLUTH (P11.234) →
// STUDENTIZED RANGE (this module) → per-pair hot-cells GRANULAR
// (P11.139). Studentized-range sits IMMEDIATELY BELOW the P11.234
// Rosenbluth whole-pool rank-weighted-inequality surface so the
// DISPERSION axis picks up a peak-to-spread read after the
// CONCENTRATION axis closes with Rosenbluth's rank-weighted anchor.

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
type StudentizedRangeLabel =
  | "empty"
  | "solo"
  | "degenerate"
  | "uniform"
  | "balanced"
  | "moderate"
  | "concentrated"
  | "highly_concentrated";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Bands on raw sr (fixed cutoffs since sqrt(n) is not stable across
// pool sizes). Calibrated against the n=10 reference distributions:
// uniform ramp ~ 3.13 (concentrated), single-outlier saturation
// at ~sqrt(n) ~ 3.16 (highly_concentrated), two-partner ceiling = 2
// exactly (moderate).
const BALANCED_SR_MAX = 1.5;
const CONCENTRATED_SR_MIN = 2.5;
const HIGHLY_CONCENTRATED_SR_MIN = 3.0;

// Studentized range rounded to 4 decimals so weekly digests are
// stable under float-noise re-runs. Same precision as every other
// pool-shape sibling.
const STUDENTIZED_RANGE_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolStudentizedRangeBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_studentized_range: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_studentized_range: number | null;
}

export interface PerTransitionMagnitudeTop3PoolStudentizedRangeBands {
  readonly small: PerTransitionMagnitudeTop3PoolStudentizedRangeBand;
  readonly medium: PerTransitionMagnitudeTop3PoolStudentizedRangeBand;
  readonly large: PerTransitionMagnitudeTop3PoolStudentizedRangeBand;
}

export interface PerTransitionMagnitudeTop3PoolStudentizedRangeEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolStudentizedRangeBands;
}

export interface PerTransitionMagnitudeTop3PoolStudentizedRangeMap {
  readonly improved: PerTransitionMagnitudeTop3PoolStudentizedRangeEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolStudentizedRangeEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolStudentizedRangeEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolStudentizedRangeEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly balanced_sr_max: number;
  readonly concentrated_sr_min: number;
  readonly highly_concentrated_sr_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolStudentizedRangeMap;
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

// Studentized range of a discrete distribution:
//   SR = (max - min) / sigma_population
// where sigma_population = sqrt(sum((x_i - mean)^2) / n).
// Uses biased n (not n-1) because the pool is a finite exhaustive
// population of partner counts, not a sample from a superpopulation.
// Returns null on empty, solo, degenerate, and uniform (sigma == 0)
// so downstream labels fire from distinct guard branches rather
// than from a NaN.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  studentized_range: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, studentized_range: null };
  }
  if (pool_count === 1) {
    // Solo — sigma = 0 and range = 0, ratio 0/0 undefined. Report
    // null so downstream label "solo" fires from pool_count == 1
    // rather than a NaN.
    return { pool_count, pool_cells, studentized_range: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, studentized_range: null };
  }
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const v of values) {
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
  }
  const mean = sum / pool_count;
  let ssq = 0;
  for (const v of values) {
    const d = v - mean;
    ssq += d * d;
  }
  const variance = ssq / pool_count;
  const sigma = Math.sqrt(variance);
  if (sigma === 0) {
    // Uniform pool — every partner emits the same count so both
    // range and sigma collapse to zero. Report null with the
    // "uniform" label so this reads as a first-class regime rather
    // than a degenerate NaN.
    return { pool_count, pool_cells, studentized_range: null };
  }
  const range = max - min;
  const sr = range / sigma;
  // Clamp tiny negative float-noise to 0; sr is non-negative by
  // construction because range >= 0 and sigma > 0.
  const clamped = sr < 0 ? 0 : sr;
  return {
    pool_count,
    pool_cells,
    studentized_range: roundTo(clamped, STUDENTIZED_RANGE_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolStudentizedRangeBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_studentized_range: partner.studentized_range,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_studentized_range: metric.studentized_range,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolStudentizedRangeEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange {
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
    balanced_sr_max: BALANCED_SR_MAX,
    concentrated_sr_min: CONCENTRATED_SR_MIN,
    highly_concentrated_sr_min: HIGHLY_CONCENTRATED_SR_MIN,
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

function labelForStudentizedRange(
  pool_count: number,
  pool_cells: number,
  studentized_range: number | null,
  balanced_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): StudentizedRangeLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (studentized_range === null) return "uniform";
  if (studentized_range >= highly_concentrated_min) return "highly_concentrated";
  if (studentized_range >= concentrated_min) return "concentrated";
  if (studentized_range < balanced_max) return "balanced";
  return "moderate";
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

// Recomputes range and sigma for narration only. The envelope
// carries the rounded studentized_range scalar; the section body
// prints "range NN.NN / std NN.NN → SR N.NNNN" for each populated
// band so readers can trace the ratio without leaving the digest.
// Uses population sigma (biased n) to match the foldMap formula.
function narrateRangeAndSigma(cellsByKey: Map<string, number>): {
  range: number;
  sigma: number;
} {
  const values = Array.from(cellsByKey.values());
  const n = values.length;
  if (n === 0) return { range: 0, sigma: 0 };
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const v of values) {
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
  }
  const mean = sum / n;
  let ssq = 0;
  for (const v of values) {
    const d = v - mean;
    ssq += d * d;
  }
  return { range: max - min, sigma: Math.sqrt(ssq / n) };
}

function renderStudentizedRangeCell(
  pool_count: number,
  pool_cells: number,
  studentized_range: number | null,
  balanced_max: number,
  concentrated_min: number,
  highly_concentrated_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForStudentizedRange(
    pool_count,
    pool_cells,
    studentized_range,
    balanced_max,
    concentrated_min,
    highly_concentrated_min,
  );
  const srText = studentized_range === null ? "-" : studentized_range.toFixed(4);
  return `SR ${srText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    balanced_sr_max,
    concentrated_sr_min,
    highly_concentrated_sr_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderStudentizedRangeCell(band.partner_pool_count, band.partner_pool_cells, band.partner_studentized_range, balanced_sr_max, concentrated_sr_min, highly_concentrated_sr_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderStudentizedRangeCell(band.metric_pool_count, band.metric_pool_cells, band.metric_studentized_range, balanced_sr_max, concentrated_sr_min, highly_concentrated_sr_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool STUDENTIZED RANGE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL PEAK-TO-SPREAD scalar over the P11.161 pool &mdash; sr = (max - min) / sigma_population where sigma_population = sqrt(sum((x_i - mean)^2) / n). Reads the pool's total RANGE in units of the pool's own STANDARD DEVIATION (peak-to-spread ratio) &mdash; how many sigma-steps wide is the total span. Unique DISPERSION-axis contribution: reads WHETHER the pool's total span is many-sigma wide (single-outlier regime) vs few-sigma wide (uniform regime). Saturates around sqrt(n) for single-outlier regimes regardless of how extreme the outlier grows, so SR reads a REGIME rather than a magnitude. Complements P11.181 range (absolute), P11.145 cv (spread against mean), P11.211 qcd (interior-hinge on [0,1]), P11.213 coefficient-of-range (range against total span on [0,1]) with a range-in-sigma-units read that no other DISPERSION surface provides. Labels: solo = pool_count == 1 (sigma = range = 0, ratio 0/0 undefined), degenerate = pool_cells == 0 (guarded but unreachable), uniform = pool_count &ge; 2 with sigma == 0 (all shares equal; flat pool), balanced = sr &lt; ${balanced_sr_max} (near-uniform), moderate = sr in [${balanced_sr_max}, ${concentrated_sr_min}), concentrated = sr in [${concentrated_sr_min}, ${highly_concentrated_sr_min}), highly_concentrated = sr &ge; ${highly_concentrated_sr_min} (single-outlier regime for n=10 pools; sr saturates near sqrt(n)). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + sr null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner SR</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI SR</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}

// Exported for downstream callers that want to narrate the raw range
// and sigma alongside the rounded SR ratio. Not used inside the
// formatter to keep the section body self-contained, but exposed so
// external digest consumers can render "range 9 / std 2.87 -> SR 3.13"
// without recomputing the moments themselves.
export function computePoolRangeAndSigmaForNarration(
  cellsByKey: Map<string, number>,
): { range: number; sigma: number } {
  return narrateRangeAndSigma(cellsByKey);
}
