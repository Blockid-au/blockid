import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";
import {
  getLatestPositioningStatement,
  savePositioningStatement,
  getCompetitivePositioningContext,
  buildAnonymizedCompetitiveMatrix,
} from "@/lib/competitive-positioning";
import { projectScopeOrDenyFor } from "@/lib/project-members/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  // S18-A review P2-2 — viewer+ read; an explicit `?projectId=` is verified
  // (404 non-member) rather than trusted. Statements are keyed on the
  // project OWNER's user id so a member reads the owner's statement.
  const { searchParams } = new URL(request.url);
  const { scope, denied } = await projectScopeOrDenyFor(user, searchParams.get("projectId"), "viewer");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataUser = scope ? { ...user, id: scope.ownerUserId } : user;

  if (!projectId) {
    return NextResponse.json({ ok: true, statement: null });
  }

  try {
    const statement = await getLatestPositioningStatement(dataUser, projectId);
    return NextResponse.json({ ok: true, statement });
  } catch (err) {
    console.error("[competitive-positioning/positioning GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to fetch positioning statement" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      projectId?: string;
      prompt?: string;
    };

    // S18-A review P2-2 — editor+ write (generates + saves a statement on
    // the project); an explicit body.projectId is verified (404 non-member,
    // 403 viewer) rather than trusted. The statement is saved under the
    // project OWNER's user id — never an orphan (member id, owner project)
    // row.
    const { scope, denied } = await projectScopeOrDenyFor(user, body.projectId, "editor");
    if (denied) return denied;
    const projectId = scope?.projectId ?? null;
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "No active project found" }, { status: 400 });
    }
    const dataUser = { ...user, id: scope!.ownerUserId };

    // Step 1: Get competitive context
    const context = await getCompetitivePositioningContext(dataUser, projectId);

    // Step 2: Build anonymized matrix (no real competitor names passed to AI)
    const anonymizedMatrix = await buildAnonymizedCompetitiveMatrix(dataUser, projectId);

    // Step 3: Build AI prompt using ONLY anonymized competitor labels
    const competitorSummary = anonymizedMatrix.competitors
      .map(
        (c) =>
          `- ${c.label}: threat_level=${c.threat_level ?? "unknown"}, feature_parity=${c.feature_parity_percent}%`,
      )
      .join("\n");

    const systemPrompt = `You are a startup positioning strategist. Generate a concise positioning statement for a startup based on its competitive context.

Return ONLY valid JSON with this exact schema (no markdown, no extra text):
{
  "statement": "We're [category] for [target segment], [unique value proposition]",
  "category": "<product category, e.g. 'identity verification SaaS'>",
  "targetSegment": "<primary target segment, e.g. 'early-stage founders in Australia'>",
  "uniqueValueProp": "<what makes this startup different from competitors>"
}`;

    const userMessage = `Generate a positioning statement for a startup with the following competitive context:

Competitors analyzed: ${context.competitors_analyzed}
Total features extracted: ${context.total_features_extracted}
Average parity score vs competitors: ${context.avg_parity_score}%
Average differentiation score: ${context.avg_differentiation_score}%

Competitor overview (anonymized):
${competitorSummary || "No competitors analyzed yet."}

${body.prompt ? `Additional founder context: ${body.prompt}` : ""}

Generate a positioning statement in the format: "We're [category] for [segment], [unique_value_prop]"`;

    const { text } = await callAI({
      system: systemPrompt,
      user: userMessage,
      maxTokens: 512,
    });

    // Step 4: Parse AI response
    let parsed: {
      statement: string;
      category: string;
      targetSegment: string;
      uniqueValueProp: string;
    };

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

    // Step 5: Save positioning statement
    const saved = await savePositioningStatement(dataUser, projectId, {
      text: parsed.statement,
      category: parsed.category ?? null,
      targetSegment: parsed.targetSegment ?? null,
      uniqueValueProp: parsed.uniqueValueProp ?? null,
      competitorContextAnonymized: anonymizedMatrix as unknown as Record<string, unknown>,
      confidenceScore: 0.82,
      generatedBy: "ai",
    });

    return NextResponse.json({ ok: true, statement: saved });
  } catch (err) {
    console.error("[competitive-positioning/positioning POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to generate positioning statement" }, { status: 500 });
  }
}
