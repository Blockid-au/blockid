// GET /api/reports/quarterly?batch=<id> | ?cohort=<id> — sponsor / LP
// quarterly report (T0272, G12 sprint S5).
//
// The /workspace/accelerator/quarterly-report page has linked "Export to
// PDF" here (`?cohort=<cohort_members.cohort_id>`) since Wave 25 without a
// handler behind it; T0272 lands the route and adds `?batch=<evaluation_
// batches.id>` so a Program user gets a cohort-scoped report for a batch
// they scored. Both scopes render through renderQuarterlyReportHtml() —
// cover, cohort summary (n, median SVI, movers), per-startup one-liners,
// methodology footnote (approved doctoral sentence), evaluator disclaimer,
// legal entity line — as a print-ready HTML document (`Save as PDF`).
//
//   401 anonymous · 403 feature_locked (needs lp_report or lp_export —
//   Program / VC Enterprise / Cohort Enterprise) · 400 no scope ·
//   404 batch/cohort not the caller's · 200 text/html.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBatchForUser, loadCohortRows } from "@/lib/evaluations/batch";
import { canExportLpReport } from "@/lib/evaluations/batch-shared";
import {
  cohortRowsToReportStartups,
  quarterLabelFor,
  renderQuarterlyReportHtml,
  type QuarterlyReportData,
  type QuarterlyReportStartup,
} from "@/lib/evaluations/quarterly-report";

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

async function loadCohortMembers(ownerId: string, cohortId: string): Promise<{ name: string; startups: QuarterlyReportStartup[] } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("cohort_members")
    .select("id, cohort_id, startup_name, stage, latest_svi, is_active")
    .eq("owner_id", ownerId)
    .eq("cohort_id", cohortId);
  if (error || !data || data.length === 0) return null;
  const rows = data as Array<Record<string, unknown>>;
  const startups: QuarterlyReportStartup[] = rows
    .filter((r) => r.is_active !== false)
    .map((r) => {
      const svi = r.latest_svi == null ? null : Number(r.latest_svi);
      const stage = r.stage == null ? null : Number(r.stage);
      return {
        name: String(r.startup_name ?? "Untitled"),
        svi: svi != null && Number.isFinite(svi) ? svi : null,
        weighted: null,
        stage: stage != null && Number.isFinite(stage) ? stage : null,
        delta: null,
        topStrength: null,
        topGap: null,
        reportUrl: null,
        status: svi != null ? "done" : "queued",
      };
    });
  return { name: `Cohort ${cohortId.slice(0, 8)}`, startups };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });

  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canExportLpReport(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_report", "api");
    return NextResponse.json(
      {
        ok: false,
        error: "feature_locked",
        feature: "lp_report",
        message: "The sponsor / LP report export is included in Program (A$349/mo). Upgrade at /pricing?segment=evaluator.",
        upgrade_url: "/pricing?segment=evaluator",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batch")?.trim() || null;
  const cohortId = url.searchParams.get("cohort")?.trim() || null;
  if (!batchId && !cohortId) {
    return NextResponse.json({ ok: false, error: "missing_scope", message: "Pass ?batch=<id> (evaluation batch) or ?cohort=<id> (accelerator cohort)." }, { status: 400 });
  }

  const now = new Date();
  let data: QuarterlyReportData;
  if (batchId) {
    const batch = await getBatchForUser(user.id, batchId);
    if (!batch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const rows = await loadCohortRows(batch);
    data = {
      cohortName: batch.name,
      programName: user.displayName ?? null,
      quarterLabel: quarterLabelFor(now),
      generatedAt: now.toISOString(),
      source: "batch",
      weights: batch.rubricWeights,
      startups: cohortRowsToReportStartups(rows),
    };
  } else {
    const cohort = await loadCohortMembers(user.id, cohortId as string);
    if (!cohort) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    data = {
      cohortName: cohort.name,
      programName: user.displayName ?? null,
      quarterLabel: quarterLabelFor(now),
      generatedAt: now.toISOString(),
      source: "cohort",
      weights: null,
      startups: cohort.startups,
    };
  }

  const html = renderQuarterlyReportHtml(data, siteBase(request), request.headers.get("x-nonce"));
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
