// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTOCTOGINTIC-MEAN
// pure-lib (P11.428).
//
// WHOLE-POOL RANGE-AGAINST-SEPTOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTOCTOGINTIC MEAN (a.k.a. power mean of order 87, M_87):
//
//   ptspogm = (max - min) / septoctogintic_mean
//
// where septoctogintic_mean = ((sum x_i^87) / n)^(1/87). Reads the
// peak spread against the SEPTOCTOGINTIC (power-mean-of-order-87)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.426 PTSOGM, because raising to the EIGHTY-SEVENTH power before
// averaging lifts the anchor MORE than raising to the eighty-sixth
// does, dampening the ratio against the range even harder.
//
// PTSPOGM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTOCTOGINTIC (POWER-MEAN-OF-ORDER-87) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquoctogintic M_85, sexoctogintic M_86) power-mean
// OCTODECIMSEPTUAGINTUPLET into a NOVEMDECIMSEPTUAGINTUPLET with the
// M_87 septoctogintic mean. By Power Mean inequality M_87 >= M_86,
// so septoctogintic_mean >= sexoctogintic_mean and ptspogm <= ptsogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septoctogintic_mean approaches x_max / n^(1/87), so ptspogm
// approaches n^(1/87) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/87) ~= 1.0268, for n=20 ~= 1.0350, for n=30 ~= 1.0399,
// for n=40 ~= 1.0433, for n=50 ~= 1.0460, for n=60 ~= 1.0482,
// for n=70 ~= 1.0500, for n=80 ~= 1.0517, for n=85 ~= 1.0524,
// for n=89 ~= 1.0529 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/87) ~= 1.0544) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/87) ~= 1.0544, and the pool100 [1x99, 100] reference reads
// 1.0438 spread (further absorbed from PTSOGM's 1.0445 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_87.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septoctogintic_mean = k,
//                                     range 0, ptspogm 0 (tight).
//   * uniform ramp [1..10]          -> SPOGM ~= 9.7388, range 9,
//                                     ptspogm ~= 0.9241 (tight).
//   * upper-outlier [1x9, 10]       -> SPOGM ~= 9.7388, range 9,
//                                     ptspogm ~= 0.9241 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_87;
//                                     the M_86 joint collapse persists
//                                     at M_87 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/87) ~ 9.7388 in
//                                     lock-step, so ptsogm's 0.9244
//                                     joint bucket at M_86 remains a
//                                     joint 0.9241 bucket at M_87).
//   * two-shoulders [1x8, 5x2]      -> SPOGM ~= 4.9084, range 4,
//                                     ptspogm ~= 0.8149 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPOGM ~= 9.9206, range 9,
//                                     ptspogm ~= 0.9072 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPOGM ~= 97.3881, range 99,
//                                     ptspogm ~= 1.0166 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/87) ~ 1.0268 asymptote).
//   * two-partner [1, 9]            -> SPOGM ~= 8.9286, range 8,
//                                     ptspogm ~= 0.8960 (tight).
//   * two-partner [1, 100]          -> SPOGM ~= 99.2064, range 99,
//                                     ptspogm ~= 0.9979 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTSOGM's 0.9980
//                                     tick; mean_87 tips further past
//                                     the range, so ptspogm rounds to
//                                     0.9979 from below).
//   * small [10, 1, 1]              -> SPOGM ~= 9.8745, range 9,
//                                     ptspogm ~= 0.9114 (tight).
//   * pool_count=100 [1x99, 100]    -> SPOGM ~= 94.8444, range 99,
//                                     ptspogm ~= 1.0438 (SPREAD --
//                                     FURTHER ABSORBED from PTSOGM
//                                     M_86's 1.0445 spread;
//                                     100-partner asymptote
//                                     100^(1/87) ~ 1.0544 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptspogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septoctogintic_mean == 0
//   * tight                ptspogm < 1.005
//   * spread               ptspogm in [1.005, 1.09)
//   * wide                 ptspogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspogm_max /
// wide_ptspogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.429):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanSection
// (P11.427) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septoctogintic-center
// after the P11.427 range-against-sexoctogintic-center landing.

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
type PtspogmLabel =
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

