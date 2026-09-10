// batch — DB layer for Program batch scoring (T0272, G12 sprint S5).
//
// Tables: evaluation_batches + evaluation_batch_items (migration 0322).
// Writers: POST /api/evaluations/batch (queue) and
// /api/cron/evaluation-batch-runner (score). Readers: /workspace/evaluations
// (Cohorts list), /workspace/evaluations/cohort/[batchId], the CSV export and
// /api/reports/quarterly?batch=. Pure helpers (weights, CSV, mapping) live in
// ./batch-shared.ts so the client bundle never imports this file.
//
// Gate (docs/plans/evaluator-traction-2026-09-10.md §2): batch scoring is a
// Program feature. Program = plans.csv row `investor_vc_small`, whose flags
// carry `lp_export` + `lp_report` (tier-ladder VC_SM_FEATURES) but NOT
// `accelerator.cohort` — that flag belongs to the accelerator_* Contact-Sales
// rows. So the gate is "lp_export OR accelerator.cohort": Scout (investor_angel)
// and Firm (investor_advisor) have neither and get the 403 upgrade hint.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { pdfUrlForToken, reportUrlForToken } from "@/lib/evaluations/report-quota";
import {
  mapBatchItemRow,
  mapBatchRow,
  normaliseWeights,
  strengthAndGap,
  weightedScore,
  type BatchStatus,
  type CohortRow,
  type EvaluationBatch,
  type EvaluationBatchItem,
  type RubricWeights,
} from "./batch-shared";

export { BATCH_FEATURES, LP_REPORT_FEATURES, canBatchScore, canExportLpReport } from "./batch-shared";

type Row = Record<string, unknown>;

const BATCH_COLUMNS =
  "id, user_id, name, rubric_weights, status, total, done_count, failed_count, created_at, started_at, finished_at";
const ITEM_COLUMNS =
  "id, batch_id, evaluation_id, status, report_id, snapshot_id, share_token, svi_total, dimension_scores, error, scored_at";

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Batches the user queued, newest first. Empty when 0322 is not applied. */
export async function listBatches(userId: string, limit = 50): Promise<EvaluationBatch[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select(BATCH_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:evaluations:batch] list failed", error);
    return [];
  }
  return ((data ?? []) as Row[]).map(mapBatchRow);
}

/** One batch, only if `userId` queued it. */
export async function getBatchForUser(userId: string, batchId: string): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select(BATCH_COLUMNS)
    .eq("id", batchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapBatchRow(data as Row);
}

export async function listBatchItems(batchId: string): Promise<EvaluationBatchItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("evaluation_batch_items")
    .select(ITEM_COLUMNS)
    .eq("batch_id", batchId)
    .order("id", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(mapBatchItemRow);
}

/**
 * Items still queued or running across every batch the user owns — reserved
 * quota. POST /api/evaluations/batch subtracts this from the remaining
 * reports_per_month so two batches cannot both claim the same 100 slots.
 */
export async function countPendingBatchItems(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);
  if (error || !data || data.length === 0) return 0;
  const ids = (data as Row[]).map((r) => String(r.id));
  const { count, error: err2 } = await supabase
    .from("evaluation_batch_items")
    .select("id", { count: "exact", head: true })
    .in("batch_id", ids)
    .in("status", ["queued", "running"]);
  if (err2) return 0;
  return count ?? 0;
}

/** Which of `ids` are evaluations held by `userId` (as evaluator). */
export async function ownedEvaluationIds(userId: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("evaluations")
    .select("id")
    .eq("evaluator_user_id", userId)
    .in("id", ids);
  if (error || !data) return out;
  for (const r of data as Row[]) out.add(String(r.id));
  return out;
}

export interface EvaluationJoin {
  evaluationId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  label: string | null;
  industry: string | null;
  state: string | null;
  stage: number | null;
}

async function loadEvaluationJoins(evaluationIds: string[]): Promise<Map<string, EvaluationJoin>> {
  const out = new Map<string, EvaluationJoin>();
  if (evaluationIds.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data, error } = await supabase
    .from("evaluations")
    .select("id, project_id, label, state, projects:project_id (name, slug, industry, stage)")
    .in("id", evaluationIds);
  if (error || !data) return out;
  for (const raw of data as Array<Row & { projects?: Row | Row[] | null }>) {
    const p = (Array.isArray(raw.projects) ? raw.projects[0] : raw.projects) ?? {};
    const stage = Number(p.stage);
    out.set(String(raw.id), {
      evaluationId: String(raw.id),
      projectId: String(raw.project_id),
      projectSlug: String(p.slug ?? ""),
      projectName: String(p.name ?? "Untitled startup"),
      label: raw.label == null ? null : String(raw.label),
      industry: p.industry == null ? null : String(p.industry),
      state: raw.state == null ? null : String(raw.state),
      stage: Number.isFinite(stage) ? stage : null,
    });
  }
  return out;
}

