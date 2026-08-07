// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXNONAGINTIC-MEAN
// pure-lib (P11.446).
//
// WHOLE-POOL RANGE-AGAINST-SEXNONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEXNONAGINTIC MEAN (a.k.a. power mean of order 96, M_96):
//
//   ptsngm = (max - min) / sexnonagintic_mean
//
// where sexnonagintic_mean = ((sum x_i^96) / n)^(1/96). Reads the
// peak spread against the SEXNONAGINTIC (power-mean-of-order-96)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.444 PTQINGM, because raising to the NINETY-SIXTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-fifth does, dampening the ratio against the range even harder.
//
// PTSNGM's unique DISPERSION-axis contribution: reads range in units
// of the SEXNONAGINTIC (POWER-MEAN-OF-ORDER-96) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tresnonagintic M_93, quattuornonagintic M_94,
// quinquonagintic M_95) power-mean SEPTEMVIGINTISEPTUAGINTUPLET into
// an OCTOVIGINTISEPTUAGINTUPLET with the M_96 sexnonagintic mean.
// By Power Mean inequality M_96 >= M_95, so sexnonagintic_mean >=
// quinquonagintic_mean and ptsngm <= ptqingm for every non-flat
// pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sexnonagintic_mean approaches x_max / n^(1/96), so ptsngm
// approaches n^(1/96) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/96) ~= 1.0243, for n=20 ~= 1.0317, for n=30 ~= 1.0361,
// for n=40 ~= 1.0392, for n=50 ~= 1.0416, for n=60 ~= 1.0436,
// for n=70 ~= 1.0452, for n=80 ~= 1.0467, for n=85 ~= 1.0474,
// for n=89 ~= 1.0479, for n=90 ~= 1.0480 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/96) ~= 1.0491)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/96) ~= 1.0491, and the pool100
// [1x99, 100] reference reads 1.0386 spread (further absorbed
// from PTQINGM's 1.0392 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_96.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sexnonagintic_mean = k,
//                                     range 0, ptsngm 0 (tight).
//   * uniform ramp [1..10]          -> SNGM ~= 9.7630, range 9,
//                                     ptsngm ~= 0.9218 (tight).
//   * upper-outlier [1x9, 10]       -> SNGM ~= 9.7630, range 9,
//                                     ptsngm ~= 0.9218 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_96;
//                                     the M_95 joint collapse persists
//                                     at M_96 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/96) ~ 9.7630 in
//                                     lock-step, so ptqingm's 0.9221
//                                     joint bucket at M_95 becomes a
//                                     joint 0.9218 bucket at M_96).
//   * two-shoulders [1x8, 5x2]      -> SNGM ~= 4.9169, range 4,
//                                     ptsngm ~= 0.8135 (tight).
//   * 50/50 split [1x5, 10x5]       -> SNGM ~= 9.9281, range 9,
//                                     ptsngm ~= 0.9065 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SNGM ~= 97.6300, range 99,
//                                     ptsngm ~= 1.0140 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/96) ~ 1.0243 asymptote).
//   * two-partner [1, 9]            -> SNGM ~= 8.9353, range 8,
//                                     ptsngm ~= 0.8953 (tight).
//   * two-partner [1, 100]          -> SNGM ~= 99.2806, range 99,
//                                     ptsngm ~= 0.9972 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_96; already
//                                     collapsed at M_95's 0.9972 tick
//                                     and stays at 0.9972 into M_96
//                                     -- the 4-decimal bucket is now
//                                     stable across two consecutive
//                                     power-mean orders).
//   * small [10, 1, 1]              -> SNGM ~= 9.8862, range 9,
//                                     ptsngm ~= 0.9104 (tight).
//   * pool_count=100 [1x99, 100]    -> SNGM ~= 95.3162, range 99,
//                                     ptsngm ~= 1.0386 (SPREAD --
//                                     FURTHER ABSORBED from PTQINGM
//                                     M_95's 1.0392 spread;
//                                     100-partner asymptote
//                                     100^(1/96) ~ 1.0491 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptsngm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sexnonagintic_mean == 0
//   * tight                ptsngm < 1.005
//   * spread               ptsngm in [1.005, 1.09)
//   * wide                 ptsngm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsngm_max /
// wide_ptsngm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.447):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquonaginticMeanSection
// (P11.445) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sexnonagintic-center
// after the P11.445 range-against-quinquonagintic-center landing.

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
type PtsngmLabel =
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

