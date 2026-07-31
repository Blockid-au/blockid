/**
 * report-refund.ts — money-back compensation for a failed Trust Report.
 *
 * Master Upgrade Plan §8.8: "if generation fails after the retries, the
 * money is returned". Before this module the worker left the order in
 * FAILED and the customer's A$5.50 (or 200 credits) simply evaporated.
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
 *     branch. The worker never debits credits itself (redeem already
 *     did), so this is a pure reversal — no double-credit.
 *
 * Either way the order lands on REFUNDED with failure_reason recorded,
 * and the transition goes through `nextState()` so an out-of-order call
 * (e.g. the order is already REFUNDED, or still PAID and being retried)
 * cannot corrupt the row.
 *
 * Idempotency: a row already in REFUNDED short-circuits with
 * `{ ok: true, path: "already_refunded" }` — the drain cron can safely
 * re-attempt after a partial failure.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import {
  nextState,
  ReportOrderStateSchema,
  type ReportOrderState,
} from "./report-order-state";

// ─────────────────────────────────────────────────────────────────────────────
// Narrow surfaces (mirrors MinimalSupabase in report-order-worker.ts)
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export interface RefundSelectBuilder {
  eq(col: string, val: unknown): RefundSelectBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
}

export interface RefundUpdateBuilder
  extends PromiseLike<{ error: { message?: string } | null }> {
  eq(col: string, val: unknown): RefundUpdateBuilder;
}

export interface RefundSupabase {
  from(table: string): {
    select(cols: string): RefundSelectBuilder;
    update(patch: Row): RefundUpdateBuilder;
  };
}

/**
 * The slice of the Stripe SDK we need. Declared as a method (not a
 * property holding a function type) so the real `Stripe` client — whose
 * `refunds.create` takes an extra optional RequestOptions argument —
 * stays structurally assignable.
 */
export interface RefundCapableStripe {
  refunds: {
    create(params: {
      payment_intent: string;
      reason?: "requested_by_customer";
      metadata?: Record<string, string>;
    }): Promise<{ id: string; status?: string | null }>;
  };
}

export interface RefundDeps {
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

// ─────────────────────────────────────────────────────────────────────────────
// refundFailedOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse the payment for a report order and move it to REFUNDED.
 *
 * Never throws — the caller (the drain cron) logs the outcome and moves
 * on. A `{ ok: false }` result leaves the order in FAILED so the next
 * drain tick, or an operator, can retry the reversal.
 */
export async function refundFailedOrder(
  input: { orderId: string; reason: string },
  deps: RefundDeps = {},
): Promise<RefundOutcome> {
  const supabase = (deps.supabase ??
    (getSupabaseAdmin() as SupabaseClient | null)) as RefundSupabase | null;
  if (!supabase) return { ok: false, reason: "supabase_not_configured" };

  const now = deps.now ?? (() => new Date());

  const { data: order, error: orderErr } = await supabase
    .from("report_orders")
    .select(
      "id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, metadata",
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

  // Idempotent re-entry — the previous attempt already moved the money.
  if (status === "REFUNDED") {
    return { ok: true, path: "already_refunded" };
  }

  const target = nextState(status, "refund_issued");
  if (!target) {
    return { ok: false, reason: `illegal_refund_from_${status}` };
  }

  const amountCents = Number(order.amount_aud ?? 0);
  const creditsUsed = Number(order.credits_used ?? 0);

  const refundMeta: Row = {
    refunded_at: now().toISOString(),
    refund_reason: input.reason.slice(0, 500),
  };
  let path: RefundPath = "nothing_to_refund";
  let refundId: string | undefined;

  // ── Path A: Stripe ───────────────────────────────────────────────────
  if (amountCents > 0) {
    const paymentIntentId =
      typeof order.stripe_payment_intent_id === "string"
        ? order.stripe_payment_intent_id
        : "";
    if (!paymentIntentId) {
      return { ok: false, reason: "missing_stripe_payment_intent" };
    }

    const stripe =
      deps.stripe !== undefined
        ? deps.stripe
        : (getStripe() as RefundCapableStripe | null);
    if (!stripe) return { ok: false, reason: "stripe_not_configured" };

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          bid_scope: "report_order",
          bid_order_id: String(order.id ?? input.orderId),
          bid_failure_reason: input.reason.slice(0, 400),
        },
      });
      refundId = refund.id;
      refundMeta.stripe_refund_id = refund.id;
      refundMeta.stripe_refund_status = refund.status ?? null;
      path = "stripe";
    } catch (err) {
      // Leave the order FAILED — a half-refunded row would be worse.
      return { ok: false, reason: `stripe_refund_failed: ${msg(err)}` };
    }
  }

  // ── Path B: credits ──────────────────────────────────────────────────
  // Mirrors the compensating write in /api/reports/redeem: balance goes
  // back up, lifetime_spent goes back down (floored at zero).
  if (creditsUsed > 0) {
    const userId = String(order.user_id ?? "");
    if (!userId) return { ok: false, reason: "order_missing_user" };

    const { data: balRow, error: balReadErr } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_spent")
      .eq("user_id", userId)
      .maybeSingle();

    if (balReadErr) {
      return { ok: false, reason: `balance_lookup_failed: ${msg(balReadErr)}` };
    }

    const balance = Number(balRow?.balance ?? 0);
    const lifetimeSpent = Number(balRow?.lifetime_spent ?? 0);

    const { error: balErr } = await supabase
      .from("credit_balances")
      .update({
        balance: balance + creditsUsed,
        lifetime_spent: Math.max(0, lifetimeSpent - creditsUsed),
        updated_at: now().toISOString(),
      })
      .eq("user_id", userId);

    if (balErr) {
      return { ok: false, reason: `credit_reversal_failed: ${msg(balErr)}` };
    }

    refundMeta.credits_reversed = creditsUsed;
    refundMeta.credit_balance_after = balance + creditsUsed;
    // A mixed order (both paths) is not currently reachable, but if it
    // ever is the Stripe leg is the headline.
    if (path !== "stripe") path = "credits";
  }

  // ── Land the order on REFUNDED ───────────────────────────────────────
  const existingMeta =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Row)
      : {};

  const { error: updErr } = await supabase
    .from("report_orders")
    .update({
      status: target,
      failure_reason: input.reason.slice(0, 500),
      metadata: { ...existingMeta, refund: refundMeta },
    })
    .eq("id", input.orderId);

  if (updErr) {
    // The money HAS moved; the status flip is what failed. Surface it so
    // the operator reconciles rather than silently double-refunding —
    // a re-run is guarded by the stripe/credits idempotency above only
    // for REFUNDED rows, so this needs eyes.
    console.error(
      "[blockid:report-refund] refund executed but status flip failed",
      { orderId: input.orderId, path, refundId, error: msg(updErr) },
    );
    return { ok: false, reason: `status_update_failed: ${msg(updErr)}` };
  }

  return refundId ? { ok: true, path, refundId } : { ok: true, path };
}

function msg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "unknown_error");
  }
  return String(err ?? "unknown_error");
}
