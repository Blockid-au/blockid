import "server-only";

import { fetchText, type FetchTextOptions, type FetchTextResult } from "@/lib/funding/fetch-source";
import type { SnapshotUnitStatus } from "./input-snapshot";

export const WEBSITE_CORPUS_VERSION = "website-corpus-v1" as const;
export const WEBSITE_CORPUS_MAX_PAGES = 6;
export const WEBSITE_PAGE_TEXT_MAX_CHARS = 12_000;
export const WEBSITE_CORPUS_TEXT_MAX_CHARS = 60_000;

const PRIORITY_PATHS = ["/pricing", "/product", "/customers", "/about", "/team", "/security", "/legal", "/contact"];
const TRACKING_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]);

export interface WebsiteCorpusPage {
  id: string;
  requestedUrl: string;
  finalUrl: string;
  status: SnapshotUnitStatus;
  httpStatus: number | null;
  title: string;
  description: string;
  text: string;
  observedAt: string;
  truncated: boolean;
  error: string | null;
}

export interface WebsiteCorpus {
  version: typeof WEBSITE_CORPUS_VERSION;
  seedUrl: string;
  pages: WebsiteCorpusPage[];
  combinedText: string;
  complete: boolean;
  limits: { maxPages: number; pageChars: number; corpusChars: number };
}

export type WebsiteCorpusEvent =
  | { type: "page"; page: WebsiteCorpusPage }
  | { type: "discovered"; urls: string[] };

export interface WebsiteCorpusDeps {
  fetchPage?: (url: string, opts: FetchTextOptions) => Promise<FetchTextResult>;
  now?: () => Date;
}

function canonicalUrl(raw: string, base?: URL): string {
  const url = base ? new URL(raw, base) : new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function sameHostLinks(html: string, base: URL): string[] {
  const links = new Set<string>();
  const matcher = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(matcher)) {
    try {
      const candidate = new URL(match[1], base);
      if (candidate.hostname !== base.hostname || !/^https?:$/.test(candidate.protocol)) continue;
      links.add(canonicalUrl(candidate.toString()));
    } catch {
      // Malformed and non-URL hrefs are not corpus evidence.
    }
    if (links.size >= 60) break;
  }
  return [...links].sort((a, b) => {
    const ai = PRIORITY_PATHS.findIndex((path) => new URL(a).pathname.toLowerCase().startsWith(path));
    const bi = PRIORITY_PATHS.findIndex((path) => new URL(b).pathname.toLowerCase().startsWith(path));
    const ar = ai < 0 ? PRIORITY_PATHS.length : ai;
    const br = bi < 0 ? PRIORITY_PATHS.length : bi;
    return ar - br || a.localeCompare(b);
  });
}

function htmlValue(html: string, pattern: RegExp): string {
  return (html.match(pattern)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function plainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function failureStatus(result: FetchTextResult): SnapshotUnitStatus {
  if (result.refused || result.blocked) return "blocked";
  if (result.status === 404 || result.status === 410) return "not_found";
  if (/timeout/i.test(result.error ?? "")) return "timeout";
  return "failed";
}

function pageFromResult(id: string, requestedUrl: string, result: FetchTextResult, observedAt: string): WebsiteCorpusPage {
  const finalUrl = result.finalUrl ?? requestedUrl;
  if (!result.ok) {
    return {
      id, requestedUrl, finalUrl, status: failureStatus(result), httpStatus: result.status || null,
      title: "", description: "", text: "", observedAt, truncated: result.truncated, error: result.error ?? null,
    };
  }
  const media = (result.contentType ?? "text/html").split(";", 1)[0].trim().toLowerCase();
  if (!media.startsWith("text/html") && media !== "application/xhtml+xml" && media !== "text/plain") {
    return {
      id, requestedUrl, finalUrl, status: "unsupported", httpStatus: result.status,
      title: "", description: "", text: "", observedAt, truncated: result.truncated, error: `unsupported_content_type:${media}`,
    };
  }
  const body = plainText(result.text);
  const title = htmlValue(result.text, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = htmlValue(result.text, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i);
  const text = [title, description, body].filter(Boolean).join("\n\n").slice(0, WEBSITE_PAGE_TEXT_MAX_CHARS);
  return {
    id, requestedUrl, finalUrl, status: text ? "available" : "unsupported", httpStatus: result.status,
    title, description, text, observedAt,
    truncated: result.truncated || [title, description, body].filter(Boolean).join("\n\n").length > WEBSITE_PAGE_TEXT_MAX_CHARS,
    error: text ? null : "empty_extractable_text",
  };
}

export async function acquireWebsiteCorpus(
  seed: string,
  opts: { maxPages?: number; onEvent?: (event: WebsiteCorpusEvent) => void } = {},
  deps: WebsiteCorpusDeps = {},
): Promise<WebsiteCorpus> {
  const maxPages = Math.max(1, Math.min(WEBSITE_CORPUS_MAX_PAGES, opts.maxPages ?? WEBSITE_CORPUS_MAX_PAGES));
  const fetchPage = deps.fetchPage ?? fetchText;
  const now = deps.now ?? (() => new Date());
  const seedUrl = canonicalUrl(seed);
  const fetched = async (id: string, url: string) => {
    const result = await fetchPage(url, { timeoutMs: 7_000, retries: 0, maxRedirects: 4, userAgent: "BlockID-InvestorResearch/1.0 (+https://blockid.au)" });
    const page = pageFromResult(id, url, result, now().toISOString());
    opts.onEvent?.({ type: "page", page });
    return { page, rawHtml: result.ok ? result.text : "" };
  };

  const rootResult = await fetched("page:root", seedUrl);
  const pages = [rootResult.page];
  if (rootResult.page.status === "available" && maxPages > 1) {
    const base = new URL(rootResult.page.finalUrl);
    const children = sameHostLinks(rootResult.rawHtml, base).filter((url) => url !== canonicalUrl(base.toString())).slice(0, maxPages - 1);
    opts.onEvent?.({ type: "discovered", urls: children });
    for (let index = 0; index < children.length; index++) pages.push((await fetched(`page:${index + 1}`, children[index])).page);
  }

  const combinedText = pages
    .filter((page) => page.status === "available")
    .map((page) => `[Source: ${page.finalUrl}]\n${page.text}`)
    .join("\n\n")
    .slice(0, WEBSITE_CORPUS_TEXT_MAX_CHARS);
  return {
    version: WEBSITE_CORPUS_VERSION,
    seedUrl,
    pages,
    combinedText,
    complete: pages.every((page) => page.status === "available" && !page.truncated),
    limits: { maxPages, pageChars: WEBSITE_PAGE_TEXT_MAX_CHARS, corpusChars: WEBSITE_CORPUS_TEXT_MAX_CHARS },
  };
}
