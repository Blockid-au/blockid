import { randomUUID } from "node:crypto";
import { trackOriginWork } from "@/lib/ops/origin-activity";
/**
 * report-order-worker.ts — Trust Business Report background worker.
 *
 * Stage 3 Batch A sub-task A2. Drains report_generation_queue (migration
 * 0272) one row at a time. The cron route at /api/cron/report-order-drain
 * invokes `reclaimExpiredOrders()` then `processNextQueuedOrder()` up to N
 * times per invocation for backpressure.
 *
 * Design principles:
 *
 *   1. **Conditional-update claim** — the worker must be safe to run in
 *      parallel with itself. A claim is a SELECT of the oldest queued row
 *      followed by an UPDATE guarded on `status='queued'` (and, with the
 *      lease columns, on the `attempts` value just read) so a parallel
 *      worker either wins or writes zero rows.
 *
 *   2. **Lease + heartbeat + reclaim (O08, pending-authority/0472)** — a
 *      claim stamps a fresh `claim_token`, bumps `attempts` and sets
 *      `heartbeat_at`. While the generator runs, an unref'd interval
 *      refreshes `heartbeat_at` (guarded on the token). A worker that dies
 *      mid-run (deploy retiring an origin, restart, OOM) stops heart-
 *      beating; `reclaimExpiredOrders()` (drain cron) then re-queues the
 *      row, or — once the attempts are spent — fails it through the same
 *      permanent-fail + refund path the worker uses.
 *
 *   3. **Fencing** — every queue write a claimed worker makes is guarded on
 *      `status='running' AND claim_token=<its token>`. A reclaimed
 *      worker's late write matches zero rows and the worker stops there:
 *      it never flips report_orders to READY/FAILED and never refunds, so a
 *      reclaimed order cannot be delivered or refunded twice. report_orders
 *      is only written after the fenced queue write lands.
 *
 *   4. **Graceful degradation** — until 0472 is applied the lease columns
 *      do not exist. The first query that trips over them logs once per
 *      process and the worker falls back to exactly the pre-O08 behaviour
 *      (status-guarded claim, unguarded terminal writes, no reclaim). It
 *      re-probes every LEASE_REPROBE_MS so an applied migration is picked
 *      up without a restart.
 *
 *   5. **Dependency injection** — the actual report generation function
 *      is passed in via `deps.generateReport`. This keeps the worker
 *      testable (mock generator) and lets the cron route wire up the
 *      real orchestrator without importing it here (heavy import chain).
 *
 *   6. **Retry policy** — MAX_RETRIES = 3. Transient failures re-queue
 *      with a bumped retry_count; permanent failures land in 'failed'
 *      immediately. A lost worker counts as a transient failure of that
 *      attempt. `deps.generateReport` signals which by returning
 *      `{ ok: false, transient: boolean, reason }`.
 *
 *   7. **State-machine coupling** — every report_orders status flip
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
  /** Lease columns (0472). Absent until the migration is applied. */
  claim_token?: string | null;
  attempts?: number | null;
  heartbeat_at?: string | null;
}

export interface GenerateInput {
  orderId: string;
  businessId: string;
}

export type GenerateResult =
  | { ok: true; reportId: string }
  | { ok: false; transient: boolean; reason: string };

export type RefundHook = (input: {
  orderId: string;
  reason: string;
}) => Promise<void>;

export interface WorkerDeps {
  /**
   * Injected Supabase client — defaults to the singleton service-role
   * client but can be swapped in tests.
   */
  supabase?: SupabaseClient | MinimalSupabase;

  /**
   * Actual generation function. In production this wraps the report
   * orchestrator (see /api/cron/report-order-drain/route.ts). In tests
   * it's mocked directly.
   */
  generateReport: (input: GenerateInput) => Promise<GenerateResult>;

