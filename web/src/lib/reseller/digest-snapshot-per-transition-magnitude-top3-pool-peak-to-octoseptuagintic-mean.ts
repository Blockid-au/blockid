// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOSEPTUAGINTIC-MEAN
// pure-lib (P11.410).
//
// WHOLE-POOL RANGE-AGAINST-OCTOSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOSEPTUAGINTIC MEAN (a.k.a. power mean of order 78, M_78):
//
//   ptospqm = (max - min) / octoseptuagintic_mean
//
// where octoseptuagintic_mean = ((sum x_i^78) / n)^(1/78). Reads the
// peak spread against the OCTOSEPTUAGINTIC (power-mean-of-order-78)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.408 PTSPSPQM, because raising to the SEVENTY-EIGHTH power before
// averaging lifts the anchor MORE than raising to the seventy-seventh
// does, dampening the ratio against the range even harder.
//
// PTOSPQM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOSEPTUAGINTIC (POWER-MEAN-OF-ORDER-78) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... seseptuagintic M_76, septenseptuagintic M_77) power-mean
// NOVENSEPTUAGINTUPLET into a DECEMSEPTUAGINTUPLET with the M_78
// octoseptuagintic mean. By Power Mean inequality M_78 >= M_77, so
// octoseptuagintic_mean >= septenseptuagintic_mean and
// ptospqm <= ptspspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octoseptuagintic_mean approaches x_max / n^(1/78), so ptospqm
// approaches n^(1/78) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/78) ~= 1.0300, for n=20 ~= 1.0392, for n=30 ~= 1.0446, for
// n=40 ~= 1.0484, for n=50 ~= 1.0514, for n=60 ~= 1.0539, for n=70
// ~= 1.0560, for n=80 ~= 1.0578, for n=85 ~= 1.0586, for n=89 ~= 1.0592
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/78) ~= 1.0608) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/78) ~= 1.0608, and the
// pool100 [1x99, 100] reference reads 1.0502 spread (further absorbed
// from PTSPSPQM's 1.0510 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_78.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octoseptuagintic_mean = k,
//                                     range 0, ptospqm 0 (tight).
//   * uniform ramp [1..10]          -> OSPQM ~= 9.7099, range 9,
//                                     ptospqm ~= 0.9270 (tight).
//   * upper-outlier [1x9, 10]       -> OSPQM ~= 9.7099, range 9,
//                                     ptospqm ~= 0.9270 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.408 PTSPSPQM's 0.9273
//                                     tick; at M_78 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9270 tick as the
//                                     anchor keeps drifting past M_77).
//   * two-shoulders [1x8, 5x2]      -> OSPQM ~= 4.8980, range 4,
//                                     ptospqm ~= 0.8167 (tight).
//   * 50/50 split [1x5, 10x5]       -> OSPQM ~= 9.9115, range 9,
//                                     ptospqm ~= 0.9080 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> OSPQM ~= 97.0916, range 99,
//                                     ptospqm ~= 1.0197 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/78) ~ 1.0300 asymptote).
//   * two-partner [1, 9]            -> OSPQM ~= 8.9204, range 8,
//                                     ptospqm ~= 0.8968 (tight).
//   * two-partner [1, 100]          -> OSPQM ~= 99.1155, range 99,
//                                     ptospqm ~= 0.9988 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTSPSPQM's 0.9990
//                                     tick; mean_78 tips further past
//                                     the range, so ptospqm rounds to
//                                     0.9988 from below).
//   * small [10, 1, 1]              -> OSPQM ~= 9.8601, range 9,
//                                     ptospqm ~= 0.9128 (tight).
//   * pool_count=100 [1x99, 100]    -> OSPQM ~= 94.2669, range 99,
//                                     ptospqm ~= 1.0502 (SPREAD --
//                                     FURTHER ABSORBED from PTSPSPQM
//                                     M_77's 1.0510 spread;
//                                     100-partner asymptote
//                                     100^(1/78) ~ 1.0608 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptospqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octoseptuagintic_mean == 0
//   * tight                ptospqm < 1.005
//   * spread               ptospqm in [1.005, 1.09)
//   * wide                 ptospqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptospqm_max /
// wide_ptospqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.411):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptenseptuaginticMeanSection
// (P11.409) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octoseptuagintic-center
// after the P11.409 range-against-septenseptuagintic-center landing.

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
type PtospqmLabel =
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

