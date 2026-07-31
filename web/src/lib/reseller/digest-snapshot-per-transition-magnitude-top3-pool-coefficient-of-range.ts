// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL COEFFICIENT OF
// RANGE pure-lib (P11.213).
//
// BOUNDED ENDPOINT dispersion scalar over the P11.161 pool. Normalises
// the pool's raw endpoint spread (max - min) by the endpoint sum
// (max + min) into a dimensionless value on [0, 1):
//
//   cor = (max - min) / (max + min)
//
// Closes the last unfilled cell of the (unbounded, bounded) x
// (endpoint, interior, whole-pool) dispersion grid opened by P11.209
// IQR RATIO and rounded out by P11.211 QCD:
//   • P11.181 range        = max - min                   (ADDITIVE
//                                                          endpoint,
//                                                          unbounded)
//   • P11.185 top1/bot1    = max / min                   (MULTIPLICATIVE
//                                                          endpoint,
//                                                          unbounded)
//   • P11.207 IQR          = Q3 - Q1                     (ADDITIVE
//                                                          INTERIOR,
//                                                          unbounded)
//   • P11.209 IQR RATIO    = Q3 / Q1                     (MULTIPLICATIVE
//                                                          INTERIOR,
//                                                          unbounded)
//   • P11.211 QCD          = (Q3 - Q1) / (Q3 + Q1)       (BOUNDED
//                                                          INTERIOR)
//   • P11.199 MAD          = mean(|xi - mean(x)|)        (ADDITIVE
//                                                          whole-pool,
//                                                          unbounded)
//   • P11.201 MADm         = mean(|xi - median(x)|)      (ADDITIVE
//                                                          whole-pool,
//                                                          unbounded)
//   • P11.213 COR          = (max - min) / (max + min)   (BOUNDED
//                                                          ENDPOINT,
//                                                          this module)
//
// COR is the classroom "coefficient of range" (Yule 1911; Kendall &
// Stuart Vol.1 §2.19 in modern print) — the endpoint-based sibling of
// QCD. Reads on [0, 1): a pool with max == min yields 0 (flat pool); a
// pool where max dominates min approaches (but never reaches) 1.
// Because the value is bounded, it is directly comparable across
// resellers with different absolute cell-count baselines. In contrast,
// the P11.185 top1/bot1 ratio surface reports the raw multiplicative
// ratio (unbounded in [1, ∞)) and P11.181 range reports the raw
// additive difference (unbounded in [0, ∞)) — the three endpoint
// scalars are order-preserving on strictly-positive pools (higher
// top1/bot1 ↔ higher COR ↔ eventually higher range) but the reader
// picks whichever suits the row: raw multiplicative ratio for magnitude
// comparison against P11.209 IQR RATIO; raw additive difference for
// P11.207 IQR-style scan; bounded COR for normalised
// scan-across-partners readability.
//
// COR uses ENDPOINTS (max, min) rather than hinges (Q3, Q1). That
// makes it maximally sensitive to a single outlier at either extreme —
// the exact opposite of QCD's INTERIOR-MASS robustness. Ops case: a
// (medium, improved) cell with a partner pool of [1,1,1,1,10] has COR
// (10-1)/(10+1) = 9/11 ≈ 0.82 (stark endpoint spread — one partner
// dwarfs the rest) but QCD (Tukey excludes middle; lower [1,1] Q1=1;
// upper [1,10] Q3=5.5) = 4.5/6.5 ≈ 0.69 (also stark but less so). A
// partner pool of [1,1,1,1,1,10] has COR still 0.82 (unchanged — same
// endpoints) but QCD collapses to 0 (interior all 1s; outlier tucked
// into upper-half's max). Reading the two side-by-side lets ops
// distinguish "single outlier" (COR high, QCD low) from "systemic
// spread" (COR high, QCD high).
//
// Well-defined for every pool with pool_count >= 2:
//   • pool_count 0            → cor null, max/min null (empty pool).
//   • pool_count 1            → cor null, max/min null. Distinct
//                               "small_pool" label so the reader knows
//                               the value is structurally-undefined
//                               rather than a computed level verdict —
//                               a single-point pool has no dispersion
//                               concept and (max-min)/(max+min) would
//                               degenerate to 0/(2x) = 0 which is a
//                               false-positive "level" signal.
//   • pool_count >= 2         → cor = (max - min) / (max + min);
//                               rounded to 4 decimals. Denominator is
//                               guaranteed >= 2 because both max and
//                               min are cell counts from a pool where
//                               every value is >= 1 (hot-cells envelope
//                               only counts participants that appear at
//                               least once) — so max >= 1 AND min >= 1
//                               for pool_count >= 1, giving max+min>=2
//                               and division-by-zero cannot fire.
//
// Cutoffs use plain-language bounded-dispersion bands anchored at
// 0.2 / 0.5 — SAME anchors as P11.211 QCD so the two bounded siblings
// (COR = endpoint, QCD = interior) share a common label vocabulary and
// can be scanned side-by-side on the digest without recalibrating.
// Anchors map to raw multiplicative ratios via the closed-form
// r = (1 + cor) / (1 - cor) where r = max / min:
//   • cor 0.2  ↔ top1/bot1 ratio 1.5x
//   • cor 0.5  ↔ top1/bot1 ratio 3.0x
// A reader familiar with the P11.185 top1/bot1 ratio surface's raw
// 2x / 5x anchors (level_max 2x / stark_min 5x) can map their own
// mental thresholds via cor 0.333 (r=2) and cor 0.667 (r=5). The
// bounded-sibling scan-consistency argument wins: keep 0.2 / 0.5 to
// match QCD.
// Bands:
//   • level    (cor <  0.2) — endpoint spread roughly flat; max within
//                              50% of min additively-plus-multiplicatively.
//   • unequal  (cor >= 0.2) — max is 1.5-3x min (via the closed form);
//                              noticeable normalised endpoint spread.
//   • stark    (cor >= 0.5) — max is 3x or more min; extreme normalised
//                              endpoint multiplicative dispersion.
// Both cutoffs are exposed on the envelope as level_cor_max /
// stark_cor_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same INEQUALITY framing as P11.209
// IQR RATIO + P11.211 QCD (HIGH cor = MORE endpoint dispersion). COR
// is picked over the semi-range (max-min)/2 (an unbounded ADDITIVE
// ENDPOINT read — collapses onto the P11.181 range axis after a
// linear rescale so adds no fresh signal) and Michelson contrast
// (max-min)/(max+min) is mathematically identical to COR (used in
// signal-processing / optics literature) so this module's name defers
// to the older classroom nomenclature.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — COR is an endpoint fold that consumes only the two extremes but
// still names the whole-pool count/cells for reader context.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.214):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolQcdSection (P11.211)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173) →
// CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE (P11.165)
// → TOP-2 COMBINED SHARE (P11.167) → BOTTOM-1 SHARE (P11.179) → RANGE
// (P11.181) → BOTTOM-2 COMBINED SHARE (P11.183) → TOP1/BOTTOM1 RATIO
// (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS SHARE (P11.189)
// → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1 RATIO (P11.193) →
// MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN ABSOLUTE GAP (P11.197) →
// MEAN ABSOLUTE DEVIATION (P11.199) → MEDIAN ABSOLUTE DEVIATION
// (P11.201) → SKEWNESS (P11.203) → EXCESS KURTOSIS (P11.205) → IQR
// (P11.207) → IQR RATIO (P11.209) → QCD (P11.211) → COR (this module)
// → per-pair hot-cells GRANULAR (P11.139). COR sits IMMEDIATELY BELOW
// the QCD sibling because the two surfaces are the bounded normalised
// complements of each other (endpoint vs interior) — grouping them
// adjacent lets the reader spot the endpoint-vs-interior dispersion
// contrast in one glance without paging past the raw endpoint
// (P11.181 / P11.185) or raw interior (P11.207 / P11.209) siblings.

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
type CorLabel =
  | "empty"
  | "small_pool"
  | "level"
  | "unequal"
  | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language bounded-dispersion bands. SAME 0.2 / 0.5 anchors as
