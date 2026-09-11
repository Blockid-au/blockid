import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { callAI } from "@/lib/ai-client";
import { optimizeForSearch } from "@/lib/adk/agents";
import { isCronAuthorised } from "@/lib/security/cron-auth";

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
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Load topic queue and manifest
    const queuePath = join(CONTENT_DIR, "topic-queue.json");
    const manifestPath = join(CONTENT_DIR, "manifest.json");

    if (!existsSync(queuePath)) {
      return NextResponse.json({ ok: false, error: "topic-queue.json not found" }, { status: 404 });
    }

const ARTICLE_CATEGORIES = [
  "valuation", "cap-table", "fundraising", "equity", "compliance", "tools", "growth",
] as const;

/**
 * Reject a topic the model did not actually write.
 *
 * The auto-research prompt shows an example JSON object to fix the shape. A
 * weaker model answers by echoing that example back, and `JSON.parse(...) as
 * TopicItem` is a compile-time cast that checks nothing at runtime — so the
 * placeholders were written to topic-queue.json AND published as a real
 * article. Two of them reached production: /insights/kebab-case-slug, titled
 * "Title Under 70 Chars", category "valuation|cap-table|fundraising|..." (the
 * list of options, not a choice), CTA pointing at "/tools/xxx or /score or /",
 * and a description offering a "keyword1-focused guide". Both were in the
 * sitemap and on the /insights index.
 *
 * Checks the shape AND the specific example values, because a model that
 * echoes the example produces something structurally valid.
 */
