// cohort-delta — pure "Δ since last snapshot" for the BlockID Cohort table
// (G21 P2-A; P2-B's CohortTable consumes `deltaByProject`).
//
// A cohort snapshot (cohort_snapshots, migration 0422) is one take of every
// item's SVI / evidence confidence / verification level / dimension scores /
// evidence-gap count. The delta for a project is the LATEST snapshot's row
// minus the PREVIOUS snapshot's row for the same project — never an
// interpolation, never a cross-cohort number. A project present in only one
// of the two snapshots has no delta (null). Numbers are rounded to one
// decimal; verification level and gaps to whole numbers.
//
// No `server-only`, no Supabase: the table component may import this.

import { DIMENSION_KEYS, type DimensionKey } from "./batch-shared";

export interface SnapshotRowLite {
  project_id: string;
  evaluation_id?: string | null;
  svi: number | null;
  evidence_confidence: number | null;
  verification_level: number | null;
  dims: Partial<Record<DimensionKey, number>> | null;
  gaps_count: number | null;
}

export interface SnapshotLite {
  id?: string;
  taken_at: string;
  weights_version?: number;
  rows: SnapshotRowLite[];
}

export interface ProjectDelta {
  projectId: string;
  /** SVI(latest) − SVI(previous); null when either side is unscored. */
  svi: number | null;
  /** Evidence confidence delta (null until P1-B's evidence-confidence lands in the rows). */
  evidenceConfidence: number | null;
  verificationLevel: number | null;
  /** Negative = fewer gaps = better. */
  gapsCount: number | null;
  dims: Partial<Record<DimensionKey, number>>;
  /** The dimension that moved the most (by absolute delta), null when nothing moved. */
  biggestMove: { dimension: DimensionKey; delta: number } | null;
  /** ISO of the two snapshots compared. */
  from: string;
  to: string;
  /** True when the two snapshots were ranked with different weight sets (P2-B custom weights). */
  weightsChanged: boolean;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function diff(a: number | null, b: number | null, decimals = 1): number | null {
  if (a == null || b == null) return null;
  const f = 10 ** decimals;
  return Math.round((a - b) * f) / f;
}

/** Delta of one project's latest row against its previous row. */
export function deltaForRows(latest: SnapshotRowLite, previous: SnapshotRowLite, meta: { from: string; to: string; weightsChanged?: boolean }): ProjectDelta {
  const dims: Partial<Record<DimensionKey, number>> = {};
  let biggest: ProjectDelta["biggestMove"] = null;
  for (const k of DIMENSION_KEYS) {
    const d = diff(num(latest.dims?.[k]), num(previous.dims?.[k]));
    if (d == null) continue;
    dims[k] = d;
    if (d !== 0 && (biggest == null || Math.abs(d) > Math.abs(biggest.delta))) biggest = { dimension: k, delta: d };
  }
  return {
    projectId: latest.project_id,
    svi: diff(num(latest.svi), num(previous.svi)),
    evidenceConfidence: diff(num(latest.evidence_confidence), num(previous.evidence_confidence)),
    verificationLevel: diff(num(latest.verification_level), num(previous.verification_level), 0),
    gapsCount: diff(num(latest.gaps_count), num(previous.gaps_count), 0),
    dims,
    biggestMove: biggest,
    from: meta.from,
    to: meta.to,
    weightsChanged: meta.weightsChanged === true,
  };
}

/**
 * `latest` vs `previous` → one delta per project present in BOTH. Either
 * snapshot null (a cohort with < 2 snapshots) → empty map. When several rows
 * share a project id (a project queued twice) the first row wins.
 */
export function deltaByProject(latest: SnapshotLite | null | undefined, previous: SnapshotLite | null | undefined): Map<string, ProjectDelta> {
  const out = new Map<string, ProjectDelta>();
  if (!latest || !previous) return out;
  const prev = new Map<string, SnapshotRowLite>();
  for (const r of previous.rows ?? []) if (r?.project_id && !prev.has(r.project_id)) prev.set(r.project_id, r);
  const weightsChanged = latest.weights_version != null && previous.weights_version != null && latest.weights_version !== previous.weights_version;
  for (const r of latest.rows ?? []) {
    if (!r?.project_id || out.has(r.project_id)) continue;
    const p = prev.get(r.project_id);
    if (!p) continue;
    out.set(r.project_id, deltaForRows(r, p, { from: previous.taken_at, to: latest.taken_at, weightsChanged }));
  }
  return out;
}

/** Cohort-level movement: median of the per-project SVI deltas + how many moved up / down / flat. */
export function summariseDeltas(deltas: Iterable<ProjectDelta>): { n: number; up: number; down: number; flat: number; medianSvi: number | null } {
  const xs: number[] = [];
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const d of deltas) {
    if (d.svi == null) continue;
    xs.push(d.svi);
    if (d.svi > 0) up += 1;
    else if (d.svi < 0) down += 1;
    else flat += 1;
  }
  xs.sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  const medianSvi = xs.length === 0 ? null : xs.length % 2 ? xs[mid]! : Math.round(((xs[mid - 1]! + xs[mid]!) / 2) * 10) / 10;
  return { n: xs.length, up, down, flat, medianSvi };
}

/** "+3.5" / "−1.0" / "0.0" / "—" for a table cell. */
export function formatDelta(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toFixed(decimals);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
