/**
 * report-refund-reconcile.ts — finish refund claims a dead process left
 * behind, retry transient credit-refund failures, and surface FAILED paid
 * orders nobody refunded (G36).
 *
 * refundFailedOrder() claims the order (status → REFUNDED,
 * metadata.refund.state = "claimed") BEFORE moving money. If the process dies
 * after the claim (deploy retires the origin, the 480 s maxDuration, a crash)
 * or Stripe answers ambiguously (timeout / reset / 5xx), every later
 * refundFailedOrder() call returns `already_refunded` — so without this sweep
 * the customer would never get the money back.
 *
 * reconcileStaleRefundClaims() (drain cron, every tick):
 *   * REFUNDED orders whose refund.state is claimed / crediting, whose claim
 *     (refund.refunded_at) is older than STALE_CLAIM_MS (or missing /
 *     unparseable → straight to an operator) and whose last_attempt_at is
 *     empty or older than STALE_CLAIM_MS — filtered and ordered in SQL
 *     (never-tried first, then oldest claim) so skipped rows cannot starve
 *     the batch;
 *   * completeClaimedRefund() does the work: Stripe → the SAME request with
 *     the SAME idempotency key (charge_already_refunded → list the payment
 *     intent's refunds, read-only, accept only when they cover the amount);
 *     credits → re-credited only from `claimed` (provably not started), a
 *     `crediting` claim is done only when the refund ledger row exists,
 *     otherwise it becomes needs_operator;
 *   * a claim older than GIVE_UP_MS (Stripe idempotency keys live 24 h) or a
 *     needs_operator verdict raises ONE ops alert and is never retried.
 *
 * retryReleasedCreditRefunds(): FAILED orders whose credit refund was
 * released on a transient, provably-nothing-moved failure
 * (metadata.refund_retry, not exhausted) are re-run through
 * refundFailedOrder, spaced RETRY_SPACING_MS × attempts apart, at most
 * REFUND_RETRY_MAX_ATTEMPTS times. Stripe rejections never get a marker.
 *
 * alertUnrefundedFailedOrders(): paid FAILED orders from the last 7 days with
 * money behind them, no metadata.refund and no pending retry → one ops
 * alert, each order stamped metadata.refund_alert so it is reported once. No
 * money moves — historical rows may have been handled by hand.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import {
  completeClaimedRefund,
  msg,
  refundFailedOrder,
  REFUND_RETRY_MAX_ATTEMPTS,
  type RefundCapableStripe,
  type RefundOutcome,
  type RefundSupabase,
} from "./report-refund";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message?: string } | null };

interface ListQuery extends PromiseLike<Res> {
  eq(col: string, val: unknown): ListQuery;
  in(col: string, vals: unknown[]): ListQuery;
  is(col: string, val: null): ListQuery;
  not(col: string, op: string, val: unknown): ListQuery;
  gte(col: string, val: unknown): ListQuery;
  or(filters: string): ListQuery;
  order(col: string, opts: { ascending: boolean; nullsFirst?: boolean }): ListQuery;
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
  /** Test hook; defaults to refundFailedOrder. */
  refund?: (input: { orderId: string; reason: string }) => Promise<RefundOutcome>;
}

export const STALE_CLAIM_MS = 10 * 60_000;
/** Past the 24 h Stripe idempotency window (+ margin) an unfinished claim goes to a human. */
export const GIVE_UP_MS = 26 * 60 * 60_000;
export const UNREFUNDED_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
/** Transient credit-refund retries: attempt n waits n × this after the previous one. */
export const RETRY_SPACING_MS = 10 * 60_000;
const BATCH = 100;

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
const asRow = (v: unknown): Row | null => (v && typeof v === "object" ? (v as Row) : null);

const CLAIM_AT = "metadata->refund->>refunded_at";
const LAST_TRY = "metadata->refund->>last_attempt_at";
const STATE = "metadata->refund->>state";

