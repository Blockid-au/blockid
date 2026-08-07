// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-Q3
// pure-lib (P11.244).
//
// WHOLE-POOL RANGE-AGAINST-UPPER-HINGE dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// own UPPER TUKEY HINGE (Q3):
//
//   ptq3 = (max - min) / Q3
//
// where Q3 is the Tukey EXCLUSIVE upper hinge (median of the upper
// half after excluding the central value for odd n; median of the
// upper half at the midpoint split for even n). Reads the peak
// spread against an upper-shoulder anchor so a BIMODAL SYMMETRIC
// split -- which the P11.242 peak-to-Q1 surface flags WIDE because
// its denominator sits in the LOWER cluster -- reads TIGHT here
// because Q3 sits IN the upper cluster where the leader partner
// lives.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units.
//   * P11.199 MAD                  - mean(|x_i - mean|).
//   * P11.201 MedAD                - median(|x_i - median|).
//   * P11.145 CV                   - sigma / mean.
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//   * P11.238 GMD                  - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median. Reads
//                                    range in units of the ORDER-
//                                    STATISTIC CENTER.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1. Reads range
//                                    in units of the LOWER SHOULDER.
//
// PTQ3's unique DISPERSION-axis contribution: reads range in units
// of an UPPER-SHOULDER anchor. Together PTQ1 + PTQ3 span the pair
// of order-statistic shoulders that flank the P11.240 PTM order-
// statistic centre -- giving the DISPERSION axis a complete
// (lower, centre, upper) triad of order-statistic anchors for the
// range-based read.
//
// The (PTQ1, PTQ3) contrast names four regimes that no single
// dispersion surface can flag alone:
//
//   * PTQ1 tight + PTQ3 tight     -> flat pool (range zero).
//   * PTQ1 spread + PTQ3 tight    -> UNIFORM RAMP / TOP-HEAVY pool
//                                    (Q1 small, Q3 large, ratio
//                                    both moderate but different).
//   * PTQ1 wide + PTQ3 tight      -> BIMODAL SYMMETRIC split with
//                                    a strong upper cluster (Q1 sits
//                                    in lower cluster; Q3 sits in
//                                    upper cluster).
//   * PTQ1 wide + PTQ3 wide       -> UPPER-OUTLIER against a
//                                    uniformly-low floor (Q1 and
//                                    Q3 both small; only the peak
//                                    stretches the range).
//
// Concretely, on pool [1x5, 10x5] the sorted lower half [1,1,1,1,1]
// gives Q1 = 1 (PTQ1 = 9), but the sorted upper half [10,10,10,10,10]
// gives Q3 = 10 so PTQ3 = 9/10 = 0.9 (tight). Symmetric bimodal
// splits therefore read WIDE on PTQ1 and TIGHT on PTQ3 in the same
// tick -- a first-class regime label that (PTQ1 wide + PTQ3 tight)
// picks out even when the pool_count is small.
//
// On the UPPER-OUTLIER pool [1x9, 10] Q1 = 1 (PTQ1 = 9) AND
// Q3 = 1 (PTQ3 = 9) because the upper half [1,1,1,1,10] has
// median 1. So a single-peak outlier against a flat floor reads
// wide on BOTH surfaces, distinct from the bimodal-symmetric regime.
//
// Well-defined for every pool with pool_count >= 1:
//   * pool_count 0                  -> ptq3 null (empty pool).
//   * pool_count 1                  -> ptq3 null (solo -- range = 0
//                                     and Q3 = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> ptq3 null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptq3 null (q3_zero --
//     Q3 == 0                         unreachable since counts >= 1 so
//                                     the upper-half median is >= 1
//                                     but guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptq3 in [0, +Inf) rounded to 4
//     Q3 > 0                          decimals. Zero iff max == min
//                                     (flat pool).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, Q3 k, ptq3 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sorted [1..10], upper half
//                                     [6,7,8,9,10], Q3 = median = 8,
//                                     range 9, ptq3 = 9/8 = 1.125
//                                     (tight).
//   * upper-outlier [1x9, 10]       -> sorted upper half [1,1,1,1,10],
//                                     Q3 = 1, range 9, ptq3 9.0
//                                     (wide -- SINGLE-OUTLIER against
//                                     flat floor flagged wide, same
//                                     verdict as PTQ1).
//   * two-shoulders [1x8, 5x2]      -> sorted upper half [1,1,1,5,5],
//                                     Q3 = 1, range 4, ptq3 4.0
//                                     (spread).
//   * 50/50 split [1x5, 10x5]       -> sorted upper half [10,10,10,
//                                     10,10], Q3 = 10, range 9, ptq3
//                                     0.9 (tight -- BIMODAL SYMMETRIC
//                                     split flagged tight where PTQ1
//                                     reads wide).
//   * extreme outlier [1x9, 100]    -> Q3 = 1, range 99, ptq3 99.0
//                                     (wide).
//   * two-partner [1, 9]            -> sorted [1, 9], upper half [9],
//                                     Q3 = 9, range 8, ptq3 0.8889
//                                     (tight -- two-partner top-lean
//                                     pool reads tight on PTQ3 where
//                                     PTQ1 reads wide).
//   * two-partner [1, 100]          -> Q3 = 100, range 99, ptq3
//                                     0.99 (tight).
//   * small [10, 1, 1]              -> sorted [1, 1, 10], upper half
//                                     [10], Q3 = 10, range 9, ptq3
//                                     0.9 (tight).
//   * small [1, 1, 10]              -> identical to above (rank-order
//                                     invariant).
//
// Bands on raw ptq3 (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp + bimodal + top-lean two-
// partner all land in tight, two-shoulders lands in spread, and
// single-outlier pools land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR Q3 == 0 (guarded but unreachable)
//   * tight                ptq3 < 2.0 (flat, uniform ramp, bimodal-
//                          symmetric, top-lean two-partner regimes)
//   * spread               ptq3 in [2.0, 5.0) (two-shoulders regime)
//   * wide                 ptq3 >= 5.0 (single-outlier + extreme-
//                          outlier regimes where the peak sits above
//                          a uniformly-low floor)
//
// Both cutoffs are exposed on the envelope as tight_ptq3_max /
// wide_ptq3_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptq3 = MORE range against upper-shoulder = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM
// + P11.242 PTQ1 tight/spread/wide vocabulary). Reuses the exact
// 3-band label set so a reader scanning the DISPERSION additive/
// ratio family sees the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.245):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQ1Section
// (P11.242) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-upper-hinge after
// the P11.242 range-against-lower-hinge landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) ->
// ... -> GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) -> PEAK-TO-Q1
// (P11.242) -> PEAK-TO-Q3 (this module) -> per-pair hot-cells
// GRANULAR (P11.139).

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
type Ptq3Label =
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

