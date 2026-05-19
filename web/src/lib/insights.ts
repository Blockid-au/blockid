import "server-only";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface InsightArticle {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: "valuation" | "cap-table" | "fundraising" | "equity" | "compliance" | "tools" | "growth";
  publishedAt: string;
  updatedAt?: string;
  readingTime: number;
  cta: { label: string; href: string };
  ogImage?: string;
}

interface Manifest {
  articles: InsightArticle[];
}

const CONTENT_DIR = join(process.cwd(), "content", "insights");

let cached: Manifest | null = null;

function loadManifest(): Manifest {
  if (cached) return cached;
  const manifestPath = join(CONTENT_DIR, "manifest.json");
  if (!existsSync(manifestPath)) return { articles: [] };
  cached = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  return cached;
}

export function getAllArticles(): InsightArticle[] {
  return loadManifest().articles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getArticleBySlug(slug: string): InsightArticle | null {
  return loadManifest().articles.find((a) => a.slug === slug) ?? null;
}

export function getArticleContent(slug: string): string | null {
  const mdPath = join(CONTENT_DIR, `${slug}.md`);
  if (!existsSync(mdPath)) return null;
  return readFileSync(mdPath, "utf-8");
}

export function getArticlesByCategory(category: string): InsightArticle[] {
  return getAllArticles().filter((a) => a.category === category);
}

/** Invalidate manifest cache (call after publishing new content) */
export function invalidateCache(): void {
  cached = null;
}
