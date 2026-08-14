// POST /api/founder/gtm/ai-fill
//
// Returns AI-suggested GTM strategy fields based on the startup's profile.
// Does NOT save — caller pre-fills the form and the user decides to accept.
//
// Wiring: strategic fields (positioning, channels, launch plan, metrics)
// come from cmo-market-research.generateGtmStrategy → callAI() free chain.
// Deterministic scaffolding (segment, sales motion, price anchor) is still
// derived from AU benchmarks so the form is always fully pre-filled.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  AU_MARKET_DATA,
  CONTENT_BENCHMARKS,
  AU_MARKET_BENCHMARKS,
  forecastSGETrafficImpact,
  generateGtmStrategy,
  type GtmChannel,
} from "@/lib/agents/cmo-market-research";

export const dynamic = "force-dynamic";

interface GtmSuggestion {
  target_segment: string;
  problem_statement: string;
  value_prop: string;
  positioning: string;
  primary_channel: string;
  secondary_channels: string[];
  sales_motion: string;
  price_anchor: string;
  launch_plan: string;
  north_star_metric: string;
  north_star_target: number;
}

const STAGE_LABELS = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
];

function salesMotion(stage: number): string {
  if (stage <= 2) return "founder-led-outbound";
  if (stage <= 4) return "sales-assisted";
  return "enterprise";
}

// North star metric by sector (fallback if LLM didn't return usable metrics)
function northStarMetric(sector: string, stage: number): { metric: string; target: number } {
  const isEarly = stage <= 3;
  if (sector === "saas" || sector === "fintech") {
    return isEarly
      ? { metric: "Monthly Recurring Revenue (A$)", target: 10000 }
      : { metric: "Annual Recurring Revenue (A$)", target: 500000 };
  }
  if (sector === "marketplace") {
    return isEarly
      ? { metric: "Gross Merchandise Value (A$)", target: 50000 }
      : { metric: "Monthly Active Buyers", target: 1000 };
  }
  return isEarly
    ? { metric: "Paying customers", target: 10 }
    : { metric: "Monthly Recurring Revenue (A$)", target: 50000 };
}

function priceAnchor(sector: string, stage: number): string {
  if (sector === "saas") {
    if (stage <= 2) return "A$49–$99/month (early-adopter pricing; target: <18-month CAC payback)";
    if (stage <= 4) return "A$99–$299/month (growth pricing; LTV/CAC target ≥3x)";
    return "A$299–$999/month + enterprise custom (Bessemer Cloud Index 2025 benchmark)";
  }
  if (sector === "fintech") {
    return "A$79–$199/month or % of transaction value (Cut Through Venture 2025 fintech comps)";
  }
  if (sector === "marketplace") {
    return "8–15% take rate on GMV (Airtasker/Expert360 AU benchmark)";
  }
  return "A$49–$149/month (AU B2B SaaS median; adjust via BlockID SVI pricing module)";
}

function contentNote(): string {
  const forecast = forecastSGETrafficImpact(10000);
  const lossRate = Math.round(((10000 - forecast.expectedClicks) / 10000) * 100);
  return `Note: SGE/AI Overviews are reducing organic CTR by ~${lossRate}% (AU_MARKET_BENCHMARKS 2024-2026). Prioritise E-E-A-T content (target ${CONTENT_BENCHMARKS.targetB2BBlogLength}+ words/post) and LinkedIn (${Math.round(CONTENT_BENCHMARKS.linkedinOrganicCTR * 100)}% organic CTR) to offset.`;
}

function valueProp(name: string, sector: string, stage: number): string {
  const stageLabel = STAGE_LABELS[stage] ?? "startup";
  if (sector === "saas") {
    return `${name} helps ${stageLabel}-stage SaaS founders reduce time-to-revenue by automating [core workflow] — without the complexity of enterprise tools.`;
  }
  if (sector === "fintech") {
    return `${name} gives AU ${stageLabel} fintech operators real-time financial intelligence so they can make faster, investor-grade decisions.`;
  }
  return `${name} gives ${stageLabel} founders the navigation tools to hit their next milestone faster — with AU-native benchmarks and investor-ready outputs.`;
}

