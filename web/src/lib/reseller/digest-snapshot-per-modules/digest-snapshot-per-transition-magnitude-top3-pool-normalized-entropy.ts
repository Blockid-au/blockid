// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL NORMALIZED ENTROPY
// pure-lib (P11.177).
//
// Sixth distribution-shape complement to the P11.161 POOL SIZE surface,
// extending the whole-pool inequality QUINTET (P11.163 HHI + P11.169
// Gini + P11.171 Theil + P11.173 Atkinson + P11.175 CV) to a SEXTET.
// Normalized entropy is the mathematical complement of Theil:
//
//   Shannon entropy   H       = -Σ s_i × ln(s_i)         (nats)
//   Maximum entropy   ln(n)   = uniform-distribution ceiling
//   Normalized       H_norm   = H / ln(n) ∈ [0, 1]
//   Theil            T       = ln(n) - H
//   Identity                  H_norm = 1 - T / ln(n)
//
// Where Theil answers "how far is the distribution from uniform?"
// (entropy divergence from a uniform reference), normalized entropy
// answers the mirror question "how close to uniform is the pool?"
// (Pielou's evenness, ecology / information-theory anchor). The two
// surfaces carry the SAME information under the closed-form identity
// above — but the human reading flips: high Theil = high inequality,
// high H_norm = high evenness. Reporting both lets the weekly digest
// email surface either lens to a reader who is comfortable with one
// scale but not the other. It also acts as a self-consistency check —
// if the two surfaces ever disagree (up to rounding + n-band edge
// cases) a downstream JSONL consumer knows one has drifted.
//
// Ops case for the complement lens:
//
//   • Cell A: pool_count 5, cells [8, 1, 1, 1, 1]. Theil ~ 0.51 (high
//     divergence from uniform) ↔ H_norm ~ 0.68 (unequal, well below
//     0.9 uniform threshold). Both surfaces agree the pool is
//     dominated by one leader.
//   • Cell B: pool_count 5, cells [4, 4, 1, 1, 1]. Theil ~ 0.22
//     (moderate divergence) ↔ H_norm ~ 0.86 (mixed, in the moderate
//     evenness band). Both surfaces agree the pool has two shoulders
//     with a light tail.
//   • Cell C: pool_count 5, cells [1, 1, 1, 1, 1] (perfect uniform).
//     Theil = 0 (zero divergence) ↔ H_norm = 1 (perfect uniform).
//     Both surfaces agree the pool is fully even.
//
// The identity holds cell-for-cell so the SEXTET's "same population,
// six lenses" contract is preserved: HHI = squared-share amplifier,
// Gini = pair-wise share gap integrator, Theil = share entropy
// divergence FROM uniform, Atkinson = welfare-loss equally-distributed
// -equivalent gap, CV = raw-count second-moment dispersion,
// H_norm = share entropy CLOSENESS TO uniform (Pielou evenness).
//
// Formula: H_norm = H / ln(n) where H = -Σ s_i × ln(s_i) is the
// Shannon entropy in nats over shares s_i = x_i / Σx. Well-defined for
// pool_count ≥ 1 AND pool_cells > 0:
//   pool 0        → normalized_entropy null
//   pool_cells 0  → normalized_entropy null
//   pool_count 1  → normalized_entropy 1 by convention (the single
//     partner IS the maximum-uniform distribution for its own n=1
//     support; ln(n=1) = 0 in the denominator so the raw ratio is
//     0/0 but the limit as n → 1 of the ratio for uniform inputs is
//     1 — matches Pielou-evenness convention and mirrors the CV
//     n=1 → 0 by-definition treatment)
//   pool ≥ 2      → H_norm in [0, 1] (0 = fully concentrated on one
//     participant; 1 = perfectly uniform across all n participants)
// Rounded to 4 decimals for weekly-digest stability. Tiny negative
// float-noise (from partial cancellations near the concentration
// boundary where a share ~ 1 gives s × ln(s) → 0 from below) clamped
// to 0; entropy is mathematically ≥ 0. Zero-count terms cannot appear
// because our pool maps only carry participants with ≥ 1 cell (the
// 0 × ln(0) = 0 convention is unused).
//
// Cutoffs anchor to Pielou-evenness ecology literature (HIGH_
// EVENNESS_MIN = 0.9 = "uniform"; MODERATE_EVENNESS_MIN = 0.7 =
// "mixed"; below moderate = "unequal") so ops readers familiar with
// biodiversity or Shannon-evenness reports read the labels the same
// way. Exposed on the envelope as high_evenness_min /
// moderate_evenness_min so JSONL consumers render the taxonomy
// without importing this module.
//
// NOTE ON LABEL ORIENTATION: unlike the P11.163 HHI + P11.169 Gini +
// P11.171 Theil + P11.173 Atkinson + P11.175 CV siblings (where the
// "high" band means high inequality / concentration), this surface
// uses "uniform" as the top-band label because a HIGH H_norm value
// means HIGH evenness = LOW inequality. Labels are: solo (n=1),
// uniform (H_norm ≥ high_evenness_min), mixed (H_norm ∈
// [moderate_evenness_min, high_evenness_min)), unequal (H_norm <
// moderate_evenness_min). The evenness / inequality orientation
// difference is the whole POINT of shipping the complement — a JSONL
// consumer that wants the "high = inequality" reading already has
// five sibling surfaces; a consumer that wants the "high = evenness"
// reading gets it here without having to invert the Theil scale
// against the n-dependent ln(n) denominator itself.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module's top-n scalar; band cutoffs
// re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolCvSection (P11.176) AND
// IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
// (P11.166) so the hierarchy descends per-transition MAGNITUDE TOP-3
// POOL SIZE (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL
// (P11.171) → ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY
// (this module) → TOP-1 SHARE (P11.165) → TOP-2 COMBINED SHARE
// (P11.167) → per-pair hot-cells GRANULAR (P11.139). HHI, Gini,
// Theil, Atkinson, CV, and H_norm all answer "how equal is the
// pool?" with different mathematical bases so they sit adjacent as a
// whole-pool SEXTET and IMMEDIATELY ABOVE the leader-slice pair.

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
type NormalizedEntropyLabel =
  | "empty"
  | "solo"
  | "unequal"
  | "mixed"
  | "uniform";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Pielou-evenness ecology literature commonly labels J' > 0.9 as
