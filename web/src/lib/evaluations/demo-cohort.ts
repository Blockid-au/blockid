// demo-cohort — the DB layer of the fictional demo cohort (G24-C;
// docs/plans/g24-report-readability-demo-cohort-2026-09-21.md § 2 C).
//
//   createDemoBatch(input)     one demo batch per evaluator (or acting
//                              organisation) — idempotent: an existing one is
//                              returned, never duplicated. Writes ONLY
//                              `projects` (5, evaluator-owned, no ABN,
//                              verification_level L1–L5), `evaluations` (5),
//                              `evaluation_batches` (1, is_demo = true, done)
//                              and `evaluation_batch_items` (5, done with
//                              svi_total + dimension_scores). It NEVER writes
//                              svi_analyses / svi_snapshots / evaluation_reports
//                              / claims / connector rows — so benchmarks, the
//                              assessment pools, the Startup Index, calibration
//                              and the outcome signals never see the demo (the
//                              colocated test pins the table set).
//   deleteDemoBatch(batch)     owner action: removes the batch and its five
//                              projects (evaluations + items cascade).
//   findDemoBatch(userId, org) the existing demo batch (user-owned, or the
//                              organisation's when `orgId` is given).
//   demoAnalysisForRows(rows)  the per-project analysis inputs the cohort
//                              loader would otherwise read from svi_snapshots —
//                              evidence confidence, verification level, the
//                              conflicting claim — from the fixture.
//   demoJourneyForRows(rows)   the same for the program journey (confidence,
//                              verification, evidence rows).
//
// No AI call anywhere — the scores come from lib/report-v2/fixtures'
// demo register through the pure scorer in ./demo-cohort-shared.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { demoSnapshotInput } from "@/lib/report-v2/fixtures";
import { DIMENSION_KEYS, equalWeights, mapBatchRow, type EvaluationBatch } from "./batch-shared";
import type { CohortAnalysisInput } from "./cohort-rows";
import type { JourneyEvidenceRow } from "./program-journey";
import {
  DEMO_COHORT_NAME,
  DEMO_COHORT_PROGRAM_NAME,
  DEMO_PROJECT_SLUG_PREFIX,
  DEMO_STARTUPS,
  buildDemoCohortItems,
  demoProjectSlug,
  demoStartupForSlug,
  type DemoCohortItem,
  type DemoRegisterInput,
} from "./demo-cohort-shared";

type Row = Record<string, unknown>;
type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** The tables the seeder is allowed to touch — pinned by the colocated test. */
export const DEMO_WRITE_TABLES = Object.freeze(["projects", "evaluations", "evaluation_batches", "evaluation_batch_items"] as const);

const BATCH_COLUMNS =
  "id, user_id, name, rubric_weights, status, total, done_count, failed_count, created_at, started_at, finished_at, program_name, intake_id, template_id, weights_version, applicants_cap, pilot_order_id, org_id, is_demo";

function omit<T extends Row>(row: T, key: string): Row {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
}

function isMissingColumn(error: unknown, column?: string): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e || e.code !== "42703") return false;
  return column ? String(e.message ?? "").includes(column) : true;
}

// ─── The register → items ───────────────────────────────────────────────────

/** The demo register as the scorer reads it (lib/report-v2/fixtures — the same rows /tbr/demo renders). */
export function demoRegister(): DemoRegisterInput {
  const snap = demoSnapshotInput("standard");
  const dims: DemoRegisterInput["dims"] = {};
  for (const k of DIMENSION_KEYS) {
    const s = snap.dimStates[k]?.score;
    if (typeof s === "number" && Number.isFinite(s)) dims[k] = s;
  }
  return { dims, evidenceRows: (snap.evidenceRows ?? []).map((r) => ({ evidence_id: r.evidence_id, dims: r.dims, status: r.status, confidence: r.confidence ?? null, label: r.label })) };
}

let cachedItems: DemoCohortItem[] | null = null;

