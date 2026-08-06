// Unit tests for POST /api/stripe/webhook
//
// Added after the 2026-08-06 zenya@zenyatech.com.au incident, where the Stripe
// webhook endpoint was missing `checkout.session.completed` and paid Founding
// 100 + credit pack orders silently failed to grant entitlements. These tests
// exist to (a) fail loudly if any of the five checkout SKUs stops writing the
// row it's supposed to, and (b) prove that replaying an event does NOT double
// grant.
//
// The webhook route pulls in a lot of live infra (Supabase, Stripe, dataroom
// seeding, reseller integration). We stub every side-effect at the module
// boundary so this file exercises only the router-level branching + the
// idempotency contract.
//
// SKUs covered per assignment:
//   1. founding50           — subscription plan grant (writes app_users.plan)
//   2. credit_pack          — one-off credit purchase (calls grantCredits)
//   3. founder_package      — Startup Package (grantCredits + startup_package_purchases)
//   4. trust_report         — Path A report_order (writes report_orders + revenue_events)
//   5. svi_analysis         — per-analysis paywall (writes svi_accounts, svi_analysis_usage)
// Plus: replay of the same event.id → claim returns duplicate:true → no side
// effects fire twice.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ---------- Module-level mocks (must be declared before importing route) -----

vi.mock("server-only", () => ({}));

// Supabase: return a chainable proxy that resolves any terminal await to
// { data: [], error: null } and records every .from(table) call. Each mocked
// terminal method (insert / update / upsert / select / eq / …) returns the
// same chain so awaits at any depth resolve cleanly. Tests observe writes
// through the recorded fromCalls / insertCalls / upsertCalls arrays.
type Row = Record<string, unknown>;
const fromCalls: string[] = [];
const insertCalls: Array<{ table: string; row: Row | Row[] }> = [];
const updateCalls: Array<{ table: string; row: Row }> = [];
const upsertCalls: Array<{ table: string; row: Row | Row[] }> = [];
const selectResponses = new Map<string, { data: unknown; error: null | { code?: string; message?: string } }>();

function makeChain(table: string): unknown {
  const chain: Record<string, unknown> = {};
  const terminal = (method: string) => (...args: unknown[]) => {
    if (method === "insert") insertCalls.push({ table, row: args[0] as Row });
    if (method === "update") updateCalls.push({ table, row: args[0] as Row });
    if (method === "upsert") upsertCalls.push({ table, row: args[0] as Row });
    return chain; // still awaitable + chainable
  };
  for (const m of [
    "select", "insert", "update", "upsert", "delete",
    "eq", "in", "gte", "lt", "lte", "gt", "neq", "is", "contains",
    "order", "limit", "range", "single", "maybeSingle", "head",
  ]) {
    chain[m] = terminal(m);
  }
  // Make the chain a thenable so `await supabase.from(x).select(...)` resolves.
  chain.then = (resolve: (v: unknown) => unknown) => {
    const preset = selectResponses.get(table);
    resolve(preset ?? { data: null, error: null });
    return chain;
  };
  return chain;
}

const supabaseMock = {
  from: (table: string) => {
    fromCalls.push(table);
    return makeChain(table);
  },
};

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => supabaseMock,
}));

// Stripe: only used by the webhook module for subscription lookups + plan-id
// mapping. We keep the SDK out of the tests entirely.
const stripeSubscriptionsRetrieve = vi.fn();
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    subscriptions: { retrieve: stripeSubscriptionsRetrieve },
  }),
  STRIPE_PRICE_MAP: {
    founding50: "price_founding50_TEST",
  },
}));

// Signature verification + idempotency claim.
const verifyWebhookSignature = vi.fn();
const claimWebhookEvent = vi.fn();
const markWebhookEventProcessed = vi.fn(async () => undefined);
vi.mock("@/lib/stripe/verify", () => ({
  verifyWebhookSignature: (raw: string, sig: string) => verifyWebhookSignature(raw, sig),
  claimWebhookEvent: (event: unknown) => claimWebhookEvent(event),
  markWebhookEventProcessed: (id: string, err?: string) => markWebhookEventProcessed(id, err),
}));

// Credit grants — count invocations per SKU test.
const grantCreditsMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/credits", () => ({
  grantCredits: (userId: string, amount: number, reason: string, detail: unknown) =>
    grantCreditsMock(userId, amount, reason, detail),
  PLAN_CREDITS: {
    founding50: { amount: 100 },
  },
}));

// Plans catalog (only sendPaymentConfirmation reads the returned name).
vi.mock("@/lib/plans", () => ({
  getPlan: (id: string) => ({ id, name: id }),
}));

