// batch — DB layer for Program batch scoring (T0272, G12 sprint S5).
//
// Tables: evaluation_batches + evaluation_batch_items (migration 0322).
// Writers: POST /api/evaluations/batch (queue) and
// /api/cron/evaluation-batch-runner (score). Readers: /workspace/evaluations
// (Cohorts list), /workspace/evaluations/cohort/[batchId], the CSV export and
// /api/reports/quarterly?batch=. Pure helpers (weights, CSV, mapping) live in
// ./batch-shared.ts so the client bundle never imports this file.
//
// Claims are conditional updates (`… where id=? and status='queued'`,
// review #6) and items carry a lease (`started_at` / `attempts`, migration
// 0325, review #7): sweepExpiredLeases() requeues or fails items a killed
// tick left `running`, and claimNextBatch() closes a batch whose items are
// all terminal instead of returning it forever.
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
export { countPendingBatchItems } from "@/lib/evaluations/report-quota";
import {
  EMPTY_DECISION,
  mapBatchItemRow,
  mapBatchRow,
  normaliseWeights,
  strengthAndGap,
  weightedScore,
  type BatchStatus,
  type CohortRow,
  type CohortRowDecision,
  type EvaluationBatch,
  type EvaluationBatchItem,
  type RubricWeights,
} from "./batch-shared";
import { loadCohortDecisions } from "./cohort-decisions";
import { emitFiEvent } from "@/lib/analytics/fi-events";

export { BATCH_FEATURES, LP_REPORT_FEATURES, canBatchScore, canExportLpReport } from "./batch-shared";

type Row = Record<string, unknown>;

const BATCH_COLUMNS =
  "id, user_id, name, rubric_weights, status, total, done_count, failed_count, created_at, started_at, finished_at";
/** G21 P2-A (0422) — the BlockID Cohort columns; readers fall back to BATCH_COLUMNS on 42703 until 0422 is applied. */
const BATCH_COLUMNS_V2 = `${BATCH_COLUMNS}, program_name, intake_id, template_id, weights_version, applicants_cap, pilot_order_id`;
const ITEM_COLUMNS =
  "id, batch_id, evaluation_id, status, report_id, snapshot_id, share_token, svi_total, dimension_scores, error, scored_at";

/** Lease (review #7): a `running` item older than this is requeued or failed. */
export const ITEM_LEASE_MS = 15 * 60 * 1000;
/** After this many claims a stale item is failed with error=lease_expired. */
export const ITEM_MAX_ATTEMPTS = 2;

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42703";
}

/** Run a batch read with the 0422 columns, retrying on the 0322-only shape (42703 = column missing). */
async function withBatchColumns<T extends { error: unknown }>(run: (cols: string) => PromiseLike<T>): Promise<T> {
  const res = await run(BATCH_COLUMNS_V2);
  if (res.error && isMissingColumn(res.error)) return run(BATCH_COLUMNS);
  return res;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Batches the user queued, newest first. Empty when 0322 is not applied. */
export async function listBatches(userId: string, limit = 50): Promise<EvaluationBatch[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await withBatchColumns((cols) =>
    supabase.from("evaluation_batches").select(cols).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
  );
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:evaluations:batch] list failed", error);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(mapBatchRow);
}

/** One batch, only if `userId` queued it. */
export async function getBatchForUser(userId: string, batchId: string): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await withBatchColumns((cols) =>
    supabase.from("evaluation_batches").select(cols).eq("id", batchId).eq("user_id", userId).maybeSingle(),
  );
  if (error || !data) return null;
  return mapBatchRow(data as unknown as Row);
}

/** One batch by id regardless of owner — the cron runner / snapshot writer. */
export async function getBatchById(batchId: string): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await withBatchColumns((cols) => supabase.from("evaluation_batches").select(cols).eq("id", batchId).maybeSingle());
  if (error || !data) return null;
  return mapBatchRow(data as unknown as Row);
}

