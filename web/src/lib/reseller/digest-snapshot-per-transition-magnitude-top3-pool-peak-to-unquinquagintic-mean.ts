// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNQUINQUAGINTIC-MEAN
// pure-lib (P11.356).
//
// WHOLE-POOL RANGE-AGAINST-UNQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNQUINQUAGINTIC MEAN (a.k.a. power mean of order 51, M_51):
//
//   ptuqqm = (max - min) / unquinquagintic_mean
//
// where unquinquagintic_mean = ((sum x_i^51) / n)^(1/51). Reads the
// peak spread against the UNQUINQUAGINTIC (power-mean-of-order-51)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.354 PTQQM, because raising to the FIFTY-FIRST power
// before averaging lifts the anchor MORE than raising to the
// fiftieth does, dampening the ratio against the range even harder.
//
// PTUQQM's unique DISPERSION-axis contribution: reads range in units
// of the UNQUINQUAGINTIC (POWER-MEAN-OF-ORDER-51) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... nonquadragintic M_49, quinquagintic M_50) power-mean
// DUOQUINQUAGINTUPLET into a TRESQUINQUAGINTUPLET with the M_51
// unquinquagintic mean. By Power Mean inequality M_51 >= M_50, so
// unquinquagintic_mean >= quinquagintic_mean and ptuqqm <= ptqqm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unquinquagintic_mean approaches x_max / n^(1/51), so ptuqqm
// approaches n^(1/51) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/51) ~= 1.0462, for n=20 ~= 1.0605, for n=30 ~= 1.0690, for
// n=40 ~= 1.0750, for n=50 ~= 1.0797, for n=60 ~= 1.0836, for n=70
// ~= 1.0869, for n=75 ~= 1.0883, for n=80 ~= 1.0897 -- still just
// under wide -- so pools with pool_count >= 82 (82^(1/51) ~= 1.0902)
// are required to escape into wide with a modest outlier. For n=100
// the ceiling is 100^(1/51) ~= 1.0945, and the pool100 [1x99, 100]
// reference reads 1.0836 spread (further absorbed from PTQQM's
// 1.0855 spread landing) because the asymptote gap at n=100 has
// narrowed and the [1x99, 100] pool sits deeper inside the spread
// band at M_51.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unquinquagintic_mean = k,
//                                     range 0, ptuqqm 0 (tight).
//   * uniform ramp [1..10]          -> UQQM ~= 9.5591, range 9, ptuqqm
//                                     ~= 0.9415 (tight).
//   * upper-outlier [1x9, 10]       -> UQQM ~= 9.5581, range 9, ptuqqm
//                                     ~= 0.9416 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.354
//                                     PTQQM's 0.9424 tight landing).
//   * two-shoulders [1x8, 5x2]      -> UQQM ~= 4.8449, range 4, ptuqqm
//                                     ~= 0.8256 (tight).
//   * 50/50 split [1x5, 10x5]       -> UQQM ~= 9.8656, range 9, ptuqqm
//                                     ~= 0.9123 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> UQQM ~= 95.5924, range 99,
//                                     ptuqqm ~= 1.0357 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/51) ~ 1.0462
//                                     asymptote).
//   * two-partner [1, 9]            -> UQQM ~= 8.8783, range 8, ptuqqm
//                                     ~= 0.9011 (tight).
//   * two-partner [1, 100]          -> UQQM ~= 98.6580, range 99, ptuqqm
//                                     ~= 1.0035 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_51; PTQQM's M_50
//                                     landing at 1.0038 already sat below
//                                     tight and PTUQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> UQQM ~= 9.7869, range 9, ptuqqm
//                                     ~= 0.9196 (tight).
//   * pool_count=100 [1x99, 100]    -> UQQM ~= 91.3554, range 99, ptuqqm
//                                     ~= 1.0836 (SPREAD -- FURTHER
//                                     ABSORBED from PTQQM M_50's 1.0855
//                                     spread; 100-partner asymptote
//                                     100^(1/51) ~ 1.0945 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptuqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unquinquagintic_mean == 0
//   * tight                ptuqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptuqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0462,
//                          20-partner ~ 1.0605, 30-partner ~ 1.0690,
//                          40-partner ~ 1.0750, 50-partner ~ 1.0797,
//                          60-partner ~ 1.0836, 70-partner ~ 1.0869,
//                          75-partner ~ 1.0883, 80-partner ~ 1.0897
//                          all cap within spread; pool_count=100
//                          [1x99,100] ~ 1.0836 also caps within spread)
//   * wide                 ptuqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 82)
//
// Both cutoffs are exposed on the envelope as tight_ptuqqm_max /
// wide_ptuqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.357):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquaginticMeanSection
// (P11.354) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unquinquagintic-center
// after the P11.354 range-against-quinquagintic-center landing.

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
type PtuqqmLabel =
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

