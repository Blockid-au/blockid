// cohort-rows-loader — assembles the BlockID Cohort rows from the DB (G21
// P2-B). Server-only; the pure row model is ./cohort-rows.ts.
//
//   loadBlockIdCohortRows(batch, viewerId)
//     1. ./batch.ts loadCohortRows(batch)         → the T0272 rows (SVI, dims,
//                                                   Δ baseline, report links)
//     2. evaluation_batch_items (0423 columns)     → shortlisted / review
//                                                   status / reviewer (fail-
//                                                   soft: defaults before 0423)
//     3. svi_snapshots (analysis_json, evidence_confidence) + projects.
//        verification_level + claims (conflicting) → CohortAnalysisInput
//                                                   per project (fail-soft)
//     4. evaluation_assessments                    → the VIEWER's latest
//                                                   decision per evaluation
//                                                   + the batch-wide decision
//                                                   log (decision / conviction
//                                                   / status / version only —
//                                                   never private_notes)
//     5. assessment_overrides                      → ./overrides.ts
//     6. getCohortDeltas(batch.id)                 → P2-A's snapshot Δ when
//                                                   its provider is registered
//
// Every step degrades to "no data" rather than failing the page.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadCohortRows } from "./batch";
import { loadCohortDecisions } from "./cohort-decisions";
import { listBatchOverrides } from "./overrides";
import { latestSnapshots } from "./cohort-snapshots";
import { deltaByProject } from "./cohort-delta";
import { assessmentCardFromAnalysis } from "@/lib/svi/assessment-card";
import { evidenceConfidenceFromAnalysis } from "@/lib/svi/evidence-confidence";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { COHORT_DECISIONS, type CohortDecision, type CohortRow as BatchCohortRow, type CohortRowDecision, type EvaluationBatch } from "./batch-shared";
import {
  buildCohortRows,
  getCohortDeltas,
  registerCohortDeltaProvider,
  REVIEW_STATUSES,
  type AssessmentLogInput,
  type CohortAnalysisInput,
  type CohortItemInput,
  type CohortRow,
  type ReviewStatus,
} from "./cohort-rows";

type Row = Record<string, unknown>;
type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42703" || /column .* does not exist|could not find the .* column/i.test(String(e.message ?? ""));
}

interface ItemExtra {
  snapshotId: string | null;
  shortlisted: boolean;
  reviewStatus: ReviewStatus;
  reviewerId: string | null;
}

/** The 0423 item columns, keyed by item id. Defaults before the migration. */
export async function loadItemExtras(supabase: Db, batchId: string): Promise<Map<number, ItemExtra>> {
  const out = new Map<number, ItemExtra>();
  const first = await supabase.from("evaluation_batch_items").select("id, snapshot_id, shortlisted, review_status, reviewer_id").eq("batch_id", batchId);
  let data: Row[] | null = first.error ? null : ((first.data ?? []) as Row[]);
  if (first.error && isMissingColumn(first.error)) {
    const retry = await supabase.from("evaluation_batch_items").select("id, snapshot_id").eq("batch_id", batchId);
    data = retry.error ? null : ((retry.data ?? []) as Row[]);
  }
  if (!data) return out;
  for (const r of data) {
    const status = String(r.review_status ?? "unreviewed");
    out.set(Number(r.id), {
      snapshotId: r.snapshot_id == null ? null : String(r.snapshot_id),
      shortlisted: r.shortlisted === true,
      reviewStatus: (REVIEW_STATUSES as readonly string[]).includes(status) ? (status as ReviewStatus) : "unreviewed",
      reviewerId: r.reviewer_id == null ? null : String(r.reviewer_id),
    });
  }
  return out;
}

async function loadNames(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return out;
  const { data } = await supabase.from("app_users").select("id, display_name, email").in("id", wanted);
  for (const r of (data ?? []) as Row[]) out.set(String(r.id), String(r.display_name ?? r.email ?? ""));
  return out;
}

