// GET /api/svi/phase-progress — Load phase progress for current user/project
// POST /api/svi/phase-progress — Update step completion, auto-detect from evidence
//
// GET returns all 12 phases with their steps and completion status
// POST body: { action: "complete_step" | "uncomplete_step" | "auto_detect", phaseId?, stepId? }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";

export const dynamic = "force-dynamic";

async function getAccountId(email: string, projectId: string | null) {
  const supabase = getSupabaseAdmin()!;
  let query = supabase.from("svi_accounts").select("id").eq("email", email);
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin()!;
  const projectId = await getProjectIdFromRequest();
  const accountId = await getAccountId(user.email, projectId);

  if (!accountId) {
    return NextResponse.json({
      ok: true,
      phases: GROWTH_PHASES.map(p => ({
        phaseId: p.id,
        order: p.order,
        title: p.title,
        subtitle: p.subtitle,
        leadAgent: p.leadAgent,
        color: p.color,
        status: "not_started",
        completionPct: 0,
        steps: p.steps.map(s => ({ ...s, completed: false, completedAt: null, notes: null })),
      })),
      overallPct: 0,
    });
  }

  const { data: progressRows } = await supabase
    .from("startup_phase_progress")
    .select("*")
    .eq("account_id", accountId)
    .order("phase_order", { ascending: true });

  const progressMap = new Map((progressRows ?? []).map(r => [r.phase_id, r]));

  const phases = GROWTH_PHASES.map(p => {
    const row = progressMap.get(p.id);
    const stepsJson: Array<{ id: string; completed: boolean; completedAt: string | null; notes: string | null }> =
      row?.steps_json ?? [];
    const completedIds = new Set(stepsJson.filter(s => s.completed).map(s => s.id));

    return {
      phaseId: p.id,
      order: p.order,
      title: p.title,
      subtitle: p.subtitle,
      leadAgent: p.leadAgent,
      color: p.color,
      status: row?.status ?? "not_started",
      completionPct: row?.completion_pct ?? 0,
      aiRecommendations: row?.ai_recommendations ?? null,
      steps: p.steps.map(s => {
        const stepData = stepsJson.find(sd => sd.id === s.id);
        return {
          ...s,
          completed: completedIds.has(s.id),
          completedAt: stepData?.completedAt ?? null,
          notes: stepData?.notes ?? null,
        };
      }),
    };
  });

  const totalSteps = phases.reduce((s, p) => s + p.steps.length, 0);
  const completedSteps = phases.reduce((s, p) => s + p.steps.filter(st => st.completed).length, 0);
  const overallPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return NextResponse.json({ ok: true, phases, overallPct, completedSteps, totalSteps });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, phaseId, stepId } = body as { action?: string; phaseId?: string; stepId?: string };

  const supabase = getSupabaseAdmin()!;
  const projectId = await getProjectIdFromRequest();
  let accountId = await getAccountId(user.email, projectId);

  if (!accountId) {
    const { data: newAccount } = await supabase
      .from("svi_accounts")
      .insert({ email: user.email, project_id: projectId, startup_name: user.displayName || user.email })
      .select("id")
      .single();
    accountId = newAccount?.id;
    if (!accountId) return NextResponse.json({ ok: false, error: "Could not create account" }, { status: 500 });
  }

  if (action === "auto_detect") {
    return await autoDetectProgress(supabase, accountId, projectId, user.email);
  }

  if ((action === "complete_step" || action === "uncomplete_step") && phaseId && stepId) {
    return await toggleStep(supabase, accountId, projectId, phaseId, stepId, action === "complete_step");
  }

  return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
}

