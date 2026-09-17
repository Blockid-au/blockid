// /api/v1/evaluations/{id}/assessment — the key owner's Evaluator
// Assessment on one evaluation (G14-S38 Evaluator API v1).
//
//   GET       scope `evaluations:read`  → 200 { ok, available, assessment,
//             history } — the caller's own current row masked by role
//             (lib/evaluations/assessments.ts getAssessment — the same read
//             the workspace form does; the key owner IS the assessor, so the
//             assessor projection applies).
//   POST|PUT  scope `evaluations:write` → 200 { ok, assessment, created,
//             version, history }. Body = AssessmentDraft (Appendix 1):
//             every field optional; `status: "submitted"` submits (decision
//             + conviction required → 422). Both verbs delegate to
//             `upsertAssessment` — the S-D2 write lib — so the API cannot
//             bypass Zod validation, the draft-in-place / v(n+1) versioning,
//             the audit rows or the `assessment.submitted` webhook.
//
//   401 / 429 / 402 / 403 — lib/api-v1/auth.ts (bad key · budget · plan ·
//   scope) · 404 not_found for an unknown id, a row the key owner does not
//   evaluate (a founder-owned key sees 404, never the assessment — the id
//   must not confirm a row exists) or a lapsed evaluator persona · 400
//   invalid_body with Zod issue paths · 413 body > 64 kB · 503 while
//   migration 0392 is not applied.

import type { NextRequest } from "next/server";
import { authenticateV1, v1AuthFailureResponse, v1Error, v1Ok, type V1Principal } from "@/lib/api-v1/auth";
import { ASSESSMENT_BODY_MAX_BYTES, resolveAssessmentAccess, type AssessmentAccess } from "@/lib/evaluations/assessment-access";
import { assessmentDraftSchema, getAssessment, upsertAssessment, type AssessmentViewer, type AssessmentViewerRole, type AssessmentWriteError } from "@/lib/evaluations/assessments";
import { resolveActingOrg } from "@/lib/investor/organisations";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type Scope = "evaluations:read" | "evaluations:write";
type Resolved = { principal: V1Principal; access: AssessmentAccess } | { response: Response };

const notFound = () => v1Error(404, "not_found", "Evaluation not found.");

/** Auth + ownership in one step: the key owner must be the assessor on the row. */
async function resolve(request: NextRequest, ctx: Ctx, scope: Scope): Promise<Resolved> {
  const auth = await authenticateV1(request, scope);
  if (!auth.ok) return { response: v1AuthFailureResponse(auth) };
  const principal = auth.principal;
  const id = (await ctx.params).id;
  const access = await resolveAssessmentAccess(id, { id: principal.userId, plan: principal.plan, accountType: principal.accountType });
  // A claimed founder can read the shared projection in the workspace but the
  // evaluator API is the assessor's channel only (§C.1 — a founder-owned key
  // must never see another evaluator's assessment).
  if (!access || access.role !== "assessor") return { response: notFound() };
  return { principal, access };
}

function denied(r: Resolved): r is { response: Response } {
  return Object.hasOwn(r, "response");
}

const ASSESSOR: AssessmentViewerRole = "assessor";

function viewerOf(principal: V1Principal): AssessmentViewer {
  return { userId: principal.userId, role: ASSESSOR };
}

function invalidBody(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const detail = issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return v1Error(400, "invalid_body", "Assessment body failed validation.", { issues: detail });
}

function writeFailure(error: AssessmentWriteError, message: string) {
  const status = error === "unavailable" ? 503 : error === "missing_decision" || error === "missing_conviction" ? 422 : 500;
  return v1Error(status, error, message);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const r = await resolve(request, ctx, "evaluations:read");
  if (denied(r)) return r.response;
  const read = await getAssessment(r.access.evaluation.id, viewerOf(r.principal));
  return v1Ok({ ok: true, available: read.available, assessment: read.mine, history: read.history }, r.principal);
}

async function write(request: NextRequest, ctx: Ctx) {
  const r = await resolve(request, ctx, "evaluations:write");
  if (denied(r)) return r.response;
  const principal = r.principal;
  const access = r.access;

  const body = await readJsonBody(request, ASSESSMENT_BODY_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = assessmentDraftSchema.safeParse(body.body);
  if (!parsed.success) return invalidBody(parsed.error.issues);

  // S-D3: stamp the seat's acting org so same-org consensus reads find the row.
  const org = access.viaOrgId ? { id: access.viaOrgId } : await resolveActingOrg(principal.userId).catch(() => null);
  const ctxWrite = { evaluationId: access.evaluation.id, projectId: access.project.id, assessorUserId: principal.userId, orgId: org?.id ?? null, startupName: access.project.name };
  const result = await upsertAssessment(ctxWrite, parsed.data);
  if (!result.ok) return writeFailure(result.error, result.message);
  return v1Ok({ ok: true, assessment: result.assessment, created: result.created, version: result.version, history: result.history }, principal);
}

// Mutations are audited via apiRoute (src/lib/audit/api-route.ts).
export const POST = apiRoute({ route: "api/v1/evaluations/[id]/assessment/route.ts", method: "POST" }, write);
export const PUT = apiRoute({ route: "api/v1/evaluations/[id]/assessment/route.ts", method: "PUT" }, write);