/** The five scored demo items (deterministic; memoised per process). */
export function demoCohortItems(): DemoCohortItem[] {
  if (!cachedItems) cachedItems = buildDemoCohortItems(demoRegister());
  return cachedItems;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export type FindDemoBatchResult = { ok: true; batch: EvaluationBatch | null } | { ok: false; error: "unavailable" | "migration_pending" };

/**
 * The caller's demo batch: the one they created, or — when `orgId` is given —
 * the one created for that organisation by any seat (one demo per org).
 */
export async function findDemoBatch(userId: string, orgId: string | null = null): Promise<FindDemoBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable" };
  const filter = orgId ? `user_id.eq.${userId},org_id.eq.${orgId}` : `user_id.eq.${userId}`;
  const { data, error } = await supabase.from("evaluation_batches").select(BATCH_COLUMNS).eq("is_demo", true).or(filter).order("created_at", { ascending: false }).limit(1);
  if (error) {
    if (isMissingColumn(error)) return { ok: false, error: "migration_pending" };
    console.error("[blockid:demo-cohort] find failed", error);
    return { ok: false, error: "unavailable" };
  }
  const row = ((data ?? []) as Row[])[0];
  return { ok: true, batch: row ? mapBatchRow(row) : null };
}

/** True when the caller currently holds a demo batch (the pilot-kit "Ran the demo cohort" tick). Fail-soft false. */
export async function hasDemoBatch(userId: string, orgId: string | null = null): Promise<boolean> {
  try {
    const r = await findDemoBatch(userId, orgId);
    return r.ok && r.batch != null;
  } catch {
    return false;
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateDemoBatchInput {
  userId: string;
  /** The organisation the creator acts for (resolveActingOrg); null before 0393 / 0433. */
  orgId?: string | null;
}

export type CreateDemoBatchResult =
  | { ok: true; created: boolean; batch: EvaluationBatch; items: number }
  | { ok: false; error: "unavailable" | "migration_pending" | "create_failed"; message: string };

/** Slugs unique per owner (projects UNIQUE(user_id, slug)) — a leftover demo project bumps the suffix. */
function pickSlug(taken: Set<string>, key: string): string {
  const base = demoProjectSlug(key);
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  taken.add(`${base}-${n}`);
  return `${base}-${n}`;
}

async function insertProjects(supabase: Db, userId: string, taken: Set<string>): Promise<{ ok: true; rows: Array<{ id: string; slug: string; key: string }> } | { ok: false; error: unknown }> {
  const items = demoCohortItems();
  const rows = items.map((it) => ({
    user_id: userId,
    name: it.fixture.name,
    slug: pickSlug(taken, it.fixture.key),
    description: it.fixture.description,
    industry: it.fixture.industry,
    stage: it.fixture.stage,
    is_default: false,
    verification_level: it.fixture.verificationLevel,
  }));
  let res = await supabase.from("projects").insert(rows).select("id, slug");
  if (res.error && isMissingColumn(res.error, "verification_level")) {
    res = await supabase.from("projects").insert(rows.map((r) => omit(r, "verification_level"))).select("id, slug");
  }
  if (res.error || !res.data) return { ok: false, error: res.error };
  const out = ((res.data ?? []) as Row[]).map((r) => {
    const slug = String(r.slug);
    return { id: String(r.id), slug, key: demoStartupForSlug(slug)?.key ?? "" };
  });
  return { ok: true, rows: out };
}

export async function createDemoBatch(input: CreateDemoBatchInput): Promise<CreateDemoBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Database unavailable" };
  const orgId = input.orgId ?? null;

  // Idempotent: one demo per evaluator / organisation.
  const existing = await findDemoBatch(input.userId, orgId);
  if (!existing.ok) {
    return existing.error === "migration_pending"
      ? { ok: false, error: "migration_pending", message: "The demo cohort is not enabled on this server yet (migration 0436 pending)." }
      : { ok: false, error: "unavailable", message: "Database unavailable" };
  }
  if (existing.batch) return { ok: true, created: false, batch: existing.batch, items: existing.batch.total };

  const items = demoCohortItems();
  const nowIso = new Date().toISOString();

  // 1. projects — slugs unique per owner.
  const { data: owned } = await supabase.from("projects").select("slug").eq("user_id", input.userId).like("slug", `${DEMO_PROJECT_SLUG_PREFIX}%`);
  const taken = new Set(((owned ?? []) as Row[]).map((r) => String(r.slug)));
  const projects = await insertProjects(supabase, input.userId, taken);
  if (!projects.ok) {
    // Two concurrent "Load a demo cohort" clicks: the second racer trips the
    // per-owner slug uniqueness — answer with the batch the first one made
    // (review G24 P3) instead of a 500.
    const pe = (projects.error ?? {}) as { code?: string; message?: string };
    if (/23505|duplicate key/i.test(`${pe.code ?? ""} ${pe.message ?? ""}`)) {
      const again = await findDemoBatch(input.userId, orgId);
      if (again.ok && again.batch) return { ok: true, created: false, batch: again.batch, items: again.batch.total };
    }
    console.error("[blockid:demo-cohort] projects insert failed", projects.error);
    return { ok: false, error: "create_failed", message: "Could not create the demo startups" };
  }
  const projectIds = projects.rows.map((p) => p.id);
  const rollback = async (batchId?: string) => {
    try {
      if (batchId) await supabase.from("evaluation_batches").delete().eq("id", batchId);
      await supabase.from("projects").delete().in("id", projectIds).eq("user_id", input.userId);
    } catch {
      /* best effort */
    }
  };
  const itemByKey = new Map(items.map((it) => [it.fixture.key, it] as const));

  // 2. evaluations — evaluator-owned, no founder, the demo note on each.
  const evalRows = projects.rows.map((p) => {
    const it = itemByKey.get(p.key);
    return { evaluator_user_id: input.userId, project_id: p.id, owner_kind: "evaluator", consent_tier: "attributed_only", state: it?.fixture.state ?? null, notes: it?.notes ?? null };
  });
  const evals = await supabase.from("evaluations").insert(evalRows).select("id, project_id");
  if (evals.error || !evals.data) {
    console.error("[blockid:demo-cohort] evaluations insert failed", evals.error);
    await rollback();
    return { ok: false, error: "create_failed", message: "Could not record the demo evaluations" };
  }
  const evaluationByProject = new Map(((evals.data ?? []) as Row[]).map((r) => [String(r.project_id), String(r.id)] as const));

  // 3. the batch — done on arrival (nothing to score), flagged is_demo.
  const batchRow: Row = {
    user_id: input.userId,
    name: DEMO_COHORT_NAME,
    program_name: DEMO_COHORT_PROGRAM_NAME,
    rubric_weights: equalWeights(),
    status: "done",
    total: projects.rows.length,
    done_count: projects.rows.length,
    failed_count: 0,
    started_at: nowIso,
    finished_at: nowIso,
    is_demo: true,
    ...(orgId ? { org_id: orgId } : {}),
  };
  let batchRes = await supabase.from("evaluation_batches").insert(batchRow).select(BATCH_COLUMNS).single();
  if (batchRes.error && isMissingColumn(batchRes.error, "is_demo")) {
    await rollback();
    return { ok: false, error: "migration_pending", message: "The demo cohort is not enabled on this server yet (migration 0436 pending)." };
  }
  if (batchRes.error && isMissingColumn(batchRes.error, "org_id") && orgId) {
    batchRes = await supabase.from("evaluation_batches").insert(omit(batchRow, "org_id")).select(BATCH_COLUMNS).single();
  }
  if (batchRes.error || !batchRes.data) {
    console.error("[blockid:demo-cohort] batch insert failed", batchRes.error);
    await rollback();
    return { ok: false, error: "create_failed", message: "Could not create the demo cohort" };
  }
  const batch = mapBatchRow(batchRes.data as unknown as Row);

  // 4. the items — scored on arrival from the register (no AI, no report row).
  const itemRows = projects.rows.map((p) => {
    const it = itemByKey.get(p.key);
    return {
      batch_id: batch.id,
      evaluation_id: evaluationByProject.get(p.id) ?? null,
      status: "done",
      svi_total: it?.sviTotal ?? null,
      dimension_scores: it ? Object.fromEntries(DIMENSION_KEYS.map((k) => [k, { score: it.dimensionScores[k] }])) : null,
      scored_at: nowIso,
    };
  });
  if (itemRows.some((r) => !r.evaluation_id)) {
    await rollback(batch.id);
    return { ok: false, error: "create_failed", message: "Could not link the demo startups to the cohort" };
  }
  const itemsRes = await supabase.from("evaluation_batch_items").insert(itemRows);
  if (itemsRes.error) {
    console.error("[blockid:demo-cohort] items insert failed", itemsRes.error);
    await rollback(batch.id);
    return { ok: false, error: "create_failed", message: "Could not fill the demo cohort" };
  }

  void appendAudit({
    user_id: input.userId,
    actor: "user",
    action: "cohort.demo_created",
    resource_type: "evaluation_batch",
    resource_id: batch.id,
    detail: { items: itemRows.length, org_id: orgId, fictional: true },
  }).catch(() => {});

  return { ok: true, created: true, batch, items: itemRows.length };
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export type DeleteDemoBatchResult = { ok: true; removedProjects: number } | { ok: false; error: "unavailable" | "not_demo" | "delete_failed"; message: string };

/**
 * Remove the demo cohort: its five projects (evaluations + batch items
 * cascade) and the batch row. Only rows owned by the batch creator with the
 * demo slug prefix are ever deleted — a real project can never be swept up.
 */
export async function deleteDemoBatch(batch: EvaluationBatch, actorId: string): Promise<DeleteDemoBatchResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Database unavailable" };
  if (!batch.isDemo) return { ok: false, error: "not_demo", message: "Only the demo cohort can be removed here" };

  const { data: items } = await supabase.from("evaluation_batch_items").select("evaluation_id").eq("batch_id", batch.id);
  const evaluationIds = ((items ?? []) as Row[]).map((r) => String(r.evaluation_id));
  let projectIds: string[] = [];
  if (evaluationIds.length > 0) {
    const { data: evals } = await supabase.from("evaluations").select("project_id").in("id", evaluationIds);
    projectIds = ((evals ?? []) as Row[]).map((r) => String(r.project_id));
  }
  let removedProjects = 0;
  if (projectIds.length > 0) {
    const { data: gone, error } = await supabase.from("projects").delete().in("id", projectIds).eq("user_id", batch.userId).like("slug", `${DEMO_PROJECT_SLUG_PREFIX}%`).select("id");
    if (error) {
      console.error("[blockid:demo-cohort] projects delete failed", error);
      return { ok: false, error: "delete_failed", message: "Could not remove the demo startups" };
    }
    removedProjects = Array.isArray(gone) ? gone.length : 0;
  }
  const { error: bErr } = await supabase.from("evaluation_batches").delete().eq("id", batch.id).eq("is_demo", true);
  if (bErr) {
    console.error("[blockid:demo-cohort] batch delete failed", bErr);
    return { ok: false, error: "delete_failed", message: "Could not remove the demo cohort" };
  }
  void appendAudit({
    user_id: actorId,
    actor: "user",
    action: "cohort.demo_removed",
    resource_type: "evaluation_batch",
    resource_id: batch.id,
    detail: { removed_projects: removedProjects },
  }).catch(() => {});
  return { ok: true, removedProjects };
}

// ─── Fixture-backed reads for the cohort surfaces ───────────────────────────

/** The demo item behind a cohort row (by project slug); null for a non-demo slug. */
export function demoItemForSlug(slug: string | null | undefined): DemoCohortItem | null {
  const fixture = demoStartupForSlug(slug);
  if (!fixture) return null;
  return demoCohortItems().find((it) => it.fixture.key === fixture.key) ?? null;
}

/**
 * What `loadAnalyses` would read from svi_snapshots / projects / claims for
 * a real cohort — from the fixture instead, so the demo never needs those
 * rows. Pure over the row slugs.
 */
export function demoAnalysisForRows(rows: ReadonlyArray<{ projectId: string; projectSlug: string }>): Record<string, CohortAnalysisInput> {
  const out: Record<string, CohortAnalysisInput> = {};
  for (const r of rows) {
    if (!r.projectId || out[r.projectId]) continue;
    const it = demoItemForSlug(r.projectSlug);
    if (!it) continue;
    out[r.projectId] = {
      evidenceConfidence: it.evidenceConfidence,
      verificationLevel: it.fixture.verificationLevel,
      pendingDims: 0,
      unverifiedMaterialClaims: it.conflictingClaims,
      conflictingClaims: it.conflictingClaims,
    };
  }
  return out;
}

export interface DemoJourneyExtras {
  confidence: Map<string, number>;
  verification: Map<string, number>;
  evidence: Map<string, JourneyEvidenceRow[]>;
}

/** The journey's per-project reads (confidence, verification, evidence rows) from the fixture. */
export function demoJourneyForRows(rows: ReadonlyArray<{ projectId: string; projectSlug: string }>): DemoJourneyExtras {
  const out: DemoJourneyExtras = { confidence: new Map(), verification: new Map(), evidence: new Map() };
  for (const r of rows) {
    const it = demoItemForSlug(r.projectSlug);
    if (!it || !r.projectId) continue;
    out.confidence.set(r.projectId, it.evidenceConfidence);
    out.verification.set(r.projectId, it.fixture.verificationLevel);
    out.evidence.set(
      r.projectId,
      it.evidence.map((e) => ({ dimension: e.dimension, evidence_type: e.evidence_type, confidence_level: e.confidence_level })),
    );
  }
  return out;
}

export { DEMO_STARTUPS };