/**
 * Pick a primary channel from the LLM output (highest priority first). If the
 * LLM returned nothing usable, fall back to a stage-based default.
 */
function pickPrimaryChannel(channels: GtmChannel[], stage: number, sector: string): string {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const top = [...channels].sort((a, b) => rank[b.priority] - rank[a.priority])[0];
  if (top?.name) return top.name;
  if (stage <= 1) return "founder-led-outbound";
  if (stage === 2) return "communities";
  if (stage === 3) return sector === "saas" || sector === "fintech" ? "seo-content" : "founder-led-outbound";
  return "product-led";
}

function pickSecondaryChannels(channels: GtmChannel[], stage: number): string[] {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const sorted = [...channels].sort((a, b) => rank[b.priority] - rank[a.priority]);
  const rest = sorted.slice(1).map((c) => c.name).filter(Boolean);
  if (rest.length > 0) return rest.slice(0, 3);
  if (stage <= 1) return ["communities", "events"];
  if (stage === 2) return ["seo-content", "partnerships"];
  if (stage <= 4) return ["paid-ads", "partnerships"];
  return ["paid-ads", "events", "partnerships"];
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
    .select("name, industry, stage, description")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const sector = (project?.industry ?? "saas").toLowerCase();
  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "Your startup";

  const gtm = await generateGtmStrategy({
    startupName: name,
    sector,
    stage,
    description: project?.description ?? undefined,
  });

  const nsm = northStarMetric(sector, stage);
  // Prefer the first LLM-suggested metric name if it looks quantitative.
  const llmMetricName = gtm.keyMetrics[0];
  const nsMetric = llmMetricName && llmMetricName.length < 80 ? llmMetricName : nsm.metric;

  const launchPlan =
    gtm.first90Days.length > 0
      ? gtm.first90Days.join(" ") + ` Track: ${nsMetric} target ${nsm.target.toLocaleString()}.`
      : `Week 1–2: activate 20+ founder discovery interviews (${STAGE_LABELS[stage]} segment). Week 3–4: launch landing page with SVI waitlist. Month 2: onboard 5 design partners at discounted pricing. Month 3: first public cohort. Track: ${nsm.metric} target A$${nsm.target.toLocaleString()}.`;

  const suggestion: GtmSuggestion = {
    target_segment: `AU ${sector.toUpperCase()} founders and operators at ${STAGE_LABELS[stage] ?? "early"} stage (TAM: ${AU_MARKET_DATA.ACTIVE_STARTUPS.toLocaleString()} active AU startups)`,
    problem_statement: `${STAGE_LABELS[stage] ?? "Early-stage"} founders lack structured, AU-native navigation tools to progress from ${STAGE_LABELS[Math.max(0, stage - 1)] ?? "concept"} to ${STAGE_LABELS[Math.min(7, stage + 1)] ?? "scale"} with investor-grade evidence.`,
    value_prop: valueProp(name, sector, stage),
    positioning:
      gtm.positioning ||
      `${name} is the ${sector === "saas" ? "only AU-native" : "first"} startup navigation system with SVI scoring — not just another ${sector} tool. Strategic navigation commands ${AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN}–${AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX}x revenue multiples vs ${AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MIN}–${AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MAX}x for utility tools.`,
    primary_channel: pickPrimaryChannel(gtm.channels, stage, sector),
    secondary_channels: pickSecondaryChannels(gtm.channels, stage),
    sales_motion: salesMotion(stage),
    price_anchor: priceAnchor(sector, stage),
    launch_plan: launchPlan,
    north_star_metric: nsMetric,
    north_star_target: nsm.target,
  };

  return NextResponse.json({
    ok: true,
    suggestion,
    meta: {
      startup: name,
      sector,
      stage,
      note: contentNote(),
    },
  });
}
