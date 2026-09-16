// /api/evaluations/[id]/assessment — the Evaluator Assessment (G13-W4-D2,
// S-D2; BA spec Appendix 1, §A.3 block 4, §C.1, §C.6).
//
//   GET  → 200 { ok, role, available, assessment, history, prefill? }
//          assessor: own current row + version timeline; `?prefill=1` adds the
//          mandate-fit / snapshot seeds when there is no row yet.
//          founder (claimed): { ok, role:"founder", available, sharedWithFounder }
//          — ONLY the shared projection (masked in the lib, §C.1).
//   PUT  → 200 { ok, assessment, created, version, history }
//          body = AssessmentDraft (Appendix 1): every field optional;
//          `status: "submitted"` submits (decision + conviction required →
//          422 missing_decision / missing_conviction). A draft updates in
//          place; a submitted current row makes the next save v(n+1).
//
//   401 auth_required · 404 not_found for an unknown id, a row the caller does
//   not own, a founder trying to write, or an evaluator seat whose entitlement
//   lapsed (never 403 — the id must not confirm a row exists) · 400 invalid
//   body with Zod issue paths · 413 body > 64 kB · 429 over 60 writes/min ·
//   503 while migration 0392 is not applied.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ASSESSMENT_BODY_MAX_BYTES, ASSESSMENT_WRITES_PER_MINUTE, resolveAssessmentAccess } from "@/lib/evaluations/assessment-access";
import { assessmentDraftSchema, getAssessment, upsertAssessment } from "@/lib/evaluations/assessments";
import { prefillFromFit } from "@/lib/evaluations/assessment-prefill";
import { resolveActingOrg } from "@/lib/investor/organisations";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  if (!access) return notFound();

  const read = await getAssessment(access.evaluation.id, { userId: user.id, role: access.role });
  if (access.role === "founder") {
    return NextResponse.json({ ok: true, role: "founder", available: read.available, sharedWithFounder: read.sharedWithFounder }, { headers: PRIVATE_JSON_HEADERS });
  }
  const wantPrefill = new URL(request.url).searchParams.get("prefill") === "1";
  const prefill = wantPrefill && !read.mine ? await prefillFromFit({ userId: user.id, projectId: access.project.id }) : null;
  return NextResponse.json(
    { ok: true, role: "assessor", available: read.available, assessment: read.mine, history: read.history, prefill },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

async function PUT_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  // A claimed founder can read the shared projection but never write (§C.1).
  if (!access || access.role !== "assessor") return notFound();

  const limited = enforceRateLimit("evaluation-assessment", user.id, request, ASSESSMENT_WRITES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, ASSESSMENT_BODY_MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = assessmentDraftSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  // S-D3: stamp the seat's acting org so same-org seats' consensus reads
  // find the row (0393 org_seat_select); a Scout's personal org is fine.
  const org = access.viaOrgId ? { id: access.viaOrgId } : await resolveActingOrg(user.id).catch(() => null);
  const result = await upsertAssessment(
    { evaluationId: access.evaluation.id, projectId: access.project.id, assessorUserId: user.id, orgId: org?.id ?? null },
    parsed.data,
  );
  if (!result.ok) {
    const status = result.error === "unavailable" ? 503 : result.error === "missing_decision" || result.error === "missing_conviction" ? 422 : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status, headers: PRIVATE_JSON_HEADERS });
  }
  return NextResponse.json(
    { ok: true, assessment: result.assessment, created: result.created, version: result.version, history: result.history },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

export const PUT = apiRoute({ route: "api/evaluations/[id]/assessment/route.ts", method: "PUT" }, PUT_handler);
