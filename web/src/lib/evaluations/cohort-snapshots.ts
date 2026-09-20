// cohort-snapshots — one "take" of a BlockID Cohort (G21 P2-A, migration
// 0422 `cohort_snapshots`).
//
//   takeCohortSnapshot(batchId, { reason })  — reads the batch items' latest
//     scores (svi_total + dimension_scores copied from the run's svi_snapshots
//     row), each project's verification level (projects.verification_level,
//     lib/verification/level-engine.ts ladder) and evidence-gap count (the
//     EVIDENCE_CATALOG items missing across the 8 dimensions — the same
//     arithmetic as lib/svi/evidence-checklist.ts), and writes a row whose
//     `rows` jsonb carries one entry per item and `summary` the medians.
//     `evidence_confidence` is NULL for now — P1-B's
//     lib/svi/evidence-confidence.ts lands in parallel; see the TODO below.
//   listCohortSnapshots / latestSnapshots — what the cohort header and P2-B's
//     "Δ since last snapshot" column (lib/evaluations/cohort-delta.ts) read.
//   requeueStaleItems — "Re-score cohort": items whose last score is older
//     than N days go back to `queued` (the off-peak runner scores them, quota
//     re-checked per item, review #8) and the batch reopens; fail-soft — a
//     write failure leaves the item as it was.
//
// Callers: the batch runner on completion (reason batch_complete), POST
// /api/evaluations/batch/[id]/snapshot (manual | rescore). Every reader
// tolerates a missing table (42P01 → []).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import { DIMENSION_KEYS, median, type BatchStatus, type DimensionKey, type EvaluationBatch, type EvaluationBatchItem } from "./batch-shared";
import { getBatchById, listBatchItems, loadEvaluationJoins, markItem } from "./batch";
import type { SnapshotLite, SnapshotRowLite } from "./cohort-delta";

export type SnapshotReason = "batch_complete" | "manual" | "rescore";
export const SNAPSHOT_REASONS: readonly SnapshotReason[] = ["batch_complete", "manual", "rescore"];

/** Items whose last score is older than this are re-queued by "Re-score cohort". */
export const RESCORE_STALE_DAYS = 30;

export interface SnapshotRow extends SnapshotRowLite {
  project_id: string;
  evaluation_id: string;
  item_id: number;
  svi: number | null;
  /** The stored `svi_snapshots.evidence_confidence` (0419) at snapshot time; null before the project's first post-P1 snapshot. */
  evidence_confidence: number | null;
  verification_level: number;
  dims: Partial<Record<DimensionKey, number>>;
  /** EVIDENCE_CATALOG items still missing across the 8 dimensions; null when the evidence table could not be read. */
  gaps_count: number | null;
  status: BatchStatus;
  scored_at: string | null;
}

export interface SnapshotSummary {
  n: number;
  scored: number;
  median_svi: number | null;
  median_confidence: number | null;
  median_verification: number | null;
  median_gaps: number | null;
  dims: Record<DimensionKey, number | null>;
}

export interface CohortSnapshot extends SnapshotLite {
  id: string;
  batchId: string;
  takenAt: string;
  taken_at: string;
  reason: SnapshotReason;
  weightsVersion: number;
  weights_version: number;
  rows: SnapshotRow[];
  summary: SnapshotSummary;
  createdBy: string | null;
}

type Row = Record<string, unknown>;

export const SNAPSHOT_COLUMNS = "id, batch_id, taken_at, reason, weights_version, rows, summary, created_by";

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

// ── Pure (exported for the test) ────────────────────────────────────────────

export interface SnapshotExtras {
  /** projects.verification_level per project id (missing → 0). */
  verification: ReadonlyMap<string, number>;
  /** Evidence-gap count per project id; a project absent from the map → null when `gapsAvailable` is false, else the full catalogue size. */
  gaps: ReadonlyMap<string, number>;
  gapsAvailable: boolean;
  /** Evidence confidence per project id — empty until P1-B. */
  confidence: ReadonlyMap<string, number>;
}

/** Total EVIDENCE_CATALOG items across the 8 dimensions (a project with nothing on file is missing all of them). */
export const EVIDENCE_CATALOG_SIZE = DIMENSION_KEYS.reduce((n, k) => n + (EVIDENCE_CATALOG[k]?.length ?? 0), 0);

/**
 * Evidence gaps for one project from its `svi_dimension_evidence` rows —
 * catalogue items with no row of that evidence_type, summed over the 8
 * dimensions (the same count lib/svi/evidence-checklist.ts renders per
 * dimension).
 */
export function gapsCountFromEvidenceRows(rows: ReadonlyArray<{ dimension: string | null; evidence_type: string | null }>): number {
  const present = new Map<string, Set<string>>();
  for (const r of rows) {
    const d = (r.dimension ?? "").toLowerCase();
    const t = r.evidence_type ?? "";
    if (!d || !t) continue;
    (present.get(d) ?? present.set(d, new Set()).get(d)!).add(t);
  }
  let gaps = 0;
  for (const k of DIMENSION_KEYS) {
    const have = present.get(k) ?? new Set<string>();
    for (const item of EVIDENCE_CATALOG[k] ?? []) if (!have.has(item.code)) gaps += 1;
  }
  return gaps;
}

