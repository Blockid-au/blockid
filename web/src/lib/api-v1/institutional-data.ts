// G21 P3-B — the data behind `/api/v1/institutional/**`, and the PII
// whitelist. Everything a response carries is projected through one of the
// `to*` functions below: company name + ids + scores + counts + the
// evaluator's own decision — never a founder e-mail, a private note, an
// invite token, or a reviewer's name.
//
//   listReadableBatches(userId)   the batches the key owner created + the ones
//                                 they are a member of (0423), newest first
//   loadCohortForKey(id, userId)  assertBatchRole (viewer) → the BlockID Cohort
//                                 rows → public items (404 for a non-member)
//   loadCohortSnapshotsForKey     the same gate → snapshot summaries + rows
//   loadCompanyForKey(pid, uid)   404 unless the key owner has an `evaluations`
//                                 row on the project or a batch membership
//                                 whose items include it → Assessment Card
//                                 data (latest svi_snapshots analysis) + the
//                                 published benchmark (segments-db)
//
// Every reader is fail-soft on a missing table (pre-migration) and never
// widens past the key owner.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isMissingRelation } from "@/lib/investors/mandates";
import { getBatchById, listBatches } from "@/lib/evaluations/batch";
import { assertBatchRole, type BatchRole } from "@/lib/evaluations/batch-members";
import { loadBlockIdCohortRows } from "@/lib/evaluations/cohort-rows-loader";
import { listCohortSnapshots, type CohortSnapshot } from "@/lib/evaluations/cohort-snapshots";
import type { CohortRow } from "@/lib/evaluations/cohort-rows";
import type { EvaluationBatch } from "@/lib/evaluations/batch-shared";
import { assessmentCardFromAnalysis, type AssessmentCardData } from "@/lib/svi/assessment-card";
import { loadAssessmentContext } from "@/lib/svi/assessment-context";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type Row = Record<string, unknown>;

// ─── Projections (the whitelist) ────────────────────────────────────────────

export interface PublicCohortV1 {
  id: string;
  name: string;
  program_name: string | null;
  status: EvaluationBatch["status"];
  role: BatchRole;
  total: number;
  done_count: number;
  failed_count: number;
  weights_version: number;
  created_at: string;
  finished_at: string | null;
  links: { items: string; snapshots: string };
}

export function toPublicCohort(batch: EvaluationBatch, role: BatchRole): PublicCohortV1 {
  return {
    id: batch.id,
    name: batch.name,
    program_name: batch.programName ?? null,
    status: batch.status,
    role,
    total: batch.total,
    done_count: batch.doneCount,
    failed_count: batch.failedCount,
    weights_version: batch.weightsVersion ?? 1,
    created_at: batch.createdAt,
    finished_at: batch.finishedAt,
    links: { items: `/api/v1/institutional/cohorts/${batch.id}`, snapshots: `/api/v1/institutional/cohorts/${batch.id}/snapshots` },
  };
}

export interface PublicCohortItemV1 {
  item_id: number;
  project_id: string;
  evaluation_id: string;
  company: string;
  stage: number | null;
  stage_label: string;
  sector: string | null;
  svi: number | null;
  evidence_confidence: number | null;
  verification: string;
  verification_level: number;
  gaps_count: number;
  delta: number | null;
  decision: CohortRow["decision"];
  review_status: CohortRow["reviewStatus"];
  shortlisted: boolean;
  weighted_score: number | null;
  overrides_count: number;
  risk_flags: CohortRow["riskFlags"];
  status: CohortRow["status"];
  scored_at: string | null;
}

/** A BlockID Cohort row → the public item. Private notes, reviewer names and the decision log never leave. */
export function toPublicCohortItem(row: CohortRow): PublicCohortItemV1 {
  return {
    item_id: row.itemId,
    project_id: row.projectId,
    evaluation_id: row.evaluationId,
    company: row.company,
    stage: row.stage,
    stage_label: row.stageLabel,
    sector: row.sector,
    svi: row.svi,
    evidence_confidence: row.confidence,
    verification: row.verification,
    verification_level: row.verificationLevel,
    gaps_count: row.gapsCount,
    delta: row.delta,
    decision: row.decision,
    review_status: row.reviewStatus,
    shortlisted: row.shortlisted,
    weighted_score: row.weightedScore,
    overrides_count: row.overridesCount,
    risk_flags: row.riskFlags,
    status: row.status,
    scored_at: row.scoredAt,
  };
}

