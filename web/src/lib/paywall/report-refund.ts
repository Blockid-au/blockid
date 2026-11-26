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
 *     branch. The worker never debits credits itself (redeem already
 *     did), so this is a pure reversal — no double-credit.
 *
 * Either way the order lands on REFUNDED with failure_reason recorded,
 * and the transition goes through `nextState()` so an out-of-order call
 * (e.g. the order is already REFUNDED, or still PAID and being retried)
 * cannot corrupt the row.
 *
 * Idempotency (G36 — claim first): the order is moved to REFUNDED with a
 * conditional update (`.eq("status", <status read>)`) BEFORE any money
 * moves, and only the caller whose update matched a row refunds. The old
 * order — refund, then write the status — refunded twice when the status
 * write failed and the drain cron retried, and two concurrent attempts both
 * passed the "not yet REFUNDED" read. A row already in REFUNDED (or claimed
 * by a concurrent attempt) short-circuits with
 * `{ ok: true, path: "already_refunded" }`. If the money cannot move, the
 * claim is released back to the previous status so a later tick retries.
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

export interface RefundSelectBuilder {
  eq(col: string, val: unknown): RefundSelectBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
}

export interface RefundUpdateBuilder
  extends PromiseLike<{ error: { message?: string } | null }> {
  eq(col: string, val: unknown): RefundUpdateBuilder;
  /** RETURNING — the claim needs to know whether its guarded update matched a row. */
  select(cols: string): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
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
    create(
      params: {
        payment_intent: string;
        reason?: "requested_by_customer";
        metadata?: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{ id: string; status?: string | null }>;
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

// ─────────────────────────────────────────────────────────────────────────────
// refundFailedOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse the payment for a report order and move it to REFUNDED.
 *
 * Never throws — the caller (the drain cron) logs the outcome and moves
 * on. A `{ ok: false }` result leaves the order in its previous status
 * (FAILED / PAID) so the next drain tick, or an operator, can retry the
 * reversal.
 */
export async function refundFailedOrder(
  input: { orderId: string; reason: string },
  deps: RefundDeps = {},
): Promise<RefundOutcome> {
  const supabase =
    deps.supabase !== undefined
      ? deps.supabase
      : ((getSupabaseAdmin() as SupabaseClient | null) as RefundSupabase | null);
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

  // Idempotent re-entry — the previous attempt already moved the money.
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

  const existingMeta =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Row)
      : {};
  const refundMeta: Row = {
    refunded_at: now().toISOString(),
    refund_reason: input.reason.slice(0, 500),
    state: "claimed",
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
      metadata: { ...existingMeta, refund: refundMeta },
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

  /** Nothing moved — hand the order back to its previous status for a retry. */
  const releaseClaim = async (why: string) => {
    const { error } = await supabase
      .from("report_orders")
      .update({
        status,
        failure_reason: (order.failure_reason as string | null | undefined) ?? null,
        metadata: existingMeta,
      })
      .eq("id", input.orderId)
      .eq("status", target);
    if (error) {
      console.error(
        "[blockid:report-refund] claim release failed — order REFUNDED without a refund; reconcile",
        { orderId: input.orderId, why, error: msg(error) },
      );
    }
  };

  let path: RefundPath = "nothing_to_refund";
  let refundId: string | undefined;

  // ── Path A: Stripe ───────────────────────────────────────────────────
  if (amountCents > 0 && stripe) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            bid_scope: "report_order",
            bid_order_id: String(order.id ?? input.orderId),
            bid_failure_reason: input.reason.slice(0, 400),
          },
        },
        // Belt and braces: Stripe dedupes a repeat of this call for 24 h.
        { idempotencyKey: `report-order-refund:${String(order.id ?? input.orderId)}` },
      );
      refundId = refund.id;
      refundMeta.stripe_refund_id = refund.id;
      refundMeta.stripe_refund_status = refund.status ?? null;
      path = "stripe";
    } catch (err) {
      // Nothing moved — put the order back so a later tick can retry.
      await releaseClaim("stripe_refund_failed");
      return { ok: false, reason: `stripe_refund_failed: ${msg(err)}` };
    }
  }

  // ── Path B: credits ──────────────────────────────────────────────────
  // Mirrors the compensating write in /api/reports/redeem: balance goes
  // back up, lifetime_spent goes back down (floored at zero).
  if (creditsUsed > 0) {
    // G36-B: compare-and-set (+creditsUsed), not read → update(absolute).
    // The old write set `balance = <read> + creditsUsed`, so a debit or grant
    // landing between the read and the write was silently erased.
    // The real supabase-js client satisfies CasDb; RefundSupabase only
    // narrows what the order reads need.
    const adjusted = await adjustCreditBalance(supabase as unknown as CasDb, userId, creditsUsed, {
      lifetime: { column: "lifetime_spent", delta: -creditsUsed },
    });
    if (!adjusted.ok) {
      if (path === "stripe") {
        // Mixed order (not currently reachable): the Stripe leg already
        // moved, so keep the claim — a retry must not refund Stripe again.
        console.error(
          "[blockid:report-refund] Stripe refunded but credit reversal failed — reconcile",
          { orderId: input.orderId, refundId, error: adjusted.error ?? adjusted.reason },
        );
      } else {
        await releaseClaim("credit_reversal_failed");
      }
      return {
        ok: false,
        reason: `credit_reversal_failed: ${adjusted.error ?? adjusted.reason}`,
      };
    }

    refundMeta.credits_reversed = creditsUsed;
    refundMeta.credit_balance_after = adjusted.balance;
    // A mixed order (both paths) is not currently reachable, but if it
    // ever is the Stripe leg is the headline.
    if (path !== "stripe") path = "credits";
  }

  // ── Record the refund detail on the (already REFUNDED) order ─────────
  refundMeta.state = "done";
  const { error: updErr } = await supabase
    .from("report_orders")
    .update({ metadata: { ...existingMeta, refund: refundMeta } })
    .eq("id", input.orderId)
    .eq("status", target);

  if (updErr) {
    // The money moved and the order is already REFUNDED (the claim), so a
    // retry is a no-op — only the refund detail (refund id, balance after)
    // is missing from metadata. Log it for the operator; do not fail.
    console.error(
      "[blockid:report-refund] refund executed but refund detail write failed",
      { orderId: input.orderId, path, refundId, error: msg(updErr) },
    );
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
