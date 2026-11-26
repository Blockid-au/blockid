/**
 * report-refund-reconcile.ts — finish refund claims a dead process left
 * behind, and surface FAILED paid orders nobody refunded (G36).
 *
 * refundFailedOrder() claims the order (status → REFUNDED,
 * metadata.refund.state = "claimed") BEFORE moving money. If the process dies
 * after the claim (deploy retires the origin, the 480 s maxDuration, a crash)
 * or Stripe answers ambiguously (timeout / reset / 5xx), every later
 * refundFailedOrder() call returns `already_refunded` — so without this sweep
 * the customer would never get the money back.
 *
 * reconcileStaleRefundClaims() (drain cron, every tick):
 *   * REFUNDED orders whose refund.state is claimed / crediting and whose
 *     claim (refund.refunded_at) is older than STALE_CLAIM_MS;
 *   * at most one attempt per order per STALE_CLAIM_MS (last_attempt_at);
 *   * completeClaimedRefund() does the work: Stripe → the SAME request with
 *     the SAME idempotency key (charge_already_refunded → list the
 *     payment intent's refunds, read-only, and record that id); credits →
 *     re-credited only from `claimed` (provably not started), a `crediting`
 *     claim is done only when the refund ledger row exists, otherwise it
 *     becomes needs_operator;
 *   * a claim older than GIVE_UP_MS (Stripe idempotency keys live 24 h) or a
 *     needs_operator verdict raises ONE ops alert and is never retried.
 *
 * alertUnrefundedFailedOrders(): paid FAILED orders from the last 7 days with
 * money behind them and no metadata.refund → one ops alert, each order
 * stamped metadata.refund_alert so it is reported once. No money moves —
 * historical rows may have been handled by hand.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import {
  completeClaimedRefund,
  msg,
  type RefundCapableStripe,
  type RefundSupabase,
} from "./report-refund";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message?: string } | null };

interface ListQuery extends PromiseLike<Res> {
  eq(col: string, val: unknown): ListQuery;
  in(col: string, vals: unknown[]): ListQuery;
  is(col: string, val: null): ListQuery;
  gte(col: string, val: unknown): ListQuery;
  limit(n: number): ListQuery;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
}
/** RefundSupabase plus the list reads the sweeps need (supabase-js satisfies both). */
export interface ReconcileDb {
  from(table: string): {
    select(cols: string): ListQuery;
    update: ReturnType<RefundSupabase["from"]>["update"];
    insert: ReturnType<RefundSupabase["from"]>["insert"];
  };
}

export interface ReconcileDeps {
  supabase?: ReconcileDb | null;
  stripe?: RefundCapableStripe | null;
  now?: () => Date;
  /** Ops alert transport (the drain cron passes sendTelegram). Returns delivered. */
  alert?: (text: string) => Promise<boolean>;
}

export const STALE_CLAIM_MS = 10 * 60_000;
/** Past the 24 h Stripe idempotency window (+ margin) an unfinished claim goes to a human. */
export const GIVE_UP_MS = 26 * 60 * 60_000;
export const UNREFUNDED_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const BATCH = 25;

export interface ReconcileResult {
  checked: number;
  completed: string[];
  kept: string[];
  released: string[];
  operator: string[];
  alerted: boolean;
}

function resolveDb(deps: { supabase?: ReconcileDb | null }): ReconcileDb | null {
  return deps.supabase !== undefined
    ? deps.supabase
    : ((getSupabaseAdmin() as SupabaseClient | null) as unknown as ReconcileDb | null);
}

const ms = (iso: unknown): number => (typeof iso === "string" ? Date.parse(iso) : NaN);