// Email side-effects — no-op in tests, but track that they were fired for the
// right SKUs. Errors are swallowed by the webhook anyway.
const emailMock = {
  sendPaymentConfirmation: vi.fn(async () => ({ ok: true })),
  sendPaymentFailed: vi.fn(async () => ({ ok: true })),
  sendPaymentReceipt: vi.fn(async () => ({ ok: true })),
  sendCreditPurchaseConfirmation: vi.fn(async () => ({ ok: true })),
  sendSubscriptionCancelled: vi.fn(async () => ({ ok: true })),
  sendAnalysisPurchaseConfirmation: vi.fn(async () => ({ ok: true })),
};
vi.mock("@/lib/email", () => emailMock);

// Dynamic import shims for optional side-effects the router `await import()`s.
vi.mock("@/lib/reseller/webhook-refund-integration", () => ({
  handleChargeRefunded: vi.fn(),
  handleChargeDisputeCreated: vi.fn(),
  handleChargeDisputeClosed: vi.fn(),
  handleCreditNoteCreated: vi.fn(),
  handleInvoiceVoided: vi.fn(),
}));
vi.mock("@/lib/audit/log", () => ({
  logUserAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/paywall/report-order-worker", () => ({
  enqueueOrder: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/startup-package/repo", () => ({
  insertPurchase: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/dataroom/seed-templates", () => ({
  seedDataroomTemplates: vi.fn(async () => ({ ok: true, failed: [], uploaded: [] })),
}));
vi.mock("@/lib/gst", () => ({
  splitGst: (cents: number) => ({
    gross_aud_cents: cents,
    gst_aud_cents: Math.round(cents / 11),
    net_aud_cents: cents - Math.round(cents / 11),
  }),
}));
vi.mock("@/lib/reseller/founder-attribution-linker", () => ({
  linkFounderAttribution: vi.fn(async () => ({ ok: true })),
}));

// ---------- Test helpers -----------------------------------------------------

// Build a minimal Stripe.Event of type checkout.session.completed with the
// given metadata + amount_total. We cast through unknown because Stripe's own
// Event type is deeply optional and instantiating a real one adds no coverage.
function buildCheckoutEvent(args: {
  id: string;
  sessionId?: string;
  metadata: Record<string, string>;
  customerEmail?: string;
  amountTotal?: number;
  subscription?: string | null;
  customer?: string | null;
}): Stripe.Event {
  return {
    id: args.id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: args.sessionId ?? `cs_test_${args.id}`,
        object: "checkout.session",
        metadata: args.metadata,
        customer_email: args.customerEmail ?? null,
        amount_total: args.amountTotal ?? 900,
        currency: "aud",
        subscription: args.subscription ?? null,
        customer: args.customer ?? null,
        payment_intent: `pi_${args.id}`,
      },
    },
  } as unknown as Stripe.Event;
}

async function invoke(): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request("http://x/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=stub" },
      body: "{}",
    }),
  );
}

// ---------- Suite ------------------------------------------------------------

beforeEach(() => {
  fromCalls.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  upsertCalls.length = 0;
  selectResponses.clear();
  verifyWebhookSignature.mockReset();
  claimWebhookEvent.mockReset();
  claimWebhookEvent.mockResolvedValue({ duplicate: false });
  markWebhookEventProcessed.mockReset();
  markWebhookEventProcessed.mockResolvedValue(undefined);
  stripeSubscriptionsRetrieve.mockReset();
  grantCreditsMock.mockReset();
  grantCreditsMock.mockResolvedValue({ ok: true });
  for (const fn of Object.values(emailMock)) fn.mockReset();
});