  /**
   * Compensating action invoked once — and only once — an order has
   * failed permanently (retries exhausted, or a permanent error). Per
   * Master Upgrade Plan §8.8 the money must be returned: the cron route
   * wires this to `refundFailedOrder()` (report-refund.ts), which issues
   * the Stripe refund or reverses the credit debit and moves the order
   * FAILED → REFUNDED.
   *
   * Optional and never throws out of the worker — a refund failure
   * leaves the order in FAILED for an operator/next tick to retry, and
   * never rolls back the queue-side bookkeeping that already landed.
   * Omitting it (as the unit tests do) keeps the pre-refund behaviour.
   */
  refundOrder?: RefundHook;

  /**
   * Injectable clock so tests can pin `now()`. Defaults to `Date.now`.
   */
  now?: () => Date;

  /** Heartbeat cadence while a claimed order runs. Default HEARTBEAT_EVERY_MS. */
  heartbeatEveryMs?: number;

  /** Claim-token minter (tests). Defaults to `randomUUID`. */
  newClaimToken?: () => string;
}

export interface ProcessOutcome {
  processed: boolean;
  orderId?: string;
  /**
   * `stale` = this worker's lease was reclaimed while it ran; its result
   * was discarded (no report_orders write, no refund).
   */
  status?: "done" | "failed" | "requeued" | "stale";
  reason?: string;
  /**
   * Set only on the permanent-failure path when a `refundOrder` hook was
   * supplied: `true` when the reversal completed, `false` when it threw.
   * Absent otherwise, so pre-refund callers see an unchanged shape.
   */
  refunded?: boolean;
}

type Row = Record<string, unknown>;
type Res<T> = { data: T; error: unknown };

/**
 * The slice of the PostgREST builder the worker uses. Every call returns
 * the same chainable, awaitable builder, so a hand-rolled test double
 * stays small and the real client is cast onto it.
 */
export interface QueueQuery extends PromiseLike<Res<unknown>> {
  eq(col: string, val: unknown): QueueQuery;
  is(col: string, val: null): QueueQuery;
  lt(col: string, val: string): QueueQuery;
  order(col: string, opts: { ascending: boolean }): QueueQuery;
  limit(n: number): QueueQuery;
  select(cols: string): QueueQuery;
  maybeSingle(): PromiseLike<Res<Row | null>>;
}

export type MinimalSupabase = {
  from: (table: string) => {
    select: (cols: string) => QueueQuery;
    update: (patch: Row) => QueueQuery;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max attempts before we give up and set queue.status='failed'. */
export const MAX_RETRIES = 3;

/** How often a running worker refreshes `heartbeat_at`. */
export const HEARTBEAT_EVERY_MS = 30_000;

/** A running row with no heartbeat for this long has lost its lease. */
export const LEASE_EXPIRY_MS = 10 * 60_000;

/**
 * Never reclaim a row claimed less than this long ago. The paid pipeline's
 * budget is REPORT_ORDER_DEADLINE_MS (420 s) inside a 480 s route
 * maxDuration; 15 min is ~2× that, the same stuck window the free
 * first-analysis job uses (FULL_REPORT_STUCK_MS).
 */
export const RECLAIM_MIN_AGE_MS = 15 * 60_000;

/**
 * A row claimed longer ago than this is reclaimed even while it still
 * heartbeats — an alive-but-hung worker must not strand a paid order.
 * Its late writes are fenced off by the claim token.
 */
export const RECLAIM_HARD_CEILING_MS = 60 * 60_000;

/** Re-probe for the lease columns this often after finding them missing. */
export const LEASE_REPROBE_MS = 10 * 60_000;

const LEASE_MIGRATION = "0472_report_generation_queue_lease";

const BASE_COLS =
  "id, order_id, business_id, status, retry_count, enqueued_at, started_at, finished_at, error_reason";
const LEASE_COLS = `${BASE_COLS}, claim_token, attempts, heartbeat_at`;

/** Order states in which the queue row is still the order's live attempt. */
const IN_FLIGHT_ORDER_STATES: ReadonlySet<string> = new Set(["PAID", "GENERATING"]);
/** Order states that mean the report was already delivered. */
const DELIVERED_ORDER_STATES: ReadonlySet<string> = new Set(["READY", "SHARED", "EXPIRED"]);

// ─────────────────────────────────────────────────────────────────────────────
// Lease-column availability (0472 may not be applied yet)
// ─────────────────────────────────────────────────────────────────────────────

let leaseMissingSince: number | null = null;
let warnedLeaseMissing = false;

/** The lease columns are not there (0472 not applied / schema cache stale). */
export function isMissingLeaseColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  if (code === "42703" || code === "PGRST204") return true;
  const m = message ?? "";
  return (
    /claim_token|attempts|heartbeat_at/.test(m) &&
    /does not exist|schema cache|could not find/i.test(m)
  );
}

function leaseEnabled(nowMs: number): boolean {
  return leaseMissingSince === null || nowMs - leaseMissingSince >= LEASE_REPROBE_MS;
}

function markLeaseMissing(nowMs: number, op: string): void {
  leaseMissingSince = nowMs;
  if (warnedLeaseMissing) return;
  warnedLeaseMissing = true;
  console.warn(
    JSON.stringify({
      event: "report_order_queue.lease_migration_pending",
      op,
      migration: LEASE_MIGRATION,
      note: "paid-order lease/heartbeat/reclaim disabled until the migration is applied; legacy claim in use",
    }),
  );
}

function markLeasePresent(): void {
  leaseMissingSince = null;
}

/** Test hook: forget the cached lease-column probe and re-arm the warning. */
export function __resetLeaseModeForTests(): void {
  leaseMissingSince = null;
  warnedLeaseMissing = false;
}

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
  return trackOriginWork("report_order_worker", () => processNextQueuedOrderTracked(deps));
}

