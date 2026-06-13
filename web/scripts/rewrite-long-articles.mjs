/**
 * Rewrite oversized insight articles to the new visual-first format.
 * Only processes articles over WORD_LIMIT words (default 2000).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx node scripts/rewrite-long-articles.mjs          # preview
 *   ANTHROPIC_API_KEY=xxx node scripts/rewrite-long-articles.mjs --apply  # rewrite
 *   ANTHROPIC_API_KEY=xxx node scripts/rewrite-long-articles.mjs --apply --limit 5  # first 5 only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "../content/insights");
const WORD_LIMIT = 2000;

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.indexOf("--limit");
const MAX_REWRITES = LIMIT_ARG >= 0 ? parseInt(process.argv[LIMIT_ARG + 1]) : 99;

// Load .env for API key
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length && !process.env[k]) {
      process.env[k] = v.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a visual-first content redesigner. You receive an existing startup blog post and rewrite it as a concise visual sketch.

## OUTPUT FORMAT (exact order)
1. Hook: 1-2 punchy lines — one striking stat or question, nothing else
2. SVG 1: Data visualization (bar chart, stat blocks, comparison) — dark bg #0f172a, values ON the chart
3. One-sentence context
4. H2: Key insight (under 80 words)
5. Data table: 3-5 rows max
6. H2: Action checklist (5-6 bullet points, action verbs)
7. CTA: > **[text →](/path)**
8. SVG 2: Process/framework (3-5 step flow, decision tree, or summary card) — dark bg #0f172a
9. 2-sentence close
10. CTA: > **[text →](/path)**

## HARD LIMITS
- 400-550 words of prose total (SVGs don't count)
- 2 SVG infographics (embed raw, no code fences)
- viewBox="0 0 700 300" · style="width:100%;max-width:700px;margin:2rem auto;display:block;"
- Dark SVG backgrounds always: fill="#0f172a" rx="14"
- Values ON bars/boxes: font-size="28-36" font-weight="700" for big numbers
- No H1, no frontmatter, no filler intros, no paragraphs > 2 sentences

## CTAs to include (pick most relevant)
- [Get your free SVI score →](/)
- [Build your cap table →](/tools/cap-table)
- [Calculate your startup valuation →](/score)
- [Explore founder guides →](/insights)`;

// Use the app's internal AI endpoint (inherits all provider routing + auth)
const AI_ENDPOINT = process.env.REWRITE_AI_URL ?? "http://127.0.0.1:4001/api/ai/completion";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

async function callAI(systemPrompt, userPrompt) {
  // Try internal app endpoint first (uses app's full AI routing)
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ system: systemPrompt, user: userPrompt, maxTokens: 2000 }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.text ?? data.content ?? data.message ?? JSON.stringify(data);
    }
  } catch { /* fallback below */ }

  // Fallback: direct Anthropic API
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// Find articles over the limit
const files = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({
    file: f,
    slug: f.replace(".md", ""),
    content: fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8"),
  }))
  .map((a) => ({ ...a, words: wordCount(a.content) }))
  .filter((a) => a.words > WORD_LIMIT)
  .sort((a, b) => b.words - a.words)
  .slice(0, MAX_REWRITES);

console.log(`\nFound ${files.length} articles over ${WORD_LIMIT} words (showing up to ${MAX_REWRITES})`);
console.log(`Mode: ${APPLY ? "APPLY (rewriting files)" : "DRY RUN (preview only)"}\n`);

if (!APPLY) {
  for (const { file, words } of files) {
    console.log(`  ${words.toString().padStart(5)} words — ${file}`);
  }
  console.log(`\nRun with --apply to rewrite them.`);
  console.log(`Add --limit N to process only the first N articles.`);
  process.exit(0);
}

let rewritten = 0;
let failed = 0;

for (const { file, slug, content, words } of files) {
  console.log(`\n[${rewritten + failed + 1}/${files.length}] ${slug} (${words} words)`);

  // Read manifest to get title/keywords
  const manifestPath = path.join(CONTENT_DIR, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const meta = manifest.articles.find((a) => a.slug === slug);
  const title = meta?.title ?? slug;
  const keywords = (meta?.keywords ?? []).join(", ");
  const cta = meta?.cta;

  const userPrompt = `Rewrite this article as a concise visual-first blog post (400-550 words + 2 SVGs).

Article title: ${title}
Keywords: ${keywords}
${cta ? `CTA to include: [${cta.label}](${cta.href})` : ""}

EXISTING CONTENT (extract the key facts/data, discard the verbosity):
---
${content.slice(0, 3000)}
---

Produce the rewritten article in markdown. Start directly with the hook — no H1 title, no frontmatter.`;

  try {
    const newContent = await callAI(SYSTEM_PROMPT, userPrompt);
    const newWords = wordCount(newContent);

    // Backup original
    const backupPath = path.join(CONTENT_DIR, `.bak_${file}`);
    fs.writeFileSync(backupPath, content, "utf-8");

    // Write rewritten
    fs.writeFileSync(path.join(CONTENT_DIR, file), newContent.trim(), "utf-8");

    // Update manifest readingTime
    if (meta) {
      meta.readingTime = Math.max(2, Math.round(newWords / 230));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    }

    console.log(`  ✅ ${words} → ${newWords} words (${Math.round((1 - newWords / words) * 100)}% shorter)`);
    rewritten++;

    // Rate limit: pause between calls
    await new Promise((r) => setTimeout(r, 1200));
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    failed++;
  }
}

console.log(`\n════════════════════════`);
console.log(`✅ Rewritten: ${rewritten}`);
console.log(`❌ Failed:    ${failed}`);
console.log(`📁 Backups:   content/insights/.bak_*.md`);
