// PATCH /api/evaluations/batch/[id]/items/[itemId] — the human review state
// of one cohort item (G21 P2-B; migration 0423 columns).
//
//   { shortlisted?: boolean, review_status?: "unreviewed"|"in_review"|"reviewed", reviewer_id?: uuid|null }
//        → 200 { ok, item: { id, shortlisted, review_status, reviewer_id } }
//
// Roles: owner / reviewer (assertBatchRole). A viewer → 403; a non-member
// or unknown batch → 404 (never enumerable). `reviewer_id` must be a seat
// on the batch (or the caller). Every change audits `cohort.item_updated`.
//
//   401 · 403 · 404 · 400 invalid body · 429 over 60/min · 503 before 0423.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { assertBatchRole, loadMemberRole } from "@/lib/evaluations/batch-members";
import { REVIEW_STATUSES } from "@/lib/evaluations/cohort-rows";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export const ITEM_PATCHES_PER_MINUTE = 60;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

export const itemPatchSchema = z
  .object({
    shortlisted: z.boolean().optional(),
    review_status: z.enum(REVIEW_STATUSES).optional(),
    reviewer_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((b) => b.shortlisted !== undefined || b.review_status !== undefined || b.reviewer_id !== undefined, { message: "Nothing to update", path: ["shortlisted"] });

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist|could not find the .* column/i.test(String(error.message ?? ""));
}

async function handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id, itemId: rawItem } = await params;
  const itemId = Number(rawItem);
  if (!Number.isInteger(itemId) || itemId <= 0) return json({ ok: false, error: "not_found" }, 404);

  const access = await assertBatchRole(id, user.id, "reviewer");
  if (!access.ok) {
    if (access.error === "forbidden") return json({ ok: false, error: "forbidden", message: "Viewers can read the cohort but not change it" }, 403);
    if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
    return json({ ok: false, error: "not_found" }, 404);
  }

  const limited = enforceRateLimit("batch-item-patch", user.id, request, ITEM_PATCHES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = itemPatchSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  if (parsed.data.reviewer_id && parsed.data.reviewer_id !== user.id && parsed.data.reviewer_id !== access.batch.userId) {
    const role = await loadMemberRole(access.batch.id, parsed.data.reviewer_id);
    if (!role || role === "viewer") return json({ ok: false, error: "invalid_reviewer", message: "The reviewer must be an owner or reviewer seat on this cohort" }, 400);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return json({ ok: false, error: "unavailable" }, 503);
  const patch: Record<string, unknown> = {};
  if (parsed.data.shortlisted !== undefined) patch.shortlisted = parsed.data.shortlisted;
  if (parsed.data.review_status !== undefined) patch.review_status = parsed.data.review_status;
  if (parsed.data.reviewer_id !== undefined) patch.reviewer_id = parsed.data.reviewer_id;

  const { data, error } = await supabase
    .from("evaluation_batch_items")
    .update(patch)
    .eq("id", itemId)
    .eq("batch_id", access.batch.id)
    .select("id, shortlisted, review_status, reviewer_id")
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return json({ ok: false, error: "unavailable", message: "Cohort review columns are missing on this server (migration 0423)" }, 503);
    return json({ ok: false, error: "db_error", message: error.message }, 500);
  }
  if (!data) return json({ ok: false, error: "not_found" }, 404);
  const row = data as Record<string, unknown>;

  void appendAudit({
    user_id: user.id,
    actor: "user",
    action: "cohort.item_updated",
    resource_type: "evaluation_batch_item",
    resource_id: String(itemId),
    detail: { batch_id: access.batch.id, role: access.role, ...patch },
  }).catch(() => {});

  return json({ ok: true, item: { id: Number(row.id), shortlisted: row.shortlisted === true, review_status: String(row.review_status ?? "unreviewed"), reviewer_id: row.reviewer_id == null ? null : String(row.reviewer_id) } });
}

export const PATCH = apiRoute({ route: "api/evaluations/batch/[id]/items/[itemId]/route.ts", method: "PATCH" }, handler);
