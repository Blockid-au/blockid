// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXAGINTIC-MEAN
// pure-lib (P11.374).
//
// WHOLE-POOL RANGE-AGAINST-SEXAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEXAGINTIC MEAN (a.k.a. power mean of order 60, M_60):
//
//   ptsxqm = (max - min) / sexagintic_mean
//
// where sexagintic_mean = ((sum x_i^60) / n)^(1/60). Reads the
// peak spread against the SEXAGINTIC (power-mean-of-order-60)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.372 PTNQQM, because raising to the SIXTIETH power before
// averaging lifts the anchor MORE than raising to the fifty-ninth
// does, dampening the ratio against the range even harder.
//
// PTSXQM's unique DISPERSION-axis contribution: reads range in units
// of the SEXAGINTIC (POWER-MEAN-OF-ORDER-60) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octoquinquagintic M_58, novemquinquagintic M_59)
// power-mean UNSEXAGINTUPLET into a DUOSEXAGINTUPLET with the M_60
// sexagintic mean. By Power Mean inequality M_60 >= M_59, so
// sexagintic_mean >= novemquinquagintic_mean and
// ptsxqm <= ptnqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sexagintic_mean approaches x_max / n^(1/60), so ptsxqm
// approaches n^(1/60) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/60) ~= 1.0391, for n=20 ~= 1.0512, for n=30 ~= 1.0583, for
// n=40 ~= 1.0634, for n=50 ~= 1.0674, for n=60 ~= 1.0706, for n=70
// ~= 1.0734, for n=80 ~= 1.0758, for n=85 ~= 1.0769, for n=89 ~= 1.0777
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/60) ~= 1.0792) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/60) ~= 1.0798, and the
// pool100 [1x99, 100] reference reads 1.0690 spread (further absorbed
// from PTNQQM's 1.0704 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_60.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sexagintic_mean = k,
//                                     range 0, ptsxqm 0 (tight).
//   * uniform ramp [1..10]          -> SXQM ~= 9.6238, range 9, ptsxqm
//                                     ~= 0.9352 (tight).
//   * upper-outlier [1x9, 10]       -> SXQM ~= 9.6235, range 9, ptsxqm
//                                     ~= 0.9352 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.372
//                                     PTNQQM's 0.9358 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SXQM ~= 4.8677, range 4, ptsxqm
//                                     ~= 0.8217 (tight).
//   * 50/50 split [1x5, 10x5]       -> SXQM ~= 9.8851, range 9, ptsxqm
//                                     ~= 0.9105 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SXQM ~= 96.2351, range 99,
//                                     ptsxqm ~= 1.0287 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/60) ~ 1.0391
//                                     asymptote).
//   * two-partner [1, 9]            -> SXQM ~= 8.8966, range 8, ptsxqm
//                                     ~= 0.8992 (tight).
//   * two-partner [1, 100]          -> SXQM ~= 98.8514, range 99, ptsxqm
//                                     ~= 1.0015 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_60; PTNQQM's M_59
//                                     landing at 1.0017 already sat below
//                                     tight and PTSXQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> SXQM ~= 9.8186, range 9, ptsxqm
//                                     ~= 0.9166 (tight).
//   * pool_count=100 [1x99, 100]    -> SXQM ~= 92.6119, range 99, ptsxqm
//                                     ~= 1.0690 (SPREAD -- FURTHER
//                                     ABSORBED from PTNQQM M_59's 1.0704
//                                     spread; 100-partner asymptote
//                                     100^(1/60) ~ 1.0798 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptsxqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sexagintic_mean == 0
//   * tight                ptsxqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptsxqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0391,
//                          20-partner ~ 1.0512, 30-partner ~ 1.0583,
//                          40-partner ~ 1.0634, 50-partner ~ 1.0674,
//                          60-partner ~ 1.0706, 70-partner ~ 1.0734,
//                          80-partner ~ 1.0758, 85-partner ~ 1.0769,
//                          89-partner ~ 1.0777 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0690 also caps
//                          within spread)
//   * wide                 ptsxqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptsxqm_max /
// wide_ptsxqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.375):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemquinquaginticMeanSection
// (P11.373) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sexagintic-center
// after the P11.373 range-against-novemquinquagintic-center landing.

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
type PtsxqmLabel =
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

