// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUAGINTIC-MEAN
// pure-lib (P11.354).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's QUINQUAGINTIC MEAN (a.k.a. power mean of order 50, M_50):
//
//   ptqqm = (max - min) / quinquagintic_mean
//
// where quinquagintic_mean = ((sum x_i^50) / n)^(1/50). Reads the
// peak spread against the QUINQUAGINTIC (power-mean-of-order-50)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.352 PTNQM, because raising to the FIFTIETH power
// before averaging lifts the anchor MORE than raising to the
// forty-ninth does, dampening the ratio against the range even harder.
//
// PTQQM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUAGINTIC (POWER-MEAN-OF-ORDER-50) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octoquadragintic M_48, nonquadragintic M_49)
// power-mean UNQUINQUAGINTUPLET into a DUOQUINQUAGINTUPLET with the
// M_50 quinquagintic mean. By Power Mean inequality M_50 >= M_49,
// so quinquagintic_mean >= nonquadragintic_mean and ptqqm
// <= ptnqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquagintic_mean approaches x_max / n^(1/50), so ptqqm
// approaches n^(1/50) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/50) ~= 1.0471, for n=15 ~= 1.0557, for n=20 ~= 1.0617, for
// n=30 ~= 1.0704, for n=40 ~= 1.0766, for n=50 ~= 1.0814, for n=60
// ~= 1.0853, for n=68 ~= 1.0881, for n=70 ~= 1.0887, for n=74 ~=
// 1.0899 -- still just under wide -- so pools with pool_count >= 75
// (75^(1/50) ~= 1.0902) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/50) ~= 1.0965,
// and the pool100 [1x99, 100] reference reads 1.0855 spread
// (further absorbed from PTNQM's 1.0876 spread landing) because the
// asymptote gap at n=100 has narrowed and the [1x99, 100] pool sits
// deeper inside the spread band at M_50.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquagintic_mean = k,
//                                     range 0, ptqqm 0 (tight).
//   * uniform ramp [1..10]          -> QQM ~= 9.5509, range 9, ptqqm
//                                     ~= 0.9423 (tight).
//   * upper-outlier [1x9, 10]       -> QQM ~= 9.5499, range 9, ptqqm
//                                     ~= 0.9424 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.352
//                                     PTNQM's 0.9433 tight landing).
//   * two-shoulders [1x8, 5x2]      -> QQM ~= 4.8416, range 4, ptqqm
//                                     ~= 0.8262 (tight).
//   * 50/50 split [1x5, 10x5]       -> QQM ~= 9.8623, range 9, ptqqm
//                                     ~= 0.9126 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> QQM ~= 95.4993, range 99,
//                                     ptqqm ~= 1.0367 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/50) ~ 1.0471
//                                     asymptote).
//   * two-partner [1, 9]            -> QQM ~= 8.8761, range 8, ptqqm
//                                     ~= 0.9013 (tight).
//   * two-partner [1, 100]          -> QQM ~= 98.6233, range 99, ptqqm
//                                     ~= 1.0038 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_50; PTNQM's M_49
//                                     landing at 1.0041 already sat below
//                                     tight and PTQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> QQM ~= 9.7827, range 9, ptqqm
//                                     ~= 0.9200 (tight).
//   * pool_count=100 [1x99, 100]    -> QQM ~= 91.2011, range 99, ptqqm
//                                     ~= 1.0855 (SPREAD -- FURTHER
//                                     ABSORBED from PTNQM M_49's 1.0876
//                                     spread; 100-partner asymptote
//                                     100^(1/50) ~ 1.0965 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquagintic_mean == 0
//   * tight                ptqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0471,
//                          15-partner ~ 1.0557, 20-partner ~ 1.0617,
//                          30-partner ~ 1.0704, 40-partner ~ 1.0766,
//                          50-partner ~ 1.0814, 60-partner ~ 1.0853,
//                          68-partner ~ 1.0881, 70-partner ~ 1.0887,
//                          74-partner ~ 1.0899 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0855 also caps
//                          within spread)
//   * wide                 ptqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 75)
//
// Both cutoffs are exposed on the envelope as tight_ptqqm_max /
// wide_ptqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.355):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanSection
// (P11.352) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquagintic-center
// after the P11.352 range-against-nonquadragintic-center landing.

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
type PtqqmLabel =
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

