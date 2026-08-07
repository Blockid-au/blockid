// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUONAGINTIC-MEAN
// pure-lib (P11.444).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUONAGINTIC MEAN (a.k.a. power mean of order 95, M_95):
//
//   ptqingm = (max - min) / quinquonagintic_mean
//
// where quinquonagintic_mean = ((sum x_i^95) / n)^(1/95). Reads the
// peak spread against the QUINQUONAGINTIC (power-mean-of-order-95)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.442 PTQNGM, because raising to the NINETY-FIFTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-fourth does, dampening the ratio against the range even harder.
//
// PTQINGM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUONAGINTIC (POWER-MEAN-OF-ORDER-95) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... duononagintic M_92, tresnonagintic M_93,
// quattuornonagintic M_94) power-mean SEXVIGINTISEPTUAGINTUPLET into
// a SEPTEMVIGINTISEPTUAGINTUPLET with the M_95 quinquonagintic mean.
// By Power Mean inequality M_95 >= M_94, so quinquonagintic_mean >=
// quattuornonagintic_mean and ptqingm <= ptqngm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquonagintic_mean approaches x_max / n^(1/95), so ptqingm
// approaches n^(1/95) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/95) ~= 1.0245, for n=20 ~= 1.0320, for n=30 ~= 1.0365,
// for n=40 ~= 1.0396, for n=50 ~= 1.0420, for n=60 ~= 1.0440,
// for n=70 ~= 1.0457, for n=80 ~= 1.0472, for n=85 ~= 1.0479,
// for n=89 ~= 1.0484, for n=90 ~= 1.0485 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/95) ~= 1.0497)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/95) ~= 1.0497, and the pool100
// [1x99, 100] reference reads 1.0392 spread (further absorbed
// from PTQNGM's 1.0397 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_95.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquonagintic_mean = k,
//                                     range 0, ptqingm 0 (tight).
//   * uniform ramp [1..10]          -> QINGM ~= 9.7605, range 9,
//                                     ptqingm ~= 0.9221 (tight).
//   * upper-outlier [1x9, 10]       -> QINGM ~= 9.7605, range 9,
//                                     ptqingm ~= 0.9221 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_95;
//                                     the M_94 joint collapse persists
//                                     at M_95 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/95) ~ 9.7605 in
//                                     lock-step, so ptqngm's 0.9223
//                                     joint bucket at M_94 becomes a
//                                     joint 0.9221 bucket at M_95).
//   * two-shoulders [1x8, 5x2]      -> QINGM ~= 4.9160, range 4,
//                                     ptqingm ~= 0.8137 (tight).
//   * 50/50 split [1x5, 10x5]       -> QINGM ~= 9.9273, range 9,
//                                     ptqingm ~= 0.9066 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> QINGM ~= 97.6054, range 99,
//                                     ptqingm ~= 1.0143 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/95) ~ 1.0245 asymptote).
//   * two-partner [1, 9]            -> QINGM ~= 8.9346, range 8,
//                                     ptqingm ~= 0.8954 (tight).
//   * two-partner [1, 100]          -> QINGM ~= 99.2730, range 99,
//                                     ptqingm ~= 0.9972 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_95; already
//                                     collapsed at M_94's 0.9973 tick
//                                     and mean_95 tips further past
//                                     the range so ptqingm rounds down
//                                     to 0.9972).
//   * small [10, 1, 1]              -> QINGM ~= 9.8850, range 9,
//                                     ptqingm ~= 0.9105 (tight).
//   * pool_count=100 [1x99, 100]    -> QINGM ~= 95.2681, range 99,
//                                     ptqingm ~= 1.0392 (SPREAD --
//                                     FURTHER ABSORBED from PTQNGM
//                                     M_94's 1.0397 spread;
//                                     100-partner asymptote
//                                     100^(1/95) ~ 1.0497 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptqingm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquonagintic_mean == 0
//   * tight                ptqingm < 1.005
//   * spread               ptqingm in [1.005, 1.09)
//   * wide                 ptqingm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqingm_max /
// wide_ptqingm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.445):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuornonaginticMeanSection
// (P11.443) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquonagintic-center
// after the P11.443 range-against-quattuornonagintic-center landing.

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
type PtqingmLabel =
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

