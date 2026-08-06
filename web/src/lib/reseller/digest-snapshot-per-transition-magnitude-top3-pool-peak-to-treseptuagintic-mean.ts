// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESEPTUAGINTIC-MEAN
// pure-lib (P11.400).
//
// WHOLE-POOL RANGE-AGAINST-TRESEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESEPTUAGINTIC MEAN (a.k.a. power mean of order 73, M_73):
//
//   pttspqm = (max - min) / treseptuagintic_mean
//
// where treseptuagintic_mean = ((sum x_i^73) / n)^(1/73). Reads the
// peak spread against the TRESEPTUAGINTIC (power-mean-of-order-73)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.398 PTDSPQM, because raising to the SEVENTY-THIRD power before
// averaging lifts the anchor MORE than raising to the seventy-second
// does, dampening the ratio against the range even harder.
//
// PTTSPQM's unique DISPERSION-axis contribution: reads range in units
// of the TRESEPTUAGINTIC (POWER-MEAN-OF-ORDER-73) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... unseptuagintic M_71, duoseptuagintic M_72) power-mean
// QUATTUORSEPTUAGINTUPLET into a QUINQUASEPTUAGINTUPLET with the M_73
// treseptuagintic mean. By Power Mean inequality M_73 >= M_72, so
// treseptuagintic_mean >= duoseptuagintic_mean and
// pttspqm <= ptdspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// treseptuagintic_mean approaches x_max / n^(1/73), so pttspqm
// approaches n^(1/73) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/73) ~= 1.0320, for n=20 ~= 1.0419, for n=30 ~= 1.0477, for
// n=40 ~= 1.0518, for n=50 ~= 1.0551, for n=60 ~= 1.0577, for n=70
// ~= 1.0599, for n=80 ~= 1.0619, for n=85 ~= 1.0627, for n=89 ~= 1.0634
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/73) ~= 1.0651) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/73) ~= 1.0651, and the
// pool100 [1x99, 100] reference reads 1.0545 spread (further absorbed
// from PTDSPQM's 1.0554 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_73.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> treseptuagintic_mean = k,
//                                     range 0, pttspqm 0 (tight).
//   * uniform ramp [1..10]          -> TSPQM ~= 9.6896, range 9,
//                                     pttspqm ~= 0.9288 (tight).
//   * upper-outlier [1x9, 10]       -> TSPQM ~= 9.6895, range 9,
//                                     pttspqm ~= 0.9288 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.398 PTDSPQM's 0.9292
//                                     tick; at M_73 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9288 tick as the
//                                     anchor keeps drifting past M_72).
//   * two-shoulders [1x8, 5x2]      -> TSPQM ~= 4.8910, range 4,
//                                     pttspqm ~= 0.8178 (tight).
//   * 50/50 split [1x5, 10x5]       -> TSPQM ~= 9.9055, range 9,
//                                     pttspqm ~= 0.9086 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> TSPQM ~= 96.8950, range 99,
//                                     pttspqm ~= 1.0217 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/73) ~ 1.0320 asymptote).
//   * two-partner [1, 9]            -> TSPQM ~= 8.9149, range 8,
//                                     pttspqm ~= 0.8974 (tight).
//   * two-partner [1, 100]          -> TSPQM ~= 99.0550, range 99,
//                                     pttspqm ~= 0.9994 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTDSPQM's 0.9996
//                                     tick; mean_73 tips further past
//                                     the range, so pttspqm rounds to
//                                     0.9994 from below).
//   * small [10, 1, 1]              -> TSPQM ~= 9.8506, range 9,
//                                     pttspqm ~= 0.9136 (tight).
//   * pool_count=100 [1x99, 100]    -> TSPQM ~= 93.8864, range 99,
//                                     pttspqm ~= 1.0545 (SPREAD --
//                                     FURTHER ABSORBED from PTDSPQM
//                                     M_72's 1.0554 spread;
//                                     100-partner asymptote
//                                     100^(1/73) ~ 1.0651 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw pttspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR treseptuagintic_mean == 0
//   * tight                pttspqm < 1.005
//   * spread               pttspqm in [1.005, 1.09)
//   * wide                 pttspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttspqm_max /
// wide_pttspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.401):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanSection
// (P11.399) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-treseptuagintic-center
// after the P11.399 range-against-duoseptuagintic-center landing.

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
type PttspqmLabel =
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