export interface PublicSnapshotV1 {
  id: string;
  taken_at: string;
  reason: CohortSnapshot["reason"];
  weights_version: number;
  summary: CohortSnapshot["summary"];
  rows: Array<{ project_id: string; item_id: number; svi: number | null; evidence_confidence: number | null; verification_level: number; gaps_count: number | null; dims: CohortSnapshot["rows"][number]["dims"]; status: CohortSnapshot["rows"][number]["status"] }>;
}

/** A cohort snapshot → public (created_by dropped). */
export function toPublicSnapshot(s: CohortSnapshot): PublicSnapshotV1 {
  return {
    id: s.id,
    taken_at: s.takenAt,
    reason: s.reason,
    weights_version: s.weightsVersion,
    summary: s.summary,
    rows: s.rows.map((r) => ({ project_id: r.project_id, item_id: r.item_id, svi: r.svi, evidence_confidence: r.evidence_confidence, verification_level: r.verification_level, gaps_count: r.gaps_count, dims: r.dims, status: r.status })),
  };
}

export interface PublicCompanyV1 {
  project_id: string;
  company: string;
  slug: string | null;
  stage_label: string;
  sector: string;
  svi: number | null;
  svi_band: AssessmentCardData["sviBand"];
  evidence_confidence: number;
  verification: AssessmentCardData["verification"];
  pending_dims: number;
  unverified_material_claims: number;
  top_strength: AssessmentCardData["topStrength"];
  top_gap: AssessmentCardData["topGap"];
  benchmark: AssessmentCardData["benchmark"] | null;
  methodology_version: string;
  last_updated: string;
}

/** Assessment Card data → public (the card is already PII-free; the name is the company's). */
export function toPublicCompany(projectId: string, slug: string | null, card: AssessmentCardData): PublicCompanyV1 {
  return {
    project_id: projectId,
    company: card.startupName,
    slug,
    stage_label: card.stageLabel,
    sector: card.sector,
    svi: card.svi,
    svi_band: card.sviBand,
    evidence_confidence: card.evidenceConfidence,
    verification: card.verification,
    pending_dims: card.pendingDims,
    unverified_material_claims: card.unverifiedMaterialClaims,
    top_strength: card.topStrength,
    top_gap: card.topGap,
    benchmark: card.benchmark ?? null,
    methodology_version: card.methodologyVersion,
    last_updated: card.lastUpdated,
  };
}

// ─── Loaders ────────────────────────────────────────────────────────────────

/** Batch ids the user is an explicit member of (0423); [] before the migration. */
async function memberBatchIds(userId: string): Promise<Map<string, BatchRole>> {
  const out = new Map<string, BatchRole>();
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  try {
    const { data, error } = await supabase.from("evaluation_batch_members").select("batch_id, role").eq("user_id", userId).limit(200);
    if (error) {
      if (!isMissingRelation(error)) console.error("[blockid:institutional] members read failed", error);
      return out;
    }
    for (const r of (data ?? []) as Row[]) {
      const role = String(r.role ?? "viewer");
      out.set(String(r.batch_id), role === "owner" || role === "reviewer" ? (role as BatchRole) : "viewer");
    }
  } catch {
    /* fail-soft */
  }
  return out;
}

/** The key owner's readable cohorts: created (owner) + member seats, newest first. */
export async function listReadableBatches(userId: string, limit = 50): Promise<PublicCohortV1[]> {
  const [own, members] = await Promise.all([listBatches(userId, limit), memberBatchIds(userId)]);
  const out: PublicCohortV1[] = own.map((b) => toPublicCohort(b, "owner"));
  const seen = new Set(own.map((b) => b.id));
  for (const [batchId, role] of members) {
    if (seen.has(batchId)) continue;
    const b = await getBatchById(batchId);
    if (b) {
      out.push(toPublicCohort(b, role));
      seen.add(batchId);
    }
  }
  return out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, limit);
}

export type CohortLoad = { ok: true; cohort: PublicCohortV1; items: PublicCohortItemV1[] } | { ok: false; error: "not_found" | "unavailable" };

