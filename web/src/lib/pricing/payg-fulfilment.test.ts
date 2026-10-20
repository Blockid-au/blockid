// G35 Pricing v5 P3 — webhook fulfilment, D28 upgrades, refund (G5) and the
// worker hand-off, against an in-memory PostgREST double.
//
// Pins:
//   - same checkout.session.completed delivered twice → ONE order, ONE queue
//     row, ONE revenue row, ONE payg_paid, and (after the drain) ONE report
//   - Snapshot / Full → READY with delivered_at; Verified → IN_REVIEW with
//     sla_due_at = verifiedSlaDueAt(now, days); payg_tier stored on the report
//   - reconciliation when the checkout insert never landed; metadata.order_id
//     that points at someone else's order is never trusted
//   - upgrades re-project the existing report (no queue row): Snapshot → Full
//     READY, Full → Verified IN_REVIEW + reviewed=false; a foreign base is refused
//   - charge.refunded: READY / IN_REVIEW → REFUNDED, Verified badge removed,
//     refunded upgrade reverts payg_tier; partial refunds / GENERATING untouched

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null, isSupabaseConfigured: () => false }));

import type Stripe from "stripe";
import { PaygFakeDb, PAYG_DEFAULTS, PAYG_UNIQUE } from "./payg-fake-db.fixture";
import {
  applyPaygUpgrade,
  fulfilPaygReportCheckout,
  notifyPaygOrderSettled,
  refundReportOrderForCharge,
  type PaygFulfilDeps,
  type RevenueEventArgs,
} from "./payg-fulfilment";
import { enqueueOrder, processNextQueuedOrder, type MinimalSupabase } from "@/lib/paywall/report-order-worker";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";
import type { PaygSkuId } from "./v5-payg";

const NOW = new Date("2026-10-20T03:00:00.000Z"); // Tue 14:00 Sydney
const USER = "user-1";
const BIZ = "biz-1";

function session(over: Partial<Stripe.Checkout.Session> & { metadata?: Record<string, string> } = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    payment_intent: "pi_1",
    amount_total: 4900,
    currency: "aud",
    customer: "cus_new",
    customer_details: { email: "f@example.com" } as Stripe.Checkout.Session.CustomerDetails,
    customer_email: null,
    ...over,
    metadata: { bid_scope: "report_order", bid_business_id: BIZ, bid_user_id: USER, bid_sku: "report_full", order_id: "order-1", pricing_version: "v5", ...(over.metadata ?? {}) },
  } as unknown as Stripe.Checkout.Session;
}

function harness(db: PaygFakeDb, extra: Partial<PaygFulfilDeps> = {}) {
  const emitted: Array<{ name: string; params: Record<string, unknown> }> = [];
  const mails = { paid: vi.fn(async () => ({})), ready: vi.fn(async () => ({})), inReview: vi.fn(async () => ({})) };
  const audit = vi.fn(async () => ({ ok: true }));
  const recordRevenue = vi.fn(async (a: RevenueEventArgs) => {
    await db.from("revenue_events").insert({ stripe_event_id: a.stripeEventId, kind: a.kind, gross_aud_cents: a.grossCents });
  });
  const deps: PaygFulfilDeps = {
    recordRevenue,
    enqueue: (d, input) => enqueueOrder(d as never, input),
    emit: (e) => emitted.push({ name: e.name, params: e.params }),
    audit,
    email: mails,
    slaBusinessDays: async () => 2,
    now: () => NOW,
    ...extra,
  };
  return { deps, emitted, mails, audit, recordRevenue };
}