export async function reconcileStaleRefundClaims(deps: ReconcileDeps = {}): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, completed: [], kept: [], released: [], operator: [], alerted: false };
  const db = resolveDb(deps);
  if (!db) return result;
  const now = deps.now ?? (() => new Date());
  const t = now().getTime();
  const cutoff = new Date(t - STALE_CLAIM_MS).toISOString();

  // Staleness in SQL: the claim is old (or its timestamp is missing /
  // not an ISO date — those go to an operator below), and it was never
  // retried or not within the spacing. Never-tried first, then oldest claim.
  const { data, error } = await db
    .from("report_orders")
    .select("id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, metadata")
    .eq("status", "REFUNDED")
    .in(STATE, ["claimed", "crediting"])
    .or(`${CLAIM_AT}.is.null,${CLAIM_AT}.lt."${cutoff}",${CLAIM_AT}.not.like.2*`)
    .or(`${LAST_TRY}.is.null,${LAST_TRY}.lt."${cutoff}"`)
    .order(LAST_TRY, { ascending: true, nullsFirst: true })
    .order(CLAIM_AT, { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[blockid:report-refund-reconcile] stale-claim query failed", msg(error));
    return result;
  }

  let stripe: RefundCapableStripe | null | undefined = deps.stripe;

  for (const row of (data as Row[] | null) ?? []) {
    const meta = asRow(row.metadata) ?? {};
    const refund = asRow(meta.refund);
    if (!refund) continue;
    const state = String(refund.state ?? "");
    const claimedAt = ms(refund.refunded_at);
    const lastAttempt = ms(refund.last_attempt_at);
    // Belt and braces for the SQL filter (a fresh claim belongs to the
    // attempt that is probably still running).
    if (Number.isFinite(claimedAt) && t - claimedAt < STALE_CLAIM_MS) continue;
    if (Number.isFinite(lastAttempt) && t - lastAttempt < STALE_CLAIM_MS) continue;
    result.checked += 1;

    const orderId = String(row.id);
    const baseMeta: Row = { ...meta };
    delete baseMeta.refund;

    // No usable claim time (missing / unparseable) or older than the Stripe
    // idempotency window → a human decides. Guarded on the state we read;
    // counted only when the write matched.
    const giveUp = !Number.isFinite(claimedAt)
      ? `claim_time_missing: refunded_at=${JSON.stringify(refund.refunded_at ?? null)}`
      : t - claimedAt > GIVE_UP_MS
        ? `gave_up: ${String(refund.last_error ?? "claim never completed")}`
        : null;
    if (giveUp) {
      const { data: hit, error: werr } = await db
        .from("report_orders")
        .update({
          metadata: {
            ...baseMeta,
            refund: { ...refund, state: "needs_operator", last_error: giveUp.slice(0, 500), last_attempt_at: now().toISOString() },
          },
        })
        .eq("id", orderId)
        .eq("status", "REFUNDED")
        .eq(STATE, state)
        .select("id");
      if (werr) {
        console.error("[blockid:report-refund-reconcile] needs_operator write failed", { orderId, error: msg(werr) });
        result.kept.push(orderId);
      } else if (Array.isArray(hit) && hit.length > 0) {
        result.operator.push(orderId);
      }
      continue;
    }

    const order = {
      id: orderId,
      userId: String(row.user_id ?? ""),
      amountCents: Number(row.amount_aud ?? 0),
      creditsUsed: Number(row.credits_used ?? 0),
      paymentIntentId: typeof row.stripe_payment_intent_id === "string" ? row.stripe_payment_intent_id : "",
      baseMeta,
      refund,
    };
    if (order.amountCents > 0 && stripe === undefined) stripe = getStripe() as RefundCapableStripe | null;
    const outcome = await completeClaimedRefund(db, stripe ?? null, order, now);
    if (outcome.ok) {
      result.completed.push(orderId);
      console.warn("[blockid:report-refund-reconcile] stale refund claim completed", { orderId, path: outcome.path, refundId: outcome.refundId });
      continue;
    }
    if (outcome.disposition === "operator") result.operator.push(orderId);
    else if (outcome.disposition === "released") result.released.push(orderId);
    else result.kept.push(orderId);
    console.error("[blockid:report-refund-reconcile] stale refund claim not completed", { orderId, reason: outcome.reason, disposition: outcome.disposition });
  }

  // One alert for every needs_operator claim not yet reported (this pass's
  // and any whose earlier alert was not delivered); stamped once delivered.
  const { data: opRows, error: opErr } = await db
    .from("report_orders")
    .select("id, user_id, credits_used, amount_aud, metadata")
    .eq("status", "REFUNDED")
    .eq(STATE, "needs_operator")
    .is("metadata->refund->>operator_alerted_at", null)
    .order(CLAIM_AT, { ascending: true })
    .limit(BATCH);
  if (opErr) {
    console.error("[blockid:report-refund-reconcile] needs_operator query failed", msg(opErr));
    return result;
  }
  const pending = ((opRows as Row[] | null) ?? []).filter((r) => {
    const refund = asRow(asRow(r.metadata)?.refund);
    return refund && refund.state === "needs_operator" && !refund.operator_alerted_at;
  });
  if (pending.length === 0) return result;

  const lines = pending.map((r) => {
    const refund = asRow(asRow(r.metadata)?.refund) ?? {};
    const money = Number(r.amount_aud ?? 0) > 0 ? `A$${(Number(r.amount_aud) / 100).toFixed(2)} Stripe` : `${Number(r.credits_used ?? 0)} credits`;
    return `${String(r.id)} — ${money}, user ${String(r.user_id ?? "?")}: ${String(refund.last_error ?? "unknown")}`;
  });
  const text = [
    `[P1] report refund needs an operator: ${pending.length} order(s)`,
    "The refund was claimed but its outcome cannot be proven automatically. Check Stripe / credit_balances, then set metadata.refund.state = 'done' (or refund by hand).",
    ...lines.slice(0, 20),
    ...(lines.length > 20 ? [`… and ${lines.length - 20} more`] : []),
  ].join("\n");
  result.alerted = await sendAlert(deps, text);
  if (!result.alerted) return result;

  const alertedAt = now().toISOString();
  for (const r of pending) {
    const meta = asRow(r.metadata) ?? {};
    const { error: stampErr } = await db
      .from("report_orders")
      .update({ metadata: { ...meta, refund: { ...(asRow(meta.refund) ?? {}), operator_alerted_at: alertedAt } } })
      .eq("id", String(r.id))
      .eq("status", "REFUNDED")
      .eq(STATE, "needs_operator");
    if (stampErr) console.error("[blockid:report-refund-reconcile] operator_alerted_at stamp failed", { orderId: r.id, error: msg(stampErr) });
  }
  return result;
}

