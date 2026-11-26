/**
 * report-refund.test.ts — §8.8 money-back on a failed Trust Report.
 *
 * Colocated with report-refund.ts. Covers both payment paths plus the
 * guards that stop a refund happening twice or from an illegal state:
 *
 *   1. Stripe path  — amount_aud > 0 → stripe.refunds.create against the
 *      stored payment intent, order → REFUNDED.
 *   2. Credit path  — credits_used > 0 → credit_balances restored with a
 *      compare-and-set (a concurrent debit survives, G36), order →
 *      REFUNDED, Stripe never touched.
 *   3. Idempotency  — an already-REFUNDED row is a no-op.
 *   4. Illegal state — READY cannot be refunded through this path.
 *   5. Stripe failure leaves the order FAILED (claim released).
 *   6. G36 claim first — the order moves to REFUNDED with a guarded update
 *      before any money moves: concurrent attempts refund once, a failed
 *      write after the refund cannot cause a second refund on retry.
 *
 * Both Supabase and Stripe are hand-rolled doubles injected through
 * `RefundDeps`, so the test never touches a database, a network, or the
 * live keys in web/.env.
 */

import { describe, it, expect, vi } from "vitest";
import {
  refundFailedOrder,
  type RefundSupabase,
  type RefundSelectBuilder,
  type RefundUpdateBuilder,
  type RefundCapableStripe,
} from "./report-refund";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";

// ─────────────────────────────────────────────────────────────────────────────
// Doubles
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface UpdateCall {
  table: string;
  patch: Row;
  filters: Array<{ col: string; val: unknown }>;
}

interface FakeDbOptions {
  /** Seed rows keyed by table name; only the first row is ever read. */
  rows: Record<string, Row | null>;
  /** Force an error on updates to a given table. */
  updateErrors?: Record<string, { message: string }>;
}

class FakeSelect implements RefundSelectBuilder {
  constructor(private readonly row: Row | null) {}
  eq(): RefundSelectBuilder {
    return this;
  }
  async maybeSingle(): Promise<{ data: Row | null; error: unknown }> {
    return { data: this.row, error: null };
  }
}

class FakeUpdate implements RefundUpdateBuilder {
  constructor(
    private readonly call: UpdateCall,
    private readonly error: { message?: string } | null,
  ) {}

  eq(col: string, val: unknown): RefundUpdateBuilder {
    this.call.filters.push({ col, val });
    return this;
  }

  /** RETURNING — this stateless double always "matches" the one seeded row. */
  select(): PromiseLike<{ data: unknown; error: { message?: string } | null }> {
    return Promise.resolve(
      this.error ? { data: null, error: this.error } : { data: [{ id: "row" }], error: null },
    );
  }

  then<T1 = { error: { message?: string } | null }, T2 = never>(
    onfulfilled?:
      | ((value: { error: { message?: string } | null }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ error: this.error }).then(onfulfilled, onrejected);
  }
}

class FakeDb {
  readonly updates: UpdateCall[] = [];

  constructor(private readonly opts: FakeDbOptions) {}

  client(): RefundSupabase {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- nested object-literal methods are invoked on the returned client, so the fake DB instance must be captured
    const db = this;
    return {
      from(table: string) {
        return {
          select(_cols: string): RefundSelectBuilder {
            return new FakeSelect(db.opts.rows[table] ?? null);
          },
          update(patch: Row): RefundUpdateBuilder {
            const call: UpdateCall = { table, patch, filters: [] };
            db.updates.push(call);
            return new FakeUpdate(
              call,
              db.opts.updateErrors?.[table] ?? null,
            );
          },
          insert(): PromiseLike<{ error: { message?: string } | null }> {
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  updatesFor(table: string): UpdateCall[] {
    return this.updates.filter((u) => u.table === table);
  }
}

type StripeRefundCreate = RefundCapableStripe["refunds"]["create"];

function makeStripe(create: StripeRefundCreate): RefundCapableStripe {
  return { refunds: { create } };
}

/** A Stripe double whose `refunds.create` is a spy — used by the tests
 *  that must prove Stripe is NEVER called on the credit path. */
function makeStripeSpy(): {
  stripe: RefundCapableStripe;
  create: ReturnType<typeof vi.fn<StripeRefundCreate>>;
} {
  const create = vi.fn<StripeRefundCreate>();
  return { stripe: makeStripe(create), create };
}

/** Shape of a stripe-node error (type = class name, statusCode, code). */
function stripeError(type: string, statusCode: number | undefined, message: string, code?: string): Error {
  return Object.assign(new Error(message), { type, statusCode, code });
}

const FIXED_NOW = new Date("2026-07-31T02:00:00.000Z");
const now = () => FIXED_NOW;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stripe path
// ─────────────────────────────────────────────────────────────────────────────

describe("refundFailedOrder — Stripe path", () => {
  it("refunds the payment intent and moves the order to REFUNDED", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-1",
          user_id: "user-1",
          status: "FAILED",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_123",
          metadata: { sku: "sku_trust_report_5aud" },
        },
      },
    });

    const { stripe, create } = makeStripeSpy();
    create.mockResolvedValue({ id: "re_test_1", status: "succeeded" });

    const outcome = await refundFailedOrder(
      { orderId: "order-1", reason: "orchestration_failed: AI timeout" },
      { supabase: db.client(), stripe, now },
    );

    expect(outcome).toEqual({
      ok: true,
      path: "stripe",
      refundId: "re_test_1",
    });

    // Stripe called against the stored payment intent — full refund, no
    // amount override (the whole A$3 goes back).
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0];
    expect(params?.payment_intent).toBe("pi_test_123");
    expect(params).not.toHaveProperty("amount");

    // G36: a repeat of the Stripe call is deduped by Stripe too.
    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: "report-order-refund:order-1" });

