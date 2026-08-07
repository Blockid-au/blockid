// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MID-MASS SHARE
// pure-lib (P11.189).
//
// Middle-mass EVENNESS scalar over the P11.161 pool. Where P11.165
// top-1 share names the fraction owned by the SINGLE LEADER and
// P11.179 bottom-1 share names the fraction owned by the SINGLE
// TRAILER, MID-MASS SHARE names the fraction the pool holds OUTSIDE
// the two extreme slots:
//
//   mid_mass_share = (pool_cells - top1_cells - bottom1_cells) / pool_cells
//
// The two share surfaces bracket the pool from head and floor;
// mid-mass folds the leftover mass between them into ONE scalar
// naming how much of the pool sits in the middle slots. It
// complements the P11.181 RANGE surface (which names the ADDITIVE
// spread top1_share - bottom1_share on the SAME extremes) by naming
// the mass those extremes DO NOT hold:
//
//   • Cell A: pool [1, 1, 1]   — top1 1/3, bottom1 1/3, mid_mass 1/3
//                                (0.3333, moderate). Range 0
//                                (compressed). Middle carries a full
//                                third of the pool.
//   • Cell B: pool [6, 1, 1]   — top1 6/8=0.75, bottom1 1/8=0.125,
//                                mid_mass 1/8=0.125 (thin). Range
//                                0.625 (wide). Almost all pool mass
//                                lives at the extremes.
//   • Cell C: pool [3, 3, 3, 1] — top1 3/10=0.3, bottom1 1/10=0.1,
//                                 mid_mass 6/10=0.6 (fat). Range
//                                 0.2 (moderate). Middle dominates
//                                 the pool despite a visible head/
//                                 floor gap.
//   • Cell D: pool [10, 5, 5]  — top1 10/20=0.5, bottom1 5/20=0.25,
//                                mid_mass 5/20=0.25 (moderate).
//                                Range 0.25 (moderate). Middle
//                                slot carries as much as the floor.
//
// Mid-mass is well-defined for every non-empty pool:
//   • pool_count 0 → mid_mass_share null (empty).
//   • pool_count 1 → mid_mass_share 0 by definition. The single
//                    slot IS both top-1 and bottom-1, so there is
//                    no leftover mass. Surfaced as "solo" so a
//                    downstream reader knows the 0 is structural
//                    not derived.
//   • pool_count 2 → mid_mass_share 0 by definition. The two slots
//                    exhaust the pool between top-1 and bottom-1.
//                    Surfaced as "solo" (same rationale — no middle
//                    exists to measure).
//   • pool_count >= 3 → mid_mass_share = (pool_cells - top1_cells -
//                       bottom1_cells) / pool_cells; ranges from 0
//                       (when middle cells hold 0 mass, impossible
//                       for the hot-cells envelope since every
//                       counted participant holds >= 1 cell) up to
//                       (pool_cells - 2) / pool_cells (when top-1
//                       and bottom-1 each hold exactly 1 cell and
//                       every middle slot holds the remainder).
//
// Cutoffs use evenness-framed bands so a downstream reader can pick
// out pools where the middle carries meaningful mass:
//   • thin      (mid_mass_share <  0.20) — extremes dominate the
//                                          pool; middle is a sliver.
//   • moderate  (mid_mass_share >= 0.20) — noticeable middle mass;
//                                          extremes still visible.
//   • fat       (mid_mass_share >= 0.40) — middle dominates the
//                                          pool; extremes are just
//                                          tips.
// Both cutoffs are exposed on the envelope as thin_mid_max /
// fat_mid_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the EVENNESS-framing convention: a HIGH
// mid_mass_share = HIGH middle mass = LOW extremes concentration.
// This matches the P11.177 H_norm / P11.179 bottom-1 / P11.183
// bottom-2 vocabularies where the top band names the "flatter" or
// "thicker-tail" pool. It inverts the P11.163 HHI / P11.169 Gini /
// P11.171 Theil / P11.173 Atkinson / P11.175 CV / P11.181 range /
// P11.185 top1/bottom1 / P11.187 top2/bottom2 inequality framings
// (where the top band names the "peakier" pool). Mid-mass orientation
// is chosen because a middle-mass reader wants "big number = fat
// middle" for direct human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. TOP_K + BOTTOM_K are both 1
// (the two extreme slots we subtract off the pool sum).
//
// Splice placement rule for a follow-up cron-wiring tick (P11.190):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection
// (P11.188) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177)
// → TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (this module) → per-pair hot-cells GRANULAR (P11.139).
// Whole-pool inequality SEXTET first, then leader slice, dominant-
// pair slice, floor slice, head-to-floor SPREAD, floor-pair slice,
// single-slot head/floor RATIO, two-slot dominant-pair/floor-pair
// RATIO, then MIDDLE-MASS complement — the pool is described from
// every-end-then-each-slice-then-spread-then-tail-slice-then-single-
// slot-ratio-then-two-slot-ratio-then-middle-mass before the per-
// pair granular table. Middle-mass is the natural completion of the
// head + floor + spread + ratio family because it names the mass
// those surfaces DO NOT touch, closing the pool description to a
// self-verifying identity: top1_share + mid_mass_share + bottom1_share
// = 1 for pool_count >= 2.

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
type MidMassLabel =
  | "empty"
  | "solo"
  | "thin"
  | "moderate"
  | "fat";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language middle-mass bands. Anchored to natural pool shapes:
