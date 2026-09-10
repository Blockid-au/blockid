/**
 * POST /api/funding/report/[id]/save-to-dataroom — render the Money Finder
 * report PDF and file it in the owner's data room (T0244, plan §4e).
 *
 * Owner only (no token / session access — the data room belongs to an
 * account). The report must carry a `project_id` (the startup whose data
 * room receives the file); a guest-bought report that was never attached to
 * a project gets 409 with a message telling the founder how to attach one.
 *
 *   200 { ok:true, dataroomFileId, storagePath, downloadUrl, template_slug }
 *   401 unauthorized · 403 forbidden (not the owner) · 404 not_found
 *   409 { ok:false, error:"no_project" | "not_ready", message }
 *   500 pdf_render_failed / dataroom_row_* · 502 storage_upload_failed · 503 service_unavailable
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById } from "@/lib/projects";
import { getFundingReport, publicFundingReport } from "@/lib/funding/reports";
import { latestVerifiedAt } from "@/lib/funding/directory";
import { fundingReportFilename, renderFundingReportPdf } from "@/lib/pdf/funding-report-pdf";
import { saveDeliverable } from "@/lib/dataroom/save-deliverable";

export const dynamic = "force-dynamic";

const FUNDING_REPORT_TEMPLATE_SLUG = "funding_money_finder_report";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const row = await getFundingReport(id);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!row.user_id || row.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!row.project_id) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_project",
        message:
          "This report is not attached to a startup yet. Pick a startup in your workspace and re-run the finder there — the new report will save straight into that data room.",
      },
      { status: 409 },
    );
  }
  const project = await getProjectById(row.project_id);
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ ok: false, error: "project_not_found_or_forbidden" }, { status: 403 });
  }

  const report = publicFundingReport(row, { userId: user.id });
  if (report.status !== "ready") {
    return NextResponse.json(
      { ok: false, error: "not_ready", message: "The report is still being generated — try again in a minute." },
      { status: 409 },
    );
  }

  let pdf: Buffer;
  try {
    const verifiedAt = latestVerifiedAt([...report.grants.map((g) => g.grant), ...report.programs.map((p) => p.program)]);
    pdf = await renderFundingReportPdf({ report, startupName: project.name, verifiedAt });
  } catch (err) {
    console.error("[funding/report/save-to-dataroom] render failed", { id, err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "pdf_render_failed" }, { status: 500 });
  }

  const saved = await saveDeliverable({
    userId: user.id,
    email: user.email ?? "",
    projectId: project.id,
    filename: fundingReportFilename(report.id),
    buffer: pdf,
    mime: "application/pdf",
    template_slug: FUNDING_REPORT_TEMPLATE_SLUG,
    template_version: "v1",
    svi_dimension: "funding",
    folder: "funding",
  });
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status });
  }

  return NextResponse.json({
    ok: true,
    dataroomFileId: saved.dataroomFileId,
    storagePath: saved.storagePath,
    downloadUrl: saved.downloadUrl,
    template_slug: FUNDING_REPORT_TEMPLATE_SLUG,
  });
}