// P11.211 QCD so the two bounded siblings share a common label
// vocabulary. Anchors map to raw top1/bot1 ratios via the closed-form
// r = (1+cor)/(1-cor) — cor 0.2 ↔ r 1.5x, cor 0.5 ↔ r 3.0x.
const LEVEL_COR_MAX = 0.2;
const STARK_COR_MIN = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const COR_DECIMALS = 4;

// Threshold below which COR degenerates to 0 (single-point pool has
// max == min structurally so cor = 0 which is a false-positive "level"
// signal). Bumped to 2 so the COR surface only fires when there is a
// meaningful two-endpoint spread to measure.
const MIN_POOL_COUNT_FOR_COR = 2;

export interface PerTransitionMagnitudeTop3PoolCoefficientOfRangeBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_max_cells: number | null;
  readonly partner_min_cells: number | null;
  readonly partner_cor: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_max_cells: number | null;
  readonly metric_min_cells: number | null;
  readonly metric_cor: number | null;
}

export interface PerTransitionMagnitudeTop3PoolCoefficientOfRangeBands {
  readonly small: PerTransitionMagnitudeTop3PoolCoefficientOfRangeBand;
  readonly medium: PerTransitionMagnitudeTop3PoolCoefficientOfRangeBand;
  readonly large: PerTransitionMagnitudeTop3PoolCoefficientOfRangeBand;
}

