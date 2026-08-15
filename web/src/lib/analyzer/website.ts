// Website signal collector for the Code/Website Analyzer.
//
// Optional PageSpeed Insights call if PSI_API_KEY is set — else derives
// perf/seo/a11y heuristically from the HTML head. Every branch is
// non-throwing; failures fall through to null-scored signals.

import "server-only";
import type { WebsiteSignals } from "./types";

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const FETCH_TIMEOUT_MS = 10_000;
const PSI_TIMEOUT_MS = 15_000;

function normalizeUrl(rawUrl: string): URL | null {
  try {
    const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    return new URL(withProto);
  } catch {
    return null;
  }
}

async function timedFetch(url: string, timeoutMs = FETCH_TIMEOUT_MS, init?: RequestInit): Promise<{
  res: Response | null;
  ttfbMs: number;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "blockid-analyzer/1.0 (+https://blockid.au)",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    return { res, ttfbMs: Date.now() - start };
  } catch {
    return { res: null, ttfbMs: Date.now() - start };
  } finally {
    clearTimeout(t);
  }
}

function countMetaTags(html: string): number {
  const matches = html.match(/<meta\b[^>]*>/gi);
  return matches ? matches.length : 0;
}

function heuristicScores(html: string, ttfbMs: number, hasSitemap: boolean, hasRobots: boolean) {
  const size = Buffer.byteLength(html);
  const hasTitle = /<title>[^<]{2,}<\/title>/i.test(html);
  const hasDesc = /<meta\s+[^>]*name=["']description["']/i.test(html);
  const hasViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html);
  const htmlLang = /<html\b[^>]*\blang=/i.test(html);

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsWithAlt = imgTags.filter((t) => /\balt=/i.test(t)).length;
  const altRate = imgTags.length === 0 ? 1 : imgsWithAlt / imgTags.length;

  let perf = 60;
  if (ttfbMs < 300) perf += 10;
  if (size < 200 * 1024) perf += 10;
  if (size > 1024 * 1024) perf -= 10;

  let seo = 60;
  if (hasDesc) seo += 15;
  if (hasTitle) seo += 10;
  if (hasSitemap) seo += 5;
  if (hasRobots) seo += 5;

  let a11y = 60;
  if (htmlLang) a11y += 10;
  if (altRate >= 0.9) a11y += 10;
  if (hasViewport) a11y += 5;

  return {
    perf: Math.max(0, Math.min(100, perf)),
    seo: Math.max(0, Math.min(100, seo)),
    a11y: Math.max(0, Math.min(100, a11y)),
  };
}

interface PsiResp {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number };
      seo?: { score?: number };
      accessibility?: { score?: number };
    };
  };
}

async function fetchPsi(target: string): Promise<{ perf: number; seo: number; a11y: number } | null> {
  const key = process.env.PSI_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    url: target,
    key,
    strategy: "mobile",
  });
  ["performance", "seo", "accessibility"].forEach((c) => params.append("category", c));

  const { res } = await timedFetch(`${PSI_URL}?${params.toString()}`, PSI_TIMEOUT_MS);
  if (!res || !res.ok) return null;
  try {
    const json = (await res.json()) as PsiResp;
    const cats = json.lighthouseResult?.categories;
    const perf = cats?.performance?.score;
    const seo = cats?.seo?.score;
    const a11y = cats?.accessibility?.score;
    if (perf == null || seo == null || a11y == null) return null;
    return {
      perf: Math.round(perf * 100),
      seo: Math.round(seo * 100),
      a11y: Math.round(a11y * 100),
    };
  } catch {
    return null;
  }
}

export async function analyseWebsite(rawUrl: string): Promise<WebsiteSignals | null> {
  const u = normalizeUrl(rawUrl);
  if (!u) return null;

  const target = u.toString();
  const { res, ttfbMs } = await timedFetch(target);

  let html = "";
  if (res && res.ok) {
    try {
      html = await res.text();
    } catch {
      html = "";
    }
  }

  const [sitemapRes, robotsRes] = await Promise.all([
    timedFetch(new URL("/sitemap.xml", u).toString(), 5000, { method: "HEAD" }),
    timedFetch(new URL("/robots.txt", u).toString(), 5000, { method: "HEAD" }),
  ]);

  const hasSitemap = sitemapRes.res?.ok === true;
  const hasRobots = robotsRes.res?.ok === true;

  const psi = await fetchPsi(target);
  const scores = psi ?? heuristicScores(html, ttfbMs, hasSitemap, hasRobots);

  return {
    https: u.protocol === "https:",
    ttfbMs: res ? ttfbMs : null,
    perf: scores.perf,
    seo: scores.seo,
    a11y: scores.a11y,
    hasSitemap,
    hasRobots,
    metaTagCount: html ? countMetaTags(html) : null,
  };
}
