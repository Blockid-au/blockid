// GET /api/v1/institutional/cohorts/{id} — one cohort + its items (G21
// P3-B). Items carry project id, company, stage, sector, SVI, evidence
// confidence, verification, gaps count, decision, shortlist, review status,
// weighted score, override count, risk flags — never a private note, a
// reviewer's name or the decision log.
//
//   404 for an unknown id AND for a cohort the key owner has no seat on
//   (the id space stays non-enumerable). 503 before migration 0322.

import { NextResponse } from "next/server";
import { authenticateInstitutional, institutionalError, institutionalOk, notFound, parseId } from "@/lib/api-v1/institutional";
import { loadCohortForKey } from "@/lib/api-v1/institutional-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  const id = parseId((await ctx.params).id);
  if (!id) return notFound("cohort");
  const load = await loadCohortForKey(id, auth.principal.userId);
  if (!load.ok) return load.error === "unavailable" ? institutionalError(503, "unavailable", "Cohorts are not available on this deployment yet.") : notFound("cohort");
  return institutionalOk(
    request,
    auth.principal,
    { data: { cohort: load.cohort, items: load.items }, meta: { items: load.items.length } },
    { resource: "cohort", resourceId: id, detail: { items: load.items.length, role: load.cohort.role } },
  );
}
