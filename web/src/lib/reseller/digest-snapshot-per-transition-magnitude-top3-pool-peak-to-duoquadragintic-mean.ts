// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOQUADRAGINTIC-MEAN
// pure-lib (P11.338).
//
// WHOLE-POOL RANGE-AGAINST-DUOQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUOQUADRAGINTIC MEAN (a.k.a. power mean of order 42, M_42):
//
//   ptdm = (max - min) / duoquadragintic_mean
//
// where duoquadragintic_mean = ((sum x_i^42) / n)^(1/42). Reads the
// peak spread against the DUOQUADRAGINTIC (power-mean-of-order-42)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.336 PTUM, because raising to the FORTY-SECOND power
// before averaging lifts the anchor MORE than raising to the
// forty-first does, dampening the ratio against the range even harder.
//
// PTDM's unique DISPERSION-axis contribution: reads range in units
// of the DUOQUADRAGINTIC (POWER-MEAN-OF-ORDER-42) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quadragintic M_40, unquadragintic M_41) power-mean
// TRIQUADRAGINTUPLET into a QUATTUORQUADRAGINTUPLET with the M_42
// duoquadragintic mean. By Power Mean inequality M_42 >= M_41, so
// duoquadragintic_mean >= unquadragintic_mean and ptdm <= ptum for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duoquadragintic_mean approaches x_max / n^(1/42), so ptdm
// approaches n^(1/42) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/42) ~= 1.0564, for n=11 ~= 1.0588, for n=12 ~= 1.0609, for
// n=13 ~= 1.0630, for n=14 ~= 1.0649, for n=15 ~= 1.0666, for n=16
// ~= 1.0682, for n=17 ~= 1.0698, for n=18 ~= 1.0712, for n=19 ~=
// 1.0726, for n=20 ~= 1.0739, for n=21 ~= 1.0752, for n=22 ~= 1.0764,
// for n=23 ~= 1.0775, for n=24 ~= 1.0786, for n=25 ~= 1.0797, for
// n=26 ~= 1.0807, for n=27 ~= 1.0816, for n=28 ~= 1.0826, for n=29
// ~= 1.0835, for n=30 ~= 1.0844, for n=31 ~= 1.0852, for n=32 ~=
// 1.0860, for n=33 ~= 1.0868, for n=34 ~= 1.0876, for n=35 ~=
// 1.0883, for n=36 ~= 1.0891, for n=37 ~= 1.0898 -- still just
// under wide -- so pools with pool_count >= 38 (38^(1/42) ~= 1.0905)
// are required to escape into wide with a modest outlier. For n=100
// the ceiling climbs to 100^(1/42) ~= 1.1159, so a large pool with
// a dominant outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duoquadragintic_mean = k,
//                                     range 0, ptdm 0 (tight).
//   * uniform ramp [1..10]          -> DM ~= 9.4692, range 9, ptdm
//                                     ~= 0.9504 (tight).
//   * upper-outlier [1x9, 10]       -> DM ~= 9.4665, range 9, ptdm
//                                     ~= 0.9507 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.336
//                                     PTUM's 0.9520 tight landing).
//   * two-shoulders [1x8, 5x2]      -> DM ~= 4.8120, range 4, ptdm
//                                     ~= 0.8313 (tight).
//   * 50/50 split [1x5, 10x5]       -> DM ~= 9.8363, range 9, ptdm
//                                     ~= 0.9150 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> DM ~= 94.6652, range 99,
//                                     ptdm ~= 1.0458 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/42) ~ 1.0564
//                                     asymptote).
//   * two-partner [1, 9]            -> DM ~= 8.8527, range 8, ptdm
//                                     ~= 0.9037 (tight).
//   * two-partner [1, 100]          -> DM ~= 98.3632, range 99, ptdm
//                                     ~= 1.0065 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> DM ~= 9.7418, range 9, ptdm
//                                     ~= 0.9239 (tight).
//   * pool_count=100 [1x99, 100]    -> DM ~= 89.6151, range 99, ptdm
//                                     ~= 1.1047 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptdm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duoquadragintic_mean == 0
//   * tight                ptdm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptdm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0564,
//                          11-partner ~ 1.0588, 12-partner ~ 1.0609,
//                          13-partner ~ 1.0630, 14-partner ~ 1.0649,
//                          15-partner ~ 1.0666, 16-partner ~ 1.0682,
//                          17-partner ~ 1.0698, 18-partner ~ 1.0712,
//                          19-partner ~ 1.0726, 20-partner ~ 1.0739,
//                          21-partner ~ 1.0752, 22-partner ~ 1.0764,
//                          23-partner ~ 1.0775, 24-partner ~ 1.0786,
//                          25-partner ~ 1.0797, 26-partner ~ 1.0807,
//                          27-partner ~ 1.0816, 28-partner ~ 1.0826,
//                          29-partner ~ 1.0835, 30-partner ~ 1.0844,
//                          31-partner ~ 1.0852, 32-partner ~ 1.0860,
//                          33-partner ~ 1.0868, 34-partner ~ 1.0876,
//                          35-partner ~ 1.0883, 36-partner ~ 1.0891
//                          and 37-partner ~ 1.0898 all cap within
//                          spread)
//   * wide                 ptdm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 38)
//
// Both cutoffs are exposed on the envelope as tight_ptdm_max /
// wide_ptdm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.339):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUnquadraginticMeanSection
// (P11.336) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duoquadragintic-center
// after the P11.336 range-against-unquadragintic-center landing.

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
type PtdmLabel =
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

