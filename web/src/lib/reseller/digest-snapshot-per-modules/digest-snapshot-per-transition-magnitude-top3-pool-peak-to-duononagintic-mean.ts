// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUONONAGINTIC-MEAN
// pure-lib (P11.438).
//
// WHOLE-POOL RANGE-AGAINST-DUONONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUONONAGINTIC MEAN (a.k.a. power mean of order 92, M_92):
//
//   ptdnm = (max - min) / duononagintic_mean
//
// where duononagintic_mean = ((sum x_i^92) / n)^(1/92). Reads the
// peak spread against the DUONONAGINTIC (power-mean-of-order-92)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.436 PTUNM, because raising to the NINETY-SECOND power before
// averaging lifts the anchor MORE than raising to the ninety-first
// does, dampening the ratio against the range even harder.
//
// PTDNM's unique DISPERSION-axis contribution: reads range in units
// of the DUONONAGINTIC (POWER-MEAN-OF-ORDER-92) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... nonagintic M_90, unnonagintic M_91) power-mean
// TRESVIGINTISEPTUAGINTUPLET into a QUATTUORVIGINTISEPTUAGINTUPLET with
// the M_92 duononagintic mean. By Power Mean inequality M_92 >= M_91,
// so duononagintic_mean >= unnonagintic_mean and ptdnm <= ptunm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duononagintic_mean approaches x_max / n^(1/92), so ptdnm
// approaches n^(1/92) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/92) ~= 1.0253, for n=20 ~= 1.0331, for n=30 ~= 1.0377,
// for n=40 ~= 1.0409, for n=50 ~= 1.0434, for n=60 ~= 1.0455,
// for n=70 ~= 1.0473, for n=80 ~= 1.0488, for n=85 ~= 1.0495,
// for n=89 ~= 1.0500, for n=90 ~= 1.0501 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/92) ~= 1.0513)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/92) ~= 1.0513, and the pool100
// [1x99, 100] reference reads 1.0408 spread (further absorbed
// from PTUNM's 1.0414 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_92.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duononagintic_mean = k,
//                                     range 0, ptdnm 0 (tight).
//   * uniform ramp [1..10]          -> DNM ~= 9.7528, range 9,
//                                     ptdnm ~= 0.9228 (tight).
//   * upper-outlier [1x9, 10]       -> DNM ~= 9.7528, range 9,
//                                     ptdnm ~= 0.9228 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_92;
//                                     the M_91 joint collapse persists
//                                     at M_92 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/92) ~ 9.7529 in
//                                     lock-step, so ptunm's 0.9231
//                                     joint bucket at M_91 becomes a
//                                     joint 0.9228 bucket at M_92).
//   * two-shoulders [1x8, 5x2]      -> DNM ~= 4.9133, range 4,
//                                     ptdnm ~= 0.8141 (tight).
//   * 50/50 split [1x5, 10x5]       -> DNM ~= 9.9249, range 9,
//                                     ptdnm ~= 0.9068 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> DNM ~= 97.5283, range 99,
//                                     ptdnm ~= 1.0151 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/92) ~ 1.0253 asymptote).
//   * two-partner [1, 9]            -> DNM ~= 8.9324, range 8,
//                                     ptdnm ~= 0.8956 (tight).
//   * two-partner [1, 100]          -> DNM ~= 99.2494, range 99,
//                                     ptdnm ~= 0.9975 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_92; already
//                                     collapsed at M_91's 0.9976 tick
//                                     and mean_92 tips further past
//                                     the range so ptdnm rounds down
//                                     to 0.9975).
//   * small [10, 1, 1]              -> DNM ~= 9.8813, range 9,
//                                     ptdnm ~= 0.9108 (tight).
//   * pool_count=100 [1x99, 100]    -> DNM ~= 95.1176, range 99,
//                                     ptdnm ~= 1.0408 (SPREAD --
//                                     FURTHER ABSORBED from PTUNM
//                                     M_91's 1.0414 spread;
//                                     100-partner asymptote
//                                     100^(1/92) ~ 1.0513 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptdnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duononagintic_mean == 0
//   * tight                ptdnm < 1.005
//   * spread               ptdnm in [1.005, 1.09)
//   * wide                 ptdnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdnm_max /
// wide_ptdnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.439):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanSection
// (P11.437) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duononagintic-center
// after the P11.437 range-against-unnonagintic-center landing.

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
type PtdnmLabel =
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

