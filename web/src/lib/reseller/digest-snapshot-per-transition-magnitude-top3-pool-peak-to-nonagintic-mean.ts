// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NONAGINTIC-MEAN
// pure-lib (P11.434).
//
// WHOLE-POOL RANGE-AGAINST-NONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NONAGINTIC MEAN (a.k.a. power mean of order 90, M_90):
//
//   ptngm = (max - min) / nonagintic_mean
//
// where nonagintic_mean = ((sum x_i^90) / n)^(1/90). Reads the
// peak spread against the NONAGINTIC (power-mean-of-order-90)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.432 PTNOGM, because raising to the NINETIETH power before
// averaging lifts the anchor MORE than raising to the eighty-ninth
// does, dampening the ratio against the range even harder.
//
// PTNGM's unique DISPERSION-axis contribution: reads range in units
// of the NONAGINTIC (POWER-MEAN-OF-ORDER-90) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octoctogintic M_88, novemoctogintic M_89) power-mean
// UNVIGINTISEPTUAGINTUPLET into a DUOVIGINTISEPTUAGINTUPLET with the
// M_90 nonagintic mean. By Power Mean inequality M_90 >= M_89,
// so nonagintic_mean >= novemoctogintic_mean and ptngm <= ptnogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// nonagintic_mean approaches x_max / n^(1/90), so ptngm
// approaches n^(1/90) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/90) ~= 1.0259, for n=20 ~= 1.0338, for n=30 ~= 1.0385,
// for n=40 ~= 1.0418, for n=50 ~= 1.0444, for n=60 ~= 1.0465,
// for n=70 ~= 1.0483, for n=80 ~= 1.0499, for n=85 ~= 1.0506,
// for n=89 ~= 1.0511, for n=90 ~= 1.0513 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/90) ~= 1.0525)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/90) ~= 1.0525, and the pool100
// [1x99, 100] reference reads 1.0420 spread (further absorbed
// from PTNOGM's 1.0426 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_90.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> nonagintic_mean = k,
//                                     range 0, ptngm 0 (tight).
//   * uniform ramp [1..10]          -> NGM ~= 9.7474, range 9,
//                                     ptngm ~= 0.9233 (tight).
//   * upper-outlier [1x9, 10]       -> NGM ~= 9.7474, range 9,
//                                     ptngm ~= 0.9233 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_90;
//                                     the M_89 joint collapse persists
//                                     at M_90 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/90) ~ 9.7474 in
//                                     lock-step, so ptnogm's 0.9236
//                                     joint bucket at M_89 becomes a
//                                     joint 0.9233 bucket at M_90).
//   * two-shoulders [1x8, 5x2]      -> NGM ~= 4.9114, range 4,
//                                     ptngm ~= 0.8144 (tight).
//   * 50/50 split [1x5, 10x5]       -> NGM ~= 9.9233, range 9,
//                                     ptngm ~= 0.9070 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NGM ~= 97.4740, range 99,
//                                     ptngm ~= 1.0157 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/90) ~ 1.0259 asymptote).
//   * two-partner [1, 9]            -> NGM ~= 8.9310, range 8,
//                                     ptngm ~= 0.8958 (tight).
//   * two-partner [1, 100]          -> NGM ~= 99.2328, range 99,
//                                     ptngm ~= 0.9977 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_90; already
//                                     collapsed at M_89's 0.9977 tick
//                                     and mean_90 tips further past
//                                     the range so ptngm stays 0.9977).
//   * small [10, 1, 1]              -> NGM ~= 9.8787, range 9,
//                                     ptngm ~= 0.9111 (tight).
//   * pool_count=100 [1x99, 100]    -> NGM ~= 95.0119, range 99,
//                                     ptngm ~= 1.0420 (SPREAD --
//                                     FURTHER ABSORBED from PTNOGM
//                                     M_89's 1.0426 spread;
//                                     100-partner asymptote
//                                     100^(1/90) ~ 1.0525 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptngm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR nonagintic_mean == 0
//   * tight                ptngm < 1.005
//   * spread               ptngm in [1.005, 1.09)
//   * wide                 ptngm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptngm_max /
// wide_ptngm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.435):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanSection
// (P11.433) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-nonagintic-center
// after the P11.433 range-against-novemoctogintic-center landing.

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
type PtngmLabel =
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