function validateTopic(t: unknown): { ok: true; topic: TopicItem } | { ok: false; reason: string } {
  if (!t || typeof t !== "object") return { ok: false, reason: "not an object" };
  const o = t as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");

  const slug = str("slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){1,11}$/.test(slug)) return { ok: false, reason: `bad slug "${slug}"` };
  if (slug === "kebab-case-slug") return { ok: false, reason: "slug is the prompt example" };

  const title = str("title");
  if (title.length < 15 || title.length > 70) return { ok: false, reason: `title length ${title.length}` };
  if (/title under \d+ chars/i.test(title)) return { ok: false, reason: "title is the prompt example" };

  const category = str("category");
  if (!(ARTICLE_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, reason: `category "${category}" is not one of ${ARTICLE_CATEGORIES.join(", ")}` };
  }

  const keywords = Array.isArray(o.keywords)
    ? (o.keywords as unknown[]).filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
  if (keywords.length < 2) return { ok: false, reason: "fewer than 2 keywords" };
  if (keywords.some((k) => /^keyword\d$/i.test(k.trim()))) return { ok: false, reason: "keywords are the prompt example" };
  if (keywords.some((k) => k.includes("INTENT:") || k.includes("..."))) return { ok: false, reason: "keywords contain prompt fragments" };

  const cta = (o.cta ?? {}) as Record<string, unknown>;
  const href = typeof cta.href === "string" ? cta.href.trim() : "";
  const label = typeof cta.label === "string" ? cta.label.trim() : "";
  if (!href.startsWith("/") || href.includes(" ")) return { ok: false, reason: `bad cta.href "${href}"` };
  if (href.includes("xxx") || /^cta label$/i.test(label)) return { ok: false, reason: "cta is the prompt example" };

  return { ok: true, topic: { ...(o as unknown as TopicItem), slug, title, category, keywords } };
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
        const candidate = validateTopic(JSON.parse(cleaned));
        if (!candidate.ok) {
          // Do NOT persist or publish — a rejected topic that reaches the queue
          // is published on the next run without ever being re-checked.
          return NextResponse.json({
            ok: true,
            message: "Auto-researched topic rejected as invalid; nothing published.",
            reason: candidate.reason,
          });
        }
        topic = candidate.topic;
        queue.topics.push(topic);
        writeFileSync(queuePath, JSON.stringify(queue, null, 2) + "\n", "utf-8");
      } catch (researchErr) {
        return NextResponse.json({ ok: true, message: "Queue depleted and auto-research failed.", error: String(researchErr) });
      }
    }

    if (!topic) {
      return NextResponse.json({ ok: true, message: "No topic available." });
    }
    // A topic already sitting in the queue gets the same treatment: earlier runs
    // wrote unvalidated ones there, so trusting the file would republish them.
    const queued = validateTopic(topic);
    if (!queued.ok) {
      return NextResponse.json({
        ok: true,
        message: "Queued topic is invalid; nothing published.",
        slug: (topic as { slug?: string }).slug ?? null,
        reason: queued.reason,
      });
    }
    const nextTopic = queued.topic;

    // 2.5 Brand Search Optimization (Google Agent Garden port) — expand the
    // topic's keywords and tighten the title for search intent before writing.
    // Fully fail-safe: returns the original title/keywords if the agents fail.
    const seo = await optimizeForSearch(
      { title: nextTopic.title, keywords: nextTopic.keywords, angle: nextTopic.angle },
      adkModel,
    );
    // optimizeForSearch is documented as fail-safe, but it can return a result
    // with these fields missing, and `articleKeywords.join(", ")` below then
    // threw "Cannot read properties of undefined (reading 'join')" — a 500 on
    // every run. Fall back to the topic's own values, which is what the
    // fail-safe was meant to do.
    const articleTitle = seo?.optimizedTitle?.trim() || nextTopic.title;
    const articleKeywords =
      Array.isArray(seo?.expandedKeywords) && seo.expandedKeywords.length > 0
        ? seo.expandedKeywords
        : nextTopic.keywords;

    // 3. Generate article via AI
    const aiResult = await callAI({
      system: `You are a visual-first content designer for BlockID.au — an AI startup valuation platform. Your output is a VISUAL SKETCH, not an essay. Founders scan, not read.

## HARD LIMITS
- **400–600 words of text total** — treat every word as expensive
- **2 SVG infographics mandatory** — they carry most of the content weight
- **1 data table** — scannable numbers, no prose explanation needed
- **3 bullet lists max** — no paragraphs over 2 sentences
- **0 filler intros** — start with the hook stat or question, nothing before it

## LAYOUT (exact order, no deviation)

\`\`\`
[Hook: 1-2 punchy lines — stat or provocative question]
[SVG 1: Data chart — the "what" with numbers]
[1-sentence context]
[H2: Key insight]
[Data table: 3-5 rows, scannable]
[H2: What to do about it]
[Bullet checklist: 5-7 items, action verbs]
[CTA mid]
[SVG 2: Framework/process/decision — the "how"]
[2-3 lines closing]
[CTA end]
\`\`\`

## SVG RULES (non-negotiable)
- viewBox="0 0 700 300" · style="width:100%;max-width:700px;margin:2rem auto;display:block;"
- Dark bg: rect fill="#0f172a" rx="14" — always dark, never white
- Brand palette: #3b82f6 blue · #10b981 green · #f59e0b amber · #f43f5e red · #a855f7 purple · #06b6d4 cyan
- Values ON the bars/boxes — not below: e.g. text above bar showing "$95K", percentage inside circle
- Title bar at top (y="28"): white bold text, font-size="14"
- Legend or axis labels: fill="#94a3b8" font-size="11"
- Minimum 3 data points per chart — never a chart with 1-2 bars
- SVG 1 = data visualization (bar chart, comparison cards, timeline, stat blocks)
- SVG 2 = process/framework (flow steps, decision tree, 3-step visual, checklist card)

**Good SVG 1 example (stat blocks):**
\`\`\`svg
<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:700px;margin:2rem auto;display:block;">
  <rect width="700" height="220" fill="#0f172a" rx="14"/>
  <text x="350" y="28" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="700" fill="#fff">AU Pre-Seed Benchmarks 2026</text>
  <rect x="30" y="50" width="190" height="130" fill="#1e293b" rx="10"/>
  <text x="125" y="100" text-anchor="middle" font-family="system-ui" font-size="32" font-weight="700" fill="#3b82f6">A$488K</text>
  <text x="125" y="125" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Median valuation</text>
  <rect x="255" y="50" width="190" height="130" fill="#1e293b" rx="10"/>
  <text x="350" y="100" text-anchor="middle" font-family="system-ui" font-size="32" font-weight="700" fill="#10b981">18mo</text>
  <text x="350" y="125" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Avg runway target</text>
  <rect x="480" y="50" width="190" height="130" fill="#1e293b" rx="10"/>
  <text x="575" y="100" text-anchor="middle" font-family="system-ui" font-size="32" font-weight="700" fill="#f59e0b">3.2×</text>
  <text x="575" y="125" text-anchor="middle" font-family="system-ui" font-size="11" fill="#94a3b8">Revenue multiple (seed)</text>
</svg>
\`\`\`

## CTAs
- Format: > **[CTA text →](/path)**
- 1 mid-article, 1 at end. Short, action-oriented, never salesy.

## FORBIDDEN
- No code fences around SVG — embed raw
- No H1 or frontmatter — start at the hook
- No "In today's landscape..." or similar filler
- No fake statistics — use plausible AU benchmarks only
- No paragraphs longer than 2 sentences`,
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
      maxTokens: 1800,
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

    // 9. Ping Google Search Console to index the new article + updated sitemap
    try {
      const articleUrl = `https://blockid.au/insights/${nextTopic.slug}`;
      const sitemapUrl = `https://blockid.au/sitemap.xml`;
      // Bing ping (also picked up by some other engines)
      await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { method: "GET" }).catch(() => {});
      // IndexNow (Bing/Yandex/other engines — instant indexing signal)
      const indexNowKey = process.env.INDEXNOW_KEY;
      if (indexNowKey) {
        await fetch("https://api.indexnow.org/indexnow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            host: "blockid.au",
            key: indexNowKey,
            keyLocation: `https://blockid.au/${indexNowKey}.txt`,
            urlList: [articleUrl],
          }),
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }

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