// Bands on raw ptspogm (fixed cutoffs since septoctogintic_mean scales
// with cell counts and typical septoctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_87 is 0.9241 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0271 (M_86) to 1.0268
// (M_87), 20-partner drops from 1.0354 to 1.0350, 30-partner drops
// from 1.0403 to 1.0399, 40-partner drops from 1.0438 to 1.0433,
// 50-partner drops from 1.0465 to 1.0460, 60-partner drops from
// 1.0488 to 1.0482, 70-partner drops from 1.0506 to 1.0500,
// 80-partner drops from 1.0523 to 1.0517, 85-partner drops from
// 1.0530 to 1.0524, 89-partner drops from 1.0536 to 1.0529 -- so
// pool_count >= 100 (100^(1/87) ~ 1.0544) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTSOGM 1.0445 spread to PTSPOGM 1.0438
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPOGM_MAX = 1.005;
const WIDE_PTSPOGM_MIN = 1.09;

// PTSPOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspogm_max: number;
  readonly wide_ptspogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanMap;
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

// Peak-to-septoctogintic-mean of a discrete distribution:
//   PTSPOGM = (max - min) / septoctogintic_mean
// where septoctogintic_mean = ((sum x_i^87) / n)^(1/87). Returns
// null on empty, solo, and degenerate (zero septoctogintic_mean or
// non-finite eighty-seventh-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightySevenSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const hex = quad * sq;
    const sept = hex * v;
    const oct = quad * quad;
    // x^87 = (x^8)^10 * x^7 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * sept
    eightySevenSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * sept;
  }
  if (!Number.isFinite(eightySevenSum) || eightySevenSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septoctogintic_mean: null,
    };
  }
  const septoctogintic_mean = Math.pow(eightySevenSum / pool_count, 1 / 87);
  if (
    !Number.isFinite(septoctogintic_mean) ||
    septoctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptspogm = range / septoctogintic_mean;
  const clamped = ptspogm < 0 ? 0 : ptspogm;
  return {
    pool_count,
    pool_cells,
    peak_to_septoctogintic_mean: roundTo(clamped, PTSPOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septoctogintic_mean:
      partner.peak_to_septoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septoctogintic_mean:
      metric.peak_to_septoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMean {
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
    tight_ptspogm_max: TIGHT_PTSPOGM_MAX,
    wide_ptspogm_min: WIDE_PTSPOGM_MIN,
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

function labelForPtspogm(
  pool_count: number,
  pool_cells: number,
  ptspogm: number | null,
  tight_max: number,
  wide_min: number,
): PtspogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspogm === null) return "degenerate";
  if (ptspogm >= wide_min) return "wide";
  if (ptspogm < tight_max) return "tight";
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

function renderPtspogmCell(
  pool_count: number,
  pool_cells: number,
  ptspogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspogm(
    pool_count,
    pool_cells,
    ptspogm,
    tight_max,
    wide_min,
  );
  const ptspogmText = ptspogm === null ? "-" : ptspogm.toFixed(4);
  return `PTSPOGM ${ptspogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspogm_max, wide_ptspogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septoctogintic_mean, tight_ptspogm_max, wide_ptspogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septoctogintic_mean, tight_ptspogm_max, wide_ptspogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspogm = (max - min) / septoctogintic_mean where septoctogintic_mean = ((sum x_i^87) / n)^(1/87). Reads the pool's total RANGE in units of its SEPTOCTOGINTIC (power-mean-of-order-87, M_87) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.426 PTSOGM because raising to the EIGHTY-SEVENTH power lifts the anchor MORE than raising to the eighty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sexoctogintic) power-mean OCTODECIMSEPTUAGINTUPLET into a NOVEMDECIMSEPTUAGINTUPLET with the M_87 septoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspogm approaches n^(1/87) so 10-partner pools cap near 1.0268, 20-partner near 1.0350, 30-partner near 1.0399, 40-partner near 1.0433, 50-partner near 1.0460, 60-partner near 1.0482, 70-partner near 1.0500, 80-partner near 1.0517, 85-partner near 1.0524 and 89-partner near 1.0529 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/87) ~= 1.0544) are required to escape into wide with a modest outlier. Composite regime labels: PTSPOGM tight + PTSOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPOGM 0.9241 tight -- rejoining the uniform ramp's 0.9241 for the sixth tick in the sequence after PTSOGM's 0.9244 joint bucket at M_86); PTSPOGM spread + PTSOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPOGM 1.0166 spread); PTSPOGM spread + PTSOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_87 ([1x99, 100] reads 1.0438 spread after M_86's 1.0445 spread landing); PTSPOGM tight + PTSOGM tight = ISOLATED HIGH PARTNER continues absorption past M_86 into M_87 ([1, 100] reads 0.9979 tight after M_86's 0.9980 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septoctogintic_mean == 0 (guarded but unreachable), tight = ptspogm &lt; ${tight_ptspogm_max}, spread = ptspogm in [${tight_ptspogm_max}, ${wide_ptspogm_min}), wide = ptspogm &ge; ${wide_ptspogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
