/**
 * report-refund.ts — money-back compensation for a failed Trust Report.
 *
 * Master Upgrade Plan §8.8: "if generation fails after the retries, the
 * money is returned". Before this module the worker left the order in
 * FAILED and the customer's A$3 (or 200 credits) simply evaporated.
 *
 * Two payment paths converge on report_orders, so two reversals:
 *
 *   * Stripe (amount_aud > 0)  → stripe.refunds.create against
 *     stripe_payment_intent_id. Full refund, reason
 *     "requested_by_customer" (Stripe has no "we broke it" reason code;
 *     this is the one that does not flag the account for fraud review).
 *
 *   * Credits (credits_used > 0) → add the debit back onto
 *     credit_balances and wind lifetime_spent back down, mirroring the
 *     compensating write in /api/reports/redeem's order-insert error
 *     branch, and book a `refund_report_order` credit_transactions row
 *     carrying metadata.report_order_id. The worker never debits credits
 *     itself (redeem already did), so this is a pure reversal.
 *
 * Either way the order lands on REFUNDED with failure_reason recorded,
 * and the transition goes through `nextState()` so an out-of-order call
 * (e.g. the order is already REFUNDED, or still PAID and being retried)
 * cannot corrupt the row.
 *
 * Idempotency (G36 — claim first). `metadata.refund.state` tracks the
 * money:
 *
 *   claimed   → the order was moved to REFUNDED with a conditional update
 *               (`.eq("status", <status read>)`) BEFORE any money moved.
 *               Only the caller whose update matched a row refunds; a
 *               concurrent or retried attempt sees REFUNDED and stops.
 *               Stripe may or may not have been called (an ambiguous
 *               Stripe error keeps this state + `last_error`); credits
 *               have provably NOT been touched.
 *   crediting → written (guarded on `claimed`) right before the credit
 *               compare-and-set. From here only the refund ledger row can
 *               prove whether the credits landed.
 *   done      → money moved and recorded.
 *   needs_operator → the reconcile sweep could not prove the outcome; an
 *               ops alert was raised. Never touched automatically again.
 *
 * A DEFINITE failure before any money moved (Stripe rejected the request
 * with a 4xx invalid-request / card error, the credit write provably did
 * not happen) releases the claim back to the previous status. A released
 * credit failure carries metadata.refund_retry and is re-run by the drain
 * (up to REFUND_RETRY_MAX_ATTEMPTS); a Stripe rejection is alert-only.
 * Anything ambiguous keeps the claim; `reconcileStaleRefundClaims()`
 * (report-refund-reconcile.ts, run by the drain cron) finishes it — the
 * Stripe leg with the same idempotency key and fixed request params
 * (charge_already_refunded is accepted only when the payment intent's live
 * refunds cover the amount), the credit leg only when it is provably
 * missing. A Stripe idempotency conflict goes straight to an operator.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { adjustCreditBalance, type CasDb } from "@/lib/credit-balance-cas";
import {
  nextState,
  ReportOrderStateSchema,
  type ReportOrderState,
} from "./report-order-state";

// ─────────────────────────────────────────────────────────────────────────────
// Narrow surfaces (mirrors MinimalSupabase in report-order-worker.ts)
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type DbError = { message?: string } | null;

export interface RefundSelectBuilder {
  eq(col: string, val: unknown): RefundSelectBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
  limit(n: number): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface RefundUpdateBuilder
  extends PromiseLike<{ error: DbError }> {
  eq(col: string, val: unknown): RefundUpdateBuilder;
  /** RETURNING — guarded updates need to know whether they matched a row. */
  select(cols: string): PromiseLike<{ data: unknown; error: DbError }>;
}

export interface RefundSupabase {
  from(table: string): {
    select(cols: string): RefundSelectBuilder;
    update(patch: Row): RefundUpdateBuilder;
    insert(row: Row): PromiseLike<{ error: DbError }>;
  };
}

/**
 * The slice of the Stripe SDK we need. Declared as methods (not
 * properties holding function types) so the real `Stripe` client — whose
 * methods take an extra optional RequestOptions argument — stays
 * structurally assignable.
 */