/**
 * For each project, the svi_total of the newest snapshot that is NOT the
 * batch's own snapshot and predates it — the "Δ since last" baseline.
 */
async function previousSviByProject(
  items: Array<{ projectId: string; snapshotId: string | null; scoredAt: string | null }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = Array.from(new Set(items.map((i) => i.projectId).filter(Boolean)));
  if (ids.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  try {
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("id, project_id, svi_total, created_at")
      .in("project_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * 6);
    if (error || !data) return out;
    const byProject = new Map<string, { snapshotId: string | null; scoredAt: string | null }>();
    for (const i of items) byProject.set(i.projectId, { snapshotId: i.snapshotId, scoredAt: i.scoredAt });
    for (const r of data as Row[]) {
      const pid = String(r.project_id ?? "");
      if (!pid || out.has(pid)) continue;
      const own = byProject.get(pid);
      if (own?.snapshotId && String(r.id) === own.snapshotId) continue;
      if (own?.scoredAt && String(r.created_at ?? "") > own.scoredAt) continue;
      const svi = Number(r.svi_total);
      if (Number.isFinite(svi)) out.set(pid, svi);
    }
  } catch {
    /* decorative */
  }
  return out;
}

/** The cohort table rows for a batch: items × evaluation/project × Δ. */
export async function loadCohortRows(batch: EvaluationBatch): Promise<CohortRow[]> {
  const items = await listBatchItems(batch.id);
  const joins = await loadEvaluationJoins(items.map((i) => i.evaluationId));
  const prev = await previousSviByProject(
    items
      .filter((i) => i.status === "done")
      .map((i) => ({ projectId: joins.get(i.evaluationId)?.projectId ?? "", snapshotId: i.snapshotId, scoredAt: i.scoredAt })),
  );
  return items.map((i) => buildCohortRow(i, joins.get(i.evaluationId) ?? null, batch.rubricWeights, prev));
}

export function buildCohortRow(
  item: EvaluationBatchItem,
  join: EvaluationJoin | null,
  weights: RubricWeights,
  prev: Map<string, number>,
): CohortRow {
  const projectId = join?.projectId ?? "";
  const before = projectId ? prev.get(projectId) : undefined;
  const { topStrength, topGap } = strengthAndGap(item.dimensionScores);
  return {
    itemId: item.id,
    evaluationId: item.evaluationId,
    projectId,
    projectSlug: join?.projectSlug ?? "",
    startup: join?.projectName ?? "Untitled startup",
    label: join?.label ?? null,
    industry: join?.industry ?? null,
    state: join?.state ?? null,
    status: item.status,
    svi: item.sviTotal,
    weighted: weightedScore(item.dimensionScores, weights),
    stage: join?.stage ?? null,
    delta: item.sviTotal != null && before != null ? Math.round((item.sviTotal - before) * 10) / 10 : null,
    topStrength,
    topGap,
    dimensionScores: item.dimensionScores,
    reportUrl: reportUrlForToken(item.shareToken),
    pdfUrl: pdfUrlForToken(item.shareToken),
    error: item.error,
    scoredAt: item.scoredAt,
  };
}

// ---------------------------------------------------------------------------
// Writes — queue
// ---------------------------------------------------------------------------

export type CreateBatchResult =
  | { ok: true; batch: EvaluationBatch }
  | { ok: false; error: "service_unavailable" | "create_failed"; message: string };

export async function createBatch(input: {
  userId: string;
  name: string;
  rubricWeights: unknown;
  evaluationIds: string[];
}): Promise<CreateBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Database unavailable" };
  const ids = Array.from(new Set(input.evaluationIds));
  const { data, error } = await supabase
    .from("evaluation_batches")
    .insert({
      user_id: input.userId,
      name: input.name,
      rubric_weights: normaliseWeights(input.rubricWeights),
      status: "queued",
      total: ids.length,
    })
    .select(BATCH_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[blockid:evaluations:batch] insert failed", error);
    return { ok: false, error: "create_failed", message: isMissingTable(error) ? "Batch scoring is not enabled on this server yet." : "Could not queue the batch" };
  }
  const batch = mapBatchRow(data as Row);
  const { error: itemErr } = await supabase
    .from("evaluation_batch_items")
    .insert(ids.map((evaluation_id) => ({ batch_id: batch.id, evaluation_id, status: "queued" })));
  if (itemErr) {
    console.error("[blockid:evaluations:batch] items insert failed", itemErr);
    await supabase.from("evaluation_batches").delete().eq("id", batch.id);
    return { ok: false, error: "create_failed", message: "Could not queue the batch items" };
  }
  return { ok: true, batch };
}

// ---------------------------------------------------------------------------
// Writes — runner
// ---------------------------------------------------------------------------

/** Oldest queued|running batch, flipped to running (started_at set once). */
export async function claimNextBatch(dry = false): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select(BATCH_COLUMNS)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const batch = mapBatchRow(data as Row);
  if (batch.status === "queued" && !dry) {
    const startedAt = new Date().toISOString();
    await supabase.from("evaluation_batches").update({ status: "running", started_at: startedAt }).eq("id", batch.id);
    return { ...batch, status: "running", startedAt };
  }
  return batch;
}

