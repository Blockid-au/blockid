// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTENNONAGINTIC-MEAN
// pure-lib (P11.448).
//
// WHOLE-POOL RANGE-AGAINST-SEPTENNONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTENNONAGINTIC MEAN (a.k.a. power mean of order 97, M_97):
//
//   ptspngm = (max - min) / septennonagintic_mean
//
// where septennonagintic_mean = ((sum x_i^97) / n)^(1/97). Reads the
// peak spread against the SEPTENNONAGINTIC (power-mean-of-order-97)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.446 PTSNGM, because raising to the NINETY-SEVENTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-sixth does, dampening the ratio against the range even harder.
//
// PTSPNGM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTENNONAGINTIC (POWER-MEAN-OF-ORDER-97) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuornonagintic M_94, quinquonagintic M_95,
// sexnonagintic M_96) power-mean OCTOVIGINTISEPTUAGINTUPLET into
// a NOVEMVIGINTISEPTUAGINTUPLET with the M_97 septennonagintic mean.
// By Power Mean inequality M_97 >= M_96, so septennonagintic_mean >=
// sexnonagintic_mean and ptspngm <= ptsngm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septennonagintic_mean approaches x_max / n^(1/97), so ptspngm
// approaches n^(1/97) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/97) ~= 1.0240, for n=20 ~= 1.0314, for n=30 ~= 1.0358,
// for n=40 ~= 1.0388, for n=50 ~= 1.0412, for n=60 ~= 1.0432,
// for n=70 ~= 1.0448, for n=80 ~= 1.0463, for n=85 ~= 1.0470,
// for n=89 ~= 1.0475, for n=90 ~= 1.0476 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/97) ~= 1.0486)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/97) ~= 1.0486, and the pool100
// [1x99, 100] reference reads 1.0381 spread (further absorbed
// from PTSNGM's 1.0386 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_97.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septennonagintic_mean = k,
//                                     range 0, ptspngm 0 (tight).
//   * uniform ramp [1..10]          -> SPNGM ~= 9.7654, range 9,
//                                     ptspngm ~= 0.9216 (tight).
//   * upper-outlier [1x9, 10]       -> SPNGM ~= 9.7654, range 9,
//                                     ptspngm ~= 0.9216 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_97;
//                                     the M_96 joint collapse persists
//                                     at M_97 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/97) ~ 9.7654 in
//                                     lock-step, so ptsngm's 0.9218
//                                     joint bucket at M_96 becomes a
//                                     joint 0.9216 bucket at M_97).
//   * two-shoulders [1x8, 5x2]      -> SPNGM ~= 4.9177, range 4,
//                                     ptspngm ~= 0.8134 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPNGM ~= 9.9288, range 9,
//                                     ptspngm ~= 0.9065 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPNGM ~= 97.6544, range 99,
//                                     ptspngm ~= 1.0138 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/97) ~ 1.0240 asymptote).
//   * two-partner [1, 9]            -> SPNGM ~= 8.9359, range 8,
//                                     ptspngm ~= 0.8953 (tight).
//   * two-partner [1, 100]          -> SPNGM ~= 99.2880, range 99,
//                                     ptspngm ~= 0.9971 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES at M_97; drops from
//                                     M_96's 0.9972 landing to a
//                                     fresh 0.9971 tick as the
//                                     septennonagintic anchor tips
//                                     further past the range).
//   * small [10, 1, 1]              -> SPNGM ~= 9.8874, range 9,
//                                     ptspngm ~= 0.9103 (tight).
//   * pool_count=100 [1x99, 100]    -> SPNGM ~= 95.3634, range 99,
//                                     ptspngm ~= 1.0381 (SPREAD --
//                                     FURTHER ABSORBED from PTSNGM
//                                     M_96's 1.0386 spread;
//                                     100-partner asymptote
//                                     100^(1/97) ~ 1.0486 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptspngm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septennonagintic_mean == 0
//   * tight                ptspngm < 1.005
//   * spread               ptspngm in [1.005, 1.09)
//   * wide                 ptspngm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspngm_max /
// wide_ptspngm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.449):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexnonaginticMeanSection
// (P11.447) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septennonagintic-center
// after the P11.447 range-against-sexnonagintic-center landing.

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
type PtspngmLabel =
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