// pool [1,1,1] → mid_mass = 1/3 ≈ 0.333 (moderate); pool [3,3,3,1]
// → mid_mass = 6/10 = 0.6 (fat); pool [6,1,1] → mid_mass = 1/8 =
// 0.125 (thin). Thin catches the extremes-dominated regime where a
// middle mass under a fifth of the pool signals a peaky head/floor
// pair with the middle squeezed out.
const THIN_MID_MAX = 0.2;
const FAT_MID_MIN = 0.4;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.165
// top-1 + P11.179 bottom-1 + P11.181 range surfaces.
const SHARE_DECIMALS = 4;

// TOP_K and BOTTOM_K are both 1 (the two extreme slots we subtract).
// Independent of TOP_N (the leaderboard display cap).
const TOP_K = 1;
const BOTTOM_K = 1;

export interface PerTransitionMagnitudeTop3PoolMidMassShareBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top1_share: number | null;
  readonly partner_bottom1_share: number | null;
  readonly partner_mid_mass_cells: number;
  readonly partner_mid_mass_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top1_share: number | null;
  readonly metric_bottom1_share: number | null;
  readonly metric_mid_mass_cells: number;
  readonly metric_mid_mass_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMidMassShareBands {
  readonly small: PerTransitionMagnitudeTop3PoolMidMassShareBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMidMassShareBand;
  readonly large: PerTransitionMagnitudeTop3PoolMidMassShareBand;
}

export interface PerTransitionMagnitudeTop3PoolMidMassShareEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMidMassShareBands;
}

