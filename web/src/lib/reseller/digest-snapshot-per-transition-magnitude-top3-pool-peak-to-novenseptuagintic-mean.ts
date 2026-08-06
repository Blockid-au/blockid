// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVENSEPTUAGINTIC-MEAN
// pure-lib (P11.412).
//
// WHOLE-POOL RANGE-AGAINST-NOVENSEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVENSEPTUAGINTIC MEAN (a.k.a. power mean of order 79, M_79):
//
//   ptnspqm = (max - min) / novenseptuagintic_mean
//
// where novenseptuagintic_mean = ((sum x_i^79) / n)^(1/79). Reads the
// peak spread against the NOVENSEPTUAGINTIC (power-mean-of-order-79)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.410 PTOSPQM, because raising to the SEVENTY-NINTH power before
// averaging lifts the anchor MORE than raising to the seventy-eighth
// does, dampening the ratio against the range even harder.
//
// PTNSPQM's unique DISPERSION-axis contribution: reads range in units
// of the NOVENSEPTUAGINTIC (POWER-MEAN-OF-ORDER-79) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2, cubic
// M_3 ... septenseptuagintic M_77, octoseptuagintic M_78) power-mean
// DECEMSEPTUAGINTUPLET into a UNDECEMSEPTUAGINTUPLET with the M_79
// novenseptuagintic mean. By Power Mean inequality M_79 >= M_78, so
// novenseptuagintic_mean >= octoseptuagintic_mean and
// ptnspqm <= ptospqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novenseptuagintic_mean approaches x_max / n^(1/79), so ptnspqm
// approaches n^(1/79) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/79) ~= 1.0296, for n=20 ~= 1.0386, for n=30 ~= 1.0440, for
// n=40 ~= 1.0478, for n=50 ~= 1.0508, for n=60 ~= 1.0532, for n=70
// ~= 1.0553, for n=80 ~= 1.0570, for n=85 ~= 1.0578, for n=89 ~= 1.0585
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/79) ~= 1.0600) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/79) ~= 1.0600, and the
// pool100 [1x99, 100] reference reads 1.0494 spread (further absorbed
// from PTOSPQM's 1.0502 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_79.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novenseptuagintic_mean = k,
//                                     range 0, ptnspqm 0 (tight).
//   * uniform ramp [1..10]          -> NSPQM ~= 9.7128, range 9,
//                                     ptnspqm ~= 0.9266 (tight).
//   * upper-outlier [1x9, 10]       -> NSPQM ~= 9.7127, range 9,
//                                     ptnspqm ~= 0.9266 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.410 PTOSPQM's 0.9270
//                                     tick; at M_79 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9266 tick as the
//                                     anchor keeps drifting past M_78).
//   * two-shoulders [1x8, 5x2]      -> NSPQM ~= 4.8992, range 4,
//                                     ptnspqm ~= 0.8165 (tight).
//   * 50/50 split [1x5, 10x5]       -> NSPQM ~= 9.9126, range 9,
//                                     ptnspqm ~= 0.9079 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NSPQM ~= 97.1274, range 99,
//                                     ptnspqm ~= 1.0193 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/79) ~ 1.0296 asymptote).
//   * two-partner [1, 9]            -> NSPQM ~= 8.9214, range 8,
//                                     ptnspqm ~= 0.8967 (tight).
//   * two-partner [1, 100]          -> NSPQM ~= 99.1264, range 99,
//                                     ptnspqm ~= 0.9987 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTOSPQM's 0.9988
//                                     tick; mean_79 tips further past
//                                     the range, so ptnspqm rounds to
//                                     0.9987 from below).
//   * small [10, 1, 1]              -> NSPQM ~= 9.8619, range 9,
//                                     ptnspqm ~= 0.9126 (tight).
//   * pool_count=100 [1x99, 100]    -> NSPQM ~= 94.3373, range 99,
//                                     ptnspqm ~= 1.0494 (SPREAD --
//                                     FURTHER ABSORBED from PTOSPQM
//                                     M_78's 1.0502 spread;
//                                     100-partner asymptote
//                                     100^(1/79) ~ 1.0600 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptnspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novenseptuagintic_mean == 0
//   * tight                ptnspqm < 1.005
//   * spread               ptnspqm in [1.005, 1.09)
//   * wide                 ptnspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnspqm_max /
// wide_ptnspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.413):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoseptuaginticMeanSection
// (P11.411) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novenseptuagintic-center
// after the P11.411 range-against-octoseptuagintic-center landing.

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
type PtnspqmLabel =
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