interface Claim {
  row: QueueRow;
  /** Null = legacy claim (lease columns absent): writes are unfenced. */
  token: string | null;
}

async function processNextQueuedOrderTracked(deps: WorkerDeps): Promise<ProcessOutcome> {
  const supabase = (deps.supabase ??
    getSupabaseAdmin()) as MinimalSupabase | null;
  if (!supabase) {
    return { processed: false, reason: "supabase_not_configured" };
  }

  const now = deps.now ?? (() => new Date());

  // ── 1. Claim a row ────────────────────────────────────────────────────
  const claim = await claimNextQueuedRow(supabase, now(), deps.newClaimToken ?? randomUUID);
  if (!claim) {
    return { processed: false };
  }
  const { row } = claim;

  // ── 2. Run the generator (heartbeating while it runs) ─────────────────
  const heartbeat = claim.token
    ? startHeartbeat(supabase, row, claim.token, now, deps.heartbeatEveryMs ?? HEARTBEAT_EVERY_MS)
    : null;
  let result: GenerateResult;
  try {
    result = await deps.generateReport({
      orderId: row.order_id,
      businessId: row.business_id,
    });
  } catch (err) {
    result = {
      ok: false,
      transient: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    heartbeat?.stop();
  }

  // ── 3. Persist the outcome (fenced on the claim token) ────────────────
  if (result.ok) {
    const owned = await writeQueue(supabase, claim, {
      status: "done",
      finished_at: now().toISOString(),
      error_reason: null,
    });
    if (!owned) return staleOutcome(row, "done");
    await advanceOrderStatus(supabase, row.order_id, "GENERATING", {
      transition: "generation_succeeded",
      patch: {
        report_id: result.reportId,
        generated_at: now().toISOString(),
      },
    });
    return {
      processed: true,
      orderId: row.order_id,
      status: "done",
    };
  }

  // Failure branch — decide whether to retry or give up.
  const nextRetry = row.retry_count + 1;
  const permanent = !result.transient || nextRetry >= MAX_RETRIES;

  if (permanent) {
    const owned = await writeQueue(supabase, claim, {
      status: "failed",
      finished_at: now().toISOString(),
      retry_count: nextRetry,
      error_reason: result.reason.slice(0, 500),
    });
    if (!owned) return staleOutcome(row, "failed");
    const refunded = await failOrderAndRefund(supabase, {
      orderId: row.order_id,
      reason: result.reason,
      retryCount: nextRetry,
      refundOrder: deps.refundOrder,
    });
    return {
      processed: true,
      orderId: row.order_id,
      status: "failed",
      reason: result.reason,
      refunded,
    };
  }

  // Transient → re-queue for the next drain tick.
  const owned = await writeQueue(supabase, claim, {
    status: "queued",
    started_at: null,
    retry_count: nextRetry,
    error_reason: result.reason.slice(0, 500),
    ...(claim.token ? { claim_token: null, heartbeat_at: null } : {}),
  });
  if (!owned) return staleOutcome(row, "requeued");
  return {
    processed: true,
    orderId: row.order_id,
    status: "requeued",
    reason: result.reason,
  };
}

function staleOutcome(row: QueueRow, wanted: string): ProcessOutcome {
  console.warn(
    "[blockid:report-order-worker] lease lost — late write rejected, result discarded",
    { orderId: row.order_id, queueId: row.id, wanted },
  );
  return {
    processed: true,
    orderId: row.order_id,
    status: "stale",
    reason: "lease_lost",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim
// ─────────────────────────────────────────────────────────────────────────────

/** Candidates tried per call when a parallel worker wins the first one. */
const CLAIM_CANDIDATES = 3;

async function claimNextQueuedRow(
  supabase: MinimalSupabase,
  nowDate: Date,
  newToken: () => string,
): Promise<Claim | null> {
  for (let i = 0; i < CLAIM_CANDIDATES; i += 1) {
    const leased = leaseEnabled(nowDate.getTime());
    const { data: row, error } = await supabase
      .from("report_generation_queue")
      .select(leased ? LEASE_COLS : BASE_COLS)
      .eq("status", "queued")
      .order("enqueued_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error && leased && isMissingLeaseColumn(error)) {
      markLeaseMissing(nowDate.getTime(), "claim_select");
      continue; // retry this candidate on the legacy path
    }
    if (!row) return null;
    const queueRow = row as unknown as QueueRow;

    const claim = leased
      ? await claimLeased(supabase, queueRow, nowDate, newToken())
      : await claimLegacy(supabase, queueRow, nowDate);
    if (claim === "missing_columns") {
      markLeaseMissing(nowDate.getTime(), "claim_update");
      continue;
    }
    if (claim) return claim;
    // Lost the race for this row — look at the next oldest.
  }
  return null;
}

async function claimLeased(
  supabase: MinimalSupabase,
  row: QueueRow,
  nowDate: Date,
  token: string,
): Promise<Claim | null | "missing_columns"> {
  const attempts = Number(row.attempts ?? 0);
  const iso = nowDate.toISOString();
  const { data, error } = await supabase
    .from("report_generation_queue")
    .update({
      status: "running",
      started_at: iso,
      heartbeat_at: iso,
      claim_token: token,
      attempts: attempts + 1,
      finished_at: null,
    })
    .eq("id", row.id)
    .eq("status", "queued")
    .eq("attempts", attempts)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingLeaseColumn(error)) return "missing_columns";
    console.error("[blockid:report-order-worker] claim update failed", {
      queueId: row.id,
      error: errMessage(error),
    });
    return null;
  }
  if (!data) return null;
  markLeasePresent();
  return {
    row: {
      ...row,
      status: "running",
      started_at: iso,
      heartbeat_at: iso,
      claim_token: token,
      attempts: attempts + 1,
    },
    token,
  };
}

/** Pre-O08 claim: status-guarded flip only. */
async function claimLegacy(
  supabase: MinimalSupabase,
  row: QueueRow,
  nowDate: Date,
): Promise<Claim | null> {
  const { data: claimed } = await supabase
    .from("report_generation_queue")
    .update({
      status: "running",
      started_at: nowDate.toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (!claimed) return null;
  return { row, token: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────────────────────────────────────

function startHeartbeat(
  supabase: MinimalSupabase,
  row: QueueRow,
  token: string,
  now: () => Date,
  everyMs: number,
): { stop: () => void } {
  let stopped = false;
  let inFlight = false;
  let warned = false;
  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("report_generation_queue")
          .update({ heartbeat_at: now().toISOString() })
          .eq("id", row.id)
          .eq("status", "running")
          .eq("claim_token", token)
          .select("id")
          .maybeSingle();
        if (error) {
          if (!warned) {
            warned = true;
            console.warn("[blockid:report-order-worker] heartbeat write failed", {
              orderId: row.order_id,
              error: errMessage(error),
            });
          }
          return;
        }
        if (!data && !stopped) {
          // Reclaimed under us. Keep running (the generator cannot be
          // aborted) but stop heartbeating; the final write is fenced.
          stopped = true;
          clearInterval(timer);
          console.warn("[blockid:report-order-worker] lease lost during run", {
            orderId: row.order_id,
            queueId: row.id,
          });
        }
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn("[blockid:report-order-worker] heartbeat threw", {
            orderId: row.order_id,
            error: errMessage(err),
          });
        }
      } finally {
        inFlight = false;
      }
    })();
  }, everyMs);
  (timer as { unref?: () => void }).unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the claimed row. With a lease token the write is fenced on
 * `status='running' AND claim_token=<token>` and returns false when it
 * matched zero rows (the lease was reclaimed). A DB error keeps the
 * pre-O08 behaviour (log, carry on): the reclaim sweep reads the order's
 * status first, so a delivered order is never regenerated.
 *
 * Legacy (no token): exactly the old unguarded `eq("id")` write.
 */
