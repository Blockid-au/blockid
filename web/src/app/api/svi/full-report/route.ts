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
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";

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

  const projectId = await getProjectIdFromRequest();

  // SVI account — with fallback for legacy records (project_id NULL)
  const account = await findSVIAccountWithFallback(user.email, projectId);

  if (!account) {
    return NextResponse.json({ ok: false, error: "No SVI account found for this project — run an analysis first" }, { status: 404 });
  }

  // Latest analysis — with fallback for legacy records
  const latestAnalysis = await findLatestAnalysisWithFallback(
    user.email,
    projectId,
    "raw_input, total_svi, analysis_json",
  );

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

  // Previously purchased report sections (paid content to reuse)
  let savedSectionsContent = "";
  if (latestAnalysis?.id) {
    const { data: savedSections } = await supabase
      .from("report_sections")
      .select("section_id, depth, content, word_count")
      .eq("analysis_id", latestAnalysis.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (savedSections && savedSections.length > 0) {
      savedSectionsContent = (savedSections as Record<string, unknown>[])
        .filter((s) => s.depth === "full" && s.content)
        .map((s) => `### Previously Generated: ${s.section_id} (${s.word_count} words)\n${String(s.content).slice(0, 3000)}`)
        .join("\n\n");
    }
  }

  const analysis = latestAnalysis?.analysis_json as Record<string, unknown> | null;
  const rawText = String(latestAnalysis?.raw_input ?? "");
  const svi = Number(account.current_svi ?? latestAnalysis?.total_svi ?? 100);
  const stage = Number(account.current_stage ?? 0);

  // Build evidence summary
  const evidenceSummary = (evidenceItems ?? []).map((e: Record<string, unknown>) =>
    `- [${e.evidence_type}] ${e.label} (${e.confidence_level}, +${e.svi_impact} SVI, dimension: ${e.dimension})`
  ).join("\n");

  // Build previous analyses summary (include full content for paid analyses)
  const analysesSummary = (evidenceAnalyses ?? []).map((a: Record<string, unknown>) => {
    const aj = a.analysis_json as Record<string, unknown>;
    const summary = aj?.summary ?? aj?.executiveSummary ?? JSON.stringify(aj).slice(0, 1500);
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

  // No artificial token limit for paid users — use maximum available
  const maxTokens = tier === "premium" ? 16384 : 8192;

  const sections = tier === "premium"
    ? `Write the report in ALL of these sections — be EXHAUSTIVE, no word limits, analyse every dimension thoroughly:

## Executive Summary (Investor Memo Format)
## Founder & Team Assessment (background, experience, gaps, team composition, AI agents)
## Market Opportunity & Problem Validation (TAM/SAM/SOM, customer interviews, market timing)
## Product & Technical Maturity (architecture, stack, AI capabilities, blockchain, security)
## Traction & Revenue Analysis (users, analyses, engagement, revenue model, unit economics)
## Go-to-Market Strategy Assessment (channels, content, SEO, partnerships, community)
## Cap Table & Governance Health (equity structure, vesting, ESOP, shareholders agreement)
## Investor Readiness Assessment (pitch deck, data room, financial model, raise strategy)
## Legal & Compliance Status (ASIC, ABN, IP, contracts, AFSL, privacy, ESIC eligibility)
## Strategic Vision & Competitive Moat (first-mover, data advantage, network effects, switching costs)
## Financial Projections & Unit Economics (MRR targets, burn rate, runway, margins, LTV:CAC)
## Risk Assessment & Mitigation (market, execution, technical, regulatory, competition)
## Competitive Intelligence Summary (Carta, Pulley, Cake Equity, AI tools — detailed comparison)
## 90-Day Action Roadmap (Week by Week with specific deliverables and KPIs)
## Board-Ready Executive Summary (1-page format for investors)
## Australian Market Deep Dive (ESIC, R&D Tax Incentive, accelerator landscape, AU-specific opportunities)

NO WORD LIMIT. Write as comprehensively as the analysis demands. Each section should be a thorough essay with data, benchmarks, and actionable recommendations. Target: 8000-15000 words total.`
    : `Write the report in ALL of these sections — be thorough and comprehensive:

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
## Financial Projections
## Risk Assessment
## Competitive Landscape
## 30-Day Action Plan

NO WORD LIMIT for paid users. Write as comprehensively as needed. Each section should be a detailed analysis with specific numbers and actionable recommendations. Target: 5000-8000 words total.`;

  try {
    const systemPrompt = `You are a senior startup analyst, management consultant, and investor advisor at BlockID.au writing an EXHAUSTIVE startup valuation report.

THIS IS A PAID REPORT — THERE ARE NO PAGE LIMITS OR WORD LIMITS. Write the most comprehensive, thorough analysis possible. Every section should be a detailed essay, not a summary.

Writing guidelines:
- Write in flowing NARRATIVE PROSE — connected paragraphs, not just bullet lists
- Be specific: name real competitors, cite real market data, provide specific numbers
- Use Australian startup context: ESIC, ASIC, ABN, R&D Tax Incentive, ABS data, ASX
- Reference the evidence items and dimension scores when making assessments
- Frame weaknesses constructively: "the gap between current state and opportunity"
- Include benchmarks: "companies at your stage typically..."
- End each section with 3-5 SPECIFIC, ACTIONABLE next steps
- Be honest but encouraging — supportive mentor tone
- Where possible, include visual-friendly formatting: comparison tables, score breakdowns, metric dashboards in markdown table format
- Use infographic-style data presentation: key metrics in bold callouts, progress bars using Unicode blocks, and structured data tables

Format: Clean Markdown with ## headings, ### sub-headings, **bold** for key insights, comparison tables, metric dashboards, and structured recommendations.
When presenting scores or comparisons, use markdown tables for clarity. For key metrics, use callout blocks (> **Key Metric:** value).`;

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

${savedSectionsContent ? `**Previously Purchased Section Analyses (incorporate and expand on these — the user already paid for them):**
${savedSectionsContent}

IMPORTANT: The user has already paid for the section analyses above. Build upon them, expand their insights, and ensure consistency. Do NOT contradict or repeat them verbatim — enrich and synthesise them into the full report.
` : ""}
${sections}`;

    const { text: report } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens,
      timeoutMs: 180_000, // 3 minutes — full reports need significant generation time
    });

    // Spend credits after success
    const spend = await spendCredits(user.id, featureKey, {
      tier,
      svi,
      stage,
      evidenceCount: (evidenceItems ?? []).length,
    });

    const wordCount = report.split(/\s+/).length;

    // Save full report for later viewing (so users can revisit without re-generating)
    if (latestAnalysis?.id) {
      const sectionId = tier === "premium" ? "full_report_premium" : "full_report_standard";
      await supabase.from("report_sections").upsert(
        {
          analysis_id: latestAnalysis.id as string,
          user_id: user.id,
          section_id: sectionId,
          depth: "full" as const,
          content: report,
          word_count: wordCount,
          credits_cost: FEATURE_COSTS[featureKey],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "analysis_id,section_id,depth" },
      );
    }

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
