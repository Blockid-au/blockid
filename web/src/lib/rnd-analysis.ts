import "server-only";
import type { SVIAnalysis } from "./svi-analysis";
import { SVI_STAGE_LABELS } from "./svi-analysis";
import type { InputType, TechAuditResult } from "./rnd-input";
import { callAI } from "./ai-client";
import { type SectionDepth, SECTION_DEPTH_CONFIG, calculateReportCost } from "./credits";

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
  content: string;  // Markdown content (narrative essay)
  lockedPreview?: string;   // Preview text of locked deeper analysis
  lockedSections?: string[]; // Titles of sections behind paywall
  score?: number;   // 0-100 dimension score
  highlights?: string[];
  dataPoints?: Record<string, string>;
  extendedSections?: RndExtendedSection[];  // Deep Dive only
}

export interface RndReport {
  version: "1.0.0" | "2.0.0";
  inputType: InputType;
  inputUrl?: string;
  pages: RndReportPage[];
  overallScore: number;
  createdAt: string;
  tier: ReportTier;
  potentialSVI?: number;  // Projected SVI after improvements
  wordCount?: number;     // Actual total word count across all pages
  creditCost?: number;    // Actual credit cost based on word count
}

const PAGE_DEFS = [
  { id: "executive", num: 1, title: "Executive Summary", subtitle: "Overall startup assessment", titleVi: "Tóm Tắt Điều Hành", subtitleVi: "Đánh giá tổng quan startup" },
  { id: "market", num: 2, title: "Market & Problem", subtitle: "Market size, timing, validation", titleVi: "Thị Trường & Vấn Đề", subtitleVi: "Quy mô thị trường, thời điểm, xác nhận" },
  { id: "product", num: 3, title: "Product & Technology", subtitle: "Tech stack, AI usage, maturity", titleVi: "Sản Phẩm & Công Nghệ", subtitleVi: "Công nghệ, AI, mức độ trưởng thành" },
  { id: "business", num: 4, title: "Business Model", subtitle: "Revenue, pricing, unit economics", titleVi: "Mô Hình Kinh Doanh", subtitleVi: "Doanh thu, định giá, kinh tế đơn vị" },
  { id: "competition", num: 5, title: "Competition & Moat", subtitle: "Competitors, differentiation", titleVi: "Cạnh Tranh & Lợi Thế", subtitleVi: "Đối thủ, sự khác biệt" },
  { id: "traction", num: 6, title: "Traction & Growth", subtitle: "Users, traffic, SEO, social proof", titleVi: "Tăng Trưởng & Phát Triển", subtitleVi: "Người dùng, lưu lượng, SEO, bằng chứng" },
  { id: "team", num: 7, title: "Team & Execution", subtitle: "Founder signals, domain expertise", titleVi: "Đội Ngũ & Thực Thi", subtitleVi: "Nhà sáng lập, chuyên môn lĩnh vực" },
  { id: "financial", num: 8, title: "Financial Projections", subtitle: "Revenue potential, funding needs", titleVi: "Dự Báo Tài Chính", subtitleVi: "Tiềm năng doanh thu, nhu cầu vốn" },
  { id: "risk", num: 9, title: "Risk Assessment", subtitle: "Key risks, red flags, mitigation", titleVi: "Đánh Giá Rủi Ro", subtitleVi: "Rủi ro chính, cảnh báo, giảm thiểu" },
  { id: "recommendations", num: 10, title: "Recommendations", subtitle: "Prioritized action plan", titleVi: "Khuyến Nghị", subtitleVi: "Kế hoạch hành động ưu tiên" },
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
  lockedPreview?: string;
  lockedSections?: string[];
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

// ── Industry-specific AI guidance ─────────────────────────────────────────────

const INDUSTRY_GUIDANCE: Record<string, string> = {
  saas: "Focus on: MRR/ARR metrics, churn analysis, LTV:CAC, SaaS-specific multiples (5-15x ARR). Reference Bessemer Cloud Index, SaaS Capital benchmarks.",
  marketplace: "Focus on: GMV, take rate, liquidity, chicken-and-egg problem. Reference a16z marketplace metrics.",
  fintech: "Focus on: regulatory requirements (AFSL, ASIC), trust signals, transaction volume. Reference AU fintech landscape.",
  healthtech: "Focus on: clinical validation, regulatory pathway (TGA), clinician adoption. Reference AU digital health landscape.",
  edtech: "Focus on: student engagement, completion rates, B2B vs B2C model. Reference AU education market.",
  ecommerce: "Focus on: AOV, repeat purchase rate, CAC payback. Reference AU e-commerce growth.",
  deeptech: "Focus on: IP protection, R&D timeline, grant eligibility (R&D Tax Incentive). Reference CSIRO collaboration opportunities.",
};

/** Detect industry from raw text or scraped data — returns the INDUSTRY_GUIDANCE key or undefined. */
function detectIndustry(input: string, scrapedText?: string): string | undefined {
  const combined = `${input}\n${scrapedText ?? ""}`.toLowerCase();
  // Ordered by specificity — check compound terms first
  if (/\bhealthtech\b|health\s*tech\b|medtech\b|digital\s*health\b|telehealth\b|clinical\b/i.test(combined)) return "healthtech";
  if (/\bfintech\b|fin\s*tech\b|financial\s*technology\b|neobank\b|payment/i.test(combined)) return "fintech";
  if (/\bedtech\b|ed\s*tech\b|education\s*tech\b|e-learning\b|lms\b/i.test(combined)) return "edtech";
  if (/\bdeeptech\b|deep\s*tech\b|r&d\s*heavy\b|hardware\b|biotech\b|quantum\b/i.test(combined)) return "deeptech";
  if (/\bmarketplace\b|two.sided\b|multi.sided\b|platform\s*connecting/i.test(combined)) return "marketplace";
  if (/\be-?commerce\b|d2c\b|direct.to.consumer\b|online\s*store\b|shopify\b/i.test(combined)) return "ecommerce";
  if (/\bsaas\b|software.as.a.service\b|\bmrr\b|\barr\b|subscription\s*(model|software)/i.test(combined)) return "saas";
  return undefined;
}

// ── Context builder ──────────────────────────────────────────────────────────

export interface CompetitiveResearchData {
  competitors?: Array<{ name: string; url?: string; description: string; threat: string }>;
  marketInsights?: string[];
  competitiveInsights?: string[];
  summary?: string;
}

function buildContext(
  input: string,
  sviAnalysis: SVIAnalysis,
  inputType: InputType,
  scrapedData?: { title: string; description: string; text: string; techHints: string[] },
  techAudit?: TechAuditResult,
  research?: CompetitiveResearchData,
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
${input.slice(0, 12000)}

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
- Page Content (excerpt): ${scrapedData.text.slice(0, 8000)}`;
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

  if (research) {
    ctx += `\n\n## Competitive Research (live web search data):`;
    if (research.competitors?.length) {
      ctx += `\n### Named Competitors:`;
      for (const c of research.competitors) {
        ctx += `\n- ${c.name}${c.url ? ` (${c.url})` : ""}: ${c.description} [Threat: ${c.threat}]`;
      }
    }
    if (research.marketInsights?.length) {
      ctx += `\n### Market Insights:\n${research.marketInsights.map(i => `- ${i}`).join("\n")}`;
    }
    if (research.competitiveInsights?.length) {
      ctx += `\n### Competitive Insights:\n${research.competitiveInsights.map(i => `- ${i}`).join("\n")}`;
    }
    if (research.summary) {
      ctx += `\n### Research Summary: ${research.summary}`;
    }
  }

  // Industry-specific guidance — detect from raw input or scraped content
  const detectedIndustry = detectIndustry(input, scrapedData?.text);
  if (detectedIndustry && INDUSTRY_GUIDANCE[detectedIndustry]) {
    ctx += `\n\n## Industry-Specific Guidance (${detectedIndustry.toUpperCase()}):
${INDUSTRY_GUIDANCE[detectedIndustry]}
Apply this industry lens across ALL report pages — tailor market sizing, competitor analysis, financial projections, and recommendations to this specific vertical.`;
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

const SYSTEM_STANDARD = `You are a senior startup mentor and analyst for BlockID.au — Australia's AI startup intelligence platform.
Write NARRATIVE ESSAYS: flowing prose paragraphs, never bullet lists. Each page opens with a compelling hook — a surprising market stat, a provocative question, or a real competitor insight that grabs the founder's attention.

Style: McKinsey depth meets Y Combinator warmth. Weave data into sentences naturally ("With a TAM of A$4.2B growing at 12% CAGR…"). Name REAL competitors, tools, ABS/ESIC data, and AU market specifics. Frame gaps as growth opportunities. End each page with actionable next steps.

Free users: 200-350 words/page with lockedPreview + lockedSections. Paid users: comprehensive, no restrictions.
${MENTORING_TONE}
${AU_COMPLIANCE_NOTE}

Return ONLY valid JSON: { "pages": [ { "pageId": "...", "content": "narrative markdown essay...", "lockedPreview": "tantalising preview...", "lockedSections": ["Title 1", "Title 2"], "score": 0-100, "highlights": ["insight 1", "insight 2", "insight 3"], "dataPoints": { "key": "value" } } ] }

Content MUST be prose paragraphs, NOT bullet lists.`;

const SYSTEM_DEEP_DIVE = `You are a senior startup analyst, management consultant, and startup mentor for BlockID.au — Australia's AI startup intelligence platform.
You write in-depth, consultant-grade NARRATIVE ANALYSIS that reads like a Goldman Sachs research note combined with Y Combinator founder advice.

This is a FULL PAID report — no content restrictions. Provide the most comprehensive, insightful analysis possible.

## Writing Style — CRITICAL:
- Write in FLOWING PROSE with connected paragraphs — this is an essay, not a slide deck
- Each page is a deep-dive essay (500-800 words) with multiple sub-sections
- Open with a compelling market insight or founder-relevant observation
- Name SPECIFIC competitors with their funding, traction, and positioning
- Include real market data: TAM/SAM figures, growth rates, funding landscape
- Provide financial estimates with stated assumptions (not fabricated precision)
- Build the narrative arc: context → analysis → insight → specific next action
- Reference Australian-specific context: ESIC benefits, ASIC requirements, ABS statistics
- Include "how this compares to similar startups at your stage" benchmarking
- End each page with 3-5 specific, actionable steps with named tools/resources

## Depth expectations:
- Market page: Real TAM/SAM/SOM with sources, named market reports, timing analysis
- Competition: 5+ named competitors with funding, strengths, weaknesses, threat level
- Financial: 3-scenario revenue model, unit economics, funding timeline
- Recommendations: 30/60/90 day plan with specific deliverables and KPIs

Rules:
- Be evidence-based — use real company names, real market data, real frameworks
- Provide estimates with stated assumptions when exact data is unavailable
- Frame everything through the lens of "how to WIN in this space"
- Return ONLY valid JSON (no markdown wrapping)
${MENTORING_TONE}
${AU_COMPLIANCE_NOTE}

Return format: { "pages": [ { "pageId": "...", "content": "narrative markdown essay (500-800 words)...", "score": 0-100, "highlights": ["key insight 1", "key insight 2", "key insight 3"], "dataPoints": { "key": "value" } } ] }

Write each page as a compelling mini-essay that the founder would want to highlight and share with co-founders.`;

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
  // Extract startup stage from context for stage-aware report generation
  const stageMatch = context.match(/## Stage: (\d+)/);
  const stageNum = stageMatch ? parseInt(stageMatch[1], 10) : 3;

  const pageDefs = PAGE_DEFS.filter(p => pageIds.includes(p.id));
  const pageDescriptions = pageDefs.map(p =>
    `- pageId: "${p.id}" (Page ${p.num}: ${p.title} — ${p.subtitle})`
  ).join("\n");

  const isDeepDive = tier === "deep_dive";
  const isPaid = tier === "standard" || tier === "deep_dive";
  const wordGuidance = isDeepDive
    ? "Write 1000-2000 words per page — unlimited depth. Be exhaustive: real data, named competitors, market figures, financial models, benchmarks, actionable plans. Include sub-sections with ### headers. No bullet-point lists — write flowing prose."
    : isPaid
      ? "Write 600-1000 words per page — comprehensive analysis. Real data, named competitors, actionable insights. No content restrictions. No bullet-point lists — write flowing prose."
      : "Write 300-500 words per page as a compelling narrative essay. Open with a hook, weave in data, end with a preview of deeper paid analysis. Include lockedPreview (1-2 sentences teasing deeper analysis) and lockedSections (2-3 titles of deeper sections available in paid tier).";

  // Stage-specific guidance — adapt report content to founder's reality
  const stageGuidance = stageNum <= 2
    ? `\n\nCRITICAL — This is an IDEA/EARLY-STAGE startup (Stage ${stageNum}). Adapt your analysis:
- Do NOT ask for revenue proof, financial statements, or customer data — they don't have any yet
- Instead of "Business Model": suggest 3 specific revenue models that work for this type of startup
- Instead of "Traction": provide a step-by-step plan to get FIRST 10 users (free channels)
- Instead of "Financial Projections": provide a realistic first-year budget (bootstrap track)
- Action items must be doable THIS WEEK with A$0 budget
- Recommend specific free tools: Figma (design), Vercel (deploy), Tally (forms), Carrd (landing page)
- Include a "Mom Test" interview script customized for their idea (5 questions)
- Suggest no-code MVP options if the idea allows it
- End each page with "Your next step (this week):" — one specific action\n`
    : stageNum <= 4
      ? `\n\nThis is an EARLY-REVENUE startup (Stage ${stageNum}). Focus on:
- Growth tactics specific to their sector
- Unit economics guidance (even rough estimates)
- Fundraise preparation checklist
- Team building recommendations
- End each page with concrete next steps\n`
      : ''; // Stage 5+: keep current deep analysis approach

  // For idea-stage startups, reinterpret page titles to match their reality
  const ideaOverrides = stageNum <= 2 ? `
NOTE: For this idea-stage startup, reinterpret these pages:
- "Business Model" → "Revenue Model Options" (suggest 3 models, don't demand existing data)
- "Traction & Growth" → "First Users Plan" (how to get first 10 users for free)
- "Financial Projections" → "Startup Budget" (first 12 months, bootstrap track)
- "Team & Execution" → "Founding Team Blueprint" (what roles needed, how to find co-founders)
- "Recommendations" → "Your 90-Day Action Plan" (week-by-week, specific and free)
` : '';

  const userPrompt = `Analyse this startup and write a compelling narrative research report. Each page should read like a section of a professional analyst essay — NOT bullet points.

Pages to generate:
${pageDescriptions}

${wordGuidance}${stageGuidance}
${ideaOverrides}
IMPORTANT: Write as connected prose paragraphs. Use real market data, name real competitors, reference real tools/frameworks. The founder should feel like they're reading a personal letter from an experienced advisor who has deeply researched their space.

## Context:
${context}

Return JSON with a "pages" array containing one object per page listed above. Each object must have: pageId, content (narrative markdown essay), score (0-100), highlights (array of 2-3 key insights as sentences), dataPoints (object of key metrics)${isPaid ? "" : ", lockedPreview (string), lockedSections (array of 2-3 titles)"}.`;

  onStatus?.(`Generating ${batchLabel}...`);

  const systemPrompt = isDeepDive ? SYSTEM_DEEP_DIVE : isPaid ? SYSTEM_DEEP_DIVE : SYSTEM_STANDARD;
  // Tokens per page (not per batch) — single page needs fewer tokens
  const pagesInBatch = pageIds.length;
  const perPageTokens = isDeepDive ? 4096 : isPaid ? 3000 : 2000;
  const maxTokens = perPageTokens * pagesInBatch;
  const results = new Map<string, BatchPageResult>();

  const viInstruction = locale === "vi"
    ? "\n\nCRITICAL: Write ALL content ENTIRELY in Vietnamese (tiếng Việt). All section titles, analysis, recommendations must be in Vietnamese. Keep technical terms (SVI, ESIC, SAFE, MRR, ARR) in English but explain in Vietnamese.\n"
    : "";

  // Retry up to 3 times with backoff — different providers may succeed
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        onStatus?.(`Retrying ${batchLabel} (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, 3000 * attempt)); // 3s, 6s backoff
      }

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
      if (results.size > 0) break; // success
    } catch (err) {
      console.error(`[rnd-analysis] Batch ${batchLabel} attempt ${attempt + 1} failed:`, err);
    }
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
  locale: "en" | "vi" = "en",
): Promise<Map<string, RndExtendedSection[]>> {
  const deepDivePageIds = Object.keys(DEEP_DIVE_EXTENDED_PAGES);
  const allDescriptions = deepDivePageIds.map(pageId => {
    const def = DEEP_DIVE_EXTENDED_PAGES[pageId];
    return def.descriptions;
  }).join("\n\n");

  const viInstruction = locale === "vi"
    ? "\n\nCRITICAL: Write ALL content ENTIRELY in Vietnamese (tiếng Việt). All section titles, analysis, recommendations must be in Vietnamese. Keep technical terms (SVI, ESIC, SAFE, MRR, ARR) in English but explain in Vietnamese.\n"
    : "";

  const userPrompt = `Generate extended deep-dive analysis sections for the following report pages. Each section should be detailed, actionable, and consultant-grade quality with specific data points.

${allDescriptions}

## Context:
${context}

Return JSON with an "extendedSections" array. Each element must have: pageId (string), sections (array of objects with title, content as markdown, type, and optional dataPoints object).`;

  onStatus?.("Deep diving into competitors...");

  const results = new Map<string, RndExtendedSection[]>();

  try {
    const { text } = await callAI({
      system: SYSTEM_DEEP_DIVE_EXTENDED + viInstruction,
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
  research?: CompetitiveResearchData,
): Promise<RndReport> {
  const context = buildContext(input, sviAnalysis, inputType, scrapedData, techAudit, research);

  onStatus?.(locale === "vi" ? "Bắt đầu phân tích R&D..." : "Starting R&D analysis pipeline...");

  // Generate page-by-page with delay to avoid OAuth rate limits
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  const allResults = new Map<string, BatchPageResult>();

  for (let i = 0; i < PAGE_DEFS.length; i++) {
    const def = PAGE_DEFS[i];
    if (i > 0) await delay(3000); // 3s between pages
    const batch = await runBatch(def.title, [def.id], context, tier, onStatus, locale);
    for (const [k, v] of batch) allResults.set(k, v);
  }

  // Extended sections for paid tiers (after all pages)
  let extendedResults = new Map<string, RndExtendedSection[]>();
  if (tier === "deep_dive") {
    await delay(3000);
    extendedResults = await runDeepDiveExtended(context, onStatus, locale);
  }

  const isVi = locale === "vi";

  // Build final pages — use AI results where available, fallback otherwise
  const pages: RndReportPage[] = PAGE_DEFS.map((def) => {
    const result = allResults.get(def.id);
    const extended = extendedResults.get(def.id);
    const pageTitle = isVi ? def.titleVi : def.title;
    const pageSubtitle = isVi ? def.subtitleVi : def.subtitle;
    if (result && result.content) {
      return {
        pageId: def.id,
        pageNum: def.num,
        title: pageTitle,
        subtitle: pageSubtitle,
        content: result.content,
        lockedPreview: result.lockedPreview ?? undefined,
        lockedSections: Array.isArray(result.lockedSections) ? result.lockedSections : undefined,
        score: typeof result.score === "number" ? Math.max(0, Math.min(100, result.score)) : undefined,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        dataPoints: result.dataPoints && typeof result.dataPoints === "object" ? result.dataPoints : {},
        ...(extended && extended.length > 0 ? { extendedSections: extended } : {}),
      };
    }
    const fallback = makeFallbackPage(def, input);
    fallback.title = pageTitle;
    fallback.subtitle = pageSubtitle;
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

  // Calculate potential SVI (current + gap points that could be gained)
  const gapPoints = (sviAnalysis.evidenceGaps ?? []).reduce((sum, g) => sum + (g.impact ?? 5), 0);
  const potentialSVI = Math.min(300, sviAnalysis.totalSVI + Math.round(gapPoints * 0.7));

  // Calculate actual word count and credit cost from generated pages
  const reportCost = calculateReportCost(pages);

  return {
    version: "2.0.0",
    inputType,
    inputUrl: inputType === "url" ? input.trim() : undefined,
    pages,
    overallScore,
    createdAt: new Date().toISOString(),
    tier,
    potentialSVI,
    wordCount: reportCost.totalWords,
    creditCost: reportCost.totalCredits,
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
  deep: 8192,
  expert: 16384,
  maximum: 16384,
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
