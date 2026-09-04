// POST /api/svi/action-plan/[id]/toggle
//
// Wave 28C — toggle a single action task's completion state. The `[id]` path
// param is the parent plan id (not the task id) so we can enforce ownership
// on the plan row before mutating the task.
//
// Body:  { taskId: number; completed: boolean; evidence_url?: string }
// Reply: { ok: true, task } | { ok: false, error }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PlanOwnerRow {
  id: number;
  user_id: string;
}

interface TaskRow {
  id: number;
  plan_id: number;
  title: string;
  detail: string | null;
  criterion: string | null;
  dim: string | null;
  target_delta_points: number | null;
  completed_at: string | null;
  evidence_url: string | null;
  order_index: number;
}

export async function POST(
  request: Request,
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

  let body: { taskId?: unknown; completed?: unknown; evidence_url?: unknown };
  try {
    body = (await request.json()) as {
      taskId?: unknown;
      completed?: unknown;
      evidence_url?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const taskId =
    typeof body.taskId === "number"
      ? body.taskId
      : typeof body.taskId === "string"
        ? Number.parseInt(body.taskId, 10)
        : NaN;
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_task_id" }, { status: 400 });
  }
  const completed = body.completed === true;
  const evidenceUrl =
    typeof body.evidence_url === "string" && body.evidence_url.trim().length > 0
      ? body.evidence_url.trim().slice(0, 500)
      : null;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  // Ownership check on the plan.
  const { data: planRaw } = await supabase
    .from("svi_action_plans")
    .select("id, user_id")
    .eq("id", planId)
    .maybeSingle();
  const plan = planRaw as PlanOwnerRow | null;
  if (!plan) {
    return NextResponse.json({ ok: false, error: "plan_not_found" }, { status: 404 });
  }
  if (plan.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const patch: {
    completed_at: string | null;
    evidence_url?: string | null;
  } = {
    completed_at: completed ? new Date().toISOString() : null,
  };
  if (evidenceUrl !== null) patch.evidence_url = evidenceUrl;

  const { data: updated, error: updErr } = await supabase
    .from("svi_action_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("plan_id", planId)
    .select("id, plan_id, title, detail, criterion, dim, target_delta_points, completed_at, evidence_url, order_index")
    .maybeSingle();

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: updErr.message },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "task_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, task: updated as TaskRow });
}