describe("POST /api/stripe/webhook — checkout.session.completed routing", () => {
  it("founding50 subscription: grants plan credits + updates app_users.plan", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_founding50",
        metadata: {
          blockid_user_id: "user-zenya",
          blockid_plan: "founding50",
          blockid_email: "zenya@zenyatech.com.au",
        },
        customerEmail: "zenya@zenyatech.com.au",
        amountTotal: 100,
        customer: "cus_zenya",
      }),
    );

    const res = await invoke();
    expect(res.status).toBe(200);

    // (a) app_users updated with plan=founding50
    const planUpdate = updateCalls.find(
      (c) => c.table === "app_users" && (c.row as Row).plan === "founding50",
    );
    expect(planUpdate).toBeTruthy();

    // (b) grantCredits called exactly once with 100 credits (PLAN_CREDITS.founding50)
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][0]).toBe("user-zenya");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(100);
    expect(grantCreditsMock.mock.calls[0][2]).toBe("plan_grant");

    // (c) claim + mark processed exactly once
    expect(claimWebhookEvent).toHaveBeenCalledTimes(1);
    expect(markWebhookEventProcessed).toHaveBeenCalledTimes(1);
  });

  it("credit_pack purchase: calls grantCredits with credit_pack_purchase reason exactly once", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_credit_pack",
        metadata: {
          type: "credit_purchase",
          blockid_user_id: "user-zenya",
          blockid_credits: "10",
        },
        customerEmail: "zenya@zenyatech.com.au",
        amountTotal: 900,
      }),
    );

    const res = await invoke();
    expect(res.status).toBe(200);

    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][0]).toBe("user-zenya");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(10);
    expect(grantCreditsMock.mock.calls[0][2]).toBe("credit_pack_purchase");

    // revenue_events row inserted with kind=credit_pack + plan_id=null
    const rev = insertCalls.find(
      (c) => c.table === "revenue_events" && (c.row as Row).kind === "credit_pack",
    );
    expect(rev).toBeTruthy();
    expect((rev!.row as Row).plan_id).toBeNull();
  });

  it("founder_package: grants 25 seed credits with package_seed reason", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_founder_pkg",
        metadata: {
          plan: "founder_package",
          blockid_user_id: "user-1",
          project_id: "proj-1",
          blockid_email: "founder@example.com",
        },
        amountTotal: 4900,
      }),
    );

    const res = await invoke();
    expect(res.status).toBe(200);

    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock.mock.calls[0][1]).toBe(25);
    expect(grantCreditsMock.mock.calls[0][2]).toBe("package_seed");

    // revenue_events with kind=startup_package + planId=founder_package
    const rev = insertCalls.find(
      (c) => c.table === "revenue_events" && (c.row as Row).kind === "startup_package",
    );
    expect(rev).toBeTruthy();
    expect((rev!.row as Row).plan_id).toBe("founder_package");
  });

  it("trust_report (report_order): inserts report_orders + revenue_events(trust_report_5aud)", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_trust_report",
        metadata: {
          bid_scope: "report_order",
          bid_business_id: "biz-1",
          bid_user_id: "user-1",
          bid_sku: "sku_trust_report_5aud",
        },
        amountTotal: 550,
      }),
    );

    const res = await invoke();
    expect(res.status).toBe(200);

    // Report order inserted (reconciliation path — no pre-existing row).
    const reportRow = insertCalls.find((c) => c.table === "report_orders");
    expect(reportRow).toBeTruthy();
    expect((reportRow!.row as Row).status).toBe("PAID");

    // revenue_events with kind=trust_report_5aud and plan_id null (legacy).
    const rev = insertCalls.find(
      (c) => c.table === "revenue_events" && (c.row as Row).kind === "trust_report_5aud",
    );
    expect(rev).toBeTruthy();
    expect((rev!.row as Row).plan_id).toBeNull();

    // No plan grant, no credit pack for this SKU.
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("svi_analysis: inserts svi_accounts + svi_analysis_usage rows for a new email", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_svi_analysis",
        metadata: {
          blockid_type: "svi_analysis",
          blockid_email: "buyer@example.com",
        },
        amountTotal: 500,
      }),
    );

    const res = await invoke();
    expect(res.status).toBe(200);

    const acct = insertCalls.find((c) => c.table === "svi_accounts");
    expect(acct).toBeTruthy();
    expect((acct!.row as Row).email).toBe("buyer@example.com");
    expect((acct!.row as Row).svi_analysis_credits).toBe(1);

    const usage = insertCalls.find((c) => c.table === "svi_analysis_usage");
    expect(usage).toBeTruthy();
    expect((usage!.row as Row).credits_remaining).toBe(1);

    // No credit grant for the per-analysis path.
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — idempotency (replay)", () => {
  it("replaying the same event.id short-circuits: no grants, no inserts, no update processed", async () => {
    verifyWebhookSignature.mockReturnValue(
      buildCheckoutEvent({
        id: "evt_dup",
        metadata: {
          type: "credit_purchase",
          blockid_user_id: "user-zenya",
          blockid_credits: "10",
        },
        customerEmail: "zenya@zenyatech.com.au",
      }),
    );
    // Simulate stripe_webhook_events UNIQUE(id) conflict.
    claimWebhookEvent.mockResolvedValueOnce({ duplicate: true });

    const res = await invoke();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);

    // Zero side-effects on replay.
    expect(grantCreditsMock).not.toHaveBeenCalled();
    expect(insertCalls.length).toBe(0);
    expect(updateCalls.length).toBe(0);
    expect(markWebhookEventProcessed).not.toHaveBeenCalled();
  });
});
