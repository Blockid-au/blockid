// GET|POST /api/cron/evaluation-batch-runner
//
// T0272 (G12 sprint S5) — scores Program batches off-peak. Crontab:
// `*/20 12-20 * * * bash $RUN evaluation-batch-runner --timeout 300`
// (12:00–20:59 UTC = 22:00–06:59 AEST, the quiet window the CEO
// implementing loop reserves for heavy work).
//
// Per tick:
//   1. claimNextBatch() — oldest queued|running batch with a live item →
//      running (conditional flip, review #6; all-terminal batches are closed
//      and skipped, review #7).
//   1b. sweepExpiredLeases(batch) — items `running` > 15 min are requeued
//      (attempts < 2) or failed with error='lease_expired' (review #7), so a
//      deploy mid-item can no longer wedge the queue.
//   2. nextQueuedItems(batch, 5) — BATCH_ITEMS_PER_TICK, lowest id first,
//      each claimed with `… where status='queued'` so an overlapping tick
//      never scores the same item twice (review #6).
//   3. Each item: getReportQuota(owner) — at 0 remaining the item is failed
//      with error='quota_exhausted' and NOTHING runs (review #8: direct runs
//      after queuing, or a downgrade, must not yield reports beyond the
//      plan) → runTrustReportForProject({ projectId, requestedByUserId:
//      batch.user_id, tier: "standard" }) — the same seam
//      POST /api/evaluations/[id]/report uses (T0271) — → copy the snapshot's
//      dimension_scores onto the item → mark done → recordEvaluationReport(
//      paid_via='quota') so the run counts against reports_per_month and
//      shows as "Last report" on the list page. A throw marks the item failed
//      (error text kept) and the loop CONTINUES with the next item; nothing is
//      charged for a failed item.
//   4. finaliseBatch() — recount; when no item is queued/running the batch
//      closes (done, or failed when every item failed) and ONE
//      `weekly_next_step` notification is written: "Batch '{name}' scored:
//      {done}/{total}" with href to the cohort page.
//
// Rubric weights: the pipeline has no weight input (computeSVI /
// orchestrateReport score every startup identically — see batch-shared.ts),
// so `rubric_weights` are NOT passed here; they re-aggregate the stored
// dimension scores for the displayed cohort score only.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. `?dry=1` claims nothing,
// runs nothing, and reports which batch / items the next live tick would
// take. A 240 s budget stops the loop early so maxDuration is never hit
// mid-report. cron-runner.sh POSTs; GET is kept for manual checks.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAIConfigured } from "@/lib/ai-client";
import { insertNotification } from "@/lib/notifications";
import { getReportQuota, recordEvaluationReport } from "@/lib/evaluations/report-quota";
import { runTrustReportForProject } from "@/lib/report-pipeline/run-for-project";
import { enqueueWebhook } from "@/lib/webhooks/registry";
import {
  claimNextBatch,
  finaliseBatch,
  loadBatchOwner,
  loadSnapshotDimensionScores,
  markItem,
  nextQueuedItems,
  sweepExpiredLeases,
} from "@/lib/evaluations/batch";
import { BATCH_ITEMS_PER_TICK, flattenDimensionScores, type EvaluationBatch } from "@/lib/evaluations/batch-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

interface ItemSummary {
  item_id: number;
  evaluation_id: string;
  project_id: string | null;
  startup: string | null;
  outcome: "done" | "failed" | "would_run" | "skipped_budget";
  svi?: number;
  error?: string;
}

/** Item-level error when the owner's reports_per_month is used up (review #8). */
export const QUOTA_EXHAUSTED_ERROR = "quota_exhausted";

export function batchNotificationPayload(batch: EvaluationBatch): Record<string, unknown> {
  return {
    title: `Batch '${batch.name}' scored: ${batch.doneCount}/${batch.total}`,
    batch_id: batch.id,
    done: batch.doneCount,
    failed: batch.failedCount,
    total: batch.total,
    href: `/workspace/evaluations/cohort/${batch.id}`,
  };
}

