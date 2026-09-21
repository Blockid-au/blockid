// POST|DELETE /api/evaluations/batch/demo — the fictional demo cohort for
// buyer demos (G24-C; docs/plans/g24-report-readability-demo-cohort-2026-09-21.md § 2 C).
//
//   POST   → 201 { ok, created: true,  batch_id, batch, items: 5 }   first call
//            200 { ok, created: false, batch_id, batch, items }      idempotent — the
//                 existing demo cohort of this evaluator / organisation
//          Same evaluator entitlement as every cohort route (gateBatchRequest:
//          lp_export OR accelerator.cohort → 401 / 403 feature_locked with the
//          Program upgrade hint). No quota, no report row, no AI — the five
//          startups are scored from the demo register (lib/evaluations/
//          demo-cohort.ts). org_id = resolveActingOrg(user), never the body.
//   DELETE → 200 { ok, removed: true, removed_projects }   the OWNER removes the
//                 demo cohort and its five fictional startups
//            404 not_found when the caller has no demo cohort (or is not its
//                 creator — the id space stays non-enumerable)
//
//   503 unavailable (no DB) · 503 migration_pending (0436 not applied) ·
//   429 over 10 calls / minute · audited (apiRoute) + `cohort.demo_created`
//   / `cohort.demo_removed` audit rows.

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";
import { gateBatchRequest } from "@/lib/evaluations/batch-gate";
import { createDemoBatch, deleteDemoBatch, findDemoBatch } from "@/lib/evaluations/demo-cohort";
import { resolveActingOrg } from "@/lib/investor/organisations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const DEMO_CALLS_PER_MINUTE = 10;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function postHandler(request: Request) {
  const gate = await gateBatchRequest("api/evaluations/batch/demo");
  if (!gate.user) return gate.response;
  const user = gate.user;
  const limited = enforceRateLimit("batch-demo", user.id, request, DEMO_CALLS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const actingOrg = await resolveActingOrg(user.id).catch(() => null);
  const result = await createDemoBatch({ userId: user.id, orgId: actingOrg?.id ?? null });
  if (!result.ok) {
    const status = result.error === "create_failed" ? 500 : 503;
    return json({ ok: false, error: result.error, message: result.message }, status);
  }
  return json({ ok: true, created: result.created, batch_id: result.batch.id, batch: result.batch, items: result.items }, result.created ? 201 : 200);
}

async function deleteHandler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("batch-demo", user.id, request, DEMO_CALLS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  // Owner only: the demo batch the caller CREATED (an organisation seat's
  // demo belongs to whoever loaded it).
  const found = await findDemoBatch(user.id, null);
  if (!found.ok) return json({ ok: false, error: found.error }, 503);
  const batch = found.batch;
  if (!batch || batch.userId !== user.id) return json({ ok: false, error: "not_found" }, 404);

  const r = await deleteDemoBatch(batch, user.id);
  if (!r.ok) {
    const status = r.error === "unavailable" ? 503 : r.error === "not_demo" ? 404 : 500;
    return json({ ok: false, error: r.error, message: r.message }, status);
  }
  return json({ ok: true, removed: true, batch_id: batch.id, removed_projects: r.removedProjects });
}

export const POST = apiRoute({ route: "api/evaluations/batch/demo/route.ts", method: "POST" }, postHandler);
export const DELETE = apiRoute({ route: "api/evaluations/batch/demo/route.ts", method: "DELETE" }, deleteHandler);
