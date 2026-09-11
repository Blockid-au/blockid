// /api/evaluations — "Startups I'm evaluating" (T0270).
//
//   GET   → { ok, evaluations: EvaluationListRow[], used, limit }
//   POST  { name, website?, description?, founder_email?, state?, industry? }
//         → 201 { ok, evaluation, invite_sent, used, limit }
//         → 402 { ok:false, error:"evaluation_limit_reached", limit, used }
//
// Auth: session cookie via getCurrentUser(). Gate: plan grants
// `investor.dealflow` OR app_users.account_type is an evaluator persona
// (isEvaluatorUser). Everything else is decided in lib/evaluations.ts.

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { recordGateHit } from "@/lib/entitlements";
import {
  createEvaluation,
  getEvaluationQuota,
  isEvaluatorUser,
  listEvaluations,
  type CreateEvaluationInput,
} from "@/lib/evaluations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const CREATE_RATE_MAX = 30;
export const CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;
const BODY_MAX_BYTES = 16 * 1024;

async function gate() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  }
  const allowed = await isEvaluatorUser(user);
  if (!allowed) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "investor.dealflow", "api");
    return {
      user: null,
      response: NextResponse.json(
        { ok: false, error: "feature_locked", feature: "investor.dealflow" },
        { status: 402 },
      ),
    };
  }
  return { user, response: null };
}

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;

  const [evaluations, quota] = await Promise.all([
    listEvaluations(user.id),
    getEvaluationQuota(user),
  ]);
  return NextResponse.json({ ok: true, evaluations, used: quota.used, limit: quota.limit }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;

  // S8-C: each create can send a founder invite email — bound it per user.
  const limited = enforceRateLimit("evaluations-create", user.id, request, CREATE_RATE_MAX, CREATE_RATE_WINDOW_MS);
  if (limited) return limited;

  const read = await readJsonBody<CreateEvaluationInput>(request, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createEvaluation(user, body);
  if (!result.ok) {
    if (result.error === "evaluation_limit_reached") {
      return NextResponse.json(
        { ok: false, error: result.error, limit: result.limit, used: result.used, message: result.message },
        { status: 402 },
      );
    }
    const status = result.error === "invalid_input" ? 400 : result.error === "service_unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      evaluation: result.evaluation,
      invite_sent: result.inviteSent,
      used: result.used,
      limit: result.limit,
    },
    { status: 201 },
  );
}
