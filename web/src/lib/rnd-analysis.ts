import "server-only";
import type { SVIAnalysis } from "./svi-analysis";
import { SVI_STAGE_LABELS } from "./svi-analysis";
import type { InputType, TechAuditResult } from "./rnd-input";
import { callAI } from "./ai-client";
import { type SectionDepth, SECTION_DEPTH_CONFIG } from "./credits";

export type ReportTier = "preview" | "standard" | "deep_dive";

export interface RndExtendedSection {
  title: string;
  content: string;  // Markdown
  type: "competitor_profile" | "financial_model" | "action_plan" | "market_data" | "growth_tactics";
  dataPoints?: Record<string, string>;
}

export interface RndReportPage {
  pageId: string;
  pageNum: number;
  title: string;
  subtitle: string;
  content: string;  // Markdown content
  score?: number;   // 0-100 dimension score
  highlights?: string[];
  dataPoints?: Record<string, string>;
  extendedSections?: RndExtendedSection[];  // Deep Dive only
}

export interface RndReport {
  version: "1.0.0";
  inputType: InputType;
  inputUrl?: string;
  pages: RndReportPage[];
  overallScore: number;
  createdAt: string;
  tier: ReportTier;
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
  tier: ReportTier;
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
  techAudit?: TechAuditResult,
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

  if (techAudit) {
    ctx += `\n\n## Deep Tech Audit Results (automated scan):
- Overall Grade: ${techAudit.overallGrade}
- Security: ${techAudit.security.grade} (HTTPS: ${techAudit.security.ssl.valid ? "yes" : "no"}, HSTS: ${techAudit.security.headers.hsts ? "yes" : "no"}, CSP: ${techAudit.security.headers.csp ? "yes" : "no"})
- Performance: ${techAudit.performance.grade} (TTFB: ${techAudit.performance.ttfbMs}ms, Page size: ${Math.round(techAudit.performance.pageSizeBytes / 1024)}KB)
- Frameworks: ${techAudit.techStack.frameworks.join(", ") || "None detected"}
- CMS: ${techAudit.techStack.cms ?? "None"}
- CDN: ${techAudit.techStack.cdn ?? "None"}
- Hosting: ${techAudit.techStack.hosting ?? "Unknown"}
- Analytics: ${techAudit.techStack.analytics.join(", ") || "None"}
- Payment integrations: ${techAudit.techStack.payments.join(", ") || "None"}
- Customer tools: ${techAudit.techStack.customerTools.join(", ") || "None"}
- Product maturity: sitemap=${techAudit.productMaturity.hasSitemap}, robots=${techAudit.productMaturity.hasRobotsTxt}, structured data=${techAudit.productMaturity.hasStructuredData}, PWA=${techAudit.productMaturity.hasPWA}, login=${techAudit.productMaturity.hasLoginForm}
- SVI Signal Boosts: PTD+${techAudit.signalBoosts.ptdBoost}, SVM+${techAudit.signalBoosts.svmBoost}, TRE+${techAudit.signalBoosts.treBoost}, LCO+${techAudit.signalBoosts.lcoBoost}
- Evidence labels: ${techAudit.evidenceLabels.join(" | ")}`;
  }

  return ctx;
}

// ── System prompt shared across batches ──────────────────────────────────────

const AU_COMPLIANCE_NOTE = `
IMPORTANT — Australian Compliance:
- This analysis is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111)
- The SVI score is NOT a financial valuation or investment recommendation
- BlockID does not hold an Australian Financial Services Licence (AFSL)
- For financial projections: state "forward-looking estimates only, not financial advice"
- For legal content: state "not legal advice, consult a qualified Australian solicitor"
- For tax references: state "consult a registered tax agent"
- All prices referenced should be in AUD and GST-inclusive`;

