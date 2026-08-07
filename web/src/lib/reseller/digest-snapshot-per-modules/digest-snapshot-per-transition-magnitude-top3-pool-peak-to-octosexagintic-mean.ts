// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOSEXAGINTIC-MEAN
// pure-lib (P11.390).
//
// WHOLE-POOL RANGE-AGAINST-OCTOSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOSEXAGINTIC MEAN (a.k.a. power mean of order 68, M_68):
//
//   ptosxqm = (max - min) / octosexagintic_mean
//
// where octosexagintic_mean = ((sum x_i^68) / n)^(1/68). Reads the
// peak spread against the OCTOSEXAGINTIC (power-mean-of-order-68)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.388 PTSPSXQM, because raising to the SIXTY-EIGHTH power before
// averaging lifts the anchor MORE than raising to the sixty-seventh
// does, dampening the ratio against the range even harder.
//
// PTOSXQM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOSEXAGINTIC (POWER-MEAN-OF-ORDER-68) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sesexagintic M_66, septensexagintic M_67) power-mean
// NOVEMSEXAGINTUPLET into a SEPTUAGINTUPLET with the M_68
// octosexagintic mean. By Power Mean inequality M_68 >= M_67, so
// octosexagintic_mean >= septensexagintic_mean and
// ptosxqm <= ptspsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octosexagintic_mean approaches x_max / n^(1/68), so ptosxqm
// approaches n^(1/68) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/68) ~= 1.0344, for n=20 ~= 1.0450, for n=30 ~= 1.0513, for
// n=40 ~= 1.0557, for n=50 ~= 1.0592, for n=60 ~= 1.0621, for n=70
// ~= 1.0645, for n=80 ~= 1.0666, for n=85 ~= 1.0675, for n=89 ~= 1.0682
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/68) ~= 1.0696) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/68) ~= 1.0701, and the
// pool100 [1x99, 100] reference reads 1.0594 spread (further absorbed
// from PTSPSXQM's 1.0604 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_68.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octosexagintic_mean = k,
//                                     range 0, ptosxqm 0 (tight).
//   * uniform ramp [1..10]          -> OSXQM ~= 9.6672, range 9,
//                                     ptosxqm ~= 0.9310 (tight).
//   * upper-outlier [1x9, 10]       -> OSXQM ~= 9.6671, range 9,
//                                     ptosxqm ~= 0.9310 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.388 PTSPSXQM's 0.9315
//                                     tick; at M_68 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9310 tick as the
//                                     anchor keeps drifting past M_67).
//   * two-shoulders [1x8, 5x2]      -> OSXQM ~= 4.8830, range 4,
//                                     ptosxqm ~= 0.8192 (tight).
//   * 50/50 split [1x5, 10x5]       -> OSXQM ~= 9.8986, range 9,
//                                     ptosxqm ~= 0.9092 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> OSXQM ~= 96.6705, range 99,
//                                     ptosxqm ~= 1.0241 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/68) ~ 1.0344 asymptote).
//   * two-partner [1, 9]            -> OSXQM ~= 8.9087, range 8,
//                                     ptosxqm ~= 0.8980 (tight).
//   * two-partner [1, 100]          -> OSXQM ~= 98.9858, range 99,
//                                     ptosxqm ~= 1.0001 (TIGHT --
//                                     ISOLATED HIGH PARTNER stays
//                                     below the 1.005 tight boundary
//                                     at M_68; PTSPSXQM's M_67 landing
//                                     at 1.0003 already sat below
//                                     tight and PTOSXQM continues
//                                     that absorption trend).
//   * small [10, 1, 1]              -> OSXQM ~= 9.8397, range 9,
//                                     ptosxqm ~= 0.9147 (tight).
//   * pool_count=100 [1x99, 100]    -> OSXQM ~= 93.4519, range 99,
//                                     ptosxqm ~= 1.0594 (SPREAD --
//                                     FURTHER ABSORBED from PTSPSXQM
//                                     M_67's 1.0604 spread;
//                                     100-partner asymptote
//                                     100^(1/68) ~ 1.0701 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptosxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octosexagintic_mean == 0
//   * tight                ptosxqm < 1.005
//   * spread               ptosxqm in [1.005, 1.09)
//   * wide                 ptosxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptosxqm_max /
// wide_ptosxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.391):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanSection
// (P11.389) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octosexagintic-center
// after the P11.389 range-against-septensexagintic-center landing.

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
type PtosxqmLabel =
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

