import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      description: string;
      keywords?: string;
      websiteUrl?: string;
      industry?: string;
    };

    if (!body.description?.trim()) {
      return NextResponse.json({ ok: false, error: "description is required" }, { status: 400 });
    }

    const searchContext = [
      body.description.slice(0, 500),
      body.keywords ? `Keywords: ${body.keywords}` : "",
      body.websiteUrl ? `Website: ${body.websiteUrl}` : "",
      body.industry ? `Industry: ${body.industry}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a startup competitive intelligence analyst. Your job is to research market data and competitors for a startup, then return ONLY a valid JSON object.

After conducting web searches, analyze the results and return this exact JSON structure (no markdown, no extra text):
{
  "marketScore": <integer 0-100>,
  "competitiveScore": <integer 0-100, higher = more differentiated>,
  "growthScore": <integer 0-100>,
  "competitors": [
    {
      "name": "<company name>",
      "url": "<website url>",
      "description": "<1 sentence what they do>",
      "threat": "<high|medium|low>"
    }
  ],
  "marketInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "competitiveInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "growthInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "sources": [{ "title": "<page title>", "url": "<url>" }],
  "summary": "<2-3 sentence market and competitive summary>"
}

Scoring guide:
- marketScore 80-100: Large, fast-growing, well-funded market (e.g. AI SaaS, fintech)
- marketScore 50-79: Medium or niche but growing market
- marketScore 0-49: Small, saturated, or declining market

- competitiveScore 80-100: Very differentiated, few direct competitors, clear unique angle
- competitiveScore 50-79: Some competitors but meaningful differentiation possible
- competitiveScore 0-49: Crowded space, many similar products, hard to stand out

- growthScore 80-100: Market growing 20%+ YoY, strong investor interest, geographic expansion opportunity
- growthScore 50-79: Steady growth, moderate investor interest
- growthScore 0-49: Mature or declining market, low investment activity`;

    const userMessage = `Research this startup and its competitive landscape:

${searchContext}

Search for:
1. Direct competitors in this exact market segment
2. Market size and annual growth rate for this industry
3. Recent funding or investment news in this space
4. Key differentiators that would make this startup stand out or struggle

Be specific — name actual companies with real URLs. Return ONLY the JSON object.`;

    // Agentic loop with web search tool
    type MessageParam = { role: "user" | "assistant"; content: Anthropic.MessageParam["content"] };
    const messages: MessageParam[] = [{ role: "user", content: userMessage }];

    let finalText = "";
    const collectedSources: Array<{ title: string; url: string }> = [];
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305" as "web_search_20250305", name: "web_search" }],
        messages: messages as Anthropic.MessageParam[],
      });

      // Collect any text content and tool uses
      const assistantContent: Anthropic.ContentBlock[] = [];

      for (const block of response.content) {
        assistantContent.push(block);
        if (block.type === "text") {
          finalText = block.text;
        }
      }

      // If stop reason is end_turn, we have the final answer
      if (response.stop_reason === "end_turn") {
        break;
      }

      // If there are tool_use blocks, process them
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: assistantContent });

        // Build tool results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            // For web_search, the results come back as tool_result
            // We need to acknowledge them
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Search completed. Please analyze the results and provide the JSON response.",
            });
          }
        }

        if (toolResults.length > 0) {
          messages.push({ role: "user", content: toolResults });
        }
      } else {
        // No more tool calls, done
        break;
      }
    }

    // Parse the JSON from the final text
    let researchData: Omit<ResearchResult, "ok">;

    try {
      // Try direct parse
      researchData = JSON.parse(finalText) as Omit<ResearchResult, "ok">;
    } catch {
      // Extract JSON from text
      const jsonMatch = finalText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        researchData = JSON.parse(jsonMatch[0]) as Omit<ResearchResult, "ok">;
      } else {
        // Return a fallback if parsing fails
        return NextResponse.json({
          ok: true,
          marketScore: 50,
          competitiveScore: 50,
          growthScore: 50,
          competitors: [],
          marketInsights: ["Market research completed — limited data available."],
          competitiveInsights: ["Unable to find specific competitors."],
          growthInsights: ["Growth data unavailable."],
          sources: [],
          summary: "Research completed with limited data. Add website URL for better results.",
        });
      }
    }

    // Merge any collected sources
    if (collectedSources.length > 0 && (!researchData.sources || researchData.sources.length === 0)) {
      researchData.sources = collectedSources;
    }

    return NextResponse.json({ ok: true, ...researchData });

  } catch (err) {
    console.error("[blockid:research]", err);
    return NextResponse.json({ ok: false, error: "Research failed. Please try again." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for web searches