const MENTORING_TONE = `
TONE & STRUCTURE — Startup Mentoring Voice:
- Write as a supportive startup advisor, not a cold analyst. Guide the founder step-by-step.
- Acknowledge the founder's current stage and what they have already achieved.
- Every section MUST end with a "Next Steps" block: 2-3 specific, actionable steps the founder should take immediately.
- Frame weaknesses as growth opportunities, not failures. Use language like "To strengthen this area..." instead of "This is weak."
- For early-stage startups (Stage 0-2): focus on validation steps, MVP guidance, first customer acquisition.
- For growth-stage startups (Stage 3+): focus on scaling, fundraise preparation, team building, unit economics.
- Include "How BlockID can help" hints where relevant (e.g. "Upload your pitch deck to the Evidence Vault to boost this score by +8 points").
- The report should feel like a conversation with an experienced mentor who genuinely wants the founder to succeed.`;

const SYSTEM_STANDARD = `You are a senior startup R&D analyst and mentor for BlockID.au, an Australian startup intelligence platform.
You produce structured research reports that guide founders step-by-step from their current stage toward growth.

This is a 10-page preview report. It should demonstrate the depth and quality of BlockID analysis while clearly showing that deeper, unlimited analysis is available with credits.

Rules:
- Be professional, evidence-based, and actionable
- Use Australian business English
- Be honest about weaknesses without being discouraging — frame them as growth opportunities
- When data is limited, say so — never fabricate numbers
- Return ONLY valid JSON (no markdown wrapping, no explanation outside the JSON)
${MENTORING_TONE}
${AU_COMPLIANCE_NOTE}

Return format: { "pages": [ { "pageId": "...", "content": "markdown...", "score": 0-100, "highlights": ["..."], "dataPoints": { "key": "value" } } ] }

Each page's "content" field should be 150-300 words of markdown with headers, bullets, and bold text. End each page with a "**Next Steps**" section.`;

const SYSTEM_DEEP_DIVE = `You are a senior startup R&D analyst, management consultant, and startup mentor for BlockID.au, an Australian startup intelligence platform.
You produce in-depth, consultant-grade research reports that guide founders through every step of building and growing their startup.

This is a FULL paid report — no page limit, no content restriction. Provide the most comprehensive analysis possible based on all available data.

Rules:
- Be professional, evidence-based, and highly actionable with specific recommendations
- Use Australian business English
- Provide detailed data points, competitor names, market figures, and financial models where possible
- Be honest about weaknesses without being discouraging — frame them as growth opportunities with specific steps to improve
- When data is limited, say so — never fabricate numbers, but provide reasonable estimates with stated assumptions
- Include specific, named competitors with their strengths/weaknesses where relevant
- Provide actionable checklists and timelines
- Return ONLY valid JSON (no markdown wrapping, no explanation outside the JSON)
${MENTORING_TONE}
${AU_COMPLIANCE_NOTE}

Return format: { "pages": [ { "pageId": "...", "content": "markdown...", "score": 0-100, "highlights": ["..."], "dataPoints": { "key": "value" } } ] }

Each page's "content" field should be 400-600 words of markdown with headers, sub-headers, bullets, bold text, specific data points, and a "**Next Steps**" section with 3-5 concrete actions.`;

const SYSTEM_DEEP_DIVE_EXTENDED = `You are a senior startup R&D analyst, management consultant, and startup mentor for BlockID.au, an Australian startup intelligence platform.
You produce in-depth extended analysis sections for a consultant-grade startup report.
This is a FULL paid report — provide exhaustive, mentor-quality analysis with no content restrictions.

Rules:
- Be professional, evidence-based, and highly actionable with specific recommendations
- Use Australian business English
- Provide detailed data points, competitor names, market figures, and financial models
- When data is limited, provide reasonable estimates with stated assumptions
- Guide the founder with specific next steps in every section
- Return ONLY valid JSON (no markdown wrapping, no explanation outside the JSON)
${MENTORING_TONE}
${AU_COMPLIANCE_NOTE}

Return format: { "extendedSections": [ { "pageId": "...", "sections": [ { "title": "...", "content": "markdown...", "type": "competitor_profile|financial_model|action_plan|market_data|growth_tactics", "dataPoints": { "key": "value" } } ] } ] }

Each section's "content" field should be 300-500 words of detailed markdown. Include a "**What to do now**" action item at the end of each section.`;

