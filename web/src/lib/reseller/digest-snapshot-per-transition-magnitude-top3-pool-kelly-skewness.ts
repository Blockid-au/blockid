// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL KELLY SKEWNESS
// pure-lib (P11.228).
//
// BOUNDED DECILE-HINGE asymmetry scalar over the P11.161 pool. Folds
// the three-decile triple (P10, P50, P90) into ONE SIGNED normalised
// asymmetry read on [-1, +1]:
//
//   ks = (P90 + P10 - 2*P50) / (P90 - P10)
//
// Classroom "Kelly skewness" (Kelly 1947; also Hildebrand 1986 §4.6 as
// "coefficient of skewness Sk4"). Decile-hinge cousin of the P11.215
// Bowley skewness (which uses the quartile-hinge triple Q1, Q2, Q3)
// and the P11.203 whole-pool Fisher-Pearson g1 (which uses the third
// standardised moment on every cell):
//
//   • Bowley skewness reads INTERIOR asymmetry via the middle-50%
//     hinge triple. Insensitive to endpoints; sensitive to interior
//     mass redistribution around Q2.
//   • Kelly skewness reads TAIL asymmetry via the middle-80% hinge
//     triple. Sensitive to tail behaviour BUT still robust to the very
//     extreme endpoints past the deciles (top 10% + bottom 10% of the
//     pool). The P10/P90 hinges reach FURTHER into the tails than
//     Q1/Q3 while still stopping short of the exact endpoints P0/P100
//     surfaced by P11.181 range / P11.185 top1/bot1 / P11.213 COR.
//   • Fisher-Pearson g1 reads WHOLE-POOL asymmetry via the third
//     standardised moment. Sensitive to every cell — a single tail
//     outlier can dominate.
//
// Reading Bowley (interior) + Kelly (tails-but-not-endpoints) +
// Fisher-Pearson g1 (whole-pool) + L-skewness (bounded whole-pool) as
// a quartet lets ops triangulate WHERE on the pool the asymmetry
// signal lives:
//   • Bowley non-zero, Kelly ~0, g1 ~0    → interior lean only (mass
//                                            redistribution around Q2
//                                            with symmetric tails)
//   • Bowley ~0, Kelly non-zero, g1 ~0    → tail lean only (interior
//                                            symmetric but one decile
//                                            tail heavier than the
//                                            other)
//   • Bowley ~0, Kelly ~0, g1 non-zero    → endpoint outlier lean
//                                            (single tail cell drives
//                                            the third moment past the
//                                            deciles)
//   • all three same-sign                 → structurally skewed pool
//                                            (interior, tails, and
//                                            endpoint all lean the
//                                            same way)
// This is the ASYMMETRY-axis analogue of the DISPERSION-axis
// SCOPE × ROBUSTNESS grid at (P11.175 CV whole-pool unbounded,
// P11.225 L-CV whole-pool bounded, P11.211 QCD interior-quartile,
// P11.213 COR endpoint) — Kelly fills the DECILE-HINGE cell on the
// ASYMMETRY axis, one hinge-level further out than Bowley and one
// hinge-level in from the endpoint.
//
// The (Bowley, Kelly) hinge-based skewness pair also mirrors the
// TAIL-WEIGHT-axis (P11.217 Moors, P11.219 Crow-Siddiqui) hinge-based
// kurtosis pair — both use hinges rather than powers, but Moors uses
// octiles (E1/E3/E5/E7/E8) while Crow-Siddiqui uses percentiles
// (P2.5/P25/P75/P97.5). Kelly's use of DECILES (P10/P90) sits between
// these two extremes and matches the classical Hildebrand/Kelly
// decile-hinge convention used in undergraduate stats.
//
// Well-defined for every pool with pool_count >= 10 and P90 > P10:
//   • pool_count 0             → ks null, hinges null (empty pool).
//   • pool_count in [1, 9]     → ks null, hinges null. Distinct
//                                "small_pool" label. Floor of 10
//                                matches Hosking & Wallis 1997 §2.2
//                                "n>=1/(1-p) for stable p-quantile
//                                estimation" applied at p=0.9 giving
//                                n>=10 so P90 has at least ONE rank
//                                position between the estimator and
//                                the exact endpoint P100. Below 10
//                                the deciles collapse onto the
//                                endpoints leaking the signal already
//                                surfaced by P11.181 range / P11.185
//                                top1/bot1 / P11.213 COR endpoint
//                                surfaces. Deliberately looser than
//                                the P11.215 Bowley floor of 4
//                                (quartile hinges collapse sooner)
//                                and tighter than any whole-pool
//                                floor because deciles are one hinge
//                                level further into the tails.
//   • pool_count >= 10 and     → ks null, hinges recorded, distinct
//     P90 == P10                 "degenerate" label so the reader
//                                knows the middle-80% is FLAT (all
//                                deciles collapsed onto the same
//                                value — same failure mode that
//                                returns bowley null on P11.215 when
//                                Q3 == Q1). Distinct from "symmetric"
//                                because a degenerate decile spread
//                                tells the reader NOTHING about
//                                asymmetry (structural indeterminacy,
//                                not a measured symmetric verdict).
//   • pool_count >= 10 and     → ks = (P90 + P10 - 2*P50) / (P90 - P10);
//     P90 > P10                  rounded to 4 decimals. Denominator
//                                guaranteed > 0 by the guard above.
//
// Cutoffs use plain-language bounded-asymmetry bands anchored at
// 0.1 / 0.3 — the SAME classroom thresholds as the P11.215 Bowley
// sibling (Kendall & Stuart §2.20; Bulmer "Principles of Statistics"
// 1979 §5.4). Kept identical so a reader scanning the two hinge-based
// asymmetry surfaces side-by-side sees the same label vocabulary and
// can compare interior-vs-decile lean on the same scale. Anchors map
// to P50 positions within the decile spread (P90-P10) via the closed
// form P50 = (P90+P10)/2 - ks*(P90-P10)/2:
//   • ks 0.1  ↔ P50 sits at 45% of the way from P10 to P90
//   • ks 0.3  ↔ P50 sits at 35% of the way from P10 to P90
// Bands:
//   • empty         pool_count == 0
//   • small_pool    pool_count in [1, 9] (decile hinges collapse to
//                   endpoints)
//   • degenerate    P90 == P10 (flat middle-80% — asymmetry undefined)
//   • symmetric     |ks| < 0.1 (P50 within 45-55% of the decile
//                   spread)
//   • right_leaning ks in [+0.1, +0.3) (mild positive skew; P50 in
//                   35-45% of the decile spread, UPPER decile tail
//                   heavier)
//   • left_leaning  ks in (-0.3, -0.1] (mild negative skew; P50 in
//                   55-65% of the decile spread, LOWER decile tail
//                   heavier)
//   • strong_right  ks >= +0.3 (strong positive skew; P50 in 0-35%
//                   of the decile spread)
//   • strong_left   ks <= -0.3 (strong negative skew; P50 in 65-100%
//                   of the decile spread)
// All cutoffs exposed on the envelope as symmetric_kelly_abs_max /
// strong_kelly_abs_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same SIGNED framing as P11.203
// whole-pool skewness + P11.215 Bowley skewness (POSITIVE ks = UPPER
// decile tail heavy = right-skewed pool) — matches the classroom
// third-moment sign convention and the visual convention of ordered
// pools plotted left-to-right.
//
// PERCENTILE ESTIMATOR. Uses linear-interpolation R type 7 (the
// default in R + numpy.percentile + pandas.quantile) so the decile
// definition matches every mainstream analytics tool. For a sorted
// array of length n and probability p:
//   h = p * (n - 1)
//   lo = floor(h),   hi = ceil(h)
//   q = sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
// This is DIFFERENT from the P11.215 Bowley + P11.207 IQR Tukey
// exclusive hinge convention because Tukey hinges are defined only
// at Q1/Q2/Q3 (median-of-halves) whereas linear interpolation is the
// standard percentile-anywhere estimator used at deciles + centiles.
// Both conventions coincide at Q2 for odd n; at other hinges they
// differ by at most one cell. Deliberately not shared with the
// tukeyHinges helper because Kelly's deciles use a fundamentally
// different weighting scheme.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — Kelly is
// a three-decile fold that consumes only the decile triple but still
// names the whole-pool count/cells for reader context.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.229):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolLCvSection (P11.225)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173)
// → CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE
// (P11.165) → TOP-2 COMBINED SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 COMBINED SHARE (P11.183) →
// TOP1/BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) →
// MID-MASS SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) →
// TOP2/BOTTOM1 RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) →
// MEAN-MEDIAN ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION
// (P11.199) → MEDIAN ABSOLUTE DEVIATION (P11.201) → SKEWNESS
// (P11.203) → EXCESS KURTOSIS (P11.205) → IQR (P11.207) → IQR RATIO
// (P11.209) → QCD (P11.211) → COR (P11.213) → BOWLEY SKEWNESS
// (P11.215) → MOORS KURTOSIS (P11.217) → CROW-SIDDIQUI KURTOSIS
// (P11.219) → L-SKEWNESS (P11.221) → L-KURTOSIS (P11.223) → L-CV
// (P11.225) → KELLY SKEWNESS (this module) → per-pair hot-cells
// GRANULAR (P11.139). Kelly sits IMMEDIATELY BELOW the P11.225 L-CV
// surface so the DECILE-HINGE asymmetry read closes off the ASYMMETRY
// axis's SCOPE × ROBUSTNESS grid: whole-pool unbounded (P11.203),
// whole-pool bounded (P11.221 L-skewness), interior-quartile
// (P11.215 Bowley), and now decile-hinge (this module).

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
type KellyLabel =
  | "empty"
  | "small_pool"
  | "degenerate"
  | "symmetric"
  | "right_leaning"
  | "left_leaning"
  | "strong_right"
  | "strong_left";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Symmetric zero-centred band edges. 0.1 / 0.3 match the P11.215
