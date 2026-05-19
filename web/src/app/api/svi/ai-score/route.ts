import { NextResponse } from "next/server";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

export async function POST(request: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }
  const client = getAnthropicClient();

  try {
    const body = await request.json() as {
      rawText: string;
      deterministicSVI: number;
      deterministicAnalysis: SVIAnalysis;
    };

    if (!body.rawText?.trim()) {
      return NextResponse.json({ ok: false, error: "rawText is required" }, { status: 400 });
    }

    const systemPrompt = `You are an independent startup analyst scoring a startup using the BlockID Startup Value Index (SVI) framework.

The SVI starts at a baseline of 100. You must score 8 dimensions independently on a 0-100 scale:
1. FTV (Founder & Team Value, 15% weight) — founder experience, co-founder, advisors, domain fit
2. MPC (Market & Problem Clarity, 18% weight) — TAM/SAM, problem validation, customer proof
3. PTD (Product & Technical Depth, 12% weight) — code quality, demo, GitHub, roadmap
4. TRE (Traction & Revenue Evidence, 20% weight) — MRR/ARR, customers, analytics, growth
5. CGH (Cap Table & Governance Health, 12% weight) — equity split, vesting, SHA, board cadence
6. IRI (Investor Readiness Index, 10% weight) — pitch deck, data room, financial model
7. LCO (Legal & Compliance, 8% weight) — ABN/ASIC, IP, contracts, legal structure
8. SVM (Strategic Vision & Moat, 5% weight) — competitive moat, network effects, data advantage

You MUST return ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "aiSVI": <number 30-300>,
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "dimensions": {
    "ftv": <0-100>,
    "mpc": <0-100>,
    "ptd": <0-100>,
    "tre": <0-100>,
    "cgh": <0-100>,
    "iri": <0-100>,
    "lco": <0-100>,
    "svm": <0-100>
  },
  "recommendation": "<1-2 sentence overall recommendation>",
  "evidenceQuality": "<self_declared|public_url|document_uploaded|connected_source|transaction_data|third_party_verified>",
  "transparencyNote": "<brief explanation of how you scored this>"
}`;

    const userMessage = `Score this startup description independently:

---
${body.rawText.slice(0, 4000)}
---

The deterministic system scored this startup at SVI ${body.deterministicSVI}. Score it independently using ONLY the text above, then return the JSON.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let aiData: {
      aiSVI: number;
      strengths: string[];
      weaknesses: string[];
      dimensions: Record<string, number>;
      recommendation: string;
      evidenceQuality: string;
      transparencyNote: string;
    };

    try {
      aiData = JSON.parse(content.text);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    const deterministicSVI = body.deterministicSVI;
    const aiSVI = Math.round(aiData.aiSVI);
    const discrepancy = Math.abs(aiSVI - deterministicSVI);
    const comparison: "agree" | "higher" | "lower" =
      discrepancy <= 8 ? "agree"
      : aiSVI > deterministicSVI ? "higher"
      : "lower";

    return NextResponse.json({
      ok: true,
      aiSVI,
      comparison,
      discrepancy,
      strengths: aiData.strengths ?? [],
      weaknesses: aiData.weaknesses ?? [],
      aiDimensions: aiData.dimensions ?? {},
      recommendation: aiData.recommendation ?? "",
      transparencyNote: aiData.transparencyNote ?? "",
      evidenceQuality: aiData.evidenceQuality ?? "self_declared",
    });

  } catch (err) {
    console.error("[blockid:ai-score]", err);
    return NextResponse.json({ ok: false, error: "AI scoring failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