async function writeQueue(
  supabase: MinimalSupabase,
  claim: Claim,
  patch: Row,
): Promise<boolean> {
  const q = supabase.from("report_generation_queue").update(patch).eq("id", claim.row.id);
  if (!claim.token) {
    await q;
    return true;
  }
  const { data, error } = await q
    .eq("status", "running")
    .eq("claim_token", claim.token)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[blockid:report-order-worker] fenced queue write failed", {
      queueId: claim.row.id,
      status: patch.status,
      error: errMessage(error),
    });
    return true;
  }
  return Boolean(data);
}

/**
 * FAILED flip + §8.8 refund. Shared by the worker's permanent-failure
 * branch and the reclaim sweep's attempt cap. Runs only after the caller
 * won the fenced queue write, so each order is failed/refunded once.
 */
async function failOrderAndRefund(
  supabase: MinimalSupabase,
  args: {
    orderId: string;
    reason: string;
    retryCount: number;
    refundOrder?: RefundHook;
  },
): Promise<boolean | undefined> {
  await advanceOrderStatus(supabase, args.orderId, "GENERATING", {
    transition: "generation_failed",
    patch: { failure_reason: args.reason, retry_count: args.retryCount },
  });

  // §8.8 — the customer paid and got nothing, so give the money back.
  // Runs AFTER the FAILED flip so `refundFailedOrder()` sees a legal
  // FAILED → REFUNDED transition.
  if (!args.refundOrder) return undefined;
  try {
    await args.refundOrder({ orderId: args.orderId, reason: args.reason });
    return true;
  } catch (err) {
    console.error(
      "[blockid:report-order-worker] refund hook threw — order left FAILED",
      { orderId: args.orderId, error: errMessage(err) },
    );
    return false;
  }
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

  await supabase
    .from("report_orders")
    .update({
      ...args.patch,
      status: target,
    })
    .eq("id", orderId);
}

