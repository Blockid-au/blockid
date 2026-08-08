// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.568).
//
// WHOLE-POOL RANGE-AGAINST-SEPTQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SEPTQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 157, M_157):
//
//   ptspqncnm = (max - min) / septquinquagintcentinagintic_mean
//
// where septquinquagintcentinagintic_mean = ((sum x_i^157) / n)^(1/157).
// Reads the peak spread against the SEPTQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-157) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.566 PTSQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-SEVENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-sixth does,
// dampening the ratio against the range even harder. Seventh entry
// in the FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTSPQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-157)
// CENTER. Extends the (harmonic M_-1 .. sesquinquagintcentinagintic
// M_156) power-mean OCTOCTOGINTUPLET into a NOVEMOCTOGINTUPLET with
// the M_157 septquinquagintcentinagintic mean -- seventh step into
// the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM
// (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_157 >= M_156, so
// septquinquagintcentinagintic_mean >= sesquinquagintcentinagintic_mean
// and ptspqncnm <= ptsqncnm for every non-flat pool with finite folds.
//
// DOUBLE-PRECISION OVERFLOW REGIME INHERITED from M_155: 100^157 =
// 10^314 exceeds Number.MAX_VALUE (~1.7976e308), so any pool
// containing a cell with value >= 100 folds to a non-finite
// hundredSeventhPowerSum and returns null (degenerate). The
// extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] reference
// distributions were already degenerate at M_155 / M_156 and remain
// so at M_157 (the overflow threshold was crossed two orders earlier).
// Pools bounded above by x_max <= 92 (92^157 ~= 5.9e308 sits right at
// the double-precision headroom edge and typically overflows one
// order above M_156) stay finite for M_157 up to x_max ~= 91;
// the transition sits somewhere in the [91, 100) band and shifts
// down by one cell-value every couple of orders. Downstream JSONL
// consumers treat degenerate the same as any earlier degenerate
// branch -- no schema change or new label needed.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max (constrained
// to x_max < 100 to stay within the finite regime),
// septquinquagintcentinagintic_mean approaches x_max / n^(1/157),
// so ptspqncnm approaches n^(1/157) as x_max -> x_ceiling. For n=10
// the ceiling is 10^(1/157) ~= 1.0148, for n=20 ~= 1.0193, for n=30
// ~= 1.0220, for n=40 ~= 1.0239, for n=50 ~= 1.0253, for n=60
// ~= 1.0265, for n=70 ~= 1.0275, for n=80 ~= 1.0284, for n=85
// ~= 1.0288, for n=89 ~= 1.0291, for n=90 ~= 1.0291 -- all still
// just under wide -- so pools with pool_count >= 100 would be needed
// to escape into wide with a modest outlier, but such pools also
// need x_max < 100 to stay within the finite regime, so wide is
// effectively unreachable at M_157 for the [1..10] cell-value
// catalogue used in the P11.161 top-3 pool.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septquinquagintcentinagintic_mean = k,
//                                     range 0, ptspqncnm 0 (tight).
//   * uniform ramp [1..10]          -> SPQNCNM ~= 9.8544, range 9,
//                                     ptspqncnm ~= 0.9133 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTSQNCNM 0.9134 at M_156).
//   * upper-outlier [1x9, 10]       -> SPQNCNM ~= 9.8544, range 9,
//                                     ptspqncnm ~= 0.9133 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_157;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSQNCNM 0.9134 at M_156).
//   * two-shoulders [1x8, 5x2]      -> SPQNCNM ~= 4.9490, range 4,
//                                     ptspqncnm ~= 0.8082 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTSQNCNM 0.8083 at M_156).
//   * 50/50 split [1x5, 10x5]       -> SPQNCNM ~= 9.9559, range 9,
//                                     ptspqncnm ~= 0.9040 (tight --
//                                     JOINT with PTSQNCNM 0.9040 at
//                                     M_156).
//   * extreme outlier [1x9, 100]    -> hundredSeventhPowerSum non-finite,
//                                     ptspqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED from
//                                     M_155/M_156; the 100^157 term
//                                     exceeds Number.MAX_VALUE so the
//                                     fold trips the finite guard,
//                                     same as M_156's null landing).
//   * two-partner [1, 9]            -> SPQNCNM ~= 8.9604, range 8,
//                                     ptspqncnm ~= 0.8928 (tight --
//                                     JOINT with PTSQNCNM 0.8928 at
//                                     M_156).
//   * two-partner [1, 100]          -> hundredSeventhPowerSum non-finite,
//                                     ptspqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_156
//                                     was also null).
//   * small [10, 1, 1]              -> SPQNCNM ~= 9.9303, range 9,
//                                     ptspqncnm ~= 0.9063 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTSQNCNM 0.9064 at M_156).
//   * pool_count=100 [1x99, 100]    -> hundredSeventhPowerSum non-finite,
//                                     ptspqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_156
//                                     was also null).
//
// Bands on raw ptspqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septquinquagintcentinagintic_mean == 0
//                          OR hundredSeventhPowerSum non-finite (the
//                          x >= 100 overflow branch fires here at M_157)
//   * tight                ptspqncnm < 1.005
//   * spread               ptspqncnm in [1.005, 1.09)
//   * wide                 ptspqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspqncnm_max /
// wide_ptspqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.569):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanSection
// (P11.567) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septquinquagintcentinagintic-center
// after the P11.567 range-against-sesquinquagintcentinagintic-center landing.
//
// Naming: septquinquagintcentinagintic = sep (7) + quinquaginta (50) +
// centinagintic (100); abbreviation PTSPQNCNM (P-T-Sep-Quinquaginta[N=
// nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) uses the
// SP prefix pattern established at PTSPQCNM (M_147 septquadragintcentinagintic)
// to distinguish the leading "sep" segment from the plain single-Q
// prefixes. Distinct from PTSQNCNM (M_156 sesquinquagintcentinagintic)
// by the SP (sep) vs S (ses) segment split, from PTQNCNM (M_150
// quinquagintcentinagintic) by the added SP (sep) prefix rung, from
// PTSPQCNM (M_147 septquadragintcentinagintic) by the added N segment
// (quinquaginta's "-N-" middle) that swaps the quadragint root for
// the quinquaginta root, and from PTSEQQM (M_57 septquinquagintic) by
// the added centinagintic segment.

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
type PtspqncnmLabel =
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

