// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRESQUINQUAGINTIC-MEAN
// pure-lib (P11.360).
//
// WHOLE-POOL RANGE-AGAINST-TRESQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRESQUINQUAGINTIC MEAN (a.k.a. power mean of order 53, M_53):
//
//   pttrqqm = (max - min) / tresquinquagintic_mean
//
// where tresquinquagintic_mean = ((sum x_i^53) / n)^(1/53). Reads the
// peak spread against the TRESQUINQUAGINTIC (power-mean-of-order-53)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.358 PTDUQQM, because raising to the FIFTY-THIRD power
// before averaging lifts the anchor MORE than raising to the
// fifty-second does, dampening the ratio against the range even harder.
//
// PTTRQQM's unique DISPERSION-axis contribution: reads range in units
// of the TRESQUINQUAGINTIC (POWER-MEAN-OF-ORDER-53) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... unquinquagintic M_51, duoquinquagintic M_52) power-mean
// QUATTUORQUINQUAGINTUPLET into a QUINQUEQUINQUAGINTUPLET with the M_53
// tresquinquagintic mean. By Power Mean inequality M_53 >= M_52, so
// tresquinquagintic_mean >= duoquinquagintic_mean and pttrqqm <= ptduqqm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tresquinquagintic_mean approaches x_max / n^(1/53), so pttrqqm
// approaches n^(1/53) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/53) ~= 1.0444, for n=20 ~= 1.0582, for n=30 ~= 1.0663, for
// n=40 ~= 1.0721, for n=50 ~= 1.0766, for n=60 ~= 1.0803, for n=70
// ~= 1.0835, for n=80 ~= 1.0862, for n=85 ~= 1.0874, for n=89 ~= 1.0884
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/53) ~= 1.0902) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/53) ~= 1.0908, and the
// pool100 [1x99, 100] reference reads 1.0799 spread (further absorbed
// from PTDUQQM's 1.0817 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_53.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tresquinquagintic_mean = k,
//                                     range 0, pttrqqm 0 (tight).
//   * uniform ramp [1..10]          -> TRQQM ~= 9.5755, range 9, pttrqqm
//                                     ~= 0.9399 (tight).
//   * upper-outlier [1x9, 10]       -> TRQQM ~= 9.5749, range 9, pttrqqm
//                                     ~= 0.9400 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.358
//                                     PTDUQQM's 0.9407 tight landing).
//   * two-shoulders [1x8, 5x2]      -> TRQQM ~= 4.8504, range 4, pttrqqm
//                                     ~= 0.8247 (tight).
//   * 50/50 split [1x5, 10x5]       -> TRQQM ~= 9.8701, range 9, pttrqqm
//                                     ~= 0.9118 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> TRQQM ~= 95.7485, range 99,
//                                     pttrqqm ~= 1.0340 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/53) ~ 1.0444
//                                     asymptote).
//   * two-partner [1, 9]            -> TRQQM ~= 8.8831, range 8, pttrqqm
//                                     ~= 0.9006 (tight).
//   * two-partner [1, 100]          -> TRQQM ~= 98.7007, range 99, pttrqqm
//                                     ~= 1.0030 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_53; PTDUQQM's M_52
//                                     landing at 1.0033 already sat below
//                                     tight and PTTRQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> TRQQM ~= 9.7948, range 9, pttrqqm
//                                     ~= 0.9189 (tight).
//   * pool_count=100 [1x99, 100]    -> TRQQM ~= 91.6778, range 99, pttrqqm
//                                     ~= 1.0799 (SPREAD -- FURTHER
//                                     ABSORBED from PTDUQQM M_52's 1.0817
//                                     spread; 100-partner asymptote
//                                     100^(1/53) ~ 1.0908 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw pttrqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tresquinquagintic_mean == 0
//   * tight                pttrqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               pttrqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0444,
//                          20-partner ~ 1.0582, 30-partner ~ 1.0663,
//                          40-partner ~ 1.0721, 50-partner ~ 1.0766,
//                          60-partner ~ 1.0803, 70-partner ~ 1.0835,
//                          80-partner ~ 1.0862, 85-partner ~ 1.0874,
//                          89-partner ~ 1.0884 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0799 also caps
//                          within spread)
//   * wide                 pttrqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_pttrqqm_max /
// wide_pttrqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.361):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuoquinquaginticMeanSection
// (P11.359) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tresquinquagintic-center
// after the P11.359 range-against-duoquinquagintic-center landing.

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
type PttrqqmLabel =
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

