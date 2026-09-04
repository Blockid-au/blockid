// GET /api/svi/action-plan/[id]
//
// Wave 28C — return a persisted action plan + tasks by plan id. Requires the
// caller to own the plan (svi_action_plans.user_id === user.id).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadActionPlanById } from "@/lib/action-plan/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const planId = Number.parseInt(id, 10);
  if (!Number.isFinite(planId) || planId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_plan_id" }, { status: 400 });
  }

  const plan = await loadActionPlanById(planId);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (plan.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    plan: {
      id: plan.id,
      svi_run_id: plan.svi_run_id,
      startup_id: plan.startup_id,
      created_at: plan.created_at,
      meta: plan.plan,
    },
    tasks: plan.tasks,
  });
}
