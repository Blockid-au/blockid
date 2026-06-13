// /api/data-room/goals — Data Room Automation Goal System (T0098)
//
//   GET  /api/data-room/goals?dataRoomId=xxx
//        → returns all goal templates with per-user completion status
//
//   POST /api/data-room/goals
//        body: { dataRoomId, action: "init" }
//        → seeds per-user goal progress rows from templates (idempotent)
//
//   POST /api/data-room/goals/progress (handled in /progress/route.ts)
//        → mark a goal complete, award credits
//
// Service-role client; we enforce account_id ownership in WHERE clauses.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { spendCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/data-room/goals?dataRoomId=xxx
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, goals: [], completionScore: 0 });
  }

  const { searchParams } = new URL(request.url);
  const dataRoomId = searchParams.get("dataRoomId");

  const supabase = getSupabaseAdmin()!;

  // Fetch all active templates
  const { data: templates, error: tmplErr } = await supabase
    .from("data_room_goal_templates")
    .select("*")
    .eq("is_active", true)
    .order("section", { ascending: true })
    .order("priority", { ascending: true });

  if (tmplErr) {
    return NextResponse.json({ ok: false, error: tmplErr.message }, { status: 500 });
  }

  // Fetch user progress (optionally scoped to a data room)
  let progressQuery = supabase
    .from("data_room_goal_progress")
    .select("*")
    .eq("account_id", user.id);

  if (dataRoomId) {
    progressQuery = progressQuery.eq("data_room_id", dataRoomId);
  }

  const { data: progress } = await progressQuery;
  const progressMap = new Map(
    (progress ?? []).map((p) => [p.template_id as string, p])
  );

  // Merge templates with progress
  const goals = (templates ?? []).map((t) => {
    const prog = progressMap.get(t.id as string);
    return {
      id: t.id,
      templateId: t.id,
      progressId: prog?.id ?? null,
      goalType: t.goal_type,
      section: t.section,
      title: t.title,
      description: t.description,
      priority: t.priority,
      targetCompletionDays: t.target_completion_days,
      creditsReward: Number(t.credits_reward),
      automationTrigger: t.automation_trigger,
      templateSlug: t.template_slug,
      status: prog?.status ?? "pending",
      evidence: prog?.evidence ?? null,
      creditsAwarded: Number(prog?.credits_awarded ?? 0),
      completedAt: prog?.completed_at ?? null,
    };
  });

  // Compute section-level and overall completeness score
  const sectionMap: Record<string, { total: number; complete: number }> = {};
  for (const g of goals) {
    if (!sectionMap[g.section]) sectionMap[g.section] = { total: 0, complete: 0 };
    sectionMap[g.section].total += 1;
    if (g.status === "complete") sectionMap[g.section].complete += 1;
  }

  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.status === "complete").length;
  const completionScore = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  // P0 completeness (critical goals only)
  const p0Goals = goals.filter((g) => g.priority === "P0");
  const p0Completed = p0Goals.filter((g) => g.status === "complete").length;
  const p0Score = p0Goals.length > 0 ? Math.round((p0Completed / p0Goals.length) * 100) : 0;

  const sections = Object.entries(sectionMap).map(([name, stats]) => ({
    section: name,
    total: stats.total,
    complete: stats.complete,
    pct: stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0,
  }));

  return NextResponse.json({
    ok: true,
    goals,
    completionScore,
    p0Score,
    sections,
    stats: {
      total: totalGoals,
      completed: completedGoals,
      pending: totalGoals - completedGoals,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/data-room/goals
// body: { dataRoomId, action: "init" } — seed progress rows
// body: { dataRoomId, templateId, status, evidence? } — update single goal
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  let body: {
    action?: string;
    dataRoomId?: string;
    templateId?: string;
    status?: string;
    evidence?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;

  // ── Action: init ──────────────────────────────────────────────────────────
  if (body.action === "init") {
    if (!body.dataRoomId) {
      return NextResponse.json({ ok: false, error: "dataRoomId required" }, { status: 400 });
    }

    // Verify data room belongs to user
    const { data: room } = await supabase
      .from("data_rooms")
      .select("id, account_id")
      .eq("id", body.dataRoomId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (!room) {
      return NextResponse.json({ ok: false, error: "Data room not found" }, { status: 404 });
    }

    // Fetch all active templates
    const { data: templates } = await supabase
      .from("data_room_goal_templates")
      .select("id")
      .eq("is_active", true);

    if (!templates || templates.length === 0) {
      return NextResponse.json({ ok: true, seeded: 0 });
    }

    // Upsert progress rows (idempotent)
    const rows = templates.map((t) => ({
      account_id: user.id,
      data_room_id: body.dataRoomId,
      template_id: t.id,
      status: "pending",
    }));

    const { error: upsertErr } = await supabase
      .from("data_room_goal_progress")
      .upsert(rows, { onConflict: "account_id,data_room_id,template_id", ignoreDuplicates: true });

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, seeded: templates.length });
  }

  // ── Action: mark complete (progress update) ────────────────────────────
  if (!body.templateId || !body.dataRoomId) {
    return NextResponse.json(
      { ok: false, error: "templateId and dataRoomId required" },
      { status: 400 }
    );
  }

  // Fetch template to get credits reward
  const { data: template } = await supabase
    .from("data_room_goal_templates")
    .select("id, credits_reward, title")
    .eq("id", body.templateId)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ ok: false, error: "Goal template not found" }, { status: 404 });
  }

  const newStatus = body.status ?? "complete";
  const isCompleting = newStatus === "complete";
  const creditsReward = isCompleting ? Number(template.credits_reward) : 0;

  // Award credits if completing
  if (isCompleting && creditsReward > 0) {
    // spendCredits is for spending; for awarding we record a negative spend
    // In this codebase pattern, credits are awarded via the credits system
    try {
      await spendCredits(user.id, `data_room_goal_${body.templateId}`, {
        email: user.email,
        credit: -creditsReward, // negative = award
      });
    } catch {
      // Non-fatal — continue without credits
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("data_room_goal_progress")
    .upsert({
      account_id: user.id,
      data_room_id: body.dataRoomId,
      template_id: body.templateId,
      status: newStatus,
      evidence: body.evidence ?? {},
      credits_awarded: creditsReward,
      completed_at: isCompleting ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id,data_room_id,template_id" })
    .select()
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    progress: updated,
    creditsAwarded: creditsReward,
  });
}
