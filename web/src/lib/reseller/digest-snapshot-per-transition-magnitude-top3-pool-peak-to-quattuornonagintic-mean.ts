// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORNONAGINTIC-MEAN
// pure-lib (P11.442).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORNONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUATTUORNONAGINTIC MEAN (a.k.a. power mean of order 94, M_94):
//
//   ptqngm = (max - min) / quattuornonagintic_mean
//
// where quattuornonagintic_mean = ((sum x_i^94) / n)^(1/94). Reads the
// peak spread against the QUATTUORNONAGINTIC (power-mean-of-order-94)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.440 PTTNM, because raising to the NINETY-FOURTH power before
// averaging lifts the anchor MORE than raising to the ninety-third
// does, dampening the ratio against the range even harder.
//
// PTQNGM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORNONAGINTIC (POWER-MEAN-OF-ORDER-94) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... unnonagintic M_91, duononagintic M_92, tresnonagintic
// M_93) power-mean QUINVIGINTISEPTUAGINTUPLET into a
// SEXVIGINTISEPTUAGINTUPLET with the M_94 quattuornonagintic mean. By
// Power Mean inequality M_94 >= M_93, so quattuornonagintic_mean >=
// tresnonagintic_mean and ptqngm <= pttnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuornonagintic_mean approaches x_max / n^(1/94), so ptqngm
// approaches n^(1/94) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/94) ~= 1.0248, for n=20 ~= 1.0324, for n=30 ~= 1.0368,
// for n=40 ~= 1.0400, for n=50 ~= 1.0425, for n=60 ~= 1.0445,
// for n=70 ~= 1.0462, for n=80 ~= 1.0477, for n=85 ~= 1.0484,
// for n=89 ~= 1.0489, for n=90 ~= 1.0490 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/94) ~= 1.0502)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/94) ~= 1.0502, and the pool100
// [1x99, 100] reference reads 1.0397 spread (further absorbed
// from PTTNM's 1.0403 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_94.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuornonagintic_mean = k,
//                                     range 0, ptqngm 0 (tight).
//   * uniform ramp [1..10]          -> QNGM ~= 9.7581, range 9,
//                                     ptqngm ~= 0.9223 (tight).
//   * upper-outlier [1x9, 10]       -> QNGM ~= 9.7581, range 9,
//                                     ptqngm ~= 0.9223 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_94;
//                                     the M_93 joint collapse persists
//                                     at M_94 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/94) ~ 9.7581 in
//                                     lock-step, so pttnm's 0.9226
//                                     joint bucket at M_93 becomes a
//                                     joint 0.9223 bucket at M_94).
//   * two-shoulders [1x8, 5x2]      -> QNGM ~= 4.9151, range 4,
//                                     ptqngm ~= 0.8138 (tight).
//   * 50/50 split [1x5, 10x5]       -> QNGM ~= 9.9265, range 9,
//                                     ptqngm ~= 0.9067 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QNGM ~= 97.5804, range 99,
//                                     ptqngm ~= 1.0146 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/94) ~ 1.0248 asymptote).
//   * two-partner [1, 9]            -> QNGM ~= 8.9340, range 8,
//                                     ptqngm ~= 0.8955 (tight).
//   * two-partner [1, 100]          -> QNGM ~= 99.2660, range 99,
//                                     ptqngm ~= 0.9973 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_94; already
//                                     collapsed at M_93's 0.9974 tick
//                                     and mean_94 tips further past
//                                     the range so ptqngm rounds down
//                                     to 0.9973).
//   * small [10, 1, 1]              -> QNGM ~= 9.8839, range 9,
//                                     ptqngm ~= 0.9106 (tight).
//   * pool_count=100 [1x99, 100]    -> QNGM ~= 95.2191, range 99,
//                                     ptqngm ~= 1.0397 (SPREAD --
//                                     FURTHER ABSORBED from PTTNM
//                                     M_93's 1.0403 spread;
//                                     100-partner asymptote
//                                     100^(1/94) ~ 1.0502 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqngm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuornonagintic_mean == 0
//   * tight                ptqngm < 1.005
//   * spread               ptqngm in [1.005, 1.09)
//   * wide                 ptqngm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqngm_max /
// wide_ptqngm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.443):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanSection
// (P11.441) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuornonagintic-center
// after the P11.441 range-against-tresnonagintic-center landing.

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
type PtqngmLabel =
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