async function toggleStep(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  accountId: string,
  projectId: string | null,
  phaseId: string,
  stepId: string,
  complete: boolean,
) {
  const phase = GROWTH_PHASES.find(p => p.id === phaseId);
  if (!phase || !phase.steps.some(s => s.id === stepId)) {
    return NextResponse.json({ ok: false, error: "Invalid phase/step" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("startup_phase_progress")
    .select("*")
    .eq("account_id", accountId)
    .eq("phase_id", phaseId)
    .maybeSingle();

  let stepsJson: Array<{ id: string; completed: boolean; completedAt: string | null; notes: string | null }> =
    existing?.steps_json ?? phase.steps.map(s => ({ id: s.id, completed: false, completedAt: null, notes: null }));

  const stepIdx = stepsJson.findIndex(s => s.id === stepId);
  if (stepIdx >= 0) {
    stepsJson[stepIdx].completed = complete;
    stepsJson[stepIdx].completedAt = complete ? new Date().toISOString() : null;
  } else {
    stepsJson.push({ id: stepId, completed: complete, completedAt: complete ? new Date().toISOString() : null, notes: null });
  }

  const completedCount = stepsJson.filter(s => s.completed).length;
  const totalCount = phase.steps.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const status = pct === 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";

  const record = {
    account_id: accountId,
    project_id: projectId,
    phase_id: phaseId,
    phase_order: phase.order,
    status,
    completion_pct: pct,
    steps_json: stepsJson,
    started_at: pct > 0 ? (existing?.started_at ?? new Date().toISOString()) : null,
    completed_at: pct === 100 ? new Date().toISOString() : null,
    last_updated_by: "user",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from("startup_phase_progress").update(record).eq("id", existing.id);
  } else {
    await supabase.from("startup_phase_progress").insert(record);
  }

  await updateOverallProgress(supabase, accountId, projectId);

  return NextResponse.json({ ok: true, phaseId, stepId, completed: complete, phasePct: pct, phaseStatus: status });
}

async function autoDetectProgress(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  accountId: string,
  projectId: string | null,
  email: string,
) {
  const detected: Record<string, string[]> = {};

  // Check evidence criteria for auto-detection
  const { data: criteria } = await supabase
    .from("evaluation_criteria")
    .select("criterion_key, ai_score, quality_level, text_input, files, links")
    .eq("account_id", accountId);

  const criteriaMap = new Map((criteria ?? []).map(c => [c.criterion_key, c]));

  // Check analyses for SVI data
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("analysis_json, total_svi")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const svi = latestAnalysis?.total_svi ?? 0;
  const hasData = (key: string) => {
    const c = criteriaMap.get(key);
    if (!c) return false;
    return (c.text_input && c.text_input.length > 20) || (c.files?.length > 0) || (c.links?.length > 0);
  };
  const hasGoodScore = (key: string) => {
    const c = criteriaMap.get(key);
    return c && c.ai_score && c.ai_score >= 40;
  };

  // Phase 1: Vision — auto-detect from idea criterion
  if (hasData("idea")) {
    detected.vision = ["v1"];
    if (hasGoodScore("idea")) detected.vision.push("v2", "v3");
  }
  if (hasData("market")) {
    detected.vision = [...(detected.vision ?? []), "v4", "v5"];
  }

  // Phase 2: Customer Dev — from customer_size + market
  if (hasData("customer_size")) {
    detected.customer_dev = ["cd1", "cd2", "cd3"];
    if (hasGoodScore("customer_size")) detected.customer_dev.push("cd4", "cd5");
  }

  // Phase 3: Revenue — from revenue criterion
  if (hasData("revenue")) {
    detected.revenue_model = ["rm1", "rm2"];
    if (hasGoodScore("revenue")) detected.revenue_model.push("rm3", "rm4", "rm5");
  }

  // Phase 4: Pitch — from documents
  if (hasData("documents")) {
    detected.pitch = ["pm1", "pm2"];
    if (hasData("dataroom")) detected.pitch.push("pm3", "pm4");
  }

  // Phase 5: Mentor Review — if SVI > 40 (implies some review happened)
  if (svi > 40) {
    detected.mentor_review = ["mr1", "mr3"];
  }

  // Phase 6: Legal — from documents + team
  if (hasData("documents")) {
    detected.legal_equity = ["le1"];
    if (hasGoodScore("documents")) detected.legal_equity.push("le2", "le3");
  }

  // Phase 7: GTM — from gtm_strategy
  if (hasData("gtm_strategy")) {
    detected.go_to_market = ["gtm1", "gtm2"];
    if (hasGoodScore("gtm_strategy")) detected.go_to_market.push("gtm3", "gtm4", "gtm5");
  }

  // Phase 8: Product — from code_git + website
  if (hasData("code_git")) {
    detected.product_dev = ["pd1", "pd2"];
    if (hasData("website")) detected.product_dev.push("pd3");
    if (hasGoodScore("code_git")) detected.product_dev.push("pd4", "pd5");
  }

  // Phase 9: Investor Review — if SVI > 80
  if (svi > 80) {
    detected.investor_review = ["ir1", "ir2"];
    if (hasData("revenue")) detected.investor_review.push("ir3", "ir4");
  }

  // Phase 10: Team — from team + team_structure + founder_profile
  if (hasData("team")) {
    detected.team = ["t1"];
    if (hasData("team_structure")) detected.team.push("t2", "t4");
    if (hasData("founder_profile")) detected.team.push("t5");
  }

  // Phase 11: Growth — from metrics
  const { data: metrics } = await supabase
    .from("startup_metrics")
    .select("mrr_aud, mau")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metrics?.mrr_aud > 0 || metrics?.mau > 0) {
    detected.growth = ["g1"];
    if (metrics?.mrr_aud > 0) detected.growth.push("g2", "g3");
  }

  // Phase 12: Funding — from dataroom
  if (hasData("dataroom")) {
    detected.funding = ["f1"];
    if (hasGoodScore("dataroom")) detected.funding.push("f2", "f3");
  }

  // Merge detected with existing progress (don't un-complete anything)
  let updated = 0;
  for (const phase of GROWTH_PHASES) {
    const newStepIds = detected[phase.id];
    if (!newStepIds || newStepIds.length === 0) continue;

    const { data: existing } = await supabase
      .from("startup_phase_progress")
      .select("*")
      .eq("account_id", accountId)
      .eq("phase_id", phase.id)
      .maybeSingle();

    let stepsJson: Array<{ id: string; completed: boolean; completedAt: string | null; notes: string | null }> =
      existing?.steps_json ?? phase.steps.map(s => ({ id: s.id, completed: false, completedAt: null, notes: null }));

    let changed = false;
    for (const stepId of new Set(newStepIds)) {
      const idx = stepsJson.findIndex(s => s.id === stepId);
      if (idx >= 0 && !stepsJson[idx].completed) {
        stepsJson[idx].completed = true;
        stepsJson[idx].completedAt = new Date().toISOString();
        stepsJson[idx].notes = "Auto-detected from evidence";
        changed = true;
      } else if (idx < 0) {
        stepsJson.push({ id: stepId, completed: true, completedAt: new Date().toISOString(), notes: "Auto-detected" });
        changed = true;
      }
    }

    if (!changed) continue;
    updated++;

    const completedCount = stepsJson.filter(s => s.completed).length;
    const pct = Math.round((completedCount / phase.steps.length) * 100);
    const status = pct === 100 ? "completed" : pct > 0 ? "in_progress" : "not_started";

    const record = {
      account_id: accountId,
      project_id: projectId,
      phase_id: phase.id,
      phase_order: phase.order,
      status,
      completion_pct: pct,
      steps_json: stepsJson,
      started_at: pct > 0 ? (existing?.started_at ?? new Date().toISOString()) : null,
      completed_at: pct === 100 ? new Date().toISOString() : null,
      last_updated_by: "ai_agent",
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("startup_phase_progress").update(record).eq("id", existing.id);
    } else {
      await supabase.from("startup_phase_progress").insert(record);
    }
  }

  await updateOverallProgress(supabase, accountId, projectId);

  return NextResponse.json({ ok: true, action: "auto_detect", phasesUpdated: updated, detected });
}

async function updateOverallProgress(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  accountId: string,
  projectId: string | null,
) {
  const { data: allProgress } = await supabase
    .from("startup_phase_progress")
    .select("completion_pct, phase_id, status")
    .eq("account_id", accountId);

  const totalPhases = GROWTH_PHASES.length;
  const sumPct = (allProgress ?? []).reduce((s, r) => s + (r.completion_pct ?? 0), 0);
  const overallPct = Math.round(sumPct / totalPhases);

  const inProgressPhase = (allProgress ?? [])
    .filter(r => r.status === "in_progress")
    .sort((a, b) => {
      const aOrder = GROWTH_PHASES.find(p => p.id === a.phase_id)?.order ?? 0;
      const bOrder = GROWTH_PHASES.find(p => p.id === b.phase_id)?.order ?? 0;
      return aOrder - bOrder;
    })[0];

  const currentPhaseId = inProgressPhase?.phase_id ?? "vision";

  await supabase
    .from("svi_accounts")
    .update({ growth_phase_current: currentPhaseId, growth_completion_pct: overallPct })
    .eq("id", accountId);

  if (projectId) {
    await supabase
      .from("projects")
      .update({ growth_phase_current: currentPhaseId, growth_completion_pct: overallPct })
      .eq("id", projectId);
  }
}