function freshDb(rows: Record<string, Array<Record<string, unknown>>> = {}) {
  return new PaygFakeDb(
    {
      report_orders: [],
      report_generation_queue: [],
      assembled_reports: [],
      revenue_events: [],
      app_users: [{ id: USER, email: "f@example.com", stripe_customer_id: null }],
      ...rows,
    },
    { unique: PAYG_UNIQUE, defaults: PAYG_DEFAULTS },
  );
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("fulfilPaygReportCheckout — report tiers", () => {
  let db: PaygFakeDb;
  beforeEach(() => {
    db = freshDb({
      report_orders: [
        { id: "order-1", status: "CHECKOUT_INITIATED", user_id: USER, business_id: BIZ, product_sku: "report_full", tier: "full", stripe_session_id: "cs_test_1", report_id: null },
      ],
    });
  });

  it("same event delivered twice → one order, one queue row, one revenue row, one payg_paid — and one report after the drain", async () => {
    const h = harness(db);
    const first = await fulfilPaygReportCheckout(db as never, session(), { id: "evt_1" }, "report_full", h.deps);
    const second = await fulfilPaygReportCheckout(db as never, session(), { id: "evt_1" }, "report_full", h.deps);
    expect(first).toMatchObject({ ok: true, orderId: "order-1", status: "PAID", duplicate: false });
    expect(second).toMatchObject({ ok: true, orderId: "order-1", duplicate: true });

    expect(db.rows("report_orders")).toHaveLength(1);
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "PAID", stripe_payment_intent_id: "pi_1" });
    expect(db.rows("report_generation_queue")).toHaveLength(1);
    expect(db.rows("revenue_events")).toHaveLength(1);
    expect(db.rows("revenue_events")[0]).toMatchObject({ kind: "report_full", gross_aud_cents: 4900 });
    expect(h.emitted.filter((e) => e.name === "payg_paid")).toHaveLength(1);
    expect(h.emitted[0].params).toMatchObject({ tier: "full", sku: "report_full", paid_via: "card", order_id: "order-1" });
    await flush();
    expect(h.mails.paid).toHaveBeenCalledTimes(1);
    expect(h.mails.paid).toHaveBeenCalledWith(expect.objectContaining({ to: "f@example.com", tier: "full", amountCents: 4900 }));
    // G7: the customer Checkout created is remembered (never overwritten).
    expect(db.row("app_users", USER)?.stripe_customer_id).toBe("cus_new");

    // Drain: the worker generates ONCE.
    const generate = vi.fn(async () => {
      db.rows("assembled_reports").push({ id: "rpt-1", user_id: USER, payg_tier: "full" });
      return { ok: true as const, reportId: "rpt-1", paygTier: "full" as const };
    });
    const settled = vi.fn(async () => {});
    const run1 = await processNextQueuedOrder({ supabase: db as unknown as MinimalSupabase, generateReport: generate, now: () => NOW, onSettled: settled, newClaimToken: () => "tok" });
    const run2 = await processNextQueuedOrder({ supabase: db as unknown as MinimalSupabase, generateReport: generate, now: () => NOW, onSettled: settled });
    expect(run1).toMatchObject({ processed: true, status: "done" });
    expect(run2).toMatchObject({ processed: false });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.rows("assembled_reports")).toHaveLength(1);
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "READY", report_id: "rpt-1", delivered_at: NOW.toISOString() });
    await flush();
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", status: "READY", paygTier: "full", slaDueAt: null }));
  });

  it("Verified: the worker parks the order IN_REVIEW with sla_due_at = 2 Sydney business days", async () => {
    db.row("report_orders", "order-1")!.product_sku = "report_verified";
    const h = harness(db);
    await fulfilPaygReportCheckout(db as never, session({ amount_total: 14900, metadata: { bid_sku: "report_verified" } }), { id: "evt_v" }, "report_verified", h.deps);
    expect(db.rows("revenue_events")[0]).toMatchObject({ kind: "report_verified" });
    const settled = vi.fn(async () => {});
    await processNextQueuedOrder({
      supabase: db as unknown as MinimalSupabase,
      generateReport: async () => ({ ok: true, reportId: "rpt-v", paygTier: "verified" }),
      now: () => NOW,
      verifiedSlaBusinessDays: async () => 2,
      onSettled: settled,
    });
    const due = verifiedSlaDueAt(NOW, 2).toISOString();
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "IN_REVIEW", report_id: "rpt-v", sla_due_at: due });
    expect(db.row("report_orders", "order-1")?.delivered_at).toBeUndefined();
    await flush();
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: "IN_REVIEW", paygTier: "verified" }));
  });

  it("a legacy order (no paygTier) keeps the pre-v5 worker patch and never calls onSettled", async () => {
    db.rows("report_orders").push({ id: "order-legacy", status: "PAID", user_id: USER, business_id: BIZ, product_sku: "sku_trust_report_5aud" });
    db.rows("report_generation_queue").push({ id: "q-legacy", order_id: "order-legacy", business_id: BIZ, status: "queued", retry_count: 0, attempts: 0, enqueued_at: "2026-01-01T00:00:00Z" });
    const settled = vi.fn(async () => {});
    await processNextQueuedOrder({ supabase: db as unknown as MinimalSupabase, generateReport: async () => ({ ok: true, reportId: "rpt-l" }), now: () => NOW, onSettled: settled });
    const o = db.row("report_orders", "order-legacy")!;
    expect(o.status).toBe("READY");
    expect(o).not.toHaveProperty("delivered_at");
    expect(o).not.toHaveProperty("sla_due_at");
    await flush();
    expect(settled).not.toHaveBeenCalled();
  });

  it("reconciles a PAID order from session metadata when the checkout insert never landed", async () => {
    db.tables.report_orders = [];
    const h = harness(db);
    const out = await fulfilPaygReportCheckout(db as never, session({ metadata: { order_id: "" } }), { id: "evt_r" }, "report_full", h.deps);
    expect(out).toMatchObject({ ok: true, status: "PAID", duplicate: false });
    const rows = db.rows("report_orders");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "PAID", product_sku: "report_full", tier: "full", user_id: USER, business_id: BIZ, stripe_session_id: "cs_test_1", expires_at: null });
    expect(db.rows("report_generation_queue")).toHaveLength(1);
  });

  it("never trusts metadata.order_id that points at another user's order", async () => {
    db.tables.report_orders = [{ id: "order-x", status: "CHECKOUT_INITIATED", user_id: "user-2", business_id: BIZ, product_sku: "report_full", stripe_session_id: null }];
    const h = harness(db);
    await fulfilPaygReportCheckout(db as never, session({ metadata: { order_id: "order-x" } }), { id: "evt_x" }, "report_full", h.deps);
    expect(db.row("report_orders", "order-x")?.status).toBe("CHECKOUT_INITIATED");
    expect(db.rows("report_orders").filter((r) => r.user_id === USER && r.status === "PAID")).toHaveLength(1);
  });

  it("finds the order by metadata.order_id when the session id was never stamped", async () => {
    db.row("report_orders", "order-1")!.stripe_session_id = null;
    const h = harness(db);
    const out = await fulfilPaygReportCheckout(db as never, session(), { id: "evt_m" }, "report_full", h.deps);
    expect(out).toMatchObject({ ok: true, orderId: "order-1", duplicate: false });
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "PAID", stripe_session_id: "cs_test_1" });
    expect(db.rows("report_orders")).toHaveLength(1);
  });

  it("refuses a session without identity metadata", async () => {
    const h = harness(db);
    const s = session();
    s.metadata = { bid_scope: "report_order", bid_sku: "report_full" };
    expect(await fulfilPaygReportCheckout(db as never, s, { id: "evt_n" }, "report_full", h.deps)).toEqual({ ok: false, reason: "missing_identity" });
  });
});