// Bands on raw pttspqm (fixed cutoffs since treseptuagintic_mean
// scales with cell counts and typical treseptuagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_73 is 0.9288 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0325 (M_72) to
// 1.0320 (M_73), 20-partner drops from 1.0425 to 1.0419, 30-partner
// drops from 1.0484 to 1.0477, 40-partner drops from 1.0526 to 1.0518,
// 50-partner drops from 1.0558 to 1.0551, 60-partner drops from 1.0585
// to 1.0577, 70-partner drops from 1.0608 to 1.0599, 80-partner drops
// from 1.0628 to 1.0619, 85-partner drops from 1.0636 to 1.0627,
// 89-partner drops from 1.0643 to 1.0634 -- so pool_count >= 100
// (100^(1/73) ~ 1.0651) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTDSPQM 1.0554 spread to PTTSPQM 1.0545 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTTSPQM_MAX = 1.005;
const WIDE_PTTSPQM_MIN = 1.09;

// PTTSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_treseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_treseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttspqm_max: number;
  readonly wide_pttspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanMap;
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

// Peak-to-treseptuagintic-mean of a discrete distribution:
//   PTTSPQM = (max - min) / treseptuagintic_mean
// where treseptuagintic_mean = ((sum x_i^73) / n)^(1/73). Returns
// null on empty, solo, and degenerate (zero treseptuagintic_mean
// or non-finite seventy-third-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_treseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_treseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_treseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_treseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^73 = (x^8)^9 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct * v
    seventyThirdSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(seventyThirdSum) || seventyThirdSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_treseptuagintic_mean: null,
    };
  }
  const treseptuagintic_mean = Math.pow(seventyThirdSum / pool_count, 1 / 73);
  if (!Number.isFinite(treseptuagintic_mean) || treseptuagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_treseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const pttspqm = range / treseptuagintic_mean;
  const clamped = pttspqm < 0 ? 0 : pttspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_treseptuagintic_mean: roundTo(clamped, PTTSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_treseptuagintic_mean: partner.peak_to_treseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_treseptuagintic_mean: metric.peak_to_treseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMean {
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
    tight_pttspqm_max: TIGHT_PTTSPQM_MAX,
    wide_pttspqm_min: WIDE_PTTSPQM_MIN,
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

function labelForPttspqm(
  pool_count: number,
  pool_cells: number,
  pttspqm: number | null,
  tight_max: number,
  wide_min: number,
): PttspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttspqm === null) return "degenerate";
  if (pttspqm >= wide_min) return "wide";
  if (pttspqm < tight_max) return "tight";
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

function renderPttspqmCell(
  pool_count: number,
  pool_cells: number,
  pttspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttspqm(
    pool_count,
    pool_cells,
    pttspqm,
    tight_max,
    wide_min,
  );
  const pttspqmText = pttspqm === null ? "-" : pttspqm.toFixed(4);
  return `PTTSPQM ${pttspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTreseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttspqm_max, wide_pttspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_treseptuagintic_mean, tight_pttspqm_max, wide_pttspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_treseptuagintic_mean, tight_pttspqm_max, wide_pttspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttspqm = (max - min) / treseptuagintic_mean where treseptuagintic_mean = ((sum x_i^73) / n)^(1/73). Reads the pool's total RANGE in units of its TRESEPTUAGINTIC (power-mean-of-order-73, M_73) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.398 PTDSPQM because raising to the SEVENTY-THIRD power lifts the anchor MORE than raising to the seventy-second does. Unique DISPERSION-axis contribution extends the (harmonic..duoseptuagintic) power-mean QUATTUORSEPTUAGINTUPLET into a QUINQUASEPTUAGINTUPLET with the M_73 treseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttspqm approaches n^(1/73) so 10-partner pools cap near 1.0320, 20-partner near 1.0419, 30-partner near 1.0477, 40-partner near 1.0518, 50-partner near 1.0551, 60-partner near 1.0577, 70-partner near 1.0599, 80-partner near 1.0619, 85-partner near 1.0627 and 89-partner near 1.0634 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/73) ~= 1.0651) are required to escape into wide with a modest outlier. Composite regime labels: PTTSPQM tight + PTDSPQM tight = MILD OUTLIER absorbed by treseptuagintic ([1x9, 10] reads PTTSPQM 0.9288 tight); PTTSPQM spread + PTDSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTSPQM 1.0217 spread); PTTSPQM spread + PTDSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_73 ([1x99, 100] reads 1.0545 spread after M_72's 1.0554 spread landing); PTTSPQM tight + PTDSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_72 into M_73 ([1, 100] reads 0.9994 tight after M_72's 0.9996 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR treseptuagintic_mean == 0 (guarded but unreachable), tight = pttspqm &lt; ${tight_pttspqm_max}, spread = pttspqm in [${tight_pttspqm_max}, ${wide_pttspqm_min}), wide = pttspqm &ge; ${wide_pttspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
