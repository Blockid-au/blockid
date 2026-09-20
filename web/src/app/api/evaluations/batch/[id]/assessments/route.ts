// POST | PATCH /api/evaluations/batch/[id]/assessments — bulk decision set
// on a cohort (G13-W5-D3, S-D3; BA spec §A.5 P2, Appendix 1).
//
//   { evaluation_ids: string[], decision?: "pass"|"track"|"proceed"|null, conviction?: 1..5|null }
//        → 200 { ok, updated, created, skipped[], failed[] }
//
// G21 P2-B: owner / reviewer seats (assertBatchRole — a viewer → 403, a
// non-member → 404); the body may carry `reason_code`, which travels on the
// audit row and the FI `decision_recorded` event. Ids that
// are not items of THIS batch are skipped, never written. Each row is a
// DRAFT save through the S-D2 write path (own seat, batch snapshot_id);
// one `assessment.bulk_set` audit row carries the id list.
//
//   401 · 404 · 400 invalid body · 429 over 10/min · 503 while 0392 is
//   not applied.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBatchItems } from "@/lib/evaluations/batch";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { bulkDecisionSchema, bulkSetDecisions } from "@/lib/evaluations/cohort-decisions";
import { resolveActingOrg } from "@/lib/investor/organisations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const BULK_SETS_PER_MINUTE = 10;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function projectIdsFor(evaluationIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const supabase = getSupabaseAdmin();
  if (!supabase || evaluationIds.length === 0) return out;
  const { data } = await supabase.from("evaluations").select("id, project_id").in("id", evaluationIds);
  for (const r of (data ?? []) as Array<Record<string, unknown>>) out.set(String(r.id), String(r.project_id ?? ""));
  return out;
}

async function handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "reviewer");
  if (!access.ok) {
    if (access.error === "forbidden") return json({ ok: false, error: "forbidden", message: "Viewers can read the cohort but not record decisions" }, 403);
    if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
    return json({ ok: false, error: "not_found" }, 404);
  }
  const batch = access.batch;

  const limited = enforceRateLimit("batch-bulk-decision", user.id, request, BULK_SETS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 32 * 1024);
  if (!body.ok) return body.response;
  const parsed = bulkDecisionSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  const items = await listBatchItems(batch.id);
  const projects = await projectIdsFor(items.map((i) => i.evaluationId));
  const org = await resolveActingOrg(user.id).catch(() => null);
  const result = await bulkSetDecisions({
    batchId: batch.id,
    userId: user.id,
    orgId: org?.id ?? null,
    actor: { plan: user.plan ?? null, email: user.email },
    items: items.filter((i) => projects.get(i.evaluationId)).map((i) => ({ evaluationId: i.evaluationId, projectId: projects.get(i.evaluationId) as string, snapshotId: i.snapshotId })),
    body: parsed.data,
  });
  if (result.unavailable) return json({ ok: false, error: "unavailable", message: "Assessments are not available on this environment yet" }, 503);
  return json({ ok: true, updated: result.updated, created: result.created, skipped: result.skipped, failed: result.failed });
}

export const POST = apiRoute({ route: "api/evaluations/batch/[id]/assessments/route.ts", method: "POST" }, handler);
export const PATCH = apiRoute({ route: "api/evaluations/batch/[id]/assessments/route.ts", method: "PATCH" }, handler);