// Bands on raw pttrqqm (fixed cutoffs since tresquinquagintic_mean
// scales with cell counts and typical tresquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_53 is 0.9400
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0453 (M_52) to
// 1.0444 (M_53), 20-partner drops from 1.0593 to 1.0582, 30-partner
// drops from 1.0676 to 1.0663, 40-partner drops from 1.0735 to 1.0721,
// 50-partner drops from 1.0781 to 1.0766, 60-partner drops from 1.0819
// to 1.0803, 70-partner drops from 1.0851 to 1.0835, 80-partner drops
// from 1.0879 to 1.0862, 85-partner drops from 1.0892 to 1.0874,
// 89-partner lands at 1.0884 -- so pool_count >= 97 (97^(1/53) ~
// 1.0902) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTDUQQM 1.0817
// spread to PTTRQQM 1.0799 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTTRQQM_MAX = 1.005;
const WIDE_PTTRQQM_MIN = 1.09;

// PTTRQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTRQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tresquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tresquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttrqqm_max: number;
  readonly wide_pttrqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanMap;
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

// Peak-to-tresquinquagintic-mean of a discrete distribution:
//   PTTRQQM = (max - min) / tresquinquagintic_mean
// where tresquinquagintic_mean = ((sum x_i^53) / n)^(1/53). Returns
// null on empty, solo, and degenerate (zero tresquinquagintic_mean
// or non-finite fifty-third-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tresquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_tresquinquagintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_tresquinquagintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_tresquinquagintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^53 = (x^8)^6 * x^5 -> oct*oct*oct*oct*oct*oct * quad * v
    fiftyThirdSum += oct * oct * oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(fiftyThirdSum) || fiftyThirdSum <= 0) {
    return { pool_count, pool_cells, peak_to_tresquinquagintic_mean: null };
  }
  const tresquinquagintic_mean = Math.pow(fiftyThirdSum / pool_count, 1 / 53);
  if (
    !Number.isFinite(tresquinquagintic_mean) ||
    tresquinquagintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_tresquinquagintic_mean: null };
  }
  const range = max - min;
  const pttrqqm = range / tresquinquagintic_mean;
  const clamped = pttrqqm < 0 ? 0 : pttrqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_tresquinquagintic_mean: roundTo(clamped, PTTRQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tresquinquagintic_mean:
      partner.peak_to_tresquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tresquinquagintic_mean:
      metric.peak_to_tresquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMean {
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
    tight_pttrqqm_max: TIGHT_PTTRQQM_MAX,
    wide_pttrqqm_min: WIDE_PTTRQQM_MIN,
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

function labelForPttrqqm(
  pool_count: number,
  pool_cells: number,
  pttrqqm: number | null,
  tight_max: number,
  wide_min: number,
): PttrqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttrqqm === null) return "degenerate";
  if (pttrqqm >= wide_min) return "wide";
  if (pttrqqm < tight_max) return "tight";
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

function renderPttrqqmCell(
  pool_count: number,
  pool_cells: number,
  pttrqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttrqqm(
    pool_count,
    pool_cells,
    pttrqqm,
    tight_max,
    wide_min,
  );
  const pttrqqmText = pttrqqm === null ? "-" : pttrqqm.toFixed(4);
  return `PTTRQQM ${pttrqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTresquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttrqqm_max, wide_pttrqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttrqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tresquinquagintic_mean, tight_pttrqqm_max, wide_pttrqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttrqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tresquinquagintic_mean, tight_pttrqqm_max, wide_pttrqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRESQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRESQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttrqqm = (max - min) / tresquinquagintic_mean where tresquinquagintic_mean = ((sum x_i^53) / n)^(1/53). Reads the pool's total RANGE in units of its TRESQUINQUAGINTIC (power-mean-of-order-53, M_53) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.358 PTDUQQM because raising to the FIFTY-THIRD power lifts the anchor MORE than raising to the fifty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duoquinquagintic) power-mean QUATTUORQUINQUAGINTUPLET into a QUINQUEQUINQUAGINTUPLET with the M_53 tresquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttrqqm approaches n^(1/53) so 10-partner pools cap near 1.0444, 20-partner near 1.0582, 30-partner near 1.0663, 40-partner near 1.0721, 50-partner near 1.0766, 60-partner near 1.0803, 70-partner near 1.0835, 80-partner near 1.0862, 85-partner near 1.0874 and 89-partner near 1.0884 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/53) ~= 1.0902) are required to escape into wide with a modest outlier. Composite regime labels: PTTRQQM tight + PTDUQQM tight = MILD OUTLIER absorbed by tresquinquagintic ([1x9, 10] reads PTTRQQM 0.9400 tight); PTTRQQM spread + PTDUQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTRQQM 1.0340 spread); PTTRQQM spread + PTDUQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_53 ([1x99, 100] reads 1.0799 spread after M_52's 1.0817 spread landing); PTTRQQM tight + PTDUQQM tight = ISOLATED HIGH PARTNER already absorbed at M_52 stays absorbed at M_53 ([1, 100] reads 1.0030 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tresquinquagintic_mean == 0 (guarded but unreachable), tight = pttrqqm &lt; ${tight_pttrqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = pttrqqm in [${tight_pttrqqm_max}, ${wide_pttrqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = pttrqqm &ge; ${wide_pttrqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttrqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTRQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTRQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
