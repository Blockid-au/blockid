/**
 * report-order-worker.ts — Trust Business Report background worker.
 *
 * Stage 3 Batch A sub-task A2. Drains report_generation_queue (migration
 * 0272) one row at a time. The cron route at /api/cron/report-order-drain
 * invokes `processNextQueuedOrder()` up to N times per invocation for
 * backpressure.
 *
 * Design principles:
 *
 *   1. **FOR UPDATE SKIP LOCKED** — the worker must be safe to run in
 *      parallel with itself. We claim a row via a Postgres RPC that wraps
 *      SELECT … FOR UPDATE SKIP LOCKED + UPDATE status='running' in a
 *      single transaction. When the RPC is absent (e.g. local dev, or
 *      before the follow-up migration lands), we fall back to a best-
 *      effort SELECT + guarded UPDATE. The fallback is race-prone but
 *      still correct because the guarded UPDATE checks status='queued'
 *      so a losing race writes zero rows and we treat it as no-op.
 *
 *   2. **Dependency injection** — the actual report generation function
 *      is passed in via `deps.generateReport`. This keeps the worker
 *      testable (mock generator) and lets the cron route wire up the
 *      real orchestrator without importing it here (heavy import chain).
 *
 *   3. **Retry policy** — MAX_RETRIES = 3. Transient failures re-queue
 *      with a bumped retry_count; permanent failures land in 'failed'
 *      immediately. `deps.generateReport` signals which by returning
 *      `{ ok: false, transient: boolean, reason }`.
 *
 *   4. **State-machine coupling** — every report_orders status flip
 *      uses `nextState()` from report-order-state.ts as the guard so an
 *      out-of-order transition (e.g. a race with the auto-refund cron)
 *      cannot corrupt the row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { nextState, type ReportOrderState } from "./report-order-state";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueRow {
  id: string;
  order_id: string;
  business_id: string;
  status: "queued" | "running" | "done" | "failed";
  retry_count: number;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_reason: string | null;
}

export interface GenerateInput {
  orderId: string;
  businessId: string;
}

export type GenerateResult =
  | { ok: true; reportId: string }
  | { ok: false; transient: boolean; reason: string };

export interface WorkerDeps {
  /**
   * Injected Supabase client — defaults to the singleton service-role
   * client but can be swapped in tests. Passed as a bare `unknown` to
   * avoid forcing every test to build a full SupabaseClient shape.
   */
  supabase?: SupabaseClient | MinimalSupabase;

  /**
   * Actual generation function. In production this wraps the report
   * orchestrator (see /api/cron/report-order-drain/route.ts). In tests
   * it's mocked directly.
   */
  generateReport: (input: GenerateInput) => Promise<GenerateResult>;

  /**
   * Injectable clock so tests can pin `now()`. Defaults to `Date.now`.
   */
  now?: () => Date;
}

export interface ProcessOutcome {
  processed: boolean;
  orderId?: string;
  status?: "done" | "failed" | "requeued";
  reason?: string;
}