export interface RetryResult {
  retried: string[];
  refunded: string[];
  failed: string[];
}

/**
 * Re-run refundFailedOrder for FAILED orders whose credit refund was released
 * on a transient failure (metadata.refund_retry, not exhausted). The refund
 * itself bumps refund_retry.attempts / exhausted on another release; once
 * exhausted the order falls to alertUnrefundedFailedOrders.
 */
export async function retryReleasedCreditRefunds(deps: ReconcileDeps = {}): Promise<RetryResult> {
  const out: RetryResult = { retried: [], refunded: [], failed: [] };
  const db = resolveDb(deps);
  if (!db) return out;
  const now = deps.now ?? (() => new Date());
  const t = now().getTime();
  const refund = deps.refund ?? ((input: { orderId: string; reason: string }) => refundFailedOrder(input));

  const { data, error } = await db
    .from("report_orders")
    .select("id, status, credits_used, failure_reason, metadata")
    .eq("status", "FAILED")
    .not("metadata->refund_retry", "is", null)
    .is("metadata->refund", null)
    .or("metadata->refund_retry->>exhausted.is.null,metadata->refund_retry->>exhausted.eq.false")
    .order("metadata->refund_retry->>at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[blockid:report-refund-reconcile] refund-retry query failed", msg(error));
    return out;
  }

  for (const r of (data as Row[] | null) ?? []) {
    const retry = asRow(asRow(r.metadata)?.refund_retry);
    if (!retry || retry.exhausted === true || Number(r.credits_used ?? 0) <= 0) continue;
    const attempts = Number(retry.attempts ?? 0);
    if (attempts >= REFUND_RETRY_MAX_ATTEMPTS) continue;
    const at = ms(retry.at);
    if (Number.isFinite(at) && t - at < RETRY_SPACING_MS * Math.max(1, attempts)) continue;

    const orderId = String(r.id);
    out.retried.push(orderId);
    const outcome = await refund({ orderId, reason: String(r.failure_reason ?? "refund_retry") });
    if (outcome.ok) out.refunded.push(orderId);
    else {
      out.failed.push(orderId);
      console.error("[blockid:report-refund-reconcile] credit refund retry failed", { orderId, attempts: attempts + 1, reason: outcome.reason });
    }
  }
  return out;
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

  // Filters in SQL so already-handled rows cannot fill the batch: paid in
  // the window, money behind it, no refund, not yet alerted, and no retry
  // still pending (a retry marker only counts once exhausted).
  const { data, error } = await db
    .from("report_orders")
    .select("id, user_id, status, amount_aud, credits_used, stripe_payment_intent_id, paid_at, failure_reason, metadata")
    .eq("status", "FAILED")
    .gte("paid_at", new Date(since).toISOString())
    .is("metadata->refund", null)
    .is("metadata->refund_alert", null)
    .or("amount_aud.gt.0,credits_used.gt.0")
    .or("metadata->refund_retry.is.null,metadata->refund_retry->>exhausted.eq.true")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[blockid:report-refund-reconcile] unrefunded query failed", msg(error));
    return out;
  }

  const rows = ((data as Row[] | null) ?? []).filter((r) => {
    const paid = ms(r.paid_at);
    if (!Number.isFinite(paid) || paid < since) return false;
    const money = Number(r.amount_aud ?? 0) > 0 || Number(r.credits_used ?? 0) > 0;
    const meta = asRow(r.metadata) ?? {};
    const retry = asRow(meta.refund_retry);
    return money && !meta.refund && !meta.refund_alert && (!retry || retry.exhausted === true);
  });
  if (rows.length === 0) return out;
  out.found = rows.map((r) => String(r.id));

  const lines = rows.slice(0, 20).map((r) => {
    const money = Number(r.amount_aud ?? 0) > 0 ? `A$${(Number(r.amount_aud) / 100).toFixed(2)}` : `${Number(r.credits_used)} credits`;
    const retry = asRow(asRow(r.metadata)?.refund_retry);
    const retried = retry ? `, ${String(retry.attempts)} refund retries exhausted (${String(retry.reason ?? "")})` : "";
    return `${String(r.id)} — ${money}, failed: ${String(r.failure_reason ?? "unknown").slice(0, 120)}${retried}`;
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
    const meta = asRow(r.metadata) ?? {};
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
