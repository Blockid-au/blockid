// POST /api/evaluation/[criterionKey]/ai-score
//
// AI scoring for a specific evaluation criterion (0-100).
// Costs 0.25 credits (criterion_ai_score).
// Updates ai_score, ai_summary, and quality_level in the database.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import {
  CRITERION_KEYS,
  getCriterion,
  computeQuality,
  type CriterionKey,
} from "@/lib/evaluation-criteria";
import {
  getProjectIdFromRequest,
  findSVIAccountWithFallback,
  findOrCreateSVIAccount,
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
  const featureKey = "criterion_ai_score";
  const affordCheck = await canAfford(user.id, featureKey);
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  // Resolve account and criterion data
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
  const files = (criterionRow?.files as Array<{ name: string; type: string; size: number }>) ?? [];
  const links = (criterionRow?.links as Array<{ url: string; label: string }>) ?? [];
  const startupName = (account?.startup_name as string) ?? "Unknown Startup";
  const currentSVI = (account?.current_svi as number) ?? null;

  // Check that there is at least some evidence to score
  const hasText = textInput.trim().length > 0;
  const hasFiles = files.length > 0;
  const hasLinks = links.length > 0;
  if (!hasText && !hasFiles && !hasLinks) {
    return NextResponse.json({
      ok: false,
      error: "No evidence to score. Add text, files, or links before requesting an AI score.",
    }, { status: 400 });
  }

  // Build evidence summary
  const evidenceSummary = [
    hasText
      ? `**Text Description (${textInput.length} chars):**\n${textInput.slice(0, 2000)}`
      : "No text description.",
    hasFiles
      ? `**Uploaded Files (${files.length}):**\n${files.map((f) => `- ${f.name} (${f.type}, ${Math.round(f.size / 1024)}KB)`).join("\n")}`
      : "No files uploaded.",
    hasLinks
      ? `**Links (${links.length}):**\n${links.map((l) => `- ${l.label || l.url}: ${l.url}`).join("\n")}`
      : "No links provided.",
  ].join("\n\n");

  try {
    const { text } = await callAI({
      system: `You are an expert startup evaluator scoring the "${def.title}" criterion for an Australian startup. You assess evidence quality, completeness, and investor-readiness.

Score on a 0-100 scale:
- 0-20: Incomplete — missing critical evidence, vague or no detail
- 21-40: Basic — minimal evidence, lacks depth or supporting data
- 41-60: Good — reasonable evidence with some gaps, room for improvement
- 61-80: Strong — solid evidence, most areas covered, minor gaps
- 81-100: Exceptional — comprehensive, investor-ready, well-documented

Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment of the evidence quality>",
  "suggestions": [
    "<specific improvement to increase score>",
    "<specific improvement to increase score>",
    "<specific improvement to increase score>"
  ]
}

Be honest but encouraging. Reference Australian startup norms and investor expectations where relevant.`,
      user: `Score the "${def.title}" criterion for **${startupName}**.

**Criterion:** ${def.title}
**Description:** ${def.subtitle}
**Weight in overall evaluation:** ${def.weight}%
**Primary SVI Dimension:** ${def.primaryDimension}
${currentSVI !== null ? `**Current SVI Score:** ${currentSVI}` : ""}

**Guiding Questions (what investors look for):**
${def.guidingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

**Evidence Provided:**
${evidenceSummary}

Score this criterion's evidence from 0 to 100 and provide a brief summary with 3 improvement suggestions.`,
      maxTokens: 1000,
    });

    // Parse AI response
    let parsed: { score: number; summary: string; suggestions: string[] };
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

    // Validate and clamp score
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    // Spend credits after successful AI call
    const spend = await spendCredits(user.id, featureKey, {
      criterionKey,
      score,
    });

    // Recompute quality level with the new AI score
    const qualityLevel = computeQuality({
      text_input: textInput,
      files,
      links,
      ai_score: score,
    });

    // Ensure account exists for the upsert
    const accountId = account
      ? (account.id as string)
      : await findOrCreateSVIAccount(user.email, projectId);

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "Could not resolve account" }, { status: 500 });
    }

    // Update the criterion row with AI results
    const { error: updateErr } = await supabase
      .from("evaluation_criteria")
      .upsert(
        {
          account_id: accountId,
          project_id: projectId,
          criterion_key: criterionKey,
          ai_score: score,
          ai_summary: summary,
          ai_suggestions: suggestions,
          quality_level: qualityLevel,
          primary_dimension: def.primaryDimension,
          secondary_dimension: def.secondaryDimensions[0] ?? null,
          // Preserve existing evidence (don't overwrite with defaults)
          text_input: textInput,
          files,
          links,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,criterion_key" },
      );

    if (updateErr) {
      console.error("[blockid:evaluation:ai-score] upsert failed", updateErr);
      // Score was already computed and credits spent — return the result anyway
    }

    return NextResponse.json({
      ok: true,
      criterionKey,
      score,
      summary,
      suggestions,
      qualityLevel,
      balance: spend.balance,
      creditsUsed: FEATURE_COSTS[featureKey],
    });
  } catch (err) {
    console.error("[blockid:evaluation:ai-score]", err);
    return NextResponse.json({
      ok: false,
      error: "AI scoring failed",
    }, { status: 500 });
  }
}
