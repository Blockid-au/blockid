// GET /api/site-crawl/stream?url=<url>
//
// SSE endpoint that BFS-crawls up to 8 same-host URLs (depth 1) and emits
// `page_fetch`, `tech_detect`, `signal_extract` events as it goes.
// Non-blocking; the client can render pages as they arrive.

import { scrapeUrl, deepTechAudit } from "@/lib/rnd-input";
import { extractSignals } from "@/lib/svi-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URLS = 8;
const PRIORITY_PATHS = ["/about", "/pricing", "/team", "/product", "/customers", "/contact"];

function sameHostLinks(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const anchorRe = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) != null) {
    const href = m[1];
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname !== baseUrl.hostname) continue;
      if (!/^https?:$/.test(url.protocol)) continue;
      // Normalize (strip fragment, trailing slash) so priority + dedupe work
      url.hash = "";
      const key = url.toString().replace(/\/$/, "");
      links.add(key);
    } catch {
      // ignore malformed hrefs
    }
    if (links.size >= 40) break;
  }
  return Array.from(links);
}

function orderByPriority(urls: string[]): string[] {
  const priority: string[] = [];
  const rest: string[] = [];
  for (const u of urls) {
    if (PRIORITY_PATHS.some(p => u.toLowerCase().includes(p))) priority.push(u);
    else rest.push(u);
  }
  return [...priority, ...rest];
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return new Response("Missing ?url=", { status: 400 });
  }

  let base: URL;
  try {
    base = new URL(target.startsWith("http") ? target : `https://${target}`);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)));
      };

      try {
        send("start", { url: base.toString(), max: MAX_URLS });

        // ── Fetch root ──────────────────────────────────────────────
        const rootScrape = await scrapeUrl(base.toString());
        send("page_fetch", { url: base.toString(), title: rootScrape.title, textLength: rootScrape.text.length });
        send("tech_detect", { url: base.toString(), techHints: rootScrape.techHints });

        // Extract same-host links from the HTML (need raw HTML — refetch minimal)
        const rootHtmlRes = await fetch(base.toString(), {
          headers: { "User-Agent": "BlockID-Bot/1.0 (+https://blockid.au)" },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        const rootHtml = rootHtmlRes ? await rootHtmlRes.text() : "";
        const links = orderByPriority(sameHostLinks(rootHtml, base)).slice(0, MAX_URLS - 1);
        send("discovered", { count: links.length, urls: links });

        const pages: Array<{ url: string; text: string }> = [
          { url: base.toString(), text: rootScrape.text },
        ];

        // ── Crawl each with a small per-page timeout ────────────────
        for (const link of links) {
          try {
            const scraped = await scrapeUrl(link);
            pages.push({ url: link, text: scraped.text });
            send("page_fetch", { url: link, title: scraped.title, textLength: scraped.text.length });
            if (scraped.techHints.length > 0) {
              send("tech_detect", { url: link, techHints: scraped.techHints });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send("page_error", { url: link, error: msg });
          }
        }

        // ── Optional deep tech audit for the root ───────────────────
        try {
          const audit = await deepTechAudit(base.toString());
          send("tech_detect", {
            url: base.toString(),
            audit: {
              overallGrade: audit.overallGrade,
              security: audit.security.grade,
              performance: audit.performance.grade,
              frameworks: audit.techStack.frameworks,
              cms: audit.techStack.cms,
              cdn: audit.techStack.cdn,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send("page_error", { url: base.toString(), error: `tech-audit: ${msg}` });
        }

        // ── Signal extraction across combined text ─────────────────
        const combined = pages.map(p => p.text).join("\n\n").slice(0, 40_000);
        const signals = extractSignals({ rawText: combined });
        send("signal_extract", {
          totalPages: pages.length,
          signals: {
            hasProduct: signals.hasProduct,
            hasCustomers: signals.hasCustomers,
            hasSocialProof: signals.hasSocialProof,
            hasRevenue: signals.hasRevenue,
            hasAnalytics: signals.hasAnalytics,
            sector: signals.sector,
          },
        });

        send("done", { totalPages: pages.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
