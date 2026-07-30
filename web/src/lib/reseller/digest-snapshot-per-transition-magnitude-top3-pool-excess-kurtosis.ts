// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL EXCESS KURTOSIS
// pure-lib (P11.205).
//
// Fisher-Pearson standardised fourth-moment coefficient (Fisher's
// EXCESS form — subtract 3 so the normal reference distribution reads
// zero) over the P11.161 pool that folds every pool cell into ONE
// signed tail-heaviness scalar:
//
//   g2 = m4 / m2^2 - 3
//     where m2 = (1/n) * sum((xi - mean)^2)
//           m4 = (1/n) * sum((xi - mean)^4)
//
// Sits on the ASYMMETRY axis's TAIL-HEAVINESS companion — the P11.203
// SKEWNESS surface (Fisher-Pearson standardised THIRD-moment g1) reads
// which side of the mean the pool's mass tips toward; this surface
// reads how much of the pool's mass sits in the tails vs the shoulders
// on either side of the mean, independent of asymmetry. The (skewness,
// excess-kurtosis) pair completes the classic (g1, g2) higher-moment
// shape descriptor pair — every reader who scans both surfaces
// simultaneously gets the same (asymmetry, tail-heaviness) mental model
// that intro-stats texts use to summarise arbitrary distributions.
//
// Well-defined for every pool with pool_count >= 2 and nonzero
// variance:
//   • pool_count 0            → excess_kurtosis null (empty pool).
//   • pool_count 1            → excess_kurtosis 0 by definition (solo
//                               — a single cell is trivially
//                               mesokurtic around itself; matches the
//                               P11.203 solo convention).
//   • pool_count >= 2 and     → excess_kurtosis 0 by definition (flat
//     variance 0                pool — every cell equals the mean; no
//                               tail-heaviness axis to measure).
//                               Pinned rather than division-by-zero.
//   • pool_count >= 2 and     → g2 as above; rounded to 4 decimals.
//     variance > 0              Range [-2, +inf); the -2 floor is
//                               reached exactly by two-point symmetric
//                               pools (bimodal — all mass at the
//                               extremes, no shoulders at all) and
//                               approached by small pools with two
//                               peaks.
//
// Uses POPULATION moments (divide by n, not n-1) — matches the
// convention baked into P11.199 MAD, P11.201 MADm and P11.203
// skewness which are all population averages. Sample-corrected
// kurtosis (with the (n-1)(n+1)/((n-2)(n-3)) Bessel-style factor) is
// undefined at n <= 3 and unstable at n = 4, so the population form
// is chosen for continuity across pool_count boundaries.
//
// Label vocabulary (five bands, matching the five-band shape of
// P11.199/P11.201/P11.203):
//   • empty        pool_count == 0
//   • solo         pool_count == 1 (structurally mesokurtic)
//   • mesokurtic   |g2| < 0.5 (near-normal tail-heaviness)
//   • leptokurtic  g2 >= +0.5 (heavy tails; mass concentrates in the
//                  extremes AND the centre with light shoulders — the
//                  classic "peaked with fat tails" shape a single-
//                  outlier pool exhibits once pool_count >= 5)
//   • platykurtic  g2 <= -0.5 (light tails; mass spreads across the
//                  shoulders with a flat top — bimodal two-point
//                  pools sit at the extreme -2 floor)
//
// The +/-0.5 band edge matches the P11.203 skewness convention so a
// reader who scans both surfaces uses the SAME numeric mental anchor
// for "clearly asymmetric" and "clearly tail-shifted". Both cutoffs
// are exposed on the envelope as mesokurtic_excess_kurtosis_abs_max
// so downstream JSONL consumers render the label vocabulary without
// importing the TS module.
//
// LABEL ORIENTATION follows the standard EXCESS-KURTOSIS framing
// (POSITIVE = heavy tails vs normal, NEGATIVE = light tails / flat-
// topped vs normal, ZERO = mesokurtic like a normal). The choice to
// subtract 3 (Fisher's EXCESS form) rather than report raw kurtosis
// = m4/m2^2 is picked so the zero-reference is the normal
// distribution — matching every intro-stats convention and letting
// the vocabulary treat "no signal" as g2 = 0.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — excess kurtosis is a pool-wide fold that consumes every cell.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.206):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolSkewnessSection
// (P11.203) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177)
// → TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1
// RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN
// ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION (P11.199) →
// MEDIAN ABSOLUTE DEVIATION (P11.201) → SKEWNESS (P11.203) →
// EXCESS KURTOSIS (this module) → per-pair hot-cells GRANULAR
// (P11.139). Excess kurtosis sits IMMEDIATELY BELOW skewness so the
// (g1, g2) higher-moment pair stays adjacent in the pool-shape
// family — asymmetry read first, tail-heaviness second, matching
// intro-stats presentation order.

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
type ExcessKurtosisLabel =
  | "empty"
  | "solo"
  | "mesokurtic"
  | "leptokurtic"
  | "platykurtic";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Symmetric zero-centred band edge. |g2| < 0.5 is treated as
// mesokurtic (near-normal tail-heaviness) — matches the P11.203
// skewness convention so both higher-moment surfaces share the same
// numeric mental anchor for "clearly signalled".
const MESOKURTIC_EXCESS_KURTOSIS_ABS_MAX = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-
// noise re-runs. Same precision as every other pool-shape sibling.
const EXCESS_KURTOSIS_DECIMALS = 4;

// Threshold below which a pool has no meaningful tail-heaviness
// distinction (a single cell is trivially mesokurtic around itself).
const SOLO_MAX_POOL_COUNT = 1;

