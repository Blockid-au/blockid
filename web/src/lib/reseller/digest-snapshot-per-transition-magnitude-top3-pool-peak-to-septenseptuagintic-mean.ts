// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTENSEPTUAGINTIC-MEAN
// pure-lib (P11.408).
//
// WHOLE-POOL RANGE-AGAINST-SEPTENSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTENSEPTUAGINTIC MEAN (a.k.a. power mean of order 77, M_77):
//
//   ptspspqm = (max - min) / septenseptuagintic_mean
//
// where septenseptuagintic_mean = ((sum x_i^77) / n)^(1/77). Reads
// the peak spread against the SEPTENSEPTUAGINTIC (power-mean-of-
// order-77) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.406 PTSSPQM, because raising to the SEVENTY-SEVENTH
// power before averaging lifts the anchor MORE than raising to the
// seventy-sixth does, dampening the ratio against the range even harder.
//
// PTSPSPQM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTENSEPTUAGINTIC (POWER-MEAN-OF-ORDER-77) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquaseptuagintic M_75, seseptuagintic M_76)
// power-mean OCTOSEPTUAGINTUPLET into a NOVENSEPTUAGINTUPLET with the
// M_77 septenseptuagintic mean. By Power Mean inequality M_77 >= M_76,
// so septenseptuagintic_mean >= seseptuagintic_mean and
// ptspspqm <= ptsspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septenseptuagintic_mean approaches x_max / n^(1/77), so ptspspqm
// approaches n^(1/77) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/77) ~= 1.0304, for n=20 ~= 1.0397, for n=30 ~= 1.0452, for
// n=40 ~= 1.0491, for n=50 ~= 1.0521, for n=60 ~= 1.0546, for n=70
// ~= 1.0567, for n=80 ~= 1.0586, for n=85 ~= 1.0594, for n=89 ~= 1.0600
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/77) ~= 1.0616) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/77) ~= 1.0616, and the
// pool100 [1x99, 100] reference reads 1.0510 spread (further absorbed
// from PTSSPQM's 1.0518 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_77.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septenseptuagintic_mean = k,
//                                     range 0, ptspspqm 0 (tight).
//   * uniform ramp [1..10]          -> SPSPQM ~= 9.7054, range 9,
//                                     ptspspqm ~= 0.9273 (tight).
//   * upper-outlier [1x9, 10]       -> SPSPQM ~= 9.7054, range 9,
//                                     ptspspqm ~= 0.9273 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.406 PTSSPQM's 0.9277
//                                     tick; at M_77 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9273 tick as the
//                                     anchor keeps drifting past M_76).
//   * two-shoulders [1x8, 5x2]      -> SPSPQM ~= 4.8966, range 4,
//                                     ptspspqm ~= 0.8169 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPSPQM ~= 9.9104, range 9,
//                                     ptspspqm ~= 0.9081 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPSPQM ~= 97.0539, range 99,
//                                     ptspspqm ~= 1.0201 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/77) ~ 1.0304 asymptote).
//   * two-partner [1, 9]            -> SPSPQM ~= 8.9193, range 8,
//                                     ptspspqm ~= 0.8969 (tight).
//   * two-partner [1, 100]          -> SPSPQM ~= 99.1038, range 99,
//                                     ptspspqm ~= 0.9990 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTSSPQM's 0.9991
//                                     tick; mean_77 tips further past
//                                     the range, so ptspspqm rounds to
//                                     0.9990 from below).
//   * small [10, 1, 1]              -> SPSPQM ~= 9.8583, range 9,
//                                     ptspspqm ~= 0.9129 (tight).
//   * pool_count=100 [1x99, 100]    -> SPSPQM ~= 94.1946, range 99,
//                                     ptspspqm ~= 1.0510 (SPREAD --
//                                     FURTHER ABSORBED from PTSSPQM
//                                     M_76's 1.0518 spread;
//                                     100-partner asymptote
//                                     100^(1/77) ~ 1.0616 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptspspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septenseptuagintic_mean == 0
//   * tight                ptspspqm < 1.005
//   * spread               ptspspqm in [1.005, 1.09)
//   * wide                 ptspspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspspqm_max /
// wide_ptspspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.409):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanSection
// (P11.407) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septenseptuagintic-center
// after the P11.407 range-against-seseptuagintic-center landing.

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
type PtspspqmLabel =
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