// Bands on raw ptospqm (fixed cutoffs since octoseptuagintic_mean
// scales with cell counts and typical octoseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_78 is 0.9270
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0304 (M_77) to
// 1.0300 (M_78), 20-partner drops from 1.0397 to 1.0392, 30-partner
// drops from 1.0452 to 1.0446, 40-partner drops from 1.0491 to 1.0484,
// 50-partner drops from 1.0521 to 1.0514, 60-partner drops from 1.0546
// to 1.0539, 70-partner drops from 1.0567 to 1.0560, 80-partner drops
// from 1.0586 to 1.0578, 85-partner drops from 1.0594 to 1.0586,
// 89-partner drops from 1.0600 to 1.0592 -- so pool_count >= 100
// (100^(1/78) ~ 1.0608) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTSPSPQM 1.0510 spread to PTOSPQM 1.0502 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTOSPQM_MAX = 1.005;
const WIDE_PTOSPQM_MIN = 1.09;

// PTOSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octoseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octoseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptospqm_max: number;
  readonly wide_ptospqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanMap;
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

// Peak-to-octoseptuagintic-mean of a discrete distribution:
//   PTOSPQM = (max - min) / octoseptuagintic_mean
// where octoseptuagintic_mean = ((sum x_i^78) / n)^(1/78). Returns
// null on empty, solo, and degenerate (zero octoseptuagintic_mean
// or non-finite seventy-eighth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octoseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^78 = (x^8)^9 * x^4 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * sq
    seventyEighthSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(seventyEighthSum) || seventyEighthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoseptuagintic_mean: null,
    };
  }
  const octoseptuagintic_mean = Math.pow(
    seventyEighthSum / pool_count,
    1 / 78,
  );
  if (
    !Number.isFinite(octoseptuagintic_mean) ||
    octoseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptospqm = range / octoseptuagintic_mean;
  const clamped = ptospqm < 0 ? 0 : ptospqm;
  return {
    pool_count,
    pool_cells,
    peak_to_octoseptuagintic_mean: roundTo(clamped, PTOSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octoseptuagintic_mean:
      partner.peak_to_octoseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octoseptuagintic_mean:
      metric.peak_to_octoseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMean {
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
    tight_ptospqm_max: TIGHT_PTOSPQM_MAX,
    wide_ptospqm_min: WIDE_PTOSPQM_MIN,
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

function labelForPtospqm(
  pool_count: number,
  pool_cells: number,
  ptospqm: number | null,
  tight_max: number,
  wide_min: number,
): PtospqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptospqm === null) return "degenerate";
  if (ptospqm >= wide_min) return "wide";
  if (ptospqm < tight_max) return "tight";
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

function renderPtospqmCell(
  pool_count: number,
  pool_cells: number,
  ptospqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtospqm(
    pool_count,
    pool_cells,
    ptospqm,
    tight_max,
    wide_min,
  );
  const ptospqmText = ptospqm === null ? "-" : ptospqm.toFixed(4);
  return `PTOSPQM ${ptospqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptospqm_max, wide_ptospqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtospqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octoseptuagintic_mean, tight_ptospqm_max, wide_ptospqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtospqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octoseptuagintic_mean, tight_ptospqm_max, wide_ptospqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptospqm = (max - min) / octoseptuagintic_mean where octoseptuagintic_mean = ((sum x_i^78) / n)^(1/78). Reads the pool's total RANGE in units of its OCTOSEPTUAGINTIC (power-mean-of-order-78, M_78) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.408 PTSPSPQM because raising to the SEVENTY-EIGHTH power lifts the anchor MORE than raising to the seventy-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septenseptuagintic) power-mean NOVENSEPTUAGINTUPLET into a DECEMSEPTUAGINTUPLET with the M_78 octoseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptospqm approaches n^(1/78) so 10-partner pools cap near 1.0300, 20-partner near 1.0392, 30-partner near 1.0446, 40-partner near 1.0484, 50-partner near 1.0514, 60-partner near 1.0539, 70-partner near 1.0560, 80-partner near 1.0578, 85-partner near 1.0586 and 89-partner near 1.0592 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/78) ~= 1.0608) are required to escape into wide with a modest outlier. Composite regime labels: PTOSPQM tight + PTSPSPQM tight = MILD OUTLIER absorbed by octoseptuagintic ([1x9, 10] reads PTOSPQM 0.9270 tight); PTOSPQM spread + PTSPSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOSPQM 1.0197 spread); PTOSPQM spread + PTSPSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_78 ([1x99, 100] reads 1.0502 spread after M_77's 1.0510 spread landing); PTOSPQM tight + PTSPSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_77 into M_78 ([1, 100] reads 0.9988 tight after M_77's 0.9990 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octoseptuagintic_mean == 0 (guarded but unreachable), tight = ptospqm &lt; ${tight_ptospqm_max}, spread = ptospqm in [${tight_ptospqm_max}, ${wide_ptospqm_min}), wide = ptospqm &ge; ${wide_ptospqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptospqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