export async function reconcileStaleRefundClaims(deps: ReconcileDeps = {}): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, completed: [], kept: [], released: [], operator: [], alerted: false };
  const db = resolveDb(deps);
  if (!db) return result;
  const now = deps.now ?? (() => new Date());
  const t = now().getTime();

  const { data, error } = await db
    .from("report_orders")
    .select("id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, metadata")
    .eq("status", "REFUNDED")
    .in("metadata->refund->>state", ["claimed", "crediting"])
    .limit(BATCH);
  if (error) {
    console.error("[blockid:report-refund-reconcile] stale-claim query failed", msg(error));
    return result;
  }

  let stripe: RefundCapableStripe | null | undefined = deps.stripe;

  for (const row of (data as Row[] | null) ?? []) {
    const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Row) : {};
    const refund = meta.refund && typeof meta.refund === "object" ? (meta.refund as Row) : null;
    if (!refund) continue;
    const claimedAt = ms(refund.refunded_at);
    // Fresh claims belong to the attempt that is (probably) still running.
    if (!Number.isFinite(claimedAt) || t - claimedAt < STALE_CLAIM_MS) continue;
    const lastAttempt = ms(refund.last_attempt_at);
    if (Number.isFinite(lastAttempt) && t - lastAttempt < STALE_CLAIM_MS) continue;
    result.checked += 1;

    const orderId = String(row.id);
    const baseMeta: Row = { ...meta };
    delete baseMeta.refund;
    const order = {
      id: orderId,
      userId: String(row.user_id ?? ""),
      amountCents: Number(row.amount_aud ?? 0),
      creditsUsed: Number(row.credits_used ?? 0),
      paymentIntentId: typeof row.stripe_payment_intent_id === "string" ? row.stripe_payment_intent_id : "",
      baseMeta,
      refund,
    };

    if (t - claimedAt > GIVE_UP_MS) {
      await db
        .from("report_orders")
        .update({ metadata: { ...baseMeta, refund: { ...refund, state: "needs_operator", last_error: `gave_up: ${String(refund.last_error ?? "claim never completed")}`.slice(0, 500) } } })
        .eq("id", orderId)
        .eq("status", "REFUNDED");
      result.operator.push(orderId);
      continue;
    }

    if (order.amountCents > 0 && stripe === undefined) stripe = getStripe() as RefundCapableStripe | null;
    const outcome = await completeClaimedRefund(db, stripe ?? null, order, now);
    if (outcome.ok) {
      result.completed.push(orderId);
      console.warn("[blockid:report-refund-reconcile] stale refund claim completed", { orderId, path: outcome.path, refundId: outcome.refundId });
      continue;
    }
    if (outcome.disposition === "operator") {
      result.operator.push(orderId);
    } else if (outcome.disposition === "released") {
      result.released.push(orderId);
    } else {
      result.kept.push(orderId);
    }
    console.error("[blockid:report-refund-reconcile] stale refund claim not completed", { orderId, reason: outcome.reason, disposition: outcome.disposition });
  }

  // One alert for every needs_operator claim not yet reported (this pass's
  // and any whose earlier alert was not delivered); stamped once delivered.
  const { data: opRows, error: opErr } = await db
    .from("report_orders")
    .select("id, user_id, credits_used, amount_aud, metadata")
    .eq("status", "REFUNDED")
    .eq("metadata->refund->>state", "needs_operator")
    .is("metadata->refund->>operator_alerted_at", null)
    .limit(BATCH);
  if (opErr) {
    console.error("[blockid:report-refund-reconcile] needs_operator query failed", msg(opErr));
    return result;
  }
  const pending = ((opRows as Row[] | null) ?? []).filter((r) => {
    const refund = (r.metadata as Row | null)?.refund as Row | undefined;
    return refund && refund.state === "needs_operator" && !refund.operator_alerted_at;
  });
  if (pending.length === 0) return result;

  const lines = pending.map((r) => {
    const refund = (r.metadata as Row).refund as Row;
    const money = Number(r.amount_aud ?? 0) > 0 ? `A$${(Number(r.amount_aud) / 100).toFixed(2)} Stripe` : `${Number(r.credits_used ?? 0)} credits`;
    return `${String(r.id)} — ${money}, user ${String(r.user_id ?? "?")}: ${String(refund.last_error ?? "unknown")}`;
  });
  const text = [
    `[P1] report refund needs an operator: ${pending.length} order(s)`,
    "The refund was claimed but its outcome cannot be proven automatically. Check Stripe / credit_balances, then set metadata.refund.state = 'done' (or refund by hand).",
    ...lines.slice(0, 20),
  ].join("\n");
  result.alerted = await sendAlert(deps, text);
  if (!result.alerted) return result;

  const alertedAt = now().toISOString();
  for (const r of pending) {
    const meta = r.metadata as Row;
    const { error: stampErr } = await db
      .from("report_orders")
      .update({ metadata: { ...meta, refund: { ...(meta.refund as Row), operator_alerted_at: alertedAt } } })
      .eq("id", String(r.id))
      .eq("status", "REFUNDED")
      .eq("metadata->refund->>state", "needs_operator");
    if (stampErr) console.error("[blockid:report-refund-reconcile] operator_alerted_at stamp failed", { orderId: r.id, error: msg(stampErr) });
  }
  return result;
}

