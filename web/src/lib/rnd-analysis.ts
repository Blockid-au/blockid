import "server-only";
import type { SVIAnalysis } from "./svi-analysis";
import { SVI_STAGE_LABELS } from "./svi-analysis";
import type { InputType } from "./rnd-input";
import { callAI } from "./ai-client";

export interface RndReportPage {
  pageId: string;
  pageNum: number;
  title: string;
  subtitle: string;
  content: string;  // Markdown content
  score?: number;   // 0-100 dimension score
  highlights?: string[];
  dataPoints?: Record<string, string>;
}

export interface RndReport {
  version: "1.0.0";
  inputType: InputType;
  inputUrl?: string;
  pages: RndReportPage[];
  overallScore: number;
  createdAt: string;
}

const PAGE_DEFS = [
  { id: "executive", num: 1, title: "Executive Summary", subtitle: "Overall startup assessment" },
  { id: "market", num: 2, title: "Market & Problem", subtitle: "Market size, timing, validation" },
  { id: "product", num: 3, title: "Product & Technology", subtitle: "Tech stack, AI usage, maturity" },
  { id: "business", num: 4, title: "Business Model", subtitle: "Revenue, pricing, unit economics" },
  { id: "competition", num: 5, title: "Competition & Moat", subtitle: "Competitors, differentiation" },
  { id: "traction", num: 6, title: "Traction & Growth", subtitle: "Users, traffic, SEO, social proof" },
  { id: "team", num: 7, title: "Team & Execution", subtitle: "Founder signals, domain expertise" },
  { id: "financial", num: 8, title: "Financial Projections", subtitle: "Revenue potential, funding needs" },
  { id: "risk", num: 9, title: "Risk Assessment", subtitle: "Key risks, red flags, mitigation" },
  { id: "recommendations", num: 10, title: "Recommendations", subtitle: "Prioritized action plan" },
] as const;

export { PAGE_DEFS };

// ── SSE event payloads (for frontend consumption) ────────────────────────────

export interface RndSSEStatus {
  step: string;
  message: string;
}

export interface RndSSEComplete {
  slug: string;
  report: RndReport;
  analysis: SVIAnalysis;
  totalSVI: number;
}

export interface RndSSEError {
  error: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface BatchPageResult {
  pageId: string;
  content: string;
  score?: number;
  highlights?: string[];
  dataPoints?: Record<string, string>;
}

function parseAIResponse(raw: string): BatchPageResult[] {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(raw);
    if (parsed.pages && Array.isArray(parsed.pages)) return parsed.pages;
  } catch { /* not pure JSON */ }

  // Try extracting JSON from markdown code blocks
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed.pages && Array.isArray(parsed.pages)) return parsed.pages;
    } catch { /* couldn't parse code block */ }
  }

  // Try finding a JSON object anywhere in the text
  const jsonMatch = raw.match(/\{[\s\S]*"pages"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.pages && Array.isArray(parsed.pages)) return parsed.pages;
    } catch { /* couldn't parse extracted JSON */ }
  }

  return [];
}

function makeFallbackPage(def: typeof PAGE_DEFS[number], rawText?: string): RndReportPage {
  return {
    pageId: def.id,
    pageNum: def.num,
    title: def.title,
    subtitle: def.subtitle,
    content: rawText
      ? `Analysis could not be fully generated for this section. Raw context:\n\n${rawText.slice(0, 500)}`
      : "Analysis could not be generated for this section. Please try again.",
    score: undefined,
    highlights: [],
    dataPoints: {},
  };
}

// ── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  input: string,
  sviAnalysis: SVIAnalysis,
  inputType: InputType,
  scrapedData?: { title: string; description: string; text: string; techHints: string[] },
): string {
  const stageLabel = SVI_STAGE_LABELS[sviAnalysis.stage ?? 0] ?? "Concept";

  const dimSummary = (sviAnalysis.subs ?? []).map(s =>
    `- ${s.label}: ${s.value}/100 (${s.adjustment >= 0 ? "+" : ""}${s.adjustment}) — ${s.rationale}`
  ).join("\n");

  const riskSummary = (sviAnalysis.riskPenalties ?? []).map(r =>
    `- ${r.label}: -${r.points}pts — ${r.reason}`
  ).join("\n");

  const gapSummary = (sviAnalysis.evidenceGaps ?? []).slice(0, 5).map(g =>
    `- [${g.priority}] ${g.label}: ${g.action}`
  ).join("\n");

  let ctx = `## Input Type: ${inputType}
## SVI Score: ${sviAnalysis.totalSVI}/300 (Base 100)
## Stage: ${sviAnalysis.stage} — ${stageLabel}
## Confidence: ${Math.round(sviAnalysis.confidenceMultiplier * 100)}%

## Startup Description:
${input.slice(0, 3000)}

## SVI Dimensions:
${dimSummary}

## Risk Penalties:
${riskSummary || "None"}

## Evidence Gaps:
${gapSummary || "None"}`;

  if (scrapedData) {
    ctx += `\n\n## Scraped Website Data:
- Title: ${scrapedData.title}
- Description: ${scrapedData.description}
- Tech Stack Hints: ${scrapedData.techHints.join(", ") || "None detected"}
- Page Content (excerpt): ${scrapedData.text.slice(0, 2000)}`;
  }

  return ctx;
}