export interface PerTransitionMagnitudeTop3PoolExcessKurtosisBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_mean_cells: number | null;
  readonly partner_excess_kurtosis: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_mean_cells: number | null;
  readonly metric_excess_kurtosis: number | null;
}

export interface PerTransitionMagnitudeTop3PoolExcessKurtosisBands {
  readonly small: PerTransitionMagnitudeTop3PoolExcessKurtosisBand;
  readonly medium: PerTransitionMagnitudeTop3PoolExcessKurtosisBand;
  readonly large: PerTransitionMagnitudeTop3PoolExcessKurtosisBand;
}

export interface PerTransitionMagnitudeTop3PoolExcessKurtosisEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolExcessKurtosisBands;
}

export interface PerTransitionMagnitudeTop3PoolExcessKurtosisMap {
  readonly improved: PerTransitionMagnitudeTop3PoolExcessKurtosisEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolExcessKurtosisEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolExcessKurtosisEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolExcessKurtosisEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly mesokurtic_excess_kurtosis_abs_max: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolExcessKurtosisMap;
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

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  mean_cells: number | null;
  excess_kurtosis: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      mean_cells: null,
      excess_kurtosis: null,
    };
  }
  const mean = pool_cells / pool_count;
  // Solo pools are structurally mesokurtic around themselves. Pin
  // excess_kurtosis 0 and let the label render as "solo" so
  // downstream readers know the value is structural, not a computed
  // mesokurtic verdict.
  if (pool_count <= SOLO_MAX_POOL_COUNT) {
    return {
      pool_count,
      pool_cells,
      mean_cells: roundTo(mean, EXCESS_KURTOSIS_DECIMALS),
      excess_kurtosis: 0,
    };
  }
  let m2 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - mean;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
  }
  m2 /= pool_count;
  m4 /= pool_count;
  // Flat pool (all cells equal): variance zero, fourth moment zero.
  // Pin excess_kurtosis 0 rather than divide by zero.
  const excess_kurtosis =
    m2 === 0 ? 0 : roundTo(m4 / (m2 * m2) - 3, EXCESS_KURTOSIS_DECIMALS);
  return {
    pool_count,
    pool_cells,
    mean_cells: roundTo(mean, EXCESS_KURTOSIS_DECIMALS),
    excess_kurtosis,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolExcessKurtosisBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_mean_cells: partner.mean_cells,
    partner_excess_kurtosis: partner.excess_kurtosis,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_mean_cells: metric.mean_cells,
    metric_excess_kurtosis: metric.excess_kurtosis,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolExcessKurtosisEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis {
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
    mesokurtic_excess_kurtosis_abs_max: MESOKURTIC_EXCESS_KURTOSIS_ABS_MAX,
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

function labelForExcessKurtosis(
  pool_count: number,
  excess_kurtosis: number | null,
  mesokurtic_abs_max: number,
): ExcessKurtosisLabel {
  if (pool_count === 0 || excess_kurtosis === null) return "empty";
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (excess_kurtosis >= mesokurtic_abs_max) return "leptokurtic";
  if (excess_kurtosis <= -mesokurtic_abs_max) return "platykurtic";
  return "mesokurtic";
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

function renderExcessKurtosisCell(
  pool_count: number,
  pool_cells: number,
  mean_cells: number | null,
  excess_kurtosis: number | null,
  mesokurtic_abs_max: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForExcessKurtosis(
    pool_count,
    excess_kurtosis,
    mesokurtic_abs_max,
  );
  const kurtosisText =
    excess_kurtosis === null ? "-" : excess_kurtosis.toFixed(2);
  const meanText = mean_cells === null ? "-" : mean_cells.toFixed(2);
  return `g2 ${kurtosisText} (mean ${meanText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { mesokurtic_excess_kurtosis_abs_max } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderExcessKurtosisCell(band.partner_pool_count, band.partner_pool_cells, band.partner_mean_cells, band.partner_excess_kurtosis, mesokurtic_excess_kurtosis_abs_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderExcessKurtosisCell(band.metric_pool_count, band.metric_pool_cells, band.metric_mean_cells, band.metric_excess_kurtosis, mesokurtic_excess_kurtosis_abs_max)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool EXCESS KURTOSIS across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">DIRECT anchor-free tail-heaviness read over the P11.161 pool &mdash; Fisher-Pearson standardised fourth-moment coefficient (EXCESS form, subtract 3 so normal reference reads zero) folds every pool cell into ONE SIGNED tail-heaviness scalar: g2 = m4 / m2^2 - 3. Companion to the P11.203 SKEWNESS surface &mdash; the (g1, g2) pair completes the classic higher-moment shape descriptor used across intro-stats presentations of arbitrary distributions. Values in [-2, +&infin;) &mdash; positive = heavy tails vs normal (leptokurtic; single-outlier pools with pool_count &ge; 5 exhibit this shape), negative = light tails / flat-topped vs normal (platykurtic; two-point symmetric pools hit the -2 floor exactly), zero = mesokurtic like a normal. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (a single cell is trivially mesokurtic around itself), mesokurtic = |g2| &lt; ${mesokurtic_excess_kurtosis_abs_max} (near-normal tail-heaviness), leptokurtic = g2 &ge; +${mesokurtic_excess_kurtosis_abs_max} (heavy tails), platykurtic = g2 &le; -${mesokurtic_excess_kurtosis_abs_max} (light tails). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + excess_kurtosis null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner excess kurtosis</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI excess kurtosis</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