/** A cohort + its items for a key owner with at least a viewer seat; 404 otherwise. */
export async function loadCohortForKey(batchId: string, userId: string): Promise<CohortLoad> {
  const access = await assertBatchRole(batchId, userId, "viewer");
  if (!access.ok) return { ok: false, error: access.error === "unavailable" ? "unavailable" : "not_found" };
  const { rows } = await loadBlockIdCohortRows(access.batch, userId);
  return { ok: true, cohort: toPublicCohort(access.batch, access.role), items: rows.map(toPublicCohortItem) };
}

export type SnapshotsLoad = { ok: true; cohort: PublicCohortV1; snapshots: PublicSnapshotV1[] } | { ok: false; error: "not_found" | "unavailable" };

export async function loadCohortSnapshotsForKey(batchId: string, userId: string, limit = 20): Promise<SnapshotsLoad> {
  const access = await assertBatchRole(batchId, userId, "viewer");
  if (!access.ok) return { ok: false, error: access.error === "unavailable" ? "unavailable" : "not_found" };
  const snapshots = await listCohortSnapshots(batchId, limit);
  return { ok: true, cohort: toPublicCohort(access.batch, access.role), snapshots: snapshots.map(toPublicSnapshot) };
}

/**
 * May the key owner read this company? An `evaluations` row of theirs on the
 * project, or a batch they created / sit on that holds an item for it.
 */
export async function keyOwnerMayReadProject(projectId: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  try {
    const ev = await supabase.from("evaluations").select("id").eq("project_id", projectId).eq("evaluator_user_id", userId).limit(1);
    if (!ev.error && (ev.data ?? []).length > 0) return true;
  } catch {
    /* fall through to the batch check */
  }
  try {
    const own = await supabase.from("evaluation_batches").select("id").eq("user_id", userId).limit(200);
    const ids = new Set<string>(((own.data ?? []) as Row[]).map((r) => String(r.id)));
    for (const id of (await memberBatchIds(userId)).keys()) ids.add(id);
    if (ids.size === 0) return false;
    const items = await supabase.from("evaluation_batch_items").select("id").eq("project_id", projectId).in("batch_id", [...ids]).limit(1);
    return !items.error && (items.data ?? []).length > 0;
  } catch {
    return false;
  }
}

export type CompanyLoad = { ok: true; company: PublicCompanyV1 } | { ok: false; error: "not_found" | "unavailable" };

/** The Assessment Card for a company the key owner evaluates, from the latest svi_snapshots analysis. */
export async function loadCompanyForKey(projectId: string, userId: string): Promise<CompanyLoad> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable" };
  if (!(await keyOwnerMayReadProject(projectId, userId))) return { ok: false, error: "not_found" };

  const project = await supabase.from("projects").select("id, name, slug, industry, verification_level").eq("id", projectId).maybeSingle();
  if (project.error || !project.data) return { ok: false, error: "not_found" };
  const p = project.data as Row;

  let snap = await supabase.from("svi_snapshots").select("analysis_json, evidence_confidence, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (snap.error && /column .* does not exist|could not find the .* column/i.test(snap.error.message ?? "")) {
    snap = await supabase.from("svi_snapshots").select("analysis_json, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  }
  const s = (snap.data ?? null) as Row | null;
  const analysis = s && s.analysis_json && typeof s.analysis_json === "object" && Array.isArray((s.analysis_json as { subs?: unknown }).subs) ? (s.analysis_json as SVIAnalysis) : null;
  if (!analysis) return { ok: false, error: "not_found" };

  const ctx = await loadAssessmentContext(projectId, analysis.stage, analysis.sector ?? (typeof p.industry === "string" ? p.industry : null));
  const stored = s ? Number(s.evidence_confidence) : NaN;
  const card = assessmentCardFromAnalysis(
    analysis,
    {
      name: String(p.name ?? "Startup"),
      sector: typeof p.industry === "string" && p.industry ? p.industry : null,
      verificationLevel: typeof p.verification_level === "number" ? p.verification_level : null,
      generatedAt: typeof s?.created_at === "string" ? s.created_at : null,
    },
    { benchmark: ctx.benchmark, evidenceConfidence: Number.isFinite(stored) ? stored : ctx.evidenceConfidence, unverifiedMaterialClaims: ctx.unverifiedMaterialClaims },
  );
  return { ok: true, company: toPublicCompany(projectId, typeof p.slug === "string" ? p.slug : null, card) };
}
