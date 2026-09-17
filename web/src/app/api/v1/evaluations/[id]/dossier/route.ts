// GET /api/v1/evaluations/{id}/dossier — the Investor Dossier (ReportV2 +
// blocks) for one evaluation, through the SAME loader the workspace page
// and /api/evaluations/{id}/dossier use (G14-S38 Evaluator API v1).
//
//   Auth   Bearer bk_live_… + scope `evaluations:read` (lib/api-v1/auth.ts).
//   200    { ok, dossier: DossierView }  — consent masking identical to the
//          UI: `loadDossier(id, keyOwner)` projects the evidence block by
//          `evaluations.consent_tier` and the assessment block by the
//          viewer role; nothing is filtered here.
//   404    not_found — unknown id, OR a row whose evaluator is not the key
//          owner (never 403: the id must not confirm a row exists), OR an
//          evaluator seat whose persona lapsed (same gate as the page).
//
// The view is audited as `dossier.viewed` (surface "api") so the dossier's
// "Δ since last view" and the audit trail see API reads too. Read-only →
// not wrapped by apiRoute() (src/lib/audit/coverage.test.ts).

import type { NextRequest } from "next/server";
import { authenticateV1, v1AuthFailureResponse, v1Error, v1Ok } from "@/lib/api-v1/auth";
import { isEvaluatorUser } from "@/lib/evaluations";
import { loadDossier } from "@/lib/evaluations/dossier";
import { auditDossierView } from "@/lib/evaluations/dossier-audit";
import { auditInput } from "@/lib/api-v1/dossier-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await authenticateV1(request, "evaluations:read");
  if (!auth.ok) return v1AuthFailureResponse(auth);
  const principal = auth.principal;
  const id = (await ctx.params).id;
  const notFound = () => v1Error(404, "not_found", "Evaluation not found.");
  if (!ID_RE.test(id)) return notFound();

  const [dossier, isEvaluator] = await Promise.all([
    loadDossier(id, principal.userId),
    isEvaluatorUser({ id: principal.userId, plan: principal.plan, accountType: principal.accountType }),
  ]);
  if (!dossier) return notFound();
  // The API is the evaluator's channel: a claimed founder reads their preview
  // in the workspace, not through an evaluator key.
  if (dossier.viewer.role !== "assessor" || !isEvaluator) return notFound();

  auditDossierView(auditInput(principal.userId, dossier));
  return v1Ok({ ok: true, dossier }, principal);
}
