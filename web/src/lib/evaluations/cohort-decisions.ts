// Cohort decisions — the Program batch table's decision columns + bulk set
// (G13-W5-D3, S-D3; BA spec §A.5 P1 / P2 / P4, Appendix 1
// `POST /api/evaluations/batch/[id]/assessments`).
//
//   loadCohortDecisions   the batch OWNER's latest evaluation_assessments
//                         row per evaluation (decision, conviction, thesis
//                         fit, status) — one IN query, newest version first.
//   bulkSetDecisions      P2: for every selected evaluation the owner holds,
//                         save a DRAFT through `upsertAssessment` (the S-D2
//                         write path — versioning, 23505 retry, per-row
//                         `assessment.saved` audit) with the batch item's
//                         snapshot_id, then ONE `assessment.bulk_set` audit
//                         row carrying the id list. Nothing is submitted:
//                         a bulk set never fabricates a "submitted"
//                         verdict (submit needs conviction — S3).

import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { ASSESSMENT_DECISIONS, upsertAssessment, type AssessmentDecision } from "@/lib/evaluations/assessments";
import { COHORT_DECISIONS, type CohortRowDecision } from "./batch-shared";

type Row = Record<string, unknown>;

export const BULK_MAX_IDS = 200;

export const bulkDecisionSchema = z
  .object({
    evaluation_ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_MAX_IDS),
    decision: z.enum(ASSESSMENT_DECISIONS).nullable().optional(),
    conviction: z.number().int().min(1).max(5).nullable().optional(),
  })
  .strict()
  .refine((b) => b.decision !== undefined || b.conviction !== undefined, { message: "Set a decision and/or a conviction", path: ["decision"] });
export type BulkDecisionInput = z.infer<typeof bulkDecisionSchema>;

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find the table");
}

/** Latest (highest version) row per evaluation for ONE assessor seat. Empty map before 0392. */
export async function loadCohortDecisions(evaluationIds: string[], assessorUserId: string): Promise<Map<string, CohortRowDecision>> {
  const out = new Map<string, CohortRowDecision>();
  const supabase = getSupabaseAdmin();
  if (!supabase || evaluationIds.length === 0 || !assessorUserId) return out;
  const { data, error } = await supabase
    .from("evaluation_assessments")
    .select("evaluation_id, version, status, decision, conviction, thesis_fit_pct")
    .in("evaluation_id", evaluationIds.slice(0, 500))
    .eq("assessor_user_id", assessorUserId)
    .order("version", { ascending: false })
    .limit(2000);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:cohort-decisions] read failed", error);
    return out;
  }
  for (const r of (data ?? []) as Row[]) {
    const id = String(r.evaluation_id ?? "");
    if (!id || out.has(id)) continue; // newest version first
    const decision = typeof r.decision === "string" && (COHORT_DECISIONS as readonly string[]).includes(r.decision) ? (r.decision as AssessmentDecision) : null;
    const status = r.status === "submitted" ? "submitted" : "draft";
    const conviction = typeof r.conviction === "number" ? r.conviction : null;
    const fit = typeof r.thesis_fit_pct === "number" ? r.thesis_fit_pct : null;
    out.set(id, { decision, conviction, thesisFitPct: fit, assessmentStatus: status });
  }
  return out;
}

export interface BulkSetResult {
  updated: number;
  created: number;
  skipped: string[];
  failed: Array<{ evaluationId: string; error: string }>;
  unavailable: boolean;
}

/**
 * P2 bulk draft set. `items` = the batch's rows the caller owns
 * (evaluation → project + snapshot on file); ids outside it are `skipped`.
 */
export async function bulkSetDecisions(input: {
  batchId: string;
  userId: string;
  orgId?: string | null;
  items: ReadonlyArray<{ evaluationId: string; projectId: string; snapshotId: string | null }>;
  body: BulkDecisionInput;
}): Promise<BulkSetResult> {
  const byId = new Map(input.items.map((i) => [i.evaluationId, i]));
  const wanted = [...new Set(input.body.evaluation_ids)];
  const result: BulkSetResult = { updated: 0, created: 0, skipped: [], failed: [], unavailable: false };
  const touched: string[] = [];
  for (const id of wanted) {
    const item = byId.get(id);
    if (!item) {
      result.skipped.push(id);
      continue;
    }
    const patch: Parameters<typeof upsertAssessment>[1] = {};
    if (input.body.decision !== undefined) patch.decision = input.body.decision;
    if (input.body.conviction !== undefined) patch.conviction = input.body.conviction;
    if (item.snapshotId && /^[0-9a-f-]{36}$/i.test(item.snapshotId)) patch.snapshot_id = item.snapshotId;
    const r = await upsertAssessment({ evaluationId: id, projectId: item.projectId, assessorUserId: input.userId, orgId: input.orgId ?? null }, patch);
    if (!r.ok) {
      if (r.error === "unavailable") {
        result.unavailable = true;
        break;
      }
      result.failed.push({ evaluationId: id, error: r.error });
      continue;
    }
    touched.push(id);
    if (r.created) result.created += 1;
    else result.updated += 1;
  }
  if (touched.length) {
    void appendAudit({
      user_id: input.userId,
      actor: "user",
      action: "assessment.bulk_set",
      resource_type: "evaluation_batch",
      resource_id: input.batchId,
      detail: { evaluation_ids: touched, decision: input.body.decision ?? null, conviction: input.body.conviction ?? null, created: result.created, updated: result.updated, skipped: result.skipped.length, failed: result.failed.length },
    }).catch(() => {});
  }
  return result;
}