// Bands on raw ptqngm (fixed cutoffs since quattuornonagintic_mean
// scales with cell counts and typical quattuornonagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_94 is 0.9223
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0251
// (M_93) to 1.0248 (M_94), 20-partner drops from 1.0327 to 1.0324,
// 30-partner drops from 1.0372 to 1.0368, 40-partner drops from
// 1.0405 to 1.0400, 50-partner drops from 1.0430 to 1.0425,
// 60-partner drops from 1.0450 to 1.0445, 70-partner drops from
// 1.0467 to 1.0462, 80-partner drops from 1.0482 to 1.0477,
// 85-partner drops from 1.0489 to 1.0484, 89-partner drops from
// 1.0494 to 1.0489, 90-partner ~ 1.0490 -- so pool_count >= 100
// (100^(1/94) ~ 1.0502) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTTNM
// 1.0403 spread to PTQNGM 1.0397 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTQNGM_MAX = 1.005;
const WIDE_PTQNGM_MIN = 1.09;

// PTQNGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQNGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuornonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuornonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqngm_max: number;
  readonly wide_ptqngm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanMap;
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

// Peak-to-quattuornonagintic-mean of a discrete distribution:
//   PTQNGM = (max - min) / quattuornonagintic_mean
// where quattuornonagintic_mean = ((sum x_i^94) / n)^(1/94). Returns
// null on empty, solo, and degenerate (zero quattuornonagintic_mean
// or non-finite ninety-fourth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuornonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuornonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuornonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuornonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyFourSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^94 = (x^8)^11 * x^6 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * sq
    ninetyFourSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(ninetyFourSum) || ninetyFourSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuornonagintic_mean: null,
    };
  }
  const quattuornonagintic_mean = Math.pow(ninetyFourSum / pool_count, 1 / 94);
  if (!Number.isFinite(quattuornonagintic_mean) || quattuornonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuornonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqngm = range / quattuornonagintic_mean;
  const clamped = ptqngm < 0 ? 0 : ptqngm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuornonagintic_mean: roundTo(clamped, PTQNGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuornonagintic_mean:
      partner.peak_to_quattuornonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuornonagintic_mean:
      metric.peak_to_quattuornonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMean {
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
    tight_ptqngm_max: TIGHT_PTQNGM_MAX,
    wide_ptqngm_min: WIDE_PTQNGM_MIN,
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

function labelForPtqngm(
  pool_count: number,
  pool_cells: number,
  ptqngm: number | null,
  tight_max: number,
  wide_min: number,
): PtqngmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqngm === null) return "degenerate";
  if (ptqngm >= wide_min) return "wide";
  if (ptqngm < tight_max) return "tight";
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

function renderPtqngmCell(
  pool_count: number,
  pool_cells: number,
  ptqngm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqngm(
    pool_count,
    pool_cells,
    ptqngm,
    tight_max,
    wide_min,
  );
  const ptqngmText = ptqngm === null ? "-" : ptqngm.toFixed(4);
  return `PTQNGM ${ptqngmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqngm_max, wide_ptqngm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqngmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuornonagintic_mean, tight_ptqngm_max, wide_ptqngm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqngmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuornonagintic_mean, tight_ptqngm_max, wide_ptqngm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORNONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORNONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqngm = (max - min) / quattuornonagintic_mean where quattuornonagintic_mean = ((sum x_i^94) / n)^(1/94). Reads the pool's total RANGE in units of its QUATTUORNONAGINTIC (power-mean-of-order-94, M_94) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.440 PTTNM because raising to the NINETY-FOURTH power lifts the anchor MORE than raising to the ninety-third does. Unique DISPERSION-axis contribution extends the (harmonic..tresnonagintic) power-mean QUINVIGINTISEPTUAGINTUPLET into a SEXVIGINTISEPTUAGINTUPLET with the M_94 quattuornonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqngm approaches n^(1/94) so 10-partner pools cap near 1.0248, 20-partner near 1.0324, 30-partner near 1.0368, 40-partner near 1.0400, 50-partner near 1.0425, 60-partner near 1.0445, 70-partner near 1.0462, 80-partner near 1.0477, 85-partner near 1.0484, 89-partner near 1.0489 and 90-partner near 1.0490 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/94) ~= 1.0502) are required to escape into wide with a modest outlier. Composite regime labels: PTQNGM tight + PTTNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQNGM 0.9223 tight -- rejoining the uniform ramp's 0.9223 for the thirteenth tick in the sequence after PTTNM's 0.9226 joint bucket at M_93); PTQNGM spread + PTTNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQNGM 1.0146 spread); PTQNGM spread + PTTNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_94 ([1x99, 100] reads 1.0397 spread after M_93's 1.0403 spread landing); PTQNGM tight + PTTNM tight = ISOLATED HIGH PARTNER absorption confirmed past M_93 into M_94 ([1, 100] rounds down to 0.9973 tight after M_93's 0.9974 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuornonagintic_mean == 0 (guarded but unreachable), tight = ptqngm &lt; ${tight_ptqngm_max}, spread = ptqngm in [${tight_ptqngm_max}, ${wide_ptqngm_min}), wide = ptqngm &ge; ${wide_ptqngm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqngm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQNGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQNGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
