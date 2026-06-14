import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// AU comparable raises by stage (2024-2026 data)
const AU_COMPARABLE_RAISES = [
  { stage: "Pre-Seed", range: "A$250K–A$1M", medianValuation: "A$2.5M", medianRaise: "A$500K", equity: "15–25%", investors: "Angels, Antler, Startmate", examples: ["Antler AU cohort 2025", "Startmate W2025"] },
  { stage: "Seed", range: "A$1M–A$5M", medianValuation: "A$6M", medianRaise: "A$2M", equity: "20–30%", investors: "Blackbird, Square Peg, Folklore", examples: ["Typical AU SaaS seed 2025", "HealthTech seed 2024"] },
  { stage: "Series A", range: "A$8M–A$25M", medianValuation: "A$30M", medianRaise: "A$12M", equity: "20–30%", investors: "Blackbird, AirTree, Airtree Ventures", examples: ["AU B2B SaaS Series A 2025", "Fintech Series A 2024"] },
  { stage: "Series B", range: "A$25M–A$80M", medianValuation: "A$120M", medianRaise: "A$40M", equity: "20–25%", investors: "Global VCs, AirTree, IVP", examples: ["AU Scale-up 2024", "Enterprise SaaS 2025"] },
];

// Fundraising readiness checklist with scoring
const READINESS_CHECKLIST = [
  // Team
  { id: "team-mvp", category: "Team", item: "Founding team of 2+ with complementary skills", weight: 8, tier: ["pre-seed", "seed", "series-a"] },
  { id: "team-domain", category: "Team", item: "Domain expertise or prior industry experience", weight: 6, tier: ["pre-seed", "seed", "series-a"] },
  { id: "team-advisors", category: "Team", item: "2+ relevant advisors or mentors", weight: 4, tier: ["seed", "series-a"] },
  { id: "team-linkedin", category: "Team", item: "Founder LinkedIn profiles complete and credible", weight: 3, tier: ["pre-seed", "seed", "series-a"] },

  // Product
  { id: "product-mvp", category: "Product", item: "MVP or prototype built and testable", weight: 8, tier: ["pre-seed", "seed", "series-a"] },
  { id: "product-users", category: "Product", item: "10+ active beta users or customers", weight: 7, tier: ["seed", "series-a"] },
  { id: "product-demo", category: "Product", item: "Live product demo ready (not slides)", weight: 6, tier: ["pre-seed", "seed", "series-a"] },
  { id: "product-roadmap", category: "Product", item: "12-month product roadmap defined", weight: 4, tier: ["seed", "series-a"] },

  // Traction
  { id: "traction-revenue", category: "Traction", item: "First revenue or signed LOIs/pilots", weight: 10, tier: ["seed", "series-a"] },
  { id: "traction-growth", category: "Traction", item: "Month-over-month growth > 10%", weight: 8, tier: ["seed", "series-a"] },
  { id: "traction-testimonials", category: "Traction", item: "3+ customer testimonials or case studies", weight: 5, tier: ["seed", "series-a"] },
  { id: "traction-waitlist", category: "Traction", item: "Email waitlist or pre-signups (100+)", weight: 4, tier: ["pre-seed"] },

  // Market
  { id: "market-tam", category: "Market", item: "TAM/SAM/SOM analysis completed", weight: 6, tier: ["pre-seed", "seed", "series-a"] },
  { id: "market-competitive", category: "Market", item: "Competitive landscape mapped with positioning", weight: 5, tier: ["seed", "series-a"] },
  { id: "market-problem", category: "Market", item: "Clear problem-solution narrative (1 paragraph)", weight: 7, tier: ["pre-seed", "seed", "series-a"] },

  // Legal / Compliance
  { id: "legal-incorporated", category: "Legal", item: "Company incorporated in Australia (ACN/ABN)", weight: 8, tier: ["pre-seed", "seed", "series-a"] },
  { id: "legal-sha", category: "Legal", item: "Shareholders Agreement in place", weight: 7, tier: ["pre-seed", "seed", "series-a"] },
  { id: "legal-ip", category: "Legal", item: "IP assigned to company (not individuals)", weight: 8, tier: ["pre-seed", "seed", "series-a"] },
  { id: "legal-esop", category: "Legal", item: "ESOP pool created (12%+ recommended)", weight: 5, tier: ["seed", "series-a"] },
  { id: "legal-privacy", category: "Legal", item: "Privacy policy and terms of service live", weight: 4, tier: ["pre-seed", "seed", "series-a"] },

  // Financials
  { id: "finance-projections", category: "Financials", item: "12–36 month financial projections", weight: 7, tier: ["seed", "series-a"] },
  { id: "finance-burn", category: "Financials", item: "Monthly burn rate and runway known", weight: 6, tier: ["pre-seed", "seed", "series-a"] },
  { id: "finance-use-of-funds", category: "Financials", item: "Use of funds breakdown ready", weight: 6, tier: ["pre-seed", "seed", "series-a"] },
  { id: "finance-cap-table", category: "Financials", item: "Clean cap table with no red flags", weight: 7, tier: ["pre-seed", "seed", "series-a"] },

  // Pitch materials
  { id: "pitch-deck", category: "Pitch", item: "Investor pitch deck (10-15 slides)", weight: 8, tier: ["pre-seed", "seed", "series-a"] },
  { id: "pitch-executive", category: "Pitch", item: "One-page executive summary", weight: 5, tier: ["seed", "series-a"] },
  { id: "pitch-data-room", category: "Pitch", item: "Data room with key documents organized", weight: 6, tier: ["seed", "series-a"] },
  { id: "pitch-ask", category: "Pitch", item: "Clear funding ask with valuation rationale", weight: 7, tier: ["pre-seed", "seed", "series-a"] },
];