export async function GET(request: Request) {
  // S8-C (2026-09-11): constant-time compare of the bearer secret.
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();

  const batch = await claimNextBatch(dryRun);
  if (!batch) {
    return NextResponse.json({ ok: true, dryRun, batch: null, items: [], reason: "idle" });
  }

  // Lease sweep BEFORE claiming (review #7): items a killed tick left
  // `running` go back to the queue (or fail after 2 attempts) so
  // finaliseBatch can close the batch.
  const swept = dryRun ? { requeued: [], failed: [] } : await sweepExpiredLeases(batch.id);

  if (!dryRun && !isAIConfigured()) {
    // Checked BEFORE claiming so no item burns a lease attempt; the batch
    // stays running and the next tick retries once a provider is back.
    return NextResponse.json({ ok: false, error: "ai_unavailable", batch: { id: batch.id, status: batch.status }, items: [] }, { status: 503 });
  }

  const items = await nextQueuedItems(batch.id, BATCH_ITEMS_PER_TICK, dryRun);
  const summaries: ItemSummary[] = [];

  if (dryRun) {
    for (const it of items) {
      summaries.push({ item_id: it.id, evaluation_id: it.evaluationId, project_id: it.projectId, startup: it.projectName, outcome: "would_run" });
    }
    return NextResponse.json({ ok: true, dryRun, batch: { id: batch.id, name: batch.name, status: batch.status, total: batch.total }, items: summaries });
  }

  let done = 0;
  let failed = 0;
  let budgetExceeded = false;
  const owner = items.length > 0 ? ((await loadBatchOwner(batch.userId)) ?? { id: batch.userId, plan: null }) : null;

  for (const it of items) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      // Claimed but not run — release the lease so the next tick takes it
      // (the attempt counter keeps the +1; the sweep only reads `running` rows).
      await markItem(it.id, { status: "queued" });
      summaries.push({ item_id: it.id, evaluation_id: it.evaluationId, project_id: it.projectId, startup: it.projectName, outcome: "skipped_budget" });
      continue;
    }
    const base = { item_id: it.id, evaluation_id: it.evaluationId, project_id: it.projectId, startup: it.projectName };
    if (!it.projectId) {
      failed++;
      await markItem(it.id, { status: "failed", error: "evaluation_missing" });
      summaries.push({ ...base, outcome: "failed", error: "evaluation_missing" });
      continue;
    }
    // Quota re-check per item (review #8): the queue reserved a slot when the
    // batch was created, but direct runs / a downgrade since then may have
    // used it. Never run — and never silently charge credits — at 0.
    const quota = await getReportQuota(owner ?? { id: batch.userId, plan: null });
    if (!quota.unlimited && quota.remaining <= 0) {
      failed++;
      await markItem(it.id, { status: "failed", error: QUOTA_EXHAUSTED_ERROR });
      summaries.push({ ...base, outcome: "failed", error: QUOTA_EXHAUSTED_ERROR });
      continue;
    }
    try {
      const run = await runTrustReportForProject({
        projectId: it.projectId,
        requestedByUserId: batch.userId,
        tier: "standard",
        creditsCost: 0,
      });
      const rawScores = await loadSnapshotDimensionScores(run.snapshotId);
      await markItem(it.id, {
        status: "done",
        reportId: run.reportId,
        snapshotId: run.snapshotId,
        shareToken: run.shareToken,
        sviTotal: run.svi,
        dimensionScores: flattenDimensionScores(rawScores),
        error: null,
      });
      const reportRow = await recordEvaluationReport({
        evaluationId: it.evaluationId,
        projectId: it.projectId,
        userId: batch.userId,
        kind: "full",
        paidVia: "quota",
        creditsCost: 0,
        reportRef: run.reportId,
        shareToken: run.shareToken,
        sviTotal: run.svi,
      });
      // S20-B — `evaluation.report_ready` to the batch owner's endpoints
      // (enqueue only; never the startup owner's).
      await enqueueWebhook(
        "evaluation.report_ready",
        it.projectId,
        {
          evaluation_id: it.evaluationId,
          project_id: it.projectId,
          report_id: reportRow?.id ?? null,
          kind: "full",
          svi_total: run.svi,
          via: "quota",
        },
        { userIds: [batch.userId], projectEndpoints: false },
      );
      done++;
      summaries.push({ ...base, outcome: "done", svi: run.svi });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[evaluation-batch-runner] item failed", it.id, message);
      await markItem(it.id, { status: "failed", error: message });
      summaries.push({ ...base, outcome: "failed", error: message });
    }
  }

  const { batch: refreshed, closed } = await finaliseBatch(batch.id);
  if (closed && refreshed) {
    await insertNotification({
      userId: refreshed.userId,
      kind: "weekly_next_step",
      payload: batchNotificationPayload(refreshed),
      dedupeKey: `batch:${refreshed.id}`,
      throttleMs: 24 * 60 * 60 * 1000,
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    batch: refreshed
      ? { id: refreshed.id, name: refreshed.name, status: refreshed.status, total: refreshed.total, done: refreshed.doneCount, failed: refreshed.failedCount }
      : { id: batch.id, name: batch.name, status: batch.status, total: batch.total },
    processed: done + failed,
    done,
    failed,
    closed,
    budgetExceeded,
    leases: { requeued: swept.requeued, expired: swept.failed },
    items: summaries,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