// ─────────────────────────────────────────────────────────────────────────────
// reclaimExpiredOrders — lease sweep (drain cron, before draining)
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaseTimings {
  leaseMs?: number;
  minAgeMs?: number;
  hardCeilingMs?: number;
}

/**
 * Pure: has this running row's worker lost its lease? Requires the claim
 * to be older than the pipeline's budget AND no heartbeat for `leaseMs`
 * (a legacy-claimed row has no heartbeat, so age alone decides), or the
 * claim to be older than the hard ceiling.
 */
export function isLeaseExpired(
  row: Pick<QueueRow, "status" | "started_at" | "heartbeat_at">,
  nowDate: Date,
  timings: LeaseTimings = {},
): boolean {
  if (row.status !== "running") return false;
  const nowMs = nowDate.getTime();
  const started = row.started_at ? Date.parse(row.started_at) : Number.NaN;
  const age = Number.isFinite(started) ? nowMs - started : Number.POSITIVE_INFINITY;
  if (age < (timings.minAgeMs ?? RECLAIM_MIN_AGE_MS)) return false;
  if (age >= (timings.hardCeilingMs ?? RECLAIM_HARD_CEILING_MS)) return true;
  const beat = row.heartbeat_at ? Date.parse(row.heartbeat_at) : Number.NaN;
  if (!Number.isFinite(beat)) return true;
  return nowMs - beat > (timings.leaseMs ?? LEASE_EXPIRY_MS);
}

