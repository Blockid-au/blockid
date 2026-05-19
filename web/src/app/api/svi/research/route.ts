import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

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
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  const client = getAnthropicClient();

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

    // Single call with web search — server-managed tool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webSearchTool = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any;
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [webSearchTool],
      messages: [{ role: "user", content: userMessage }],
    });

    // Extract the final text from the response
    let finalText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        finalText = block.text;
      }
    }

    // If we got tool_use back (needs agentic loop), run follow-ups
    if (response.stop_reason === "tool_use") {
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
        { role: "assistant", content: response.content },
      ];

      // Build tool results for any tool_use blocks
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Search completed. Analyse results and return the JSON.",
          });
        }
      }
      messages.push({ role: "user", content: toolResults });

      // Get final response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webSearchTool2 = { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any;
      const followUp = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [webSearchTool2],
        messages,
      });

      for (const block of followUp.content) {
        if (block.type === "text") {
          finalText = block.text;
        }
      }
    }

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

    return NextResponse.json({ ok: true, ...researchData });

  } catch (err) {
    console.error("[blockid:research]", err);
    const message = err instanceof Error ? err.message : "Research failed";
    return NextResponse.json({ ok: false, error: `Research failed: ${message}` }, { status: 500 });
  }
}