interface ChecklistStatus {
  id: string;
  category: string;
  item: string;
  weight: number;
  completed: boolean;
  relevantForStage: boolean;
}

interface ComparableRaise {
  stage: string;
  range: string;
  medianValuation: string;
  medianRaise: string;
  equity: string;
  investors: string;
  examples: string[];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Fetch user's data in parallel
  const [sviRes, esopRes, shareholdersRes, dataRoomRes] = await Promise.all([
    supabase.from("svi_accounts").select("analysis, score").eq("account_id", user.id).maybeSingle(),
    supabase.from("esop_pools").select("total_shares, allocated_shares").eq("account_id", user.id).maybeSingle(),
    supabase.from("shareholders").select("id").eq("account_id", user.id),
    supabase.from("data_room_documents").select("name, status").eq("account_id", user.id),
  ]);

  const svi = sviRes.data;
  const analysis = svi?.analysis as Record<string, unknown> | null;
  const signals = analysis?.signals as Record<string, boolean> | null;
  const sviScore = svi?.score ?? 0;
  const hasEsop = !!esopRes.data;
  const hasCapTable = (shareholdersRes.data?.length ?? 0) > 0;
  const dataRoomDocs = (dataRoomRes.data ?? []).map((d: { name: string }) => d.name.toLowerCase());

  // Determine current stage from SVI score
  let currentStage: "pre-seed" | "seed" | "series-a";
  if (sviScore < 50) currentStage = "pre-seed";
  else if (sviScore < 70) currentStage = "seed";
  else currentStage = "series-a";

  // Auto-detect completed items from available signals
  const completedItems = new Set<string>();