export interface ReclaimDeps extends LeaseTimings {
  supabase?: SupabaseClient | MinimalSupabase;
  refundOrder?: RefundHook;
  now?: () => Date;
  /** Max running rows inspected per sweep. */
  limit?: number;
}

export interface ReclaimOutcome {
  queueId: string;
  orderId: string;
  /**
   * requeued = retried on the next claim; failed = attempts spent, failed
   * + refunded; closed = the order had already left PAID/GENERATING, the
   * queue row is just closed; lost_race = the row changed under us
   * (heartbeat landed / another sweep won) and was left alone.
   */
  action: "requeued" | "failed" | "closed" | "lost_race";
  reason: string;
  attempts: number;
  refunded?: boolean;
}

export interface ReclaimResult {
  checked: number;
  reclaimed: ReclaimOutcome[];
  skipped?: "supabase_not_configured" | "lease_columns_missing" | "select_failed";
}

/**
 * Reclaim `running` rows whose worker died. Never throws for a single
 * row — each row is handled independently and a failure leaves it for
 * the next tick.
 */
export async function reclaimExpiredOrders(
  deps: ReclaimDeps = {},
): Promise<ReclaimResult> {
  const supabase = (deps.supabase ?? getSupabaseAdmin()) as MinimalSupabase | null;
  if (!supabase) return { checked: 0, reclaimed: [], skipped: "supabase_not_configured" };
  const now = deps.now ?? (() => new Date());
  const nowDate = now();

  // Without the lease columns there is no fencing token, so reclaiming
  // would let a live legacy worker deliver twice — keep today's behaviour.
  if (!leaseEnabled(nowDate.getTime())) {
    return { checked: 0, reclaimed: [], skipped: "lease_columns_missing" };
  }

  const { data, error } = await supabase
    .from("report_generation_queue")
    .select(LEASE_COLS)
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(deps.limit ?? 20);
  if (error) {
    if (isMissingLeaseColumn(error)) {
      markLeaseMissing(nowDate.getTime(), "reclaim_select");
      return { checked: 0, reclaimed: [], skipped: "lease_columns_missing" };
    }
    console.error("[blockid:report-order-worker] reclaim select failed", errMessage(error));
    return { checked: 0, reclaimed: [], skipped: "select_failed" };
  }
  markLeasePresent();

  const rows = ((data as QueueRow[] | null) ?? []);
  const reclaimed: ReclaimOutcome[] = [];
  for (const row of rows) {
    if (!isLeaseExpired(row, nowDate, deps)) continue;
    try {
      const outcome = await reclaimRow(supabase, row, nowDate, deps);
      if (outcome) reclaimed.push(outcome);
    } catch (err) {
      console.error("[blockid:report-order-worker] reclaim threw", {
        queueId: row.id,
        orderId: row.order_id,
        error: errMessage(err),
      });
    }
  }
  if (reclaimed.length > 0) {
    console.warn(
      "[blockid:report-order-worker] reclaimed expired leases",
      reclaimed.map((r) => ({ orderId: r.orderId, action: r.action, attempts: r.attempts })),
    );
  }
  return { checked: rows.length, reclaimed };
}

