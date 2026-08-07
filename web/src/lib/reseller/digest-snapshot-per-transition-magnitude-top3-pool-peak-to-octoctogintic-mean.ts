// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOCTOGINTIC-MEAN
// pure-lib (P11.430).
//
// WHOLE-POOL RANGE-AGAINST-OCTOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOCTOGINTIC MEAN (a.k.a. power mean of order 88, M_88):
//
//   ptoogm = (max - min) / octoctogintic_mean
//
// where octoctogintic_mean = ((sum x_i^88) / n)^(1/88). Reads the
// peak spread against the OCTOCTOGINTIC (power-mean-of-order-88)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.428 PTSPOGM, because raising to the EIGHTY-EIGHTH power before
// averaging lifts the anchor MORE than raising to the eighty-seventh
// does, dampening the ratio against the range even harder.
//
// PTOOGM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOCTOGINTIC (POWER-MEAN-OF-ORDER-88) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sexoctogintic M_86, septoctogintic M_87) power-mean
// NOVEMDECIMSEPTUAGINTUPLET into a VIGINTISEPTUAGINTUPLET with the
// M_88 octoctogintic mean. By Power Mean inequality M_88 >= M_87,
// so octoctogintic_mean >= septoctogintic_mean and ptoogm <= ptspogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octoctogintic_mean approaches x_max / n^(1/88), so ptoogm
// approaches n^(1/88) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/88) ~= 1.0265, for n=20 ~= 1.0346, for n=30 ~= 1.0394,
// for n=40 ~= 1.0428, for n=50 ~= 1.0455, for n=60 ~= 1.0476,
// for n=70 ~= 1.0495, for n=80 ~= 1.0511, for n=85 ~= 1.0518,
// for n=89 ~= 1.0523 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/88) ~= 1.0537) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/88) ~= 1.0537, and the pool100 [1x99, 100] reference reads
// 1.0432 spread (further absorbed from PTSPOGM's 1.0438 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_88.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octoctogintic_mean = k,
//                                     range 0, ptoogm 0 (tight).
//   * uniform ramp [1..10]          -> OOGM ~= 9.7417, range 9,
//                                     ptoogm ~= 0.9239 (tight).
//   * upper-outlier [1x9, 10]       -> OOGM ~= 9.7417, range 9,
//                                     ptoogm ~= 0.9239 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_88;
//                                     the M_87 joint collapse persists
//                                     at M_88 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/88) ~ 9.7417 in
//                                     lock-step, so ptspogm's 0.9241
//                                     joint bucket at M_87 remains a
//                                     joint 0.9239 bucket at M_88).
//   * two-shoulders [1x8, 5x2]      -> OOGM ~= 4.9094, range 4,
//                                     ptoogm ~= 0.8148 (tight).
//   * 50/50 split [1x5, 10x5]       -> OOGM ~= 9.9215, range 9,
//                                     ptoogm ~= 0.9071 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> OOGM ~= 97.4174, range 99,
//                                     ptoogm ~= 1.0162 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/88) ~ 1.0265 asymptote).
//   * two-partner [1, 9]            -> OOGM ~= 8.9294, range 8,
//                                     ptoogm ~= 0.8959 (tight).
//   * two-partner [1, 100]          -> OOGM ~= 99.2154, range 99,
//                                     ptoogm ~= 0.9978 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTSPOGM's 0.9979
//                                     tick; mean_88 tips further past
//                                     the range, so ptoogm rounds to
//                                     0.9978 from below).
//   * small [10, 1, 1]              -> OOGM ~= 9.8759, range 9,
//                                     ptoogm ~= 0.9113 (tight).
//   * pool_count=100 [1x99, 100]    -> OOGM ~= 94.9014, range 99,
//                                     ptoogm ~= 1.0432 (SPREAD --
//                                     FURTHER ABSORBED from PTSPOGM
//                                     M_87's 1.0438 spread;
//                                     100-partner asymptote
//                                     100^(1/88) ~ 1.0537 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptoogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octoctogintic_mean == 0
//   * tight                ptoogm < 1.005
//   * spread               ptoogm in [1.005, 1.09)
//   * wide                 ptoogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptoogm_max /
// wide_ptoogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.431):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptoctoginticMeanSection
// (P11.429) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octoctogintic-center
// after the P11.429 range-against-septoctogintic-center landing.

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
type PtoogmLabel =
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