// Bands on raw ptspngm (fixed cutoffs since septennonagintic_mean
// scales with cell counts and typical septennonagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_97 is 0.9216 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0243 (M_96) to
// 1.0240 (M_97), 20-partner drops from 1.0317 to 1.0314, 30-partner
// drops from 1.0361 to 1.0358, 40-partner drops from 1.0392 to
// 1.0388, 50-partner drops from 1.0416 to 1.0412, 60-partner drops
// from 1.0436 to 1.0432, 70-partner drops from 1.0452 to 1.0448,
// 80-partner drops from 1.0467 to 1.0463, 85-partner drops from
// 1.0474 to 1.0470, 89-partner drops from 1.0479 to 1.0475,
// 90-partner ~ 1.0476 -- so pool_count >= 100 (100^(1/97) ~ 1.0486)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTSNGM 1.0386 spread to
// PTSPNGM 1.0381 spread -- FURTHER ABSORBED but stays within spread;
// the DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTSPNGM_MAX = 1.005;
const WIDE_PTSPNGM_MIN = 1.09;

// PTSPNGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPNGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septennonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septennonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspngm_max: number;
  readonly wide_ptspngm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanMap;
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

// Peak-to-septennonagintic-mean of a discrete distribution:
//   PTSPNGM = (max - min) / septennonagintic_mean
// where septennonagintic_mean = ((sum x_i^97) / n)^(1/97). Returns
// null on empty, solo, and degenerate (zero septennonagintic_mean
// or non-finite ninety-seventh-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septennonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septennonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septennonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septennonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetySevenSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^97 = (x^8)^12 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*v
    ninetySevenSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      v;
  }
  if (!Number.isFinite(ninetySevenSum) || ninetySevenSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septennonagintic_mean: null,
    };
  }
  const septennonagintic_mean = Math.pow(ninetySevenSum / pool_count, 1 / 97);
  if (!Number.isFinite(septennonagintic_mean) || septennonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septennonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspngm = range / septennonagintic_mean;
  const clamped = ptspngm < 0 ? 0 : ptspngm;
  return {
    pool_count,
    pool_cells,
    peak_to_septennonagintic_mean: roundTo(clamped, PTSPNGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septennonagintic_mean:
      partner.peak_to_septennonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septennonagintic_mean: metric.peak_to_septennonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMean {
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
    tight_ptspngm_max: TIGHT_PTSPNGM_MAX,
    wide_ptspngm_min: WIDE_PTSPNGM_MIN,
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

function labelForPtspngm(
  pool_count: number,
  pool_cells: number,
  ptspngm: number | null,
  tight_max: number,
  wide_min: number,
): PtspngmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspngm === null) return "degenerate";
  if (ptspngm >= wide_min) return "wide";
  if (ptspngm < tight_max) return "tight";
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

function renderPtspngmCell(
  pool_count: number,
  pool_cells: number,
  ptspngm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspngm(
    pool_count,
    pool_cells,
    ptspngm,
    tight_max,
    wide_min,
  );
  const ptspngmText = ptspngm === null ? "-" : ptspngm.toFixed(4);
  return `PTSPNGM ${ptspngmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptennonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspngm_max, wide_ptspngm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspngmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septennonagintic_mean, tight_ptspngm_max, wide_ptspngm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspngmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septennonagintic_mean, tight_ptspngm_max, wide_ptspngm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTENNONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTENNONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspngm = (max - min) / septennonagintic_mean where septennonagintic_mean = ((sum x_i^97) / n)^(1/97). Reads the pool's total RANGE in units of its SEPTENNONAGINTIC (power-mean-of-order-97, M_97) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.446 PTSNGM because raising to the NINETY-SEVENTH power lifts the anchor MORE than raising to the ninety-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sexnonagintic) power-mean OCTOVIGINTISEPTUAGINTUPLET into a NOVEMVIGINTISEPTUAGINTUPLET with the M_97 septennonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspngm approaches n^(1/97) so 10-partner pools cap near 1.0240, 20-partner near 1.0314, 30-partner near 1.0358, 40-partner near 1.0388, 50-partner near 1.0412, 60-partner near 1.0432, 70-partner near 1.0448, 80-partner near 1.0463, 85-partner near 1.0470, 89-partner near 1.0475 and 90-partner near 1.0476 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/97) ~= 1.0486) are required to escape into wide with a modest outlier. Composite regime labels: PTSPNGM tight + PTSNGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPNGM 0.9216 tight -- rejoining the uniform ramp's 0.9216 for the sixteenth tick in the sequence after PTSNGM's 0.9218 joint bucket at M_96); PTSPNGM spread + PTSNGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPNGM 1.0138 spread); PTSPNGM spread + PTSNGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_97 ([1x99, 100] reads 1.0381 spread after M_96's 1.0386 spread landing); PTSPNGM tight + PTSNGM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_97 ([1, 100] drops to 0.9971 tight from M_96's 0.9972 landing -- fresh 4-decimal bucket after the M_95/M_96 collapse). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septennonagintic_mean == 0 (guarded but unreachable), tight = ptspngm &lt; ${tight_ptspngm_max}, spread = ptspngm in [${tight_ptspngm_max}, ${wide_ptspngm_min}), wide = ptspngm &ge; ${wide_ptspngm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspngm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPNGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPNGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
