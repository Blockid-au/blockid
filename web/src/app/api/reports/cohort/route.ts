// GET /api/reports/cohort?batch=<id>&format=html|pdf|csv — the BlockID
// Cohort Report for a program's sponsors (G21 P2-C, 2026-09-20).
//
// One batch (`evaluation_batches`) → lib/evaluations/program-journey-data
// `loadCohortBundle()` (rows × confidence × verification × evidence ×
// snapshots × overrides through the P2-A / P2-B adapters) →
// `buildCohortReport()` → HTML (print-ready, "Save as PDF"), PDF
// (lib/pdf/cohort-report-pdf.tsx) or CSV (one row per startup).
//
//   401 anonymous · 403 feature_locked (needs lp_report / lp_export or a
//   Programs plan with accelerator.cohort) · 400 missing / bad ?batch or
//   ?format · 404 the caller has no role on the batch (owner via
//   evaluation_batches.user_id; reviewer / viewer via P2-B's members table
//   when present) · 200 text/html | application/pdf | text/csv.
//
// The older sponsor / LP summary stays at GET /api/reports/quarterly.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { canBatchScore, canExportLpReport } from "@/lib/evaluations/batch-shared";
import { cohortReportCsv, cohortReportFilename, renderCohortReportHtml } from "@/lib/evaluations/cohort-report";
import { cohortReportFromBundle, loadCohortBundle } from "@/lib/evaluations/program-journey-data";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const COHORT_REPORT_FORMATS = ["html", "pdf", "csv"] as const;
export type CohortReportFormat = (typeof COHORT_REPORT_FORMATS)[number];

function siteBase(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

export function parseFormat(v: string | null): CohortReportFormat | null {
  const f = (v ?? "html").trim().toLowerCase();
  return (COHORT_REPORT_FORMATS as readonly string[]).includes(f) ? (f as CohortReportFormat) : null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("cohort-report", user.id, request, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canExportLpReport(flags) && !canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_report", "api", "api/reports/cohort");
    return NextResponse.json(
      {
        ok: false,
        error: "feature_locked",
        feature: "lp_report",
        message: "The Cohort Report is included in Program and every Programs plan. Upgrade at /pricing?segment=evaluator.",
        upgrade_url: "/pricing?segment=evaluator",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batch")?.trim() || null;
  if (!batchId || !/^[0-9a-f-]{36}$/i.test(batchId)) {
    return NextResponse.json({ ok: false, error: "missing_scope", message: "Pass ?batch=<evaluation batch id>." }, { status: 400 });
  }
  const format = parseFormat(url.searchParams.get("format"));
  if (!format) return NextResponse.json({ ok: false, error: "bad_format", message: "format must be html, pdf or csv" }, { status: 400 });

  const bundle = await loadCohortBundle(user.id, batchId);
  if (!bundle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const data = cohortReportFromBundle(bundle, user);
  const base = siteBase(request);
  const common = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };

  if (format === "csv") {
    return new NextResponse(cohortReportCsv(data, base), {
      status: 200,
      headers: { ...common, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${cohortReportFilename(data.cover.cohortName, "csv")}"` },
    });
  }
  if (format === "pdf") {
    const { renderCohortReportPdf } = await import("@/lib/pdf/cohort-report-pdf");
    const { buffer } = await renderCohortReportPdf(data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { ...common, "content-type": "application/pdf", "content-disposition": `attachment; filename="${cohortReportFilename(data.cover.cohortName, "pdf")}"`, "content-length": String(buffer.length) },
    });
  }
  return new NextResponse(renderCohortReportHtml(data, base, request.headers.get("x-nonce")), {
    status: 200,
    headers: { ...common, "content-type": "text/html; charset=utf-8" },
  });
}