// ── Batch AI calls ───────────────────────────────────────────────────────────

async function runBatch(
  batchLabel: string,
  pageIds: string[],
  context: string,
  tier: ReportTier = "standard",
  onStatus?: (msg: string) => void,
  locale: "en" | "vi" = "en",
): Promise<Map<string, BatchPageResult>> {
  const pageDefs = PAGE_DEFS.filter(p => pageIds.includes(p.id));
  const pageDescriptions = pageDefs.map(p =>
    `- pageId: "${p.id}" (Page ${p.num}: ${p.title} — ${p.subtitle})`
  ).join("\n");

  const isDeepDive = tier === "deep_dive";
  const wordGuidance = isDeepDive
    ? "Provide 400-600 words per page with specific data points, named competitors, financial estimates, and actionable recommendations."
    : "Provide 150-200 words per page, concise and actionable.";

  const userPrompt = `Analyse this startup and generate the following report pages:

${pageDescriptions}

${wordGuidance}

## Context:
${context}

Return JSON with a "pages" array containing one object per page listed above. Each object must have: pageId, content (markdown), score (0-100), highlights (array of 2-3 key findings), dataPoints (object of key metrics).`;

  onStatus?.(`Generating ${batchLabel}...`);

  const systemPrompt = isDeepDive ? SYSTEM_DEEP_DIVE : SYSTEM_STANDARD;
  const maxTokens = isDeepDive ? 8192 : 4096;
  const results = new Map<string, BatchPageResult>();

  try {
    const viInstruction = locale === "vi"
      ? "\n\nCRITICAL: Write ALL content ENTIRELY in Vietnamese (tiếng Việt). All section titles, analysis, recommendations must be in Vietnamese. Keep technical terms (SVI, ESIC, SAFE, MRR, ARR) in English but explain in Vietnamese.\n"
      : "";

    const { text } = await callAI({
      system: systemPrompt + viInstruction,
      user: userPrompt,
      maxTokens,
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

// ── Deep Dive extended sections (Batch D) ──────────────────────────────

interface DeepDiveExtendedResult {
  pageId: string;
  sections: RndExtendedSection[];
}

function parseDeepDiveResponse(raw: string): DeepDiveExtendedResult[] {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(raw);
    if (parsed.extendedSections && Array.isArray(parsed.extendedSections)) return parsed.extendedSections;
  } catch { /* not pure JSON */ }

  // Try extracting JSON from markdown code blocks
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed.extendedSections && Array.isArray(parsed.extendedSections)) return parsed.extendedSections;
    } catch { /* couldn't parse code block */ }
  }

  // Try finding a JSON object anywhere in the text
  const jsonMatch = raw.match(/\{[\s\S]*"extendedSections"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.extendedSections && Array.isArray(parsed.extendedSections)) return parsed.extendedSections;
    } catch { /* couldn't parse extracted JSON */ }
  }

  return [];
}

