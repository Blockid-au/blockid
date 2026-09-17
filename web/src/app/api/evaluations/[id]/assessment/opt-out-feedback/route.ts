// POST /api/evaluations/[id]/assessment/opt-out-feedback — the assessor
// excludes (or re-includes) this seat's assessment from the founder's
// anonymised "What investors said" letter (G14-S34, goal doc D3: "evaluators
// can opt out per assessment").
//
//   POST body { opt_out: boolean }
//        → 200 { ok, opt_out, updated }   every version of the seat's row is
//                                        flagged (a total flag, like revoke)
//   401 · 404 (not the assessor, unknown id, lapsed evaluator, founder
//   caller — never 403, §A.1) · 400 invalid body · 409 nothing_saved (no row
//   yet) · 429 · 503 while migration 0406 is not applied.
//
// Audit `assessment.feedback_opt_out` with the flag only — never the
// assessment content.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ASSESSMENT_WRITES_PER_MINUTE, resolveAssessmentAccess } from "@/lib/evaluations/assessment-access";
import { setFeedbackOptOut } from "@/lib/evaluations/feedback-letter-store";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const optOutSchema = z.object({ opt_out: z.boolean() }).strict();

const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });

async function POST_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  if (!access || access.role !== "assessor") return notFound();

  const limited = enforceRateLimit("evaluation-assessment", user.id, request, ASSESSMENT_WRITES_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 1024);
  if (!body.ok) return body.response;
  const parsed = optOutSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const result = await setFeedbackOptOut(access.evaluation.id, user.id, parsed.data.opt_out);
  if (!result.ok) {
    const status = result.error === "unavailable" ? 503 : result.error === "not_found" ? 409 : 500;
    return NextResponse.json({ ok: false, error: result.error === "not_found" ? "nothing_saved" : result.error, message: result.message }, { status, headers: PRIVATE_JSON_HEADERS });
  }
  void appendAudit({
    user_id: user.id,
    actor: "user",
    action: "assessment.feedback_opt_out",
    resource_type: "evaluation_assessment",
    resource_id: access.evaluation.id,
    detail: { evaluation_id: access.evaluation.id, project_id: access.project.id, opt_out: result.optOut, versions: result.updated },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, opt_out: result.optOut, updated: result.updated }, { headers: PRIVATE_JSON_HEADERS });
}

export const POST = apiRoute({ route: "api/evaluations/[id]/assessment/opt-out-feedback/route.ts", method: "POST" }, POST_handler);
