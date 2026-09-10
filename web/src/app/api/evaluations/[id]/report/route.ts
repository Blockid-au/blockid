// POST /api/evaluations/[id]/report — Trust BizReport for a startup the
// caller evaluates (T0271, G12 sprint S3).
//
//   Body    { kind: "full" | "rescore", confirm?: boolean, idempotency_key?: uuid }
//   Preview (confirm !== true) → 200
//           { ok:true, preview:true, cost:{ via:"quota"|"credits"|"none", credits,
//             list_credits, balance, remaining_quota, quota:{limit,used,remaining} } }
//   Run     (confirm === true) → 200
//           { ok:true, report_url, pdf_url, via, credits_spent, remaining_quota,
//             svi, report_ref, kind, reused:false }
//   Reused  → 200 same shape with reused:true, credits_spent:0 — a row for
//           (evaluation, kind) already exists for this idempotency_key or was
//           created in the last 10 min (review #9: a client whose fetch timed
//           out must never trigger — and pay for — a second run).
//
//   401 anonymous · 400 bad kind / JSON · 403 not the evaluator of this row or
//   no evaluator access to the project · 402 neither quota nor credits, or
//   the credit spend failed (balance moved since the preview) ·
//   503 AI/DB unavailable · 500 pipeline failed (credits refunded).
//
// GET /api/evaluations/[id]/report?kind=full|rescore[&idempotency_key=…][&since=iso]
//   → { ok:true, report: null | { …same run shape…, created_at } } — the
//   dialog polls this after a timeout instead of re-POSTing.
//
// Ordering (transparent-pricing rule + review #1): the cost is shown first.
// For via=credits the credits are spent BEFORE the pipeline runs — a failed
// spend is a 402 and nothing runs; a pipeline throw after a successful spend
// grants the same amount back (reason `refund:<feature>`) and returns 500.
// For via=quota the evaluation_reports row written AFTER success is the
// decrement. A share token / report_url is never returned unless the run
// was paid for.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isAIConfigured } from "@/lib/ai-client";
import { grantCredits, spendCredits } from "@/lib/credits";
import { canAccessProjectAsEvaluator, getEvaluationForUser } from "@/lib/evaluations";
import {
  REPORT_KIND_FEATURE,
  findRecentEvaluationReport,
  normaliseIdempotencyKey,
  pdfUrlForToken,
  previewReportCharge,
  recordEvaluationReport,
  reportUrlForToken,
  type EvaluationReportKind,
  type EvaluationReportRow,
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

/** The run-result shape for an existing row (reused / polled). */
function reusedPayload(row: EvaluationReportRow, base: string, extra: { balance: number; remaining_quota: number }) {
  return {
    ok: true as const,
    reused: true as const,
    kind: row.kind,
    via: row.paidVia,
    credits_spent: 0,
    balance: extra.balance,
    remaining_quota: extra.remaining_quota,
    svi: row.sviTotal ?? 0,
    report_ref: row.reportRef,
    share_token: row.shareToken,
    report_url: reportUrlForToken(row.shareToken, base),
    pdf_url: pdfUrlForToken(row.shareToken, base),
    report_id: row.id,
    created_at: row.createdAt,
  };
}

function parseKind(raw: unknown): EvaluationReportKind | null {
  return raw === "full" || raw === "rescore" ? raw : null;
}

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });

  const evaluation = await getEvaluationForUser(user.id, id);
  if (!evaluation) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const idempotencyKey = normaliseIdempotencyKey(url.searchParams.get("idempotency_key"));
  const sinceRaw = url.searchParams.get("since");
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const row = await findRecentEvaluationReport({
    evaluationId: evaluation.id,
    kind,
    idempotencyKey,
    ...(Number.isFinite(sinceMs) ? { windowMs: Math.max(0, Date.now() - sinceMs) } : {}),
  });
  if (!row) return NextResponse.json({ ok: true, report: null });
  const cost = await previewReportCharge(user, kind);
  return NextResponse.json({
    ok: true,
    report: reusedPayload(row, siteBase(request), { balance: cost.balance, remaining_quota: cost.quota.remaining }),
  });
}

export async function POST(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;

  let body: { kind?: unknown; confirm?: unknown; idempotency_key?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const kind = parseKind(body.kind);
  if (!kind) {
    return NextResponse.json({ ok: false, error: "invalid_kind", message: 'kind must be "full" or "rescore"' }, { status: 400 });
  }
  const confirmed = body.confirm === true;
  const idempotencyKey = normaliseIdempotencyKey(body.idempotency_key);

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

  // Idempotency (review #9): a row for this key, or one created in the last
  // 10 min for the same (evaluation, kind), is returned instead of re-run.
  const base = siteBase(request);
  const existing = await findRecentEvaluationReport({ evaluationId: evaluation.id, kind, idempotencyKey });
  if (existing) {
    return NextResponse.json({
      ...reusedPayload(existing, base, { balance: cost.balance, remaining_quota: cost.quota.remaining }),
      cost: costPayload,
    });
  }

  if (cost.via === "none") {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_credits",
        credits_needed: cost.list_credits,
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

  // Credits are spent BEFORE the run (review #1). The atomic guard inside
  // spendCredits is the only thing standing between two concurrent confirms
  // and one balance — a failed spend means no run and no share token.
  const paidVia = cost.via;
  const feature = REPORT_KIND_FEATURE[kind];
  const spendMeta = { evaluation_id: evaluation.id, project_id: evaluation.projectId, kind, idempotency_key: idempotencyKey };
  let creditsSpent = 0;
  let balance = cost.balance;
  if (paidVia === "credits") {
    const spend = await spendCredits(user.id, feature, spendMeta);
    if (!spend.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_credits",
          credits_needed: cost.credits,
          message: `Could not reserve ${cost.credits} credit${cost.credits === 1 ? "" : "s"} for this run — your balance may have changed. Nothing was charged.`,
          cost: { ...costPayload, via: "none", balance: spend.balance },
        },
        { status: 402 },
      );
    }
    creditsSpent = cost.credits;
    balance = spend.balance;
  }

  // Run — a throw after a credit spend refunds it.
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
    let refunded = false;
    if (creditsSpent > 0) {
      const refund = await grantCredits(user.id, creditsSpent, `refund:${feature}`, { ...spendMeta, reason: "pipeline_failed" });
      refunded = refund.ok;
      if (refund.ok) balance = refund.balance;
      else console.error("[blockid:evaluations:report] refund failed after pipeline error", { userId: user.id, creditsSpent, evaluationId: evaluation.id });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "report_failed",
        message:
          creditsSpent > 0
            ? refunded
              ? `Report generation failed. Your ${creditsSpent} credit${creditsSpent === 1 ? "" : "s"} have been refunded — please try again.`
              : "Report generation failed. A credit refund is pending — contact support if your balance does not update."
            : "Report generation failed. Nothing was charged — please try again.",
        refunded: creditsSpent > 0 ? refunded : undefined,
        credits_refunded: creditsSpent > 0 && refunded ? creditsSpent : 0,
        balance,
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }

  // The evaluation_reports row: for via=quota it IS the quota decrement; for
  // via=credits it is the billing record (credits already spent above).
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
    idempotencyKey,
  });
  if (!row) {
    console.error("[blockid:evaluations:report] evaluation_reports row missing — run not billed", { evaluationId: evaluation.id, reportRef });
  }

  return NextResponse.json({
    ok: true,
    reused: false,
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
