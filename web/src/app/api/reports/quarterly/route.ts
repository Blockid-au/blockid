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
//   404 batch/cohort not the caller's · 404 cohort_report_unavailable (the
//   accelerator tables cannot serve it — use ?batch=) · 200 text/html.
//
// ?cohort= reads the LIVE 0021 schema (review #14): accelerator_cohorts
// owned by manager_email = caller → cohort_members → svi_accounts
// (current_svi / current_stage). The earlier select of owner_id / stage /
// latest_svi / is_active on cohort_members matched no column and always 404'd.

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

export const COHORT_UNAVAILABLE = {
  ok: false,
  error: "cohort_report_unavailable",
  hint: "Use ?batch=<id> from Batch score",
} as const;

type CohortLoad =
  | { ok: true; name: string; startups: QuarterlyReportStartup[] }
  | { ok: false; reason: "not_found" | "unavailable" };

/**
 * Live schema (migration 0021, review #14): `accelerator_cohorts(id, name,
 * manager_email)` → `cohort_members(cohort_id, email, startup_name,
 * svi_account_id)` → `svi_accounts(current_svi, current_stage)`. Ownership
 * is the cohort's manager_email = the caller's email; there is no owner_id /
 * stage / latest_svi / is_active on cohort_members.
 */
async function loadCohortMembers(userEmail: string | null | undefined, cohortId: string): Promise<CohortLoad> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "unavailable" };
  const email = (userEmail ?? "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "not_found" };

  const { data: cohort, error: cohortErr } = await supabase
    .from("accelerator_cohorts")
    .select("id, name, manager_email")
    .eq("id", cohortId)
    .maybeSingle();
  if (cohortErr) return { ok: false, reason: "unavailable" };
  const c = (cohort ?? null) as Record<string, unknown> | null;
  if (!c || String(c.manager_email ?? "").trim().toLowerCase() !== email) return { ok: false, reason: "not_found" };

  const { data: members, error: memErr } = await supabase
    .from("cohort_members")
    .select("id, startup_name, email, svi_account_id")
    .eq("cohort_id", cohortId);
  if (memErr) return { ok: false, reason: "unavailable" };
  const rows = ((members ?? []) as Array<Record<string, unknown>>).filter((r) => r.id != null);
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  const accountIds = rows.map((r) => r.svi_account_id).filter((v): v is string => typeof v === "string" && v.length > 0);
  const accounts = new Map<string, { svi: number | null; stage: number | null }>();
  if (accountIds.length > 0) {
    const { data: accRows } = await supabase.from("svi_accounts").select("id, current_svi, current_stage").in("id", accountIds);
    for (const a of (accRows ?? []) as Array<Record<string, unknown>>) {
      const svi = a.current_svi == null ? null : Number(a.current_svi);
      const stage = a.current_stage == null ? null : Number(a.current_stage);
      accounts.set(String(a.id), {
        svi: svi != null && Number.isFinite(svi) ? svi : null,
        stage: stage != null && Number.isFinite(stage) ? stage : null,
      });
    }
  }

  const startups: QuarterlyReportStartup[] = rows.map((r) => {
    const acc = typeof r.svi_account_id === "string" ? accounts.get(r.svi_account_id) : undefined;
    const svi = acc?.svi ?? null;
    return {
      name: String(r.startup_name ?? r.email ?? "Untitled"),
      svi,
      weighted: null,
      stage: acc?.stage ?? null,
      delta: null,
      topStrength: null,
      topGap: null,
      reportUrl: null,
      status: svi != null ? "done" : "queued",
    };
  });
  return { ok: true, name: String(c.name ?? `Cohort ${cohortId.slice(0, 8)}`), startups };
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
    const cohort = await loadCohortMembers(user.email, cohortId as string);
    if (!cohort.ok) {
      return cohort.reason === "unavailable"
        ? NextResponse.json(COHORT_UNAVAILABLE, { status: 404 })
        : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
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
