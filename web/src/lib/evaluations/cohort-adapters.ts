// cohort-adapters — P2-C's read-only bridge to the tables the parallel P2
// lanes own (G21 P2-C, 2026-09-20). Every function tolerates a missing table
// / column / module and answers EMPTY data, so the program journey, the
// Cohort Report and the demo-day pack render before (and after) P2-A / P2-B
// land. The merge session swaps the body of each adapter for the lane's
// function (named in the comment) — the signatures here are the contract.
//
//   P2-A  cohort_snapshots (0422)      → listCohortSnapshotsForBatch  ← cohort-snapshots.ts `listCohortSnapshots(batchId)`
//   P2-B  assessment_overrides (0423)  → countOverridesForBatch       ← overrides.ts `countOverrides(batchId)`
//   P2-B  shortlist flag on items      → loadShortlistForBatch        ← cohort-rows.ts / assessments (shortlist decision)
//   P2-B  batch members (owner/reviewer/viewer) → resolveBatchAccess  ← batch-members.ts `assertBatchRole(userId, batchId, roles)`
//
// The rest reads tables that already exist (svi_snapshots.evidence_confidence
// 0419, projects.verification_level, svi_dimension_evidence, ic_reports,
// founder_feedback_letters) with the same never-throw contract.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { flattenDimensionScores, mapBatchRow, type DimensionKey, type EvaluationBatch } from "./batch-shared";
import { assertBatchRole } from "./batch-members";
import { getBatchForUser } from "./batch";
import type { CohortSnapshotLite, CohortSnapshotRowLite } from "./cohort-report";
import type { JourneyEvidenceRow } from "./program-journey";

type Row = Record<string, unknown>;

