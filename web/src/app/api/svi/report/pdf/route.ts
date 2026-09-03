// GET /api/svi/report/pdf?token=<shareToken>
//
// Wave 25A — server-side PDF export of the Trusted Business Report.
// Launches an in-process Chromium via Playwright, navigates to the public
// /tbr/<token> page with `?pdf=1` (which hides interactive chrome), and
// returns application/pdf.
//
// MVP scope: only supports `?token=` (public share link). Founder self-
// download without a public token is not exposed yet — mint a share token
// first, or open the print dialog.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Chromium cold-start + full-render can hit 60s.

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

  // Validate token exists (fail fast — avoids spinning up chromium for a 404).
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
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
