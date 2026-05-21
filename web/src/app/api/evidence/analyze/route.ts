// POST /api/evidence/analyze
//
// "Analyze with BlockID AI" — runs tiered AI analysis on a specific evidence
// item, charges credits based on tier, stores results, and triggers SVI rescore.
//
// Body: { evidenceId: string, tier: 'scan' | 'standard' | 'deep_dive' }
// Returns: { ok, analysis, sviDelta, balance, creditsUsed }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Tier = "scan" | "standard" | "deep_dive";

const TIER_FEATURE_KEY: Record<Tier, string> = {
  scan: "evidence_scan",
  standard: "evidence_analyze",
  deep_dive: "evidence_deep_dive",
};

const TIER_MAX_TOKENS: Record<Tier, number> = {
  scan: 512,
  standard: 2048,
  deep_dive: 4096,
};

const TIER_LABELS: Record<Tier, string> = {
  scan: "Quick Scan",
  standard: "Standard Analysis",
  deep_dive: "Deep Dive",
};

// Build tier-specific system prompt
function buildSystemPrompt(tier: Tier): string {
  const base = `You are a startup analyst for BlockID.au, an AI-powered startup valuation platform.
You analyze evidence items submitted by founders to assess their startup's value across 8 SVI dimensions:
FTV (Founder & Team), MPC (Market & Problem), PTD (Product & Technical),
TRE (Traction & Revenue), CGH (Cap Table & Governance), IRI (Investor Readiness),
LCO (Legal & Compliance), SVM (Strategic Vision & Moat).

Respond in a friendly, supportive tone — like a mentor who wants the founder to succeed.
Use Australian startup context where relevant (ABN, ASIC, R&D Tax Incentive, etc.).`;

  if (tier === "scan") {
    return `${base}

Quick Scan mode: validate the evidence briefly. Return ONLY valid JSON:
{
  "valid": true/false,
  "relevanceScore": 0-100,
  "summary": "1-2 sentence assessment",
  "dimension": "primary SVI dimension this evidence supports (ftv/mpc/ptd/tre/cgh/iri/lco/svm)",
  "sviBoost": 0-5 (estimated additional SVI points from this evidence),
  "flags": ["any concerns or issues"]
}`;
  }

  if (tier === "standard") {
    return `${base}

Standard Analysis mode: extract structured signals and provide actionable insights. Return ONLY valid JSON:
{
  "summary": "2-3 paragraph analysis",
  "dimension": "primary SVI dimension",
  "secondaryDimensions": ["other relevant dimensions"],
  "signals": {
    "positive": ["signal 1", "signal 2"],
    "negative": ["concern 1"],
    "missing": ["what would strengthen this evidence"]
  },
  "strengths": ["key strength 1", "key strength 2"],
  "gaps": ["gap 1", "gap 2"],
  "sviBoost": 0-10,
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "investorPerspective": "How an investor would view this evidence"
}`;
  }

  // deep_dive
  return `${base}

Deep Dive mode: comprehensive analysis with benchmarking and roadmap. Return ONLY valid JSON:
{
  "executiveSummary": "3-4 paragraph executive summary",
  "dimension": "primary SVI dimension",
  "secondaryDimensions": ["other dimensions"],
  "signals": {
    "positive": ["detailed signal 1", "signal 2", "signal 3"],
    "negative": ["detailed concern 1", "concern 2"],
    "missing": ["what would complete the picture"]
  },
  "strengths": ["detailed strength 1", "strength 2", "strength 3"],
  "gaps": ["detailed gap 1", "gap 2"],
  "sviBoost": 0-15,
  "benchmarks": {
    "stageComparison": "How this compares to typical startups at this stage",
    "industryContext": "Industry-specific context"
  },
  "investorPerspective": "Detailed investor viewpoint — what questions they would ask",
  "recommendations": [
    { "action": "specific action", "impact": "expected impact", "effort": "low/medium/high", "timeline": "timeframe" }
  ],
  "roadmap": [
    { "step": 1, "action": "what to do next", "why": "reason", "timeline": "when" }
  ]
}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  let body: { evidenceId?: string; tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { evidenceId, tier: rawTier } = body;
  if (!evidenceId || !rawTier) {
    return NextResponse.json({ ok: false, error: "evidenceId and tier are required" }, { status: 400 });
  }

  const tier = rawTier as Tier;
  if (!TIER_FEATURE_KEY[tier]) {
    return NextResponse.json({ ok: false, error: "Invalid tier. Use: scan, standard, deep_dive" }, { status: 400 });
  }

  const featureKey = TIER_FEATURE_KEY[tier];

  // Credit check
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

  // Fetch the evidence item
  const { data: evidence } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("id", evidenceId)
    .single();

  if (!evidence) {
    return NextResponse.json({ ok: false, error: "Evidence not found" }, { status: 404 });
  }

  // Fetch the SVI account for context
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, email, startup_name, current_svi, current_stage")
    .eq("id", evidence.account_id)
    .single();

  // Fetch latest analysis for additional context
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("analysis_json, total_svi")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    const systemPrompt = buildSystemPrompt(tier);

    const contextParts = [
      `Evidence Type: ${evidence.evidence_type}`,
      `Evidence Label: ${evidence.label}`,
      `Dimension: ${evidence.dimension ?? "auto-detect"}`,
      `Confidence Level: ${evidence.confidence_level}`,
      `Current SVI Impact: +${evidence.svi_impact ?? 0}`,
    ];
    if (evidence.value_or_url) contextParts.push(`Evidence Content/URL: ${evidence.value_or_url}`);
    if (account?.startup_name) contextParts.push(`Startup: ${account.startup_name}`);
    if (account?.current_svi) contextParts.push(`Current SVI Score: ${account.current_svi}`);
    if (account?.current_stage != null) contextParts.push(`Stage: ${account.current_stage}`);
    if (latestAnalysis?.analysis_json) {
      const a = latestAnalysis.analysis_json as Record<string, unknown>;
      if (a.summary) contextParts.push(`AI Summary: ${String(a.summary).slice(0, 500)}`);
    }

    const userMessage = `Analyze this evidence item for the startup:\n\n${contextParts.join("\n")}\n\nProvide your ${TIER_LABELS[tier]} analysis.`;

    const { text } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens: TIER_MAX_TOKENS[tier],
    });

    // Parse AI response
    let analysisData: Record<string, unknown>;
    try {
      analysisData = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    const sviBoost = Math.min(15, Math.max(0, Number(analysisData.sviBoost ?? 0)));
    const dimension = String(analysisData.dimension ?? evidence.dimension ?? "general");

    // Spend credits
    const spend = await spendCredits(user.id, featureKey, {
      evidenceId,
      tier,
      dimension,
    });

    // Store analysis result
    const { data: inserted } = await supabase
      .from("evidence_analyses")
      .insert({
        evidence_id: evidenceId,
        account_id: evidence.account_id,
        tier,
        dimension,
        feature_key: featureKey,
        analysis_json: analysisData,
        signals_extracted: analysisData.signals ?? {},
        svi_delta_applied: sviBoost,
        credits_charged: FEATURE_COSTS[featureKey],
      })
      .select("id")
      .single();

    // Update evidence SVI impact if analysis found a higher boost
    if (sviBoost > (evidence.svi_impact ?? 0)) {
      await supabase
        .from("svi_evidence")
        .update({
          svi_impact: sviBoost,
          dimension,
          verified_at: new Date().toISOString(),
        })
        .eq("id", evidenceId);
    }

    // Trigger SVI rescore (fire-and-forget)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      analysisId: inserted?.id ?? null,
      tier,
      analysis: analysisData,
      sviBoost,
      dimension,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:evidence:analyze]", err);
    return NextResponse.json({ ok: false, error: "Analysis failed" }, { status: 500 });
  }
}
