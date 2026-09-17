// GET /api/v1/evaluations — the key owner's "Startups I'm evaluating"
// (G14-S38 Evaluator API v1; docs/API-REFERENCE.md §9, /developers/api).
//
//   Auth   Authorization: Bearer bk_live_… with scope `evaluations:read`
//          (lib/api-v1/auth.ts): 401 unauthorized · 429 rate_limited ·
//          402 plan_required (api.access — Fund / Program) · 403
//          insufficient_scope.
//   Query  limit (1–100, default 25) · cursor (from a previous page) ·
//          industry · stage (0–12) · min_fit (0–100, primary mandate).
//   200    { ok, data: PublicEvaluationV1[], next_cursor, has_more, meta }
//   400    invalid_query
//
// Rows = the workspace list minus internals (lib/api-v1/evaluations.ts).
// Read-only → not wrapped by apiRoute() (mutation methods only —
// src/lib/audit/coverage.test.ts).

import type { NextRequest } from "next/server";
import { authenticateV1, v1AuthFailureResponse, v1Error, v1Ok } from "@/lib/api-v1/auth";
import { listEvaluationsV1, parseListQuery } from "@/lib/api-v1/evaluations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authenticateV1(request, "evaluations:read");
  if (!auth.ok) return v1AuthFailureResponse(auth);

  const parsed = parseListQuery(request.nextUrl.searchParams);
  if (!parsed.ok) return v1Error(400, "invalid_query", parsed.error);

  const page = await listEvaluationsV1(auth.principal.userId, parsed.query);
  return v1Ok({ ok: true, ...page }, auth.principal);
}
