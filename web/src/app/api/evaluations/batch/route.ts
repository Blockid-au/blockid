// GET|POST /api/evaluations/batch — Program batch scoring queue (T0272, G12
// sprint S5; docs/plans/evaluator-traction-2026-09-10.md §3c-7).
//
//   POST { evaluation_ids: string[], name?: string, rubric_weights?: {ftv..svm} }
//        → 201 { ok:true, batch_id, queued, quota_left, batch }
//   GET  → 200 { ok:true, batches:[…] }   (the Cohorts list, newest first)
//
//   401 anonymous · 403 feature_locked (Scout / Firm — no lp_export /
//   accelerator.cohort; body carries the upgrade hint) · 400 bad body / ids
//   not yours · 402 trial_limit (subscription still `trialing`: the batch
//   may only use the 1 included trial report — G12 §3b, S7-C) ·
//   402 quota_insufficient (all-or-nothing: the whole batch must fit the
//   remaining reports_per_month minus items already queued) · 503 DB.
//
// Nothing runs here. The cron /api/cron/evaluation-batch-runner scores the
// items off-peak, 5 per tick, and records one evaluation_reports
// (paid_via='quota') row per success — that row is the quota decrement, so a
// failed item consumes nothing (transparent-pricing rule).

import { NextResponse } from "next/server";
import { PRIVATE_JSON_HEADERS, readJsonBody, rejectCrossSite } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { getReportQuota } from "@/lib/evaluations/report-quota";
import { countPendingBatchItems, createBatch, listBatches, ownedEvaluationIds } from "@/lib/evaluations/batch";
import { BATCH_MAX_ITEMS, canBatchScore, normaliseWeights } from "@/lib/evaluations/batch-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 200 uuids + name + weights fit comfortably in 32 KB.
const BODY_MAX_BYTES = 32 * 1024;

const UPGRADE_HINT = "Batch scoring is included in Program (A$349/mo — 100 Trust BizReports, 200 tracked startups, 5 seats). Upgrade at /pricing?segment=evaluator.";

async function gate() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  }
  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_export", "api");
    return {
      user: null,
      response: NextResponse.json(
        { ok: false, error: "feature_locked", feature: "lp_export", message: UPGRADE_HINT, upgrade_url: "/pricing?segment=evaluator" },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;
  const batches = await listBatches(user.id);
  return NextResponse.json({ ok: true, batches }, { headers: PRIVATE_JSON_HEADERS });
}

export async function POST(request: Request) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  const { user, response } = await gate();
  if (!user) return response;

  const read = await readJsonBody<{ evaluation_ids?: unknown; name?: unknown; rubric_weights?: unknown } | null>(request, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body ?? {};
  if (typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rawIds = Array.isArray(body.evaluation_ids) ? body.evaluation_ids : null;
  const ids = Array.from(new Set((rawIds ?? []).filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())));
  if (!rawIds || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "evaluation_ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > BATCH_MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: `A batch holds up to ${BATCH_MAX_ITEMS} startups` }, { status: 400 });
  }
  const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : `Batch ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);
  const weights = normaliseWeights(body.rubric_weights);

  // Every id must be an evaluation the caller holds (as evaluator).
  const owned = await ownedEvaluationIds(user.id, ids);
  const foreign = ids.filter((id) => !owned.has(id));
  if (foreign.length > 0) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", message: `${foreign.length} of the selected startups are not in your evaluations`, unknown_ids: foreign },
      { status: 400 },
    );
  }

  // Quota — all-or-nothing, net of items already waiting in other batches.
  const [quota, pending] = await Promise.all([getReportQuota(user), countPendingBatchItems(user.id)]);
  // accelerator_* Contact-Sales plans pass canBatchScore but carry no
  // usage_limits.reports_per_month at all (review #14) — say so instead of
  // a "0 of 0 remain" quota error.
  if (quota.configured === false) {
    return NextResponse.json(
      {
        ok: false,
        error: "quota_not_configured",
        hint: "Contact sales",
        message: "Your plan has batch scoring but no included Trust BizReport allowance configured yet. Contact sales to enable it.",
        quota: { limit: quota.limit, used: quota.used, remaining: quota.remaining, unlimited: quota.unlimited, pending },
      },
      { status: 402 },
    );
  }
  const available = quota.unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, quota.remaining - pending);
  // Trial: the batch may only use the single included trial report; the
  // runner re-checks getReportQuota per item so nothing beyond it runs.
  if (quota.trial?.active && available < ids.length) {
    const allowance = quota.trial.allowance;
    return NextResponse.json(
      {
        ok: false,
        error: "trial_limit",
        message: `Your trial includes ${allowance} Trust BizReport${allowance === 1 ? "" : "s"}; this batch needs ${ids.length} and ${available} remain${available === 1 ? "s" : ""}${pending > 0 ? ` (${pending} already queued)` : ""}. Score ${available > 0 ? `${available} now` : "once your trial converts"} or upgrade — ${UPGRADE_HINT}`,
        needed: ids.length,
        available,
        trial: quota.trial,
        upgrade_url: "/pricing?segment=evaluator",
        quota: { limit: quota.limit, used: quota.used, remaining: quota.remaining, unlimited: quota.unlimited, pending },
      },
      { status: 402 },
    );
  }
  if (available < ids.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "quota_insufficient",
        message: `This batch needs ${ids.length} included Trust BizReports; ${available} of ${quota.limit} remain this month${pending > 0 ? ` (${pending} already queued)` : ""}. Score fewer startups now or wait for the monthly reset.`,
        needed: ids.length,
        available,
        quota: { limit: quota.limit, used: quota.used, remaining: quota.remaining, unlimited: quota.unlimited, pending },
      },
      { status: 402 },
    );
  }

  const result = await createBatch({ userId: user.id, name, rubricWeights: weights, evaluationIds: ids });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: result.error === "service_unavailable" ? 503 : 500 });
  }
  const quotaLeft = quota.unlimited ? Number.MAX_SAFE_INTEGER : available - ids.length;
  return NextResponse.json(
    { ok: true, batch_id: result.batch.id, queued: ids.length, quota_left: quotaLeft, batch: result.batch },
    { status: 201 },
  );
}