/** How many items (any status) the batch holds — the applicants_cap check. */
export async function countBatchItems(batchId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase.from("evaluation_batch_items").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  if (error) return 0;
  return count ?? 0;
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

// countPendingBatchItems (reserved quota) lives in report-quota.ts since
// review #8 — previewReportCharge needs it and this module imports that one.
// Re-exported above so POST /api/evaluations/batch keeps its import.

/** The batch owner as the quota layer wants it (`{id, plan}`); null when unknown. */
export async function loadBatchOwner(userId: string): Promise<{ id: string; plan: string | null } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("app_users").select("id, plan").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { id: String(row.id), plan: row.plan == null ? null : String(row.plan) };
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

/** The cohort table rows for a batch: items × evaluation/project × Δ × (S-D3) the owner's decision. */
export async function loadCohortRows(batch: EvaluationBatch): Promise<CohortRow[]> {
  const items = await listBatchItems(batch.id);
  const evaluationIds = items.map((i) => i.evaluationId);
  const [joins, decisions] = await Promise.all([loadEvaluationJoins(evaluationIds), loadCohortDecisions(evaluationIds, batch.userId).catch(() => new Map<string, CohortRowDecision>())]);
  const prev = await previousSviByProject(
    items
      .filter((i) => i.status === "done")
      .map((i) => ({ projectId: joins.get(i.evaluationId)?.projectId ?? "", snapshotId: i.snapshotId, scoredAt: i.scoredAt })),
  );
  return items.map((i) => buildCohortRow(i, joins.get(i.evaluationId) ?? null, batch.rubricWeights, prev, decisions.get(i.evaluationId) ?? null));
}

export function buildCohortRow(
  item: EvaluationBatchItem,
  join: EvaluationJoin | null,
  weights: RubricWeights,
  prev: Map<string, number>,
  decision: CohortRowDecision | null = null,
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
    ...(decision ?? EMPTY_DECISION),
  };
}

// ---------------------------------------------------------------------------
// Writes — queue
// ---------------------------------------------------------------------------

export type CreateBatchResult =
  | { ok: true; batch: EvaluationBatch }
  | { ok: false; error: "service_unavailable" | "create_failed"; message: string };

export interface CreateBatchInput {
  userId: string;
  name: string;
  rubricWeights: unknown;
  /** May be empty (G21 P2-A): an empty cohort is created `done` (nothing to score) and flips to `queued` when the CSV import adds items. */
  evaluationIds: string[];
  // G21 P2-A (0422) — optional cohort metadata; dropped on the 0322-only shape.
  programName?: string | null;
  intakeId?: string | null;
  templateId?: string | null;
  applicantsCap?: number | null;
  pilotOrderId?: string | null;
  /** FI analytics envelope for `cohort_created` (plan of the acting account, channel). */
  plan?: string | null;
  channel?: string | null;
  email?: string | null;
}

export async function createBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Database unavailable" };
  const ids = Array.from(new Set(input.evaluationIds));
  const base: Row = {
    user_id: input.userId,
    name: input.name,
    rubric_weights: normaliseWeights(input.rubricWeights),
    status: ids.length > 0 ? "queued" : "done",
    total: ids.length,
  };
  if (ids.length === 0) base.finished_at = new Date().toISOString();
  const extra: Row = {};
  if (input.programName != null) extra.program_name = input.programName.slice(0, 160);
  if (input.intakeId != null) extra.intake_id = input.intakeId;
  if (input.templateId != null) extra.template_id = input.templateId;
  if (input.applicantsCap != null && input.applicantsCap > 0) extra.applicants_cap = Math.round(input.applicantsCap);
  if (input.pilotOrderId != null) extra.pilot_order_id = input.pilotOrderId;

  let res = await supabase.from("evaluation_batches").insert({ ...base, ...extra }).select(BATCH_COLUMNS_V2).single();
  if (res.error && isMissingColumn(res.error)) {
    // 0422 not applied: insert the 0322 shape (the cohort metadata is dropped, not failed).
    res = await supabase.from("evaluation_batches").insert(base).select(BATCH_COLUMNS).single();
  }
  const { data, error } = res;
  if (error || !data) {
    console.error("[blockid:evaluations:batch] insert failed", error);
    return { ok: false, error: "create_failed", message: isMissingTable(error) ? "Batch scoring is not enabled on this server yet." : "Could not queue the batch" };
  }
  const batch = mapBatchRow(data as unknown as Row);
  if (ids.length > 0) {
    const { error: itemErr } = await supabase
      .from("evaluation_batch_items")
      .insert(ids.map((evaluation_id) => ({ batch_id: batch.id, evaluation_id, status: "queued" })));
    if (itemErr) {
      console.error("[blockid:evaluations:batch] items insert failed", itemErr);
      await supabase.from("evaluation_batches").delete().eq("id", batch.id);
      return { ok: false, error: "create_failed", message: "Could not queue the batch items" };
    }
  }
  // G21 P0-D / P2-A — FI envelope: organisation = the evaluator account.
  emitFiEvent("cohort_created", {
    organisation: input.userId,
    userId: input.userId,
    plan: input.plan ?? null,
    channel: input.channel ?? "workspace",
    email: input.email ?? null,
    batch_id: batch.id,
    items: ids.length,
    ...(batch.programName ? { program_name: batch.programName } : {}),
    ...(batch.pilotOrderId ? { pilot_order_id: batch.pilotOrderId } : {}),
  });
  return { ok: true, batch };
}

