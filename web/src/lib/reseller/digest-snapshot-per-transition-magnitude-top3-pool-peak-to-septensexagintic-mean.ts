// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTENSEXAGINTIC-MEAN
// pure-lib (P11.388).
//
// WHOLE-POOL RANGE-AGAINST-SEPTENSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTENSEXAGINTIC MEAN (a.k.a. power mean of order 67, M_67):
//
//   ptspsxqm = (max - min) / septensexagintic_mean
//
// where septensexagintic_mean = ((sum x_i^67) / n)^(1/67). Reads the
// peak spread against the SEPTENSEXAGINTIC (power-mean-of-order-67)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.386 PTSSXQM, because raising to the SIXTY-SEVENTH power before
// averaging lifts the anchor MORE than raising to the sixty-sixth
// does, dampening the ratio against the range even harder.
//
// PTSPSXQM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTENSEXAGINTIC (POWER-MEAN-OF-ORDER-67) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquasexagintic M_65, sesexagintic M_66) power-mean
// OCTOSEXAGINTUPLET into a NOVEMSEXAGINTUPLET with the M_67
// septensexagintic mean. By Power Mean inequality M_67 >= M_66, so
// septensexagintic_mean >= sesexagintic_mean and
// ptspsxqm <= ptssxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septensexagintic_mean approaches x_max / n^(1/67), so ptspsxqm
// approaches n^(1/67) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/67) ~= 1.0350, for n=20 ~= 1.0457, for n=30 ~= 1.0521, for
// n=40 ~= 1.0566, for n=50 ~= 1.0601, for n=60 ~= 1.0630, for n=70
// ~= 1.0655, for n=80 ~= 1.0676, for n=85 ~= 1.0686, for n=89 ~= 1.0693
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/67) ~= 1.0707) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/67) ~= 1.0712, and the
// pool100 [1x99, 100] reference reads 1.0604 spread (further absorbed
// from PTSSXQM's 1.0615 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_67.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septensexagintic_mean = k,
//                                     range 0, ptspsxqm 0 (tight).
//   * uniform ramp [1..10]          -> SPSXQM ~= 9.6623, range 9,
//                                     ptspsxqm ~= 0.9315 (tight).
//   * upper-outlier [1x9, 10]       -> SPSXQM ~= 9.6622, range 9,
//                                     ptspsxqm ~= 0.9315 (tight --
//                                     MILD OUTLIER absorbed even
//                                     harder than P11.386 PTSSXQM's
//                                     0.9320 tight landing; at M_67
//                                     the ramp/outlier 4-dp readings
//                                     collapse back onto the same
//                                     0.9315 tick as the anchor tips
//                                     past the rounding boundary the
//                                     other way).
//   * two-shoulders [1x8, 5x2]      -> SPSXQM ~= 4.8813, range 4,
//                                     ptspsxqm ~= 0.8194 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPSXQM ~= 9.8971, range 9,
//                                     ptspsxqm ~= 0.9094 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPSXQM ~= 96.6217, range 99,
//                                     ptspsxqm ~= 1.0246 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/67) ~ 1.0350 asymptote).
//   * two-partner [1, 9]            -> SPSXQM ~= 8.9074, range 8,
//                                     ptspsxqm ~= 0.8981 (tight).
//   * two-partner [1, 100]          -> SPSXQM ~= 98.9708, range 99,
//                                     ptspsxqm ~= 1.0003 (TIGHT --
//                                     ISOLATED HIGH PARTNER stays
//                                     below the 1.005 tight boundary
//                                     at M_67; PTSSXQM's M_66 landing
//                                     at 1.0005 already sat below
//                                     tight and PTSPSXQM continues
//                                     that absorption trend).
//   * small [10, 1, 1]              -> SPSXQM ~= 9.8374, range 9,
//                                     ptspsxqm ~= 0.9149 (tight).
//   * pool_count=100 [1x99, 100]    -> SPSXQM ~= 93.3575, range 99,
//                                     ptspsxqm ~= 1.0604 (SPREAD --
//                                     FURTHER ABSORBED from PTSSXQM
//                                     M_66's 1.0615 spread;
//                                     100-partner asymptote
//                                     100^(1/67) ~ 1.0712 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptspsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septensexagintic_mean == 0
//   * tight                ptspsxqm < 1.005
//   * spread               ptspsxqm in [1.005, 1.09)
//   * wide                 ptspsxqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspsxqm_max /
// wide_ptspsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.389):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesexaginticMeanSection
// (P11.387) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septensexagintic-center
// after the P11.387 range-against-sesexagintic-center landing.

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
type PtspsxqmLabel =
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