const DEEP_DIVE_EXTENDED_PAGES: Record<string, { descriptions: string }> = {
  market: {
    descriptions: `For pageId "market" generate these extended sections:
1. "Detailed TAM/SAM/SOM Calculation" (type: "market_data") — Break down Total Addressable Market, Serviceable Addressable Market, and Serviceable Obtainable Market with specific dollar figures and methodology
2. "Top 10 Market Reports & Resources" (type: "market_data") — List 10 relevant market research reports, industry publications, and data sources with descriptions of what each covers
3. "Market Timing Analysis" (type: "market_data") — Analyse why now is the right (or wrong) time for this product, considering macro trends, technology adoption curves, and regulatory environment`,
  },
  competition: {
    descriptions: `For pageId "competition" generate these extended sections:
1-5. Individual competitor profiles (type: "competitor_profile") for 3-5 competitors. Each profile must include: company name, website URL, key strengths (2-3), key weaknesses (2-3), estimated funding/revenue, and threat level (Low/Medium/High/Critical). Format each as a separate section with the competitor name as the title.`,
  },
  traction: {
    descriptions: `For pageId "traction" generate these extended sections:
1. "SEO Keyword Opportunities" (type: "growth_tactics") — Identify 10-15 high-value keywords with estimated search volume and difficulty, grouped by intent (informational, commercial, transactional)
2. "Social Media Strategy" (type: "growth_tactics") — Platform-specific recommendations including content types, posting cadence, engagement tactics, and growth metrics to track
3. "Growth Hacking Tactics" (type: "growth_tactics") — 5-7 specific, actionable growth tactics tailored to this startup's stage and market, with expected impact and effort level`,
  },
  financial: {
    descriptions: `For pageId "financial" generate these extended sections:
1. "Revenue Projection Model (3 Scenarios)" (type: "financial_model") — Build conservative, base, and optimistic revenue projections for 12-24 months with key assumptions stated
2. "Unit Economics Breakdown" (type: "financial_model") — Detail CAC, LTV, LTV:CAC ratio, payback period, gross margin, and contribution margin with benchmarks
3. "Funding Timeline & Milestone Map" (type: "financial_model") — Map funding rounds to milestones, with recommended raise amounts, target metrics for each round, and timeline`,
  },
  recommendations: {
    descriptions: `For pageId "recommendations" generate these extended sections:
1. "30-Day Action Plan" (type: "action_plan") — Week-by-week breakdown of immediate priorities with specific deliverables and owners
2. "90-Day Growth Plan" (type: "action_plan") — Month-by-month milestones with KPIs, resource allocation, and decision gates
3. "Resource Requirements & Budget" (type: "action_plan") — Detailed breakdown of team needs, tool costs, marketing budget, and total burn rate with recommendations`,
  },
};

