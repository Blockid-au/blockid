/**
 * GET /api/funding/report/[id]/pdf — the Money Finder report as an A4 PDF
 * (T0244, plan §4e). Same access rules as the JSON route: signed-in owner,
 * `?t=<access_token>`, or the Stripe `?s=<session>`; anything else is 404.
 * A report that is not `ready` yet returns 409 so the client can keep
 * polling the JSON route instead of downloading an empty file.
 *
 *   200 application/pdf · Content-Disposition: attachment
 *   404 { ok:false, error:"not_found" }
 *   409 { ok:false, error:"not_ready", status }
 *   500 { ok:false, error:"pdf_render_failed" }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/projects";
import { canViewFundingReport, getFundingReport, publicFundingReport } from "@/lib/funding/reports";
import { latestVerifiedAt } from "@/lib/funding/directory";
import { fundingReportFilename, renderFundingReportPdf } from "@/lib/pdf/funding-report-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const viewer = {
    userId: (await getCurrentUser())?.id ?? null,
    token: url.searchParams.get("t"),
    sessionId: url.searchParams.get("s"),
  };

  const row = await getFundingReport(id);
  if (!row || !canViewFundingReport(row, viewer)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const report = publicFundingReport(row, viewer);
  if (report.status !== "ready") {
    return NextResponse.json({ ok: false, error: "not_ready", status: report.status }, { status: 409 });
  }

  let startupName: string | null = null;
  if (report.is_owner && report.project_id) {
    startupName = (await getProjectById(report.project_id).catch(() => null))?.name ?? null;
  }
  const verifiedAt = latestVerifiedAt([...report.grants.map((g) => g.grant), ...report.programs.map((p) => p.program)]);

  try {
    const pdf = await renderFundingReportPdf({ report, startupName, verifiedAt });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fundingReportFilename(report.id)}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[funding/report/pdf] render failed", { id, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "pdf_render_failed" }, { status: 500 });
  }
}
