// GET /api/v1/institutional/cohorts/{id}/snapshots — the cohort's snapshots
// (G21 P3-B; P2-A `cohort_snapshots`), newest first: id, taken_at, reason,
// weights_version, the summary (n, scored, medians) and the per-project rows
// (svi, evidence confidence, verification level, gaps, dims). `created_by`
// never leaves.
//
//   Query  limit (1–100, default 20). 404 for an unknown id or no seat.

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateInstitutional, institutionalError, institutionalOk, limitParam, notFound, parseId, parseQuery } from "@/lib/api-v1/institutional";
import { loadCohortSnapshotsForKey } from "@/lib/api-v1/institutional-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUERY = z.object({ limit: limitParam.optional() });

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("cohort");
  const q = parseQuery(new URL(request.url).searchParams, QUERY);
  if (!q.ok) return q.response;
  const limit = q.value.limit ?? 20;
  const load = await loadCohortSnapshotsForKey(id, auth.principal.userId, limit);
  if (!load.ok) return load.error === "unavailable" ? institutionalError(503, "unavailable", "Cohorts are not available on this deployment yet.") : notFound("cohort");
  return institutionalOk(
    request,
    auth.principal,
    { data: { cohort: load.cohort, snapshots: load.snapshots }, meta: { count: load.snapshots.length, limit } },
    { resource: "cohort_snapshots", resourceId: id, detail: { count: load.snapshots.length } },
  );
}