export interface PerTransitionMagnitudeTop3PoolMidMassShareMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMidMassShareEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMidMassShareEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMidMassShareEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMidMassShareEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly top_k: number;
  readonly bottom_k: number;
  readonly thin_mid_max: number;
  readonly fat_mid_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMidMassShareMap;
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
  top1_share: number | null;
  bottom1_share: number | null;
  mid_mass_cells: number;
  mid_mass_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top1_share: null,
      bottom1_share: null,
      mid_mass_cells: 0,
      mid_mass_share: null,
    };
  }
  const top1_cells = Math.max(...values);
  const bottom1_cells = Math.min(...values);
  const top1_share = roundTo(top1_cells / pool_cells, SHARE_DECIMALS);
  const bottom1_share = roundTo(bottom1_cells / pool_cells, SHARE_DECIMALS);
  // pool_count 1: top1 and bottom1 refer to the SAME slot so mid_mass
  // is 0 by definition (no leftover mass). pool_count 2: top1 and
  // bottom1 exhaust the pool between them so mid_mass is again 0 by
  // definition. pool_count >= 3: subtract both extreme slots to
  // isolate the interior mass.
  const mid_mass_cells =
    pool_count <= 1 ? 0 : pool_cells - top1_cells - bottom1_cells;
  // Compute mid_mass_share from RAW cells first, then round, so
  // float drift on the two rounded shares cannot skew the middle by
  // one ulp.
  const rawMid = mid_mass_cells / pool_cells;
  const mid_mass_share = roundTo(rawMid < 0 ? 0 : rawMid, SHARE_DECIMALS);
  return {
    pool_count,
    pool_cells,
    top1_share,
    bottom1_share,
    mid_mass_cells,
    mid_mass_share,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMidMassShareBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top1_share: partner.top1_share,
    partner_bottom1_share: partner.bottom1_share,
    partner_mid_mass_cells: partner.mid_mass_cells,
    partner_mid_mass_share: partner.mid_mass_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top1_share: metric.top1_share,
    metric_bottom1_share: metric.bottom1_share,
    metric_mid_mass_cells: metric.mid_mass_cells,
    metric_mid_mass_share: metric.mid_mass_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMidMassShareEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare {
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
    top_k: TOP_K,
    bottom_k: BOTTOM_K,
    thin_mid_max: THIN_MID_MAX,
    fat_mid_min: FAT_MID_MIN,
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

function labelForMidMass(
  pool_count: number,
  mid_mass_share: number | null,
  thin_mid_max: number,
  fat_mid_min: number,
): MidMassLabel {
  if (pool_count === 0 || mid_mass_share === null) return "empty";
  // pool_count <= 2 has no middle mass by definition (single or two
  // slots exhaust the pool between top-1 and bottom-1). Surface that
  // structurally as "solo" so downstream readers do not confuse the
  // structural 0 with a computed thin verdict.
  if (pool_count <= TOP_K + BOTTOM_K - 1 || pool_count === 2) return "solo";
  if (mid_mass_share >= fat_mid_min) return "fat";
  if (mid_mass_share < thin_mid_max) return "thin";
  return "moderate";
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

function renderMidMassCell(
  pool_count: number,
  pool_cells: number,
  top1_share: number | null,
  bottom1_share: number | null,
  mid_mass_cells: number,
  mid_mass_share: number | null,
  thin_mid_max: number,
  fat_mid_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForMidMass(
    pool_count,
    mid_mass_share,
    thin_mid_max,
    fat_mid_min,
  );
  const midText =
    mid_mass_share === null ? "-" : `${(mid_mass_share * 100).toFixed(1)}%`;
  const topText =
    top1_share === null ? "-" : `${(top1_share * 100).toFixed(1)}%`;
  const bottomText =
    bottom1_share === null ? "-" : `${(bottom1_share * 100).toFixed(1)}%`;
  return `mid ${midText} (pool ${pool_cells} &minus; top1 ${topText} &minus; bottom1 ${bottomText} = ${mid_mass_cells} cells) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { thin_mid_max, fat_mid_min } = snapshot;
  const thinPct = (thin_mid_max * 100).toFixed(0);
  const fatPct = (fat_mid_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMidMassCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top1_share, band.partner_bottom1_share, band.partner_mid_mass_cells, band.partner_mid_mass_share, thin_mid_max, fat_mid_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderMidMassCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top1_share, band.metric_bottom1_share, band.metric_mid_mass_cells, band.metric_mid_mass_share, thin_mid_max, fat_mid_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MID-MASS SHARE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Middle-mass EVENNESS scalar over the P11.161 pool &mdash; folds the mass the P11.165 TOP-1 SHARE and P11.179 BOTTOM-1 SHARE do NOT touch into ONE scalar: mid_mass_share = (pool_cells &minus; top1_cells &minus; bottom1_cells) / pool_cells. Companion to the P11.181 RANGE (which names the ADDITIVE spread across the same extremes) and to the P11.185 TOP-1/BOTTOM-1 RATIO (which names the MULTIPLICATIVE gap across the same extremes) &mdash; mid-mass names the mass those two surfaces DO NOT describe. Identity: top1_share + mid_mass_share + bottom1_share = 1 for pool_count &ge; 2. Labels: solo = pool_count &le; 2 (mid=0 by definition, no middle slot exists), thin = mid &lt; ${thinPct}% (extremes dominate; middle is a sliver), moderate = mid in [${thinPct}%, ${fatPct}%) (noticeable middle mass), fat = mid &ge; ${fatPct}% (middle dominates; extremes are just tips). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + mid_mass_share null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner mid-mass</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI mid-mass</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