export type AddToBatchResult =
  | { ok: true; added: string[]; alreadyPresent: string[]; batch: EvaluationBatch }
  | { ok: false; error: "service_unavailable" | "add_failed"; message: string };

/**
 * G21 P2-A — append evaluations to an existing cohort (the CSV import).
 * Ids already in the batch are skipped (UNIQUE(batch_id, evaluation_id)),
 * `total` grows by the number added, and a `done` / `failed` batch goes back
 * to `queued` so the runner picks the new items up on its next tick.
 */
export async function addEvaluationsToBatch(batch: EvaluationBatch, evaluationIds: string[]): Promise<AddToBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Database unavailable" };
  const ids = Array.from(new Set(evaluationIds));
  if (ids.length === 0) return { ok: true, added: [], alreadyPresent: [], batch };
  const { data: existing, error: exErr } = await supabase.from("evaluation_batch_items").select("evaluation_id").eq("batch_id", batch.id).in("evaluation_id", ids);
  if (exErr) return { ok: false, error: "add_failed", message: "Could not read the cohort" };
  const present = new Set(((existing ?? []) as Row[]).map((r) => String(r.evaluation_id)));
  const fresh = ids.filter((id) => !present.has(id));
  if (fresh.length > 0) {
    const { error } = await supabase.from("evaluation_batch_items").insert(fresh.map((evaluation_id) => ({ batch_id: batch.id, evaluation_id, status: "queued" })));
    if (error) {
      console.error("[blockid:evaluations:batch] add items failed", error);
      return { ok: false, error: "add_failed", message: "Could not add the startups to the cohort" };
    }
  }
  const patch: Row = { total: batch.total + fresh.length };
  if (fresh.length > 0 && (batch.status === "done" || batch.status === "failed")) {
    patch.status = "queued";
    patch.finished_at = null;
  }
  const { data, error: upErr } = await withBatchColumns((cols) => supabase.from("evaluation_batches").update(patch).eq("id", batch.id).select(cols).single());
  const refreshed = !upErr && data ? mapBatchRow(data as unknown as Row) : { ...batch, total: batch.total + fresh.length, status: (patch.status as BatchStatus | undefined) ?? batch.status };
  return { ok: true, added: fresh, alreadyPresent: ids.filter((id) => present.has(id)), batch: refreshed };
}

// ---------------------------------------------------------------------------
// Writes — runner
// ---------------------------------------------------------------------------

/**
 * Oldest queued|running batch that still has a queued or running item,
 * flipped queued → running with a conditional update (review #6: two
 * overlapping ticks cannot both "start" it; the loser simply reads the row
 * the winner wrote). A batch whose every remaining item is `failed` (or
 * `done`) is closed via finaliseBatch and skipped, so it can never wedge
 * the platform-wide queue (review #7).
 */
export async function claimNextBatch(dry = false): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluation_batches")
    .select(BATCH_COLUMNS)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !data) return null;
  for (const raw of data as Row[]) {
    const batch = mapBatchRow(raw);
    const { count, error: cntErr } = await supabase
      .from("evaluation_batch_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batch.id)
      .in("status", ["queued", "running"]);
    if (cntErr) return null;
    if ((count ?? 0) === 0) {
      // Every item already terminal — close it (done|failed) and move on.
      if (!dry) await finaliseBatch(batch.id);
      continue;
    }
    if (batch.status === "queued" && !dry) {
      const startedAt = new Date().toISOString();
      const { data: flipped } = await supabase
        .from("evaluation_batches")
        .update({ status: "running", started_at: startedAt })
        .eq("id", batch.id)
        .eq("status", "queued")
        .select(BATCH_COLUMNS);
      if (Array.isArray(flipped) && flipped.length > 0) return mapBatchRow(flipped[0] as Row);
      // Lost the race: another tick flipped it — continue with the row it wrote.
      const { data: fresh } = await supabase.from("evaluation_batches").select(BATCH_COLUMNS).eq("id", batch.id).maybeSingle();
      return fresh ? mapBatchRow(fresh as Row) : { ...batch, status: "running", startedAt };
    }
    return batch;
  }
  return null;
}

