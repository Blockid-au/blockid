// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNSEXAGINTIC-MEAN
// pure-lib (P11.376).
//
// WHOLE-POOL RANGE-AGAINST-UNSEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNSEXAGINTIC MEAN (a.k.a. power mean of order 61, M_61):
//
//   ptusxqm = (max - min) / unsexagintic_mean
//
// where unsexagintic_mean = ((sum x_i^61) / n)^(1/61). Reads the
// peak spread against the UNSEXAGINTIC (power-mean-of-order-61)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.374 PTSXQM, because raising to the SIXTY-FIRST power before
// averaging lifts the anchor MORE than raising to the sixtieth
// does, dampening the ratio against the range even harder.
//
// PTUSXQM's unique DISPERSION-axis contribution: reads range in units
// of the UNSEXAGINTIC (POWER-MEAN-OF-ORDER-61) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novemquinquagintic M_59, sexagintic M_60)
// power-mean DUOSEXAGINTUPLET into a TRESEXAGINTUPLET with the M_61
// unsexagintic mean. By Power Mean inequality M_61 >= M_60, so
// unsexagintic_mean >= sexagintic_mean and
// ptusxqm <= ptsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unsexagintic_mean approaches x_max / n^(1/61), so ptusxqm
// approaches n^(1/61) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/61) ~= 1.0385, for n=20 ~= 1.0503, for n=30 ~= 1.0573, for
// n=40 ~= 1.0623, for n=50 ~= 1.0662, for n=60 ~= 1.0694, for n=70
// ~= 1.0721, for n=80 ~= 1.0745, for n=85 ~= 1.0755, for n=89 ~= 1.0764
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/61) ~= 1.0779) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/61) ~= 1.0784, and the
// pool100 [1x99, 100] reference reads 1.0676 spread (further absorbed
// from PTSXQM's 1.0690 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_61.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unsexagintic_mean = k,
//                                     range 0, ptusxqm 0 (tight).
//   * uniform ramp [1..10]          -> USXQM ~= 9.6298, range 9, ptusxqm
//                                     ~= 0.9346 (tight).
//   * upper-outlier [1x9, 10]       -> USXQM ~= 9.6296, range 9, ptusxqm
//                                     ~= 0.9346 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.374
//                                     PTSXQM's 0.9352 tight landing).
//   * two-shoulders [1x8, 5x2]      -> USXQM ~= 4.8698, range 4, ptusxqm
//                                     ~= 0.8214 (tight).
//   * 50/50 split [1x5, 10x5]       -> USXQM ~= 9.8870, range 9, ptusxqm
//                                     ~= 0.9103 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> USXQM ~= 96.2956, range 99,
//                                     ptusxqm ~= 1.0281 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/61) ~ 1.0385
//                                     asymptote).
//   * two-partner [1, 9]            -> USXQM ~= 8.8983, range 8, ptusxqm
//                                     ~= 0.8990 (tight).
//   * two-partner [1, 100]          -> USXQM ~= 98.8701, range 99, ptusxqm
//                                     ~= 1.0013 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_61; PTSXQM's M_60
//                                     landing at 1.0015 already sat below
//                                     tight and PTUSXQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> USXQM ~= 9.8215, range 9, ptusxqm
//                                     ~= 0.9164 (tight).
//   * pool_count=100 [1x99, 100]    -> USXQM ~= 92.7285, range 99, ptusxqm
//                                     ~= 1.0676 (SPREAD -- FURTHER
//                                     ABSORBED from PTSXQM M_60's 1.0690
//                                     spread; 100-partner asymptote
//                                     100^(1/61) ~ 1.0784 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptusxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unsexagintic_mean == 0
//   * tight                ptusxqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptusxqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0385,
//                          20-partner ~ 1.0503, 30-partner ~ 1.0573,
//                          40-partner ~ 1.0623, 50-partner ~ 1.0662,
//                          60-partner ~ 1.0694, 70-partner ~ 1.0721,
//                          80-partner ~ 1.0745, 85-partner ~ 1.0755,
//                          89-partner ~ 1.0764 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0676 also caps
//                          within spread)
//   * wide                 ptusxqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptusxqm_max /
// wide_ptusxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.377):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexaginticMeanSection
// (P11.375) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unsexagintic-center
// after the P11.375 range-against-sexagintic-center landing.

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
type PtusxqmLabel =
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