    // Claim first: the order moves FAILED → REFUNDED (guarded on the status
    // read) BEFORE Stripe is called, with the failure recorded.
    const orderUpdates = db.updatesFor("report_orders");
    expect(orderUpdates).toHaveLength(2);
    expect(orderUpdates[0]?.patch.status).toBe("REFUNDED");
    expect(orderUpdates[0]?.patch.failure_reason).toBe(
      "orchestration_failed: AI timeout",
    );
    expect(orderUpdates[0]?.filters).toEqual([
      { col: "id", val: "order-1" },
      { col: "status", val: "FAILED" },
    ]);

    // Then the refund trail lands, preserved alongside the original metadata.
    expect(orderUpdates[1]?.patch).not.toHaveProperty("status");
    expect(orderUpdates[1]?.filters).toEqual([
      { col: "id", val: "order-1" },
      { col: "status", val: "REFUNDED" },
      { col: "metadata->refund->>state", val: "claimed" },
    ]);
    const meta = orderUpdates[1]?.patch.metadata as Row;
    expect(meta.sku).toBe("sku_trust_report_5aud");
    const refundMeta = meta.refund as Row;
    expect(refundMeta.stripe_refund_id).toBe("re_test_1");
    expect(refundMeta.refunded_at).toBe(FIXED_NOW.toISOString());
    expect(refundMeta.state).toBe("done");