// Bands on raw ptqingm (fixed cutoffs since quinquonagintic_mean
// scales with cell counts and typical quinquonagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_95 is 0.9221
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0248
// (M_94) to 1.0245 (M_95), 20-partner drops from 1.0324 to 1.0320,
// 30-partner drops from 1.0368 to 1.0365, 40-partner drops from
// 1.0400 to 1.0396, 50-partner drops from 1.0425 to 1.0420,
// 60-partner drops from 1.0445 to 1.0440, 70-partner drops from
// 1.0462 to 1.0457, 80-partner drops from 1.0477 to 1.0472,
// 85-partner drops from 1.0484 to 1.0479, 89-partner drops from
// 1.0489 to 1.0484, 90-partner ~ 1.0485 -- so pool_count >= 100
// (100^(1/95) ~ 1.0497) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTQNGM
// 1.0397 spread to PTQINGM 1.0392 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTQINGM_MAX = 1.005;
const WIDE_PTQINGM_MIN = 1.09;

// PTQINGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQINGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqingm_max: number;
  readonly wide_ptqingm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanMap;
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

// Peak-to-quinquonagintic-mean of a discrete distribution:
//   PTQINGM = (max - min) / quinquonagintic_mean
// where quinquonagintic_mean = ((sum x_i^95) / n)^(1/95). Returns
// null on empty, solo, and degenerate (zero quinquonagintic_mean
// or non-finite ninety-fifth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyFiveSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^95 = (x^8)^11 * x^7 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * sq * v
    ninetyFiveSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(ninetyFiveSum) || ninetyFiveSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquonagintic_mean: null,
    };
  }
  const quinquonagintic_mean = Math.pow(ninetyFiveSum / pool_count, 1 / 95);
  if (!Number.isFinite(quinquonagintic_mean) || quinquonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqingm = range / quinquonagintic_mean;
  const clamped = ptqingm < 0 ? 0 : ptqingm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquonagintic_mean: roundTo(clamped, PTQINGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquonagintic_mean:
      partner.peak_to_quinquonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquonagintic_mean:
      metric.peak_to_quinquonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMean {
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
    tight_ptqingm_max: TIGHT_PTQINGM_MAX,
    wide_ptqingm_min: WIDE_PTQINGM_MIN,
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

function labelForPtqingm(
  pool_count: number,
  pool_cells: number,
  ptqingm: number | null,
  tight_max: number,
  wide_min: number,
): PtqingmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqingm === null) return "degenerate";
  if (ptqingm >= wide_min) return "wide";
  if (ptqingm < tight_max) return "tight";
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

function renderPtqingmCell(
  pool_count: number,
  pool_cells: number,
  ptqingm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqingm(
    pool_count,
    pool_cells,
    ptqingm,
    tight_max,
    wide_min,
  );
  const ptqingmText = ptqingm === null ? "-" : ptqingm.toFixed(4);
  return `PTQINGM ${ptqingmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqingm_max, wide_ptqingm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqingmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquonagintic_mean, tight_ptqingm_max, wide_ptqingm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqingmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquonagintic_mean, tight_ptqingm_max, wide_ptqingm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqingm = (max - min) / quinquonagintic_mean where quinquonagintic_mean = ((sum x_i^95) / n)^(1/95). Reads the pool's total RANGE in units of its QUINQUONAGINTIC (power-mean-of-order-95, M_95) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.442 PTQNGM because raising to the NINETY-FIFTH power lifts the anchor MORE than raising to the ninety-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuornonagintic) power-mean SEXVIGINTISEPTUAGINTUPLET into a SEPTEMVIGINTISEPTUAGINTUPLET with the M_95 quinquonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqingm approaches n^(1/95) so 10-partner pools cap near 1.0245, 20-partner near 1.0320, 30-partner near 1.0365, 40-partner near 1.0396, 50-partner near 1.0420, 60-partner near 1.0440, 70-partner near 1.0457, 80-partner near 1.0472, 85-partner near 1.0479, 89-partner near 1.0484 and 90-partner near 1.0485 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/95) ~= 1.0497) are required to escape into wide with a modest outlier. Composite regime labels: PTQINGM tight + PTQNGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQINGM 0.9221 tight -- rejoining the uniform ramp's 0.9221 for the fourteenth tick in the sequence after PTQNGM's 0.9223 joint bucket at M_94); PTQINGM spread + PTQNGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQINGM 1.0143 spread); PTQINGM spread + PTQNGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_95 ([1x99, 100] reads 1.0392 spread after M_94's 1.0397 spread landing); PTQINGM tight + PTQNGM tight = ISOLATED HIGH PARTNER absorption confirmed past M_94 into M_95 ([1, 100] rounds down to 0.9972 tight after M_94's 0.9973 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquonagintic_mean == 0 (guarded but unreachable), tight = ptqingm &lt; ${tight_ptqingm_max}, spread = ptqingm in [${tight_ptqingm_max}, ${wide_ptqingm_min}), wide = ptqingm &ge; ${wide_ptqingm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqingm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQINGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQINGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
