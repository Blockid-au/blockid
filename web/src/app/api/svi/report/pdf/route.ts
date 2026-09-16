// GET /api/svi/report/pdf?token=<shareToken>[&v=1]
//
// The Trusted Business Report PDF surface.
//
// S-R4 (G13-W4-R4): the default path renders `ReportV2` through
// `lib/pdf/tbr-pdf.tsx` — react-pdf, the same chapter order as the web,
// visuals drawn by the react-pdf twins, the free tier gated to 10 pages
// by the real page count. No Chromium, no HTTP round-trip to /tbr; the
// stored `svi_snapshots.report_v2` is used when it validates, otherwise the
// read-time adapter builds the document (response header `X-TBR-Source`).
//
// `?v=1` keeps the Wave 25A path for one release (spec §F S-R4 rollback):
// in-process Chromium via Playwright prints /tbr/<token>?pdf=1.
//
// Scope: `?token=` (public share link) only — the founder mints a token
// from the report page; the dossier links the evaluator's own token.
//
// S-R5 (W4-review follow-up a): the route is unauthenticated and a render
// is 4–6 s of CPU, so it now runs behind lib/pdf/render-gate — an
// in-process LRU keyed `(snapshotId, sha1(report) || created_at)` (a repeat
// click is a memcpy) and a 2-slot semaphore (a third concurrent render gets
// 503 + Retry-After instead of queueing). Cache-Control is
// `private, max-age=300` for the token URL. `X-TBR-Cache: hit | miss`.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadReportV2ByShareToken } from "@/lib/report-v2/load";
import { renderTbrPdf } from "@/lib/pdf/tbr-pdf";
import { PDF_RETRY_AFTER_SECONDS, pdfCacheKey, tbrPdfCache, tbrPdfSemaphore, type CachedPdf } from "@/lib/pdf/render-gate";

const PDF_CACHE_CONTROL = "private, max-age=300";

function pdfResponse(pdf: CachedPdf, cache: "hit" | "miss"): NextResponse {
  return new NextResponse(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": PDF_CACHE_CONTROL,
      "X-TBR-Source": pdf.source,
      "X-TBR-Pages": String(pdf.pages),
      "X-TBR-Trim-Level": String(pdf.level),
      "X-TBR-Cache": cache,
    },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Chromium cold-start + full-render can hit 60s (legacy path).

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `BlockID-Business-Report${base ? `-${base}` : ""}.pdf`;
}

function baseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  // Fall back to the request host so this works in dev + prod + preview.
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return `http://localhost:${process.env.PORT ?? 4001}`;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  if (url.searchParams.get("v") !== "1") {
    const loaded = await loadReportV2ByShareToken(token, {}, supabase);
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "unknown_token" }, { status: 404 });
    }
    const key = pdfCacheKey(loaded.snapshotId, loaded.report, loaded.report.generatedAt);
    const cached = tbrPdfCache.get(key);
    if (cached) return pdfResponse(cached, "hit");

    const release = tbrPdfSemaphore.tryAcquire();
    if (!release) {
      return NextResponse.json(
        { ok: false, error: "render_busy", retryAfterSeconds: PDF_RETRY_AFTER_SECONDS },
        { status: 503, headers: { "Retry-After": String(PDF_RETRY_AFTER_SECONDS), "Cache-Control": "no-store" } },
      );
    }
    try {
      // Another request may have filled the cache while we waited for a slot.
      const raced = tbrPdfCache.get(key);
      if (raced) return pdfResponse(raced, "hit");
      const { buffer, pages, level } = await renderTbrPdf(loaded.report);
      const pdf: CachedPdf = { buffer, pages, level, source: loaded.path, filename: safeFilename(loaded.report.cover.startupName) };
      tbrPdfCache.set(key, pdf);
      return pdfResponse(pdf, "miss");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[tbr-pdf] render failed", msg);
      return NextResponse.json({ ok: false, error: "pdf_render_failed", detail: msg }, { status: 500 });
    } finally {
      release();
    }
  }

  // ── Legacy (?v=1): Chromium print of the public page ─────────────────────
  // Validate token exists (fail fast — avoids spinning up chromium for a 404).
  const { data, error } = await supabase
    .from("svi_snapshots")
    .select("id")
    .eq("report_share_token", token)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "unknown_token" }, { status: 404 });
  }

  // Import Playwright lazily so a missing binary doesn't crash the whole
  // /api/svi/report/* subtree at build time.
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    console.error("[wave25a:pdf] playwright import failed", err);
    return NextResponse.json(
      { ok: false, error: "playwright_unavailable" },
      { status: 503 },
    );
  }

  const targetUrl = `${baseUrl(request)}/tbr/${encodeURIComponent(token)}?pdf=1`;

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({
      // --no-sandbox is required in most containerised prod hosts (no user ns).
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
      // Force light colour scheme so the printed PDF isn't a wall of dark ink.
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
    // Wait an extra beat so any client-only animations settle before print.
    await page.waitForTimeout(500);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "20mm", left: "14mm", right: "14mm" },
      preferCSSPageSize: false,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="BlockID-Business-Report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wave25a:pdf] render failed", msg);
    if (msg.toLowerCase().includes("executable") || msg.toLowerCase().includes("browser")) {
      return NextResponse.json(
        { ok: false, error: "chromium_not_installed", detail: msg },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "pdf_render_failed", detail: msg },
      { status: 500 },
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
