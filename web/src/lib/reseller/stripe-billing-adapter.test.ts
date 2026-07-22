import { describe, expect, it, vi } from "vitest";
import {
  ensureResellerStripeCustomer,
  createResellerSetupIntent,
  type StripeLike,
  type SupabaseLike,
} from "./stripe-billing-adapter";
import type { ResellerBillingRow } from "./stripe-billing";

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
  setupIntentCreate?: (params: unknown) => unknown;
} = {}): { stripe: StripeLike; calls: { customers: unknown[]; setupIntents: unknown[] } } {
  const calls = { customers: [] as unknown[], setupIntents: [] as unknown[] };
  const stripe = {
    customers: {
      create: vi.fn(async (params: unknown) => {
        calls.customers.push(params);
        const impl = overrides.customerCreate;
        if (impl) return impl(params);
        return { id: "cus_test123", object: "customer" };
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
