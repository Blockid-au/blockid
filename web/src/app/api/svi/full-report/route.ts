// POST /api/svi/full-report
//
// Comprehensive SVI report — consolidates all evidence analyses into a unified
// report covering tech, marketing, go-to-market, finance, investor readiness,
// team, and legal. No page limit for paid users.
//
// Body: { tier: 'standard' | 'premium' }
// Returns: { ok, report (markdown), wordCount, balance, creditsUsed }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ReportTier = "standard" | "premium";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  let body: { tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const tier: ReportTier = body.tier === "premium" ? "premium" : "standard";
  const featureKey = tier === "premium" ? "full_report_premium" : "full_report_standard";

  const affordCheck = await canAfford(user.id, featureKey);
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  // Gather all data for the report
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, email, startup_name, current_svi, current_stage")
    .eq("email", user.email)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ ok: false, error: "No SVI account found — run an analysis first" }, { status: 404 });
  }

  // Latest analysis
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("raw_input, total_svi, analysis_json")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // All evidence items
  const { data: evidenceItems } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  // All evidence analyses
  const { data: evidenceAnalyses } = await supabase
    .from("evidence_analyses")
    .select("tier, dimension, analysis_json, feature_key")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  const analysis = latestAnalysis?.analysis_json as Record<string, unknown> | null;
  const rawText = (latestAnalysis?.raw_input ?? "").slice(0, 6000);
  const svi = account.current_svi ?? latestAnalysis?.total_svi ?? 100;
  const stage = account.current_stage ?? 0;

  // Build evidence summary
  const evidenceSummary = (evidenceItems ?? []).map((e: Record<string, unknown>) =>
    `- [${e.evidence_type}] ${e.label} (${e.confidence_level}, +${e.svi_impact} SVI, dimension: ${e.dimension})`
  ).join("\n");

  // Build previous analyses summary
  const analysesSummary = (evidenceAnalyses ?? []).map((a: Record<string, unknown>) => {
    const aj = a.analysis_json as Record<string, unknown>;
    const summary = aj?.summary ?? aj?.executiveSummary ?? JSON.stringify(aj).slice(0, 300);
    return `- [${a.tier}/${a.dimension}] ${summary}`;
  }).join("\n");

  // Dimension scores
  const dims = analysis?.dimensionScores as Record<string, Record<string, unknown>> | undefined;
  const dimSummary = dims
    ? Object.entries(dims).map(([key, d]) =>
        `${key.toUpperCase()}: ${d.score ?? 0}/100 (adjustment: ${d.adjustment ?? 0}, weight: ${d.weight ?? 0}%)`
      ).join("\n")
    : "No dimension scores available";

  const stageLabels = ["Concept", "Validated Idea", "MVP/Prototype", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"];

  const maxTokens = tier === "premium" ? 8192 : 4096;

  const sections = tier === "premium"
    ? `Write the report in these sections:

## Executive Summary (Investor Memo Format)
## Founder & Team Assessment
## Market Opportunity & Problem Validation
## Product & Technical Maturity
## Traction & Revenue Analysis
## Go-to-Market Strategy Assessment
## Cap Table & Governance Health
## Investor Readiness Assessment
## Legal & Compliance Status
## Strategic Vision & Competitive Moat
## Financial Projections & Unit Economics
## Risk Assessment & Mitigation
## Competitive Intelligence Summary
## 90-Day Action Roadmap (Week by Week)
## Board-Ready Executive Summary (1-page format)

Target: 5000+ words. Be thorough and data-driven. Include specific numbers and benchmarks where possible.`
    : `Write the report in these sections:

## Executive Summary
## Founder & Team Assessment
## Market & Problem Analysis
## Product & Technical Review
## Traction & Revenue Evidence
## Go-to-Market Readiness
## Cap Table & Governance
## Investor Readiness
## Legal & Compliance
## Strategic Vision & Moat
## Risk Assessment
## 30-Day Action Plan

Target: 2000+ words. Be specific and actionable.`;

  try {
    const systemPrompt = `You are a senior startup analyst at BlockID.au writing a comprehensive startup valuation report.

Write in a friendly, encouraging mentor tone — supportive but honest.
Use Australian startup context (ABN, ASIC, R&D Tax Incentive, ASX, etc.).
Be specific with numbers, benchmarks, and actionable recommendations.
Reference the evidence items when making assessments.
Do NOT artificially limit the report length — write as much as needed to be thorough.

Format the report in clean Markdown with proper headings, bullet points, and bold text for key insights.`;

    const userMessage = `Generate a ${tier === "premium" ? "Premium" : "Standard"} Full Report for this startup:

**Startup:** ${account.startup_name ?? "Unknown"}
**Current SVI Score:** ${svi}
**Stage:** ${stageLabels[stage] ?? "Unknown"} (${stage}/7)

**Startup Description:**
${rawText || "No description available"}

**Dimension Scores:**
${dimSummary}

**Evidence Vault (${(evidenceItems ?? []).length} items):**
${evidenceSummary || "No evidence submitted yet"}

**Previous AI Analyses:**
${analysesSummary || "No analyses run yet"}

${analysis?.summary ? `**AI Summary:** ${String(analysis.summary).slice(0, 1000)}` : ""}
${analysis?.risks ? `**Risk Flags:** ${JSON.stringify(analysis.risks).slice(0, 500)}` : ""}
${analysis?.evidenceGaps ? `**Evidence Gaps:** ${JSON.stringify(analysis.evidenceGaps).slice(0, 500)}` : ""}

${sections}`;

    const { text: report } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens,
    });

    // Spend credits after success
    const spend = await spendCredits(user.id, featureKey, {
      tier,
      svi,
      stage,
      evidenceCount: (evidenceItems ?? []).length,
    });

    const wordCount = report.split(/\s+/).length;

    return NextResponse.json({
      ok: true,
      report,
      wordCount,
      tier,
      generatedAt: new Date().toISOString(),
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:full-report]", err);
    return NextResponse.json({ ok: false, error: "Report generation failed" }, { status: 500 });
  }
}