describe("fulfilPaygReportCheckout — D28 upgrades (no regeneration)", () => {
  function upgradeDb(baseSku: string, upgradeSku: PaygSkuId, baseOwner = USER) {
    return freshDb({
      report_orders: [
        { id: "base-1", status: "READY", user_id: baseOwner, business_id: BIZ, product_sku: baseSku, report_id: "rpt-base" },
        { id: "up-1", status: "CHECKOUT_INITIATED", user_id: USER, business_id: BIZ, product_sku: upgradeSku, upgrade_of_order_id: "base-1", stripe_session_id: "cs_up" },
      ],
      assembled_reports: [{ id: "rpt-base", user_id: baseOwner, payg_tier: baseSku === "report_snapshot" ? "snapshot" : null, reviewed: false }],
    });
  }

  it("Snapshot → Full: the existing report is lifted to full, the upgrade order lands READY, nothing is enqueued", async () => {
    const db = upgradeDb("report_snapshot", "upgrade_snapshot_full");
    const h = harness(db);
    const out = await fulfilPaygReportCheckout(
      db as never,
      session({ id: "cs_up", amount_total: 3000, metadata: { bid_sku: "upgrade_snapshot_full", order_id: "up-1", bid_upgrade_of_order_id: "base-1" } }),
      { id: "evt_up" },
      "upgrade_snapshot_full",
      h.deps,
    );
    expect(out).toMatchObject({ ok: true, kind: "upgrade", status: "READY" });
    expect(db.row("assembled_reports", "rpt-base")?.payg_tier).toBe("full");
    expect(db.row("report_orders", "up-1")).toMatchObject({ status: "READY", report_id: "rpt-base", delivered_at: NOW.toISOString() });
    expect(db.rows("report_generation_queue")).toHaveLength(0);
    expect(db.rows("revenue_events")[0]).toMatchObject({ kind: "report_upgrade", gross_aud_cents: 3000 });
    expect(h.emitted.map((e) => e.name)).toEqual(["payg_paid", "payg_upgrade"]);
    expect(h.emitted[1].params).toMatchObject({ from_tier: "snapshot", to_tier: "full", upgrade_of_order_id: "base-1" });
    await flush();
    expect(h.mails.ready).toHaveBeenCalledWith(expect.objectContaining({ orderId: "base-1", tier: "full" }));
  });

  it("Full → Verified: report tier verified + reviewed=false, order IN_REVIEW with sla_due_at", async () => {
    const db = upgradeDb("report_full", "upgrade_full_verified");
    const h = harness(db);
    const out = await fulfilPaygReportCheckout(
      db as never,
      session({ id: "cs_up", amount_total: 10000, metadata: { bid_sku: "upgrade_full_verified", order_id: "up-1" } }),
      { id: "evt_up2" },
      "upgrade_full_verified",
      h.deps,
    );
    expect(out).toMatchObject({ ok: true, status: "IN_REVIEW" });
    expect(db.row("assembled_reports", "rpt-base")).toMatchObject({ payg_tier: "verified", reviewed: false });
    expect(db.row("report_orders", "up-1")).toMatchObject({ status: "IN_REVIEW", sla_due_at: verifiedSlaDueAt(NOW, 2).toISOString() });
    await flush();
    expect(h.mails.inReview).toHaveBeenCalledTimes(1);
  });

  it("a legacy A$3 Full order can be lifted to Verified; the order only moves from PAID", async () => {
    const db = upgradeDb("sku_trust_report_5aud", "upgrade_full_verified");
    const ctx = { userId: USER, businessId: BIZ, now: NOW, slaDays: 2 };
    // Not PAID yet → refused (the report lift is idempotent, the order is untouched).
    expect(await applyPaygUpgrade(db as never, db.row("report_orders", "up-1")!, "upgrade_full_verified", ctx)).toEqual({ ok: false, reason: "upgrade_order_not_paid" });
    expect(db.row("report_orders", "up-1")?.status).toBe("CHECKOUT_INITIATED");
    db.row("report_orders", "up-1")!.status = "PAID";
    const r = await applyPaygUpgrade(db as never, db.row("report_orders", "up-1")!, "upgrade_full_verified", ctx);
    expect(r).toMatchObject({ ok: true, status: "IN_REVIEW", baseOrderId: "base-1", reportId: "rpt-base" });
    expect(db.row("assembled_reports", "rpt-base")?.payg_tier).toBe("verified");
  });

  it("refuses to lift another user's report — the order is left PAID for follow-up", async () => {
    const db = upgradeDb("report_snapshot", "upgrade_snapshot_full", "user-2");
    const h = harness(db);
    const out = await fulfilPaygReportCheckout(db as never, session({ id: "cs_up", metadata: { bid_sku: "upgrade_snapshot_full", order_id: "up-1" } }), { id: "evt_bad" }, "upgrade_snapshot_full", h.deps);
    expect(out).toMatchObject({ ok: true, status: "PAID" });
    expect(db.row("assembled_reports", "rpt-base")?.payg_tier).toBe("snapshot");
    expect(h.emitted.map((e) => e.name)).toEqual(["payg_paid"]);
  });

  it("refuses a base of the wrong tier", async () => {
    const db = upgradeDb("report_full", "upgrade_snapshot_full");
    db.row("report_orders", "up-1")!.status = "PAID";
    expect(await applyPaygUpgrade(db as never, db.row("report_orders", "up-1")!, "upgrade_snapshot_full", { userId: USER, businessId: BIZ, now: NOW, slaDays: 2 })).toEqual({
      ok: false,
      reason: "upgrade_base_wrong_tier",
    });
  });
});

