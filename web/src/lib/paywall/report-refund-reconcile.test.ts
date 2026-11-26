/**
 * report-refund-reconcile.test.ts — G36 review: stale refund claims are
 * finished exactly once, unprovable ones go to an operator once, and paid
 * FAILED orders nobody refunded raise one ops alert (no money moves).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => null }));

import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
import {
  alertUnrefundedFailedOrders,
  reconcileStaleRefundClaims,
  retryReleasedCreditRefunds,
  type ReconcileDb,
} from "./report-refund-reconcile";
import { refundFailedOrder, type RefundSupabase } from "./report-refund";
import { stripeRefundIdempotencyKey, type RefundCapableStripe } from "./report-refund";

type Row = Record<string, unknown>;

const NOW = new Date("2026-11-26T12:00:00.000Z");
const now = () => NOW;
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

function claimedOrder(over: Row & { refund?: Row }): Row {
  const { refund, ...rest } = over;
  return {
    id: "order-1",
    user_id: "user-1",
    status: "REFUNDED",
    amount_aud: 0,
    credits_used: 0,
    stripe_payment_intent_id: null,
    failure_reason: "boom",
    ...rest,
    metadata: {
      sku: "full",
      refund: { state: "claimed", refunded_at: minutesAgo(15), refund_reason: "orchestration_failed: AI timeout", previous_status: "FAILED", previous_failure_reason: "x", ...refund },
    },
  };
}

function makeDb(orders: Row[], extra: Record<string, Row[]> = {}) {
  return new PaygFakeDb(
    { report_orders: orders, credit_balances: [{ user_id: "user-1", balance: 40, lifetime_spent: 260 }], ...extra },
    { unique: { credit_balances: [["user_id"]] } },
  );
}
const asDb = (db: PaygFakeDb) => db as unknown as ReconcileDb;
const refundOf = (db: PaygFakeDb, id = "order-1") => (db.row("report_orders", id)?.metadata as Row).refund as Row;

function stripeSpy(impl?: () => Promise<{ id: string; status?: string | null }>) {
  const create = vi.fn<RefundCapableStripe["refunds"]["create"]>(impl ?? (async () => ({ id: "re_1", status: "succeeded" })));
  const list = vi.fn(async () => ({ data: [{ id: "re_old", status: "succeeded", amount: 4900, metadata: { bid_order_id: "order-1" } }] }));
  return { stripe: { refunds: { create, list } } as RefundCapableStripe, create, list };
}

describe("reconcileStaleRefundClaims — Stripe", () => {
  it("re-sends the SAME refund request (same idempotency key) for a stale claim and marks it done", async () => {
    const db = makeDb([claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1" })]);
    const { stripe, create } = stripeSpy();
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now, alert: vi.fn() });

    expect(res.completed).toEqual(["order-1"]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({
      payment_intent: "pi_1",
      reason: "requested_by_customer",
      metadata: { bid_scope: "report_order", bid_order_id: "order-1" },
    });
    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: stripeRefundIdempotencyKey("order-1") });
    expect(refundOf(db)).toMatchObject({ state: "done", stripe_refund_id: "re_1" });
    expect((db.row("report_orders", "order-1")?.metadata as Row).sku).toBe("full");

    // Exactly once: the next tick finds nothing to do.
    const again = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(again.checked).toBe(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh claim (< 10 min) to the attempt that owns it", async () => {
    const db = makeDb([claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1", refund: { refunded_at: minutesAgo(3) } })]);
    const { stripe, create } = stripeSpy();
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(res.checked).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(refundOf(db).state).toBe("claimed");
  });

  it("charge already refunded → lists the payment intent's refunds and records that id", async () => {
    const db = makeDb([claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1" })]);
    const { stripe, list } = stripeSpy(() =>
      Promise.reject(Object.assign(new Error("Charge has already been refunded."), { type: "StripeInvalidRequestError", statusCode: 400, code: "charge_already_refunded" })),
    );
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(res.completed).toEqual(["order-1"]);
    expect(list).toHaveBeenCalledWith({ payment_intent: "pi_1", limit: 100 });
    expect(refundOf(db)).toMatchObject({ state: "done", stripe_refund_id: "re_old" });
  });

  it("still ambiguous → keeps the claim, records the attempt, and waits 10 min before retrying", async () => {
    const db = makeDb([claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1" })]);
    const { stripe, create } = stripeSpy(() => Promise.reject(Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" })));
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(res.kept).toEqual(["order-1"]);
    expect(refundOf(db)).toMatchObject({ state: "claimed", last_attempt_at: NOW.toISOString() });
    expect(db.row("report_orders", "order-1")?.status).toBe("REFUNDED");

    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("a claim older than 26 h goes to an operator with one alert", async () => {
    const db = makeDb([claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1", refund: { refunded_at: minutesAgo(27 * 60), last_error: "stripe_refund_unconfirmed: 500" } })]);
    const { stripe, create } = stripeSpy();
    const alert = vi.fn(async () => true);
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now, alert });
    expect(create).not.toHaveBeenCalled();
    expect(res.operator).toEqual(["order-1"]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(refundOf(db)).toMatchObject({ state: "needs_operator", operator_alerted_at: NOW.toISOString() });
  });
});

describe("reconcileStaleRefundClaims — credits", () => {
  it("a stale `claimed` credit refund (provably not started) is credited exactly once, even by two concurrent sweeps", async () => {
    const db = makeDb([claimedOrder({ credits_used: 200 })]);
    const [a, b] = await Promise.all([
      reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now }),
      reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now }),
    ]);
    expect([...a.completed, ...b.completed]).toEqual(["order-1"]);
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 240, lifetime_spent: 60 });
    expect(db.rows("credit_transactions")).toHaveLength(1);
    expect(refundOf(db)).toMatchObject({ state: "done", credits_reversed: 200, credit_balance_after: 240 });

    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now });
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
  });

  it("a stale `crediting` claim with its ledger row is marked done without crediting again", async () => {
    const db = makeDb([claimedOrder({ credits_used: 200, refund: { state: "crediting" } })], {
      credit_transactions: [{ id: "tx-1", user_id: "user-1", amount: 200, balance_after: 240, reason: "refund_report_order", metadata: { report_order_id: "order-1" } }],
    });
    db.rows("credit_balances")[0]!.balance = 240; // the credit had landed
    const alert = vi.fn(async () => true);
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(res.completed).toEqual(["order-1"]);
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
    expect(refundOf(db)).toMatchObject({ state: "done", credit_balance_after: 240, credit_ledger_id: "tx-1" });
    expect(alert).not.toHaveBeenCalled();
  });

  it("a stale `crediting` claim without a ledger row is NOT re-credited: needs_operator + one alert, once", async () => {
    const db = makeDb([claimedOrder({ credits_used: 200, refund: { state: "crediting" } })]);
    const alert = vi.fn(async () => true);
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(res.operator).toEqual(["order-1"]);
    expect(db.rows("credit_balances")[0]?.balance).toBe(40);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(String((alert.mock.calls[0] as unknown[])[0])).toMatch(/^\[P1\] report refund needs an operator: 1 order/);
    expect(refundOf(db)).toMatchObject({ state: "needs_operator", operator_alerted_at: NOW.toISOString() });

    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("an undelivered operator alert is retried next tick", async () => {
    const db = makeDb([claimedOrder({ credits_used: 200, refund: { state: "crediting" } })]);
    const alert = vi.fn(async () => false);
    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(refundOf(db).operator_alerted_at).toBeUndefined();
    alert.mockResolvedValue(true);
    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(alert).toHaveBeenCalledTimes(2);
    expect(refundOf(db).operator_alerted_at).toBe(NOW.toISOString());
  });
});

describe("alertUnrefundedFailedOrders", () => {
  const failed = (id: string, over: Row = {}): Row => ({
    id,
    user_id: "u",
    status: "FAILED",
    amount_aud: 0,
    credits_used: 200,
    paid_at: minutesAgo(60),
    failure_reason: "orchestration_failed",
    metadata: {},
    ...over,
  });

  it("raises ONE alert for paid FAILED orders without a refund, stamps them, moves no money", async () => {
    const db = makeDb([
      failed("o-credits"),
      failed("o-stripe", { amount_aud: 4900, credits_used: 0 }),
      failed("o-unpaid", { paid_at: null, amount_aud: 4900, credits_used: 0 }),
      failed("o-old", { paid_at: minutesAgo(8 * 24 * 60) }),
      failed("o-refunded", { metadata: { refund: { state: "done" } } }),
      failed("o-free", { credits_used: 0 }),
      failed("o-alerted", { metadata: { refund_alert: { alerted_at: minutesAgo(30) } } }),
    ]);
    const alert = vi.fn(async () => true);
    const res = await alertUnrefundedFailedOrders({ supabase: asDb(db), now, alert });
    expect(res.found.sort()).toEqual(["o-credits", "o-stripe"]);
    expect(alert).toHaveBeenCalledTimes(1);
    const text = String((alert.mock.calls[0] as unknown[])[0]);
    expect(text).toMatch(/^\[P1\] report orders failed without a refund: 2 paid order/);
    expect(text).toContain("o-stripe — A$49.00");
    expect(text).toContain("o-credits — 200 credits");
    expect(db.rows("credit_balances")[0]?.balance).toBe(40);
    expect(db.row("report_orders", "o-credits")?.status).toBe("FAILED");
    expect((db.row("report_orders", "o-credits")?.metadata as Row).refund_alert).toEqual({ alerted_at: NOW.toISOString() });

    const again = await alertUnrefundedFailedOrders({ supabase: asDb(db), now, alert });
    expect(again.found).toEqual([]);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("does not stamp when the alert was not delivered (reported again next tick)", async () => {
    const db = makeDb([failed("o-credits")]);
    const alert = vi.fn(async () => false);
    await alertUnrefundedFailedOrders({ supabase: asDb(db), now, alert });
    expect((db.row("report_orders", "o-credits")?.metadata as Row).refund_alert).toBeUndefined();
  });

  it("item 2: filters run in the query — 250 already-handled rows do not hide the one that needs an alert; newest first", async () => {
    const handled = Array.from({ length: 250 }, (_, i) =>
      failed(`o-handled-${i}`, { created_at: minutesAgo(i), metadata: { refund_alert: { alerted_at: minutesAgo(1) } } }),
    );
    const db = makeDb([
      ...handled,
      failed("o-old-created", { created_at: minutesAgo(5000) }),
      failed("o-new-created", { created_at: minutesAgo(10) }),
    ]);
    const alert = vi.fn(async () => true);
    const res = await alertUnrefundedFailedOrders({ supabase: asDb(db), now, alert });
    expect(res.found).toEqual(["o-new-created", "o-old-created"]);
  });

  it("item 3: a pending (not exhausted) refund retry is not alerted; an exhausted one is", async () => {
    const db = makeDb([
      failed("o-pending", { metadata: { refund_retry: { reason: "contention", at: minutesAgo(5), attempts: 2, exhausted: false } } }),
      failed("o-exhausted", { metadata: { refund_retry: { reason: "contention", at: minutesAgo(5), attempts: 5, exhausted: true } } }),
    ]);
    const alert = vi.fn(async () => true);
    const res = await alertUnrefundedFailedOrders({ supabase: asDb(db), now, alert });
    expect(res.found).toEqual(["o-exhausted"]);
    expect(String((alert.mock.calls[0] as unknown[])[0])).toContain("5 refund retries exhausted");
  });
});

describe("G36 round 3 — stale-claim sweep", () => {
  it("item 1: fresh and recently-retried claims cannot fill the batch — a stale claim behind 150 of them is still reached", async () => {
    const fresh = Array.from({ length: 80 }, (_, i) => claimedOrder({ id: `o-fresh-${i}`, credits_used: 200, refund: { refunded_at: minutesAgo(2) } }));
    const tried = Array.from({ length: 70 }, (_, i) =>
      claimedOrder({ id: `o-tried-${i}`, credits_used: 200, refund: { refunded_at: minutesAgo(60), last_attempt_at: minutesAgo(3) } }),
    );
    const db = makeDb([...fresh, ...tried, claimedOrder({ id: "o-stale", credits_used: 200 })]);
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now });
    expect(res.checked).toBe(1);
    expect(res.completed).toEqual(["o-stale"]);
  });

  it("item 1: never-tried claims come first, then the oldest claim", async () => {
    const rows = [
      claimedOrder({ id: "o-tried-old", amount_aud: 100, stripe_payment_intent_id: "pi", refund: { refunded_at: minutesAgo(600), last_attempt_at: minutesAgo(30) } }),
      claimedOrder({ id: "o-new", amount_aud: 100, stripe_payment_intent_id: "pi", refund: { refunded_at: minutesAgo(20) } }),
      claimedOrder({ id: "o-old", amount_aud: 100, stripe_payment_intent_id: "pi", refund: { refunded_at: minutesAgo(90) } }),
    ];
    const db = makeDb(rows);
    const seen: string[] = [];
    const { stripe } = stripeSpy();
    (stripe.refunds.create as ReturnType<typeof vi.fn>).mockImplementation(async (p: { metadata?: Record<string, string> }) => {
      seen.push(String(p.metadata?.bid_order_id));
      return { id: `re_${seen.length}`, status: "succeeded" };
    });
    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe, now });
    expect(seen).toEqual(["o-old", "o-new", "o-tried-old"]);
  });

  it.each([
    ["missing", undefined],
    ["unparseable", "yesterday-ish"],
  ])("item 5: a claim whose refunded_at is %s is routed to an operator with an alert (not skipped forever)", async (_label, value) => {
    const order = claimedOrder({ credits_used: 200 });
    const refund = (order.metadata as Row).refund as Row;
    if (value === undefined) delete refund.refunded_at;
    else refund.refunded_at = value;
    const db = makeDb([order]);
    const alert = vi.fn(async () => true);
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert });
    expect(res.operator).toEqual(["order-1"]);
    expect(refundOf(db)).toMatchObject({ state: "needs_operator" });
    expect(String(refundOf(db).last_error)).toMatch(/^claim_time_missing/);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(db.rows("credit_balances")[0]?.balance).toBe(40);
  });

  it("item 6: the give-up write is guarded on the state read; an error is not counted as operator", async () => {
    const order = claimedOrder({ amount_aud: 4900, stripe_payment_intent_id: "pi_1", refund: { refunded_at: minutesAgo(27 * 60) } });
    const db = makeDb([order]);
    const failingUpdate = {
      from(table: string) {
        const t = db.from(table);
        if (table !== "report_orders") return t;
        return {
          ...t,
          update: () => {
            const w = { eq: () => w, select: () => Promise.resolve({ data: null, error: { message: "timeout" } }) };
            return w;
          },
        };
      },
    } as unknown as ReconcileDb;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await reconcileStaleRefundClaims({ supabase: failingUpdate, stripe: null, now, alert: vi.fn(async () => true) });
    expect(res.operator).toEqual([]);
    expect(res.kept).toEqual(["order-1"]);
    expect(refundOf(db).state).toBe("claimed");

    // Successful path: the update carries the state guard.
    await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now, alert: vi.fn(async () => true) });
    const giveUp = db.log.find((l) => l.table === "report_orders" && l.kind === "update" && (l.patch?.metadata as Row | undefined)?.refund && ((l.patch!.metadata as Row).refund as Row).state === "needs_operator");
    expect(giveUp?.filters).toEqual(expect.arrayContaining([{ op: "eq", col: "metadata->refund->>state", val: "claimed" }]));
  });

  it("item 7: a ledger lookup failure stamps last_error + last_attempt_at (keep), so the 10-min spacing applies", async () => {
    const db = makeDb([claimedOrder({ credits_used: 200, refund: { state: "crediting" } })]);
    const ledgerDown = {
      from(table: string) {
        const t = db.from(table);
        if (table !== "credit_transactions") return t;
        return {
          ...t,
          select: () => {
            const q = { eq: () => q, limit: async () => ({ data: null, error: { message: "ledger unavailable" } }) };
            return q;
          },
        };
      },
    } as unknown as ReconcileDb;
    const res = await reconcileStaleRefundClaims({ supabase: ledgerDown, stripe: null, now });
    expect(res.kept).toEqual(["order-1"]);
    expect(refundOf(db)).toMatchObject({ state: "crediting", last_attempt_at: NOW.toISOString(), last_error: "refund_ledger_lookup_failed: ledger unavailable" });
  });

  it("item 7: two ledger rows still prove the credit landed (no maybeSingle failure)", async () => {
    const tx = (id: string) => ({ id, user_id: "user-1", amount: 200, balance_after: 240, reason: "refund_report_order", metadata: { report_order_id: "order-1" } });
    const db = makeDb([claimedOrder({ credits_used: 200, refund: { state: "crediting" } })], { credit_transactions: [tx("tx-1"), tx("tx-2")] });
    const res = await reconcileStaleRefundClaims({ supabase: asDb(db), stripe: null, now });
    expect(res.completed).toEqual(["order-1"]);
    expect(refundOf(db)).toMatchObject({ state: "done", credit_ledger_id: "tx-1" });
  });
});

describe("G36 round 3 — retryReleasedCreditRefunds", () => {
  const released = (over: Row = {}, retry: Row = {}): Row => ({
    id: "o-retry",
    user_id: "user-1",
    status: "FAILED",
    amount_aud: 0,
    credits_used: 200,
    stripe_payment_intent_id: null,
    failure_reason: "orchestration_failed",
    metadata: { refund_retry: { reason: "credit_reversal_failed: contention", at: minutesAgo(15), attempts: 1, exhausted: false, ...retry } },
    ...over,
  });
  const realRefund = (db: PaygFakeDb) => (input: { orderId: string; reason: string }) =>
    refundFailedOrder(input, { supabase: db as unknown as RefundSupabase, stripe: null, now });

  it("re-runs a released transient credit refund and refunds it once", async () => {
    const db = makeDb([released()]);
    const res = await retryReleasedCreditRefunds({ supabase: asDb(db), now, refund: realRefund(db) });
    expect(res).toEqual({ retried: ["o-retry"], refunded: ["o-retry"], failed: [] });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 240 });
    expect(db.row("report_orders", "o-retry")?.status).toBe("REFUNDED");

    const again = await retryReleasedCreditRefunds({ supabase: asDb(db), now, refund: realRefund(db) });
    expect(again.retried).toEqual([]);
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
  });

  it("respects the spacing (attempts × 10 min) and skips exhausted / Stripe-rejected orders", async () => {
    const db = makeDb([
      released({ id: "o-too-soon" }, { at: minutesAgo(15), attempts: 2 }), // needs 20 min
      released({ id: "o-exhausted" }, { attempts: 5, exhausted: true }),
      released({ id: "o-stripe-rejected", metadata: {} }), // definite Stripe rejection: no marker
    ]);
    const refund = vi.fn();
    const res = await retryReleasedCreditRefunds({ supabase: asDb(db), now, refund });
    expect(res.retried).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
  });
});
