// POST /api/founder/roadmap/ai-fill
//
// Returns AI-suggested roadmap milestones based on the startup's SVI scores
// and current stage. Does NOT save — caller pre-fills the form.
//
// Agent: cto-next-best-action.ts
// Uses computeNextBestActions() with dimension scores derived from the
// startup's latest SVI analysis, then maps each NextBestAction to a
// RoadmapMilestone suggestion.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  generateRoadmapItems,
  type RoadmapItemSuggestion,
  type RoadmapPhase,
} from "@/lib/agents/cto-next-best-action";

export const dynamic = "force-dynamic";

interface RoadmapSuggestion {
  quarter: string;
  title: string;
  description: string;
  category: string;
  status: "planned";
  target_date: string;
  owner: string;
}

// Map LLM roadmap-category → the form's roadmap-category vocabulary.
function normalizeCategory(cat: string): string {
  const s = cat.toLowerCase();
  if (s === "growth" || s === "product" || s === "team" || s === "fundraise" || s === "infra") return s;
  return "product";
}

// Map an LLM phase label onto a quarter label from `quarters`.
function quarterForPhase(phase: RoadmapPhase, quarters: string[]): string {
  const map: Record<RoadmapPhase, number> = {
    "0-30_days": 0,
    "1-3_months": 1,
    "3-6_months": 2,
    "6-12_months": 3,
  };
  const idx = Math.min(map[phase] ?? 0, quarters.length - 1);
  return quarters[idx];
}

// Generate quarters starting from today
function generateQuarters(count: number): string[] {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  const quarters: string[] = [];
  let q = quarter;
  let y = year;
  for (let i = 0; i < count; i++) {
    quarters.push(`Q${q} ${y}`);
    q++;
    if (q > 4) { q = 1; y++; }
  }
  return quarters;
}

// Target date: end of a quarter label like "Q3 2026"
function quarterEndDate(quarterLabel: string): string {
  const match = quarterLabel.match(/Q(\d)\s+(\d{4})/);
  if (!match) return "";
  const q = Number(match[1]);
  const y = Number(match[2]);
  const endMonth = q * 3; // Q1→3, Q2→6, Q3→9, Q4→12
  const lastDay = new Date(y, endMonth, 0);
  return lastDay.toISOString().split("T")[0];
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

  // Get project profile
  const { data: project } = await sb
    .from("projects")
    .select("name, industry, stage, description")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "Your startup";
  const sector = (project?.industry ?? "saas").toLowerCase();

  // Best-effort SVI hint for the LLM.
  let sviScore: number | undefined = undefined;
  try {
    const { data: sviAccount } = await sb
      .from("svi_accounts")
      .select("current_svi")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sviAccount?.current_svi != null) {
      sviScore = Number(sviAccount.current_svi);
    }
  } catch {
    // Swallow — SVI is optional context.
  }

  const items: RoadmapItemSuggestion[] = await generateRoadmapItems({
    startupName: name,
    sector,
    stage,
    currentSvi: sviScore,
    description: project?.description ?? undefined,
  });

  const quarters = generateQuarters(4); // Q1–Q4 starting now
  const suggestions: RoadmapSuggestion[] = items.slice(0, 8).map((item) => {
    const q = quarterForPhase(item.phase, quarters);
    return {
      quarter: q,
      title: item.title,
      description: `${item.rationale} Impact: ${item.impact}. Effort: ${item.effort}.`,
      category: normalizeCategory(item.category),
      status: "planned" as const,
      target_date: quarterEndDate(q),
      owner: "Founder",
    };
  });

  return NextResponse.json({
    ok: true,
    suggestions,
    meta: {
      startup: name,
      stage,
      currentSvi: sviScore ?? null,
      itemCount: suggestions.length,
      topInsight: items[0]
        ? `Start with: ${items[0].title} — ${items[0].rationale}`
        : undefined,
    },
  });
}
