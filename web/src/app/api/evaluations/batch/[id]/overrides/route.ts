// GET | POST /api/evaluations/batch/[id]/overrides — human overrides with a
// reason code on a cohort item (G21 P2-B; migration 0423 assessment_overrides).
//
//   GET   → 200 { ok, overrides: OverrideRow[] }                     (viewer+)
//   POST  { item_id, dimension, to_value, reason_code, note? }
//         → 201 { ok, override }                                     (reviewer+)
//
// The canonical score is never changed: the row is appended with the model
// score on screen as `from_value`; the cohort view shows model and human
// side by side. Audit `assessment.override` + FI `evaluator_reviewed`
// happen in lib/evaluations/overrides.ts.
//
//   401 · 403 viewer · 404 non-member / unknown batch / item not in batch ·
//   400 invalid body · 429 over 30/min · 503 before 0423.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { findBatchItem } from "@/lib/evaluations/cohort-rows-loader";
import { createOverride, listBatchOverrides, overrideInputSchema } from "@/lib/evaluations/overrides";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const OVERRIDES_PER_MINUTE = 30;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

function deny(access: { error: "not_found" | "forbidden" | "unavailable" }) {
  if (access.error === "forbidden") return json({ ok: false, error: "forbidden", message: "Viewers can read the cohort but not change it" }, 403);
  if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
  return json({ ok: false, error: "not_found" }, 404);
}

async function getHandler(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "viewer");
  if (!access.ok) return deny(access);
  const { rows, available } = await listBatchOverrides(access.batch.id);
  return json({ ok: true, available, overrides: rows });
}

async function postHandler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "reviewer");
  if (!access.ok) return deny(access);

  const limited = enforceRateLimit("batch-override", user.id, request, OVERRIDES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;
  const parsed = overrideInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  const item = await findBatchItem(access.batch, parsed.data.item_id);
  if (!item) return json({ ok: false, error: "not_found", message: "That startup is not in this cohort" }, 404);
  const fromValue = parsed.data.dimension === "total" ? item.sviTotal : (item.dimensionScores?.[parsed.data.dimension] ?? null);

  const result = await createOverride({
    batchId: access.batch.id,
    reviewer: { id: user.id, email: user.email, plan: user.plan ?? null },
    item: { id: item.id, projectId: item.projectId, fromValue },
    body: parsed.data,
  });
  if (!result.ok) {
    const status = result.error === "unavailable" ? 503 : result.error === "item_not_in_batch" ? 404 : 500;
    return json({ ok: false, error: result.error, message: result.message }, status);
  }
  return json({ ok: true, override: result.override, canonical_unchanged: true }, 201);
}

export const GET = getHandler;
export const POST = apiRoute({ route: "api/evaluations/batch/[id]/overrides/route.ts", method: "POST" }, postHandler);