// Bands on raw ptqqm (fixed cutoffs since quinquagintic_mean
// scales with cell counts and typical quinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_50 is 0.9424
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0481 (M_49) to
// 1.0471 (M_50), 20-partner drops from 1.0630 to 1.0617, 30-partner
// drops from 1.0719 to 1.0704, 40-partner drops from 1.0782 to 1.0766,
// 50-partner drops from 1.0831 to 1.0814, 60-partner drops from 1.0871
// to 1.0853, 68-partner drops from 1.0899 to 1.0881, 74-partner lands
// at 1.0899 -- so pool_count >= 75 (75^(1/50) ~ 1.0902) is now required
// to reach wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTNQM 1.0876 spread to PTQQM 1.0855 spread --
// FURTHER ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQQM_MAX = 1.005;
const WIDE_PTQQM_MIN = 1.09;

// PTQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqqm_max: number;
  readonly wide_ptqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanMap;
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

// Peak-to-quinquagintic-mean of a discrete distribution:
//   PTQQM = (max - min) / quinquagintic_mean
// where quinquagintic_mean = ((sum x_i^50) / n)^(1/50). Returns
// null on empty, solo, and degenerate (zero quinquagintic_mean
// or non-finite fiftieth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_quinquagintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_quinquagintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_quinquagintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^50 = (x^8)^6 * x^2 -> oct*oct*oct*oct*oct*oct * sq
    fiftiethSum += oct * oct * oct * oct * oct * oct * sq;
  }
  if (!Number.isFinite(fiftiethSum) || fiftiethSum <= 0) {
    return { pool_count, pool_cells, peak_to_quinquagintic_mean: null };
  }
  const quinquagintic_mean = Math.pow(fiftiethSum / pool_count, 1 / 50);
  if (
    !Number.isFinite(quinquagintic_mean) ||
    quinquagintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_quinquagintic_mean: null };
  }
  const range = max - min;
  const ptqqm = range / quinquagintic_mean;
  const clamped = ptqqm < 0 ? 0 : ptqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquagintic_mean: roundTo(clamped, PTQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquagintic_mean:
      partner.peak_to_quinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquagintic_mean:
      metric.peak_to_quinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaginticMean {
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
    tight_ptqqm_max: TIGHT_PTQQM_MAX,
    wide_ptqqm_min: WIDE_PTQQM_MIN,
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

function labelForPtqqm(
  pool_count: number,
  pool_cells: number,
  ptqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqqm === null) return "degenerate";
  if (ptqqm >= wide_min) return "wide";
  if (ptqqm < tight_max) return "tight";
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

function renderPtqqmCell(
  pool_count: number,
  pool_cells: number,
  ptqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqqm(
    pool_count,
    pool_cells,
    ptqqm,
    tight_max,
    wide_min,
  );
  const ptqqmText = ptqqm === null ? "-" : ptqqm.toFixed(4);
  return `PTQQM ${ptqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqqm_max, wide_ptqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquagintic_mean, tight_ptqqm_max, wide_ptqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquagintic_mean, tight_ptqqm_max, wide_ptqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqqm = (max - min) / quinquagintic_mean where quinquagintic_mean = ((sum x_i^50) / n)^(1/50). Reads the pool's total RANGE in units of its QUINQUAGINTIC (power-mean-of-order-50, M_50) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.352 PTNQM because raising to the FIFTIETH power lifts the anchor MORE than raising to the forty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..nonquadragintic) power-mean UNQUINQUAGINTUPLET into a DUOQUINQUAGINTUPLET with the M_50 quinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqqm approaches n^(1/50) so 10-partner pools cap near 1.0471, 15-partner near 1.0557, 20-partner near 1.0617, 30-partner near 1.0704, 40-partner near 1.0766, 50-partner near 1.0814, 60-partner near 1.0853, 68-partner near 1.0881, 70-partner near 1.0887 and 74-partner near 1.0899 (all below the wide floor); pools with pool_count &gt;= 75 (75^(1/50) ~= 1.0902) are required to escape into wide with a modest outlier. Composite regime labels: PTQQM tight + PTNQM tight = MILD OUTLIER absorbed by quinquagintic ([1x9, 10] reads PTQQM 0.9424 tight); PTQQM spread + PTNQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQQM 1.0367 spread); PTQQM spread + PTNQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_50 ([1x99, 100] reads 1.0855 spread after M_49's 1.0876 spread landing); PTQQM tight + PTNQM tight = ISOLATED HIGH PARTNER already absorbed at M_49 stays absorbed at M_50 ([1, 100] reads 1.0038 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquagintic_mean == 0 (guarded but unreachable), tight = ptqqm &lt; ${tight_ptqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptqqm in [${tight_ptqqm_max}, ${wide_ptqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptqqm &ge; ${wide_ptqqm_min} (runaway-outlier regime with pool_count &gt;= 75). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