async function runDeepDiveExtended(
  context: string,
  onStatus?: (msg: string) => void,
): Promise<Map<string, RndExtendedSection[]>> {
  const deepDivePageIds = Object.keys(DEEP_DIVE_EXTENDED_PAGES);
  const allDescriptions = deepDivePageIds.map(pageId => {
    const def = DEEP_DIVE_EXTENDED_PAGES[pageId];
    return def.descriptions;
  }).join("\n\n");

  const userPrompt = `Generate extended deep-dive analysis sections for the following report pages. Each section should be detailed, actionable, and consultant-grade quality with specific data points.

${allDescriptions}

## Context:
${context}

Return JSON with an "extendedSections" array. Each element must have: pageId (string), sections (array of objects with title, content as markdown, type, and optional dataPoints object).`;

  onStatus?.("Deep diving into competitors...");

  const results = new Map<string, RndExtendedSection[]>();

  try {
    const { text } = await callAI({
      system: SYSTEM_DEEP_DIVE_EXTENDED,
      user: userPrompt,
      maxTokens: 8192,
    });

    onStatus?.("Building financial projections...");

    const parsed = parseDeepDiveResponse(text);
    for (const entry of parsed) {
      if (entry.pageId && deepDivePageIds.includes(entry.pageId) && Array.isArray(entry.sections)) {
        const validSections = entry.sections.filter(
          (s): s is RndExtendedSection =>
            typeof s.title === "string" &&
            typeof s.content === "string" &&
            typeof s.type === "string",
        );
        if (validSections.length > 0) {
          results.set(entry.pageId, validSections);
        }
      }
    }

    onStatus?.("Creating your action plan...");
  } catch (err) {
    console.error("[rnd-analysis] Deep Dive extended batch failed:", err);
    // Results map stays empty — pages will just lack extended sections
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
  tier: ReportTier = "standard",
  techAudit?: TechAuditResult,
  locale: "en" | "vi" = "en",
): Promise<RndReport> {
  const context = buildContext(input, sviAnalysis, inputType, scrapedData, techAudit);

  onStatus?.(locale === "vi" ? "Bắt đầu phân tích R&D..." : "Starting R&D analysis pipeline...");

  // Run 3 batches concurrently (A, B, C)
  const [batchA, batchB, batchC] = await Promise.all([
    runBatch("Core Assessment (Pages 1-3)", ["executive", "market", "product"], context, tier, onStatus, locale),
    runBatch("Business Deep Dive (Pages 4-7)", ["business", "competition", "traction", "team"], context, tier, onStatus, locale),
    runBatch("Financial & Risk (Pages 8-10)", ["financial", "risk", "recommendations"], context, tier, onStatus, locale),
  ]);

  // Merge all batch results
  const allResults = new Map<string, BatchPageResult>();
  for (const [k, v] of batchA) allResults.set(k, v);
  for (const [k, v] of batchB) allResults.set(k, v);
  for (const [k, v] of batchC) allResults.set(k, v);

  // Run Deep Dive extended batch (Batch D) if applicable
  let extendedResults = new Map<string, RndExtendedSection[]>();
  if (tier === "deep_dive") {
    extendedResults = await runDeepDiveExtended(context, onStatus);
  }

  // Build final pages — use AI results where available, fallback otherwise
  const pages: RndReportPage[] = PAGE_DEFS.map((def) => {
    const result = allResults.get(def.id);
    const extended = extendedResults.get(def.id);
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
        ...(extended && extended.length > 0 ? { extendedSections: extended } : {}),
      };
    }
    const fallback = makeFallbackPage(def, input);
    if (extended && extended.length > 0) {
      fallback.extendedSections = extended;
    }
    return fallback;
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
    tier,
  };
}

// ── Modular Section Generation ──────────────────────────────────────────────
// Generates only selected sections at chosen depth (word count).
// Used by the per-section purchasing flow — user picks sections + depth,
// sees transparent credit cost, confirms, then this generates.

export interface SectionRequest {
  sectionId: string;   // e.g. "executive", "market", "product"
  depth: SectionDepth; // "scan" | "summary" | "standard" | "deep" | "expert" | "maximum"
}

const DEPTH_WORD_GUIDANCE: Record<SectionDepth, string> = {
  scan: "Provide approximately 100 words — a quick signal check with yes/no assessments and a 1-line summary.",
  summary: "Provide approximately 300 words — key findings with top 3 takeaways and brief rationale.",
  standard: "Provide approximately 500 words — detailed analysis with identified gaps, evidence, and actionable recommendations.",
  deep: "Provide approximately 1000 words — in-depth benchmarks, competitor context, data points, and a prioritized action plan.",
  expert: "Provide approximately 2000 words — consultant-grade analysis with detailed financials, named competitors, market data, specific recommendations, and implementation timeline.",
  maximum: "Provide 3000+ words — exhaustive, no-holds-barred analysis covering every angle. Include data tables, step-by-step plans, named competitors with URLs, financial projections, and strategic recommendations. This is the most comprehensive analysis possible.",
};

const DEPTH_SYSTEM_PROMPTS: Record<SectionDepth, string> = {
  scan: SYSTEM_STANDARD,
  summary: SYSTEM_STANDARD,
  standard: SYSTEM_STANDARD,
  deep: SYSTEM_DEEP_DIVE,
  expert: SYSTEM_DEEP_DIVE,
  maximum: SYSTEM_DEEP_DIVE,
};

const DEPTH_MAX_TOKENS: Record<SectionDepth, number> = {
  scan: 1024,
  summary: 2048,
  standard: 4096,
  deep: 6144,
  expert: 8192,
  maximum: 8192,
};