/**
 * Lease sweep (review #7). Items `running` since before `now - ITEM_LEASE_MS`
 * were abandoned by a killed tick (deploy / restart / watchdog): with fewer
 * than ITEM_MAX_ATTEMPTS claims they go back to `queued`, otherwise they
 * are `failed` with error='lease_expired'. Items with no `started_at`
 * (pre-0325 rows) count as expired. Returns what it did for the tick log.
 */
export async function sweepExpiredLeases(
  batchId: string,
  now: Date = new Date(),
): Promise<{ requeued: number[]; failed: number[] }> {
  const out = { requeued: [] as number[], failed: [] as number[] };
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const cutoff = new Date(now.getTime() - ITEM_LEASE_MS).toISOString();
  const { data, error } = await supabase
    .from("evaluation_batch_items")
    .select("id, started_at, attempts")
    .eq("batch_id", batchId)
    .eq("status", "running")
    .or(`started_at.is.null,started_at.lt.${cutoff}`);
  if (error || !data) return out;
  for (const raw of data as Row[]) {
    const id = Number(raw.id);
    const attempts = Number(raw.attempts ?? 0) || 0;
    const patch: Row =
      attempts < ITEM_MAX_ATTEMPTS
        ? { status: "queued", started_at: null }
        : { status: "failed", error: "lease_expired", scored_at: now.toISOString() };
    const { data: upd } = await supabase
      .from("evaluation_batch_items")
      .update(patch)
      .eq("id", id)
      .eq("status", "running")
      .select("id");
    if (!Array.isArray(upd) || upd.length === 0) continue;
    (patch.status === "queued" ? out.requeued : out.failed).push(id);
  }
  return out;
}

/**
 * Claim up to `n` queued items of the batch (lowest id first) and join them
 * to their project. Each claim is `update … set status='running',
 * started_at=now(), attempts=attempts+1 where id=? and status='queued'`
 * (review #6): an item another tick already took updates 0 rows and is
 * skipped, so no item is ever scored twice. `dry` only reads.
 */
export async function nextQueuedItems(
  batchId: string,
  n: number,
  dry = false,
): Promise<Array<EvaluationBatchItem & { projectId: string | null; projectName: string | null }>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const pick = (cols: string) =>
    supabase.from("evaluation_batch_items").select(cols).eq("batch_id", batchId).eq("status", "queued").order("id", { ascending: true }).limit(n);
  let res = await pick(`${ITEM_COLUMNS}, started_at, attempts`);
  // 42703 = migration 0325 not applied yet: claim without the lease columns.
  const leased = !(res.error && (res.error as { code?: string }).code === "42703");
  if (!leased) res = await pick(ITEM_COLUMNS);
  const { data, error } = res;
  if (error || !data) return [];
  const candidates = (data as unknown as Row[]).map((r) => ({ row: mapBatchItemRow(r), attempts: Number(r.attempts ?? 0) || 0 }));
  const items: EvaluationBatchItem[] = [];
  if (dry) {
    items.push(...candidates.map((c) => c.row));
  } else {
    const startedAt = new Date().toISOString();
    for (const c of candidates) {
      const patch: Row = leased ? { status: "running", started_at: startedAt, attempts: c.attempts + 1 } : { status: "running" };
      const { data: upd, error: updErr } = await supabase
        .from("evaluation_batch_items")
        .update(patch)
        .eq("id", c.row.id)
        .eq("status", "queued")
        .select("id");
      if (updErr) {
        console.error("[blockid:evaluations:batch] item claim failed", updErr);
        continue;
      }
      if (Array.isArray(upd) && upd.length > 0) items.push({ ...c.row, status: "running" });
    }
  }
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
  const { data: updated, error: upErr } = await withBatchColumns((cols) => supabase.from("evaluation_batches").update(patch).eq("id", batchId).select(cols).single());
  if (upErr || !updated) return { batch: null, closed: false };
  return { batch: mapBatchRow(updated as unknown as Row), closed };
}
