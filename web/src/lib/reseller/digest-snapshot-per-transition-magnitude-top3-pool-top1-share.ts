// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-1 SHARE
// pure-lib (P11.165).
//
// Alternative pool-shape complement to the P11.163 HHI surface. Where
// HHI folds the inequality of the WHOLE distribution into one scalar
// (sum of squared shares, sensitive to shape across the entire pool),
// the top-1 share names ONE THING: what fraction of the (transition,
// band) cell count does the SINGLE LARGEST partner / KPI own?
//
// Two cells with an identical HHI can read very differently once you
// name the top-1 share alone:
//
//   • HHI 0.30 with top-1 share 0.5 — clear dominant leader; ops
//                                     escalates to that single partner.
//   • HHI 0.30 with top-1 share 0.25 — no single dominant player; the
//                                     concentration comes from a pair
//                                     of similar-sized shoulders; ops
//                                     watches the top 2-3 together.
//
// The two scalars therefore triangulate the pool-shape read:
//   P11.161 pool count       — how MANY partners populate the pool?
//   P11.161 tail_share       — what share sits OUTSIDE top-3?
//   P11.163 HHI              — how EQUALLY is the pool distributed?
//   P11.165 top-1 share      — HOW MUCH does the single leader own?
//
// Top-1 share is well-defined for every non-empty pool (unlike the
// gap suite which requires the full TOP_N entries and unlike HHI
// which needs at least 1 cell to name a share). Empty cells emit
// null top-1 share.
//
// Cutoffs use plain-language fraction bands rather than an
// external-anchor taxonomy like DOJ HHI:
//   • runaway  (share >= 0.60) — leader owns >= 60% of the pool
//   • leading  (share >= 0.40) — leader owns >= 40% of the pool
//   • contested (share <  0.40) — no single leader; pool is contested
// Both cutoffs are exposed on the envelope as runaway_share_min /
// leading_share_min so downstream JSONL consumers can render the
// label vocabulary without importing the TS module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module + P11.163 HHI module; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolHhiSection (P11.164) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI (P11.163)
// → TOP-1 SHARE (this module) → per-pair hot-cells GRANULAR. HHI
// describes the whole-pool inequality; TOP-1 SHARE names the single
// leader's slice.

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
type Top1ShareLabel = "empty" | "runaway" | "leading" | "contested";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language fraction bands (no external-anchor taxonomy — HHI
// borrowed DOJ; this scalar owns its own vocabulary since a single
// share crossing 40 or 60 percent is a directly readable ops signal).
const RUNAWAY_SHARE_MIN = 0.6;
const LEADING_SHARE_MIN = 0.4;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI surface.
const SHARE_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolTop1ShareBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top1_cells: number;
  readonly partner_top1_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top1_cells: number;
  readonly metric_top1_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop1ShareBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop1ShareBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop1ShareBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop1ShareBand;
}

export interface PerTransitionMagnitudeTop3PoolTop1ShareEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop1ShareBands;
}

export interface PerTransitionMagnitudeTop3PoolTop1ShareMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop1ShareEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop1ShareEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop1ShareEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop1ShareEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly runaway_share_min: number;
  readonly leading_share_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTop1ShareMap;
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
  top1_cells: number;
  top1_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, top1_cells: 0, top1_share: null };
  }
  const top1_cells = Math.max(...values);
  const top1_share = roundTo(top1_cells / pool_cells, SHARE_DECIMALS);
  return { pool_count, pool_cells, top1_cells, top1_share };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop1ShareBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top1_cells: partner.top1_cells,
    partner_top1_share: partner.top1_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top1_cells: metric.top1_cells,
    metric_top1_share: metric.top1_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop1ShareEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share {
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
    runaway_share_min: RUNAWAY_SHARE_MIN,
    leading_share_min: LEADING_SHARE_MIN,
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

function labelForShare(
  pool_count: number,
  share: number | null,
  runaway_share_min: number,
  leading_share_min: number,
): Top1ShareLabel {
  if (pool_count === 0 || share === null) return "empty";
  if (share >= runaway_share_min) return "runaway";
  if (share >= leading_share_min) return "leading";
  return "contested";
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

function renderShareCell(
  pool_count: number,
  pool_cells: number,
  top1_cells: number,
  share: number | null,
  runaway_share_min: number,
  leading_share_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForShare(
    pool_count,
    share,
    runaway_share_min,
    leading_share_min,
  );
  const shareText = share === null ? "-" : `${(share * 100).toFixed(1)}%`;
  return `top1 ${shareText} (${top1_cells}/${pool_cells}) / pool ${pool_count} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1ShareSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { runaway_share_min, leading_share_min } = snapshot;
  const runawayPct = (runaway_share_min * 100).toFixed(0);
  const leadingPct = (leading_share_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top1_cells, band.partner_top1_share, runaway_share_min, leading_share_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top1_cells, band.metric_top1_share, runaway_share_min, leading_share_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-1 share across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Single-leader complement to the P11.163 HHI surface — names the fraction of the full pool the SINGLE LARGEST partner / KPI owns per (transition, band) cell. Two cells with identical HHI can carry very different top-1 shares (dominant single leader vs pair-of-shoulders). Labels: runaway = share &ge; ${runawayPct}% (single partner owns majority), leading = share &ge; ${leadingPct}% (clear plurality leader), contested = share &lt; ${leadingPct}% (no single leader; pool is broadly split). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + top1_share null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner top-1</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI top-1</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