// Bands on raw ptq3 (fixed cutoffs since Q3 scales with cell counts
// and typical upper-shoulder emissions land near 1-10 for the P11.161
// top-3 pool). Calibrated against the n=10 reference distributions
// so uniform ramp + bimodal-symmetric + top-lean two-partner read
// tight, two-shoulders reads spread, and single-outlier pools read
// wide.
const TIGHT_PTQ3_MAX = 2.0;
const WIDE_PTQ3_MIN = 5.0;

// PTQ3 rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQ3_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQ3Band {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_q3: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_q3: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ3Bands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQ3Band;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQ3Band;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQ3Band;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ3Entry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQ3Bands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ3Map {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQ3Entry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQ3Entry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQ3Entry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQ3Entry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptq3_max: number;
  readonly wide_ptq3_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQ3Map;
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

// Median of a sorted slice using arithmetic-midpoint for even n.
// Same convention as every other median-consuming pool-shape sibling
// (P11.195, P11.197, P11.201, P11.207, P11.209, P11.240, P11.242).
function medianOfSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q3 hinge: for odd n exclude the central value then
// take the median of the upper half; for even n split at the midpoint
// and take the median of the upper half. Standard "Method 1" from
// every intro-stats text (also matches R quantile type=1 default).
// Shared convention with P11.207 IQR + P11.209 IQR RATIO + P11.242
// peak-to-Q1 (which uses the mirror lower hinge).
function tukeyQ3(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const start = n % 2 === 1 ? half + 1 : half;
  const upper = sorted.slice(start);
  return medianOfSorted(upper);
}