// Bands on raw ptspqncnm (fixed cutoffs since septquinquagintcentinagintic_mean
// scales with cell counts and typical septquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_157 is 0.9133
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0149
// (M_156) to 1.0148 (M_157), 20-partner drops from 1.0194 to 1.0193,
// 30-partner drops from 1.0221 to 1.0220, 40-partner drops from
// 1.0240 to 1.0239, 50-partner drops from 1.0255 to 1.0253,
// 60-partner drops from 1.0267 to 1.0265, 70-partner drops from
// 1.0277 to 1.0275, 80-partner drops from 1.0285 to 1.0284,
// 85-partner drops from 1.0289 to 1.0288, 89-partner drops from
// 1.0292 to 1.0291, 90-partner drops from 1.0293 to 1.0291 -- and
// wide is effectively unreachable at M_157 for the [1..10] cell-value
// catalogue since pool_count >= 100 with x_max < 100 (double-precision
// finite-fold ceiling) would be required to reach wide with a modest
// outlier, and the P11.161 top-3 pool caps at pool_count 10.
const TIGHT_PTSPQNCNM_MAX = 1.005;
const WIDE_PTSPQNCNM_MIN = 1.09;

// PTSPQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspqncnm_max: number;
  readonly wide_ptspqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanMap;
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

