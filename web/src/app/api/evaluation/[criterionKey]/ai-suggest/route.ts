// POST /api/evaluation/[criterionKey]/ai-suggest
//
// AI suggestions for improving a specific evaluation criterion.
// Costs 0.10 credits (criterion_ai_suggest).
// Returns actionable suggestions and quality tips.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import {
  CRITERION_KEYS,
  getCriterion,
  type CriterionKey,
} from "@/lib/evaluation-criteria";
import {
  getProjectIdFromRequest,
  findSVIAccountWithFallback,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ criterionKey: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  // Validate criterion key from route param
  const { criterionKey } = await params;
  if (!CRITERION_KEYS.includes(criterionKey as CriterionKey)) {
    return NextResponse.json({
      ok: false,
      error: `Invalid criterion key. Must be one of: ${CRITERION_KEYS.join(", ")}`,
    }, { status: 400 });
  }

  const def = getCriterion(criterionKey as CriterionKey)!;

  // Credit check
  const featureKey = "criterion_ai_suggest";
  const affordCheck = await canAfford(user.id, featureKey);
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  // Load the criterion data
  const projectId = await getProjectIdFromRequest();
  const account = await findSVIAccountWithFallback(user.email, projectId);

  let criterionRow: Record<string, unknown> | null = null;
  if (account) {
    const { data } = await supabase
      .from("evaluation_criteria")
      .select("*")
      .eq("account_id", account.id as string)
      .eq("criterion_key", criterionKey)
      .maybeSingle();
    criterionRow = data;
  }

  const textInput = (criterionRow?.text_input as string) ?? "";
  const files = (criterionRow?.files as Array<{ name: string; type: string }>) ?? [];
  const links = (criterionRow?.links as Array<{ url: string; label: string }>) ?? [];
  const currentQuality = (criterionRow?.quality_level as string) ?? "incomplete";
  const aiScore = criterionRow?.ai_score as number | null;
  const startupName = (account?.startup_name as string) ?? "Unknown Startup";

  // Build evidence summary for the AI
  const evidenceSummary = [
    textInput ? `**Text Input (${textInput.length} chars):** ${textInput.slice(0, 1000)}` : "No text input provided.",
    files.length > 0
      ? `**Files (${files.length}):** ${files.map((f) => `${f.name} (${f.type})`).join(", ")}`
      : "No files uploaded.",
    links.length > 0
      ? `**Links (${links.length}):** ${links.map((l) => `${l.label || l.url}`).join(", ")}`
      : "No links provided.",
  ].join("\n");

  try {
    const { text } = await callAI({
      system: `You are a senior startup advisor specialising in ${def.title} assessment for early-stage Australian startups. Your goal is to help founders strengthen their evidence for investor evaluation.

Return ONLY valid JSON with this exact structure:
{
  "suggestions": [
    "specific, actionable suggestion 1",
    "specific, actionable suggestion 2",
    "specific, actionable suggestion 3",
    "specific, actionable suggestion 4",
    "specific, actionable suggestion 5"
  ],
  "qualityTips": [
    "tip to move from current quality level to the next level",
    "tip about what evidence investors look for in this area",
    "tip about common mistakes to avoid"
  ]
}

Make every suggestion concrete and achievable within 1-2 weeks. Reference Australian startup context (ASIC, ATO R&D Tax, AU investor expectations) when relevant.`,
      user: `Analyse the "${def.title}" criterion for **${startupName}** and suggest improvements.

**Criterion:** ${def.title}
**Description:** ${def.subtitle}
**Current Quality:** ${currentQuality}
**AI Score:** ${aiScore !== null ? `${aiScore}/100` : "Not yet scored"}
**Min Evidence for "good":** ${def.minEvidence} items

**Guiding Questions:**
${def.guidingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

**Suggested File Types:** ${def.suggestedFileTypes.join(", ") || "None"}
**Suggested Links:** ${def.suggestedLinks.join(", ") || "None"}

**Current Evidence:**
${evidenceSummary}

Provide 5 specific suggestions to improve this criterion's evidence, plus 3 quality tips to help the founder reach the next quality level.`,
      maxTokens: 1500,
    });

    // Parse AI response
    let parsed: { suggestions: string[]; qualityTips: string[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    // Ensure arrays
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const qualityTips = Array.isArray(parsed.qualityTips) ? parsed.qualityTips : [];

    // Spend credits after successful AI call
    const spend = await spendCredits(user.id, featureKey, {
      criterionKey,
      currentQuality,
    });

    // Store suggestions in the criterion row if it exists
    if (criterionRow && account) {
      await supabase
        .from("evaluation_criteria")
        .update({
          ai_suggestions: suggestions,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", account.id as string)
        .eq("criterion_key", criterionKey);
    }

    return NextResponse.json({
      ok: true,
      criterionKey,
      suggestions,
      qualityTips,
      currentQuality,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:evaluation:ai-suggest]", err);
    return NextResponse.json({
      ok: false,
      error: "AI suggestion generation failed",
    }, { status: 500 });
  }
}
