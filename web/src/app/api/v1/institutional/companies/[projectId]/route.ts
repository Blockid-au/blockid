// GET /api/v1/institutional/companies/{projectId} — the Assessment Card for
// one company the key owner evaluates (G21 P3-B): SVI + band, evidence
// confidence, BlockID Verified level, pending dimensions, unverified
// material claims, top strength / gap and the published benchmark (stage ×
// sector segment when published, with n + band).
//
//   404 unless the key owner has an `evaluations` row on the project or a
//   cohort seat whose items include it — and for an unknown id (same body).
//   Consent tiers: the card is the evaluator-visible summary the dossier
//   header shows; evidence records and claims are NOT on this endpoint.

import { NextResponse } from "next/server";
import { authenticateInstitutional, institutionalError, institutionalOk, notFound, parseId } from "@/lib/api-v1/institutional";
import { loadCompanyForKey } from "@/lib/api-v1/institutional-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const auth = await authenticateInstitutional(request);
  if (!auth.ok) return auth.response;
  const id = parseId((await ctx.params).projectId);
  if (!id) return notFound("company");
  const load = await loadCompanyForKey(id, auth.principal.userId);
  if (!load.ok) return load.error === "unavailable" ? institutionalError(503, "unavailable", "Company reads are not available on this deployment yet.") : notFound("company");
  return institutionalOk(request, auth.principal, { data: load.company }, { resource: "company", resourceId: id, detail: { svi: load.company.svi, benchmark_n: load.company.benchmark?.n ?? null } });
}
