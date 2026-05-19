import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";

export async function POST(request: Request) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const body = await request.json() as {
      rawText: string;
      analysis: SVIAnalysis;
      email: string;
    };

    if (!body.rawText?.trim() || !body.analysis) {
      return NextResponse.json({ ok: false, error: "rawText and analysis required" }, { status: 400 });
    }

    const { analysis } = body;
    const stageLabel = SVI_STAGE_LABELS[analysis.stage ?? 0] ?? "Unknown";

    // Build context summary from analysis
    const dimSummary = (analysis.subs ?? []).map(s =>
      `- ${s.label}: ${s.value}/100 (${s.adjustment >= 0 ? "+" : ""}${s.adjustment})`
    ).join("\n");

    const riskSummary = (analysis.riskPenalties ?? []).map(r =>
      `- ${r.label}: -${r.points} points (${r.reason})`
    ).join("\n");

    const gapSummary = (analysis.evidenceGaps ?? []).map(g =>
      `- [${g.priority}] ${g.label}: ${g.action} (+${g.impact} SVI potential)`
    ).join("\n");

    const systemPrompt = `You are a senior startup analyst writing a detailed Startup Value Index (SVI) report for a founder.

Your report must be:
- Professional, evidence-based, and actionable
- Written in clear Australian business English
- Structured with clear sections
- Honest about weaknesses without being discouraging
- Include specific, actionable recommendations

Write in markdown format with headers, bullet points, and bold text for emphasis.`;

    const userMessage = `Generate a comprehensive SVI Report for this startup.

## Startup Description:
${body.rawText.slice(0, 3000)}

## SVI Score: ${analysis.totalSVI} (Base 100)
## Stage: ${analysis.stage ?? 0} — ${stageLabel}
## Evidence Confidence: ${Math.round(analysis.confidenceMultiplier * 100)}%

## Dimension Breakdown:
${dimSummary}

## Risk Penalties:
${riskSummary || "None identified"}

## Evidence Gaps:
${gapSummary || "None"}

## Summary: ${analysis.summary}

---

Write a 500-700 word SVI Report with these sections:
1. Executive Summary (2-3 sentences on overall SVI and what it means)
2. Key Strengths (3 bullet points — what's working well)
3. Critical Gaps (3-4 bullet points — what's holding the score back)
4. Stage Assessment (where they are in the journey and what it means for fundraising)
5. Evidence Roadmap (specific steps in priority order to raise SVI in next 30 days)
6. Investor Readiness Note (honest assessment of investor-readiness at current stage)
7. 30-Day Action Plan (5 specific actions with expected SVI impact for each)

Start each section with a markdown H2 header.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    return NextResponse.json({
      ok: true,
      report: content.text,
      wordCount: content.text.split(/\s+/).length,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[blockid:report]", err);
    return NextResponse.json({ ok: false, error: "Report generation failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