// Bowley classroom thresholds so a reader scanning the two hinge-based
// asymmetry surfaces sees the same label vocabulary. Deliberately
// tighter than the P11.203 |g1| 0.5 edge because Kelly's bounded
// [-1, +1] codomain makes 0.5 an extreme value.
const SYMMETRIC_KELLY_ABS_MAX = 0.1;
const STRONG_KELLY_ABS_MIN = 0.3;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const KELLY_DECIMALS = 4;

// Threshold below which decile hinges collapse onto the endpoints
// (n<10 leaves P10 and P90 tied to sorted[0] and sorted[n-1] via
// linear interpolation), duplicating the P11.181 range / P11.185
// top1/bot1 / P11.213 COR endpoint surfaces. Floor of 10 matches the
// classical "one rank per decile" rule of thumb.
const MIN_POOL_COUNT_FOR_KELLY = 10;

export interface PerTransitionMagnitudeTop3PoolKellySkewnessBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_p10_cells: number | null;
  readonly partner_p50_cells: number | null;
  readonly partner_p90_cells: number | null;
  readonly partner_kelly: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_p10_cells: number | null;
  readonly metric_p50_cells: number | null;
  readonly metric_p90_cells: number | null;
  readonly metric_kelly: number | null;
}

export interface PerTransitionMagnitudeTop3PoolKellySkewnessBands {
  readonly small: PerTransitionMagnitudeTop3PoolKellySkewnessBand;
  readonly medium: PerTransitionMagnitudeTop3PoolKellySkewnessBand;
  readonly large: PerTransitionMagnitudeTop3PoolKellySkewnessBand;
}

