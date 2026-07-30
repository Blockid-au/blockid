// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL HHI pure-lib (P11.163).
//
// Distribution-shape complement to the P11.161 POOL SIZE surface. The
// P11.151 top-3 concentration index answers 'inside the top-3 ranked
// list, how dominant is the #1 pick?' — but it is normalised over the
// top-3 sum only and therefore blind to the tail. The P11.161 pool
// module answers 'how many partners/KPIs live OUTSIDE the top-3 and
// what share of cells do they carry?' as a pair of scalars but does
// NOT name the inequality shape of the FULL pool: two cells with an
// identical tail_share=0.50 read very differently if the pool follows
// a Pareto shape (one dominant partner + a broad long tail) vs a
// flat shape (many near-peer partners each with the same cells).
//
// The Herfindahl-Hirschman Index (HHI) is the standard economics
// measure of concentration over an ENTIRE population — sum of the
// squared shares (share_i = cells_i / pool_cells). It ranges from
// 1 / pool_count (perfectly equal distribution across the pool) to 1
// (a single participant owns everything). Applied to the reseller
// digest, HHI gives ops one scalar per (transition, band) cell that
// disambiguates:
//
//   • dominant (HHI >= 0.25)      — one partner/KPI owns a
//                                    disproportionate share of the
//                                    pool cells. Ops escalates to
//                                    that partner directly.
//   • moderate (0.15 <= HHI<0.25) — a couple of players own most of
//                                    the pool but the rest is not
//                                    negligible. Ops watches the
//                                    top 2-3 together.
//   • diffuse  (HHI < 0.15)       — cells are spread broadly. Ops
//                                    does not have a single lever to
//                                    pull; the transition is a
//                                    portfolio-wide phenomenon.
//
// Cutoffs mirror the DOJ/FTC merger-review HHI bands (0.15 / 0.25)
// which sit outside the reseller module and cannot drift under
// future refactors. Exposed on the envelope as
// concentrated_hhi_min / moderate_hhi_min so downstream JSONL
// consumers can render the label taxonomy without importing the TS
// module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module's top-n scalar; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolSection (P11.162) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 gap suite (runner-up / tail /
// middle) → per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) →
// per-transition MAGNITUDE TOP-3 POOL HHI (this module) → per-pair
// hot-cells GRANULAR. Size describes HOW MANY partners populate the
// pool; HHI describes HOW EQUALLY the cells are distributed across
// them.

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
type HhiLabel = "empty" | "solo" | "dominant" | "moderate" | "diffuse";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// DOJ/FTC merger-review HHI thresholds. 0.25 = highly concentrated,
// 0.15 = moderately concentrated. Applying the same cutoffs here so
// ops readers used to the anti-trust convention read the labels the
// same way. Exposed on the envelope so downstream JSONL consumers do
// not need to import the module to render the taxonomy.
const CONCENTRATED_HHI_MIN = 0.25;
const MODERATE_HHI_MIN = 0.15;

// HHI rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.151 concentration
// index.
const HHI_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolHhiBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_hhi: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_hhi: number | null;
}

export interface PerTransitionMagnitudeTop3PoolHhiBands {
  readonly small: PerTransitionMagnitudeTop3PoolHhiBand;
  readonly medium: PerTransitionMagnitudeTop3PoolHhiBand;
  readonly large: PerTransitionMagnitudeTop3PoolHhiBand;
}

export interface PerTransitionMagnitudeTop3PoolHhiEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolHhiBands;
}

export interface PerTransitionMagnitudeTop3PoolHhiMap {
  readonly improved: PerTransitionMagnitudeTop3PoolHhiEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolHhiEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolHhiEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolHhiEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolHhi {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly concentrated_hhi_min: number;
  readonly moderate_hhi_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolHhiMap;
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
  hhi: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, hhi: null };
  }
  let sumSq = 0;
  for (const v of values) {
    const share = v / pool_cells;
    sumSq += share * share;
  }
  return { pool_count, pool_cells, hhi: roundTo(sumSq, HHI_DECIMALS) };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolHhiBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_hhi: partner.hhi,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_hhi: metric.hhi,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolHhiEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolHhi(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolHhi {
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
    concentrated_hhi_min: CONCENTRATED_HHI_MIN,
    moderate_hhi_min: MODERATE_HHI_MIN,
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

function labelForHhi(
  pool_count: number,
  hhi: number | null,
  concentrated_hhi_min: number,
  moderate_hhi_min: number,
): HhiLabel {
  if (pool_count === 0 || hhi === null) return "empty";
  if (pool_count === 1) return "solo";
  if (hhi >= concentrated_hhi_min) return "dominant";
  if (hhi >= moderate_hhi_min) return "moderate";
  return "diffuse";
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

function renderHhiCell(
  pool_count: number,
  pool_cells: number,
  hhi: number | null,
  concentrated_hhi_min: number,
  moderate_hhi_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForHhi(
    pool_count,
    hhi,
    concentrated_hhi_min,
    moderate_hhi_min,
  );
  const hhiText = hhi === null ? "-" : hhi.toFixed(4);
  return `HHI ${hhiText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolHhiSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolHhi,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { concentrated_hhi_min, moderate_hhi_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderHhiCell(band.partner_pool_count, band.partner_pool_cells, band.partner_hhi, concentrated_hhi_min, moderate_hhi_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderHhiCell(band.metric_pool_count, band.metric_pool_cells, band.metric_hhi, concentrated_hhi_min, moderate_hhi_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool HHI across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Herfindahl-Hirschman Index (sum of squared cell-shares) across the FULL pool of partners / KPIs per (transition, band) cell — names inequality of the entire distribution, not just the top-3. Range 1/pool_count..1 (higher = more concentrated). Labels: solo = pool_count 1 (HHI=1 by definition), dominant = HHI &ge; ${concentrated_hhi_min} (DOJ highly-concentrated bar; one partner owns a disproportionate share), moderate = HHI in [${moderate_hhi_min}, ${concentrated_hhi_min}) (DOJ moderate-concentration bar), diffuse = HHI &lt; ${moderate_hhi_min} (spread broadly; no single lever). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + hhi null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner HHI</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI HHI</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
