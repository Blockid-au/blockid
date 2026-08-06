// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMSEXAGINTIC-MEAN
// pure-lib (P11.392).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVEMSEXAGINTIC MEAN (a.k.a. power mean of order 69, M_69):
//
//   ptnsxqm = (max - min) / novemsexagintic_mean
//
// where novemsexagintic_mean = ((sum x_i^69) / n)^(1/69). Reads the
// peak spread against the NOVEMSEXAGINTIC (power-mean-of-order-69)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.390 PTOSXQM, because raising to the SIXTY-NINTH power before
// averaging lifts the anchor MORE than raising to the sixty-eighth
// does, dampening the ratio against the range even harder.
//
// PTNSXQM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMSEXAGINTIC (POWER-MEAN-OF-ORDER-69) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septensexagintic M_67, octosexagintic M_68) power-mean
// SEPTUAGINTUPLET into an UNSEPTUAGINTUPLET with the M_69
// novemsexagintic mean. By Power Mean inequality M_69 >= M_68, so
// novemsexagintic_mean >= octosexagintic_mean and
// ptnsxqm <= ptosxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemsexagintic_mean approaches x_max / n^(1/69), so ptnsxqm
// approaches n^(1/69) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/69) ~= 1.0339, for n=20 ~= 1.0443, for n=30 ~= 1.0505, for
// n=40 ~= 1.0549, for n=50 ~= 1.0584, for n=60 ~= 1.0612, for n=70
// ~= 1.0636, for n=80 ~= 1.0656, for n=85 ~= 1.0666, for n=89 ~= 1.0672
// -- all still just under wide -- so pools with pool_count >= 98
// (98^(1/69) ~= 1.0691) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/69) ~= 1.0696, and the
// pool100 [1x99, 100] reference reads 1.0583 spread (further absorbed
// from PTOSXQM's 1.0594 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_69.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemsexagintic_mean = k,
//                                     range 0, ptnsxqm 0 (tight).
//   * uniform ramp [1..10]          -> NSXQM ~= 9.6719, range 9,
//                                     ptnsxqm ~= 0.9305 (tight).
//   * upper-outlier [1x9, 10]       -> NSXQM ~= 9.6718, range 9,
//                                     ptnsxqm ~= 0.9305 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.390 PTOSXQM's 0.9310
//                                     tick; at M_69 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9305 tick as the
//                                     anchor keeps drifting past M_68).
//   * two-shoulders [1x8, 5x2]      -> NSXQM ~= 4.8847, range 4,
//                                     ptnsxqm ~= 0.8189 (tight).
//   * 50/50 split [1x5, 10x5]       -> NSXQM ~= 9.9000, range 9,
//                                     ptnsxqm ~= 0.9091 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NSXQM ~= 96.7180, range 99,
//                                     ptnsxqm ~= 1.0236 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/69) ~ 1.0339 asymptote).
//   * two-partner [1, 9]            -> NSXQM ~= 8.9100, range 8,
//                                     ptnsxqm ~= 0.8979 (tight).
//   * two-partner [1, 100]          -> NSXQM ~= 99.0005, range 99,
//                                     ptnsxqm ~= 1.0000 (TIGHT --
//                                     ISOLATED HIGH PARTNER has now
//                                     crossed under the novemsexagintic
//                                     centre: mean_69 > range = 99, so
//                                     ptnsxqm rounds to 1.0000 exactly
//                                     from below the 1.005 tight cut;
//                                     P11.390 PTOSXQM's 1.0001 landing
//                                     tips into 1.0000 at M_69).
//   * small [10, 1, 1]              -> NSXQM ~= 9.8421, range 9,
//                                     ptnsxqm ~= 0.9144 (tight).
//   * pool_count=100 [1x99, 100]    -> NSXQM ~= 93.5441, range 99,
//                                     ptnsxqm ~= 1.0583 (SPREAD --
//                                     FURTHER ABSORBED from PTOSXQM
//                                     M_68's 1.0594 spread;
//                                     100-partner asymptote
//                                     100^(1/69) ~ 1.0696 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptnsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemsexagintic_mean == 0
//   * tight                ptnsxqm < 1.005
//   * spread               ptnsxqm in [1.005, 1.09)
//   * wide                 ptnsxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnsxqm_max /
// wide_ptnsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.393):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanSection
// (P11.391) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemsexagintic-center
// after the P11.391 range-against-octosexagintic-center landing.

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
type PtnsxqmLabel =
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

