// POST /api/evaluations/[id]/report — Trust BizReport for a startup the
// caller evaluates (T0271, G12 sprint S3).
//
//   Body    { kind: "full" | "rescore", confirm?: boolean }
//   Preview (confirm !== true) → 200
//           { ok:true, preview:true, cost:{ via:"quota"|"credits"|"none", credits,
//             list_credits, balance, remaining_quota, quota:{limit,used,remaining} } }
//   Run     (confirm === true) → 200
//           { ok:true, report_url, pdf_url, via, credits_spent, remaining_quota,
//             svi, report_ref, kind }
//
//   401 anonymous · 400 bad kind / JSON · 403 not the evaluator of this row or
//   no evaluator access to the project · 402 neither quota nor credits ·
//   503 AI/DB unavailable · 500 pipeline failed (nothing charged).
//
// Ordering (transparent-pricing rule): the cost is shown first; the pipeline
// runs; ONLY THEN the evaluation_reports row is written (which is the quota
// decrement) or credits are spent. A thrown pipeline → no row, no spend.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isAIConfigured } from "@/lib/ai-client";
import { spendCredits } from "@/lib/credits";
import { canAccessProjectAsEvaluator, getEvaluationForUser } from "@/lib/evaluations";
import {
  REPORT_KIND_FEATURE,
  pdfUrlForToken,
  previewReportCharge,
  recordEvaluationReport,
  reportUrlForToken,
  type EvaluationReportKind,
} from "@/lib/evaluations/report-quota";
import { runRescoreForProject, runTrustReportForProject } from "@/lib/report-pipeline/run-for-project";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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

export async function POST(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;

  let body: { kind?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; confirm?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.kind !== "full" && body.kind !== "rescore") {
    return NextResponse.json({ ok: false, error: "invalid_kind", message: 'kind must be "full" or "rescore"' }, { status: 400 });
  }
  const kind: EvaluationReportKind = body.kind;
  const confirmed = body.confirm === true;

  // Ownership: the row must be the caller's, and the caller must still hold
  // evaluator access on the project (G12-8 — report routes are otherwise
  // owner-scoped by cookie/email).
  const evaluation = await getEvaluationForUser(user.id, id);
  if (!evaluation) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const access = await canAccessProjectAsEvaluator(user.id, evaluation.projectId);
  if (!access.allowed) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  // Cost preview — always computed, always returned.
  const cost = await previewReportCharge(user, kind);
  const costPayload = {
    via: cost.via,
    credits: cost.credits,
    list_credits: cost.list_credits,
    balance: cost.balance,
    remaining_quota: cost.remaining_quota,
    quota: { limit: cost.quota.limit, used: cost.quota.used, remaining: cost.quota.remaining, unlimited: cost.quota.unlimited },
  };
  if (!confirmed) {
    return NextResponse.json({ ok: true, preview: true, kind, cost: costPayload });
  }
  if (cost.via === "none") {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_credits",
        message: `This ${kind === "full" ? "Trust BizReport" : "re-score"} costs ${cost.list_credits} credit${cost.list_credits === 1 ? "" : "s"}; your balance is ${cost.balance} and your plan has no included reports left this month.`,
        cost: costPayload,
      },
      { status: 402 },
    );
  }

  if (kind === "full" && !isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "ai_unavailable" }, { status: 503 });
  }
  const limited = enforceRateLimit("evaluation-report", user.email, request, 12, 60 * 60 * 1000);
  if (limited) return limited;

  // Run — nothing is charged until this returns.
  let reportRef: string;
  let shareToken: string | null;
  let svi: number;
  try {
    if (kind === "full") {
      const run = await runTrustReportForProject({
        projectId: evaluation.projectId,
        requestedByUserId: user.id,
        tier: "standard",
        creditsCost: cost.credits,
      });
      reportRef = run.reportId;
      shareToken = run.shareToken;
      svi = run.svi;
    } else {
      const run = await runRescoreForProject({ projectId: evaluation.projectId, requestedByUserId: user.id });
      reportRef = run.snapshotId;
      shareToken = run.shareToken;
      svi = run.svi;
    }
  } catch (err) {
    console.error("[blockid:evaluations:report] pipeline failed", err);
    return NextResponse.json(
      {
        ok: false,
        error: "report_failed",
        message: "Report generation failed. Nothing was charged — please try again.",
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }

  // Charge AFTER success: the evaluation_reports row is the quota decrement;
  // credits are spent only when the quota did not cover the run.
  const paidVia = cost.via;
  const row = await recordEvaluationReport({
    evaluationId: evaluation.id,
    projectId: evaluation.projectId,
    userId: user.id,
    kind,
    paidVia,
    creditsCost: paidVia === "credits" ? cost.credits : 0,
    reportRef,
    shareToken,
    sviTotal: svi,
  });
  if (!row) {
    console.error("[blockid:evaluations:report] evaluation_reports row missing — run not billed", { evaluationId: evaluation.id, reportRef });
  }

  let creditsSpent = 0;
  let balance = cost.balance;
  if (paidVia === "credits") {
    const spend = await spendCredits(user.id, REPORT_KIND_FEATURE[kind], {
      evaluation_id: evaluation.id,
      project_id: evaluation.projectId,
      report_ref: reportRef,
      kind,
    });
    if (spend.ok) {
      creditsSpent = cost.credits;
      balance = spend.balance;
    } else {
      console.error("[blockid:evaluations:report] spendCredits failed after success", { evaluationId: evaluation.id, reportRef });
    }
  }

  const base = siteBase(request);
  return NextResponse.json({
    ok: true,
    kind,
    via: paidVia,
    credits_spent: creditsSpent,
    balance,
    remaining_quota: cost.remaining_quota,
    svi,
    report_ref: reportRef,
    share_token: shareToken,
    report_url: reportUrlForToken(shareToken, base),
    pdf_url: pdfUrlForToken(shareToken, base),
    report_id: row?.id ?? null,
  });
}