    // Credit balance untouched on the Stripe path.
    expect(db.updatesFor("credit_balances")).toHaveLength(0);
  });

  it("leaves the order FAILED when Stripe definitely rejects the refund (4xx invalid request)", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-1",
          user_id: "user-1",
          status: "FAILED",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_123",
          metadata: {},
        },
      },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-1", reason: "boom" },
      {
        supabase: db.client(),
        stripe: makeStripe(() =>
          Promise.reject(stripeError("StripeInvalidRequestError", 400, "No such payment_intent: 'pi_test_123'")),
        ),
        now,
      },
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "stripe_refund_failed: No such payment_intent: 'pi_test_123'",
    });
    // Critically: the claim is released. A REFUNDED row with no refund
    // behind it would be exactly the lie this module exists to prevent.
    const orderUpdates = db.updatesFor("report_orders");
    expect(orderUpdates).toHaveLength(2);
    expect(orderUpdates[0]?.patch.status).toBe("REFUNDED");
    expect(orderUpdates[1]?.patch).toMatchObject({ status: "FAILED", metadata: {} });
    expect(orderUpdates[1]?.filters).toEqual([
      { col: "id", val: "order-1" },
      { col: "status", val: "REFUNDED" },
    ]);
  });

  it("refuses when the paid order has no payment intent stored", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-1",
          user_id: "user-1",
          status: "FAILED",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: null,
          metadata: {},
        },
      },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-1", reason: "boom" },
      { supabase: db.client(), stripe: null, now },
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "missing_stripe_payment_intent",
    });
    expect(db.updatesFor("report_orders")).toHaveLength(0);
  });

  it("refuses when Stripe is not configured", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-1",
          user_id: "user-1",
          status: "FAILED",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_123",
          metadata: {},
        },
      },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-1", reason: "boom" },
      { supabase: db.client(), stripe: null, now },
    );

    expect(outcome).toEqual({ ok: false, reason: "stripe_not_configured" });
    expect(db.updatesFor("report_orders")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Credit path
// ─────────────────────────────────────────────────────────────────────────────

describe("refundFailedOrder — credit path", () => {
  // In-memory PostgREST double: the reversal is a compare-and-set
  // (update … eq(balance, read) … select), so the test needs real row state.
  function creditDb(balanceRow: Row | null, order: Row, opts: { failing?: string[] } = {}) {
    return new PaygFakeDb(
      {
        report_orders: [order],
        credit_balances: balanceRow ? [{ user_id: order.user_id, ...balanceRow }] : [],
      },
      { unique: { credit_balances: [["user_id"]] }, failing: opts.failing },
    );
  }
  const failedCreditOrder = (id: string, user: string, credits: number, metadata: Row = {}): Row => ({
    id,
    user_id: user,
    status: "FAILED",
    amount_aud: 0,
    credits_used: credits,
    stripe_payment_intent_id: null,
    metadata,
  });
  const orderPatches = (db: PaygFakeDb) =>
    db.log.filter((l) => l.table === "report_orders" && l.kind === "update").map((l) => l.patch as Row);

  it("reverses the debit onto credit_balances and moves to REFUNDED", async () => {
    const db = creditDb(
      { balance: 40, lifetime_spent: 260 },
      failedCreditOrder("order-2", "user-2", 200, { payment_path: "credits" }),
    );

    const { stripe, create } = makeStripeSpy();

    const outcome = await refundFailedOrder(
      { orderId: "order-2", reason: "no_svi_analysis_for_business" },
      { supabase: db as unknown as RefundSupabase, stripe, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });

    // Stripe must never be touched for a credit order.
    expect(create).not.toHaveBeenCalled();

    // Mirrors /api/reports/redeem's compensating write: balance back up,
    // lifetime_spent back down.
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 240, lifetime_spent: 60 });

    const orders = orderPatches(db);
    expect(orders).toHaveLength(3); // claim, crediting, done
    expect(db.rows("credit_transactions")).toEqual([
      expect.objectContaining({ user_id: "user-2", amount: 200, balance_after: 240, reason: "refund_report_order", metadata: { report_order_id: "order-2" } }),
    ]);
    expect(orders[0]?.status).toBe("REFUNDED");
    const final = db.row("report_orders", "order-2")!;
    expect(final.status).toBe("REFUNDED");
    expect((final.metadata as Row).payment_path).toBe("credits");
    const refundMeta = (final.metadata as Row).refund as Row;
    expect(refundMeta.credits_reversed).toBe(200);
    expect(refundMeta.credit_balance_after).toBe(240);
  });

  it("G36: a debit landing between the balance read and the write is not erased", async () => {
    const db = creditDb({ balance: 40, lifetime_spent: 260 }, failedCreditOrder("order-6", "user-6", 200));
    // A concurrent spend_credits_atomic debit of 30 after the refund read the
    // balance. The old read → update(balance: 40 + 200) wrote 240 and the
    // 30-credit debit vanished.
    let fired = false;
    const racing = {
      from(table: string) {
        const t = db.from(table);
        return {
          ...t,
          select: (cols: string) => {
            const q = t.select(cols);
            const orig = q.maybeSingle.bind(q);
            q.maybeSingle = async () => {
              const r = await orig();
              if (table === "credit_balances" && !fired) {
                fired = true;
                db.rows("credit_balances")[0]!.balance = 10;
              }
              return r;
            };
            return q;
          },
        };
      },
    };

    const outcome = await refundFailedOrder(
      { orderId: "order-6", reason: "boom" },
      { supabase: racing as unknown as RefundSupabase, stripe: null, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(210);
    const refundMeta = (db.row("report_orders", "order-6")?.metadata as Row).refund as Row;
    expect(refundMeta.credit_balance_after).toBe(210);
  });

  it("floors lifetime_spent at zero rather than going negative", async () => {
    const db = creditDb({ balance: 0, lifetime_spent: 50 }, failedCreditOrder("order-3", "user-3", 200));

    const outcome = await refundFailedOrder(
      { orderId: "order-3", reason: "boom" },
      { supabase: db as unknown as RefundSupabase, stripe: null, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 200, lifetime_spent: 0 });
  });

  it("hands the order back to FAILED when the balance write fails (retryable)", async () => {
    const db = creditDb({ balance: 10, lifetime_spent: 210 }, failedCreditOrder("order-4", "user-4", 200, { sku: "x" }), {
      failing: ["credit_balances"],
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-4", reason: "boom" },
      { supabase: db as unknown as RefundSupabase, stripe: null, now },
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "credit_reversal_failed: credit_balances unavailable",
    });
    // Claimed, then released: the row ends exactly as it started.
    expect(db.row("report_orders", "order-4")).toMatchObject({ status: "FAILED", metadata: { sku: "x" } });
    expect((db.row("report_orders", "order-4")?.metadata as Row).refund).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2b. G36 — claim first: one refund per order, even on retry / concurrency
// ─────────────────────────────────────────────────────────────────────────────

describe("refundFailedOrder — claim first (G36)", () => {
  const seedCredit = () =>
    new PaygFakeDb(
      {
        report_orders: [
          { id: "order-r", user_id: "user-r", status: "FAILED", amount_aud: 0, credits_used: 200, stripe_payment_intent_id: null, failure_reason: null, metadata: {} },
        ],
        credit_balances: [{ user_id: "user-r", balance: 40, lifetime_spent: 260 }],
      },
      { unique: { credit_balances: [["user_id"]] } },
    );

  /**
   * Make one report_orders update fail like a dropped connection: the first
   * one ("first"), or the first one after the credit balance was written
   * ("after_money" — the write that recorded the refund in the old code).
   */
  function failOrderUpdate(db: PaygFakeDb, which: "first" | "after_money") {
    let moneyMoved = false;
    let failed = false;
    return {
      from(table: string) {
        const t = db.from(table);
        if (table === "credit_balances") {
          return { ...t, update: (patch: Row) => ((moneyMoved = true), t.update(patch)) };
        }
        if (table !== "report_orders") return t;
        return {
          ...t,
          update: (patch: Row) => {
            if (failed || (which === "after_money" && !moneyMoved)) return t.update(patch);
            failed = true;
            const err = { error: { message: "connection reset" } };
            const failing = {
              eq: () => failing,
              select: () => Promise.resolve({ data: null, ...err }),
              then: (ok: (v: typeof err) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(err).then(ok, ko),
            };
            return failing;
          },
        };
      },
    } as unknown as RefundSupabase;
  }

  it("two concurrent refunds of the same order credit the user once", async () => {
    // Old code: both attempts read status=FAILED, both reversed +200.
    const db = seedCredit();
    const deps = { supabase: db as unknown as RefundSupabase, stripe: null, now };
    const [a, b] = await Promise.all([
      refundFailedOrder({ orderId: "order-r", reason: "boom" }, deps),
      refundFailedOrder({ orderId: "order-r", reason: "boom" }, deps),
    ]);
    expect([a, b]).toEqual(expect.arrayContaining([{ ok: true, path: "credits" }, { ok: true, path: "already_refunded" }]));
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 240, lifetime_spent: 60 });
    expect(db.row("report_orders", "order-r")?.status).toBe("REFUNDED");
  });

  it("a failed write after the credits moved does not refund again on retry", async () => {
    // Old code: credits reversed, then the status write failed → order stayed
    // FAILED → the drain retry reversed another +200.
    const db = seedCredit();
    const first = await refundFailedOrder(
      { orderId: "order-r", reason: "boom" },
      { supabase: failOrderUpdate(db, "after_money"), stripe: null, now },
    );
    expect(first).toEqual({ ok: true, path: "credits" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
    expect(db.row("report_orders", "order-r")?.status).toBe("REFUNDED");

    const retry = await refundFailedOrder(
      { orderId: "order-r", reason: "boom" },
      { supabase: db as unknown as RefundSupabase, stripe: null, now },
    );
    expect(retry).toEqual({ ok: true, path: "already_refunded" });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 240, lifetime_spent: 60 });
  });

  it("a failed claim moves no money and leaves the order retryable", async () => {
    const db = seedCredit();
    const first = await refundFailedOrder(
      { orderId: "order-r", reason: "boom" },
      { supabase: failOrderUpdate(db, "first"), stripe: null, now },
    );
    expect(first).toEqual({ ok: false, reason: "refund_claim_failed: connection reset" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(40);
    expect(db.row("report_orders", "order-r")?.status).toBe("FAILED");

    const retry = await refundFailedOrder(
      { orderId: "order-r", reason: "boom" },
      { supabase: db as unknown as RefundSupabase, stripe: null, now },
    );
    expect(retry).toEqual({ ok: true, path: "credits" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
  });

  it("two concurrent Stripe refunds call Stripe once", async () => {
    const db = new PaygFakeDb({
      report_orders: [
        { id: "order-s", user_id: "user-s", status: "FAILED", amount_aud: 4900, credits_used: 0, stripe_payment_intent_id: "pi_s", failure_reason: null, metadata: {} },
      ],
    });
    const { stripe, create } = makeStripeSpy();
    create.mockResolvedValue({ id: "re_s", status: "succeeded" });
    const deps = { supabase: db as unknown as RefundSupabase, stripe, now };
    const [a, b] = await Promise.all([
      refundFailedOrder({ orderId: "order-s", reason: "boom" }, deps),
      refundFailedOrder({ orderId: "order-s", reason: "boom" }, deps),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual(
      expect.arrayContaining([{ ok: true, path: "stripe", refundId: "re_s" }, { ok: true, path: "already_refunded" }]),
    );
    expect(((db.row("report_orders", "order-s")?.metadata as Row).refund as Row).stripe_refund_id).toBe("re_s");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Guards
// ─────────────────────────────────────────────────────────────────────────────

describe("refundFailedOrder — guards", () => {
  it("is idempotent for an already-REFUNDED order", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-5",
          user_id: "user-5",
          status: "REFUNDED",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_123",
          metadata: {},
        },
      },
    });

    const { stripe, create } = makeStripeSpy();
    const outcome = await refundFailedOrder(
      { orderId: "order-5", reason: "boom" },
      { supabase: db.client(), stripe, now },
    );

    expect(outcome).toEqual({ ok: true, path: "already_refunded" });
    expect(create).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("refuses to refund a READY order (illegal transition)", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-6",
          user_id: "user-6",
          status: "READY",
          amount_aud: 550,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_123",
          metadata: {},
        },
      },
    });

    const { stripe, create } = makeStripeSpy();
    const outcome = await refundFailedOrder(
      { orderId: "order-6", reason: "boom" },
      { supabase: db.client(), stripe, now },
    );

    expect(outcome).toEqual({ ok: false, reason: "illegal_refund_from_READY" });
    expect(create).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("refuses to auto-refund an IN_REVIEW (Verified) order — that is the charge.refunded path", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-6b",
          user_id: "user-6",
          status: "IN_REVIEW",
          amount_aud: 14900,
          credits_used: 0,
          stripe_payment_intent_id: "pi_test_456",
          metadata: {},
        },
      },
    });
    const { stripe, create } = makeStripeSpy();
    const outcome = await refundFailedOrder({ orderId: "order-6b", reason: "boom" }, { supabase: db.client(), stripe, now });
    expect(outcome).toEqual({ ok: false, reason: "illegal_refund_from_IN_REVIEW" });
    expect(create).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it("allows a PAID order to be refunded (support-side, pre-generation)", async () => {
    const db = new PaygFakeDb({
      report_orders: [
        {
          id: "order-7",
          user_id: "user-7",
          status: "PAID",
          amount_aud: 0,
          credits_used: 200,
          stripe_payment_intent_id: null,
          metadata: {},
        },
      ],
      credit_balances: [{ user_id: "user-7", balance: 0, lifetime_spent: 200 }],
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-7", reason: "support_refund" },
      { supabase: db as unknown as RefundSupabase, stripe: null, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });
    expect(db.row("report_orders", "order-7")?.status).toBe("REFUNDED");
    expect(db.rows("credit_balances")[0]?.balance).toBe(200);
  });

  it("returns order_not_found when the row is missing", async () => {
    const db = new FakeDb({ rows: {} });
    const outcome = await refundFailedOrder(
      { orderId: "nope", reason: "boom" },
      { supabase: db.client(), stripe: null, now },
    );
    expect(outcome).toEqual({ ok: false, reason: "order_not_found" });
  });

  it("returns supabase_not_configured when there is no client", async () => {
    const outcome = await refundFailedOrder(
      { orderId: "order-1", reason: "boom" },
      { supabase: null, stripe: null, now },
    );
    expect(outcome).toEqual({ ok: false, reason: "supabase_not_configured" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. G36 review — ambiguous outcomes keep the claim (reconcile finishes it)
// ─────────────────────────────────────────────────────────────────────────────

describe("refundFailedOrder — ambiguous outcomes keep the claim", () => {
  const stripeOrder = (): Row => ({
    id: "order-a",
    user_id: "user-a",
    status: "FAILED",
    amount_aud: 4900,
    credits_used: 0,
    stripe_payment_intent_id: "pi_a",
    failure_reason: "orchestration_failed",
    metadata: { sku: "full" },
  });

  it.each([
    ["timeout (StripeConnectionError, no status)", stripeError("StripeConnectionError", undefined, "Request timed out")],
    ["connection reset (plain network error)", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
    ["5xx StripeAPIError", stripeError("StripeAPIError", 500, "An unknown error occurred")],
    ["rate limit 429", stripeError("StripeRateLimitError", 429, "Too many requests")],
  ])("%s → order stays REFUNDED/claimed with last_error, no release", async (_label, err) => {
    const db = new PaygFakeDb({ report_orders: [stripeOrder()] });
    const outcome = await refundFailedOrder(
      { orderId: "order-a", reason: "boom" },
      { supabase: db as unknown as RefundSupabase, stripe: makeStripe(() => Promise.reject(err)), now },
    );
    expect(outcome.ok).toBe(false);
    expect((outcome as { reason: string }).reason).toMatch(/^stripe_refund_unconfirmed: /);
    const row = db.row("report_orders", "order-a")!;
    expect(row.status).toBe("REFUNDED");
    const refund = (row.metadata as Row).refund as Row;
    expect(refund).toMatchObject({ state: "claimed", previous_status: "FAILED", previous_failure_reason: "orchestration_failed" });
    expect(String(refund.last_error)).toContain((err as Error).message);
    expect((row.metadata as Row).sku).toBe("full");
  });

  it("charge_already_refunded → records the existing refund (read-only list) and finishes", async () => {
    const db = new PaygFakeDb({ report_orders: [stripeOrder()] });
    const list = vi.fn(async () => ({ data: [{ id: "re_earlier", status: "succeeded" }] }));
    const stripe: RefundCapableStripe = {
      refunds: {
        create: () => Promise.reject(stripeError("StripeInvalidRequestError", 400, "Charge has already been refunded.", "charge_already_refunded")),
        list,
      },
    };
    const outcome = await refundFailedOrder({ orderId: "order-a", reason: "boom" }, { supabase: db as unknown as RefundSupabase, stripe, now });
    expect(outcome).toEqual({ ok: true, path: "stripe", refundId: "re_earlier" });
    expect(list).toHaveBeenCalledWith({ payment_intent: "pi_a", limit: 10 });
    const refund = (db.row("report_orders", "order-a")?.metadata as Row).refund as Row;
    expect(refund).toMatchObject({ state: "done", stripe_refund_id: "re_earlier" });
  });

  it("a credit write that may have committed stays `crediting` (no release, no second credit)", async () => {
    const db = new PaygFakeDb(
      {
        report_orders: [{ id: "order-c", user_id: "user-c", status: "FAILED", amount_aud: 0, credits_used: 200, stripe_payment_intent_id: null, failure_reason: null, metadata: {} }],
        credit_balances: [{ user_id: "user-c", balance: 40, lifetime_spent: 260 }],
      },
      { unique: { credit_balances: [["user_id"]] } },
    );
    // The CAS update commits but its response is lost.
    const client = {
      from(table: string) {
        const t = db.from(table);
        if (table !== "credit_balances") return t;
        return {
          ...t,
          update: (patch: Row) => {
            const q = t.update(patch);
            const w = {
              eq: (c: string, v: unknown) => (q.eq(c, v), w),
              select: () => {
                void q.select().then(() => undefined);
                return Promise.resolve({ data: null, error: { message: "connection reset" } });
              },
            };
            return w;
          },
        };
      },
    } as unknown as RefundSupabase;

    const outcome = await refundFailedOrder({ orderId: "order-c", reason: "boom" }, { supabase: client, stripe: null, now });
    expect(outcome).toEqual({ ok: false, reason: "credit_reversal_failed: connection reset" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(240); // it DID land
    const row = db.row("report_orders", "order-c")!;
    expect(row.status).toBe("REFUNDED");
    expect(((row.metadata as Row).refund as Row).state).toBe("crediting");

    // Retry: the claim holds → no second credit.
    const retry = await refundFailedOrder({ orderId: "order-c", reason: "boom" }, { supabase: db as unknown as RefundSupabase, stripe: null, now });
    expect(retry).toEqual({ ok: true, path: "already_refunded" });
    expect(db.rows("credit_balances")[0]?.balance).toBe(240);
  });
});