describe("refundReportOrderForCharge (G5)", () => {
  const charge = (over: Partial<Stripe.Charge> = {}) =>
    ({ id: "ch_1", payment_intent: "pi_1", refunded: true, amount: 14900, amount_refunded: 14900, ...over }) as Stripe.Charge;

  it("READY Verified → REFUNDED, W4 hook clears the badge + cancels the open review, audit row", async () => {
    const db = freshDb({
      report_orders: [{ id: "o1", status: "READY", user_id: USER, product_sku: "report_verified", report_id: "rpt-1", stripe_payment_intent_id: "pi_1" }],
      assembled_reports: [{ id: "rpt-1", payg_tier: "verified", reviewed: true, reviewed_at: "2026-10-21T00:00:00Z" }],
      report_reviews: [{ id: "rv1", order_id: "o1", status: "in_progress" }],
    });
    const audit = vi.fn(async () => ({}));
    const out = await refundReportOrderForCharge(db as never, charge(), { id: "evt_ref" }, { audit });
    expect(out).toMatchObject({ handled: true, from: "READY", to: "REFUNDED", badgeRemoved: true });
    expect(db.row("report_orders", "o1")?.status).toBe("REFUNDED");
    // The order moved BEFORE the hook ran; the report stays readable at its tier.
    expect(db.row("assembled_reports", "rpt-1")).toMatchObject({ reviewed: false, payg_tier: "verified" });
    expect(db.row("report_reviews", "rv1")?.status).toBe("cancelled");
    await flush();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "report_order.refunded.badge_removed", subjectId: "o1" }));
  });

  it("IN_REVIEW → REFUNDED; a Full report keeps its tier (stays readable)", async () => {
    const db = freshDb({
      report_orders: [
        { id: "o2", status: "IN_REVIEW", user_id: USER, product_sku: "report_verified", report_id: "rpt-2", stripe_payment_intent_id: "pi_2" },
        { id: "o3", status: "READY", user_id: USER, product_sku: "report_full", report_id: "rpt-3", stripe_payment_intent_id: "pi_3" },
      ],
      assembled_reports: [{ id: "rpt-2", payg_tier: "verified", reviewed: false }, { id: "rpt-3", payg_tier: "full", reviewed: false }],
    });
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_2" }), { id: "e2" })).toMatchObject({ to: "REFUNDED" });
    const full = await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_3" }), { id: "e3" });
    expect(full).toMatchObject({ to: "REFUNDED", badgeRemoved: false, tierReverted: false });
    expect(db.row("assembled_reports", "rpt-3")?.payg_tier).toBe("full");
  });

  it("a refunded upgrade drops the report back to the tier it lifted from", async () => {
    const db = freshDb({
      report_orders: [{ id: "up", status: "READY", user_id: USER, product_sku: "upgrade_snapshot_full", report_id: "rpt-b", stripe_payment_intent_id: "pi_u" }],
      assembled_reports: [{ id: "rpt-b", payg_tier: "full", reviewed: false }],
    });
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_u" }), { id: "e4" })).toMatchObject({ tierReverted: true });
    expect(db.row("assembled_reports", "rpt-b")?.payg_tier).toBe("snapshot");
  });

  it("partial refunds, unknown intents, GENERATING and already-REFUNDED orders are left alone", async () => {
    const db = freshDb({
      report_orders: [
        { id: "g", status: "GENERATING", user_id: USER, product_sku: "report_full", stripe_payment_intent_id: "pi_g" },
        { id: "r", status: "REFUNDED", user_id: USER, product_sku: "report_full", stripe_payment_intent_id: "pi_r" },
      ],
    });
    expect(await refundReportOrderForCharge(db as never, charge({ refunded: false }), { id: "e" })).toEqual({ handled: false, reason: "partial_refund" });
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_none" }), { id: "e" })).toEqual({ handled: false, reason: "no_order" });
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_g" }), { id: "e" })).toMatchObject({ handled: true, to: "GENERATING" });
    expect(db.row("report_orders", "g")?.status).toBe("GENERATING");
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_r" }), { id: "e" })).toMatchObject({ handled: true, to: "REFUNDED" });
  });

  it("legacy A$3 orders are closed too (bookkeeping only — no badge / tier change)", async () => {
    const db = freshDb({
      report_orders: [{ id: "l", status: "READY", user_id: USER, product_sku: "sku_trust_report_5aud", report_id: "rpt-l", stripe_payment_intent_id: "pi_l" }],
      assembled_reports: [{ id: "rpt-l", payg_tier: null, reviewed: false }],
    });
    expect(await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_l" }), { id: "e" })).toMatchObject({ to: "REFUNDED", badgeRemoved: false, tierReverted: false });
    expect(db.row("assembled_reports", "rpt-l")).toEqual({ id: "rpt-l", payg_tier: null, reviewed: false });
  });

  it("the Verified hook is called with the order + report after the REFUNDED flip (injectable)", async () => {
    const db = freshDb({
      report_orders: [{ id: "o9", status: "IN_REVIEW", user_id: USER, product_sku: "upgrade_full_verified", report_id: "rpt-9", stripe_payment_intent_id: "pi_9" }],
      assembled_reports: [{ id: "rpt-9", payg_tier: "verified", reviewed: false }],
    });
    const hook = vi.fn(async () => {
      expect(db.row("report_orders", "o9")?.status).toBe("REFUNDED");
      return { badgeRevoked: true, reviewsCancelled: true };
    });
    const out = await refundReportOrderForCharge(db as never, charge({ payment_intent: "pi_9" }), { id: "e9" }, { onVerifiedRefunded: hook });
    expect(hook).toHaveBeenCalledWith(db, { orderId: "o9", reportId: "rpt-9" });
    // a refunded Full → Verified upgrade also drops the report back to Full
    expect(out).toMatchObject({ badgeRemoved: true, tierReverted: true });
    expect(db.row("assembled_reports", "rpt-9")?.payg_tier).toBe("full");
  });
});