// Bands on raw ptngm (fixed cutoffs since nonagintic_mean scales
// with cell counts and typical nonagintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_90 is 0.9233 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0262 (M_89) to 1.0259
// (M_90), 20-partner drops from 1.0342 to 1.0338, 30-partner drops
// from 1.0390 to 1.0385, 40-partner drops from 1.0423 to 1.0418,
// 50-partner drops from 1.0449 to 1.0444, 60-partner drops from
// 1.0471 to 1.0465, 70-partner drops from 1.0489 to 1.0483,
// 80-partner drops from 1.0505 to 1.0499, 85-partner drops from
// 1.0512 to 1.0506, 89-partner drops from 1.0517 to 1.0511,
// 90-partner ~ 1.0513 -- so pool_count >= 100 (100^(1/90) ~ 1.0525)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTNOGM 1.0426 spread to PTNGM
// 1.0420 spread -- FURTHER ABSORBED but stays within spread; the
// DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTNGM_MAX = 1.005;
const WIDE_PTNGM_MIN = 1.09;

// PTNGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_nonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_nonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptngm_max: number;
  readonly wide_ptngm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanMap;
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

// Peak-to-nonagintic-mean of a discrete distribution:
//   PTNGM = (max - min) / nonagintic_mean
// where nonagintic_mean = ((sum x_i^90) / n)^(1/90). Returns
// null on empty, solo, and degenerate (zero nonagintic_mean or
// non-finite ninetieth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_nonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_nonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_nonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_nonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetySum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^90 = (x^8)^11 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * sq
    ninetySum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(ninetySum) || ninetySum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_nonagintic_mean: null,
    };
  }
  const nonagintic_mean = Math.pow(ninetySum / pool_count, 1 / 90);
  if (!Number.isFinite(nonagintic_mean) || nonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_nonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptngm = range / nonagintic_mean;
  const clamped = ptngm < 0 ? 0 : ptngm;
  return {
    pool_count,
    pool_cells,
    peak_to_nonagintic_mean: roundTo(clamped, PTNGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_nonagintic_mean: partner.peak_to_nonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_nonagintic_mean: metric.peak_to_nonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonaginticMean {
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
    tight_ptngm_max: TIGHT_PTNGM_MAX,
    wide_ptngm_min: WIDE_PTNGM_MIN,
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

function labelForPtngm(
  pool_count: number,
  pool_cells: number,
  ptngm: number | null,
  tight_max: number,
  wide_min: number,
): PtngmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptngm === null) return "degenerate";
  if (ptngm >= wide_min) return "wide";
  if (ptngm < tight_max) return "tight";
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

function renderPtngmCell(
  pool_count: number,
  pool_cells: number,
  ptngm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtngm(
    pool_count,
    pool_cells,
    ptngm,
    tight_max,
    wide_min,
  );
  const ptngmText = ptngm === null ? "-" : ptngm.toFixed(4);
  return `PTNGM ${ptngmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptngm_max, wide_ptngm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtngmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_nonagintic_mean, tight_ptngm_max, wide_ptngm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtngmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_nonagintic_mean, tight_ptngm_max, wide_ptngm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptngm = (max - min) / nonagintic_mean where nonagintic_mean = ((sum x_i^90) / n)^(1/90). Reads the pool's total RANGE in units of its NONAGINTIC (power-mean-of-order-90, M_90) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.432 PTNOGM because raising to the NINETIETH power lifts the anchor MORE than raising to the eighty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemoctogintic) power-mean UNVIGINTISEPTUAGINTUPLET into a DUOVIGINTISEPTUAGINTUPLET with the M_90 nonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptngm approaches n^(1/90) so 10-partner pools cap near 1.0259, 20-partner near 1.0338, 30-partner near 1.0385, 40-partner near 1.0418, 50-partner near 1.0444, 60-partner near 1.0465, 70-partner near 1.0483, 80-partner near 1.0499, 85-partner near 1.0506, 89-partner near 1.0511 and 90-partner near 1.0513 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/90) ~= 1.0525) are required to escape into wide with a modest outlier. Composite regime labels: PTNGM tight + PTNOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNGM 0.9233 tight -- rejoining the uniform ramp's 0.9233 for the ninth tick in the sequence after PTNOGM's 0.9236 joint bucket at M_89); PTNGM spread + PTNOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNGM 1.0157 spread); PTNGM spread + PTNOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_90 ([1x99, 100] reads 1.0420 spread after M_89's 1.0426 spread landing); PTNGM tight + PTNOGM tight = ISOLATED HIGH PARTNER absorption confirmed past M_89 into M_90 ([1, 100] stays 0.9977 tight after M_89's 0.9977 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR nonagintic_mean == 0 (guarded but unreachable), tight = ptngm &lt; ${tight_ptngm_max}, spread = ptngm in [${tight_ptngm_max}, ${wide_ptngm_min}), wide = ptngm &ge; ${wide_ptngm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptngm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