// Bands on raw ptdm (fixed cutoffs since duoquadragintic_mean scales
// with cell counts and typical duoquadragintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.336 PTUM's 1.005 -- MILD-OUTLIER at M_42 is 0.9507 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.336 PTUM's
// 1.09 -- 10-partner asymptote drops from 1.0578 (M_41) to 1.0564
// (M_42), 11-partner drops from 1.0602 to 1.0588, 12-partner drops
// from 1.0625 to 1.0609, 13-partner drops from 1.0646 to 1.0630,
// 14-partner drops from 1.0665 to 1.0649, 15-partner drops from
// 1.0683 to 1.0666, 16-partner drops from 1.0700 to 1.0682, 17-partner
// drops from 1.0715 to 1.0698, 18-partner drops from 1.0730 to 1.0712,
// 19-partner drops from 1.0745 to 1.0726, 20-partner drops from
// 1.0758 to 1.0739, 21-partner drops from 1.0771 to 1.0752, 22-partner
// drops from 1.0783 to 1.0764, 23-partner drops from 1.0795 to 1.0775,
// 24-partner drops from 1.0806 to 1.0786, 25-partner drops from
// 1.0817 to 1.0797, 26-partner drops from 1.0827 to 1.0807, 27-partner
// drops from 1.0837 to 1.0816, 28-partner drops from 1.0847 to 1.0826,
// 29-partner drops from 1.0856 to 1.0835, 30-partner drops from 1.0865
// to 1.0844, 31-partner drops from 1.0874 to 1.0852, 32-partner drops
// from 1.0882 to 1.0860, 33-partner drops from 1.0890 to 1.0868,
// 34-partner drops from 1.0898 to 1.0876, 35-partner lands at 1.0883,
// 36-partner lands at 1.0891 and 37-partner lands at 1.0898 -- so
// pool_count >= 38 (38^(1/42) ~ 1.0905) is now required to reach
// wide with a modest outlier.
const TIGHT_PTDM_MAX = 1.005;
const WIDE_PTDM_MIN = 1.09;

// PTDM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duoquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duoquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdm_max: number;
  readonly wide_ptdm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanMap;
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

