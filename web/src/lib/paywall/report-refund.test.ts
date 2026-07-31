/**
 * report-refund.test.ts — §8.8 money-back on a failed Trust Report.
 *
 * Colocated with report-refund.ts. Covers both payment paths plus the
 * guards that stop a refund happening twice or from an illegal state:
 *
 *   1. Stripe path  — amount_aud > 0 → stripe.refunds.create against the
 *      stored payment intent, order → REFUNDED.
 *   2. Credit path  — credits_used > 0 → credit_balances restored, order
 *      → REFUNDED, Stripe never touched.
 *   3. Idempotency  — an already-REFUNDED row is a no-op.
 *   4. Illegal state — READY cannot be refunded through this path.
 *   5. Stripe failure leaves the order FAILED (no silent status flip).
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
    // amount override (the whole A$5.50 goes back).
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0];
    expect(params?.payment_intent).toBe("pi_test_123");
    expect(params).not.toHaveProperty("amount");

    // Order lands on REFUNDED with the failure recorded.
    const orderUpdates = db.updatesFor("report_orders");
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]?.patch.status).toBe("REFUNDED");
    expect(orderUpdates[0]?.patch.failure_reason).toBe(
      "orchestration_failed: AI timeout",
    );
    expect(orderUpdates[0]?.filters).toEqual([{ col: "id", val: "order-1" }]);

    // Refund trail preserved alongside the original metadata.
    const meta = orderUpdates[0]?.patch.metadata as Row;
    expect(meta.sku).toBe("sku_trust_report_5aud");
    const refundMeta = meta.refund as Row;
    expect(refundMeta.stripe_refund_id).toBe("re_test_1");
    expect(refundMeta.refunded_at).toBe(FIXED_NOW.toISOString());

    // Credit balance untouched on the Stripe path.
    expect(db.updatesFor("credit_balances")).toHaveLength(0);
  });

  it("leaves the order FAILED when Stripe rejects the refund", async () => {
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
          Promise.reject(new Error("charge already refunded")),
        ),
        now,
      },
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "stripe_refund_failed: charge already refunded",
    });
    // Critically: no status flip. A REFUNDED row with no refund behind it
    // would be exactly the lie this module exists to prevent.
    expect(db.updatesFor("report_orders")).toHaveLength(0);
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
  it("reverses the debit onto credit_balances and moves to REFUNDED", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-2",
          user_id: "user-2",
          status: "FAILED",
          amount_aud: 0,
          credits_used: 200,
          stripe_payment_intent_id: null,
          metadata: { payment_path: "credits" },
        },
        credit_balances: { balance: 40, lifetime_spent: 260 },
      },
    });

    const { stripe, create } = makeStripeSpy();

    const outcome = await refundFailedOrder(
      { orderId: "order-2", reason: "no_svi_analysis_for_business" },
      { supabase: db.client(), stripe, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });

    // Stripe must never be touched for a credit order.
    expect(create).not.toHaveBeenCalled();

    // Mirrors /api/reports/redeem's compensating write: balance back up,
    // lifetime_spent back down.
    const balanceUpdates = db.updatesFor("credit_balances");
    expect(balanceUpdates).toHaveLength(1);
    expect(balanceUpdates[0]?.patch).toMatchObject({
      balance: 240,
      lifetime_spent: 60,
      updated_at: FIXED_NOW.toISOString(),
    });
    expect(balanceUpdates[0]?.filters).toEqual([
      { col: "user_id", val: "user-2" },
    ]);

    const orderUpdates = db.updatesFor("report_orders");
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]?.patch.status).toBe("REFUNDED");
    const refundMeta = (orderUpdates[0]?.patch.metadata as Row).refund as Row;
    expect(refundMeta.credits_reversed).toBe(200);
    expect(refundMeta.credit_balance_after).toBe(240);
  });

  it("floors lifetime_spent at zero rather than going negative", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-3",
          user_id: "user-3",
          status: "FAILED",
          amount_aud: 0,
          credits_used: 200,
          stripe_payment_intent_id: null,
          metadata: {},
        },
        credit_balances: { balance: 0, lifetime_spent: 50 },
      },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-3", reason: "boom" },
      { supabase: db.client(), stripe: null, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });
    expect(db.updatesFor("credit_balances")[0]?.patch).toMatchObject({
      balance: 200,
      lifetime_spent: 0,
    });
  });

  it("does not flip the order when the balance write fails", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-4",
          user_id: "user-4",
          status: "FAILED",
          amount_aud: 0,
          credits_used: 200,
          stripe_payment_intent_id: null,
          metadata: {},
        },
        credit_balances: { balance: 10, lifetime_spent: 210 },
      },
      updateErrors: { credit_balances: { message: "deadlock detected" } },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-4", reason: "boom" },
      { supabase: db.client(), stripe: null, now },
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "credit_reversal_failed: deadlock detected",
    });
    expect(db.updatesFor("report_orders")).toHaveLength(0);
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

  it("allows a PAID order to be refunded (support-side, pre-generation)", async () => {
    const db = new FakeDb({
      rows: {
        report_orders: {
          id: "order-7",
          user_id: "user-7",
          status: "PAID",
          amount_aud: 0,
          credits_used: 200,
          stripe_payment_intent_id: null,
          metadata: {},
        },
        credit_balances: { balance: 0, lifetime_spent: 200 },
      },
    });

    const outcome = await refundFailedOrder(
      { orderId: "order-7", reason: "support_refund" },
      { supabase: db.client(), stripe: null, now },
    );

    expect(outcome).toEqual({ ok: true, path: "credits" });
    expect(db.updatesFor("report_orders")[0]?.patch.status).toBe("REFUNDED");
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