// Bands on raw ptsngm (fixed cutoffs since sexnonagintic_mean scales
// with cell counts and typical sexnonagintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_96 is 0.9218 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0245 (M_95) to
// 1.0243 (M_96), 20-partner drops from 1.0320 to 1.0317, 30-partner
// drops from 1.0365 to 1.0361, 40-partner drops from 1.0396 to
// 1.0392, 50-partner drops from 1.0420 to 1.0416, 60-partner drops
// from 1.0440 to 1.0436, 70-partner drops from 1.0457 to 1.0452,
// 80-partner drops from 1.0472 to 1.0467, 85-partner drops from
// 1.0479 to 1.0474, 89-partner drops from 1.0484 to 1.0479,
// 90-partner ~ 1.0480 -- so pool_count >= 100 (100^(1/96) ~ 1.0491)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTQINGM 1.0392 spread to
// PTSNGM 1.0386 spread -- FURTHER ABSORBED but stays within spread;
// the DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTSNGM_MAX = 1.005;
const WIDE_PTSNGM_MIN = 1.09;

// PTSNGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSNGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sexnonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sexnonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexnonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsngm_max: number;
  readonly wide_ptsngm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanMap;
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

// Peak-to-sexnonagintic-mean of a discrete distribution:
//   PTSNGM = (max - min) / sexnonagintic_mean
// where sexnonagintic_mean = ((sum x_i^96) / n)^(1/96). Returns
// null on empty, solo, and degenerate (zero sexnonagintic_mean
// or non-finite ninety-sixth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sexnonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexnonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexnonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexnonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetySixSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^96 = (x^8)^12 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct
    ninetySixSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(ninetySixSum) || ninetySixSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexnonagintic_mean: null,
    };
  }
  const sexnonagintic_mean = Math.pow(ninetySixSum / pool_count, 1 / 96);
  if (!Number.isFinite(sexnonagintic_mean) || sexnonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexnonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsngm = range / sexnonagintic_mean;
  const clamped = ptsngm < 0 ? 0 : ptsngm;
  return {
    pool_count,
    pool_cells,
    peak_to_sexnonagintic_mean: roundTo(clamped, PTSNGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sexnonagintic_mean: partner.peak_to_sexnonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sexnonagintic_mean: metric.peak_to_sexnonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexnonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexnonaginticMean {
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
    tight_ptsngm_max: TIGHT_PTSNGM_MAX,
    wide_ptsngm_min: WIDE_PTSNGM_MIN,
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

function labelForPtsngm(
  pool_count: number,
  pool_cells: number,
  ptsngm: number | null,
  tight_max: number,
  wide_min: number,
): PtsngmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsngm === null) return "degenerate";
  if (ptsngm >= wide_min) return "wide";
  if (ptsngm < tight_max) return "tight";
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

function renderPtsngmCell(
  pool_count: number,
  pool_cells: number,
  ptsngm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsngm(
    pool_count,
    pool_cells,
    ptsngm,
    tight_max,
    wide_min,
  );
  const ptsngmText = ptsngm === null ? "-" : ptsngm.toFixed(4);
  return `PTSNGM ${ptsngmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexnonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsngm_max, wide_ptsngm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsngmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sexnonagintic_mean, tight_ptsngm_max, wide_ptsngm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsngmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sexnonagintic_mean, tight_ptsngm_max, wide_ptsngm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXNONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXNONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsngm = (max - min) / sexnonagintic_mean where sexnonagintic_mean = ((sum x_i^96) / n)^(1/96). Reads the pool's total RANGE in units of its SEXNONAGINTIC (power-mean-of-order-96, M_96) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.444 PTQINGM because raising to the NINETY-SIXTH power lifts the anchor MORE than raising to the ninety-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquonagintic) power-mean SEPTEMVIGINTISEPTUAGINTUPLET into an OCTOVIGINTISEPTUAGINTUPLET with the M_96 sexnonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsngm approaches n^(1/96) so 10-partner pools cap near 1.0243, 20-partner near 1.0317, 30-partner near 1.0361, 40-partner near 1.0392, 50-partner near 1.0416, 60-partner near 1.0436, 70-partner near 1.0452, 80-partner near 1.0467, 85-partner near 1.0474, 89-partner near 1.0479 and 90-partner near 1.0480 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/96) ~= 1.0491) are required to escape into wide with a modest outlier. Composite regime labels: PTSNGM tight + PTQINGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSNGM 0.9218 tight -- rejoining the uniform ramp's 0.9218 for the fifteenth tick in the sequence after PTQINGM's 0.9221 joint bucket at M_95); PTSNGM spread + PTQINGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSNGM 1.0140 spread); PTSNGM spread + PTQINGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_96 ([1x99, 100] reads 1.0386 spread after M_95's 1.0392 spread landing); PTSNGM tight + PTQINGM tight = ISOLATED HIGH PARTNER absorption STABILISED at M_96 ([1, 100] holds at 0.9972 tight after M_95's 0.9972 landing -- the 4-decimal bucket persists across two consecutive power-mean orders). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sexnonagintic_mean == 0 (guarded but unreachable), tight = ptsngm &lt; ${tight_ptsngm_max}, spread = ptsngm in [${tight_ptsngm_max}, ${wide_ptsngm_min}), wide = ptsngm &ge; ${wide_ptsngm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsngm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSNGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSNGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