// Bands on raw ptusxqm (fixed cutoffs since unsexagintic_mean
// scales with cell counts and typical unsexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_61 is 0.9346
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0391 (M_60) to
// 1.0385 (M_61), 20-partner drops from 1.0512 to 1.0503, 30-partner
// drops from 1.0583 to 1.0573, 40-partner drops from 1.0634 to 1.0623,
// 50-partner drops from 1.0674 to 1.0662, 60-partner drops from 1.0706
// to 1.0694, 70-partner drops from 1.0734 to 1.0721, 80-partner drops
// from 1.0758 to 1.0745, 85-partner drops from 1.0769 to 1.0755,
// 89-partner lands at 1.0764 -- so pool_count >= 97 (97^(1/61) ~
// 1.0779) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTSXQM 1.0690
// spread to PTUSXQM 1.0676 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTUSXQM_MAX = 1.005;
const WIDE_PTUSXQM_MIN = 1.09;

// PTUSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unsexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unsexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnsexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptusxqm_max: number;
  readonly wide_ptusxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanMap;
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

// Peak-to-unsexagintic-mean of a discrete distribution:
//   PTUSXQM = (max - min) / unsexagintic_mean
// where unsexagintic_mean = ((sum x_i^61) / n)^(1/61). Returns
// null on empty, solo, and degenerate (zero unsexagintic_mean
// or non-finite sixty-first-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unsexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unsexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unsexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unsexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^61 = x^60 * x = (x^8)^7 * x^4 * x -> oct*oct*oct*oct*oct*oct*oct*quad*v
    sixtyFirstSum += oct * oct * oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(sixtyFirstSum) || sixtyFirstSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unsexagintic_mean: null,
    };
  }
  const unsexagintic_mean = Math.pow(sixtyFirstSum / pool_count, 1 / 61);
  if (!Number.isFinite(unsexagintic_mean) || unsexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unsexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptusxqm = range / unsexagintic_mean;
  const clamped = ptusxqm < 0 ? 0 : ptusxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_unsexagintic_mean: roundTo(clamped, PTUSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unsexagintic_mean: partner.peak_to_unsexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unsexagintic_mean: metric.peak_to_unsexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnsexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnsexaginticMean {
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
    tight_ptusxqm_max: TIGHT_PTUSXQM_MAX,
    wide_ptusxqm_min: WIDE_PTUSXQM_MIN,
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

function labelForPtusxqm(
  pool_count: number,
  pool_cells: number,
  ptusxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtusxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptusxqm === null) return "degenerate";
  if (ptusxqm >= wide_min) return "wide";
  if (ptusxqm < tight_max) return "tight";
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

function renderPtusxqmCell(
  pool_count: number,
  pool_cells: number,
  ptusxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtusxqm(
    pool_count,
    pool_cells,
    ptusxqm,
    tight_max,
    wide_min,
  );
  const ptusxqmText = ptusxqm === null ? "-" : ptusxqm.toFixed(4);
  return `PTUSXQM ${ptusxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnsexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnsexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptusxqm_max, wide_ptusxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtusxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unsexagintic_mean, tight_ptusxqm_max, wide_ptusxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtusxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unsexagintic_mean, tight_ptusxqm_max, wide_ptusxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNSEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNSEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptusxqm = (max - min) / unsexagintic_mean where unsexagintic_mean = ((sum x_i^61) / n)^(1/61). Reads the pool's total RANGE in units of its UNSEXAGINTIC (power-mean-of-order-61, M_61) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.374 PTSXQM because raising to the SIXTY-FIRST power lifts the anchor MORE than raising to the sixtieth does. Unique DISPERSION-axis contribution extends the (harmonic..sexagintic) power-mean DUOSEXAGINTUPLET into a TRESEXAGINTUPLET with the M_61 unsexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptusxqm approaches n^(1/61) so 10-partner pools cap near 1.0385, 20-partner near 1.0503, 30-partner near 1.0573, 40-partner near 1.0623, 50-partner near 1.0662, 60-partner near 1.0694, 70-partner near 1.0721, 80-partner near 1.0745, 85-partner near 1.0755 and 89-partner near 1.0764 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/61) ~= 1.0779) are required to escape into wide with a modest outlier. Composite regime labels: PTUSXQM tight + PTSXQM tight = MILD OUTLIER absorbed by unsexagintic ([1x9, 10] reads PTUSXQM 0.9346 tight); PTUSXQM spread + PTSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUSXQM 1.0281 spread); PTUSXQM spread + PTSXQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_61 ([1x99, 100] reads 1.0676 spread after M_60's 1.0690 spread landing); PTUSXQM tight + PTSXQM tight = ISOLATED HIGH PARTNER already absorbed at M_60 stays absorbed at M_61 ([1, 100] reads 1.0013 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unsexagintic_mean == 0 (guarded but unreachable), tight = ptusxqm &lt; ${tight_ptusxqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptusxqm in [${tight_ptusxqm_max}, ${wide_ptusxqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptusxqm &ge; ${wide_ptusxqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptusxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
