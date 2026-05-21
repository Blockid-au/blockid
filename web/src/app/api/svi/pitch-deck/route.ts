import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI not configured" }, { status: 503 });
  }

  const affordCheck = await canAfford(user.id, "pitch_deck");
  if (!affordCheck.allowed) {
    return NextResponse.json({ ok: false, error: "Insufficient credits", balance: affordCheck.balance }, { status: 402 });
  }

  try {
    const { rawText, analysis } = await request.json() as { rawText: string; analysis: SVIAnalysis };

    const systemPrompt = `You are an expert pitch deck consultant who has helped 100+ startups raise funding in Australia. Create a detailed 12-slide pitch deck outline.

For each slide, provide:
1. Slide title
2. Key message (1 sentence)
3. Content bullet points (3-5 points)
4. Speaker notes (what to say, 2-3 sentences)
5. Visual suggestion (what graphic/chart to include)

Use plain language. Be specific to THIS startup — don't give generic advice.
Return ONLY valid JSON array of slide objects.`;

    const userPrompt = `Create a 12-slide pitch deck for this startup:

Description: ${rawText.slice(0, 3000)}

SVI Score: ${analysis.totalSVI}
Stage: ${analysis.stage} — ${analysis.stageLabel}
Key Strengths: ${analysis.subs?.filter(s => s.value >= 60).map(s => `${s.label}: ${s.value}/100`).join(", ")}
Key Gaps: ${analysis.evidenceGaps?.slice(0, 3).map(g => g.label).join(", ")}

Return a JSON array of 12 objects with: { "slide": 1-12, "title": "...", "keyMessage": "...", "bullets": ["..."], "speakerNotes": "...", "visual": "..." }`;

    const { text } = await callAI({ system: systemPrompt, user: userPrompt, maxTokens: 4096 });

    let slides;
    try {
      slides = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      slides = match ? JSON.parse(match[0]) : [];
    }

    const spend = await spendCredits(user.id, "pitch_deck", { email: user.email });

    return NextResponse.json({
      ok: true,
      slides,
      balance: spend.balance,
    });
  } catch (err) {
    console.error("[pitch-deck]", err);
    return NextResponse.json({ ok: false, error: "Generation failed" }, { status: 500 });
  }
}