/** Minimal Supabase surface (tests pass a fake). */
export interface DbLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function db(explicit?: DbLike | null): DbLike | null {
  if (explicit !== undefined) return explicit;
  return getSupabaseAdmin();
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function chunk<T>(xs: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// P2-A — cohort snapshots
// ---------------------------------------------------------------------------

/**
 * `cohort_snapshots(batch_id, taken_at, rows jsonb)` — rows carry SVI /
 * confidence / verification per item (P2-A). Oldest first. Empty when the
 * table is not there yet.
 */
export async function listCohortSnapshotsForBatch(batchId: string, client?: DbLike | null): Promise<CohortSnapshotLite[]> {
  const sb = db(client);
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("cohort_snapshots").select("id, batch_id, taken_at, rows").eq("batch_id", batchId).order("taken_at", { ascending: true }).limit(50);
    if (error || !data) return [];
    return (data as Row[]).map((r) => ({
      id: String(r.id),
      takenAt: String(r.taken_at ?? ""),
      rows: parseSnapshotRows(r.rows),
    }));
  } catch {
    return [];
  }
}

/** Accepts P2-A's `rows` jsonb in either an array or a `{ items: [] }` envelope; unknown keys are ignored. */
export function parseSnapshotRows(raw: unknown): CohortSnapshotRowLite[] {
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as Row).items) ? ((raw as Row).items as unknown[]) : [];
  const out: CohortSnapshotRowLite[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const r = x as Row;
    const itemId = num(r.item_id ?? r.itemId);
    out.push({
      projectId: r.project_id != null ? String(r.project_id) : r.projectId != null ? String(r.projectId) : null,
      itemId: itemId == null ? null : Math.round(itemId),
      svi: num(r.svi ?? r.svi_total ?? r.sviTotal),
      confidence: num(r.confidence ?? r.evidence_confidence ?? r.evidenceConfidence),
      dimensionScores: flattenDimensionScores(r.dimension_scores ?? r.dimensionScores ?? r.dimensions),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// P2-B — overrides, shortlist, members
// ---------------------------------------------------------------------------

/** `assessment_overrides(item_id, …)` rows for the batch's items; 0 when absent. */
export async function countOverridesForBatch(itemIds: number[], client?: DbLike | null): Promise<number> {
  const sb = db(client);
  if (!sb || itemIds.length === 0) return 0;
  try {
    let total = 0;
    for (const ids of chunk(itemIds)) {
      const { count, error } = await sb.from("assessment_overrides").select("id", { count: "exact", head: true }).in("item_id", ids);
      if (error) return 0;
      total += typeof count === "number" ? count : 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Item ids flagged `shortlisted` on `evaluation_batch_items` (P2-B column); empty when the column is absent. */
export async function loadShortlistForBatch(batchId: string, client?: DbLike | null): Promise<Set<number>> {
  const sb = db(client);
  const out = new Set<number>();
  if (!sb) return out;
  try {
    const { data, error } = await sb.from("evaluation_batch_items").select("id, shortlisted").eq("batch_id", batchId).eq("shortlisted", true);
    if (error || !data) return out;
    for (const r of data as Row[]) {
      const id = num(r.id);
      if (id != null) out.add(Math.round(id));
    }
    return out;
  } catch {
    return out;
  }
}

export type BatchRole = "owner" | "reviewer" | "viewer";

/**
 * Owner via `evaluation_batches.user_id`; reviewer / viewer via P2-B's
 * `evaluation_batch_members(batch_id, user_id, role)` when that table exists.
 * Null when the caller has no role on the batch (→ 404, never 403 — the id
 * is not confirmed to exist).
 */
export async function resolveBatchAccess(userId: string, batchId: string, _client?: DbLike | null): Promise<{ batch: EvaluationBatch; role: BatchRole } | null> {
  // Merge session: one membership rule — P2-B's `assertBatchRole`
  // (owner = batch creator or an `owner` member row; reviewer / viewer via
  // evaluation_batch_members; `not_found` for non-members so the id space
  // stays non-enumerable).
  const access = await assertBatchRole(batchId, userId, "viewer");
  if (!access.ok) return null;
  return { batch: access.batch, role: access.role };
}

// ---------------------------------------------------------------------------
// Existing tables
// ---------------------------------------------------------------------------

/** svi_snapshots.evidence_confidence (0419) by snapshot id; empty before the column exists. */
export async function loadEvidenceConfidenceBySnapshot(snapshotIds: string[], client?: DbLike | null): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sb = db(client);
  const ids = snapshotIds.filter(Boolean);
  if (!sb || ids.length === 0) return out;
  try {
    for (const part of chunk(ids)) {
      const { data, error } = await sb.from("svi_snapshots").select("id, evidence_confidence").in("id", part);
      if (error || !data) return out;
      for (const r of data as Row[]) {
        const v = num(r.evidence_confidence);
        if (v != null) out.set(String(r.id), Math.round(v));
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** projects.verification_level (0–5) by project id; missing → 0. */
export async function loadVerificationByProject(projectIds: string[], client?: DbLike | null): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sb = db(client);
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (!sb || ids.length === 0) return out;
  try {
    for (const part of chunk(ids)) {
      const { data, error } = await sb.from("projects").select("id, verification_level").in("id", part);
      if (error || !data) return out;
      for (const r of data as Row[]) {
        const v = num(r.verification_level);
        out.set(String(r.id), v == null ? 0 : Math.max(0, Math.min(5, Math.round(v))));
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** svi_dimension_evidence rows grouped by project (dimension, evidence_type, confidence_level). */
export async function loadEvidenceRowsByProject(projectIds: string[], client?: DbLike | null): Promise<Map<string, JourneyEvidenceRow[]>> {
  const out = new Map<string, JourneyEvidenceRow[]>();
  const sb = db(client);
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (!sb || ids.length === 0) return out;
  try {
    for (const part of chunk(ids, 50)) {
      const { data, error } = await sb.from("svi_dimension_evidence").select("project_id, dimension, evidence_type, confidence_level").in("project_id", part).limit(5000);
      if (error || !data) return out;
      for (const r of data as Row[]) {
        const pid = String(r.project_id ?? "");
        if (!pid) continue;
        const list = out.get(pid) ?? [];
        list.push({ dimension: r.dimension == null ? null : String(r.dimension), evidence_type: r.evidence_type == null ? null : String(r.evidence_type), confidence_level: r.confidence_level == null ? null : String(r.confidence_level) });
        out.set(pid, list);
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** Last `len` svi_snapshots totals per project, oldest first (sparkline). */
export async function loadScoreHistoryByProject(projectIds: string[], len = 8, client?: DbLike | null): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const sb = db(client);
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (!sb || ids.length === 0) return out;
  try {
    const { data, error } = await sb.from("svi_snapshots").select("project_id, svi_total, created_at").in("project_id", ids).order("created_at", { ascending: false }).limit(ids.length * len);
    if (error || !data) return out;
    for (const r of data as Row[]) {
      const pid = String(r.project_id ?? "");
      const v = num(r.svi_total);
      if (!pid || v == null) continue;
      const list = out.get(pid) ?? [];
      if (list.length >= len) continue;
      list.push(Math.round(v * 10) / 10);
      out.set(pid, list);
    }
    for (const [k, v] of out) out.set(k, v.reverse());
    return out;
  } catch {
    return out;
  }
}

/** Evaluations with at least one ic_reports export (a BlockID Dossier / IC memo was produced). */
export async function loadDossierProducedByEvaluation(evaluationIds: string[], client?: DbLike | null): Promise<Set<string>> {
  const out = new Set<string>();
  const sb = db(client);
  const ids = Array.from(new Set(evaluationIds.filter(Boolean)));
  if (!sb || ids.length === 0) return out;
  try {
    for (const part of chunk(ids)) {
      const { data, error } = await sb.from("ic_reports").select("evaluation_id").in("evaluation_id", part).limit(5000);
      if (error || !data) return out;
      for (const r of data as Row[]) if (r.evaluation_id) out.add(String(r.evaluation_id));
    }
    return out;
  } catch {
    return out;
  }
}

/** Projects with a founder_feedback_letters row in status sent / opened. */
export async function loadFeedbackLetterSentByProject(projectIds: string[], client?: DbLike | null): Promise<Set<string>> {
  const out = new Set<string>();
  const sb = db(client);
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (!sb || ids.length === 0) return out;
  try {
    for (const part of chunk(ids)) {
      const { data, error } = await sb.from("founder_feedback_letters").select("project_id, status").in("project_id", part).in("status", ["sent", "opened"]).limit(5000);
      if (error || !data) return out;
      for (const r of data as Row[]) if (r.project_id) out.add(String(r.project_id));
    }
    return out;
  } catch {
    return out;
  }
}

export type { DimensionKey };