// Bands on raw ptspsxqm (fixed cutoffs since septensexagintic_mean
// scales with cell counts and typical septensexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_67 is 0.9315
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0355
// (M_66) to 1.0350 (M_67), 20-partner drops from 1.0464 to 1.0457,
// 30-partner drops from 1.0529 to 1.0521, 40-partner drops from
// 1.0575 to 1.0566, 50-partner drops from 1.0611 to 1.0601, 60-partner
// drops from 1.0640 to 1.0630, 70-partner drops from 1.0665 to 1.0655,
// 80-partner drops from 1.0686 to 1.0676, 85-partner drops from 1.0696
// to 1.0686, 89-partner lands at 1.0693 -- so pool_count >= 97
// (97^(1/67) ~ 1.0707) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTSSXQM
// 1.0615 spread to PTSPSXQM 1.0604 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTSPSXQM_MAX = 1.005;
const WIDE_PTSPSXQM_MIN = 1.09;

// PTSPSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septensexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septensexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspsxqm_max: number;
  readonly wide_ptspsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanMap;
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

// Peak-to-septensexagintic-mean of a discrete distribution:
//   PTSPSXQM = (max - min) / septensexagintic_mean
// where septensexagintic_mean = ((sum x_i^67) / n)^(1/67). Returns
// null on empty, solo, and degenerate (zero septensexagintic_mean
// or non-finite sixty-seventh-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septensexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septensexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septensexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septensexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^67 = (x^8)^8 * x^2 * x -> oct*oct*oct*oct*oct*oct*oct*oct * sq * v
    sixtySeventhSum += oct * oct * oct * oct * oct * oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(sixtySeventhSum) || sixtySeventhSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septensexagintic_mean: null,
    };
  }
  const septensexagintic_mean = Math.pow(sixtySeventhSum / pool_count, 1 / 67);
  if (!Number.isFinite(septensexagintic_mean) || septensexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septensexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspsxqm = range / septensexagintic_mean;
  const clamped = ptspsxqm < 0 ? 0 : ptspsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_septensexagintic_mean: roundTo(clamped, PTSPSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septensexagintic_mean: partner.peak_to_septensexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septensexagintic_mean: metric.peak_to_septensexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMean {
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
    tight_ptspsxqm_max: TIGHT_PTSPSXQM_MAX,
    wide_ptspsxqm_min: WIDE_PTSPSXQM_MIN,
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

function labelForPtspsxqm(
  pool_count: number,
  pool_cells: number,
  ptspsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtspsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspsxqm === null) return "degenerate";
  if (ptspsxqm >= wide_min) return "wide";
  if (ptspsxqm < tight_max) return "tight";
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

function renderPtspsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptspsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspsxqm(
    pool_count,
    pool_cells,
    ptspsxqm,
    tight_max,
    wide_min,
  );
  const ptspsxqmText = ptspsxqm === null ? "-" : ptspsxqm.toFixed(4);
  return `PTSPSXQM ${ptspsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptensexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspsxqm_max, wide_ptspsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septensexagintic_mean, tight_ptspsxqm_max, wide_ptspsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septensexagintic_mean, tight_ptspsxqm_max, wide_ptspsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTENSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTENSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspsxqm = (max - min) / septensexagintic_mean where septensexagintic_mean = ((sum x_i^67) / n)^(1/67). Reads the pool's total RANGE in units of its SEPTENSEXAGINTIC (power-mean-of-order-67, M_67) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.386 PTSSXQM because raising to the SIXTY-SEVENTH power lifts the anchor MORE than raising to the sixty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesexagintic) power-mean OCTOSEXAGINTUPLET into a NOVEMSEXAGINTUPLET with the M_67 septensexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspsxqm approaches n^(1/67) so 10-partner pools cap near 1.0350, 20-partner near 1.0457, 30-partner near 1.0521, 40-partner near 1.0566, 50-partner near 1.0601, 60-partner near 1.0630, 70-partner near 1.0655, 80-partner near 1.0676, 85-partner near 1.0686 and 89-partner near 1.0693 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/67) ~= 1.0707) are required to escape into wide with a modest outlier. Composite regime labels: PTSPSXQM tight + PTSSXQM tight = MILD OUTLIER absorbed by septensexagintic ([1x9, 10] reads PTSPSXQM 0.9315 tight); PTSPSXQM spread + PTSSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPSXQM 1.0246 spread); PTSPSXQM spread + PTSSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_67 ([1x99, 100] reads 1.0604 spread after M_66's 1.0615 spread landing); PTSPSXQM tight + PTSSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_66 stays absorbed at M_67 ([1, 100] reads 1.0003 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septensexagintic_mean == 0 (guarded but unreachable), tight = ptspsxqm &lt; ${tight_ptspsxqm_max}, spread = ptspsxqm in [${tight_ptspsxqm_max}, ${wide_ptspsxqm_min}), wide = ptspsxqm &ge; ${wide_ptspsxqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