// Bands on raw ptuqqm (fixed cutoffs since unquinquagintic_mean
// scales with cell counts and typical unquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_51 is 0.9416
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0471 (M_50) to
// 1.0462 (M_51), 20-partner drops from 1.0617 to 1.0605, 30-partner
// drops from 1.0704 to 1.0690, 40-partner drops from 1.0766 to 1.0750,
// 50-partner drops from 1.0814 to 1.0797, 60-partner drops from 1.0853
// to 1.0836, 70-partner drops from 1.0887 to 1.0869, 80-partner lands
// at 1.0897 -- so pool_count >= 82 (82^(1/51) ~ 1.0902) is now required
// to reach wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTQQM 1.0855 spread to PTUQQM 1.0836 spread --
// FURTHER ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUQQM_MAX = 1.005;
const WIDE_PTUQQM_MIN = 1.09;

// PTUQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuqqm_max: number;
  readonly wide_ptuqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanMap;
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

// Peak-to-unquinquagintic-mean of a discrete distribution:
//   PTUQQM = (max - min) / unquinquagintic_mean
// where unquinquagintic_mean = ((sum x_i^51) / n)^(1/51). Returns
// null on empty, solo, and degenerate (zero unquinquagintic_mean
// or non-finite fifty-first-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_unquinquagintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_unquinquagintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_unquinquagintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftyFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^51 = (x^8)^6 * x^3 -> oct*oct*oct*oct*oct*oct * v * sq
    fiftyFirstSum += oct * oct * oct * oct * oct * oct * v * sq;
  }
  if (!Number.isFinite(fiftyFirstSum) || fiftyFirstSum <= 0) {
    return { pool_count, pool_cells, peak_to_unquinquagintic_mean: null };
  }
  const unquinquagintic_mean = Math.pow(fiftyFirstSum / pool_count, 1 / 51);
  if (
    !Number.isFinite(unquinquagintic_mean) ||
    unquinquagintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_unquinquagintic_mean: null };
  }
  const range = max - min;
  const ptuqqm = range / unquinquagintic_mean;
  const clamped = ptuqqm < 0 ? 0 : ptuqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_unquinquagintic_mean: roundTo(clamped, PTUQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unquinquagintic_mean:
      partner.peak_to_unquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unquinquagintic_mean:
      metric.peak_to_unquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMean {
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
    tight_ptuqqm_max: TIGHT_PTUQQM_MAX,
    wide_ptuqqm_min: WIDE_PTUQQM_MIN,
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

function labelForPtuqqm(
  pool_count: number,
  pool_cells: number,
  ptuqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtuqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuqqm === null) return "degenerate";
  if (ptuqqm >= wide_min) return "wide";
  if (ptuqqm < tight_max) return "tight";
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

function renderPtuqqmCell(
  pool_count: number,
  pool_cells: number,
  ptuqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuqqm(
    pool_count,
    pool_cells,
    ptuqqm,
    tight_max,
    wide_min,
  );
  const ptuqqmText = ptuqqm === null ? "-" : ptuqqm.toFixed(4);
  return `PTUQQM ${ptuqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuqqm_max, wide_ptuqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unquinquagintic_mean, tight_ptuqqm_max, wide_ptuqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unquinquagintic_mean, tight_ptuqqm_max, wide_ptuqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuqqm = (max - min) / unquinquagintic_mean where unquinquagintic_mean = ((sum x_i^51) / n)^(1/51). Reads the pool's total RANGE in units of its UNQUINQUAGINTIC (power-mean-of-order-51, M_51) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.354 PTQQM because raising to the FIFTY-FIRST power lifts the anchor MORE than raising to the fiftieth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquagintic) power-mean DUOQUINQUAGINTUPLET into a TRESQUINQUAGINTUPLET with the M_51 unquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuqqm approaches n^(1/51) so 10-partner pools cap near 1.0462, 20-partner near 1.0605, 30-partner near 1.0690, 40-partner near 1.0750, 50-partner near 1.0797, 60-partner near 1.0836, 70-partner near 1.0869, 75-partner near 1.0883 and 80-partner near 1.0897 (all below the wide floor); pools with pool_count &gt;= 82 (82^(1/51) ~= 1.0902) are required to escape into wide with a modest outlier. Composite regime labels: PTUQQM tight + PTQQM tight = MILD OUTLIER absorbed by unquinquagintic ([1x9, 10] reads PTUQQM 0.9416 tight); PTUQQM spread + PTQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUQQM 1.0357 spread); PTUQQM spread + PTQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_51 ([1x99, 100] reads 1.0836 spread after M_50's 1.0855 spread landing); PTUQQM tight + PTQQM tight = ISOLATED HIGH PARTNER already absorbed at M_50 stays absorbed at M_51 ([1, 100] reads 1.0035 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unquinquagintic_mean == 0 (guarded but unreachable), tight = ptuqqm &lt; ${tight_ptuqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptuqqm in [${tight_ptuqqm_max}, ${wide_ptuqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptuqqm &ge; ${wide_ptuqqm_min} (runaway-outlier regime with pool_count &gt;= 82). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
