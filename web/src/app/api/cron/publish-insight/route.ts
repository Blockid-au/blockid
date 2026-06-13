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
        const raw = researchResult.text;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const cleaned = jsonMatch ? jsonMatch[0] : raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        topic = JSON.parse(cleaned) as TopicItem;
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
      system: `You are a growth content strategist for BlockID.au — an AI startup valuation platform for Australian founders. Write punchy, visual-first blog posts that startup founders actually read.

## TONE & LENGTH
- **800–1200 words max** — founders are busy, every sentence must earn its place
- Open with a hook: a striking stat, a painful founder problem, or a provocative question
- Write like you're texting a smart friend who's building a startup — direct, no corporate speak
- Use AUD, reference AU regulations (ASIC, ATO, ESIC) only where genuinely relevant
- Short paragraphs: 1-2 sentences. White space is your friend.

## STRUCTURE (in order)
1. **Hook opening** — 2-3 lines max. One punchy stat or question.
2. **Visual infographic** — lead with SVG before the first wall of text (founders scan, not read)
3. **Key data table** — comparison or benchmark table
4. **2-3 practical sections** with H2 headings, each under 150 words
5. **Checklist or framework** — actionable takeaways (5-7 items)
6. **Closing CTA infographic** — SVG summary card

## SVG INFOGRAPHICS (MANDATORY — exactly 2, high quality)

SVG rules:
- viewBox="0 0 700 280" — keep height under 320px
- style="width:100%;max-width:700px;margin:2rem auto;display:block;"
- Background: rect fill="#0f172a" rx="12" (dark) OR fill="#f8fafc" (light)
- Brand: #3b82f6 (blue), #10b981 (green), #f59e0b (amber), #f43f5e (red), #a855f7 (purple)
- ALWAYS add data labels/values ON TOP of bars and inside boxes — not just labels below
- Font: font-family="system-ui,Arial"
- Make charts meaningful: actual numbers, percentages, scale indicators

**SVG 1 (after hook)** — Data visualization: bar chart with values, or stat comparison cards with big numbers
**SVG 2 (before conclusion)** — Framework/flow: process steps, decision tree, or key takeaways card

Example of a GOOD bar chart with value labels:
<svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;margin:2rem auto;display:block;">
  <rect width="700" height="280" fill="#0f172a" rx="12"/>
  <text x="350" y="28" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="700" fill="#fff">2026 AU Startup Salaries by Stage (AUD)</text>
  <rect x="60" y="80" width="80" height="120" fill="#3b82f6" rx="6"/>
  <text x="100" y="74" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="700" fill="#3b82f6">$95K</text>
  <text x="100" y="224" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Pre-Seed</text>
  <rect x="200" y="60" width="80" height="140" fill="#10b981" rx="6"/>
  <text x="240" y="54" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="700" fill="#10b981">$115K</text>
  <text x="240" y="224" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Seed</text>
  <rect x="340" y="40" width="80" height="160" fill="#f59e0b" rx="6"/>
  <text x="380" y="34" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="700" fill="#f59e0b">$135K</text>
  <text x="380" y="224" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Series A</text>
</svg>

## CTAs (3 per article, natural placement)
- Format: > **[CTA text →](/path)**
- 1 early, 1 mid, 1 end. Make them feel helpful, not salesy.

## FORBIDDEN
- No walls of text (max 3 sentences per paragraph)
- No generic intros ("In today's competitive landscape...")
- No fake statistics without a source
- No code blocks around SVG — embed directly in markdown
- Do NOT include H1 title or frontmatter. Start with the hook paragraph or first H2.`,
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
      maxTokens: 3000,
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