/** Next `n` queued items of the batch (lowest id first) joined to their project. */
export async function nextQueuedItems(
  batchId: string,
  n: number,
): Promise<Array<EvaluationBatchItem & { projectId: string | null; projectName: string | null }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("evaluation_batch_items")
    .select(ITEM_COLUMNS)
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .order("id", { ascending: true })
    .limit(n);
  if (error || !data) return [];
  const items = (data as Row[]).map(mapBatchItemRow);
  const joins = await loadEvaluationJoins(items.map((i) => i.evaluationId));
  return items.map((i) => ({
    ...i,
    projectId: joins.get(i.evaluationId)?.projectId ?? null,
    projectName: joins.get(i.evaluationId)?.projectName ?? null,
  }));
}

export async function markItem(
  itemId: number,
  patch: {
    status: BatchStatus;
    reportId?: string | null;
    snapshotId?: string | null;
    shareToken?: string | null;
    sviTotal?: number | null;
    dimensionScores?: unknown;
    error?: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const row: Row = { status: patch.status };
  if (patch.reportId !== undefined) row.report_id = patch.reportId;
  if (patch.snapshotId !== undefined) row.snapshot_id = patch.snapshotId;
  if (patch.shareToken !== undefined) row.share_token = patch.shareToken;
  if (patch.sviTotal !== undefined) row.svi_total = patch.sviTotal;
  if (patch.dimensionScores !== undefined) row.dimension_scores = patch.dimensionScores ?? null;
  if (patch.error !== undefined) row.error = patch.error ? patch.error.slice(0, 500) : null;
  if (patch.status === "done" || patch.status === "failed") row.scored_at = new Date().toISOString();
  const { error } = await supabase.from("evaluation_batch_items").update(row).eq("id", itemId);
  if (error) console.error("[blockid:evaluations:batch] item update failed", error);
}

/** svi_snapshots.dimension_scores for the run's snapshot (null when unavailable). */
export async function loadSnapshotDimensionScores(snapshotId: string | null): Promise<unknown> {
  if (!snapshotId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("svi_snapshots")
    .select("dimension_scores")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as Row).dimension_scores ?? null;
}

/**
 * Recount the items and, when none are queued or running, close the batch:
 * `done` when at least one item scored, `failed` when every item failed.
 * Returns the refreshed batch and whether this call closed it.
 */
export async function finaliseBatch(batchId: string): Promise<{ batch: EvaluationBatch | null; closed: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { batch: null, closed: false };
  const { data, error } = await supabase.from("evaluation_batch_items").select("status").eq("batch_id", batchId);
  if (error || !data) return { batch: null, closed: false };
  let done = 0;
  let failed = 0;
  let pending = 0;
  for (const r of data as Row[]) {
    if (r.status === "done") done++;
    else if (r.status === "failed") failed++;
    else pending++;
  }
  const patch: Row = { done_count: done, failed_count: failed, total: data.length };
  const closed = pending === 0;
  if (closed) {
    patch.status = done > 0 ? "done" : "failed";
    patch.finished_at = new Date().toISOString();
  }
  const { data: updated, error: upErr } = await supabase
    .from("evaluation_batches")
    .update(patch)
    .eq("id", batchId)
    .select(BATCH_COLUMNS)
    .single();
  if (upErr || !updated) return { batch: null, closed: false };
  return { batch: mapBatchRow(updated as Row), closed };
}