/**
 * Generate specific report sections at chosen depth.
 * Returns only the requested sections — not the full 10-page report.
 * Each section is generated with a depth-appropriate word count and system prompt.
 */
export async function generateSectionReport(
  input: string,
  sviAnalysis: SVIAnalysis,
  inputType: InputType,
  sections: SectionRequest[],
  scrapedData?: { title: string; description: string; text: string; techHints: string[] },
  onStatus?: (msg: string) => void,
  techAudit?: TechAuditResult,
): Promise<RndReportPage[]> {
  const context = buildContext(input, sviAnalysis, inputType, scrapedData, techAudit);

  // Group sections by depth for batching efficiency (same depth = same prompt)
  const byDepth = new Map<SectionDepth, string[]>();
  for (const s of sections) {
    const existing = byDepth.get(s.depth) ?? [];
    existing.push(s.sectionId);
    byDepth.set(s.depth, existing);
  }

  const allResults = new Map<string, BatchPageResult>();

  // Generate each depth group (can run in parallel)
  const depthPromises = [...byDepth.entries()].map(async ([depth, pageIds]) => {
    const depthConfig = SECTION_DEPTH_CONFIG[depth];
    const pageDefs = PAGE_DEFS.filter(p => pageIds.includes(p.id));
    if (pageDefs.length === 0) return;

    const pageDescriptions = pageDefs.map(p =>
      `- pageId: "${p.id}" (Page ${p.num}: ${p.title} — ${p.subtitle})`
    ).join("\n");

    const wordGuidance = DEPTH_WORD_GUIDANCE[depth];
    const disclaimer = `\n\nIMPORTANT: This analysis is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111). The Startup Value Index (SVI) is NOT a financial valuation or investment recommendation. Users should seek independent professional advice. All prices are AUD and include GST.`;

    const userPrompt = `Analyse this startup and generate the following report sections at "${depthConfig.label}" depth (~${depthConfig.words} words each):

${pageDescriptions}

${wordGuidance}${disclaimer}

## Context:
${context}

Return JSON with a "pages" array containing one object per page listed above. Each object must have: pageId, content (markdown), score (0-100), highlights (array of 2-3 key findings), dataPoints (object of key metrics).`;

    onStatus?.(`Generating ${pageDefs.map(p => p.title).join(", ")} at ${depthConfig.label} depth...`);

    const systemPrompt = DEPTH_SYSTEM_PROMPTS[depth];
    const maxTokens = DEPTH_MAX_TOKENS[depth];

    try {
      const { text } = await callAI({
        system: systemPrompt,
        user: userPrompt,
        maxTokens,
      });

      const parsed = parseAIResponse(text);
      for (const page of parsed) {
        if (page.pageId && pageIds.includes(page.pageId)) {
          allResults.set(page.pageId, page);
        }
      }
    } catch (err) {
      console.error(`[rnd-analysis] Section batch (${depth}) failed:`, err);
    }
  });

  await Promise.all(depthPromises);

  // Build final pages for only the requested sections
  const pages: RndReportPage[] = sections.map(({ sectionId, depth }) => {
    const def = PAGE_DEFS.find(p => p.id === sectionId);
    if (!def) return null;

    const result = allResults.get(sectionId);
    if (result && result.content) {
      return {
        pageId: def.id,
        pageNum: def.num,
        title: def.title,
        subtitle: def.subtitle,
        content: result.content,
        score: typeof result.score === "number" ? Math.max(0, Math.min(100, result.score)) : undefined,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        dataPoints: {
          ...(result.dataPoints && typeof result.dataPoints === "object" ? result.dataPoints : {}),
          depth,
          targetWords: String(SECTION_DEPTH_CONFIG[depth].words),
        },
      };
    }

    return makeFallbackPage(def, input);
  }).filter((p): p is RndReportPage => p !== null);

  onStatus?.(`${pages.length} section${pages.length > 1 ? "s" : ""} generated.`);
  return pages;
}
