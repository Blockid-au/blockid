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
  generatePricingTiers,
  type PricingTierSuggestion as LlmPricingTier,
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

// Derive model recommendation from sector
function modelForSector(sector: string): PricingTierSuggestion["model"] {
  if (sector === "marketplace") return "usage";
  if (sector === "ecommerce") return "flat";
  if (sector === "ai" || sector === "deeptech") return "usage";
  return "flat";
}

// Map LLM tier concepts → the shape the founder UI form binds to.
function mapLlmTiers(
  tiers: LlmPricingTier[],
  sector: string,
  stage: number,
  _name: string,
): PricingTierSuggestion[] {
  const bm = vcBenchmark(sector);
  const seedRange = AU_FINANCIAL_RESEARCH.fundingBenchmarks.seed.avgValuationRange;
  const isPreRevenue = stage <= 2;

  return tiers.map((t, i): PricingTierSuggestion => {
    const monthly = t.price_aud_monthly;
    const annual = monthly === 0 ? 0 : Math.round(monthly * 12 * 0.8);
    const isFree = monthly === 0;
    const isScale = i >= 2;
    const model: PricingTierSuggestion["model"] = isFree
      ? "freemium"
      : isScale
        ? "per_seat"
        : modelForSector(sector);
    const billing = isFree
      ? "Free forever — no credit card required"
      : isScale
        ? `Per-seat pricing for growing teams. AU SaaS median payback target: ${bm.cacPaybackMonthsTarget} months. Seed valuations in AU average A$${Math.round((seedRange.min + seedRange.max) / 2 / 1000000)}M (AVCAL 2024).`
        : `Save 20% with annual billing — A$${annual.toLocaleString()}/year. Gross margin target: ${bm.grossMarginTarget}% (${sector} benchmark, Bessemer 2025).${t.positioning ? " " + t.positioning : ""}`;
    return {
      name: t.name,
      model,
      price_monthly_aud: monthly,
      price_annual_aud: annual,
      billing_note: billing,
      features: t.features,
      target_segment: t.target_segment,
      cta_label: isFree
        ? "Start free"
        : isScale
          ? "Talk to us"
          : isPreRevenue
            ? "Join waitlist"
            : "Start 14-day trial",
      sort_order: i,
    };
  });
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

  // Ask the CFO LLM for pricing tier concepts, then map them onto the
  // form-shape the founder UI binds to. The LLM function handles its own
  // deterministic fallback on any provider/parse failure.
  const llmTiers = await generatePricingTiers({
    startupName: name,
    sector,
    stage,
  });

  const suggestions = mapLlmTiers(llmTiers, sector, stage, name);

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
