import { describe, expect, it, vi } from "vitest";
import {
  ensureResellerStripeCustomer,
  createResellerSetupIntent,
  saveResellerDefaultPaymentMethod,
  createResellerWholesaleSubscription,
  type StripeLike,
  type SupabaseLike,
} from "./stripe-billing-adapter";
import type {
  ResellerBillingRow,
  WholesaleSubscriptionInput,
} from "./stripe-billing";

function row(overrides: Partial<ResellerBillingRow> = {}): ResellerBillingRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    code: "INFOVISION",
    display_name: "InfoVision",
    status: "active",
    billing_model: "wholesale",
    contact_email: "billing@infovision.example",
    stripe_customer_id: null,
    stripe_default_payment_method_id: null,
    ...overrides,
  };
}

function fakeStripe(overrides: {
  customerCreate?: (params: unknown) => unknown;
  customerUpdate?: (id: string, params: unknown) => unknown;
  setupIntentCreate?: (params: unknown) => unknown;
  setupIntentRetrieve?: (id: string) => unknown;
  subscriptionCreate?: (params: unknown) => unknown;
} = {}): {
  stripe: StripeLike;
  calls: {
    customers: unknown[];
    customerUpdates: { id: string; params: unknown }[];
    setupIntents: unknown[];
    setupIntentRetrieves: string[];
    subscriptions: unknown[];
  };
} {
  const calls = {
    customers: [] as unknown[],
    customerUpdates: [] as { id: string; params: unknown }[],
    setupIntents: [] as unknown[],
    setupIntentRetrieves: [] as string[],
    subscriptions: [] as unknown[],
  };
  const stripe = {
    customers: {
      create: vi.fn(async (params: unknown) => {
        calls.customers.push(params);
        const impl = overrides.customerCreate;
        if (impl) return impl(params);
        return { id: "cus_test123", object: "customer" };
      }),
      update: vi.fn(async (id: string, params: unknown) => {
        calls.customerUpdates.push({ id, params });
        const impl = overrides.customerUpdate;
        if (impl) return impl(id, params);
        return { id, object: "customer" };
      }),
    },
    setupIntents: {
      create: vi.fn(async (params: unknown) => {
        calls.setupIntents.push(params);
        const impl = overrides.setupIntentCreate;
        if (impl) return impl(params);
        return {
          id: "seti_test123",
          client_secret: "seti_test123_secret_abc",
          object: "setup_intent",
        };
      }),
      retrieve: vi.fn(async (id: string) => {
        calls.setupIntentRetrieves.push(id);
        const impl = overrides.setupIntentRetrieve;
        if (impl) return impl(id);
        return {
          id,
          object: "setup_intent",
          status: "succeeded",
          customer: "cus_existing",
          payment_method: "pm_test123",
        };
      }),
    },
    subscriptions: {
      create: vi.fn(async (params: unknown) => {
        calls.subscriptions.push(params);
        const impl = overrides.subscriptionCreate;
        if (impl) return impl(params);
        return {
          id: "sub_test123",
          object: "subscription",
          status: "active",
          latest_invoice: { id: "in_test123", object: "invoice" },
        };
      }),
    },
  } as unknown as StripeLike;
  return { stripe, calls };
}

function fakeSupabase(overrides: { updateError?: string } = {}): {
  supabase: SupabaseLike;
  calls: { table: string; patch: Record<string, unknown>; eqColumn: string; eqValue: string }[];
} {
  const calls: {
    table: string;
    patch: Record<string, unknown>;
    eqColumn: string;
    eqValue: string;
  }[] = [];
  const supabase: SupabaseLike = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, patch, eqColumn: column, eqValue: value });
              if (overrides.updateError) {
                return { error: { message: overrides.updateError } };
              }
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { supabase, calls };
}

