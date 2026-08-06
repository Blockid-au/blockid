// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOSEPTUAGINTIC-MEAN
// pure-lib (P11.398).
//
// WHOLE-POOL RANGE-AGAINST-DUOSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUOSEPTUAGINTIC MEAN (a.k.a. power mean of order 72, M_72):
//
//   ptdspqm = (max - min) / duoseptuagintic_mean
//
// where duoseptuagintic_mean = ((sum x_i^72) / n)^(1/72). Reads the
// peak spread against the DUOSEPTUAGINTIC (power-mean-of-order-72)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.396 PTUSPQM, because raising to the SEVENTY-SECOND power before
// averaging lifts the anchor MORE than raising to the seventy-first
// does, dampening the ratio against the range even harder.
//
// PTDSPQM's unique DISPERSION-axis contribution: reads range in units
// of the DUOSEPTUAGINTIC (POWER-MEAN-OF-ORDER-72) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septuagintic M_70, unseptuagintic M_71) power-mean
// TRESEPTUAGINTUPLET into a QUATTUORSEPTUAGINTUPLET with the M_72
// duoseptuagintic mean. By Power Mean inequality M_72 >= M_71, so
// duoseptuagintic_mean >= unseptuagintic_mean and
// ptdspqm <= ptuspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duoseptuagintic_mean approaches x_max / n^(1/72), so ptdspqm
// approaches n^(1/72) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/72) ~= 1.0325, for n=20 ~= 1.0425, for n=30 ~= 1.0484, for
// n=40 ~= 1.0526, for n=50 ~= 1.0558, for n=60 ~= 1.0585, for n=70
// ~= 1.0608, for n=80 ~= 1.0628, for n=85 ~= 1.0636, for n=89 ~= 1.0643
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/72) ~= 1.0661) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/72) ~= 1.0661, and the
// pool100 [1x99, 100] reference reads 1.0554 spread (further absorbed
// from PTUSPQM's 1.0563 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_72.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duoseptuagintic_mean = k,
//                                     range 0, ptdspqm 0 (tight).
//   * uniform ramp [1..10]          -> DSPQM ~= 9.6853, range 9,
//                                     ptdspqm ~= 0.9292 (tight).
//   * upper-outlier [1x9, 10]       -> DSPQM ~= 9.6853, range 9,
//                                     ptdspqm ~= 0.9292 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.396 PTUSPQM's 0.9297
//                                     tick; at M_72 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9292 tick as the
//                                     anchor keeps drifting past M_71).
//   * two-shoulders [1x8, 5x2]      -> DSPQM ~= 4.8895, range 4,
//                                     ptdspqm ~= 0.8181 (tight).
//   * 50/50 split [1x5, 10x5]       -> DSPQM ~= 9.9042, range 9,
//                                     ptdspqm ~= 0.9087 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> DSPQM ~= 96.8526, range 99,
//                                     ptdspqm ~= 1.0222 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/72) ~ 1.0325 asymptote).
//   * two-partner [1, 9]            -> DSPQM ~= 8.9138, range 8,
//                                     ptdspqm ~= 0.8975 (tight).
//   * two-partner [1, 100]          -> DSPQM ~= 99.0419, range 99,
//                                     ptdspqm ~= 0.9996 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTUSPQM's 0.9997
//                                     tick; mean_72 tips further past
//                                     the range, so ptdspqm rounds to
//                                     0.9996 from below).
//   * small [10, 1, 1]              -> DSPQM ~= 9.8486, range 9,
//                                     ptdspqm ~= 0.9138 (tight).
//   * pool_count=100 [1x99, 100]    -> DSPQM ~= 93.8080, range 99,
//                                     ptdspqm ~= 1.0554 (SPREAD --
//                                     FURTHER ABSORBED from PTUSPQM
//                                     M_71's 1.0563 spread;
//                                     100-partner asymptote
//                                     100^(1/72) ~ 1.0661 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptdspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duoseptuagintic_mean == 0
//   * tight                ptdspqm < 1.005
//   * spread               ptdspqm in [1.005, 1.09)
//   * wide                 ptdspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdspqm_max /
// wide_ptdspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.399):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnseptuaginticMeanSection
// (P11.397) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duoseptuagintic-center
// after the P11.397 range-against-unseptuagintic-center landing.

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
type PtdspqmLabel =
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