// Peak-to-Q3 of a discrete distribution:
//   PTQ3 = (max - min) / Q3
// where Q3 is the Tukey EXCLUSIVE upper hinge. Returns null on empty,
// solo, degenerate, and q3_zero so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_q3: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_q3: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and Q3 = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_q3: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_q3: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const q3 = tukeyQ3(sortedAsc);
  if (q3 === 0) {
    // Q3 zero -- unreachable for count integers >= 1 (the upper-half
    // median of positive integers is >= 1) but guarded for future
    // upstream robustness. A zero Q3 would give an undefined ratio;
    // report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_q3: null };
  }
  const range = max - min;
  const ptq3 = range / q3;
  // Clamp tiny negative float-noise to 0; ptq3 is non-negative by
  // construction because range >= 0 and Q3 > 0.
  const clamped = ptq3 < 0 ? 0 : ptq3;
  return {
    pool_count,
    pool_cells,
    peak_to_q3: roundTo(clamped, PTQ3_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQ3Band {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_q3: partner.peak_to_q3,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_q3: metric.peak_to_q3,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQ3Entry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 {
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
    tight_ptq3_max: TIGHT_PTQ3_MAX,
    wide_ptq3_min: WIDE_PTQ3_MIN,
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

function labelForPtq3(
  pool_count: number,
  pool_cells: number,
  ptq3: number | null,
  tight_max: number,
  wide_min: number,
): Ptq3Label {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptq3 === null) return "degenerate";
  if (ptq3 >= wide_min) return "wide";
  if (ptq3 < tight_max) return "tight";
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

function renderPtq3Cell(
  pool_count: number,
  pool_cells: number,
  ptq3: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtq3(pool_count, pool_cells, ptq3, tight_max, wide_min);
  const ptq3Text = ptq3 === null ? "-" : ptq3.toFixed(4);
  return `PTQ3 ${ptq3Text} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptq3_max, wide_ptq3_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtq3Cell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_q3, tight_ptq3_max, wide_ptq3_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtq3Cell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_q3, tight_ptq3_max, wide_ptq3_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-Q3 across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UPPER-HINGE scalar over the P11.161 pool &mdash; ptq3 = (max - min) / Q3 where Q3 is the Tukey EXCLUSIVE upper hinge. Reads the pool's total RANGE in units of the pool's TYPICAL UPPER-HALF cell count, using Q3 as an upper-shoulder anchor so a BIMODAL SYMMETRIC split that the P11.242 peak-to-Q1 surface flags WIDE (because Q1 sits in the lower cluster) reads TIGHT here (because Q3 sits in the upper cluster where the leader lives). Unique DISPERSION-axis contribution: reads range in units of an UPPER-SHOULDER anchor &mdash; together with P11.242 PTQ1 (lower-shoulder) and P11.240 PTM (order-statistic centre) forms the complete (lower, centre, upper) triad of order-statistic anchors for the range-based dispersion read. When PTQ1 reads wide AND PTQ3 reads tight the pool is bimodal-symmetric or top-heavy; when BOTH read wide the pool is an upper-outlier against a uniformly-low floor. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR Q3 == 0 (guarded but unreachable), tight = ptq3 &lt; ${tight_ptq3_max} (flat, uniform ramp, bimodal-symmetric, top-lean two-partner regimes), spread = ptq3 in [${tight_ptq3_max}, ${wide_ptq3_min}) (two-shoulders regime), wide = ptq3 &ge; ${wide_ptq3_min} (single-outlier + extreme-outlier regimes where the peak sits above a uniformly-low floor). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptq3 null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQ3</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQ3</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
