// POST /api/founder/competitors/ai-fill
//
// Returns AI-suggested competitor profiles based on the startup's profile.
// Does NOT save — caller pre-fills the form and the user decides to accept.
//
// Wiring: delegates generation to cmo-market-research.generateCompetitorAnalysis,
// which routes through callAI() (Cerebras → Groq → SambaNova → Claude OAuth
// → OpenRouter). Falls back to deterministic sector templates on LLM/parse
// failure so the founder UI never sees a hard error.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  AU_MARKET_BENCHMARKS,
  calculatePositioningValuation,
  generateCompetitorAnalysis,
  type CompetitorProfile,
} from "@/lib/agents/cmo-market-research";

export const dynamic = "force-dynamic";

interface CompetitorSuggestion {
  name: string;
  website: string;
  category: string;
  positioning: string;
  pricing: string;
  strengths: string;
  weaknesses: string;
  our_edge: string;
  threat_level: "low" | "medium" | "high";
  // Tech Intelligence enrichment (optional — populated when analyseWebsite succeeds)
  techStack?: string[];
  websiteScore?: number;
  hasAnalytics?: boolean;
  hasPricing?: boolean;
  techSignals?: string[];
}

// Map the internal CompetitorProfile → the shape the founder UI form binds to.
function toSuggestion(c: CompetitorProfile): CompetitorSuggestion {
  const normalizeCategory = (v: string): string => {
    const s = (v || "").toLowerCase();
    if (s === "direct" || s === "indirect" || s === "substitute") return s;
    return "direct";
  };
  return {
    name: c.name ?? "",
    website: c.website ?? "",
    category: normalizeCategory(c.category ?? "direct"),
    positioning: c.positioning ?? "",
    pricing: c.pricing ?? "",
    strengths: (c.strengths ?? []).join(", "),
    weaknesses: (c.weaknesses ?? []).join(", "),
    our_edge: c.ourEdge ?? "",
    threat_level: c.threatLevel ?? "medium",
    // Pass through tech enrichment
    techStack: c.techStack,
    websiteScore: c.websiteScore,
    hasAnalytics: c.hasAnalytics,
    hasPricing: c.hasPricing,
    techSignals: c.techSignals,
  };
}

// Compute suggested valuation to enrich the "our_edge" contextually
function positionalNote(sector: string, stage: number): string {
  const isStrategic = true; // BlockID is a navigation tool
  const arr = 100_000 * Math.pow(1.5, stage); // synthetic ARR proxy
  const val = calculatePositioningValuation(arr, isStrategic, false);
  const multiple =
    AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN + "-" +
    AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX;
  return `Strategic navigation positioning commands ${multiple}x multiples vs utility tools (AU benchmark 2024–2026, implied val ~A$${Math.round(val / 1000)}K).`;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

  // Fetch project profile for context
  const { data: project } = await sb
    .from("projects")
    .select("name, industry, stage, description")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const sector = (project?.industry ?? "default").toLowerCase();
  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "your startup";

  // Run competitor generation + own tech score fetch concurrently
  const [profiles, techRow] = await Promise.all([
    generateCompetitorAnalysis({
      startupName: name,
      sector,
      stage,
      description: project?.description ?? undefined,
      region: "AU",
    }),
    // Fetch own tech_analyses row (if any) for comparison panel
    sb
      .from("tech_analyses")
      .select("tech_score")
      .eq("startup_id", projectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data),
  ]);

  const suggestions = profiles.map(toSuggestion);
  const note = positionalNote(sector, stage);

  // Compute average competitor web score for comparison
  const scoredSuggestions = suggestions.filter((s) => typeof s.websiteScore === "number");
  const avgCompetitorWebScore =
    scoredSuggestions.length > 0
      ? Math.round(
          scoredSuggestions.reduce((sum, s) => sum + (s.websiteScore ?? 0), 0) /
            scoredSuggestions.length,
        )
      : null;

  const ownTechScore = (techRow as { tech_score?: number } | null)?.tech_score ?? null;

  return NextResponse.json({
    ok: true,
    suggestions,
    meta: {
      startup: name,
      sector,
      stage,
      note,
      // Tech comparison data
      ownTechScore,
      avgCompetitorWebScore,
    },
  });
}