export interface RefundCapableStripe {
  refunds: {
    create(
      params: {
        payment_intent: string;
        reason?: "requested_by_customer";
        metadata?: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{ id: string; status?: string | null }>;
    /** Read-only lookup used when Stripe answers "charge already refunded". */
    list?(params: { payment_intent: string; limit?: number }): PromiseLike<{
      data: Array<{
        id: string;
        status?: string | null;
        amount?: number | null;
        metadata?: Record<string, string> | null;
      }>;
    }>;
  };
}

export interface RefundDeps {
  /** Pass `null` to assert "no database"; omit to use getSupabaseAdmin(). */
  supabase?: RefundSupabase | null;
  /** Pass `null` to assert "Stripe unavailable"; omit to use getStripe(). */
  stripe?: RefundCapableStripe | null;
  now?: () => Date;
}

export type RefundPath =
  | "stripe"
  | "credits"
  | "already_refunded"
  | "nothing_to_refund";

export type RefundOutcome =
  | { ok: true; path: RefundPath; refundId?: string }
  | { ok: false; reason: string };

/** credit_transactions.reason of the credit-refund ledger row (metadata.report_order_id = order id). */
export const REPORT_REFUND_LEDGER_REASON = "refund_report_order";

export type RefundState = "claimed" | "crediting" | "done" | "needs_operator";

/**
 * Transient, provably-nothing-moved credit failures (CAS contention, a read
 * error, a definite DB rejection) release the claim with
 * metadata.refund_retry = { reason, at, attempts, exhausted }; the drain
 * cron re-runs refundFailedOrder for them (report-refund-reconcile.ts) up to
 * this many attempts, after which the unrefunded-orders alert reports them.
 */
export const REFUND_RETRY_MAX_ATTEMPTS = 5;

/** Stripe idempotency key — the reconcile sweep re-sends the SAME request. */
export function stripeRefundIdempotencyKey(orderId: string): string {
  return `report-order-refund:${orderId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe error classification
// ─────────────────────────────────────────────────────────────────────────────

/** Stripe reused-key conflict: our params changed under the same key — never ambiguous, never retried. */
const IDEMPOTENCY_STRIPE_TYPES = new Set(["StripeIdempotencyError", "idempotency_error"]);

export function isStripeIdempotencyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: unknown; rawType?: unknown };
  return IDEMPOTENCY_STRIPE_TYPES.has(String(e.type)) || IDEMPOTENCY_STRIPE_TYPES.has(String(e.rawType));
}

/** Error types where Stripe definitely did NOT create a refund. */
const DEFINITE_STRIPE_TYPES = new Set([
  "StripeInvalidRequestError",
  "StripeCardError",
  "invalid_request_error",
  "card_error",
]);

/**
 * true only for a definite rejection: an invalid-request / card error with a
 * 4xx status. Network errors, timeouts, 5xx, StripeConnectionError,
 * StripeAPIError, rate limits and idempotency conflicts are ambiguous — Stripe
 * may have refunded — so the caller must keep the claim.
 */
export function isDefiniteStripeRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: unknown; rawType?: unknown; statusCode?: unknown };
  const typed = DEFINITE_STRIPE_TYPES.has(String(e.type)) || DEFINITE_STRIPE_TYPES.has(String(e.rawType));
  const status = typeof e.statusCode === "number" ? e.statusCode : NaN;
  return typed && status >= 400 && status < 500;
}

function stripeErrorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Claimed-refund completion (shared by refundFailedOrder + the reconcile sweep)
// ─────────────────────────────────────────────────────────────────────────────

/** A REFUNDED order holding a refund claim, as the completion step needs it. */
export interface ClaimedOrder {
  id: string;
  userId: string;
  amountCents: number;
  creditsUsed: number;
  paymentIntentId: string;
  /** The order's metadata WITHOUT the `refund` key. */
  baseMeta: Row;
  /** metadata.refund as currently stored (state claimed | crediting). */
  refund: Row;
}

export type CompleteOutcome =
  | { ok: true; path: RefundPath; refundId?: string }
  | {
      ok: false;
      reason: string;
      /** released = claim handed back (nothing moved); kept = still claimed for reconcile; operator = needs_operator. */
      disposition: "released" | "kept" | "operator";
    };

type StripeStep =
  | { kind: "refunded"; id: string; status: string | null }
  | { kind: "rejected"; error: string }
  | { kind: "ambiguous"; error: string }
  | { kind: "operator"; error: string };

/** Refund statuses that count as money going back (pending settles on Stripe's side). */
const LIVE_REFUND_STATUSES = new Set(["succeeded", "pending", "requires_action"]);

async function stripeRefundStep(stripe: RefundCapableStripe, order: ClaimedOrder): Promise<StripeStep> {
  try {
    // The params are FIXED per order (no failure reason, no timestamp), so a
    // retry under the same idempotency key is always the identical request.
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          bid_scope: "report_order",
          bid_order_id: order.id,
        },
      },
      { idempotencyKey: stripeRefundIdempotencyKey(order.id) },
    );
    return { kind: "refunded", id: refund.id, status: refund.status ?? null };
  } catch (err) {
    if (stripeErrorCode(err) === "charge_already_refunded") {
      // Refunded by an earlier attempt whose response was lost (or by hand).
      // Only accept it when the live refunds cover this order's amount;
      // prefer the refund we created (metadata.bid_order_id).
      const list = stripe.refunds.list?.bind(stripe.refunds);
      if (!list) return { kind: "operator", error: "charge_already_refunded: refunds.list unavailable" };
      let listed: Awaited<ReturnType<typeof list>>;
      try {
        listed = await list({ payment_intent: order.paymentIntentId, limit: 100 });
      } catch (listErr) {
        return { kind: "ambiguous", error: `already_refunded_lookup_failed: ${msg(listErr)}` };
      }
      const live = (listed?.data ?? []).filter((r) => LIVE_REFUND_STATUSES.has(String(r.status ?? "")));
      const total = live.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
      const ours = live.find((r) => r.metadata?.bid_order_id === order.id) ?? live[0];
      if (!ours || total < order.amountCents) {
        return {
          kind: "operator",
          error: `charge_already_refunded but live refunds total ${total} < ${order.amountCents} cents (${live.length} refund(s))`,
        };
      }
      return { kind: "refunded", id: ours.id, status: ours.status ?? null };
    }
    if (isStripeIdempotencyError(err)) return { kind: "operator", error: `stripe_idempotency_conflict: ${msg(err)}` };
    return isDefiniteStripeRejection(err)
      ? { kind: "rejected", error: msg(err) }
      : { kind: "ambiguous", error: msg(err) };
  }
}

/** Guarded metadata write on the claimed order. Returns matched-row count (-1 on error). */
async function writeRefundMeta(
  db: RefundSupabase,
  order: ClaimedOrder,
  refund: Row,
  guardState?: RefundState,
): Promise<{ matched: number; error?: string }> {
  let q = db
    .from("report_orders")
    .update({ metadata: { ...order.baseMeta, refund } })
    .eq("id", order.id)
    .eq("status", "REFUNDED");
  if (guardState) q = q.eq("metadata->refund->>state", guardState);
  const res = await q.select("id");
  if (res.error) return { matched: -1, error: msg(res.error) };
  return { matched: Array.isArray(res.data) ? res.data.length : 0 };
}

/**
 * Nothing moved — hand the order back to the status it had before the claim.
 * `retry` (transient credit failures only) records metadata.refund_retry so
 * the drain cron tries again; without it the order waits for an operator
 * (the unrefunded-orders alert).
 */
async function releaseClaim(
  db: RefundSupabase,
  order: ClaimedOrder,
  why: string,
  retry?: { now: () => Date },
): Promise<void> {
  const metadata: Row = { ...order.baseMeta };
  if (retry) {
    const prev =
      order.baseMeta.refund_retry && typeof order.baseMeta.refund_retry === "object"
        ? (order.baseMeta.refund_retry as Row)
        : {};
    const attempts = Number(prev.attempts ?? 0) + 1;
    metadata.refund_retry = {
      reason: why.slice(0, 300),
      at: retry.now().toISOString(),
      attempts,
      exhausted: attempts >= REFUND_RETRY_MAX_ATTEMPTS,
    };
  }
  const { error } = await db
    .from("report_orders")
    .update({
      status: String(order.refund.previous_status ?? "FAILED"),
      failure_reason: (order.refund.previous_failure_reason as string | null | undefined) ?? null,
      metadata,
    })
    .eq("id", order.id)
    .eq("status", "REFUNDED");
  if (error) {
    console.error(
      "[blockid:report-refund] claim release failed — order REFUNDED without a refund; reconcile",
      { orderId: order.id, why, error: msg(error) },
    );
  }
}

/** The credit-refund ledger row for this order, if one was booked. */
export async function findRefundLedgerRow(
  db: RefundSupabase,
  order: Pick<ClaimedOrder, "id" | "userId">,
): Promise<{ row: Row | null; error?: string }> {
  // Not maybeSingle: a duplicate booking (2+ rows) must still prove the
  // credit landed, not fail the lookup.
  const res = await db
    .from("credit_transactions")
    .select("id, balance_after")
    .eq("user_id", order.userId)
    .eq("reason", REPORT_REFUND_LEDGER_REASON)
    .eq("metadata->>report_order_id", order.id)
    .limit(5);
  if (res.error) return { row: null, error: msg(res.error) };
  const rows = Array.isArray(res.data) ? (res.data as Row[]) : [];
  return { row: rows[0] ?? null };
}

/**
 * Move the money for an order that holds a refund claim, then mark it done.
 * Never throws. `now` stamps last_attempt_at.
 */
export async function completeClaimedRefund(
  db: RefundSupabase,
  stripe: RefundCapableStripe | null,
  order: ClaimedOrder,
  now: () => Date,
): Promise<CompleteOutcome> {
  const refund: Row = { ...order.refund };
  let path: RefundPath = "nothing_to_refund";
  let refundId: string | undefined;
  const keep = async (reason: string): Promise<CompleteOutcome> => {
    refund.last_error = reason.slice(0, 500);
    refund.last_attempt_at = now().toISOString();
    // Guarded on the state this attempt holds, so a stale copy never
    // overwrites a concurrent attempt's newer state.
    const w = await writeRefundMeta(db, order, refund, refund.state as RefundState);
    if (w.error) console.error("[blockid:report-refund] could not record last_error", { orderId: order.id, error: w.error });
    return { ok: false, reason, disposition: "kept" };
  };
  /** The outcome cannot be proven automatically — park it for a human (the reconcile sweep alerts). */
  const toOperator = async (reason: string): Promise<CompleteOutcome> => {
    const held = refund.state as RefundState;
    refund.state = "needs_operator";
    refund.last_error = reason.slice(0, 500);
    refund.last_attempt_at = now().toISOString();
    const w = await writeRefundMeta(db, order, refund, held);
    if (w.error) console.error("[blockid:report-refund] could not mark needs_operator", { orderId: order.id, error: w.error });
    return { ok: false, reason, disposition: "operator" };
  };

  // ── Path A: Stripe ───────────────────────────────────────────────────
  if (order.amountCents > 0) {
    if (typeof refund.stripe_refund_id === "string" && refund.stripe_refund_id) {
      refundId = refund.stripe_refund_id;
      path = "stripe";
    } else {
      if (!stripe) return keep("stripe_not_configured");
      const step = await stripeRefundStep(stripe, order);
      if (step.kind === "rejected") {
        // Definite: Stripe refused, nothing moved.
        await releaseClaim(db, order, "stripe_refund_rejected");
        return { ok: false, reason: `stripe_refund_failed: ${step.error}`, disposition: "released" };
      }
      if (step.kind === "operator") return toOperator(step.error);
      if (step.kind === "ambiguous") {
        // Stripe may have refunded — keep the claim; the reconcile sweep
        // re-sends the same request (same idempotency key).
        return keep(`stripe_refund_unconfirmed: ${step.error}`);
      }
      refundId = step.id;
      refund.stripe_refund_id = step.id;
      refund.stripe_refund_status = step.status;
      path = "stripe";
    }
  }

  // ── Path B: credits ──────────────────────────────────────────────────
  if (order.creditsUsed > 0) {
    if (refund.state === "crediting") {
      // A previous attempt may have credited. Only the ledger can prove it.
      const led = await findRefundLedgerRow(db, order);
      if (led.error) return keep(`refund_ledger_lookup_failed: ${led.error}`);
      if (!led.row) return toOperator("credit_refund_unverifiable: crediting started, no ledger row");
      refund.credits_reversed = order.creditsUsed;
      refund.credit_balance_after = led.row.balance_after ?? null;
      refund.credit_ledger_id = led.row.id ?? null;
    } else {
      // claimed → crediting, guarded: exactly one attempt runs the CAS.
      const mark = await writeRefundMeta(db, order, { ...refund, state: "crediting" }, "claimed");
      if (mark.matched < 0) {
        if (path !== "stripe") await releaseClaim(db, order, `credit_mark_failed: ${mark.error}`, { now });
        return { ok: false, reason: `credit_mark_failed: ${mark.error}`, disposition: path !== "stripe" ? "released" : "kept" };
      }
      if (mark.matched === 0) {
        return { ok: false, reason: "refund_in_progress_elsewhere", disposition: "kept" };
      }
      refund.state = "crediting";

      // G36-B: compare-and-set (+creditsUsed), not read → update(absolute).
      // The real supabase-js client satisfies CasDb; RefundSupabase only
      // narrows what the order reads need.
      const adjusted = await adjustCreditBalance(db as unknown as CasDb, order.userId, order.creditsUsed, {
        lifetime: { column: "lifetime_spent", delta: -order.creditsUsed },
      });
      if (!adjusted.ok) {
        const reason = `credit_reversal_failed: ${adjusted.error ?? adjusted.reason}`;
        if (!adjusted.maybeWritten && path !== "stripe") {
          // Provably nothing written (read error / contention / a definite DB
          // rejection) → release with a retry marker; the drain re-runs it.
          await releaseClaim(db, order, reason, { now });
          return { ok: false, reason, disposition: "released" };
        }
        // The write may have committed: stay `crediting`; the reconcile
        // sweep checks the ledger and escalates to an operator.
        console.error("[blockid:report-refund] credit write outcome unknown — left for reconcile", {
          orderId: order.id,
          error: adjusted.error ?? adjusted.reason,
        });
        return keep(reason);
      }

      // Ledger row = the proof the reconcile sweep looks for.
      const { error: ledErr } = await db.from("credit_transactions").insert({
        user_id: order.userId,
        amount: order.creditsUsed,
        balance_after: adjusted.balance,
        reason: REPORT_REFUND_LEDGER_REASON,
        metadata: { report_order_id: order.id },
      });
      if (ledErr) {
        console.error("[blockid:report-refund] credits refunded but ledger row insert failed", {
          orderId: order.id,
          error: msg(ledErr),
        });
      }
      refund.credits_reversed = order.creditsUsed;
      refund.credit_balance_after = adjusted.balance;
    }
    // A mixed order (both paths) is not currently reachable, but if it
    // ever is the Stripe leg is the headline.
    if (path !== "stripe") path = "credits";
  }

  // ── Done ─────────────────────────────────────────────────────────────
  const heldState = refund.state as RefundState;
  refund.state = "done";
  delete refund.last_error;
  const fin = await writeRefundMeta(db, order, refund, heldState);
  if (fin.matched === 0) {
    console.warn("[blockid:report-refund] refund state moved under us; done marker not written", { orderId: order.id, heldState });
  }
  if (fin.error) {
    // Money moved; the order is REFUNDED. Only the `done` marker is missing,
    // so the reconcile sweep will re-check (Stripe: same idempotency key;
    // credits: the ledger row proves it).
    console.error("[blockid:report-refund] refund executed but refund detail write failed", {
      orderId: order.id,
      path,
      refundId,
      error: fin.error,
    });
  }
  return refundId ? { ok: true, path, refundId } : { ok: true, path };
}

// ─────────────────────────────────────────────────────────────────────────────
// refundFailedOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse the payment for a report order and move it to REFUNDED.
 *
 * Never throws — the caller (the drain cron) logs the outcome and moves
 * on. A `{ ok: false }` result either leaves the order in its previous
 * status (definite failure, nothing moved) or keeps the refund claim for
 * the reconcile sweep (ambiguous outcome).
 */
export async function refundFailedOrder(
  input: { orderId: string; reason: string },
  deps: RefundDeps = {},
): Promise<RefundOutcome> {
  const supabase =
    deps.supabase !== undefined
      ? deps.supabase
      : ((getSupabaseAdmin() as SupabaseClient | null) as unknown as RefundSupabase | null);
  if (!supabase) return { ok: false, reason: "supabase_not_configured" };

  const now = deps.now ?? (() => new Date());

  const { data: order, error: orderErr } = await supabase
    .from("report_orders")
    .select(
      "id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, failure_reason, metadata",
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (orderErr) {
    return { ok: false, reason: `order_lookup_failed: ${msg(orderErr)}` };
  }
  if (!order) return { ok: false, reason: "order_not_found" };

  const parsedStatus = ReportOrderStateSchema.safeParse(order.status);
  if (!parsedStatus.success) {
    return { ok: false, reason: `unknown_order_status: ${String(order.status)}` };
  }
  const status: ReportOrderState = parsedStatus.data;

  // Idempotent re-entry — a previous attempt holds (or finished) the refund.
  if (status === "REFUNDED") {
    return { ok: true, path: "already_refunded" };
  }

  // G35 Pricing v5 (0474): the state machine now also lets READY / IN_REVIEW
  // move to REFUNDED — that is the Stripe `charge.refunded` path (P3), never
  // this auto-refund for undelivered orders. A delivered or in-review order
  // is refused here so the drain cron can never reverse a report it handed out.
  const target = status === "READY" || status === "SHARED" || status === "IN_REVIEW" ? null : nextState(status, "refund_issued");
  if (!target) {
    return { ok: false, reason: `illegal_refund_from_${status}` };
  }

  const amountCents = Number(order.amount_aud ?? 0);
  const creditsUsed = Number(order.credits_used ?? 0);

  // ── Preconditions (no writes yet) ────────────────────────────────────
  let paymentIntentId = "";
  let stripe: RefundCapableStripe | null = null;
  if (amountCents > 0) {
    paymentIntentId =
      typeof order.stripe_payment_intent_id === "string"
        ? order.stripe_payment_intent_id
        : "";
    if (!paymentIntentId) {
      return { ok: false, reason: "missing_stripe_payment_intent" };
    }
    stripe =
      deps.stripe !== undefined
        ? deps.stripe
        : (getStripe() as RefundCapableStripe | null);
    if (!stripe) return { ok: false, reason: "stripe_not_configured" };
  }
  const userId = String(order.user_id ?? "");
  if (creditsUsed > 0 && !userId) return { ok: false, reason: "order_missing_user" };

  const baseMeta: Row = { ...(order.metadata && typeof order.metadata === "object" ? (order.metadata as Row) : {}) };
  delete baseMeta.refund;
  const refundMeta: Row = {
    state: "claimed" satisfies RefundState,
    refunded_at: now().toISOString(),
    refund_reason: input.reason.slice(0, 500),
    previous_status: status,
    previous_failure_reason: (order.failure_reason as string | null | undefined) ?? null,
  };

  // ── Claim: previous status → REFUNDED, before any money moves ─────────
  // G36: exactly one attempt matches the guarded update. A concurrent or
  // retried attempt matches zero rows and never refunds; a claim write that
  // fails moves no money.
  const claim = await supabase
    .from("report_orders")
    .update({
      status: target,
      failure_reason: input.reason.slice(0, 500),
      metadata: { ...baseMeta, refund: refundMeta },
    })
    .eq("id", input.orderId)
    .eq("status", status)
    .select("id");
  if (claim.error) {
    return { ok: false, reason: `refund_claim_failed: ${msg(claim.error)}` };
  }
  if (!Array.isArray(claim.data) || claim.data.length === 0) {
    const { data: again } = await supabase
      .from("report_orders")
      .select("status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (again?.status === "REFUNDED") return { ok: true, path: "already_refunded" };
    return { ok: false, reason: `refund_claim_lost: ${String(again?.status ?? "unknown")}` };
  }

  const outcome = await completeClaimedRefund(
    supabase,
    stripe,
    {
      id: String(order.id ?? input.orderId),
      userId,
      amountCents,
      creditsUsed,
      paymentIntentId,
      baseMeta,
      refund: refundMeta,
    },
    now,
  );
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  return outcome;
}

export function msg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "unknown_error");
  }
  return String(err ?? "unknown_error");
}
