// GET /api/reports/demo-day-pack?batch=<id> — the demo-day pack PDF (G21
// P2-C, 2026-09-20): a cover page + one compact page per SELECTED startup
// (shortlisted or a submitted "proceed") with its Assessment Card, top
// strengths / gaps and the BlockID Dossier + live-profile links.
//
//   401 anonymous · 403 feature_locked (Program / Programs plans) · 400 bad
//   ?batch · 404 no role on the batch · 200 application/pdf (an empty
//   selection still renders the cover with the "shortlist first" line).

import { exportCohortName } from "@/lib/evaluations/demo-cohort-shared";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { canBatchScore, canExportLpReport } from "@/lib/evaluations/batch-shared";
import { cohortReportFilename } from "@/lib/evaluations/cohort-report";
import { isSelected } from "@/lib/evaluations/program-journey";
import { demoDayPackFromStartups, loadCohortBundle } from "@/lib/evaluations/program-journey-data";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("demo-day-pack", user.id, request, 10, 60 * 60 * 1000);
  if (limited) return limited;

  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canExportLpReport(flags) && !canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_report", "api", "api/reports/demo-day-pack");
    return NextResponse.json({ ok: false, error: "feature_locked", feature: "lp_report", message: "The demo-day pack is included in Program and every Programs plan.", upgrade_url: "/pricing?segment=evaluator" }, { status: 403 });
  }

  const batchId = new URL(request.url).searchParams.get("batch")?.trim() || null;
  if (!batchId || !/^[0-9a-f-]{36}$/i.test(batchId)) {
    return NextResponse.json({ ok: false, error: "missing_scope", message: "Pass ?batch=<evaluation batch id>." }, { status: 400 });
  }
  const bundle = await loadCohortBundle(user.id, batchId);
  if (!bundle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const entries = demoDayPackFromStartups(bundle.startups.filter(isSelected));
  const { renderDemoDayPackPdf } = await import("@/lib/pdf/demo-day-pack-pdf");
  // G24-C: the demo cohort's pack says so on its cover.
  const { buffer } = await renderDemoDayPackPdf({ cohortName: exportCohortName(bundle.batch), programName: bundle.batch.programName ?? user.displayName ?? null, generatedAt: new Date().toISOString(), entries, base: siteBase(request) });
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${cohortReportFilename(bundle.batch.name, "pdf").replace("cohort-report", "demo-day-pack")}"`,
      "content-length": String(buffer.length),
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