/** Pure: one project's analysis inputs from its snapshot row + verification level + conflicting count. */
export function analysisInputFromSnapshot(snapshot: { analysis_json?: unknown; evidence_confidence?: unknown } | null, verificationLevel: number | null, conflictingClaims: number | null): CohortAnalysisInput {
  const out: CohortAnalysisInput = { evidenceConfidence: null, verificationLevel, pendingDims: null, unverifiedMaterialClaims: null, conflictingClaims };
  if (!snapshot) return out;
  const stored = num(snapshot.evidence_confidence);
  const analysis = snapshot.analysis_json && typeof snapshot.analysis_json === "object" && Array.isArray((snapshot.analysis_json as { subs?: unknown }).subs) ? (snapshot.analysis_json as SVIAnalysis) : null;
  if (analysis) {
    try {
      const card = assessmentCardFromAnalysis(analysis, { name: "", verificationLevel });
      out.pendingDims = card.pendingDims;
      out.unverifiedMaterialClaims = card.unverifiedMaterialClaims;
      out.evidenceConfidence = stored ?? card.evidenceConfidence;
    } catch {
      try {
        out.evidenceConfidence = stored ?? evidenceConfidenceFromAnalysis(analysis, verificationLevel);
      } catch {
        out.evidenceConfidence = stored;
      }
    }
  } else {
    out.evidenceConfidence = stored;
  }
  return out;
}

/** Per project: snapshot-derived confidence / gaps + verification level + conflicting claims. */
export async function loadAnalyses(supabase: Db, items: ReadonlyArray<{ projectId: string; snapshotId: string | null }>): Promise<Record<string, CohortAnalysisInput>> {
  const out: Record<string, CohortAnalysisInput> = {};
  const projectIds = [...new Set(items.map((i) => i.projectId).filter(Boolean))];
  const snapshotIds = [...new Set(items.map((i) => i.snapshotId).filter((v): v is string => !!v))];
  if (projectIds.length === 0) return out;

  const loadLevels = async (): Promise<Row[]> => {
    try {
      const r = await supabase.from("projects").select("id, verification_level").in("id", projectIds);
      return (r.error ? [] : r.data ?? []) as Row[];
    } catch {
      return [];
    }
  };
  const loadConflicts = async (): Promise<Row[] | null> => {
    try {
      const r = await supabase.from("claims").select("project_id").in("project_id", projectIds).eq("assessment_status", "conflicting");
      return (r.error ? null : r.data ?? []) as Row[] | null;
    } catch {
      return null;
    }
  };
  const loadSnapshots = async (): Promise<Row[]> => {
    if (snapshotIds.length === 0) return [];
    try {
      const r = await supabase.from("svi_snapshots").select("id, project_id, analysis_json, evidence_confidence").in("id", snapshotIds);
      if (r.error && isMissingColumn(r.error)) {
        const retry = await supabase.from("svi_snapshots").select("id, project_id, analysis_json").in("id", snapshotIds);
        return (retry.error ? [] : retry.data ?? []) as Row[];
      }
      return (r.error ? [] : r.data ?? []) as Row[];
    } catch {
      return [];
    }
  };
  const [levels, conflicts, snapshots] = await Promise.all([loadLevels(), loadConflicts(), loadSnapshots()]);

  const levelBy = new Map<string, number | null>();
  for (const r of levels) levelBy.set(String(r.id), num(r.verification_level));
  const conflictBy = new Map<string, number>();
  if (conflicts) for (const r of conflicts) conflictBy.set(String(r.project_id), (conflictBy.get(String(r.project_id)) ?? 0) + 1);
  const snapBy = new Map<string, Row>();
  for (const r of snapshots) snapBy.set(String(r.id), r);

  for (const i of items) {
    if (!i.projectId || out[i.projectId]) continue;
    const snap = i.snapshotId ? snapBy.get(i.snapshotId) ?? null : null;
    out[i.projectId] = analysisInputFromSnapshot(snap, levelBy.get(i.projectId) ?? null, conflicts ? conflictBy.get(i.projectId) ?? 0 : null);
  }
  return out;
}

/** Every seat's assessment versions on the batch's evaluations — decision fields only. */
export async function loadAssessmentLog(supabase: Db, evaluationIds: string[]): Promise<AssessmentLogInput[]> {
  if (evaluationIds.length === 0) return [];
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select("evaluation_id, version, status, decision, conviction, assessor_user_id, updated_at")
    .in("evaluation_id", evaluationIds.slice(0, 500))
    .order("updated_at", { ascending: false })
    .limit(3000);
  if (error || !data) return [];
  const rows = data as Row[];
  const names = await loadNames(supabase, rows.map((r) => String(r.assessor_user_id ?? "")));
  return rows.map((r) => {
    const decision = typeof r.decision === "string" && (COHORT_DECISIONS as readonly string[]).includes(r.decision) ? (r.decision as CohortDecision) : null;
    const assessorId = r.assessor_user_id == null ? null : String(r.assessor_user_id);
    return {
      evaluationId: String(r.evaluation_id),
      version: Number(r.version ?? 1) || 1,
      status: r.status === "submitted" ? "submitted" : "draft",
      decision,
      conviction: typeof r.conviction === "number" ? r.conviction : null,
      assessorId,
      assessorName: assessorId ? names.get(assessorId) ?? null : null,
      updatedAt: String(r.updated_at ?? ""),
    };
  });
}