describe("ensureResellerStripeCustomer", () => {
  it("mints a Customer and persists the id when none is stored", async () => {
    const { stripe, calls: stripeCalls } = fakeStripe();
    const { supabase, calls: dbCalls } = fakeSupabase();

    const result = await ensureResellerStripeCustomer(row(), { stripe, supabase });
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_test123",
      created: true,
    });
    expect(stripeCalls.customers).toHaveLength(1);
    expect(dbCalls).toEqual([
      {
        table: "resellers",
        patch: { stripe_customer_id: "cus_test123" },
        eqColumn: "id",
        eqValue: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });

  it("reuses the stored id and does not touch Stripe or Supabase", async () => {
    const { stripe, calls: stripeCalls } = fakeStripe();
    const { supabase, calls: dbCalls } = fakeSupabase();

    const result = await ensureResellerStripeCustomer(
      row({ stripe_customer_id: "cus_existing" }),
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_existing",
      created: false,
    });
    expect(stripeCalls.customers).toHaveLength(0);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns the decision error when the reseller is retail", async () => {
    const { stripe } = fakeStripe();
    const { supabase } = fakeSupabase();
    const result = await ensureResellerStripeCustomer(
      row({ billing_model: "retail" }),
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("returns the decision error when the reseller is paused", async () => {
    const { stripe } = fakeStripe();
    const { supabase } = fakeSupabase();
    const result = await ensureResellerStripeCustomer(
      row({ status: "paused" }),
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "reseller_not_active" });
  });

  it("maps stripe.customers.create rejections to stripe_create_failed", async () => {
    const { stripe } = fakeStripe({
      customerCreate: () => {
        throw new Error("network burned");
      },
    });
    const { supabase, calls: dbCalls } = fakeSupabase();
    const result = await ensureResellerStripeCustomer(row(), { stripe, supabase });
    expect(result).toEqual({
      ok: false,
      reason: "stripe_create_failed",
      detail: "network burned",
    });
    expect(dbCalls).toHaveLength(0);
  });

  it("maps supabase update failure to db_persist_failed", async () => {
    const { stripe } = fakeStripe();
    const { supabase } = fakeSupabase({ updateError: "connection reset" });
    const result = await ensureResellerStripeCustomer(row(), { stripe, supabase });
    expect(result).toEqual({
      ok: false,
      reason: "db_persist_failed",
      detail: "connection reset",
    });
  });
});

describe("createResellerSetupIntent", () => {
  it("returns the client secret when Stripe accepts the SetupIntent", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerSetupIntent(
      row({ stripe_customer_id: "cus_existing" }),
      { stripe },
    );
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_existing",
      setup_intent_id: "seti_test123",
      client_secret: "seti_test123_secret_abc",
    });
    expect(calls.setupIntents).toEqual([
      {
        customer: "cus_existing",
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          reseller_id: "11111111-1111-1111-1111-111111111111",
          reseller_code: "INFOVISION",
          intent: "reseller_default_pm",
        },
      },
    ]);
  });

  it("refuses when the reseller has no stripe_customer_id", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerSetupIntent(row(), { stripe });
    expect(result).toEqual({ ok: false, reason: "stripe_customer_missing" });
    expect(calls.setupIntents).toHaveLength(0);
  });

  it("refuses when billing_model is retail", async () => {
    const { stripe } = fakeStripe();
    const result = await createResellerSetupIntent(
      row({ stripe_customer_id: "cus_existing", billing_model: "retail" }),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("refuses when status is terminated", async () => {
    const { stripe } = fakeStripe();
    const result = await createResellerSetupIntent(
      row({ stripe_customer_id: "cus_existing", status: "terminated" }),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "reseller_not_active" });
  });

  it("maps setupIntents.create rejection to stripe_setup_intent_failed", async () => {
    const { stripe } = fakeStripe({
      setupIntentCreate: () => {
        throw new Error("stripe down");
      },
    });
    const result = await createResellerSetupIntent(
      row({ stripe_customer_id: "cus_existing" }),
      { stripe },
    );
    expect(result).toEqual({
      ok: false,
      reason: "stripe_setup_intent_failed",
      detail: "stripe down",
    });
  });

  it("returns no_client_secret when Stripe omits the secret", async () => {
    const { stripe } = fakeStripe({
      setupIntentCreate: () => ({ id: "seti_missing", client_secret: null }),
    });
    const result = await createResellerSetupIntent(
      row({ stripe_customer_id: "cus_existing" }),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "no_client_secret" });
  });
});