export function buildSnapshotRows(
  items: ReadonlyArray<EvaluationBatchItem>,
  joins: ReadonlyMap<string, { projectId: string }>,
  extras: SnapshotExtras,
): SnapshotRow[] {
  const out: SnapshotRow[] = [];
  for (const it of items) {
    const projectId = joins.get(it.evaluationId)?.projectId ?? "";
    if (!projectId) continue;
    const dims: Partial<Record<DimensionKey, number>> = {};
    for (const k of DIMENSION_KEYS) {
      const v = it.dimensionScores?.[k];
      if (typeof v === "number" && Number.isFinite(v)) dims[k] = v;
    }
    out.push({
      project_id: projectId,
      evaluation_id: it.evaluationId,
      item_id: it.id,
      svi: it.sviTotal,
      evidence_confidence: extras.confidence.get(projectId) ?? null,
      verification_level: extras.verification.get(projectId) ?? 0,
      dims,
      gaps_count: extras.gapsAvailable ? (extras.gaps.get(projectId) ?? EVIDENCE_CATALOG_SIZE) : null,
      status: it.status,
      scored_at: it.scoredAt,
    });
  }
  return out;
}

export function summariseSnapshotRows(rows: ReadonlyArray<SnapshotRowLite>): SnapshotSummary {
  const svis = rows.map((r) => r.svi).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const conf = rows.map((r) => r.evidence_confidence).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const ver = rows.map((r) => r.verification_level).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const gaps = rows.map((r) => r.gaps_count).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const dims = {} as Record<DimensionKey, number | null>;
  for (const k of DIMENSION_KEYS) {
    dims[k] = median(rows.map((r) => r.dims?.[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
  }
  return {
    n: rows.length,
    scored: svis.length,
    median_svi: median(svis),
    median_confidence: median(conf),
    median_verification: median(ver),
    median_gaps: median(gaps),
    dims,
  };
}

function reasonOf(v: unknown): SnapshotReason {
  return (SNAPSHOT_REASONS as readonly string[]).includes(String(v)) ? (v as SnapshotReason) : "manual";
}

export function mapSnapshotRow(row: Row): CohortSnapshot {
  const rows = Array.isArray(row.rows) ? (row.rows as SnapshotRow[]).filter((r) => r && typeof r === "object" && typeof r.project_id === "string") : [];
  const summary = row.summary && typeof row.summary === "object" && !Array.isArray(row.summary) ? (row.summary as SnapshotSummary) : summariseSnapshotRows(rows);
  const takenAt = String(row.taken_at ?? "");
  const wv = Math.max(1, Math.round(Number(row.weights_version ?? 1) || 1));
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    takenAt,
    taken_at: takenAt,
    reason: reasonOf(row.reason),
    weightsVersion: wv,
    weights_version: wv,
    rows,
    summary,
    createdBy: row.created_by == null ? null : String(row.created_by),
  };
}

// ── Loaders (decorative on failure) ─────────────────────────────────────────

/** Latest stored evidence confidence per project (0419); projects without one are simply absent. */
async function loadStoredEvidenceConfidences(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const supabase = getSupabaseAdmin();
  if (!supabase || projectIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("project_id, evidence_confidence, created_at")
      .in("project_id", projectIds)
      .not("evidence_confidence", "is", null)
      .order("created_at", { ascending: false })
      .limit(projectIds.length * 5);
    if (error || !data) return out;
    for (const row of data as Array<{ project_id: string; evidence_confidence: number | string | null }>) {
      if (out.has(row.project_id)) continue;
      const v = Number(row.evidence_confidence);
      if (Number.isFinite(v)) out.set(row.project_id, Math.max(0, Math.min(100, v)));
    }
  } catch {
    /* fail-soft: the column is absent or the read failed → null confidence */
  }
  return out;
}

async function loadVerificationLevels(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const supabase = getSupabaseAdmin();
  if (!supabase || projectIds.length === 0) return out;
  try {
    const { data } = await supabase.from("projects").select("id, verification_level").in("id", projectIds);
    for (const r of (data ?? []) as Row[]) {
      const n = Number(r.verification_level);
      out.set(String(r.id), Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0);
    }
  } catch {
    /* decorative */
  }
  return out;
}

async function loadGapCounts(projectIds: string[]): Promise<{ gaps: Map<string, number>; available: boolean }> {
  const gaps = new Map<string, number>();
  const supabase = getSupabaseAdmin();
  if (!supabase || projectIds.length === 0) return { gaps, available: false };
  try {
    const { data, error } = await supabase.from("svi_dimension_evidence").select("project_id, dimension, evidence_type").in("project_id", projectIds).limit(5000);
    if (error) return { gaps, available: false };
    const byProject = new Map<string, Array<{ dimension: string | null; evidence_type: string | null }>>();
    for (const r of (data ?? []) as Row[]) {
      const pid = String(r.project_id ?? "");
      if (!pid) continue;
      (byProject.get(pid) ?? byProject.set(pid, []).get(pid)!).push({ dimension: r.dimension == null ? null : String(r.dimension), evidence_type: r.evidence_type == null ? null : String(r.evidence_type) });
    }
    for (const pid of projectIds) gaps.set(pid, gapsCountFromEvidenceRows(byProject.get(pid) ?? []));
    return { gaps, available: true };
  } catch {
    return { gaps, available: false };
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type TakeSnapshotResult =
  | { ok: true; snapshot: CohortSnapshot }
  | { ok: false; error: "not_found" | "not_migrated" | "service_unavailable" | "write_failed"; message: string };

export async function takeCohortSnapshot(
  batchId: string,
  opts: { reason: SnapshotReason; createdBy?: string | null; batch?: EvaluationBatch | null },
): Promise<TakeSnapshotResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Database unavailable" };
  const batch = opts.batch ?? (await getBatchById(batchId));
  if (!batch) return { ok: false, error: "not_found", message: "Cohort not found" };
  const items = await listBatchItems(batch.id);
  const joins = await loadEvaluationJoins(items.map((i) => i.evaluationId));
  const projectIds = Array.from(new Set(Array.from(joins.values()).map((j) => j.projectId).filter(Boolean)));
  const [verification, gapRes] = await Promise.all([loadVerificationLevels(projectIds), loadGapCounts(projectIds)]);
  // P1 merge: the stored evidence confidence (svi_snapshots.evidence_confidence, 0419) — the same number the Assessment Card shows.
  const confidence = await loadStoredEvidenceConfidences(projectIds);
  const rows = buildSnapshotRows(items, joins, { verification, gaps: gapRes.gaps, gapsAvailable: gapRes.available, confidence });
  const summary = summariseSnapshotRows(rows);
  const { data, error } = await supabase
    .from("cohort_snapshots")
    .insert({ batch_id: batch.id, reason: opts.reason, weights_version: batch.weightsVersion, rows, summary, created_by: opts.createdBy ?? null })
    .select(SNAPSHOT_COLUMNS)
    .single();
  if (error || !data) {
    if (isMissingTable(error)) return { ok: false, error: "not_migrated", message: "Cohort snapshots are not enabled on this server yet (migration 0422)." };
    console.error("[blockid:evaluations:cohort-snapshots] insert failed", error);
    return { ok: false, error: "write_failed", message: "Could not save the snapshot" };
  }
  return { ok: true, snapshot: mapSnapshotRow(data as Row) };
}

/** Snapshots of a batch, newest first. `[]` when 0422 is not applied. */
export async function listCohortSnapshots(batchId: string, limit = 20): Promise<CohortSnapshot[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase.from("cohort_snapshots").select(SNAPSHOT_COLUMNS).eq("batch_id", batchId).order("taken_at", { ascending: false }).limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:evaluations:cohort-snapshots] list failed", error);
    return [];
  }
  return ((data ?? []) as Row[]).map(mapSnapshotRow);
}

/** The two newest snapshots — what deltaByProject() compares. */
export async function latestSnapshots(batchId: string): Promise<{ latest: CohortSnapshot | null; previous: CohortSnapshot | null; count: number }> {
  const list = await listCohortSnapshots(batchId, 2);
  return { latest: list[0] ?? null, previous: list[1] ?? null, count: list.length };
}

/**
 * "Re-score cohort": every done | failed item whose last score is older than
 * `olderThanDays` goes back to `queued`, and the batch reopens so the
 * off-peak runner picks it up. Fail-soft per item.
 */
export async function requeueStaleItems(
  batch: EvaluationBatch,
  opts: { olderThanDays?: number; now?: Date } = {},
): Promise<{ requeued: number[]; fresh: number; batchStatus: BatchStatus }> {
  const supabase = getSupabaseAdmin();
  const out = { requeued: [] as number[], fresh: 0, requeuedFailed: 0, batchStatus: batch.status };
  if (!supabase) return out;
  const days = opts.olderThanDays ?? RESCORE_STALE_DAYS;
  const cutoff = (opts.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000;
  const items = await listBatchItems(batch.id);
  for (const it of items) {
    if (it.status !== "done" && it.status !== "failed") continue;
    const scored = it.scoredAt ? Date.parse(it.scoredAt) : NaN;
    if (Number.isFinite(scored) && scored >= cutoff) {
      out.fresh += 1;
      continue;
    }
    try {
      await markItem(it.id, { status: "queued", error: null });
      out.requeued.push(it.id);
    } catch {
      /* fail-soft: the item keeps its last score */
    }
  }
  if (out.requeued.length > 0 && (batch.status === "done" || batch.status === "failed")) {
    const { error } = await supabase.from("evaluation_batches").update({ status: "queued", finished_at: null }).eq("id", batch.id);
    if (!error) out.batchStatus = "queued";
  }
  return out;
}