// Bands on raw ptsxqm (fixed cutoffs since sexagintic_mean
// scales with cell counts and typical sexagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_60 is 0.9352
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0398 (M_59) to
// 1.0391 (M_60), 20-partner drops from 1.0521 to 1.0512, 30-partner
// drops from 1.0593 to 1.0583, 40-partner drops from 1.0645 to 1.0634,
// 50-partner drops from 1.0686 to 1.0674, 60-partner drops from 1.0719
// to 1.0706, 70-partner drops from 1.0747 to 1.0734, 80-partner drops
// from 1.0771 to 1.0758, 85-partner drops from 1.0782 to 1.0769,
// 89-partner lands at 1.0777 -- so pool_count >= 97 (97^(1/60) ~
// 1.0792) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTNQQM 1.0704
// spread to PTSXQM 1.0690 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTSXQM_MAX = 1.005;
const WIDE_PTSXQM_MIN = 1.09;

// PTSXQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSXQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sexagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sexagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsxqm_max: number;
  readonly wide_ptsxqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanMap;
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

// Peak-to-sexagintic-mean of a discrete distribution:
//   PTSXQM = (max - min) / sexagintic_mean
// where sexagintic_mean = ((sum x_i^60) / n)^(1/60). Returns
// null on empty, solo, and degenerate (zero sexagintic_mean
// or non-finite sixtieth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sexagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let sixtiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^60 = x^56 * x^4 = (x^8)^7 * x^4 -> oct*oct*oct*oct*oct*oct*oct*quad
    sixtiethSum += oct * oct * oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(sixtiethSum) || sixtiethSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexagintic_mean: null,
    };
  }
  const sexagintic_mean = Math.pow(sixtiethSum / pool_count, 1 / 60);
  if (!Number.isFinite(sexagintic_mean) || sexagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsxqm = range / sexagintic_mean;
  const clamped = ptsxqm < 0 ? 0 : ptsxqm;
  return {
    pool_count,
    pool_cells,
    peak_to_sexagintic_mean: roundTo(clamped, PTSXQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sexagintic_mean: partner.peak_to_sexagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sexagintic_mean: metric.peak_to_sexagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexaginticMean {
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
    tight_ptsxqm_max: TIGHT_PTSXQM_MAX,
    wide_ptsxqm_min: WIDE_PTSXQM_MIN,
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

function labelForPtsxqm(
  pool_count: number,
  pool_cells: number,
  ptsxqm: number | null,
  tight_max: number,
  wide_min: number,
): PtsxqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsxqm === null) return "degenerate";
  if (ptsxqm >= wide_min) return "wide";
  if (ptsxqm < tight_max) return "tight";
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

function renderPtsxqmCell(
  pool_count: number,
  pool_cells: number,
  ptsxqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsxqm(
    pool_count,
    pool_cells,
    ptsxqm,
    tight_max,
    wide_min,
  );
  const ptsxqmText = ptsxqm === null ? "-" : ptsxqm.toFixed(4);
  return `PTSXQM ${ptsxqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsxqm_max, wide_ptsxqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsxqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sexagintic_mean, tight_ptsxqm_max, wide_ptsxqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsxqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sexagintic_mean, tight_ptsxqm_max, wide_ptsxqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsxqm = (max - min) / sexagintic_mean where sexagintic_mean = ((sum x_i^60) / n)^(1/60). Reads the pool's total RANGE in units of its SEXAGINTIC (power-mean-of-order-60, M_60) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.372 PTNQQM because raising to the SIXTIETH power lifts the anchor MORE than raising to the fifty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemquinquagintic) power-mean UNSEXAGINTUPLET into a DUOSEXAGINTUPLET with the M_60 sexagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsxqm approaches n^(1/60) so 10-partner pools cap near 1.0391, 20-partner near 1.0512, 30-partner near 1.0583, 40-partner near 1.0634, 50-partner near 1.0674, 60-partner near 1.0706, 70-partner near 1.0734, 80-partner near 1.0758, 85-partner near 1.0769 and 89-partner near 1.0777 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/60) ~= 1.0792) are required to escape into wide with a modest outlier. Composite regime labels: PTSXQM tight + PTNQQM tight = MILD OUTLIER absorbed by sexagintic ([1x9, 10] reads PTSXQM 0.9352 tight); PTSXQM spread + PTNQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSXQM 1.0287 spread); PTSXQM spread + PTNQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_60 ([1x99, 100] reads 1.0690 spread after M_59's 1.0704 spread landing); PTSXQM tight + PTNQQM tight = ISOLATED HIGH PARTNER already absorbed at M_59 stays absorbed at M_60 ([1, 100] reads 1.0015 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sexagintic_mean == 0 (guarded but unreachable), tight = ptsxqm &lt; ${tight_ptsxqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptsxqm in [${tight_ptsxqm_max}, ${wide_ptsxqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptsxqm &ge; ${wide_ptsxqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsxqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSXQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSXQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