describe("saveResellerDefaultPaymentMethod", () => {
  const SETUP_INTENT_ID = "seti_test123";

  function chargeableRow(overrides: Partial<ResellerBillingRow> = {}): ResellerBillingRow {
    return row({ stripe_customer_id: "cus_existing", ...overrides });
  }

  it("persists the payment method as default and writes it back to the reseller row", async () => {
    const { stripe, calls: stripeCalls } = fakeStripe();
    const { supabase, calls: dbCalls } = fakeSupabase();

    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );

    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_existing",
      payment_method_id: "pm_test123",
      setup_intent_id: SETUP_INTENT_ID,
    });
    expect(stripeCalls.setupIntentRetrieves).toEqual([SETUP_INTENT_ID]);
    expect(stripeCalls.customerUpdates).toEqual([
      {
        id: "cus_existing",
        params: { invoice_settings: { default_payment_method: "pm_test123" } },
      },
    ]);
    expect(dbCalls).toEqual([
      {
        table: "resellers",
        patch: { stripe_default_payment_method_id: "pm_test123" },
        eqColumn: "id",
        eqValue: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });

  it("accepts a SetupIntent whose customer is returned as an object", async () => {
    const { stripe } = fakeStripe({
      setupIntentRetrieve: () => ({
        id: SETUP_INTENT_ID,
        status: "succeeded",
        customer: { id: "cus_existing" },
        payment_method: { id: "pm_expanded" },
      }),
    });
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: true,
      stripe_customer_id: "cus_existing",
      payment_method_id: "pm_expanded",
      setup_intent_id: SETUP_INTENT_ID,
    });
  });

  it("refuses when the reseller is retail", async () => {
    const { stripe, calls } = fakeStripe();
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow({ billing_model: "retail" }),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
    expect(calls.setupIntentRetrieves).toHaveLength(0);
  });

  it("refuses when the reseller is paused", async () => {
    const { stripe, calls } = fakeStripe();
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow({ status: "paused" }),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "reseller_not_active" });
    expect(calls.setupIntentRetrieves).toHaveLength(0);
  });

  it("refuses when the reseller has no stripe_customer_id", async () => {
    const { stripe, calls } = fakeStripe();
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow({ stripe_customer_id: null }),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "stripe_customer_missing" });
    expect(calls.setupIntentRetrieves).toHaveLength(0);
  });

  it("refuses when setup_intent_id is missing or malformed", async () => {
    const { stripe } = fakeStripe();
    const { supabase } = fakeSupabase();
    for (const bad of ["", "   ", "pi_wrong_prefix", "seti_"]) {
      const result = await saveResellerDefaultPaymentMethod(
        chargeableRow(),
        { setup_intent_id: bad },
        { stripe, supabase },
      );
      expect(result).toEqual({ ok: false, reason: "setup_intent_id_required" });
    }
  });

  it("maps setupIntents.retrieve rejection to setup_intent_retrieve_failed", async () => {
    const { stripe } = fakeStripe({
      setupIntentRetrieve: () => {
        throw new Error("stripe down");
      },
    });
    const { supabase, calls: dbCalls } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: false,
      reason: "setup_intent_retrieve_failed",
      detail: "stripe down",
    });
    expect(dbCalls).toHaveLength(0);
  });

  it("refuses when the SetupIntent belongs to a different Customer", async () => {
    const { stripe, calls: stripeCalls } = fakeStripe({
      setupIntentRetrieve: () => ({
        id: SETUP_INTENT_ID,
        status: "succeeded",
        customer: "cus_someone_else",
        payment_method: "pm_test123",
      }),
    });
    const { supabase, calls: dbCalls } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "setup_intent_customer_mismatch" });
    expect(stripeCalls.customerUpdates).toHaveLength(0);
    expect(dbCalls).toHaveLength(0);
  });

  it("refuses when the SetupIntent status is not succeeded", async () => {
    const { stripe } = fakeStripe({
      setupIntentRetrieve: () => ({
        id: SETUP_INTENT_ID,
        status: "requires_payment_method",
        customer: "cus_existing",
        payment_method: null,
      }),
    });
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: false,
      reason: "setup_intent_not_succeeded",
      detail: "requires_payment_method",
    });
  });

  it("refuses when the SetupIntent has no payment method attached", async () => {
    const { stripe } = fakeStripe({
      setupIntentRetrieve: () => ({
        id: SETUP_INTENT_ID,
        status: "succeeded",
        customer: "cus_existing",
        payment_method: null,
      }),
    });
    const { supabase } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({ ok: false, reason: "setup_intent_no_payment_method" });
  });

  it("maps customers.update rejection to stripe_customer_update_failed and skips the DB write", async () => {
    const { stripe } = fakeStripe({
      customerUpdate: () => {
        throw new Error("update refused");
      },
    });
    const { supabase, calls: dbCalls } = fakeSupabase();
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: false,
      reason: "stripe_customer_update_failed",
      detail: "update refused",
    });
    expect(dbCalls).toHaveLength(0);
  });

  it("maps supabase update failure to db_persist_failed", async () => {
    const { stripe } = fakeStripe();
    const { supabase } = fakeSupabase({ updateError: "connection reset" });
    const result = await saveResellerDefaultPaymentMethod(
      chargeableRow(),
      { setup_intent_id: SETUP_INTENT_ID },
      { stripe, supabase },
    );
    expect(result).toEqual({
      ok: false,
      reason: "db_persist_failed",
      detail: "connection reset",
    });
  });
});

