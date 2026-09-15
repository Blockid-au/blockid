// GET /api/analyses/[id]/report.pdf — download the first-analysis PDF (S32-B).
//
// Two ways in, both narrow:
//   1. the analyses tenancy boundary (signed-in owner, or the anon cookie
//      the run was written against) — the "Download PDF" button;
//   2. a signed `?token=` minted for the email (HMAC over id + expiry,
//      lib/analyses/first-analysis/download-token.ts) — works from a mail
//      client with no cookie, for this one analysis, until it expires.
// Anything else is 404, never 403.
//
// The PDF is rendered on demand from `full_report_json` (no blob storage);
// the variant follows the owner's plan, like the emailed copy.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readAnonKey } from "@/lib/analyses/anon-key";
import { getAnalysisForViewer } from "@/lib/analyses/store";
import { loadFullReportRow } from "@/lib/analyses/first-analysis/store";
import { resolveReportVariant } from "@/lib/analyses/first-analysis/job";
import { verifyDownloadToken } from "@/lib/analyses/first-analysis/download-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

function safeFilename(company: string): string {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `blockid-first-analysis${slug ? `-${slug}` : ""}.pdf`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return notFound();

  let token: string | null = null;
  try {
    token = new URL(request.url).searchParams.get("token");
  } catch {
    token = null;
  }

  let authorised = token ? verifyDownloadToken(id, token) === "ok" : false;
  if (!authorised) {
    let userId: string | null = null;
    try {
      userId = (await getCurrentUser())?.id ?? null;
    } catch {
      userId = null;
    }
    const anonKey = await readAnonKey();
    authorised = Boolean(await getAnalysisForViewer(id, { userId, anonKey }));
  }
  if (!authorised) return notFound();

  const row = await loadFullReportRow(id);
  if (!row || row.full_report_status !== "done" || !row.full_report_json) {
    return NextResponse.json(
      { ok: false, error: "Report not ready", status: row?.full_report_status ?? null },
      { status: 409 },
    );
  }

  const variant = await resolveReportVariant(row);
  const { renderFirstAnalysisReportPdf } = await import("@/lib/pdf/first-analysis-report-pdf");
  const { buffer } = await renderFirstAnalysisReportPdf({ report: row.full_report_json, variant });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeFilename(row.full_report_json.company)}"`,
      "cache-control": "private, no-store",
      "content-length": String(buffer.byteLength),
    },
  });
}
