// /api/evaluations/[id]/assessment/share — share the current assessment
// with the claimed founder, or revoke (G13-W4-D2, S-D2; Appendix 1, §C.1).
//
//   POST   body { fields: ("dimension_ratings"|"risks"|"questions_for_founder"|"shared_notes")[] }
//          → 200 { ok, shared_with_founder_at, shared_fields, founder_preview }
//          `founder_preview` is EXACTLY the projection the founder will read
//          (toFounderVisible) — the dialog shows it before and after.
//          Allow-list enforced by Zod AND by the lib; decision / conviction /
//          private_notes / valuation_view / thesis_fit_pct can never be ticked.
//          Audit `assessment.shared`.
//   DELETE → 200 { ok, revoked } — every version of this seat stops being
//          visible to the founder. Audit `assessment.share_revoked`.
//
//   401 · 404 (not the assessor, unknown id, lapsed evaluator, founder caller)
//   · 400 invalid body with issue paths · 409 nothing_to_share (no row yet)
//   · 429 · 503 while 0392 is not applied.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ASSESSMENT_WRITES_PER_MINUTE, resolveAssessmentAccess } from "@/lib/evaluations/assessment-access";
import { assessmentShareSchema, revokeAssessmentShare, shareAssessment } from "@/lib/evaluations/assessments";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });

async function POST_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  if (!access || access.role !== "assessor") return notFound();

  const limited = enforceRateLimit("evaluation-assessment", user.id, request, ASSESSMENT_WRITES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = assessmentShareSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const result = await shareAssessment({ evaluationId: access.evaluation.id, projectId: access.project.id, assessorUserId: user.id }, parsed.data.fields);
  if (!result.ok) {
    const status = result.error === "unavailable" ? 503 : result.error === "not_found" ? 409 : 500;
    return NextResponse.json({ ok: false, error: result.error === "not_found" ? "nothing_to_share" : result.error, message: result.message }, { status, headers: PRIVATE_JSON_HEADERS });
  }
  return NextResponse.json(
    {
      ok: true,
      shared_with_founder_at: result.assessment.sharedWithFounderAt,
      shared_fields: result.assessment.sharedFields,
      founder_preview: result.founderPreview,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

async function DELETE_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  if (!access || access.role !== "assessor") return notFound();

  const limited = enforceRateLimit("evaluation-assessment", user.id, request, ASSESSMENT_WRITES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const result = await revokeAssessmentShare({ evaluationId: access.evaluation.id, projectId: access.project.id, assessorUserId: user.id });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: result.error === "unavailable" ? 503 : 500, headers: PRIVATE_JSON_HEADERS });
  }
  return NextResponse.json({ ok: true, revoked: result.revoked }, { headers: PRIVATE_JSON_HEADERS });
}

export const POST = apiRoute({ route: "api/evaluations/[id]/assessment/share/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/evaluations/[id]/assessment/share/route.ts", method: "DELETE" }, DELETE_handler);