export interface PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolCoefficientOfRangeBands;
}

export interface PerTransitionMagnitudeTop3PoolCoefficientOfRangeMap {
  readonly improved: PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_cor: number;
  readonly level_cor_max: number;
  readonly stark_cor_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolCoefficientOfRangeMap;
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
  max_cells: number | null;
  min_cells: number | null;
  cor: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_COR || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      max_cells: null,
      min_cells: null,
      cor: null,
    };
  }
  let max_cells = values[0];
  let min_cells = values[0];
  for (const v of values) {
    if (v > max_cells) max_cells = v;
    if (v < min_cells) min_cells = v;
  }
  // max + min is guaranteed >= 2 because hot-cells envelope only
  // records participants that appear at least once — both endpoints
  // are >=1, giving max+min>=2 and division-by-zero cannot fire.
  return {
    pool_count,
    pool_cells,
    max_cells,
    min_cells,
    cor: roundTo((max_cells - min_cells) / (max_cells + min_cells), COR_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolCoefficientOfRangeBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_max_cells: partner.max_cells,
    partner_min_cells: partner.min_cells,
    partner_cor: partner.cor,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_max_cells: metric.max_cells,
    metric_min_cells: metric.min_cells,
    metric_cor: metric.cor,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolCoefficientOfRangeEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange {
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
    min_pool_count_for_cor: MIN_POOL_COUNT_FOR_COR,
    level_cor_max: LEVEL_COR_MAX,
    stark_cor_min: STARK_COR_MIN,
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

function labelForCor(
  pool_count: number,
  cor: number | null,
  min_pool_count_for_cor: number,
  level_cor_max: number,
  stark_cor_min: number,
): CorLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_cor || cor === null) return "small_pool";
  if (cor >= stark_cor_min) return "stark";
  if (cor < level_cor_max) return "level";
  return "unequal";
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

function renderCorCell(
  pool_count: number,
  pool_cells: number,
  max_cells: number | null,
  min_cells: number | null,
  cor: number | null,
  min_pool_count_for_cor: number,
  level_cor_max: number,
  stark_cor_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForCor(
    pool_count,
    cor,
    min_pool_count_for_cor,
    level_cor_max,
    stark_cor_min,
  );
  const corText = cor === null ? "-" : cor.toFixed(3);
  const maxText = max_cells === null ? "-" : max_cells.toFixed(0);
  const minText = min_cells === null ? "-" : min_cells.toFixed(0);
  return `cor ${corText} (max ${maxText}, min ${minText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_cor,
    level_cor_max,
    stark_cor_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCorCell(band.partner_pool_count, band.partner_pool_cells, band.partner_max_cells, band.partner_min_cells, band.partner_cor, min_pool_count_for_cor, level_cor_max, stark_cor_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderCorCell(band.metric_pool_count, band.metric_pool_cells, band.metric_max_cells, band.metric_min_cells, band.metric_cor, min_pool_count_for_cor, level_cor_max, stark_cor_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool COEFFICIENT OF RANGE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">BOUNDED ENDPOINT dispersion scalar over the P11.161 pool &mdash; the extremes (max, min) name the normalised endpoint spread of the pool into ONE dimensionless scalar on [0, 1): cor = (max - min) / (max + min). Bounded normalised complement to P11.185 top1/bot1 ratio (unbounded max/min) and P11.181 range (unbounded max-min); endpoint-based counterpart to the P11.211 QCD interior-based bounded scalar (bands + anchors kept in lockstep so the two bounded siblings scan side-by-side). Values in [0, 1) &mdash; max &ge; min by construction. Labels: small_pool = pool_count &lt; ${min_pool_count_for_cor} (single-point pool has max == min structurally so cor degenerates to 0 which is a false-positive level signal; cor null structurally), level = cor &lt; ${level_cor_max} (endpoint spread roughly flat &mdash; corresponds to top1/bot1 ratio &lt; 1.5x), unequal = cor in [${level_cor_max}, ${stark_cor_min}) (noticeable normalised endpoint spread &mdash; top1/bot1 ratio 1.5-3x), stark = cor &ge; ${stark_cor_min} (extreme normalised endpoint multiplicative dispersion &mdash; top1/bot1 ratio 3x or more). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + cor null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner cor</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI cor</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
