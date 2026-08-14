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
  computeNextBestActions,
  type DimensionScore,
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

// Map NextBestAction dimension label to roadmap category
function categoryFromDimension(dimension: string): string {
  if (dimension.toLowerCase().includes("market")) return "growth";
  if (dimension.toLowerCase().includes("traction") || dimension.toLowerCase().includes("revenue")) return "growth";
  if (dimension.toLowerCase().includes("product") || dimension.toLowerCase().includes("technical")) return "product";
  if (dimension.toLowerCase().includes("cap table") || dimension.toLowerCase().includes("governance")) return "compliance";
  if (dimension.toLowerCase().includes("legal") || dimension.toLowerCase().includes("compliance")) return "compliance";
  if (dimension.toLowerCase().includes("team") || dimension.toLowerCase().includes("founder")) return "team";
  if (dimension.toLowerCase().includes("investor")) return "fundraise";
  return "product";
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

// Default dimension scores for startups with no SVI analysis
function defaultDimensions(stage: number): DimensionScore[] {
  // Lower scores for earlier stages — triggers more P0 actions
  const baseScore = Math.min(30 + stage * 8, 75);
  return [
    { code: "ftv", label: "Founder & Team Value",      score: baseScore,       weight: 1, gaps: [] },
    { code: "mpc", label: "Market & Problem Clarity",  score: baseScore - 5,   weight: 1, gaps: [] },
    { code: "ptd", label: "Product & Technical Depth", score: baseScore,       weight: 1, gaps: [] },
    { code: "tre", label: "Traction & Revenue Evidence",score: Math.max(0, baseScore - 15), weight: 1, gaps: [] },
    { code: "cgh", label: "Cap Table & Governance",    score: Math.max(0, baseScore - 10), weight: 1, gaps: [] },
    { code: "iri", label: "Investor Readiness Index",  score: Math.max(0, baseScore - 10), weight: 1, gaps: [] },
    { code: "lco", label: "Legal & Compliance",        score: baseScore,       weight: 1, gaps: [] },
    { code: "svm", label: "Strategic Vision & Moat",   score: baseScore - 5,   weight: 1, gaps: [] },
  ];
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
    .select("name, industry, stage")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "Your startup";

  // Try to get the latest SVI analysis for real dimension scores
  let sviScore = 50;
  let dimensions: DimensionScore[] = defaultDimensions(stage);

  try {
    const { data: sviAccount } = await sb
      .from("svi_accounts")
      .select("current_svi, current_stage")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sviAccount?.current_svi != null) {
      sviScore = Number(sviAccount.current_svi);
    }

    // Try to get dimension breakdown from the latest analysis
    const { data: latestAnalysis } = await sb
      .from("svi_analyses")
      .select("analysis_json")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAnalysis?.analysis_json) {
      const parsed = latestAnalysis.analysis_json as Record<string, unknown>;
      // analysis_json stores dimension scores under various keys — attempt common shapes
      const dims = (parsed.dimensions ?? parsed.scores ?? parsed.dimension_scores) as
        | Array<{ code?: string; label?: string; score?: number; weight?: number }>
        | undefined;
      if (Array.isArray(dims) && dims.length >= 4) {
        dimensions = dims
          .filter((d) => d.code && d.score != null)
          .map((d) => ({
            code: d.code as DimensionScore["code"],
            label: d.label ?? d.code ?? "",
            score: Number(d.score),
            weight: Number(d.weight ?? 1),
            gaps: [],
          }));
      }
    }
  } catch {
    // Swallow — use defaults
  }

  const result = computeNextBestActions({ currentSvi: sviScore, stage, dimensions });

  const quarters = generateQuarters(4); // Q1–Q4 starting now
  const suggestions: RoadmapSuggestion[] = result.actions
    .slice(0, 8)
    .map((action, i) => {
      const qIndex = Math.min(i < 2 ? 0 : i < 4 ? 1 : i < 6 ? 2 : 3, quarters.length - 1);
      const q = quarters[qIndex];
      return {
        quarter: q,
        title: action.title,
        description: `${action.rationale} Effort: ${action.effort}. Time: ${action.timeToComplete}. Est. SVI gain: +${action.sviBenefit} pts.${action.auResource ? ` AU resource: ${action.auResource}.` : ""}`,
        category: categoryFromDimension(action.dimension),
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
      currentSvi: result.currentSvi,
      projectedSvi: result.projectedSvi,
      topInsight: result.topInsight,
      weakestDimension: result.weakestDimension,
    },
  });
}