  if (signals?.hasFounders || signals?.hasTeam) completedItems.add("team-mvp");
  if (signals?.hasDomainExpert) completedItems.add("team-domain");
  if (signals?.hasAdvisors) completedItems.add("team-advisors");
  if (signals?.hasMvp || signals?.hasProduct) completedItems.add("product-mvp");
  if (signals?.hasUsers) { completedItems.add("product-users"); completedItems.add("traction-waitlist"); }
  if (signals?.hasDemo || signals?.hasMvp) completedItems.add("product-demo");
  if (signals?.hasRevenue) { completedItems.add("traction-revenue"); }
  if (signals?.hasGrowth) completedItems.add("traction-growth");
  if (signals?.hasTestimonials) completedItems.add("traction-testimonials");
  if (signals?.hasTam || signals?.hasMarketSize) completedItems.add("market-tam");
  if (signals?.hasCompetitiveAnalysis) completedItems.add("market-competitive");
  if (signals?.hasProblemStatement) completedItems.add("market-problem");
  if (signals?.hasAbn || signals?.isIncorporated) completedItems.add("legal-incorporated");
  if (signals?.hasSha) completedItems.add("legal-sha");
  if (signals?.hasIpAssignment) completedItems.add("legal-ip");
  if (hasEsop) completedItems.add("legal-esop");
  if (signals?.hasPrivacyPolicy) completedItems.add("legal-privacy");
  if (signals?.hasProjections) completedItems.add("finance-projections");
  if (signals?.hasBurnRate) completedItems.add("finance-burn");
  if (signals?.hasUseOfFunds) completedItems.add("finance-use-of-funds");
  if (hasCapTable) completedItems.add("finance-cap-table");
  if (signals?.hasPitchDeck) completedItems.add("pitch-deck");
  if (signals?.hasExecutiveSummary) completedItems.add("pitch-executive");
  if (dataRoomDocs.length >= 5) completedItems.add("pitch-data-room");
  if (signals?.hasFundingAsk) completedItems.add("pitch-ask");

  // LinkedIn profiles auto-detected from team section
  if (signals?.hasLinkedIn) completedItems.add("team-linkedin");

  // Build checklist with completion status
  const checklist: ChecklistStatus[] = READINESS_CHECKLIST.map(item => ({
    id: item.id,
    category: item.category,
    item: item.item,
    weight: item.weight,
    completed: completedItems.has(item.id),
    relevantForStage: item.tier.includes(currentStage),
  }));

  // Score only items relevant for current stage
  const stageItems = checklist.filter(i => i.relevantForStage);
  const totalWeight = stageItems.reduce((s, i) => s + i.weight, 0);
  const completedWeight = stageItems.filter(i => i.completed).reduce((s, i) => s + i.weight, 0);
  const readinessScore = Math.round((completedWeight / totalWeight) * 100);

  // Readiness tier
  let readinessTier: string;
  let readinessBadge: string;
  if (readinessScore < 30) { readinessTier = "not-ready"; readinessBadge = "🔴 Not Ready"; }
  else if (readinessScore < 55) { readinessTier = "early"; readinessBadge = "🟡 Early Stage"; }
  else if (readinessScore < 75) { readinessTier = "getting-ready"; readinessBadge = "🔵 Getting Ready"; }
  else { readinessTier = "investor-ready"; readinessBadge = "🟢 Investor Ready"; }

  // Priority gaps — incomplete, high-weight, stage-relevant items
  const priorityGaps = checklist
    .filter(i => i.relevantForStage && !i.completed)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map(i => ({ id: i.id, category: i.category, item: i.item, weight: i.weight, impact: `+${i.weight}pts` }));

  // Comparable raises for current and next stage
  const stageMap: Record<string, number> = { "pre-seed": 0, "seed": 1, "series-a": 2 };
  const stageIdx = stageMap[currentStage];
  const comparables: ComparableRaise[] = AU_COMPARABLE_RAISES.slice(stageIdx, stageIdx + 2);

  // Group checklist by category
  const byCategory: Record<string, ChecklistStatus[]> = {};
  for (const item of checklist) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return NextResponse.json({
    ok: true,
    readinessScore,
    readinessTier,
    readinessBadge,
    currentStage,
    sviScore,
    completedCount: checklist.filter(i => i.relevantForStage && i.completed).length,
    totalCount: stageItems.length,
    checklist: byCategory,
    priorityGaps,
    comparables,
    targets: {
      preSeedReady: 50,
      seedReady: 70,
      seriesAReady: 85,
    },
  });
}