async function reclaimRow(
  supabase: MinimalSupabase,
  row: QueueRow,
  nowDate: Date,
  deps: ReclaimDeps,
): Promise<ReclaimOutcome | null> {
  const attempts = Number(row.attempts ?? 0);
  const base = { queueId: row.id, orderId: row.order_id, attempts };

  // Idempotency: never regenerate (or refund) an order that already left
  // PAID/GENERATING — e.g. the worker flipped it READY and died before
  // (or failed while) closing its queue row.
  const { data: order, error: orderErr } = await supabase
    .from("report_orders")
    .select("id, status")
    .eq("id", row.order_id)
    .maybeSingle();
  if (orderErr) {
    console.error("[blockid:report-order-worker] reclaim order lookup failed", {
      orderId: row.order_id,
      error: errMessage(orderErr),
    });
    return null;
  }
  const orderStatus = String(order?.status ?? "");

  const heartbeatDesc = row.heartbeat_at ?? "never";
  const lostReason = `worker_lost: no heartbeat since ${heartbeatDesc} (attempt ${attempts || 1})`;

  const fenced = (patch: Row) => {
    let q = supabase
      .from("report_generation_queue")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "running")
      .eq("attempts", attempts);
    q = row.claim_token ? q.eq("claim_token", row.claim_token) : q.is("claim_token", null);
    // Re-check staleness in the write so a heartbeat that lands between
    // our read and this write wins (the hard ceiling ignores heartbeats).
    const startedMs = row.started_at ? Date.parse(row.started_at) : Number.NaN;
    const pastCeiling =
      !Number.isFinite(startedMs) ||
      nowDate.getTime() - startedMs >= (deps.hardCeilingMs ?? RECLAIM_HARD_CEILING_MS);
    if (!pastCeiling) {
      q = row.heartbeat_at
        ? q.lt("heartbeat_at", new Date(nowDate.getTime() - (deps.leaseMs ?? LEASE_EXPIRY_MS)).toISOString())
        : q.is("heartbeat_at", null);
    }
    return q.select("id").maybeSingle();
  };

  const won = async (patch: Row): Promise<boolean> => {
    const { data, error } = await fenced(patch);
    if (error) {
      console.error("[blockid:report-order-worker] reclaim write failed", {
        queueId: row.id,
        error: errMessage(error),
      });
      return false;
    }
    return Boolean(data);
  };

  if (!IN_FLIGHT_ORDER_STATES.has(orderStatus)) {
    const delivered = DELIVERED_ORDER_STATES.has(orderStatus);
    const reason = `reclaim_order_already_${orderStatus || "missing"}`;
    const ok = await won({
      status: delivered ? "done" : "failed",
      finished_at: nowDate.toISOString(),
      error_reason: delivered ? null : reason,
    });
    return { ...base, action: ok ? "closed" : "lost_race", reason };
  }

  // A lost worker counts as one failed attempt. `attempts` (claims made)
  // backs up retry_count so the cap holds even if the two ever drift.
  const nextRetry = row.retry_count + 1;
  if (nextRetry >= MAX_RETRIES || attempts >= MAX_RETRIES) {
    const ok = await won({
      status: "failed",
      finished_at: nowDate.toISOString(),
      retry_count: nextRetry,
      error_reason: lostReason.slice(0, 500),
    });
    if (!ok) return { ...base, action: "lost_race", reason: lostReason };
    const refunded = await failOrderAndRefund(supabase, {
      orderId: row.order_id,
      reason: lostReason,
      retryCount: nextRetry,
      refundOrder: deps.refundOrder,
    });
    return { ...base, action: "failed", reason: lostReason, refunded };
  }

  const ok = await won({
    status: "queued",
    started_at: null,
    heartbeat_at: null,
    claim_token: null,
    retry_count: nextRetry,
    error_reason: lostReason.slice(0, 500),
  });
  return { ...base, action: ok ? "requeued" : "lost_race", reason: lostReason };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "unknown_error");
  }
  return String(err ?? "unknown_error");
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
