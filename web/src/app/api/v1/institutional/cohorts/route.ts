// GET /api/v1/institutional/cohorts — the key owner's readable cohorts
// (G21 P3-B; docs/api/institutional.md). Read-only: the batches they
// created plus the ones they hold a reviewer / viewer seat on (0423).
//
//   Auth   Authorization: Bearer bk_live_… with scope `evaluations:read`;
//          the owner's plan must carry `api.access`; 600 reads / key / hour.
//   Query  limit (1–100, default 50).
//   200    { ok, data: PublicCohortV1[], meta: { count } } · ETag ·
//          Cache-Control: private, max-age=60 · one `institutional.read`
//          audit row per call.
//
// Read-only → not wrapped by apiRoute() (mutation methods only).

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateInstitutional, institutionalOk, limitParam, parseQuery } from "@/lib/api-v1/institutional";
import { listReadableBatches } from "@/lib/api-v1/institutional-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUERY = z.object({ limit: limitParam.optional() });

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  const q = parseQuery(new URL(request.url).searchParams, QUERY);
  if (!q.ok) return q.response;
  const limit = q.value.limit ?? 50;
  const data = await listReadableBatches(auth.principal.userId, limit);
  return institutionalOk(request, auth.principal, { data, meta: { count: data.length, limit } }, { resource: "cohorts", detail: { count: data.length } });
}
