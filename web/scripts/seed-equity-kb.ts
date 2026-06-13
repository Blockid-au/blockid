#!/usr/bin/env npx tsx
/**
 * Seed the 4 Equity & ESOP knowledge-base articles (T0097) into kb_articles.
 *
 * Usage (from web/):
 *   npx tsx scripts/seed-equity-kb.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env. If either is
 * missing, the script exits gracefully without error so it can run during
 * deploy without aborting the gates.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log("[seed-equity-kb] SUPABASE_URL / SERVICE_ROLE_KEY missing — skipping seed.");
  process.exit(0);
}

interface Article {
  slug: string;
  title: string;
  author: string;
  is_public: boolean;
  content: string;
  metadata: Record<string, unknown>;
}

interface SeedFile {
  category: string;
  articles: Article[];
}

const path = resolve(process.cwd(), "content/reports/kb-equity-methodologies.json");
const seed = JSON.parse(readFileSync(path, "utf8")) as SeedFile;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upsert(article: Article, category: string) {
  const existing = await supabase
    .from("kb_articles")
    .select("id, version")
    .eq("slug", article.slug)
    .maybeSingle();

  if (existing.data) {
    const { error } = await supabase
      .from("kb_articles")
      .update({
        title: article.title,
        category,
        content: article.content,
        metadata: article.metadata,
        author: article.author,
        is_public: article.is_public,
        version: existing.data.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id);
    if (error) throw new Error(`update ${article.slug}: ${error.message}`);
    console.log(`[seed-equity-kb] updated ${article.slug} → v${existing.data.version + 1}`);
    return;
  }

  const { error } = await supabase.from("kb_articles").insert({
    slug: article.slug,
    title: article.title,
    category,
    content: article.content,
    metadata: article.metadata,
    author: article.author,
    is_public: article.is_public,
  });
  if (error) throw new Error(`insert ${article.slug}: ${error.message}`);
  console.log(`[seed-equity-kb] inserted ${article.slug}`);
}

async function main() {
  for (const a of seed.articles) {
    await upsert(a, seed.category);
  }
  console.log(`[seed-equity-kb] done — ${seed.articles.length} articles.`);
}

main().catch((err) => {
  console.error("[seed-equity-kb] failed:", err.message);
  process.exit(1);
});