export interface BlockIdCohortLoad {
  rows: CohortRow[];
  /** Raw batch rows (for routes that still need the T0272 shape). */
  baseRows: BatchCohortRow[];
  overridesAvailable: boolean;
}

/** The BlockID Cohort rows for `batch`, decisions as seen by `viewerId`. */
// P2-A ↔ P2-B wiring (merge session): the Δ column reads the two latest
// cohort snapshots (SVI latest − previous per project); `{}` when fewer than
// two snapshots exist, so the row keeps its batch.ts baseline.
registerCohortDeltaProvider(async (batchId) => {
  const { latest, previous } = await latestSnapshots(batchId);
  if (!latest || !previous) return {};
  const out: Record<string, number | null> = {};
  for (const [projectId, d] of deltaByProject(latest, previous)) out[projectId] = d.svi;
  return out;
});

export async function loadBlockIdCohortRows(batch: EvaluationBatch, viewerId: string): Promise<BlockIdCohortLoad> {
  const supabase = getSupabaseAdmin();
  const baseRows = await loadCohortRows(batch);
  if (!supabase) {
    const items = baseRows.map<CohortItemInput>((r) => ({ ...r, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null }));
    return { rows: buildCohortRows(items, {}, {}, [], batch.rubricWeights), baseRows, overridesAvailable: false };
  }
  const evaluationIds = baseRows.map((r) => r.evaluationId);
  const [extras, decisions, overrides, log, deltas] = await Promise.all([
    loadItemExtras(supabase, batch.id),
    loadCohortDecisions(evaluationIds, viewerId).catch(() => new Map<string, CohortRowDecision>()),
    listBatchOverrides(batch.id).catch(() => ({ rows: [], available: false })),
    loadAssessmentLog(supabase, evaluationIds).catch(() => []),
    getCohortDeltas(batch.id),
  ]);
  const reviewerNames = await loadNames(supabase, [...extras.values()].map((e) => e.reviewerId ?? ""));
  const items = baseRows.map<CohortItemInput>((r) => {
    const e = extras.get(r.itemId);
    return {
      ...r,
      snapshotId: e?.snapshotId ?? null,
      shortlisted: e?.shortlisted ?? false,
      reviewStatus: e?.reviewStatus ?? "unreviewed",
      reviewerId: e?.reviewerId ?? null,
      reviewerName: e?.reviewerId ? reviewerNames.get(e.reviewerId) ?? null : null,
    };
  });
  const analyses = await loadAnalyses(supabase, items.map((i) => ({ projectId: i.projectId, snapshotId: i.snapshotId }))).catch(() => ({}));
  const assessments: Record<string, CohortRowDecision> = {};
  for (const [id, d] of decisions) assessments[id] = d;
  return { rows: buildCohortRows(items, analyses, assessments, overrides.rows, batch.rubricWeights, deltas, log), baseRows, overridesAvailable: overrides.available };
}

/** One item of a batch with what the routes need (id, project, model score for `from_value`). */
export async function findBatchItem(batch: EvaluationBatch, itemId: number): Promise<{ id: number; evaluationId: string; projectId: string; snapshotId: string | null; sviTotal: number | null; dimensionScores: Partial<Record<string, number>> | null } | null> {
  const rows = await loadCohortRows(batch);
  const r = rows.find((x) => x.itemId === itemId);
  if (!r) return null;
  const supabase = getSupabaseAdmin();
  let snapshotId: string | null = null;
  if (supabase) {
    const { data } = await supabase.from("evaluation_batch_items").select("snapshot_id").eq("id", itemId).eq("batch_id", batch.id).maybeSingle();
    snapshotId = (data as Row | null)?.snapshot_id == null ? null : String((data as Row).snapshot_id);
  }
  return { id: r.itemId, evaluationId: r.evaluationId, projectId: r.projectId, snapshotId, sviTotal: r.svi, dimensionScores: r.dimensionScores };
}