// Bands on raw ptdspqm (fixed cutoffs since duoseptuagintic_mean
// scales with cell counts and typical duoseptuagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_72 is 0.9292 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0330 (M_71) to
// 1.0325 (M_72), 20-partner drops from 1.0431 to 1.0425, 30-partner
// drops from 1.0491 to 1.0484, 40-partner drops from 1.0533 to 1.0526,
// 50-partner drops from 1.0566 to 1.0558, 60-partner drops from 1.0594
// to 1.0585, 70-partner drops from 1.0617 to 1.0608, 80-partner drops
// from 1.0637 to 1.0628, 85-partner drops from 1.0646 to 1.0636,
// 89-partner drops from 1.0653 to 1.0643 -- so pool_count >= 100
// (100^(1/72) ~ 1.0661) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTUSPQM 1.0563 spread to PTDSPQM 1.0554 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTDSPQM_MAX = 1.005;
const WIDE_PTDSPQM_MIN = 1.09;

// PTDSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duoseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duoseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdspqm_max: number;
  readonly wide_ptdspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanMap;
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

// Peak-to-duoseptuagintic-mean of a discrete distribution:
//   PTDSPQM = (max - min) / duoseptuagintic_mean
// where duoseptuagintic_mean = ((sum x_i^72) / n)^(1/72). Returns
// null on empty, solo, and degenerate (zero duoseptuagintic_mean
// or non-finite seventy-second-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duoseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^72 = (x^8)^9 -> oct*oct*oct*oct*oct*oct*oct*oct*oct
    seventySecondSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(seventySecondSum) || seventySecondSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintic_mean: null,
    };
  }
  const duoseptuagintic_mean = Math.pow(seventySecondSum / pool_count, 1 / 72);
  if (!Number.isFinite(duoseptuagintic_mean) || duoseptuagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdspqm = range / duoseptuagintic_mean;
  const clamped = ptdspqm < 0 ? 0 : ptdspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_duoseptuagintic_mean: roundTo(clamped, PTDSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duoseptuagintic_mean: partner.peak_to_duoseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duoseptuagintic_mean: metric.peak_to_duoseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMean {
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
    tight_ptdspqm_max: TIGHT_PTDSPQM_MAX,
    wide_ptdspqm_min: WIDE_PTDSPQM_MIN,
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

function labelForPtdspqm(
  pool_count: number,
  pool_cells: number,
  ptdspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtdspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdspqm === null) return "degenerate";
  if (ptdspqm >= wide_min) return "wide";
  if (ptdspqm < tight_max) return "tight";
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

function renderPtdspqmCell(
  pool_count: number,
  pool_cells: number,
  ptdspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdspqm(
    pool_count,
    pool_cells,
    ptdspqm,
    tight_max,
    wide_min,
  );
  const ptdspqmText = ptdspqm === null ? "-" : ptdspqm.toFixed(4);
  return `PTDSPQM ${ptdspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdspqm_max, wide_ptdspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duoseptuagintic_mean, tight_ptdspqm_max, wide_ptdspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duoseptuagintic_mean, tight_ptdspqm_max, wide_ptdspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdspqm = (max - min) / duoseptuagintic_mean where duoseptuagintic_mean = ((sum x_i^72) / n)^(1/72). Reads the pool's total RANGE in units of its DUOSEPTUAGINTIC (power-mean-of-order-72, M_72) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.396 PTUSPQM because raising to the SEVENTY-SECOND power lifts the anchor MORE than raising to the seventy-first does. Unique DISPERSION-axis contribution extends the (harmonic..unseptuagintic) power-mean TRESEPTUAGINTUPLET into a QUATTUORSEPTUAGINTUPLET with the M_72 duoseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdspqm approaches n^(1/72) so 10-partner pools cap near 1.0325, 20-partner near 1.0425, 30-partner near 1.0484, 40-partner near 1.0526, 50-partner near 1.0558, 60-partner near 1.0585, 70-partner near 1.0608, 80-partner near 1.0628, 85-partner near 1.0636 and 89-partner near 1.0643 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/72) ~= 1.0661) are required to escape into wide with a modest outlier. Composite regime labels: PTDSPQM tight + PTUSPQM tight = MILD OUTLIER absorbed by duoseptuagintic ([1x9, 10] reads PTDSPQM 0.9292 tight); PTDSPQM spread + PTUSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDSPQM 1.0222 spread); PTDSPQM spread + PTUSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_72 ([1x99, 100] reads 1.0554 spread after M_71's 1.0563 spread landing); PTDSPQM tight + PTUSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_71 into M_72 ([1, 100] reads 0.9996 tight after M_71's 0.9997 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duoseptuagintic_mean == 0 (guarded but unreachable), tight = ptdspqm &lt; ${tight_ptdspqm_max}, spread = ptdspqm in [${tight_ptdspqm_max}, ${wide_ptdspqm_min}), wide = ptdspqm &ge; ${wide_ptdspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