// Bands on raw ptdnm (fixed cutoffs since duononagintic_mean scales
// with cell counts and typical duononagintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_92 is 0.9228 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0256 (M_91) to 1.0253
// (M_92), 20-partner drops from 1.0335 to 1.0331, 30-partner drops
// from 1.0381 to 1.0377, 40-partner drops from 1.0414 to 1.0409,
// 50-partner drops from 1.0439 to 1.0434, 60-partner drops from
// 1.0460 to 1.0455, 70-partner drops from 1.0478 to 1.0473,
// 80-partner drops from 1.0493 to 1.0488, 85-partner drops from
// 1.0500 to 1.0495, 89-partner drops from 1.0506 to 1.0500,
// 90-partner ~ 1.0501 -- so pool_count >= 100 (100^(1/92) ~ 1.0513)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTUNM 1.0414 spread to PTDNM
// 1.0408 spread -- FURTHER ABSORBED but stays within spread; the
// DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTDNM_MAX = 1.005;
const WIDE_PTDNM_MIN = 1.09;

// PTDNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duononagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duononagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuononaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdnm_max: number;
  readonly wide_ptdnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanMap;
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

// Peak-to-duononagintic-mean of a discrete distribution:
//   PTDNM = (max - min) / duononagintic_mean
// where duononagintic_mean = ((sum x_i^92) / n)^(1/92). Returns
// null on empty, solo, and degenerate (zero duononagintic_mean or
// non-finite ninety-second-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duononagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duononagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duononagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duononagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyTwoSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^92 = (x^8)^11 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quad
    ninetyTwoSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(ninetyTwoSum) || ninetyTwoSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duononagintic_mean: null,
    };
  }
  const duononagintic_mean = Math.pow(ninetyTwoSum / pool_count, 1 / 92);
  if (!Number.isFinite(duononagintic_mean) || duononagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duononagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdnm = range / duononagintic_mean;
  const clamped = ptdnm < 0 ? 0 : ptdnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duononagintic_mean: roundTo(clamped, PTDNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duononagintic_mean: partner.peak_to_duononagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duononagintic_mean: metric.peak_to_duononagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuononaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuononaginticMean {
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
    tight_ptdnm_max: TIGHT_PTDNM_MAX,
    wide_ptdnm_min: WIDE_PTDNM_MIN,
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

function labelForPtdnm(
  pool_count: number,
  pool_cells: number,
  ptdnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdnm === null) return "degenerate";
  if (ptdnm >= wide_min) return "wide";
  if (ptdnm < tight_max) return "tight";
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

function renderPtdnmCell(
  pool_count: number,
  pool_cells: number,
  ptdnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdnm(
    pool_count,
    pool_cells,
    ptdnm,
    tight_max,
    wide_min,
  );
  const ptdnmText = ptdnm === null ? "-" : ptdnm.toFixed(4);
  return `PTDNM ${ptdnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuononaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuononaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdnm_max, wide_ptdnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duononagintic_mean, tight_ptdnm_max, wide_ptdnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duononagintic_mean, tight_ptdnm_max, wide_ptdnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUONONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUONONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdnm = (max - min) / duononagintic_mean where duononagintic_mean = ((sum x_i^92) / n)^(1/92). Reads the pool's total RANGE in units of its DUONONAGINTIC (power-mean-of-order-92, M_92) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.436 PTUNM because raising to the NINETY-SECOND power lifts the anchor MORE than raising to the ninety-first does. Unique DISPERSION-axis contribution extends the (harmonic..unnonagintic) power-mean TRESVIGINTISEPTUAGINTUPLET into a QUATTUORVIGINTISEPTUAGINTUPLET with the M_92 duononagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdnm approaches n^(1/92) so 10-partner pools cap near 1.0253, 20-partner near 1.0331, 30-partner near 1.0377, 40-partner near 1.0409, 50-partner near 1.0434, 60-partner near 1.0455, 70-partner near 1.0473, 80-partner near 1.0488, 85-partner near 1.0495, 89-partner near 1.0500 and 90-partner near 1.0501 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/92) ~= 1.0513) are required to escape into wide with a modest outlier. Composite regime labels: PTDNM tight + PTUNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDNM 0.9228 tight -- rejoining the uniform ramp's 0.9228 for the eleventh tick in the sequence after PTUNM's 0.9231 joint bucket at M_91); PTDNM spread + PTUNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDNM 1.0151 spread); PTDNM spread + PTUNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_92 ([1x99, 100] reads 1.0408 spread after M_91's 1.0414 spread landing); PTDNM tight + PTUNM tight = ISOLATED HIGH PARTNER absorption confirmed past M_91 into M_92 ([1, 100] rounds down to 0.9975 tight after M_91's 0.9976 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duononagintic_mean == 0 (guarded but unreachable), tight = ptdnm &lt; ${tight_ptdnm_max}, spread = ptdnm in [${tight_ptdnm_max}, ${wide_ptdnm_min}), wide = ptdnm &ge; ${wide_ptdnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