// Bands on raw ptosxqm (fixed cutoffs since octosexagintic_mean
// scales with cell counts and typical octosexagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_68 is 0.9310 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0350 (M_67) to
// 1.0344 (M_68), 20-partner drops from 1.0457 to 1.0450, 30-partner
// drops from 1.0521 to 1.0513, 40-partner drops from 1.0566 to 1.0557,
// 50-partner drops from 1.0601 to 1.0592, 60-partner drops from 1.0630
// to 1.0621, 70-partner drops from 1.0655 to 1.0645, 80-partner drops
// from 1.0676 to 1.0666, 85-partner drops from 1.0686 to 1.0675,
// 89-partner drops from 1.0693 to 1.0682 -- so pool_count >= 97
// (97^(1/68) ~ 1.0696) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTSPSXQM 1.0604 spread to PTOSXQM 1.0594 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTOSXQM_MAX = 1.005;
const WIDE_PTOSXQM_MIN = 1.09;

// PTOSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octosexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octosexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctosexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptosxqm_max: number;
  readonly wide_ptosxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanMap;
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

// Peak-to-octosexagintic-mean of a discrete distribution:
//   PTOSXQM = (max - min) / octosexagintic_mean
// where octosexagintic_mean = ((sum x_i^68) / n)^(1/68). Returns
// null on empty, solo, and degenerate (zero octosexagintic_mean
// or non-finite sixty-eighth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octosexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octosexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octosexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octosexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^68 = (x^8)^8 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct * quad
    sixtyEighthSum += oct * oct * oct * oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(sixtyEighthSum) || sixtyEighthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octosexagintic_mean: null,
    };
  }
  const octosexagintic_mean = Math.pow(sixtyEighthSum / pool_count, 1 / 68);
  if (!Number.isFinite(octosexagintic_mean) || octosexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octosexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptosxqm = range / octosexagintic_mean;
  const clamped = ptosxqm < 0 ? 0 : ptosxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_octosexagintic_mean: roundTo(clamped, PTOSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octosexagintic_mean: partner.peak_to_octosexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octosexagintic_mean: metric.peak_to_octosexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctosexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctosexaginticMean {
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
    tight_ptosxqm_max: TIGHT_PTOSXQM_MAX,
    wide_ptosxqm_min: WIDE_PTOSXQM_MIN,
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

function labelForPtosxqm(
  pool_count: number,
  pool_cells: number,
  ptosxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtosxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptosxqm === null) return "degenerate";
  if (ptosxqm >= wide_min) return "wide";
  if (ptosxqm < tight_max) return "tight";
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

function renderPtosxqmCell(
  pool_count: number,
  pool_cells: number,
  ptosxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtosxqm(
    pool_count,
    pool_cells,
    ptosxqm,
    tight_max,
    wide_min,
  );
  const ptosxqmText = ptosxqm === null ? "-" : ptosxqm.toFixed(4);
  return `PTOSXQM ${ptosxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctosexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctosexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptosxqm_max, wide_ptosxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtosxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octosexagintic_mean, tight_ptosxqm_max, wide_ptosxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtosxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octosexagintic_mean, tight_ptosxqm_max, wide_ptosxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptosxqm = (max - min) / octosexagintic_mean where octosexagintic_mean = ((sum x_i^68) / n)^(1/68). Reads the pool's total RANGE in units of its OCTOSEXAGINTIC (power-mean-of-order-68, M_68) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.388 PTSPSXQM because raising to the SIXTY-EIGHTH power lifts the anchor MORE than raising to the sixty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septensexagintic) power-mean NOVEMSEXAGINTUPLET into a SEPTUAGINTUPLET with the M_68 octosexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptosxqm approaches n^(1/68) so 10-partner pools cap near 1.0344, 20-partner near 1.0450, 30-partner near 1.0513, 40-partner near 1.0557, 50-partner near 1.0592, 60-partner near 1.0621, 70-partner near 1.0645, 80-partner near 1.0666, 85-partner near 1.0675 and 89-partner near 1.0682 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/68) ~= 1.0696) are required to escape into wide with a modest outlier. Composite regime labels: PTOSXQM tight + PTSPSXQM tight = MILD OUTLIER absorbed by octosexagintic ([1x9, 10] reads PTOSXQM 0.9310 tight); PTOSXQM spread + PTSPSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOSXQM 1.0241 spread); PTOSXQM spread + PTSPSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_68 ([1x99, 100] reads 1.0594 spread after M_67's 1.0604 spread landing); PTOSXQM tight + PTSPSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_67 stays absorbed at M_68 ([1, 100] reads 1.0001 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octosexagintic_mean == 0 (guarded but unreachable), tight = ptosxqm &lt; ${tight_ptosxqm_max}, spread = ptosxqm in [${tight_ptosxqm_max}, ${wide_ptosxqm_min}), wide = ptosxqm &ge; ${wide_ptosxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptosxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
