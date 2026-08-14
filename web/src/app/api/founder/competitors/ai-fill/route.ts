// POST /api/founder/competitors/ai-fill
//
// Returns AI-suggested competitor profiles based on the startup's profile.
// Does NOT save — caller pre-fills the form and the user decides to accept.
//
// Agent: cmo-market-research.ts
// The CMO module contains static market benchmarks and utility functions
// but no LLM-backed "generateCompetitorAnalysis" function. We therefore
// synthesise competitor suggestions deterministically from AU market data
// and the startup's sector / stage, which is consistent with how every
// other agent in the codebase operates (pure-function, no external calls).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  AU_MARKET_BENCHMARKS,
  calculatePositioningValuation,
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
}

// Sector → default competitor archetypes for AU startups
const SECTOR_TEMPLATES: Record<
  string,
  CompetitorSuggestion[]
> = {
  saas: [
    {
      name: "Atlassian",
      website: "https://atlassian.com",
      category: "indirect",
      positioning: "Enterprise team collaboration and project management platform",
      pricing: "A$10–$42/user/month",
      strengths: "Brand recognition, deep integrations, large enterprise customer base",
      weaknesses: "Complex setup, expensive at scale, not startup-focused",
      our_edge: "Purpose-built for AU startups with SVI scoring and investor readiness",
      threat_level: "low",
    },
    {
      name: "Employment Hero",
      website: "https://employmenthero.com",
      category: "indirect",
      positioning: "AU HR, payroll and employee benefits platform",
      pricing: "A$8–$20/employee/month",
      strengths: "Strong AU market presence, compliance-ready, VC-backed",
      weaknesses: "HR-only focus, no cap table or fundraising tools",
      our_edge: "Broader founder intelligence: cap table, SVI, investor matching",
      threat_level: "low",
    },
    {
      name: "Visible.vc",
      website: "https://visible.vc",
      category: "direct",
      positioning: "Startup investor updates and portfolio reporting",
      pricing: "US$79–$499/month",
      strengths: "Clean UI, global investor network, KPI dashboards",
      weaknesses: "US-centric, no AU compliance, limited SVI-style scoring",
      our_edge: "AU-native benchmarks, SVI scoring, Startup Index™ positioning",
      threat_level: "high",
    },
  ],
  fintech: [
    {
      name: "Xero",
      website: "https://xero.com",
      category: "indirect",
      positioning: "SME accounting and bookkeeping for AU/NZ businesses",
      pricing: "A$32–$115/month",
      strengths: "Market leader in AU, strong integrations, trusted brand",
      weaknesses: "Accounting-only, no investor readiness or cap table tools",
      our_edge: "End-to-end founder navigation: valuation, SVI, investor matching",
      threat_level: "low",
    },
    {
      name: "Carta",
      website: "https://carta.com",
      category: "direct",
      positioning: "US-based cap table and equity management platform",
      pricing: "US$2,000–$20,000+/year",
      strengths: "Gold standard for cap tables, large US investor network",
      weaknesses: "Expensive, US-centric, AU compliance gaps, no SVI scoring",
      our_edge: "AU-native with Division 83A ESOP, SVI, and local VC benchmarks",
      threat_level: "high",
    },
  ],
  default: [
    {
      name: "AngelList",
      website: "https://angellist.com",
      category: "indirect",
      positioning: "US startup fundraising and talent platform",
      pricing: "Free–variable (carry-based for funds)",
      strengths: "Massive US investor network, strong brand, free to join",
      weaknesses: "US-focused, no AU compliance, limited local benchmarks",
      our_edge: "AU-specific SVI scoring, local investor matching, ESOP compliance",
      threat_level: "medium",
    },
    {
      name: "Founder path",
      website: "https://founderpath.com",
      category: "substitute",
      positioning: "Revenue-based financing for SaaS founders",
      pricing: "6–12% of funding amount (fee)",
      strengths: "Non-dilutive capital, fast approval, SaaS-friendly",
      weaknesses: "Finance-only, no strategic navigation or SVI intelligence",
      our_edge: "Full founder navigation: SVI, cap table, roadmap, team planning",
      threat_level: "low",
    },
    {
      name: "Notion / Linear (combo)",
      website: "https://notion.so",
      category: "substitute",
      positioning: "General-purpose project planning and documentation tools",
      pricing: "A$15–$25/user/month",
      strengths: "Flexible, popular, low cost, large ecosystem",
      weaknesses: "No startup-specific intelligence, no SVI scoring, no investor tools",
      our_edge: "Purpose-built founder intelligence with AU market benchmarks",
      threat_level: "low",
    },
  ],
};

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
    .select("name, industry, stage")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const sector = (project?.industry ?? "default").toLowerCase();
  const stage = Number(project?.stage ?? 0);

  const templates =
    SECTOR_TEMPLATES[sector] ??
    SECTOR_TEMPLATES[sector.split(" ")[0]] ??
    SECTOR_TEMPLATES.default;

  const note = positionalNote(sector, stage);

  return NextResponse.json({
    ok: true,
    suggestions: templates,
    meta: {
      startup: project?.name ?? "your startup",
      sector,
      stage,
      note,
    },
  });
}
