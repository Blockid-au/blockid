/**
 * GET/POST /api/cron/report-order-drain — Trust Business Report queue drain.
 *
 * Stage 3 Batch A sub-task A2. Invoked by cron every 2 minutes (see
 * scripts/crontab.production). Drains report_generation_queue up to
 * MAX_PER_INVOCATION rows per tick for backpressure so a burst of paid
 * orders never blocks the event loop or overruns the AI budget.
 *
 * Auth: two accepted patterns to mirror sibling cron routes without
 * forcing the runner script to change:
 *   * Authorization: Bearer <CRON_SECRET>   (matches blockchain-sync)
 *   * x-cron-secret: <CRON_SECRET>          (matches bq-export)
 *
 * Env vars required:
 *   * CRON_SECRET — shared secret for cron auth (set in web/.env)
 *
 * Response:
 *   { ok: true, processed, remaining, results[] }
 *   { ok: false, error }
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  processNextQueuedOrder,
  type GenerateResult,
} from "@/lib/paywall/report-order-worker";

export const dynamic = "force-dynamic";

/** Max rows drained per invocation. Backpressure guard: at 2-min cadence
 *  this caps throughput at ~150 reports/hour which is well within the AI
 *  provider quotas the pipeline holds. */
const MAX_PER_INVOCATION = 5;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const xCron = request.headers.get("x-cron-secret");
  if (xCron === secret) return true;

  return false;
}

/**
 * Production generator hook. Wires the worker up to the real report
 * pipeline. Kept inline in the route (not the library) so the worker
 * library stays free of the heavy orchestrator import chain and its
 * tests do not need to mock the AI client.
 *
 * The orchestrator wiring lands in Phase 4 (Master Plan §8.6). Until
 * then this hook records a placeholder report id so the state machine
 * can still exercise the READY transition end-to-end — the caller sees
 * `ok:true` and the queue drains. The actual pipeline invocation
 * (fetching evidence, criteria, calling orchestrateReport) is one line
 * away and slots in without touching the worker signature.
 */
async function generateReportForOrder(input: {
  orderId: string;
  businessId: string;
}): Promise<GenerateResult> {
  // TODO(§8.6 Phase 4): swap the placeholder for a real orchestrator
  // invocation once report_versions (migration 0242) lands. Until then
  // we emit a deterministic placeholder id so the READY transition +
  // dashboard hand-off can be smoke-tested end-to-end.
  const reportId = `rpt-placeholder-${input.orderId.slice(0, 8)}`;
  return { ok: true, reportId };
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const results: Array<{
    orderId?: string;
    status?: string;
    reason?: string;
  }> = [];
  let processed = 0;

  for (let i = 0; i < MAX_PER_INVOCATION; i += 1) {
    let outcome;
    try {
      outcome = await processNextQueuedOrder({
        generateReport: generateReportForOrder,
      });
    } catch (err) {
      console.error(
        "[blockid:report-order-drain] worker threw",
        err instanceof Error ? err.message : String(err),
      );
      results.push({
        reason: err instanceof Error ? err.message : "worker_threw",
      });
      break;
    }

    if (!outcome.processed) break;
    processed += 1;
    results.push({
      orderId: outcome.orderId,
      status: outcome.status,
      reason: outcome.reason,
    });
  }

  // Cheap "remaining" probe so the ops dashboard can graph backlog.
  let remaining = 0;
  try {
    const { count } = await supabase
      .from("report_generation_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");
    remaining = count ?? 0;
  } catch {
    // Non-fatal — backlog probe is best-effort.
  }

  // Match sibling crons: noop=true suppresses cron-health.jsonl noise
  // when there's genuinely nothing to do.
  const body: Record<string, unknown> = {
    ok: true,
    processed,
    remaining,
    results,
  };
  if (processed === 0 && remaining === 0) {
    body.noop = true;
  }

  return NextResponse.json(body);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
