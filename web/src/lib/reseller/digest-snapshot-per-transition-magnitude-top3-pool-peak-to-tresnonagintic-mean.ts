// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESNONAGINTIC-MEAN
// pure-lib (P11.440).
//
// WHOLE-POOL RANGE-AGAINST-TRESNONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESNONAGINTIC MEAN (a.k.a. power mean of order 93, M_93):
//
//   pttnm = (max - min) / tresnonagintic_mean
//
// where tresnonagintic_mean = ((sum x_i^93) / n)^(1/93). Reads the
// peak spread against the TRESNONAGINTIC (power-mean-of-order-93)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.438 PTDNM, because raising to the NINETY-THIRD power before
// averaging lifts the anchor MORE than raising to the ninety-second
// does, dampening the ratio against the range even harder.
//
// PTTNM's unique DISPERSION-axis contribution: reads range in units
// of the TRESNONAGINTIC (POWER-MEAN-OF-ORDER-93) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... nonagintic M_90, unnonagintic M_91, duononagintic
// M_92) power-mean QUATTUORVIGINTISEPTUAGINTUPLET into a
// QUINVIGINTISEPTUAGINTUPLET with the M_93 tresnonagintic mean. By
// Power Mean inequality M_93 >= M_92, so tresnonagintic_mean >=
// duononagintic_mean and pttnm <= ptdnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tresnonagintic_mean approaches x_max / n^(1/93), so pttnm
// approaches n^(1/93) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/93) ~= 1.0251, for n=20 ~= 1.0327, for n=30 ~= 1.0372,
// for n=40 ~= 1.0405, for n=50 ~= 1.0430, for n=60 ~= 1.0450,
// for n=70 ~= 1.0467, for n=80 ~= 1.0482, for n=85 ~= 1.0489,
// for n=89 ~= 1.0494, for n=90 ~= 1.0496 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/93) ~= 1.0508)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/93) ~= 1.0508, and the pool100
// [1x99, 100] reference reads 1.0403 spread (further absorbed
// from PTDNM's 1.0408 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_93.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tresnonagintic_mean = k,
//                                     range 0, pttnm 0 (tight).
//   * uniform ramp [1..10]          -> TNM ~= 9.7555, range 9,
//                                     pttnm ~= 0.9226 (tight).
//   * upper-outlier [1x9, 10]       -> TNM ~= 9.7555, range 9,
//                                     pttnm ~= 0.9226 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_93;
//                                     the M_92 joint collapse persists
//                                     at M_93 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/93) ~ 9.7556 in
//                                     lock-step, so ptdnm's 0.9228
//                                     joint bucket at M_92 becomes a
//                                     joint 0.9226 bucket at M_93).
//   * two-shoulders [1x8, 5x2]      -> TNM ~= 4.9142, range 4,
//                                     pttnm ~= 0.8140 (tight).
//   * 50/50 split [1x5, 10x5]       -> TNM ~= 9.9257, range 9,
//                                     pttnm ~= 0.9067 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> TNM ~= 97.5545, range 99,
//                                     pttnm ~= 1.0148 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/93) ~ 1.0251 asymptote).
//   * two-partner [1, 9]            -> TNM ~= 8.9332, range 8,
//                                     pttnm ~= 0.8955 (tight).
//   * two-partner [1, 100]          -> TNM ~= 99.2575, range 99,
//                                     pttnm ~= 0.9974 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_93; already
//                                     collapsed at M_92's 0.9975 tick
//                                     and mean_93 tips further past
//                                     the range so pttnm rounds down
//                                     to 0.9974).
//   * small [10, 1, 1]              -> TNM ~= 9.8826, range 9,
//                                     pttnm ~= 0.9107 (tight).
//   * pool_count=100 [1x99, 100]    -> TNM ~= 95.1688, range 99,
//                                     pttnm ~= 1.0403 (SPREAD --
//                                     FURTHER ABSORBED from PTDNM
//                                     M_92's 1.0408 spread;
//                                     100-partner asymptote
//                                     100^(1/93) ~ 1.0508 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw pttnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tresnonagintic_mean == 0
//   * tight                pttnm < 1.005
//   * spread               pttnm in [1.005, 1.09)
//   * wide                 pttnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttnm_max /
// wide_pttnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.441):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuononaginticMeanSection
// (P11.439) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tresnonagintic-center
// after the P11.439 range-against-duononagintic-center landing.

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
type PttnmLabel =
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

