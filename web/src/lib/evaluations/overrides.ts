// overrides — DB layer for human overrides on a cohort item (G21 P2-B;
// migration 0423 `assessment_overrides`). Pure parts live in
// ./overrides-shared.ts (re-exported here for server callers).
//
// Every write audits `assessment.override` and emits the FI
// `evaluator_reviewed` event; nothing here ever touches the canonical SVI.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { emitFiEvent } from "@/lib/analytics/fi-events";
import { isMissingRelation } from "@/lib/investors/mandates";
import { mapOverrideRow, type OverrideInput, type OverrideRow } from "./overrides-shared";

export * from "./overrides-shared";

type Row = Record<string, unknown>;


/** All overrides of a batch, newest first (empty before 0423). */
export async function listBatchOverrides(batchId: string): Promise<{ rows: OverrideRow[]; available: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], available: false };
  const { data, error } = await supabase
    .from("assessment_overrides")
    .select("id, batch_id, item_id, project_id, dimension, from_value, to_value, reason_code, note, reviewer_id, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:overrides] list failed", error);
    return { rows: [], available: !isMissingRelation(error) };
  }
  const rows = ((data ?? []) as Row[]).map(mapOverrideRow);
  const ids = [...new Set(rows.map((r) => r.reviewerId).filter((v): v is string => !!v))];
  if (ids.length) {
    const { data: users } = await supabase.from("app_users").select("id, display_name, email").in("id", ids);
    const names = new Map<string, string>();
    for (const u of (users ?? []) as Row[]) names.set(String(u.id), String(u.display_name ?? u.email ?? ""));
    for (const r of rows) if (r.reviewerId && names.has(r.reviewerId)) r.reviewerName = names.get(r.reviewerId) ?? null;
  }
  return { rows, available: true };
}

export type CreateOverrideResult = { ok: true; override: OverrideRow } | { ok: false; error: "unavailable" | "item_not_in_batch" | "db_error"; message: string };

/**
 * Append one override. `item` is the batch item the caller already resolved
 * (id, project id, the model score on screen for `from_value`).
 */
export async function createOverride(input: {
  batchId: string;
  reviewer: { id: string; email?: string | null; plan?: string | null };
  item: { id: number; projectId: string; fromValue: number | null } | null;
  body: OverrideInput;
}): Promise<CreateOverrideResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Database not configured" };
  if (!input.item) return { ok: false, error: "item_not_in_batch", message: "That startup is not in this cohort" };
  const note = (input.body.note ?? "").trim() || null;
  const { data, error } = await supabase
    .from("assessment_overrides")
    .insert({
      batch_id: input.batchId,
      item_id: input.item.id,
      project_id: input.item.projectId,
      dimension: input.body.dimension,
      from_value: input.item.fromValue,
      to_value: input.body.to_value,
      reason_code: input.body.reason_code,
      note,
      reviewer_id: input.reviewer.id,
    })
    .select("id, batch_id, item_id, project_id, dimension, from_value, to_value, reason_code, note, reviewer_id, created_at")
    .maybeSingle();
  if (error || !data) {
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Overrides are not available yet (migration 0423 pending)" };
    return { ok: false, error: "db_error", message: error?.message ?? "Override failed" };
  }
  const override = mapOverrideRow(data as Row);
  void appendAudit({
    user_id: input.reviewer.id,
    actor: "user",
    action: "assessment.override",
    resource_type: "evaluation_batch_item",
    resource_id: String(input.item.id),
    detail: { batch_id: input.batchId, override_id: override.id, project_id: input.item.projectId, dimension: override.dimension, from: override.fromValue, to: override.toValue, reason_code: override.reasonCode, has_note: !!note },
  }).catch(() => {});
  emitFiEvent("evaluator_reviewed", {
    organisation: input.reviewer.id,
    startup: input.item.projectId,
    plan: input.reviewer.plan ?? null,
    channel: "cohort",
    userId: input.reviewer.id,
    email: input.reviewer.email ?? null,
    action: "override",
    dimension: override.dimension,
    reason_code: override.reasonCode,
    batch_id: input.batchId,
  });
  return { ok: true, override };
}