export interface UnrefundedResult {
  found: string[];
  alerted: boolean;
}

/** Paid FAILED orders (last 7 days) with money behind them and no refund → one ops alert. */
export async function alertUnrefundedFailedOrders(deps: ReconcileDeps = {}): Promise<UnrefundedResult> {
  const out: UnrefundedResult = { found: [], alerted: false };
  const db = resolveDb(deps);
  if (!db) return out;
  const now = deps.now ?? (() => new Date());
  const since = now().getTime() - UNREFUNDED_LOOKBACK_MS;

  const { data, error } = await db
    .from("report_orders")
    .select("id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, paid_at, failure_reason, metadata")
    .eq("status", "FAILED")
    .gte("paid_at", new Date(since).toISOString())
    .limit(200);
  if (error) {
    console.error("[blockid:report-refund-reconcile] unrefunded query failed", msg(error));
    return out;
  }

  const rows = ((data as Row[] | null) ?? []).filter((r) => {
    const paid = ms(r.paid_at);
    if (!Number.isFinite(paid) || paid < since) return false;
    const money = Number(r.amount_aud ?? 0) > 0 || Number(r.credits_used ?? 0) > 0;
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Row) : {};
    return money && !meta.refund && !meta.refund_alert;
  });
  if (rows.length === 0) return out;
  out.found = rows.map((r) => String(r.id));

  const lines = rows.slice(0, 20).map((r) => {
    const money = Number(r.amount_aud ?? 0) > 0 ? `A$${(Number(r.amount_aud) / 100).toFixed(2)}` : `${Number(r.credits_used)} credits`;
    return `${String(r.id)} — ${money}, failed: ${String(r.failure_reason ?? "unknown").slice(0, 120)}`;
  });
  const text = [
    `[P1] report orders failed without a refund: ${rows.length} paid order(s) in the last 7 days`,
    "No automatic refund is attempted for these. Refund via /admin or Stripe, then record it in metadata.refund.",
    ...lines,
    ...(rows.length > 20 ? [`… and ${rows.length - 20} more`] : []),
  ].join("\n");
  out.alerted = await sendAlert(deps, text);
  if (!out.alerted) return out; // not delivered → report again next tick

  // Stamp each order so it is reported once.
  const stampedAt = now().toISOString();
  for (const r of rows) {
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Row) : {};
    const { error: stampErr } = await db
      .from("report_orders")
      .update({ metadata: { ...meta, refund_alert: { alerted_at: stampedAt } } })
      .eq("id", String(r.id))
      .eq("status", "FAILED");
    if (stampErr) console.error("[blockid:report-refund-reconcile] refund_alert stamp failed", { orderId: r.id, error: msg(stampErr) });
  }
  return out;
}

async function sendAlert(deps: ReconcileDeps, text: string): Promise<boolean> {
  console.error(`[blockid:report-refund-reconcile] ${text.split("\n")[0]}`);
  if (!deps.alert) return false;
  try {
    return await deps.alert(text);
  } catch (err) {
    console.error("[blockid:report-refund-reconcile] alert failed", msg(err));
    return false;
  }
}
