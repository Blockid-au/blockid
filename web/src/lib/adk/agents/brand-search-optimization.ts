// Brand Search Optimization — a port of Google Agent Garden's
// `brand-search-optimization` sample onto our free ADK-style agent layer.
//
// The original (adk-samples) is a multi-agent system that takes a brand/product
// and improves how it surfaces in search — expanding keywords and rewriting
// titles for search intent. We adapt it for BlockID's CMO/SEO use case: given a
// content topic (title + seed keywords + audience), a SequentialAgent runs
//   keyword_research_agent → title_optimizer_agent
// to produce an expanded keyword set, the dominant search intent, an
// SEO-optimised title, and a meta description.
//
// Runs entirely on the injected free `ModelCaller` (Groq/OpenRouter/etc.) — $0,
// no Gemini, no GCP. Fully fail-safe: on any error it returns the input
// unchanged so callers (e.g. the publish-insight cron) never break.

import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

const KEYWORD_RESEARCH_INSTRUCTION = `You are an SEO keyword researcher for BlockID.au, an Australian startup valuation platform.

Given a content topic and seed keywords, expand them into a prioritised keyword set that Australian startup founders actually search for.

Consider:
- Long-tail, high-intent variations (e.g. "how to value a pre-seed startup australia")
- Australian context (ASIC, ATO, ESIC, AUD, "australia", state names) where relevant
- Related questions and comparison queries

Output EXACTLY this format:
KEYWORDS: keyword one, keyword two, keyword three, ... (8-12 comma-separated keywords, most important first)
INTENT: <one short phrase describing the dominant search intent, e.g. "informational — founders researching valuation methods">`;

const TITLE_OPTIMIZER_INSTRUCTION = `You are an SEO title and meta-description optimiser for BlockID.au.

You are given the original topic and the researched keywords + intent:
{research}

Produce an SEO-optimised title and meta description.

Rules:
- Title: <= 60 characters, leads with the primary keyword, compelling for Australian founders.
- Meta description: <= 155 characters, includes the primary keyword and a clear value hook.

Output ONLY a single JSON object, no markdown fences, no prose:
{"title":"...","metaDescription":"..."}`;

export interface SearchOptimizationInput {
  title: string;
  keywords: string[];
  /** Optional audience/angle hint to steer keyword research. */
  angle?: string;
}

export interface SearchOptimizationResult {
  /** SEO-optimised title (falls back to the input title on failure). */
  optimizedTitle: string;
  /** Expanded, prioritised keyword set (falls back to the input keywords). */
  expandedKeywords: string[];
  /** Dominant search intent, or "" if undetermined. */
  searchIntent: string;
  /** SEO meta description, or "" if undetermined. */
  metaDescription: string;
  /** True if the agents successfully produced optimised output. */
  optimized: boolean;
}

const keywordResearchAgent = new LlmAgent({
  name: "keyword_research_agent",
  description: "Expands seed keywords into a prioritised, intent-aware set.",
  instruction: KEYWORD_RESEARCH_INSTRUCTION,
  maxTokens: 400,
  outputKey: "research",
});

const titleOptimizerAgent = new LlmAgent({
  name: "title_optimizer_agent",
  description: "Writes an SEO-optimised title and meta description.",
  instruction: TITLE_OPTIMIZER_INSTRUCTION,
  maxTokens: 300,
});

/**
 * Optimise a content topic for search. Runs keyword research → title
 * optimisation on the free model chain. Fail-safe: returns the original
 * title/keywords if anything goes wrong.
 */
export async function optimizeForSearch(
  input: SearchOptimizationInput,
  model: ModelCaller,
): Promise<SearchOptimizationResult> {
  const fallback: SearchOptimizationResult = {
    optimizedTitle: input.title,
    expandedKeywords: input.keywords,
    searchIntent: "",
    metaDescription: "",
    optimized: false,
  };

  try {
    const session = newSession();
    const seq = new SequentialAgent("brand_search_optimization", [
      keywordResearchAgent,
      titleOptimizerAgent,
    ]);

    const initialInput = [
      `## Topic\n${input.title}`,
      `## Seed Keywords\n${input.keywords.join(", ")}`,
      input.angle ? `## Angle\n${input.angle}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const trace = await seq.run(initialInput, session, model);

    const expandedKeywords = parseKeywords(session.state.research) ?? input.keywords;
    const searchIntent = parseIntent(session.state.research);
    const optimizerOut = trace[trace.length - 1]?.output ?? "";
    const parsed = parseTitleJson(optimizerOut);

    return {
      optimizedTitle: parsed?.title?.trim() || input.title,
      expandedKeywords,
      searchIntent,
      metaDescription: parsed?.metaDescription?.trim() ?? "",
      optimized: Boolean(parsed?.title),
    };
  } catch {
    return fallback;
  }
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseKeywords(research: string | undefined): string[] | null {
  if (!research) return null;
  const m = research.match(/KEYWORDS:\s*(.+)/i);
  if (!m) return null;
  const list = m[1]
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 1)
    .slice(0, 12);
  return list.length ? list : null;
}

function parseIntent(research: string | undefined): string {
  if (!research) return "";
  const m = research.match(/INTENT:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

function parseTitleJson(text: string): { title?: string; metaDescription?: string } | null {
  const cleaned = text.replace(/```json?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return { title: obj.title, metaDescription: obj.metaDescription };
  } catch {
    return null;
  }
}