// Bands on raw ptnsxqm (fixed cutoffs since novemsexagintic_mean
// scales with cell counts and typical novemsexagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_69 is 0.9305 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0344 (M_68) to
// 1.0339 (M_69), 20-partner drops from 1.0450 to 1.0443, 30-partner
// drops from 1.0513 to 1.0505, 40-partner drops from 1.0557 to 1.0549,
// 50-partner drops from 1.0592 to 1.0584, 60-partner drops from 1.0621
// to 1.0612, 70-partner drops from 1.0645 to 1.0636, 80-partner drops
// from 1.0666 to 1.0656, 85-partner drops from 1.0675 to 1.0666,
// 89-partner drops from 1.0682 to 1.0672 -- so pool_count >= 98
// (98^(1/69) ~ 1.0691) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTOSXQM 1.0594 spread to PTNSXQM 1.0583 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTNSXQM_MAX = 1.005;
const WIDE_PTNSXQM_MIN = 1.09;

// PTNSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemsexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemsexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnsxqm_max: number;
  readonly wide_ptnsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanMap;
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

// Peak-to-novemsexagintic-mean of a discrete distribution:
//   PTNSXQM = (max - min) / novemsexagintic_mean
// where novemsexagintic_mean = ((sum x_i^69) / n)^(1/69). Returns
// null on empty, solo, and degenerate (zero novemsexagintic_mean
// or non-finite sixty-ninth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemsexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemsexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemsexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemsexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^69 = (x^8)^8 * x^4 * x -> oct*oct*oct*oct*oct*oct*oct*oct * quad * v
    sixtyNinthSum += oct * oct * oct * oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(sixtyNinthSum) || sixtyNinthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemsexagintic_mean: null,
    };
  }
  const novemsexagintic_mean = Math.pow(sixtyNinthSum / pool_count, 1 / 69);
  if (!Number.isFinite(novemsexagintic_mean) || novemsexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemsexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnsxqm = range / novemsexagintic_mean;
  const clamped = ptnsxqm < 0 ? 0 : ptnsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemsexagintic_mean: roundTo(clamped, PTNSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemsexagintic_mean: partner.peak_to_novemsexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemsexagintic_mean: metric.peak_to_novemsexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMean {
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
    tight_ptnsxqm_max: TIGHT_PTNSXQM_MAX,
    wide_ptnsxqm_min: WIDE_PTNSXQM_MIN,
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

function labelForPtnsxqm(
  pool_count: number,
  pool_cells: number,
  ptnsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtnsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnsxqm === null) return "degenerate";
  if (ptnsxqm >= wide_min) return "wide";
  if (ptnsxqm < tight_max) return "tight";
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

function renderPtnsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptnsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnsxqm(
    pool_count,
    pool_cells,
    ptnsxqm,
    tight_max,
    wide_min,
  );
  const ptnsxqmText = ptnsxqm === null ? "-" : ptnsxqm.toFixed(4);
  return `PTNSXQM ${ptnsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemsexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnsxqm_max, wide_ptnsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemsexagintic_mean, tight_ptnsxqm_max, wide_ptnsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemsexagintic_mean, tight_ptnsxqm_max, wide_ptnsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnsxqm = (max - min) / novemsexagintic_mean where novemsexagintic_mean = ((sum x_i^69) / n)^(1/69). Reads the pool's total RANGE in units of its NOVEMSEXAGINTIC (power-mean-of-order-69, M_69) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.390 PTOSXQM because raising to the SIXTY-NINTH power lifts the anchor MORE than raising to the sixty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octosexagintic) power-mean SEPTUAGINTUPLET into an UNSEPTUAGINTUPLET with the M_69 novemsexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnsxqm approaches n^(1/69) so 10-partner pools cap near 1.0339, 20-partner near 1.0443, 30-partner near 1.0505, 40-partner near 1.0549, 50-partner near 1.0584, 60-partner near 1.0612, 70-partner near 1.0636, 80-partner near 1.0656, 85-partner near 1.0666 and 89-partner near 1.0672 (all below the wide floor); pools with pool_count &gt;= 98 (98^(1/69) ~= 1.0691) are required to escape into wide with a modest outlier. Composite regime labels: PTNSXQM tight + PTOSXQM tight = MILD OUTLIER absorbed by novemsexagintic ([1x9, 10] reads PTNSXQM 0.9305 tight); PTNSXQM spread + PTOSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNSXQM 1.0236 spread); PTNSXQM spread + PTOSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_69 ([1x99, 100] reads 1.0583 spread after M_68's 1.0594 spread landing); PTNSXQM tight + PTOSXQM tight = ISOLATED HIGH PARTNER continues absorption past M_68 into M_69 ([1, 100] reads 1.0000 tight after M_68's 1.0001 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemsexagintic_mean == 0 (guarded but unreachable), tight = ptnsxqm &lt; ${tight_ptnsxqm_max}, spread = ptnsxqm in [${tight_ptnsxqm_max}, ${wide_ptnsxqm_min}), wide = ptnsxqm &ge; ${wide_ptnsxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
