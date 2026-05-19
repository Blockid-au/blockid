import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { canAfford, spendCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResearchResult {
  ok: boolean;
  marketScore: number;
  competitiveScore: number;
  growthScore: number;
  competitors: Array<{
    name: string;
    url: string;
    description: string;
    threat: "high" | "medium" | "low";
  }>;
  marketInsights: string[];
  competitiveInsights: string[];
  growthInsights: string[];
  sources: Array<{ title: string; url: string }>;
  summary: string;
}

const SYSTEM_PROMPT = `You are a startup competitive intelligence analyst. Research market data and competitors using web search, then return ONLY a valid JSON object.

Return this exact JSON structure (no markdown, no extra text):
{
  "marketScore": <integer 0-100>,
  "competitiveScore": <integer 0-100, higher = more differentiated>,
  "growthScore": <integer 0-100>,
  "competitors": [
    { "name": "<company>", "url": "<website>", "description": "<1 sentence>", "threat": "<high|medium|low>" }
  ],
  "marketInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "competitiveInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "growthInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "sources": [{ "title": "<page title>", "url": "<url>" }],
  "summary": "<2-3 sentence market and competitive summary>"
}

Scoring guide:
- marketScore 80-100: Large, fast-growing market. 50-79: Medium/niche. 0-49: Small/saturated.
- competitiveScore 80-100: Very differentiated, few competitors. 50-79: Some competitors. 0-49: Crowded.
- growthScore 80-100: 20%+ YoY, strong investor interest. 50-79: Steady. 0-49: Mature/declining.`;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  // ── Credit check ────────────────────────────────────────────────────
  const affordCheck = await canAfford(user.id, "research");
  if (!affordCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: "Insufficient credits",
      balance: affordCheck.balance,
      cost: affordCheck.cost,
    }, { status: 402 });
  }

  try {
    const body = await request.json() as {
      description: string;
      keywords?: string;
      websiteUrl?: string;
      industry?: string;
    };

    if (!body.description?.trim()) {
      return NextResponse.json({ ok: false, error: "Description is required" }, { status: 400 });
    }

    const searchContext = [
      body.description.slice(0, 500),
      body.keywords ? `Keywords: ${body.keywords}` : "",
      body.websiteUrl ? `Website: ${body.websiteUrl}` : "",
      body.industry ? `Industry: ${body.industry}` : "",
    ].filter(Boolean).join("\n");

    const userMessage = `Research this startup and its competitive landscape:

${searchContext}

Search for:
1. Direct competitors in this exact market segment
2. Market size and annual growth rate
3. Recent funding or investment news in this space
4. Key differentiators

Name actual companies with real URLs. Return ONLY the JSON object.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webSearchTool = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any;

    const { text: finalText } = await callAI({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 4096,
      tools: [webSearchTool],
    });

    if (!finalText) {
      return NextResponse.json({
        ok: true,
        marketScore: 50, competitiveScore: 50, growthScore: 50,
        competitors: [],
        marketInsights: ["Research completed — limited data available."],
        competitiveInsights: ["Add more details for better results."],
        growthInsights: ["Include a website URL for deeper analysis."],
        sources: [],
        summary: "Research completed with limited data. Provide more context for better results.",
      });
    }

    // Parse JSON from response
    let researchData: Omit<ResearchResult, "ok">;
    try {
      researchData = JSON.parse(finalText);
    } catch {
      const jsonMatch = finalText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        researchData = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({
          ok: true,
          marketScore: 50, competitiveScore: 50, growthScore: 50,
          competitors: [],
          marketInsights: ["Market research completed — limited structured data."],
          competitiveInsights: ["Unable to parse competitor details."],
          growthInsights: ["Add a website URL for better analysis."],
          sources: [],
          summary: finalText.slice(0, 200),
        });
      }
    }

    // ── Spend credits after successful research ──────────────────────
    const spend = await spendCredits(user.id, "research", {
      description: body.description?.slice(0, 100),
    });

    return NextResponse.json({
      ok: true,
      ...researchData,
      balance: spend.balance,
      creditsUsed: 2,
    });

  } catch (err) {
    console.error("[blockid:research]", err);
    return NextResponse.json({ ok: false, error: "Research failed" }, { status: 500 });
  }
}