describe("createResellerWholesaleSubscription", () => {
  function chargeableRow(overrides: Partial<ResellerBillingRow> = {}): ResellerBillingRow {
    return row({
      stripe_customer_id: "cus_existing",
      stripe_default_payment_method_id: "pm_existing",
      ...overrides,
    });
  }

  function input(overrides: Partial<WholesaleSubscriptionInput> = {}): WholesaleSubscriptionInput {
    return {
      price_id: "price_1Growth",
      user_id: "user-uuid-123",
      project_id: "project-uuid-456",
      founder_email: "founder@example.com",
      discount_tier: 20,
      stripe_promotion_code_id: "promo_abc",
      ...overrides,
    };
  }

  it("creates the subscription with customer + default_payment_method + metadata + promotion_code", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow(),
      input(),
      { stripe },
    );
    expect(result).toEqual({
      ok: true,
      subscription_id: "sub_test123",
      status: "active",
      latest_invoice_id: "in_test123",
      stripe_customer_id: "cus_existing",
      price_id: "price_1Growth",
    });
    expect(calls.subscriptions).toHaveLength(1);
    expect(calls.subscriptions[0]).toEqual({
      customer: "cus_existing",
      default_payment_method: "pm_existing",
      items: [{ price: "price_1Growth" }],
      promotion_code: "promo_abc",
      off_session: true,
      payment_behavior: "error_if_incomplete",
      collection_method: "charge_automatically",
      metadata: {
        source: "reseller_wholesale_provision",
        reseller_id: "11111111-1111-1111-1111-111111111111",
        reseller_code: "INFOVISION",
        billing_model: "wholesale",
        user_id: "user-uuid-123",
        project_id: "project-uuid-456",
        founder_email: "founder@example.com",
        discount_tier: "20",
      },
      expand: ["latest_invoice"],
    });
  });

  it("omits promotion_code when the id is null", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow(),
      input({ stripe_promotion_code_id: null }),
      { stripe },
    );
    expect(result.ok).toBe(true);
    const params = calls.subscriptions[0] as Record<string, unknown>;
    expect(params.promotion_code).toBeUndefined();
  });

  it("returns latest_invoice_id when Stripe returns the id as a bare string", async () => {
    const { stripe } = fakeStripe({
      subscriptionCreate: () => ({
        id: "sub_bare",
        status: "active",
        latest_invoice: "in_bare",
      }),
    });
    const result = await createResellerWholesaleSubscription(
      chargeableRow(),
      input(),
      { stripe },
    );
    expect(result).toMatchObject({
      ok: true,
      subscription_id: "sub_bare",
      latest_invoice_id: "in_bare",
    });
  });

  it("returns latest_invoice_id=null when Stripe omits the invoice", async () => {
    const { stripe } = fakeStripe({
      subscriptionCreate: () => ({
        id: "sub_noinv",
        status: "incomplete",
        latest_invoice: null,
      }),
    });
    const result = await createResellerWholesaleSubscription(
      chargeableRow(),
      input(),
      { stripe },
    );
    expect(result).toMatchObject({
      ok: true,
      subscription_id: "sub_noinv",
      status: "incomplete",
      latest_invoice_id: null,
    });
  });

  it("refuses when the reseller has no stripe_customer_id", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow({ stripe_customer_id: null }),
      input(),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "stripe_customer_missing" });
    expect(calls.subscriptions).toHaveLength(0);
  });

  it("refuses when the reseller has no default_payment_method", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow({ stripe_default_payment_method_id: null }),
      input(),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "default_payment_method_missing" });
    expect(calls.subscriptions).toHaveLength(0);
  });

  it("refuses when billing_model is retail", async () => {
    const { stripe, calls } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow({ billing_model: "retail" }),
      input(),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
    expect(calls.subscriptions).toHaveLength(0);
  });

  it("refuses when reseller status is terminated", async () => {
    const { stripe } = fakeStripe();
    const result = await createResellerWholesaleSubscription(
      chargeableRow({ status: "terminated" }),
      input(),
      { stripe },
    );
    expect(result).toEqual({ ok: false, reason: "reseller_not_active" });
  });

  it("refuses when price_id is missing or malformed", async () => {
    const { stripe } = fakeStripe();
    for (const bad of ["", "prod_notaprice", "  ", "PRICE_upper"]) {
      const result = await createResellerWholesaleSubscription(
        chargeableRow(),
        input({ price_id: bad as string }),
        { stripe },
      );
      expect(result).toEqual({ ok: false, reason: "price_id_required" });
    }
  });

  it("maps stripe.subscriptions.create rejection to stripe_subscription_create_failed", async () => {
    const { stripe } = fakeStripe({
      subscriptionCreate: () => {
        throw new Error("card_declined");
      },
    });
    const result = await createResellerWholesaleSubscription(
      chargeableRow(),
      input(),
      { stripe },
    );
    expect(result).toEqual({
      ok: false,
      reason: "stripe_subscription_create_failed",
      detail: "card_declined",
    });
  });
});