// ── System prompt shared across batches ──────────────────────────────────────

const SYSTEM_BASE = `You are a senior startup R&D analyst for BlockID.au, an Australian startup intelligence platform.
You produce structured research reports for founders and investors.

Rules:
- Be professional, evidence-based, and actionable
- Use Australian business English
- Be honest about weaknesses without being discouraging
- When data is limited, say so — never fabricate numbers
- Return ONLY valid JSON (no markdown wrapping, no explanation outside the JSON)

Return format: { "pages": [ { "pageId": "...", "content": "markdown...", "score": 0-100, "highlights": ["..."], "dataPoints": { "key": "value" } } ] }

Each page's "content" field should be 150-300 words of markdown with headers, bullets, and bold text.`;

// ── Batch AI calls ───────────────────────────────────────────────────────────

async function runBatch(
  batchLabel: string,
  pageIds: string[],
  context: string,
  onStatus?: (msg: string) => void,
): Promise<Map<string, BatchPageResult>> {
  const pageDefs = PAGE_DEFS.filter(p => pageIds.includes(p.id));
  const pageDescriptions = pageDefs.map(p =>
    `- pageId: "${p.id}" (Page ${p.num}: ${p.title} — ${p.subtitle})`
  ).join("\n");

  const userPrompt = `Analyse this startup and generate the following report pages:

${pageDescriptions}

## Context:
${context}

Return JSON with a "pages" array containing one object per page listed above. Each object must have: pageId, content (markdown), score (0-100), highlights (array of 2-3 key findings), dataPoints (object of key metrics).`;

  onStatus?.(`Generating ${batchLabel}...`);

  const results = new Map<string, BatchPageResult>();

  try {
    const { text } = await callAI({
      system: SYSTEM_BASE,
      user: userPrompt,
      maxTokens: 4096,
    });

    const parsed = parseAIResponse(text);
    for (const page of parsed) {
      if (page.pageId && pageIds.includes(page.pageId)) {
        results.set(page.pageId, page);
      }
    }
  } catch (err) {
    console.error(`[rnd-analysis] Batch ${batchLabel} failed:`, err);
    // Results map stays empty — caller will fill with fallbacks
  }

  return results;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function generateRndReport(
  input: string,
  sviAnalysis: SVIAnalysis,
  inputType: InputType,
  scrapedData?: { title: string; description: string; text: string; techHints: string[] },
  onStatus?: (msg: string) => void,
): Promise<RndReport> {
  const context = buildContext(input, sviAnalysis, inputType, scrapedData);

  onStatus?.("Starting R&D analysis pipeline...");

  // Run 3 batches concurrently
  const [batchA, batchB, batchC] = await Promise.all([
    runBatch("Core Assessment (Pages 1-3)", ["executive", "market", "product"], context, onStatus),
    runBatch("Business Deep Dive (Pages 4-7)", ["business", "competition", "traction", "team"], context, onStatus),
    runBatch("Financial & Risk (Pages 8-10)", ["financial", "risk", "recommendations"], context, onStatus),
  ]);

  // Merge all batch results
  const allResults = new Map<string, BatchPageResult>();
  for (const [k, v] of batchA) allResults.set(k, v);
  for (const [k, v] of batchB) allResults.set(k, v);
  for (const [k, v] of batchC) allResults.set(k, v);

  // Build final pages — use AI results where available, fallback otherwise
  const pages: RndReportPage[] = PAGE_DEFS.map((def) => {
    const result = allResults.get(def.id);
    if (result && result.content) {
      return {
        pageId: def.id,
        pageNum: def.num,
        title: def.title,
        subtitle: def.subtitle,
        content: result.content,
        score: typeof result.score === "number" ? Math.max(0, Math.min(100, result.score)) : undefined,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        dataPoints: result.dataPoints && typeof result.dataPoints === "object" ? result.dataPoints : {},
      };
    }
    return makeFallbackPage(def, input);
  });

  // Calculate overall score from page scores (average of available scores)
  const scoredPages = pages.filter(p => typeof p.score === "number");
  const overallScore = scoredPages.length > 0
    ? Math.round(scoredPages.reduce((sum, p) => sum + (p.score ?? 0), 0) / scoredPages.length)
    : sviAnalysis.totalSVI;

  onStatus?.("R&D report complete.");

  return {
    version: "1.0.0",
    inputType,
    inputUrl: inputType === "url" ? input.trim() : undefined,
    pages,
    overallScore,
    createdAt: new Date().toISOString(),
  };
}
