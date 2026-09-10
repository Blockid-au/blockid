// POST /api/evaluations/claim/[token] — founder claims an evaluated startup.
//
// The founder is logged in (any account type — this is the FOUNDER's side,
// so no evaluator gate). On success the evaluations row becomes
// owner_kind='founder_claimed', consent_tier='reports_shared', claimed_at=now.
//
// `projects.user_id` is NOT transferred to the founder. The evaluator's plan
// quota counts the row, their credits paid for any report on it, and every
// evaluator-scoped read (evaluations, svi_snapshots.project_id) keys on the
// evaluator owning the project. Co-ownership is expressed by the evaluations
// row (`founder_user_id`) which `canAccessProjectAsEvaluator` honours.
//
//   200 { ok, evaluation, already_claimed, project_name }
//   404 { ok:false, error:"not_found" }
//   403 { ok:false, error:"email_mismatch", message }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claimEvaluation } from "@/lib/evaluations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { token } = await params;

  const result = await claimEvaluation(token, user);
  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404
      : result.error === "email_mismatch" ? 403
      : result.error === "service_unavailable" ? 503
      : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status });
  }

  // Never echo the invite token back to the founder.
  const { inviteToken: _omit, ...evaluation } = result.evaluation;
  void _omit;
  return NextResponse.json({
    ok: true,
    evaluation,
    already_claimed: result.alreadyClaimed,
    project_name: result.projectName,
  });
}
