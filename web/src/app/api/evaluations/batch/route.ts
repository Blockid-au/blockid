// GET|POST /api/evaluations/batch — Program batch scoring queue (T0272, G12
// sprint S5; docs/plans/evaluator-traction-2026-09-10.md §3c-7).
//
//   POST { evaluation_ids: string[], name?: string, rubric_weights?: {ftv..svm},
//          allow_empty?: true, program_name?: string, template_id?: uuid, intake_id?: uuid }
//        → 201 { ok:true, batch_id, queued, quota_left, batch }
//        G21 P2-A: `allow_empty: true` creates an empty BlockID Cohort (status
//        done, nothing to score) that the CSV import / intake link fills;
//        program_name / template_id / intake_id are the 0422 cohort columns;
//        applicants_cap + pilot_order_id are stamped from the caller's live
//        paid Cohort Validation Pilot (pilot_orders) when there is one.
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
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { getReportQuota } from "@/lib/evaluations/report-quota";
import { countItemsForPilotOrder, countPendingBatchItems, createBatch, listBatches, ownedEvaluationIds } from "@/lib/evaluations/batch";
import { getTemplate } from "@/lib/intake/templates";
import { supabaseIntakeStore } from "@/lib/intake/program-intakes";
import { BATCH_MAX_ITEMS, canBatchScore, normaliseWeights } from "@/lib/evaluations/batch-shared";
import { isUuid } from "@/lib/security/request-guards";
import { findActivePilotOrder } from "@/lib/pilots/paid-orders";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 200 uuids + name + weights fit comfortably in 32 KB.
const BODY_MAX_BYTES = 32 * 1024;

const UPGRADE_HINT = "Batch scoring is included in Program (A$349/mo — 100 Trusted Business Reports, 200 tracked startups, 5 seats). Upgrade at /pricing?segment=evaluator.";

async function gate() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  }
  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_export", "api", "api/evaluations/batch");
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

async function POST_handler(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;

  const read = await readJsonBody<{ evaluation_ids?: unknown; name?: unknown; rubric_weights?: unknown; allow_empty?: unknown; program_name?: unknown; template_id?: unknown; intake_id?: unknown } | null>(request, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body ?? {};
  if (typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rawIds = Array.isArray(body.evaluation_ids) ? body.evaluation_ids : null;
  const ids = Array.from(new Set((rawIds ?? []).filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())));
  const allowEmpty = body.allow_empty === true;
  if (!allowEmpty && (!rawIds || ids.length === 0)) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "evaluation_ids must be a non-empty array" }, { status: 400 });
  }
  // G21 P2-A — cohort metadata (0422).
  const programName = typeof body.program_name === "string" && body.program_name.trim() ? body.program_name.trim().slice(0, 160) : null;
  if (body.template_id != null && body.template_id !== "" && !isUuid(body.template_id)) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "template_id must be a template id" }, { status: 400 });
  }
  if (body.intake_id != null && body.intake_id !== "" && !isUuid(body.intake_id)) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: "intake_id must be an intake id" }, { status: 400 });
  }
  const templateId = isUuid(body.template_id) ? body.template_id : null;
  const intakeId = isUuid(body.intake_id) ? body.intake_id : null;
  if (ids.length > BATCH_MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: "invalid_input", message: `A batch holds up to ${BATCH_MAX_ITEMS} startups` }, { status: 400 });
  }
  const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : `Batch ${new Date().toISOString().slice(0, 10)}`).slice(0, 120);
  const weights = normaliseWeights(body.rubric_weights);

  // Every id must be an evaluation the caller holds (as evaluator).
  const owned = ids.length > 0 ? await ownedEvaluationIds(user.id, ids) : new Set<string>();
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
        message: "Your plan has batch scoring but no included Trusted Business Report allowance configured yet. Contact sales to enable it.",
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
        message: `Your trial includes ${allowance} Trusted Business Report${allowance === 1 ? "" : "s"}; this batch needs ${ids.length} and ${available} remain${available === 1 ? "s" : ""}${pending > 0 ? ` (${pending} already queued)` : ""}. Score ${available > 0 ? `${available} now` : "once your trial converts"} or upgrade — ${UPGRADE_HINT}`,
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
        message: `This batch needs ${ids.length} included Trusted Business Reports; ${available} of ${quota.limit} remain this month${pending > 0 ? ` (${pending} already queued)` : ""}. Score fewer startups now or wait for the monthly reset.`,
        needed: ids.length,
        available,
        quota: { limit: quota.limit, used: quota.used, remaining: quota.remaining, unlimited: quota.unlimited, pending },
      },
      { status: 402 },
    );
  }

  // Review P2: a template / intake link must belong to the caller (a leaked
  // UUID must not attach another program's questions + consent text).
  if (templateId) {
    const tpl = await getTemplate(user.id, templateId).catch(() => null);
    if (!tpl) return NextResponse.json({ ok: false, error: "not_found", message: "Template not found" }, { status: 404 });
  }
  if (intakeId) {
    const store = await supabaseIntakeStore().catch(() => null);
    const intake = store ? await store.getIntakeForOwner(user.id, intakeId).catch(() => null) : null;
    if (!intake) return NextResponse.json({ ok: false, error: "not_found", message: "Intake link not found" }, { status: 404 });
  }

  // A live paid pilot caps the cohort (applicants_cap) and is recorded on it.
  // Review P2: the cap counts every cohort under the same pilot order, and
  // applies to selection-created batches too, not only the CSV import.
  const pilot = await findActivePilotOrder(user.id).catch(() => null);
  if (pilot?.applicants_cap != null && pilot.applicants_cap > 0) {
    const usedAcross = await countItemsForPilotOrder(pilot.id).catch(() => 0);
    if (usedAcross + ids.length > pilot.applicants_cap) {
      return NextResponse.json(
        { ok: false, error: "cap_reached", message: `Your Cohort Validation Pilot covers up to ${pilot.applicants_cap} applicants; ${usedAcross} are already in your cohorts and this batch adds ${ids.length}.`, cap: { used: usedAcross, max: pilot.applicants_cap, remaining: Math.max(0, pilot.applicants_cap - usedAcross) }, needed: ids.length },
        { status: 409 },
      );
    }
  }
  const result = await createBatch({
    userId: user.id,
    name,
    rubricWeights: weights,
    evaluationIds: ids,
    programName,
    templateId,
    intakeId,
    applicantsCap: pilot?.applicants_cap ?? null,
    pilotOrderId: pilot?.id ?? null,
    plan: user.plan ?? null,
    email: user.email,
    channel: "workspace",
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: result.error === "service_unavailable" ? 503 : 500 });
  }
  const quotaLeft = quota.unlimited ? Number.MAX_SAFE_INTEGER : available - ids.length;
  return NextResponse.json(
    { ok: true, batch_id: result.batch.id, queued: ids.length, quota_left: quotaLeft, batch: result.batch },
    { status: 201 },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/evaluations/batch/route.ts", method: "POST" }, POST_handler);
