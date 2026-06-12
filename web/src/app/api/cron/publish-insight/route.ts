import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { callAI } from "@/lib/ai-client";
import { optimizeForSearch } from "@/lib/adk/agents";

/** Adapter: ADK ModelCaller (system, user, maxTokens) → free callAI(). */
const adkModel = async (system: string, user: string, maxTokens: number): Promise<string> =>
  (await callAI({ system, user, maxTokens, timeoutMs: 60_000 })).text;

export const dynamic = "force-dynamic";

const CONTENT_DIR = join(process.cwd(), "content", "insights");

interface TopicItem {
  slug: string;
  title: string;
  category: string;
  keywords: string[];
  cta: { label: string; href: string };
  angle: string;
}

interface ManifestArticle {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  publishedAt: string;
  readingTime: number;
  cta: { label: string; href: string };
}

/**
 * Daily cron: auto-generate and publish one SEO article per day.
 *
 * Picks the first unpublished topic from topic-queue.json, generates
 * a full article via AI, writes the markdown file, and updates manifest.json.
 *
 * Trigger: GET /api/cron/publish-insight  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Load topic queue and manifest
    const queuePath = join(CONTENT_DIR, "topic-queue.json");
    const manifestPath = join(CONTENT_DIR, "manifest.json");

    if (!existsSync(queuePath)) {
      return NextResponse.json({ ok: false, error: "topic-queue.json not found" }, { status: 404 });
    }

    const queue = JSON.parse(readFileSync(queuePath, "utf-8")) as { topics: TopicItem[] };
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { articles: ManifestArticle[] };

    // 2. Find first unpublished topic, or auto-generate one
    const publishedSlugs = new Set(manifest.articles.map((a) => a.slug));
    let topic = queue.topics.find((t) => !publishedSlugs.has(t.slug)) ?? null;

    if (!topic) {
      // Auto-research: generate a new topic when queue is depleted
      try {
        const existingTitles = manifest.articles.map((a) => a.title).join("\n- ");
        const researchResult = await callAI({
          system: `You are an SEO strategist for BlockID.au (Australian startup valuation platform). Generate ONE new blog topic that Australian founders would search for. Return ONLY valid JSON with this exact structure:
{"slug":"kebab-case-slug","title":"Title Under 70 Chars","category":"valuation|cap-table|fundraising|equity|compliance|tools|growth","keywords":["keyword1","keyword2","keyword3"],"cta":{"label":"CTA Label","href":"/tools/xxx or /score or /"},"angle":"2-3 sentence brief for the writer"}
No markdown, no explanation, just the JSON object.`,
          user: `Already published:\n- ${existingTitles}\n\nGenerate a NEW topic (not duplicate) targeting a high-intent keyword Australian founders search for. Focus on practical, actionable content that showcases BlockID tools.`,
          maxTokens: 500,
        });
        topic = JSON.parse(researchResult.text.replace(/```json?\n?/g, "").replace(/```/g, "").trim()) as TopicItem;
        queue.topics.push(topic);
        writeFileSync(queuePath, JSON.stringify(queue, null, 2) + "\n", "utf-8");
      } catch (researchErr) {
        return NextResponse.json({ ok: true, message: "Queue depleted and auto-research failed.", error: String(researchErr) });
      }
    }

    if (!topic) {
      return NextResponse.json({ ok: true, message: "No topic available." });
    }
    const nextTopic = topic;

    // 2.5 Brand Search Optimization (Google Agent Garden port) — expand the
    // topic's keywords and tighten the title for search intent before writing.
    // Fully fail-safe: returns the original title/keywords if the agents fail.
    const seo = await optimizeForSearch(
      { title: nextTopic.title, keywords: nextTopic.keywords, angle: nextTopic.angle },
      adkModel,
    );
    const articleTitle = seo.optimizedTitle;
    const articleKeywords = seo.expandedKeywords;

    // 3. Generate article via AI
    const aiResult = await callAI({
      system: `You are an expert SEO content writer and growth marketer for BlockID.au, an Australian AI-powered startup valuation platform. Write a comprehensive, visually rich blog post in markdown format.

Content Rules:
- Write 2000-3000 words, practical and actionable
- Target Australian founders (pre-seed to Series A)
- Use AUD currency, reference Australian regulations (ASIC, ATO, ESIC) where relevant
- Write in a confident, professional tone — no fluff, no filler

Structure Rules:
- Use H2 (##) and H3 (###) headings for clear structure
- Include at least 1 comparison table (markdown table with | pipes)
- Include at least 1 checklist section (using - [ ] or numbered list)
- Include at least 1 blockquote (>) with a key insight or statistic
- Break up text with short paragraphs (2-3 sentences each)

CTA Rules (CRITICAL — every article must drive users to BlockID):
- Include 3 inline CTAs throughout the article, naturally woven into the content:
  1. Early CTA (after first major section): link to a relevant BlockID tool
  2. Mid CTA (after a key insight): link to the SVI score
  3. End CTA (final section): strong call-to-action with clear value proposition
- CTA format: use a blockquote with bold text and link, e.g.:
  > **Ready to check your startup valuation?** [Get your free Startup Value Index →](/)

Link Rules:
- Include internal links to BlockID tools: [text](/tools/xxx), [text](/score), [text](/)
- Include 2-3 external links to authoritative sources (ABS, ATO, ASIC, AVCAL, Startup Genome)
- Link to related insights: [More guides](/insights)

Visual Elements (MANDATORY — every article MUST include these):
- Include markdown tables for comparisons, benchmarks, or checklists
- Use bold (**text**) for key terms and important numbers
- Use > blockquotes for statistics, expert quotes, or key takeaways
- Include AT LEAST 2 inline SVG infographics (charts, flows, or comparison cards)

SVG Infographic Rules (REQUIRED — minimum 2 per article):
- Use inline SVG with viewBox="0 0 700 XXX" and style="width:100%;max-width:700px;margin:2rem auto;display:block;"
- Brand colors: #2563eb (blue), #10b981 (green), #f59e0b (amber), #1e293b (text), #f8fafc (bg)
- Font: font-family="Arial", rounded corners rx="8"
- Types to use: bar charts, process flows (boxes with arrows), comparison cards, gauges, timeline charts
- Each SVG must be self-contained (no external resources)
- Place SVG directly in markdown (not inside code blocks)
- SVG 1: Place after the first major section (a visual summary or key data chart)
- SVG 2: Place before the conclusion (a process flow, comparison, or action framework)

Example SVG bar chart:
<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;margin:2rem auto;display:block;">
  <rect width="700" height="250" fill="#f8fafc" rx="12"/>
  <text x="350" y="28" text-anchor="middle" font-family="Arial" font-size="15" font-weight="bold" fill="#1e293b">Chart Title</text>
  <rect x="60" y="50" width="100" height="150" fill="#2563eb" rx="4"/>
  <text x="110" y="220" text-anchor="middle" font-family="Arial" font-size="11" fill="#64748b">Label 1</text>
</svg>

Do NOT include the H1 title (added separately). Do NOT include frontmatter. Start with the first H2.`,
      user: `Write a blog post on:

Title: ${articleTitle}
Category: ${nextTopic.category}
Target keywords: ${articleKeywords.join(", ")}
Angle/brief: ${nextTopic.angle}

Internal links to include:
- BlockID SVI Score: [Get your free SVI score](/)
- Relevant tool: [${nextTopic.cta.label}](${nextTopic.cta.href})
- Insights page: [More founder guides](/insights)

Write the full article in markdown. Make it genuinely helpful, visually rich with tables and blockquotes, and include 3 naturally-placed CTAs driving readers to BlockID.au tools.`,
      maxTokens: 4000,
    });

    const articleContent = aiResult.text.trim();

    // 4. Generate meta description
    const descResult = await callAI({
      system: "Write a single meta description for an SEO blog post. Max 155 characters. Include the primary keyword. No quotes around it. Just the plain text.",
      user: `Title: ${nextTopic.title}\nKeywords: ${nextTopic.keywords[0]}\nFirst 200 chars of article: ${articleContent.slice(0, 200)}`,
      maxTokens: 100,
    });

    // Prefer the SEO-optimised meta description when the agent produced one.
    const description = (seo.metaDescription || descResult.text.trim()).slice(0, 155);

    // 5. Estimate reading time
    const wordCount = articleContent.split(/\s+/).length;
    const readingTime = Math.max(5, Math.round(wordCount / 230));

    // 6. Write markdown file
    const mdPath = join(CONTENT_DIR, `${nextTopic.slug}.md`);
    writeFileSync(mdPath, articleContent, "utf-8");

    // 7. Update manifest
    const today = new Date().toISOString().split("T")[0];
    const newArticle: ManifestArticle = {
      slug: nextTopic.slug,
      title: articleTitle,
      description,
      keywords: articleKeywords,
      category: nextTopic.category,
      publishedAt: today,
      readingTime,
      cta: nextTopic.cta,
    };

    manifest.articles.unshift(newArticle);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

    // 8. Invalidate cache
    try {
      const { invalidateCache } = await import("@/lib/insights");
      invalidateCache();
    } catch { /* cache module may not be available in this context */ }

    return NextResponse.json({
      ok: true,
      published: {
        slug: nextTopic.slug,
        title: articleTitle,
        url: `https://blockid.au/insights/${nextTopic.slug}`,
        wordCount,
        readingTime,
      },
      remaining: queue.topics.filter((t) => !publishedSlugs.has(t.slug) && t.slug !== nextTopic.slug).length,
      model: aiResult.model,
    });
  } catch (err) {
    console.error("[blockid:publish-insight] cron failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export { GET as POST };
