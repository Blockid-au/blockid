// Market Research — a port of Google Agent Garden's `google-trends-agent` +
// competitive-analysis patterns onto our free ADK-style agent layer.
//
// The originals analyse market trends and competitive positioning. We combine
// them for BlockID's report pipeline: given a startup's description, a
// SequentialAgent runs
//   market_trends_agent → competitive_positioning_agent
// to produce trend signals, named competitors, a rough market-size read, and a
// positioning statement.
//
// This fills a real gap: the report pipeline already references
// `gatherResults.competitiveResearch` in the CMO's market-criterion prompt
// (agent-dispatcher.ts) but nothing ever populated it. Now it does.
//
// Runs on the injected free `ModelCaller` — $0, no Gemini, no GCP. Fail-safe:
// returns null on any error so the gather phase stays non-blocking.

import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

const TRENDS_INSTRUCTION = `You are a market trends analyst for BlockID.au (Australian startup platform).

Given a startup description, identify the market context. Reason from general knowledge — do NOT fabricate specific statistics or cite fake sources; keep figures qualitative or clearly approximate.

Output EXACTLY this format:
SECTOR: <the startup's primary sector/category>
TRENDS:
- <2-4 relevant market trends or tailwinds/headwinds>
MARKET_SIZE: <qualitative read of TAM/SAM for the Australian + global context, approximate only>`;

const POSITIONING_INSTRUCTION = `You are a competitive positioning analyst for BlockID.au.

Market context from the trends analyst:
{trends}

Given the startup description and that context, map the competitive landscape.
Name only competitors you are genuinely aware of; if unsure, describe the competitor TYPE rather than inventing a company name.

Output ONLY a single JSON object (no markdown fences, no prose):
{
  "competitors": [{"name": "...", "note": "one-line positioning vs this startup"}],
  "differentiators": ["..."],
  "positioning": "one-sentence positioning statement for this startup",
  "whitespace": ["1-2 underserved opportunities"]
}`;

export interface MarketResearchInput {
  startupName: string;
  description: string;
  /** Optional sector hint. */
  sector?: string;
}

export interface MarketResearchResult {
  sector: string;
  trends: string[];
  marketSize: string;
  competitors: Array<{ name: string; note: string }>;
  differentiators: string[];
  positioning: string;
  whitespace: string[];
}

const trendsAgent = new LlmAgent({
  name: "market_trends_agent",
  description: "Identifies sector, market trends, and approximate market size.",
  instruction: TRENDS_INSTRUCTION,
  maxTokens: 500,
  outputKey: "trends",
});

const positioningAgent = new LlmAgent({
  name: "competitive_positioning_agent",
  description: "Maps competitors, differentiators, and whitespace.",
  instruction: POSITIONING_INSTRUCTION,
  maxTokens: 600,
});

/**
 * Research a startup's market and competitive landscape. Runs trends →
 * positioning on the free model chain. Fail-safe: returns `null` on error so
 * the report pipeline's gather phase remains non-blocking.
 */
export async function researchMarket(
  input: MarketResearchInput,
  model: ModelCaller,
): Promise<MarketResearchResult | null> {
  if (!input.description.trim()) return null;

  try {
    const session = newSession();
    const seq = new SequentialAgent("market_research", [trendsAgent, positioningAgent]);

    const initial = [
      `## Startup\n${input.startupName}`,
      input.sector ? `## Sector hint\n${input.sector}` : "",
      `## Description\n${input.description.slice(0, 4000)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const trace = await seq.run(initial, session, model);

    const trendsBlock = session.state.trends ?? "";
    const positioning = parsePositioningJson(trace[trace.length - 1]?.output ?? "");

    const result: MarketResearchResult = {
      sector: parseField(trendsBlock, "SECTOR") || input.sector || "",
      trends: parseBullets(trendsBlock),
      marketSize: parseField(trendsBlock, "MARKET_SIZE"),
      competitors: positioning?.competitors ?? [],
      differentiators: positioning?.differentiators ?? [],
      positioning: positioning?.positioning ?? "",
      whitespace: positioning?.whitespace ?? [],
    };

    // Require at least some signal to be considered useful.
    const hasSignal =
      result.trends.length > 0 || result.competitors.length > 0 || result.positioning.length > 0;
    return hasSignal ? result : null;
  } catch {
    return null;
  }
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseField(block: string, label: string): string {
  const m = block.match(new RegExp(`${label}:\\s*(.+)`, "i"));
  return m ? m[1].trim() : "";
}

function parseBullets(block: string): string[] {
  const lines = block.split("\n");
  const out: string[] = [];
  let inTrends = false;
  for (const line of lines) {
    if (/^\s*TRENDS:/i.test(line)) {
      inTrends = true;
      continue;
    }
    if (/^\s*MARKET_SIZE:/i.test(line)) break;
    if (inTrends && /^\s*[-*]/.test(line)) {
      const t = line.replace(/^\s*[-*]\s*/, "").trim();
      if (t) out.push(t);
    }
  }
  return out.slice(0, 4);
}

interface PositioningJson {
  competitors?: Array<{ name: string; note: string }>;
  differentiators?: string[];
  positioning?: string;
  whitespace?: string[];
}

function parsePositioningJson(text: string): PositioningJson | null {
  const cleaned = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as PositioningJson;
    // Normalise competitors to the expected shape.
    if (Array.isArray(obj.competitors)) {
      obj.competitors = obj.competitors
        .filter((c) => c && typeof c.name === "string")
        .map((c) => ({ name: c.name, note: typeof c.note === "string" ? c.note : "" }))
        .slice(0, 6);
    }
    return obj;
  } catch {
    return null;
  }
}