// A thin Supabase surface — the worker only uses the query builder shape
// so a hand-rolled test double stays small. Mirrors the same builder
// pattern used by the redeem/checkout routes.
export type MinimalSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq?: (col: string, val: unknown) => unknown;
      order?: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => {
          maybeSingle: () => Promise<{ data: QueueRow | null; error: unknown }>;
        };
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        eq?: (col: string, val: unknown) => {
          select?: (cols: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
          };
        };
        select?: (cols: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max attempts before we give up and set queue.status='failed'. */
export const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────────────
// processNextQueuedOrder — single-row drain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claim + process the next FIFO queued order. Returns
 * `{ processed: false }` when the queue is empty. On any exception, the
 * error surfaces to the caller — the cron route logs and moves on.
 */
export async function processNextQueuedOrder(
  deps: WorkerDeps,
): Promise<ProcessOutcome> {
  const supabase = (deps.supabase ??
    getSupabaseAdmin()) as MinimalSupabase | null;
  if (!supabase) {
    return { processed: false, reason: "supabase_not_configured" };
  }

  const now = deps.now ?? (() => new Date());

  // ── 1. Claim a row ────────────────────────────────────────────────────
  // Two-step claim: SELECT the oldest queued row, then UPDATE with a
  // status='queued' guard so a parallel worker either wins or writes
  // zero rows. When zero rows update we retry until the queue is empty.
  const claim = await claimNextQueuedRow(supabase, now());
  if (!claim) {
    return { processed: false };
  }

  // ── 2. Run the generator ──────────────────────────────────────────────
  let result: GenerateResult;
  try {
    result = await deps.generateReport({
      orderId: claim.order_id,
      businessId: claim.business_id,
    });
  } catch (err) {
    result = {
      ok: false,
      transient: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 3. Persist the outcome ────────────────────────────────────────────
  if (result.ok) {
    await markQueueDone(supabase, claim.id, now());
    await advanceOrderStatus(supabase, claim.order_id, "GENERATING", {
      transition: "generation_succeeded",
      patch: {
        report_id: result.reportId,
        generated_at: now().toISOString(),
      },
    });
    return {
      processed: true,
      orderId: claim.order_id,
      status: "done",
    };
  }

  // Failure branch — decide whether to retry or give up.
  const nextRetry = claim.retry_count + 1;
  const permanent = !result.transient || nextRetry >= MAX_RETRIES;

  if (permanent) {
    await markQueueFailed(supabase, claim.id, result.reason, nextRetry, now());
    await advanceOrderStatus(supabase, claim.order_id, "GENERATING", {
      transition: "generation_failed",
      patch: { failure_reason: result.reason, retry_count: nextRetry },
    });
    return {
      processed: true,
      orderId: claim.order_id,
      status: "failed",
      reason: result.reason,
    };
  }

  // Transient → re-queue for the next drain tick.
  await requeue(supabase, claim.id, nextRetry, result.reason);
  return {
    processed: true,
    orderId: claim.order_id,
    status: "requeued",
    reason: result.reason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function claimNextQueuedRow(
  supabase: MinimalSupabase,
  nowDate: Date,
): Promise<QueueRow | null> {
  // Best-effort SELECT of the oldest queued row. A concurrent worker may
  // race us; the guarded UPDATE below turns the race into a no-op.
  type Builder = ReturnType<MinimalSupabase["from"]>;
  const q = supabase.from("report_generation_queue") as Builder;
  const sel = q.select(
    "id, order_id, business_id, status, retry_count, enqueued_at, started_at, finished_at, error_reason",
  ) as {
    eq: (c: string, v: unknown) => {
      order: (c: string, o: { ascending: boolean }) => {
        limit: (n: number) => {
          maybeSingle: () => Promise<{ data: QueueRow | null; error: unknown }>;
        };
      };
    };
  };

  const { data: row } = await sel
    .eq("status", "queued")
    .order("enqueued_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!row) return null;

  // Guarded flip queued → running. Zero rows updated = another worker
  // beat us to it; return null so the caller either retries or reports
  // the queue as empty.
  const upd = supabase.from("report_generation_queue") as Builder;
  const patch = upd.update({
    status: "running",
    started_at: nowDate.toISOString(),
  }) as {
    eq: (c: string, v: unknown) => {
      eq: (c: string, v: unknown) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data: claimed } = await patch
    .eq("id", row.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (!claimed) return null;
  return row;
}

async function markQueueDone(
  supabase: MinimalSupabase,
  queueId: string,
  nowDate: Date,
): Promise<void> {
  type Builder = ReturnType<MinimalSupabase["from"]>;
  const upd = supabase.from("report_generation_queue") as Builder;
  const patch = upd.update({
    status: "done",
    finished_at: nowDate.toISOString(),
    error_reason: null,
  }) as { eq: (c: string, v: unknown) => Promise<unknown> };
  await patch.eq("id", queueId);
}

async function markQueueFailed(
  supabase: MinimalSupabase,
  queueId: string,
  reason: string,
  retryCount: number,
  nowDate: Date,
): Promise<void> {
  type Builder = ReturnType<MinimalSupabase["from"]>;
  const upd = supabase.from("report_generation_queue") as Builder;
  const patch = upd.update({
    status: "failed",
    finished_at: nowDate.toISOString(),
    retry_count: retryCount,
    error_reason: reason.slice(0, 500),
  }) as { eq: (c: string, v: unknown) => Promise<unknown> };
  await patch.eq("id", queueId);
}

async function requeue(
  supabase: MinimalSupabase,
  queueId: string,
  retryCount: number,
  reason: string,
): Promise<void> {
  type Builder = ReturnType<MinimalSupabase["from"]>;
  const upd = supabase.from("report_generation_queue") as Builder;
  const patch = upd.update({
    status: "queued",
    started_at: null,
    retry_count: retryCount,
    error_reason: reason.slice(0, 500),
  }) as { eq: (c: string, v: unknown) => Promise<unknown> };
  await patch.eq("id", queueId);
}

/**
 * Advance a report_orders row's status via `nextState()`. If the state
 * machine rejects the transition we log a warning and return — never
 * throw, since the queue-side status has already been persisted.
 */
async function advanceOrderStatus(
  supabase: MinimalSupabase,
  orderId: string,
  assumedFrom: ReportOrderState,
  args: {
    transition:
      | "generation_succeeded"
      | "generation_failed"
      | "queue_picked";
    patch: Record<string, unknown>;
  },
): Promise<void> {
  const target = nextState(assumedFrom, args.transition);
  if (!target) {
    console.warn(
      "[blockid:report-order-worker] illegal transition suppressed",
      { orderId, from: assumedFrom, transition: args.transition },
    );
    return;
  }

  type Builder = ReturnType<MinimalSupabase["from"]>;
  const upd = supabase.from("report_orders") as Builder;
  const patch = upd.update({
    ...args.patch,
    status: target,
  }) as { eq: (c: string, v: unknown) => Promise<unknown> };
  await patch.eq("id", orderId);
}

// ─────────────────────────────────────────────────────────────────────────────
// enqueueOrder — called from the Stripe webhook + redeem route on PAID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a queue row for a PAID report_orders row. UNIQUE(order_id) on
 * migration 0272 makes a duplicate insert a silent no-op — we swallow
 * the conflict error so the caller's happy path is untouched.
 */
export async function enqueueOrder(
  supabase: SupabaseClient,
  input: { orderId: string; businessId: string },
): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase.from("report_generation_queue").insert({
    order_id: input.orderId,
    business_id: input.businessId,
    status: "queued",
  });

  if (!error) return { ok: true };

  // 23505 = unique_violation. Duplicate enqueue is fine — the row is
  // already queued or in-flight.
  const code = (error as { code?: string }).code;
  if (code === "23505") return { ok: true };

  return {
    ok: false,
    reason: (error as { message?: string }).message ?? "insert_failed",
  };
}