describe("notifyPaygOrderSettled (G4 report-delivery e-mails)", () => {
  it("READY → ready e-mail to the buyer; IN_REVIEW → in-review e-mail with the due date", async () => {
    const db = freshDb({ report_orders: [{ id: "o1", user_id: USER }] });
    const ready = vi.fn(async () => ({}));
    const inReview = vi.fn(async () => ({}));
    expect(await notifyPaygOrderSettled(db as never, { orderId: "o1", status: "READY", paygTier: "snapshot", slaDueAt: null }, { email: { ready, inReview } })).toEqual({ sent: true });
    expect(ready).toHaveBeenCalledWith({ to: "f@example.com", orderId: "o1", tier: "snapshot" });
    const due = verifiedSlaDueAt(NOW, 2);
    await notifyPaygOrderSettled(db as never, { orderId: "o1", status: "IN_REVIEW", paygTier: "verified", slaDueAt: due }, { email: { ready, inReview }, slaBusinessDays: async () => 2 });
    expect(inReview).toHaveBeenCalledWith({ to: "f@example.com", orderId: "o1", dueAt: due, slaBusinessDays: 2 });
  });

  it("no order / no e-mail → nothing sent", async () => {
    const db = freshDb({ report_orders: [] });
    expect(await notifyPaygOrderSettled(db as never, { orderId: "nope", status: "READY", paygTier: "full", slaDueAt: null }, { email: {} })).toEqual({ sent: false, reason: "order_not_found" });
  });
});
