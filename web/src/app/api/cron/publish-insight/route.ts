import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { callAI } from "@/lib/ai-client";

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

    // 2. Find first unpublished topic
    const publishedSlugs = new Set(manifest.articles.map((a) => a.slug));
    const nextTopic = queue.topics.find((t) => !publishedSlugs.has(t.slug));

    if (!nextTopic) {
      return NextResponse.json({ ok: true, message: "All topics published. Add more to topic-queue.json." });
    }

    // 3. Generate article via AI
    const aiResult = await callAI({
      system: `You are an expert SEO content writer for BlockID.au, an Australian startup platform. Write a comprehensive, practical blog post in markdown format.

Rules:
- Write 1800-2500 words, practical and actionable
- Target Australian founders (pre-seed to Series A)
- Use AUD currency, reference Australian regulations (ASIC, ATO, ESIC) where relevant
- Use H2 (##) and H3 (###) headings for structure
- Include internal links to BlockID tools using markdown: [text](/tools/xxx) or [text](/score) or [text](/)
- Include 2-3 external reference links to authoritative sources (government, industry reports)
- Write in a confident, professional tone — no fluff, no filler
- Include a practical checklist or table where appropriate
- End with a clear CTA paragraph linking to the BlockID tool
- Do NOT include the H1 title (it is added separately)
- Do NOT include frontmatter or metadata
- Start directly with the first H2 section`,
      user: `Write a blog post on:

Title: ${nextTopic.title}
Category: ${nextTopic.category}
Target keywords: ${nextTopic.keywords.join(", ")}
Angle/brief: ${nextTopic.angle}

Internal links to include:
- BlockID SVI Score: [Get your free SVI score](/)
- Relevant tool: [${nextTopic.cta.label}](${nextTopic.cta.href})
- Insights page: [More founder guides](/insights)

Write the full article in markdown. Focus on being genuinely helpful to an Australian founder reading this.`,
      maxTokens: 4000,
    });

    const articleContent = aiResult.text.trim();

    // 4. Generate meta description
    const descResult = await callAI({
      system: "Write a single meta description for an SEO blog post. Max 155 characters. Include the primary keyword. No quotes around it. Just the plain text.",
      user: `Title: ${nextTopic.title}\nKeywords: ${nextTopic.keywords[0]}\nFirst 200 chars of article: ${articleContent.slice(0, 200)}`,
      maxTokens: 100,
    });

    const description = descResult.text.trim().slice(0, 155);

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
      title: nextTopic.title,
      description,
      keywords: nextTopic.keywords,
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
        title: nextTopic.title,
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