// Bands on raw pttnm (fixed cutoffs since tresnonagintic_mean scales
// with cell counts and typical tresnonagintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_93 is 0.9226 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0253 (M_92) to 1.0251
// (M_93), 20-partner drops from 1.0331 to 1.0327, 30-partner drops
// from 1.0377 to 1.0372, 40-partner drops from 1.0409 to 1.0405,
// 50-partner drops from 1.0434 to 1.0430, 60-partner drops from
// 1.0455 to 1.0450, 70-partner drops from 1.0473 to 1.0467,
// 80-partner drops from 1.0488 to 1.0482, 85-partner drops from
// 1.0495 to 1.0489, 89-partner drops from 1.0500 to 1.0494,
// 90-partner ~ 1.0496 -- so pool_count >= 100 (100^(1/93) ~ 1.0508)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTDNM 1.0408 spread to PTTNM
// 1.0403 spread -- FURTHER ABSORBED but stays within spread; the
// DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTTNM_MAX = 1.005;
const WIDE_PTTNM_MIN = 1.09;

// PTTNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresnonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresnonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresnonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttnm_max: number;
  readonly wide_pttnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanMap;
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

// Peak-to-tresnonagintic-mean of a discrete distribution:
//   PTTNM = (max - min) / tresnonagintic_mean
// where tresnonagintic_mean = ((sum x_i^93) / n)^(1/93). Returns
// null on empty, solo, and degenerate (zero tresnonagintic_mean or
// non-finite ninety-third-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresnonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresnonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresnonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresnonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyThreeSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^93 = (x^8)^11 * x^5 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * v
    ninetyThreeSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(ninetyThreeSum) || ninetyThreeSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresnonagintic_mean: null,
    };
  }
  const tresnonagintic_mean = Math.pow(ninetyThreeSum / pool_count, 1 / 93);
  if (!Number.isFinite(tresnonagintic_mean) || tresnonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_tresnonagintic_mean: null,
    };
  }
  const range = max - min;
  const pttnm = range / tresnonagintic_mean;
  const clamped = pttnm < 0 ? 0 : pttnm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresnonagintic_mean: roundTo(clamped, PTTNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresnonagintic_mean: partner.peak_to_tresnonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresnonagintic_mean: metric.peak_to_tresnonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresnonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresnonaginticMean {
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
    tight_pttnm_max: TIGHT_PTTNM_MAX,
    wide_pttnm_min: WIDE_PTTNM_MIN,
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

function labelForPttnm(
  pool_count: number,
  pool_cells: number,
  pttnm: number | null,
  tight_max: number,
  wide_min: number,
): PttnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttnm === null) return "degenerate";
  if (pttnm >= wide_min) return "wide";
  if (pttnm < tight_max) return "tight";
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

function renderPttnmCell(
  pool_count: number,
  pool_cells: number,
  pttnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttnm(
    pool_count,
    pool_cells,
    pttnm,
    tight_max,
    wide_min,
  );
  const pttnmText = pttnm === null ? "-" : pttnm.toFixed(4);
  return `PTTNM ${pttnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresnonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresnonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttnm_max, wide_pttnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresnonagintic_mean, tight_pttnm_max, wide_pttnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresnonagintic_mean, tight_pttnm_max, wide_pttnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESNONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESNONAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttnm = (max - min) / tresnonagintic_mean where tresnonagintic_mean = ((sum x_i^93) / n)^(1/93). Reads the pool's total RANGE in units of its TRESNONAGINTIC (power-mean-of-order-93, M_93) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.438 PTDNM because raising to the NINETY-THIRD power lifts the anchor MORE than raising to the ninety-second does. Unique DISPERSION-axis contribution extends the (harmonic..duononagintic) power-mean QUATTUORVIGINTISEPTUAGINTUPLET into a QUINVIGINTISEPTUAGINTUPLET with the M_93 tresnonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttnm approaches n^(1/93) so 10-partner pools cap near 1.0251, 20-partner near 1.0327, 30-partner near 1.0372, 40-partner near 1.0405, 50-partner near 1.0430, 60-partner near 1.0450, 70-partner near 1.0467, 80-partner near 1.0482, 85-partner near 1.0489, 89-partner near 1.0494 and 90-partner near 1.0496 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/93) ~= 1.0508) are required to escape into wide with a modest outlier. Composite regime labels: PTTNM tight + PTDNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTNM 0.9226 tight -- rejoining the uniform ramp's 0.9226 for the twelfth tick in the sequence after PTDNM's 0.9228 joint bucket at M_92); PTTNM spread + PTDNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTNM 1.0148 spread); PTTNM spread + PTDNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_93 ([1x99, 100] reads 1.0403 spread after M_92's 1.0408 spread landing); PTTNM tight + PTDNM tight = ISOLATED HIGH PARTNER absorption confirmed past M_92 into M_93 ([1, 100] rounds down to 0.9974 tight after M_92's 0.9975 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tresnonagintic_mean == 0 (guarded but unreachable), tight = pttnm &lt; ${tight_pttnm_max}, spread = pttnm in [${tight_pttnm_max}, ${wide_pttnm_min}), wide = pttnm &ge; ${wide_pttnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
