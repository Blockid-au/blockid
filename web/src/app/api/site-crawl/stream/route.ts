// GET /api/site-crawl/stream?url=<url>
// Compatibility progress stream over the same hardened website-corpus
// producer used by /api/intake.

import { acquireWebsiteCorpus } from "@/lib/intake/website-corpus";
import { extractSignals } from "@/lib/svi-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("Missing ?url=", { status: 400 });
  try {
    const parsed = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEncode(event, data)));
      try {
        send("start", { url: target, producer: "website-corpus-v1" });
        const corpus = await acquireWebsiteCorpus(target, {
          onEvent: (event) => {
            if (event.type === "discovered") {
              send("discovered", { count: event.urls.length, urls: event.urls });
              return;
            }
            const page = event.page;
            if (page.status === "available") {
              send("page_fetch", { url: page.finalUrl, title: page.title, textLength: page.text.length, sourceId: page.id });
            } else {
              send("page_error", { url: page.finalUrl, status: page.status, error: page.error });
            }
          },
        });
        const signals = extractSignals({ rawText: corpus.combinedText });
        send("signal_extract", {
          totalPages: corpus.pages.length,
          availablePages: corpus.pages.filter((page) => page.status === "available").length,
          complete: corpus.complete,
          signals: {
            hasProduct: signals.hasProduct,
            hasCustomers: signals.hasCustomers,
            hasSocialProof: signals.hasSocialProof,
            hasRevenue: signals.hasRevenue,
            hasAnalytics: signals.hasAnalytics,
            sector: signals.sector,
          },
        });
        send("done", { totalPages: corpus.pages.length, complete: corpus.complete, producer: corpus.version });
      } catch (err) {
        send("error", { error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