// Bands on raw ptoogm (fixed cutoffs since octoctogintic_mean scales
// with cell counts and typical octoctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_88 is 0.9239 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0268 (M_87) to 1.0265
// (M_88), 20-partner drops from 1.0350 to 1.0346, 30-partner drops
// from 1.0399 to 1.0394, 40-partner drops from 1.0433 to 1.0428,
// 50-partner drops from 1.0460 to 1.0455, 60-partner drops from
// 1.0482 to 1.0476, 70-partner drops from 1.0500 to 1.0495,
// 80-partner drops from 1.0517 to 1.0511, 85-partner drops from
// 1.0524 to 1.0518, 89-partner drops from 1.0529 to 1.0523 -- so
// pool_count >= 100 (100^(1/88) ~ 1.0537) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTSPOGM 1.0438 spread to PTOOGM 1.0432
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOOGM_MAX = 1.005;
const WIDE_PTOOGM_MIN = 1.09;

// PTOOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptoogm_max: number;
  readonly wide_ptoogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanMap;
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

// Peak-to-octoctogintic-mean of a discrete distribution:
//   PTOOGM = (max - min) / octoctogintic_mean
// where octoctogintic_mean = ((sum x_i^88) / n)^(1/88). Returns
// null on empty, solo, and degenerate (zero octoctogintic_mean or
// non-finite eighty-eighth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyEightSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^88 = (x^8)^11 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct
    eightyEightSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(eightyEightSum) || eightyEightSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoctogintic_mean: null,
    };
  }
  const octoctogintic_mean = Math.pow(eightyEightSum / pool_count, 1 / 88);
  if (
    !Number.isFinite(octoctogintic_mean) ||
    octoctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptoogm = range / octoctogintic_mean;
  const clamped = ptoogm < 0 ? 0 : ptoogm;
  return {
    pool_count,
    pool_cells,
    peak_to_octoctogintic_mean: roundTo(clamped, PTOOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octoctogintic_mean:
      partner.peak_to_octoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octoctogintic_mean:
      metric.peak_to_octoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoctoginticMean {
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
    tight_ptoogm_max: TIGHT_PTOOGM_MAX,
    wide_ptoogm_min: WIDE_PTOOGM_MIN,
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

function labelForPtoogm(
  pool_count: number,
  pool_cells: number,
  ptoogm: number | null,
  tight_max: number,
  wide_min: number,
): PtoogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptoogm === null) return "degenerate";
  if (ptoogm >= wide_min) return "wide";
  if (ptoogm < tight_max) return "tight";
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

function renderPtoogmCell(
  pool_count: number,
  pool_cells: number,
  ptoogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtoogm(
    pool_count,
    pool_cells,
    ptoogm,
    tight_max,
    wide_min,
  );
  const ptoogmText = ptoogm === null ? "-" : ptoogm.toFixed(4);
  return `PTOOGM ${ptoogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptoogm_max, wide_ptoogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octoctogintic_mean, tight_ptoogm_max, wide_ptoogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octoctogintic_mean, tight_ptoogm_max, wide_ptoogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptoogm = (max - min) / octoctogintic_mean where octoctogintic_mean = ((sum x_i^88) / n)^(1/88). Reads the pool's total RANGE in units of its OCTOCTOGINTIC (power-mean-of-order-88, M_88) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.428 PTSPOGM because raising to the EIGHTY-EIGHTH power lifts the anchor MORE than raising to the eighty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septoctogintic) power-mean NOVEMDECIMSEPTUAGINTUPLET into a VIGINTISEPTUAGINTUPLET with the M_88 octoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptoogm approaches n^(1/88) so 10-partner pools cap near 1.0265, 20-partner near 1.0346, 30-partner near 1.0394, 40-partner near 1.0428, 50-partner near 1.0455, 60-partner near 1.0476, 70-partner near 1.0495, 80-partner near 1.0511, 85-partner near 1.0518 and 89-partner near 1.0523 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/88) ~= 1.0537) are required to escape into wide with a modest outlier. Composite regime labels: PTOOGM tight + PTSPOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTOOGM 0.9239 tight -- rejoining the uniform ramp's 0.9239 for the seventh tick in the sequence after PTSPOGM's 0.9241 joint bucket at M_87); PTOOGM spread + PTSPOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOOGM 1.0162 spread); PTOOGM spread + PTSPOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_88 ([1x99, 100] reads 1.0432 spread after M_87's 1.0438 spread landing); PTOOGM tight + PTSPOGM tight = ISOLATED HIGH PARTNER continues absorption past M_87 into M_88 ([1, 100] reads 0.9978 tight after M_87's 0.9979 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octoctogintic_mean == 0 (guarded but unreachable), tight = ptoogm &lt; ${tight_ptoogm_max}, spread = ptoogm in [${tight_ptoogm_max}, ${wide_ptoogm_min}), wide = ptoogm &ge; ${wide_ptoogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptoogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
