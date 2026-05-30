// POST /api/svi/dimension-analyze
//
// Dimension-specific deep dive analysis. Aggregates all evidence for a given
// SVI dimension and produces a detailed assessment.
//
// Body: { dimension: 'ftv'|'mpc'|'ptd'|'tre'|'cgh'|'iri'|'lco'|'svm' }
// Returns: { ok, analysis (markdown + JSON), dimension, balance, creditsUsed }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";

export const dynamic = "force-dynamic";

const DIMENSION_INFO: Record<string, { label: string; weight: number; focus: string }> = {
  ftv: {
    label: "Founder & Team Value",
    weight: 15,
    focus: "Founder backgrounds, team composition, advisory board quality, domain-market fit, team gaps, hiring priorities. Compare founder experience to stage benchmarks. Assess co-founder complementarity and skill overlap.",
  },
  mpc: {
    label: "Market & Problem Clarity",
    weight: 18,
    focus: "TAM/SAM/SOM validation, problem-solution fit, customer discovery evidence, competitive landscape positioning, market timing assessment. Evaluate whether the market is ready, too early, or too late.",
  },
  ptd: {
    label: "Product & Technical Depth",
    weight: 12,
    focus: "Tech stack maturity, architecture review, code quality (if GitHub connected), product roadmap gaps, scalability assessment, build vs buy analysis. Assess demo/prototype quality for investor readiness.",
  },
  tre: {
    label: "Traction & Revenue Evidence",
    weight: 20,
    focus: "Revenue metrics validation (MRR/ARR), growth trajectory analysis, unit economics (ARPU, CAC, LTV), customer acquisition channels, churn signals, revenue milestone mapping for next fundraise stage.",
  },
  cgh: {
    label: "Cap Table & Governance Health",
    weight: 12,
    focus: "Cap table health vs AU seed norms (60-80% founder ownership pre-seed), vesting adequacy (4-year cliff), ESOP pool sizing (8-15% AU standard), governance maturity, shareholder agreement completeness, dilution modeling.",
  },
  iri: {
    label: "Investor Readiness Index",
    weight: 10,
    focus: "Pitch deck completeness (12-slide standard), financial model sanity, data room readiness, fundraise positioning, investor targeting (angel/VC/accelerator/grant), timeline estimation for fundraise.",
  },
  lco: {
    label: "Legal & Compliance",
    weight: 8,
    focus: "ABN/ASIC registration, IP protection gaps (patents, trademarks), contract coverage, regulatory landscape for sector, privacy compliance (Australian Privacy Act, GDPR), R&D Tax Incentive eligibility.",
  },
  svm: {
    label: "Strategic Vision & Moat",
    weight: 5,
    focus: "Moat durability scoring, network effect strength, data advantage assessment, switching cost evaluation, AI wrapper risk (if AI-dependent), 5-year defensibility outlook.",
  },
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  let body: { dimension?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const dim = body.dimension?.toLowerCase();
  if (!dim || !DIMENSION_INFO[dim]) {
    return NextResponse.json({
      ok: false,
      error: `Invalid dimension. Use: ${Object.keys(DIMENSION_INFO).join(", ")}`,
    }, { status: 400 });
  }

  const featureKey = `dim_${dim}_analysis`;
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

  // Gather data — with fallback for legacy records (project_id NULL)
  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);

  if (!account) {
    return NextResponse.json({ ok: false, error: "No SVI account found" }, { status: 404 });
  }

  const latestAnalysis = await findLatestAnalysisWithFallback(
    user.email,
    projectId,
    "raw_input, analysis_json",
  );

  // Evidence items for this dimension
  const { data: dimEvidence } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("account_id", account.id)
    .eq("dimension", dim);

  // All evidence (for cross-reference)
  const { data: allEvidence } = await supabase
    .from("svi_evidence")
    .select("evidence_type, label, dimension, svi_impact, confidence_level")
    .eq("account_id", account.id);

  const analysis = latestAnalysis?.analysis_json as Record<string, unknown> | null;
  const dims = analysis?.dimensionScores as Record<string, Record<string, unknown>> | undefined;
  const dimScore = dims?.[dim];
  const info = DIMENSION_INFO[dim];

  const evidenceList = (dimEvidence ?? []).map((e: Record<string, unknown>) =>
    `- [${e.evidence_type}/${e.confidence_level}] ${e.label} (+${e.svi_impact} SVI)`
  ).join("\n");

  try {
    const systemPrompt = `You are a senior startup analyst specializing in ${info.label} assessment.
Write in a friendly, supportive mentor tone with Australian startup context.

Return your analysis as ONLY valid JSON:
{
  "report": "detailed markdown report (500+ words covering all aspects of ${info.label})",
  "score": 0-100,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2"],
  "recommendations": [
    { "action": "specific action", "impact": "high/medium/low", "effort": "low/medium/high", "timeline": "timeframe" }
  ],
  "benchmarkComparison": "How this startup compares to typical startups at this stage for ${info.label}",
  "nextMilestone": "The single most impactful thing to do next for this dimension"
}`;

    const userMessage = `Analyze the ${info.label} dimension (${info.weight}% SVI weight) for this startup:

**Startup:** ${account.startup_name ?? "Unknown"}
**Current SVI:** ${account.current_svi ?? 100}
**Stage:** ${account.current_stage ?? 0}/7
**Current ${dim.toUpperCase()} Score:** ${dimScore?.score ?? "Not scored"}/100 (adjustment: ${dimScore?.adjustment ?? 0})

**Analysis Focus:**
${info.focus}

**Evidence for this dimension (${(dimEvidence ?? []).length} items):**
${evidenceList || "No evidence for this dimension yet"}

**All Evidence (${(allEvidence ?? []).length} items across all dimensions):**
${(allEvidence ?? []).map((e: Record<string, unknown>) => `- [${e.dimension}] ${e.label}`).join("\n") || "None"}

**Startup Description:**
${(String(latestAnalysis?.raw_input ?? "")).slice(0, 3000) || "No description available"}

${dimScore?.evidence ? `**Known Evidence:** ${JSON.stringify(dimScore.evidence).slice(0, 500)}` : ""}
${dimScore?.gaps ? `**Known Gaps:** ${JSON.stringify(dimScore.gaps).slice(0, 500)}` : ""}

Provide a thorough ${info.label} assessment.`;

    const { text } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens: 3072,
    });

    let analysisData: Record<string, unknown>;
    try {
      analysisData = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    // Spend credits
    const spend = await spendCredits(user.id, featureKey, { dimension: dim });

    // Store as evidence analysis
    await supabase
      .from("evidence_analyses")
      .insert({
        evidence_id: (dimEvidence?.[0] as Record<string, unknown>)?.id ?? null,
        account_id: account.id,
        tier: "standard",
        dimension: dim,
        feature_key: featureKey,
        analysis_json: analysisData,
        signals_extracted: {},
        svi_delta_applied: 0,
        credits_charged: FEATURE_COSTS[featureKey],
      })
      .then(({ error }) => {
        if (error) console.warn("[blockid:dim-analyze] store failed", error.message);
      });

    return NextResponse.json({
      ok: true,
      dimension: dim,
      dimensionLabel: info.label,
      analysis: analysisData,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:dimension-analyze]", err);
    return NextResponse.json({ ok: false, error: "Dimension analysis failed" }, { status: 500 });
  }
}