// Bands on raw ptnspqm (fixed cutoffs since novenseptuagintic_mean
// scales with cell counts and typical novenseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_79 is 0.9266
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0300 (M_78) to
// 1.0296 (M_79), 20-partner drops from 1.0392 to 1.0386, 30-partner
// drops from 1.0446 to 1.0440, 40-partner drops from 1.0484 to 1.0478,
// 50-partner drops from 1.0514 to 1.0508, 60-partner drops from 1.0539
// to 1.0532, 70-partner drops from 1.0560 to 1.0553, 80-partner drops
// from 1.0578 to 1.0570, 85-partner drops from 1.0586 to 1.0578,
// 89-partner drops from 1.0592 to 1.0585 -- so pool_count >= 100
// (100^(1/79) ~ 1.0600) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTOSPQM 1.0502 spread to PTNSPQM 1.0494 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTNSPQM_MAX = 1.005;
const WIDE_PTNSPQM_MIN = 1.09;

// PTNSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novenseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novenseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnspqm_max: number;
  readonly wide_ptnspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanMap;
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

// Peak-to-novenseptuagintic-mean of a discrete distribution:
//   PTNSPQM = (max - min) / novenseptuagintic_mean
// where novenseptuagintic_mean = ((sum x_i^79) / n)^(1/79). Returns
// null on empty, solo, and degenerate (zero novenseptuagintic_mean
// or non-finite seventy-ninth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novenseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^79 = (x^8)^9 * x^4 * x^2 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct * quad * sq * v
    seventyNinthSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(seventyNinthSum) || seventyNinthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenseptuagintic_mean: null,
    };
  }
  const novenseptuagintic_mean = Math.pow(
    seventyNinthSum / pool_count,
    1 / 79,
  );
  if (
    !Number.isFinite(novenseptuagintic_mean) ||
    novenseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novenseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnspqm = range / novenseptuagintic_mean;
  const clamped = ptnspqm < 0 ? 0 : ptnspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_novenseptuagintic_mean: roundTo(clamped, PTNSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novenseptuagintic_mean:
      partner.peak_to_novenseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novenseptuagintic_mean:
      metric.peak_to_novenseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMean {
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
    tight_ptnspqm_max: TIGHT_PTNSPQM_MAX,
    wide_ptnspqm_min: WIDE_PTNSPQM_MIN,
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

function labelForPtnspqm(
  pool_count: number,
  pool_cells: number,
  ptnspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtnspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnspqm === null) return "degenerate";
  if (ptnspqm >= wide_min) return "wide";
  if (ptnspqm < tight_max) return "tight";
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

function renderPtnspqmCell(
  pool_count: number,
  pool_cells: number,
  ptnspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnspqm(
    pool_count,
    pool_cells,
    ptnspqm,
    tight_max,
    wide_min,
  );
  const ptnspqmText = ptnspqm === null ? "-" : ptnspqm.toFixed(4);
  return `PTNSPQM ${ptnspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovenseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnspqm_max, wide_ptnspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novenseptuagintic_mean, tight_ptnspqm_max, wide_ptnspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novenseptuagintic_mean, tight_ptnspqm_max, wide_ptnspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVENSEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVENSEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnspqm = (max - min) / novenseptuagintic_mean where novenseptuagintic_mean = ((sum x_i^79) / n)^(1/79). Reads the pool's total RANGE in units of its NOVENSEPTUAGINTIC (power-mean-of-order-79, M_79) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.410 PTOSPQM because raising to the SEVENTY-NINTH power lifts the anchor MORE than raising to the seventy-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoseptuagintic) power-mean DECEMSEPTUAGINTUPLET into a UNDECEMSEPTUAGINTUPLET with the M_79 novenseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnspqm approaches n^(1/79) so 10-partner pools cap near 1.0296, 20-partner near 1.0386, 30-partner near 1.0440, 40-partner near 1.0478, 50-partner near 1.0508, 60-partner near 1.0532, 70-partner near 1.0553, 80-partner near 1.0570, 85-partner near 1.0578 and 89-partner near 1.0585 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/79) ~= 1.0600) are required to escape into wide with a modest outlier. Composite regime labels: PTNSPQM tight + PTOSPQM tight = MILD OUTLIER absorbed by novenseptuagintic ([1x9, 10] reads PTNSPQM 0.9266 tight); PTNSPQM spread + PTOSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNSPQM 1.0193 spread); PTNSPQM spread + PTOSPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_79 ([1x99, 100] reads 1.0494 spread after M_78's 1.0502 spread landing); PTNSPQM tight + PTOSPQM tight = ISOLATED HIGH PARTNER continues absorption past M_78 into M_79 ([1, 100] reads 0.9987 tight after M_78's 0.9988 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novenseptuagintic_mean == 0 (guarded but unreachable), tight = ptnspqm &lt; ${tight_ptnspqm_max}, spread = ptnspqm in [${tight_ptnspqm_max}, ${wide_ptnspqm_min}), wide = ptnspqm &ge; ${wide_ptnspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