// uniform / high evenness, J' in [0.7, 0.9) as mixed / moderate, and
// J' < 0.7 as unequal / low. Anchoring here keeps the taxonomy
// familiar to any reader who has seen a biodiversity or Shannon-
// evenness report. Exposed on the envelope so downstream JSONL
// consumers do not need to import this module to render the labels.
const HIGH_EVENNESS_MIN = 0.9;
const MODERATE_EVENNESS_MIN = 0.7;

// H_norm rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.169
// Gini + P11.171 Theil + P11.173 Atkinson + P11.175 CV modules.
const NORMALIZED_ENTROPY_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolNormalizedEntropyBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_normalized_entropy: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_normalized_entropy: number | null;
}

export interface PerTransitionMagnitudeTop3PoolNormalizedEntropyBands {
  readonly small: PerTransitionMagnitudeTop3PoolNormalizedEntropyBand;
  readonly medium: PerTransitionMagnitudeTop3PoolNormalizedEntropyBand;
  readonly large: PerTransitionMagnitudeTop3PoolNormalizedEntropyBand;
}

export interface PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolNormalizedEntropyBands;
}

export interface PerTransitionMagnitudeTop3PoolNormalizedEntropyMap {
  readonly improved: PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly high_evenness_min: number;
  readonly moderate_evenness_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolNormalizedEntropyMap;
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

// Normalized Shannon entropy (Pielou evenness) of a discrete count
// distribution:
//   H_norm = H / ln(n) where H = -Σ s_i × ln(s_i) and s_i = x_i / Σx
// Well-defined for pool_count ≥ 1 AND pool_cells > 0. For pool_count 1
// the ln(n) denominator = 0 so the raw ratio is 0/0; by Pielou-
// evenness convention we return 1 (a single-category pool is
// trivially "as uniform as possible for its own support"). Zero-count
// participants cannot appear because our pool maps only carry
// participants with ≥ 1 cell (so the 0 × ln(0) = 0 convention is
// unused). Tiny negative float-noise from partial cancellations near
// the concentration boundary (share ~ 1 gives s × ln(s) → 0 from
// below) is clamped to 0; entropy is mathematically ≥ 0.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  normalized_entropy: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, normalized_entropy: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, normalized_entropy: 1 };
  }
  let sum = 0;
  for (const x of values) {
    const share = x / pool_cells;
    sum += share * Math.log(share);
  }
  const entropy = -sum;
  // Clamp tiny negative float-noise to 0; entropy is mathematically ≥ 0.
  const clampedEntropy = entropy < 0 ? 0 : entropy;
  const maxEntropy = Math.log(pool_count);
  const raw = clampedEntropy / maxEntropy;
  // Also clamp the ratio to [0, 1] against float drift near the
  // uniform ceiling (H can round up ~ 1e-15 past ln(n)).
  const clampedRatio = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return {
    pool_count,
    pool_cells,
    normalized_entropy: roundTo(clampedRatio, NORMALIZED_ENTROPY_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolNormalizedEntropyBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_normalized_entropy: partner.normalized_entropy,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_normalized_entropy: metric.normalized_entropy,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolNormalizedEntropyEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy {
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
    high_evenness_min: HIGH_EVENNESS_MIN,
    moderate_evenness_min: MODERATE_EVENNESS_MIN,
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

function labelForNormalizedEntropy(
  pool_count: number,
  normalized_entropy: number | null,
  high_evenness_min: number,
  moderate_evenness_min: number,
): NormalizedEntropyLabel {
  if (pool_count === 0 || normalized_entropy === null) return "empty";
  if (pool_count === 1) return "solo";
  if (normalized_entropy >= high_evenness_min) return "uniform";
  if (normalized_entropy >= moderate_evenness_min) return "mixed";
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

function renderNormalizedEntropyCell(
  pool_count: number,
  pool_cells: number,
  normalized_entropy: number | null,
  high_evenness_min: number,
  moderate_evenness_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForNormalizedEntropy(
    pool_count,
    normalized_entropy,
    high_evenness_min,
    moderate_evenness_min,
  );
  const heText = normalized_entropy === null ? "-" : normalized_entropy.toFixed(4);
  return `H_norm ${heText} / pool ${pool_count} / cells ${pool_cells} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { high_evenness_min, moderate_evenness_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderNormalizedEntropyCell(band.partner_pool_count, band.partner_pool_cells, band.partner_normalized_entropy, high_evenness_min, moderate_evenness_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderNormalizedEntropyCell(band.metric_pool_count, band.metric_pool_cells, band.metric_normalized_entropy, high_evenness_min, moderate_evenness_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool normalized entropy across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Normalized Shannon entropy H_norm = H / ln(n) where H = -&Sigma; s<sub>i</sub> &times; ln(s<sub>i</sub>) is the entropy in nats over shares s<sub>i</sub> = x<sub>i</sub> / &Sigma;x across the FULL pool of partners / KPIs per (transition, band) cell &mdash; sixth whole-pool inequality companion after the P11.163 HHI + P11.169 Gini + P11.171 Theil + P11.173 Atkinson + P11.175 CV QUINTET. This surface is the mathematical complement of Theil (identity: H_norm = 1 - T / ln(n)) so the two carry the SAME information under different framings. High Theil = high divergence from uniform; high H_norm = high closeness to uniform. Reporting both lets the digest surface either lens (evenness or inequality) to a reader comfortable with one scale but not the other, and acts as a self-consistency check if the two ever drift. Range 0..1 (0 = fully concentrated on one participant; 1 = perfectly uniform). Labels flip orientation from siblings: solo = pool_count 1 (H_norm=1 by convention), uniform = H_norm &ge; ${high_evenness_min} (Pielou-evenness high-evenness anchor), mixed = H_norm in [${moderate_evenness_min}, ${high_evenness_min}), unequal = H_norm &lt; ${moderate_evenness_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + normalized_entropy null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner H_norm</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI H_norm</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
