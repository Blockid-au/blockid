// GET /api/guide/reports/[filename]
//
// Public download endpoint for the /guide/reports template gallery. Serves a
// redacted markdown copy of the requested BlockID.au dogfooding artefact so
// visitors can preview "what a Phase-N report actually looks like" before
// running the agents themselves. Per plan §284 the wire body is filtered
// through report-redaction.ts (emails / phone numbers / API tokens masked)
// and prefixed with a public-copy banner.
//
// No auth by design — this surface is the marketing counterpart of the
// reseller-facing signed-URL flow (which stays scoped + auditable). The
// filename is gated by isDownloadableReportFilename() so path traversal +
// non-markdown extensions + the `_daily-report-template.md` scaffold can't
// escape the content root.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  buildDownloadFilename,
  isDownloadableReportFilename,
  redactReportMarkdown,
} from "@/lib/showcase/report-redaction";
import { emitEvent } from "@/lib/analytics/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// process.cwd() is either the repo root (blockid.au) or the web workspace
// (blockid.au/web) depending on which server tsconfig started Next.js.
// Mirror the dual-candidate lookup used by /guide/reports/page.tsx.
async function readReport(basename: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports", basename),
    path.join(process.cwd(), "content", "reports", basename),
  ];
  for (const abs of candidates) {
    try {
      return await fs.readFile(abs, "utf8");
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!isDownloadableReportFilename(filename)) {
    return NextResponse.json({ ok: false, reason: "invalid_filename" }, { status: 400 });
  }

  const raw = await readReport(filename);
  if (raw === null) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const body = redactReportMarkdown(raw);
  const attachment = buildDownloadFilename(filename);

  // Fire-and-forget server-side GA event so direct URL / bot / no-JS
  // downloads are also counted — the client CTA (report-download-cta.tsx)
  // only fires when JavaScript is available. `source: "server"` lets GA4
  // audiences distinguish the two paths, and consent_granted defaults to
  // false since this is an unauthenticated marketing surface (server sink
  // still records to Supabase analytics_events; GA4 MP sink skips it).
  void emitEvent({
    name: "showcase_report_downloaded",
    params: { template: filename },
    source: "server",
  }).catch(() => undefined);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${attachment}"`,
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