// Peak-to-septquinquagintcentinagintic-mean of a discrete distribution:
//   PTSPQNCNM = (max - min) / septquinquagintcentinagintic_mean
// where septquinquagintcentinagintic_mean = ((sum x_i^157) / n)^(1/157).
// Returns null on empty, solo, and degenerate (zero
// septquinquagintcentinagintic_mean or non-finite hundred-and-fifty-seventh-power
// sum -- the x >= 100 overflow branch fires here at M_157) so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSeventhPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^157 = x^128 * x^16 * x^8 * x^4 * x = p128 * p16 * oct * quad * v
    // -- (128 + 16 + 8 + 4 + 1) decomposition reuses the p128 rung
    // shared with the M_128..M_156 siblings and multiplies by p16,
    // oct, quad, v to hit the next order.
    hundredSeventhPowerSum += p128 * p16 * oct * quad * v;
  }
  if (
    !Number.isFinite(hundredSeventhPowerSum) ||
    hundredSeventhPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquinquagintcentinagintic_mean: null,
    };
  }
  const septquinquagintcentinagintic_mean = Math.pow(
    hundredSeventhPowerSum / pool_count,
    1 / 157,
  );
  if (
    !Number.isFinite(septquinquagintcentinagintic_mean) ||
    septquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspqncnm = range / septquinquagintcentinagintic_mean;
  const clamped = ptspqncnm < 0 ? 0 : ptspqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septquinquagintcentinagintic_mean: roundTo(clamped, PTSPQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septquinquagintcentinagintic_mean:
      partner.peak_to_septquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septquinquagintcentinagintic_mean:
      metric.peak_to_septquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMean {
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
    tight_ptspqncnm_max: TIGHT_PTSPQNCNM_MAX,
    wide_ptspqncnm_min: WIDE_PTSPQNCNM_MIN,
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

function labelForPtspqncnm(
  pool_count: number,
  pool_cells: number,
  ptspqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtspqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspqncnm === null) return "degenerate";
  if (ptspqncnm >= wide_min) return "wide";
  if (ptspqncnm < tight_max) return "tight";
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

function renderPtspqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptspqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspqncnm(
    pool_count,
    pool_cells,
    ptspqncnm,
    tight_max,
    wide_min,
  );
  const ptspqncnmText = ptspqncnm === null ? "-" : ptspqncnm.toFixed(4);
  return `PTSPQNCNM ${ptspqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspqncnm_max, wide_ptspqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septquinquagintcentinagintic_mean, tight_ptspqncnm_max, wide_ptspqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septquinquagintcentinagintic_mean, tight_ptspqncnm_max, wide_ptspqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspqncnm = (max - min) / septquinquagintcentinagintic_mean where septquinquagintcentinagintic_mean = ((sum x_i^157) / n)^(1/157). Reads the pool's total RANGE in units of its SEPTQUINQUAGINTCENTINAGINTIC (power-mean-of-order-157, M_157) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.566 PTSQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-SEVENTH power lifts the anchor MORE than raising to the hundred-and-fifty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesquinquagintcentinagintic) power-mean OCTOCTOGINTUPLET into a NOVEMOCTOGINTUPLET with the M_157 septquinquagintcentinagintic mean, seventh step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151). DOUBLE-PRECISION OVERFLOW REGIME INHERITED from M_155/M_156: the 100^157 = 10^314 term exceeds Number.MAX_VALUE (~1.7976e308) so any pool containing a cell with value &ge; 100 folds to a non-finite hundredSeventhPowerSum and returns null (degenerate) &mdash; extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] were already degenerate at M_156 and remain so at M_157. Composite regime labels: PTSPQNCNM tight + PTSQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPQNCNM 0.9133 tight); PTSPQNCNM degenerate + PTSQNCNM degenerate = EXTREME OUTLIER OVERFLOWS INHERITED at M_157 ([1x9, 100] reads PTSPQNCNM null degenerate carried over from M_156's null); PTSPQNCNM degenerate + PTSQNCNM degenerate = 100-PARTNER RUNAWAY OUTLIER OVERFLOWS INHERITED at M_157 ([1x99, 100] reads null carried over from M_156's null); PTSPQNCNM degenerate + PTSQNCNM degenerate = ISOLATED HIGH PARTNER OVERFLOWS INHERITED at M_157 ([1, 100] reads null degenerate carried over from M_156's null). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septquinquagintcentinagintic_mean == 0 OR hundredSeventhPowerSum non-finite (the x &ge; 100 overflow branch fires here), tight = ptspqncnm &lt; ${tight_ptspqncnm_max}, spread = ptspqncnm in [${tight_ptspqncnm_max}, ${wide_ptspqncnm_min}), wide = ptspqncnm &ge; ${wide_ptspqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