// Peak-to-duoquadragintic-mean of a discrete distribution:
//   PTDM = (max - min) / duoquadragintic_mean
// where duoquadragintic_mean = ((sum x_i^42) / n)^(1/42). Returns null
// on empty, solo, and degenerate (zero duoquadragintic_mean or non-
// finite forty-second-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duoquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_duoquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_duoquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_duoquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortysecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^42 = (x^8)^5 * x^2 -> oct*oct*oct*oct*oct * sq
    fortysecondSum += oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(fortysecondSum) || fortysecondSum <= 0) {
    return { pool_count, pool_cells, peak_to_duoquadragintic_mean: null };
  }
  const duoquadragintic_mean = Math.pow(fortysecondSum / pool_count, 1 / 42);
  if (!Number.isFinite(duoquadragintic_mean) || duoquadragintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_duoquadragintic_mean: null };
  }
  const range = max - min;
  const ptdm = range / duoquadragintic_mean;
  const clamped = ptdm < 0 ? 0 : ptdm;
  return {
    pool_count,
    pool_cells,
    peak_to_duoquadragintic_mean: roundTo(clamped, PTDM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duoquadragintic_mean: partner.peak_to_duoquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duoquadragintic_mean: metric.peak_to_duoquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMean {
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
    tight_ptdm_max: TIGHT_PTDM_MAX,
    wide_ptdm_min: WIDE_PTDM_MIN,
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

function labelForPtdm(
  pool_count: number,
  pool_cells: number,
  ptdm: number | null,
  tight_max: number,
  wide_min: number,
): PtdmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdm === null) return "degenerate";
  if (ptdm >= wide_min) return "wide";
  if (ptdm < tight_max) return "tight";
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

function renderPtdmCell(
  pool_count: number,
  pool_cells: number,
  ptdm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdm(
    pool_count,
    pool_cells,
    ptdm,
    tight_max,
    wide_min,
  );
  const ptdmText = ptdm === null ? "-" : ptdm.toFixed(4);
  return `PTDM ${ptdmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdm_max, wide_ptdm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duoquadragintic_mean, tight_ptdm_max, wide_ptdm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duoquadragintic_mean, tight_ptdm_max, wide_ptdm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdm = (max - min) / duoquadragintic_mean where duoquadragintic_mean = ((sum x_i^42) / n)^(1/42). Reads the pool's total RANGE in units of its DUOQUADRAGINTIC (power-mean-of-order-42, M_42) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.336 PTUM because raising to the FORTY-SECOND power lifts the anchor MORE than raising to the forty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unquadragintic) power-mean TRIQUADRAGINTUPLET into a QUATTUORQUADRAGINTUPLET with the M_42 duoquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdm approaches n^(1/42) so 10-partner pools cap near 1.0564, 11-partner near 1.0588, 12-partner near 1.0609, 13-partner near 1.0630, 14-partner near 1.0649, 15-partner near 1.0666, 16-partner near 1.0682, 17-partner near 1.0698, 18-partner near 1.0712, 19-partner near 1.0726, 20-partner near 1.0739, 21-partner near 1.0752, 22-partner near 1.0764, 23-partner near 1.0775, 24-partner near 1.0786, 25-partner near 1.0797, 26-partner near 1.0807, 27-partner near 1.0816, 28-partner near 1.0826, 29-partner near 1.0835, 30-partner near 1.0844, 31-partner near 1.0852, 32-partner near 1.0860, 33-partner near 1.0868, 34-partner near 1.0876, 35-partner near 1.0883, 36-partner near 1.0891 and 37-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 38 (38^(1/42) ~= 1.0905) are required to escape into wide with a modest outlier. Composite regime labels: PTDM tight + PTUM tight = MILD OUTLIER absorbed by duoquadragintic ([1x9, 10] reads PTDM 0.9507 tight); PTDM spread + PTUM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDM 1.0458 spread); PTDM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1047 wide); PTDM spread + PTUM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0065 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duoquadragintic_mean == 0 (guarded but unreachable), tight = ptdm &lt; ${tight_ptdm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptdm in [${tight_ptdm_max}, ${wide_ptdm_min}) (extreme-outlier regime), wide = ptdm &ge; ${wide_ptdm_min} (runaway-outlier regime with pool_count &gt;= 38). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