export interface PerTransitionMagnitudeTop3PoolKellySkewnessEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolKellySkewnessBands;
}

export interface PerTransitionMagnitudeTop3PoolKellySkewnessMap {
  readonly improved: PerTransitionMagnitudeTop3PoolKellySkewnessEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolKellySkewnessEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolKellySkewnessEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolKellySkewnessEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_kelly: number;
  readonly symmetric_kelly_abs_max: number;
  readonly strong_kelly_abs_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolKellySkewnessMap;
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

// Linear-interpolation percentile (R type 7 / numpy default). For a
// sorted array of length n and probability p:
//   h  = p * (n - 1)
//   lo = floor(h), hi = ceil(h)
//   q  = sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
// Caller guarantees n >= MIN_POOL_COUNT_FOR_KELLY (= 10) so h ranges
// over [0.9, n-1.9] for the three probes p=0.1, 0.5, 0.9 keeping lo
// and hi strictly inside the array (0 <= lo <= hi <= n-1). Same
// estimator that P90 sustained-threshold consumers assume elsewhere
// in the digest pipeline (see reference to sustained_p90_threshold in
// the P11.139 hot-cells envelope).
function linearPercentile(sorted: number[], p: number): number {
  const n = sorted.length;
  const h = p * (n - 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  p10_cells: number | null;
  p50_cells: number | null;
  p90_cells: number | null;
  kelly: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_KELLY || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      p10_cells: null,
      p50_cells: null,
      p90_cells: null,
      kelly: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p10 = linearPercentile(sorted, 0.1);
  const p50 = linearPercentile(sorted, 0.5);
  const p90 = linearPercentile(sorted, 0.9);
  // Degenerate decile spread (P90 == P10) — the middle-80% is flat so
  // the Kelly denominator is zero. Record the deciles so a reader can
  // see the flat middle-80% but return kelly null with a distinct
  // "degenerate" label downstream (structural indeterminacy, not a
  // measured symmetric verdict).
  if (p90 === p10) {
    return {
      pool_count,
      pool_cells,
      p10_cells: roundTo(p10, KELLY_DECIMALS),
      p50_cells: roundTo(p50, KELLY_DECIMALS),
      p90_cells: roundTo(p90, KELLY_DECIMALS),
      kelly: null,
    };
  }
  return {
    pool_count,
    pool_cells,
    p10_cells: roundTo(p10, KELLY_DECIMALS),
    p50_cells: roundTo(p50, KELLY_DECIMALS),
    p90_cells: roundTo(p90, KELLY_DECIMALS),
    kelly: roundTo((p90 + p10 - 2 * p50) / (p90 - p10), KELLY_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolKellySkewnessBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_p10_cells: partner.p10_cells,
    partner_p50_cells: partner.p50_cells,
    partner_p90_cells: partner.p90_cells,
    partner_kelly: partner.kelly,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_p10_cells: metric.p10_cells,
    metric_p50_cells: metric.p50_cells,
    metric_p90_cells: metric.p90_cells,
    metric_kelly: metric.kelly,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolKellySkewnessEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness {
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
    min_pool_count_for_kelly: MIN_POOL_COUNT_FOR_KELLY,
    symmetric_kelly_abs_max: SYMMETRIC_KELLY_ABS_MAX,
    strong_kelly_abs_min: STRONG_KELLY_ABS_MIN,
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

function labelForKelly(
  pool_count: number,
  p10: number | null,
  p90: number | null,
  kelly: number | null,
  min_pool_count_for_kelly: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): KellyLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_kelly) return "small_pool";
  if (kelly === null || p10 === null || p90 === null) return "degenerate";
  if (kelly >= strong_abs_min) return "strong_right";
  if (kelly <= -strong_abs_min) return "strong_left";
  if (kelly >= symmetric_abs_max) return "right_leaning";
  if (kelly <= -symmetric_abs_max) return "left_leaning";
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

function renderKellyCell(
  pool_count: number,
  pool_cells: number,
  p10: number | null,
  p50: number | null,
  p90: number | null,
  kelly: number | null,
  min_pool_count_for_kelly: number,
  symmetric_abs_max: number,
  strong_abs_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForKelly(
    pool_count,
    p10,
    p90,
    kelly,
    min_pool_count_for_kelly,
    symmetric_abs_max,
    strong_abs_min,
  );
  const kellyText = kelly === null ? "-" : kelly.toFixed(3);
  const p10Text = p10 === null ? "-" : p10.toFixed(2);
  const p50Text = p50 === null ? "-" : p50.toFixed(2);
  const p90Text = p90 === null ? "-" : p90.toFixed(2);
  return `ks ${kellyText} (P10 ${p10Text}, P50 ${p50Text}, P90 ${p90Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_kelly,
    symmetric_kelly_abs_max,
    strong_kelly_abs_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderKellyCell(band.partner_pool_count, band.partner_pool_cells, band.partner_p10_cells, band.partner_p50_cells, band.partner_p90_cells, band.partner_kelly, min_pool_count_for_kelly, symmetric_kelly_abs_max, strong_kelly_abs_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderKellyCell(band.metric_pool_count, band.metric_pool_cells, band.metric_p10_cells, band.metric_p50_cells, band.metric_p90_cells, band.metric_kelly, min_pool_count_for_kelly, symmetric_kelly_abs_max, strong_kelly_abs_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool KELLY SKEWNESS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">BOUNDED DECILE-HINGE asymmetry scalar over the P11.161 pool &mdash; the three-decile triple (P10, P50, P90) folds into ONE SIGNED normalised asymmetry read on [-1, +1]: ks = (P90 + P10 - 2*P50) / (P90 - P10). Bounded normalised complement to the P11.203 whole-pool Fisher-Pearson g1 and decile-hinge complement to the P11.215 Bowley skewness quartile-hinge surface &mdash; where Bowley reads INTERIOR asymmetry via Q1/Q2/Q3, Kelly reads TAIL asymmetry via P10/P50/P90 one hinge-level further into the tails. Pairs on the ASYMMETRY axis the same way P11.211 QCD + P11.213 COR pair on the DISPERSION axis: read side-by-side to distinguish "asymmetry driven by interior distribution" (Bowley non-zero) from "asymmetry driven by tail behaviour" (Kelly non-zero) from "asymmetry driven by extreme endpoint outliers" (whole-pool g1 non-zero). Values in [-1, +1] &mdash; positive = upper decile tail heavier (P50 towards P10), negative = lower decile tail heavier (P50 towards P90), zero = decile spread symmetric around the median. Labels: small_pool = pool_count &lt; ${min_pool_count_for_kelly} (decile hinges collapse to endpoints, duplicating the range/top1-bot1/COR endpoint surfaces), degenerate = P90 == P10 (flat middle-80%, ks denominator zero &mdash; structural indeterminacy), symmetric = |ks| &lt; ${symmetric_kelly_abs_max} (P50 within 45-55% of the decile spread), right_leaning = ks in [${symmetric_kelly_abs_max}, ${strong_kelly_abs_min}) (mild positive skew), left_leaning = ks in (-${strong_kelly_abs_min}, -${symmetric_kelly_abs_max}] (mild negative skew), strong_right = ks &ge; ${strong_kelly_abs_min} (strong positive skew), strong_left = ks &le; -${strong_kelly_abs_min} (strong negative skew). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + kelly null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner kelly</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI kelly</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