// Bands on raw ptspspqm (fixed cutoffs since septenseptuagintic_mean
// scales with cell counts and typical septenseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_77 is 0.9273
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0308 (M_76) to
// 1.0304 (M_77), 20-partner drops from 1.0402 to 1.0397, 30-partner
// drops from 1.0458 to 1.0452, 40-partner drops from 1.0497 to 1.0491,
// 50-partner drops from 1.0528 to 1.0521, 60-partner drops from 1.0554
// to 1.0546, 70-partner drops from 1.0575 to 1.0567, 80-partner drops
// from 1.0594 to 1.0586, 85-partner drops from 1.0602 to 1.0594,
// 89-partner drops from 1.0609 to 1.0600 -- so pool_count >= 100
// (100^(1/77) ~ 1.0616) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTSSPQM 1.0518 spread to PTSPSPQM 1.0510 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTSPSPQM_MAX = 1.005;
const WIDE_PTSPSPQM_MIN = 1.09;

// PTSPSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septenseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septenseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspspqm_max: number;
  readonly wide_ptspspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanMap;
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

// Peak-to-septenseptuagintic-mean of a discrete distribution:
//   PTSPSPQM = (max - min) / septenseptuagintic_mean
// where septenseptuagintic_mean = ((sum x_i^77) / n)^(1/77). Returns
// null on empty, solo, and degenerate (zero septenseptuagintic_mean
// or non-finite seventy-seventh-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septenseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septenseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septenseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septenseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^77 = (x^8)^9 * x^4 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * v
    seventySeventhSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(seventySeventhSum) || seventySeventhSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septenseptuagintic_mean: null,
    };
  }
  const septenseptuagintic_mean = Math.pow(
    seventySeventhSum / pool_count,
    1 / 77,
  );
  if (
    !Number.isFinite(septenseptuagintic_mean) ||
    septenseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septenseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspspqm = range / septenseptuagintic_mean;
  const clamped = ptspspqm < 0 ? 0 : ptspspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_septenseptuagintic_mean: roundTo(clamped, PTSPSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septenseptuagintic_mean:
      partner.peak_to_septenseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septenseptuagintic_mean:
      metric.peak_to_septenseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMean {
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
    tight_ptspspqm_max: TIGHT_PTSPSPQM_MAX,
    wide_ptspspqm_min: WIDE_PTSPSPQM_MIN,
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

function labelForPtspspqm(
  pool_count: number,
  pool_cells: number,
  ptspspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtspspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspspqm === null) return "degenerate";
  if (ptspspqm >= wide_min) return "wide";
  if (ptspspqm < tight_max) return "tight";
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

function renderPtspspqmCell(
  pool_count: number,
  pool_cells: number,
  ptspspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspspqm(
    pool_count,
    pool_cells,
    ptspspqm,
    tight_max,
    wide_min,
  );
  const ptspspqmText = ptspspqm === null ? "-" : ptspspqm.toFixed(4);
  return `PTSPSPQM ${ptspspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspspqm_max, wide_ptspspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septenseptuagintic_mean, tight_ptspspqm_max, wide_ptspspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septenseptuagintic_mean, tight_ptspspqm_max, wide_ptspspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTENSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTENSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspspqm = (max - min) / septenseptuagintic_mean where septenseptuagintic_mean = ((sum x_i^77) / n)^(1/77). Reads the pool's total RANGE in units of its SEPTENSEPTUAGINTIC (power-mean-of-order-77, M_77) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.406 PTSSPQM because raising to the SEVENTY-SEVENTH power lifts the anchor MORE than raising to the seventy-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..seseptuagintic) power-mean OCTOSEPTUAGINTUPLET into a NOVENSEPTUAGINTUPLET with the M_77 septenseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspspqm approaches n^(1/77) so 10-partner pools cap near 1.0304, 20-partner near 1.0397, 30-partner near 1.0452, 40-partner near 1.0491, 50-partner near 1.0521, 60-partner near 1.0546, 70-partner near 1.0567, 80-partner near 1.0586, 85-partner near 1.0594 and 89-partner near 1.0600 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/77) ~= 1.0616) are required to escape into wide with a modest outlier. Composite regime labels: PTSPSPQM tight + PTSSPQM tight = MILD OUTLIER absorbed by septenseptuagintic ([1x9, 10] reads PTSPSPQM 0.9273 tight); PTSPSPQM spread + PTSSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPSPQM 1.0201 spread); PTSPSPQM spread + PTSSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_77 ([1x99, 100] reads 1.0510 spread after M_76's 1.0518 spread landing); PTSPSPQM tight + PTSSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_76 into M_77 ([1, 100] reads 0.9990 tight after M_76's 0.9991 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septenseptuagintic_mean == 0 (guarded but unreachable), tight = ptspspqm &lt; ${tight_ptspspqm_max}, spread = ptspspqm in [${tight_ptspspqm_max}, ${wide_ptspspqm_min}), wide = ptspspqm &ge; ${wide_ptspspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
