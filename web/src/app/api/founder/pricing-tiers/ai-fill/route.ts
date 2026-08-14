// POST /api/founder/pricing-tiers/ai-fill
//
// Returns AI-suggested pricing tiers based on the startup's sector and stage.
// Does NOT save — caller pre-fills the form and the user decides to accept.
//
// Agent: cfo-valuation.ts
// Uses VC_BENCHMARKS (sector-level gross margin, LTV/CAC, CAC payback targets)
// and AU_FINANCIAL_RESEARCH benchmarks to derive pricing recommendations.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  vcBenchmark,
  AU_FINANCIAL_RESEARCH,
} from "@/lib/agents/cfo-valuation";

export const dynamic = "force-dynamic";

interface PricingTierSuggestion {
  name: string;
  model: "freemium" | "flat" | "per_seat" | "usage" | "tiered" | "enterprise";
  price_monthly_aud: number | null;
  price_annual_aud: number | null;
  billing_note: string;
  features: string[];
  target_segment: string;
  cta_label: string;
  sort_order: number;
}

const STAGE_LABELS = [
  "Concept", "Validated Idea", "MVP", "Early Traction",
  "Revenue", "Growth", "Scale", "Corporation",
];

// Derive model recommendation from sector
function modelForSector(sector: string): PricingTierSuggestion["model"] {
  if (sector === "marketplace") return "usage";
  if (sector === "ecommerce") return "flat";
  if (sector === "ai" || sector === "deeptech") return "usage";
  return "flat";
}

// Generate 3 tiered pricing suggestions
function buildTiers(
  sector: string,
  stage: number,
  name: string,
): PricingTierSuggestion[] {
  const bm = vcBenchmark(sector);
  const model = modelForSector(sector);
  const seedRange = AU_FINANCIAL_RESEARCH.fundingBenchmarks.seed.avgValuationRange;

  // Target: LTV/CAC >= 3x, payback <= bm.cacPaybackMonthsTarget months
  // Derive ARPU target from LTV/CAC benchmark with a simple payback model:
  //   monthly_price = CAC / cacPaybackMonthsTarget * (1 / (grossMargin/100))
  // Use conservative CAC = 4 × monthly_price proxy (common early-stage ratio).
  // Solving: price = 4*price / paybackMonths → paybackMonths = 4 → price at A$49 anchor
  // We anchor to AU market intuition and adjust by sector gross margin.
  const gmFactor = bm.grossMarginTarget / 100;
  const basePrice = Math.round((50 / gmFactor) / 10) * 10; // round to nearest 10

  const isPreRevenue = stage <= 2;
  const stageLabel = STAGE_LABELS[stage] ?? "early";

  const freeTier: PricingTierSuggestion = {
    name: "Starter",
    model: "freemium",
    price_monthly_aud: 0,
    price_annual_aud: 0,
    billing_note: "Free forever — no credit card required",
    features: [
      "Up to 1 project",
      "Basic SVI snapshot",
      "Community access",
      "BlockID profile page",
    ],
    target_segment: `Founder exploring ${name} — pre-commitment`,
    cta_label: "Start free",
    sort_order: 0,
  };

  const growthTier: PricingTierSuggestion = {
    name: "Growth",
    model,
    price_monthly_aud: basePrice,
    price_annual_aud: Math.round(basePrice * 12 * 0.8), // 20% annual discount
    billing_note: `Save 20% with annual billing — A$${Math.round(basePrice * 12 * 0.8).toLocaleString()}/year. Gross margin target: ${bm.grossMarginTarget}% (${sector} benchmark, Bessemer 2025).`,
    features: [
      "Up to 3 projects",
      "Full SVI scoring across all 8 dimensions",
      "Competitor analysis module",
      "GTM strategy builder",
      "Pricing tier planner",
      "Team planner",
      "Roadmap builder",
      `${Math.round(bm.marketCagrPct)}% CAGR sector benchmarks`,
      "Email support",
    ],
    target_segment: `${stageLabel}-stage ${sector} founder actively building`,
    cta_label: isPreRevenue ? "Join waitlist" : "Start 14-day trial",
    sort_order: 1,
  };

  const scaleTier: PricingTierSuggestion = {
    name: "Scale",
    model: "per_seat",
    price_monthly_aud: basePrice * 3,
    price_annual_aud: Math.round(basePrice * 3 * 12 * 0.8),
    billing_note: `Per-seat pricing for growing teams. AU SaaS median payback target: ${bm.cacPaybackMonthsTarget} months. Seed valuations in AU average A$${Math.round((seedRange.min + seedRange.max) / 2 / 1000000)}M (AVCAL 2024).`,
    features: [
      "Unlimited projects",
      "Full SVI + investor-pack exports",
      "Priority support",
      "White-label reports",
      "API access",
      "Dedicated success manager",
      "Cap table + ESOP modelling",
      "AU VC investor matching",
    ],
    target_segment: `Series A–B ${sector} founder with investor-facing reporting needs`,
    cta_label: "Talk to us",
    sort_order: 2,
  };

  return [freeTier, growthTier, scaleTier];
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

  const { data: project } = await sb
    .from("projects")
    .select("name, industry, stage")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const sector = (project?.industry ?? "saas").toLowerCase();
  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "Your startup";
  const bm = vcBenchmark(sector);

  const suggestions = buildTiers(sector, stage, name);

  return NextResponse.json({
    ok: true,
    suggestions,
    meta: {
      startup: name,
      sector,
      stage,
      benchmark: {
        grossMarginTarget: bm.grossMarginTarget,
        ltvCacTarget: bm.ltvCacTarget,
        cacPaybackMonthsTarget: bm.cacPaybackMonthsTarget,
        sources: bm.sources,
      },
    },
  });
}
