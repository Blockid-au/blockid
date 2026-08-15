// Colocated regression suite for `web/src/lib/stripe-pricing-audit.ts` — the
// deterministic core behind /dashboard/admin/stripe-sync. Pins the audit
// verdict branches (match / drift / archived / missing_price_id /
// stripe_not_configured / stripe_lookup_failed), the runStripePricingAudit
// aggregate flags, and createFreshStripePrice's cadence-map + product
// find-or-create + err propagation so silent drift here can't corrupt the
// admin's "should I mint a new Stripe Price?" answer or the resulting
// unit_amount charged at checkout.
//
// P9_ship autonomous-loop tick — first test coverage for stripe-pricing-audit.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { stripePriceMap, getStripeMock, getPlatformConfigMock } = vi.hoisted(() => ({
  stripePriceMap: {} as Record<string, string | undefined>,
  getStripeMock: vi.fn(),
  getPlatformConfigMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => getStripeMock(),
  STRIPE_PRICE_MAP: stripePriceMap,
}));

vi.mock("@/lib/platform-config", () => ({
  getPlatformConfig: () => getPlatformConfigMock(),
}));

import {
  runStripePricingAudit,
  createFreshStripePrice,
  type PlanAuditRow,
} from "./stripe-pricing-audit";

// ─── Fake Stripe helpers ─────────────────────────────────────────────────────

interface FakePrice {
  unit_amount: number | null;
  currency: string | null;
  active: boolean;
}

function makeStripe(overrides: {
  prices?: Record<string, FakePrice | Error>;
  productsSearchResult?: { data: Array<{ id: string }> } | Error;
  productsCreateResult?: { id: string } | Error;
  pricesCreateResult?: { id: string } | Error;
} = {}) {
  const state = {
    retrieveCalls: [] as string[],
    productSearchCalls: [] as Stripe.ProductSearchParams[],
    productCreateCalls: [] as Stripe.ProductCreateParams[],
    priceCreateCalls: [] as Stripe.PriceCreateParams[],
  };
  const stripe = {
    prices: {
      retrieve: vi.fn(async (id: string) => {
        state.retrieveCalls.push(id);
        const entry = overrides.prices?.[id];
        if (entry instanceof Error) throw entry;
        if (!entry) throw new Error(`No such price: ${id}`);
        return entry;
      }),
      create: vi.fn(async (params: Stripe.PriceCreateParams) => {
        state.priceCreateCalls.push(params);
        if (overrides.pricesCreateResult instanceof Error) throw overrides.pricesCreateResult;
        return overrides.pricesCreateResult ?? { id: "price_new_default" };
      }),
    },
    products: {
      search: vi.fn(async (params: Stripe.ProductSearchParams) => {
        state.productSearchCalls.push(params);
        if (overrides.productsSearchResult instanceof Error) throw overrides.productsSearchResult;
        return overrides.productsSearchResult ?? { data: [] };
      }),
      create: vi.fn(async (params: Stripe.ProductCreateParams) => {
        state.productCreateCalls.push(params);
        if (overrides.productsCreateResult instanceof Error) throw overrides.productsCreateResult;
        return overrides.productsCreateResult ?? { id: "prod_new_default" };
      }),
    },
  };
  return { stripe, state };
}

// Minimal namespace shim so Stripe.PriceCreateParams etc. compile without
// pulling the real Stripe SDK into this test.
namespace Stripe {
  export type ProductSearchParams = { query: string; limit: number };
  export type ProductCreateParams = { name: string; metadata?: Record<string, string> };
  export type PriceCreateParams = {
    product: string;
    currency: string;
    unit_amount: number;
    recurring?: { interval: "month" | "year" } | undefined;
    metadata?: Record<string, string>;
  };
}

// ─── Fake platform config ───────────────────────────────────────────────────

function makeConfig(overrides: Partial<{
  founding_price_cents: number;
  growth_price_monthly_cents: number;
  growth_price_yearly_cents: number;
}> = {}) {
  return {
    founding_price_cents: 500,
    growth_price_monthly_cents: 9900,
    growth_price_yearly_cents: 95000,
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof getPlatformConfigMock>>;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(stripePriceMap)) delete stripePriceMap[k];
  getStripeMock.mockReset();
  getPlatformConfigMock.mockReset();
});

function rowFor(rows: PlanAuditRow[], planId: string): PlanAuditRow {
  const r = rows.find((x) => x.planId === planId);
  if (!r) throw new Error(`planId ${planId} not in audit result`);
  return r;
}

// ─── runStripePricingAudit — per-plan verdicts ───────────────────────────────

describe("stripe-pricing-audit — runStripePricingAudit", () => {
  it("returns missing_price_id when the env var is unset", async () => {
    getStripeMock.mockReturnValue({ prices: { retrieve: vi.fn() } });
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    const founding = rowFor(rows, "founding50");

    expect(founding.status).toBe("missing_price_id");
    expect(founding.remediation).toContain("STRIPE_PRICE_FOUNDING50");
    expect(founding.stripePriceId).toBeNull();
    expect(founding.stripeUnitAmount).toBeNull();
    expect(founding.expectedAud).toBe(5);
    expect(founding.expectedCents).toBe(500);
  });

  it("returns stripe_not_configured when getStripe() returns null but price id is set", async () => {
    stripePriceMap.founding50 = "price_founding50";
    getStripeMock.mockReturnValue(null);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    const founding = rowFor(rows, "founding50");

    expect(founding.status).toBe("stripe_not_configured");
    expect(founding.remediation).toContain("STRIPE_SECRET_KEY");
    expect(founding.stripePriceId).toBe("price_founding50");
  });

  it("returns match when Stripe unit_amount + currency line up with platform-config", async () => {
    stripePriceMap.founding50 = "price_founding50";
    const { stripe } = makeStripe({
      prices: { price_founding50: { unit_amount: 500, currency: "aud", active: true } },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows, hasDrift, hasMissingIds, stripeConfigured } = await runStripePricingAudit();
    const founding = rowFor(rows, "founding50");

    expect(founding.status).toBe("match");
    expect(founding.stripeUnitAmount).toBe(500);
    expect(founding.stripeCurrency).toBe("aud");
    expect(founding.stripeActive).toBe(true);
    expect(founding.remediation).toBe("OK — Stripe matches platform-config.");
    // Aggregate flags respect this row (others are missing_price_id).
    expect(hasDrift).toBe(false);
    expect(hasMissingIds).toBe(true);
    expect(stripeConfigured).toBe(true);
  });

  it("returns drift when unit_amount differs from platform-config", async () => {
    stripePriceMap.growth = "price_growth_monthly";
    const { stripe } = makeStripe({
      prices: { price_growth_monthly: { unit_amount: 8900, currency: "aud", active: true } },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows, hasDrift } = await runStripePricingAudit();
    const growth = rowFor(rows, "growth");

    expect(growth.status).toBe("drift");
    expect(growth.remediation).toContain("A$99");
    expect(growth.remediation).toContain("8900");
    expect(growth.remediation).toContain("immutable");
    expect(hasDrift).toBe(true);
  });

  it("flags drift when currency mismatches even if unit_amount matches", async () => {
    stripePriceMap.growth = "price_growth_monthly";
    const { stripe } = makeStripe({
      prices: { price_growth_monthly: { unit_amount: 9900, currency: "usd", active: true } },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    const growth = rowFor(rows, "growth");
    expect(growth.status).toBe("drift");
    expect(growth.remediation).toContain("USD");
  });

  it("returns archived when Stripe reports active=false even with matching amount", async () => {
    stripePriceMap.founding50 = "price_founding50";
    const { stripe } = makeStripe({
      prices: { price_founding50: { unit_amount: 500, currency: "aud", active: false } },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows, hasDrift } = await runStripePricingAudit();
    const founding = rowFor(rows, "founding50");

    expect(founding.status).toBe("archived");
    expect(founding.stripeActive).toBe(false);
    expect(founding.remediation).toContain("archived");
    expect(founding.remediation).toContain("A$5");
    // hasDrift also catches archived rows per the module contract.
    expect(hasDrift).toBe(true);
  });

  it("returns stripe_lookup_failed when Stripe throws (bad price id / test-vs-live mismatch)", async () => {
    stripePriceMap.founding50 = "price_bad";
    const { stripe } = makeStripe({
      prices: { price_bad: new Error("No such price: price_bad") },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    const founding = rowFor(rows, "founding50");

    expect(founding.status).toBe("stripe_lookup_failed");
    expect(founding.remediation).toContain("Failed to fetch Stripe Price price_bad");
    expect(founding.remediation).toContain("test vs live");
  });

  it("uses staticCents (not configField) for credit-pack plans", async () => {
    // Set every headline plan to match so their status won't dominate the row assertions.
    getStripeMock.mockReturnValue(
      makeStripe({
        prices: {
          price_credits_5: { unit_amount: 500, currency: "aud", active: true },
          price_credits_10: { unit_amount: 900, currency: "aud", active: true },
          price_credits_25: { unit_amount: 2000, currency: "aud", active: true },
          price_credits_50: { unit_amount: 1500, currency: "aud", active: true },
          price_credits_100: { unit_amount: 2500, currency: "aud", active: true },
        },
      }).stripe,
    );
    stripePriceMap.credits_5 = "price_credits_5";
    stripePriceMap.credits_10 = "price_credits_10";
    stripePriceMap.credits_25 = "price_credits_25";
    stripePriceMap.credits_50 = "price_credits_50";
    stripePriceMap.credits_100 = "price_credits_100";
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    for (const [id, cents] of [
      ["credits_5", 500],
      ["credits_10", 900],
      ["credits_25", 2000],
      ["credits_50", 1500],
      ["credits_100", 2500],
    ] as const) {
      const r = rowFor(rows, id);
      expect(r.expectedCents).toBe(cents);
      expect(r.expectedAud).toBe(cents / 100);
      expect(r.status).toBe("match");
      expect(r.cadence).toBe("credit-pack");
    }
  });

  it("keeps the 8 legacy plans first, in shipped order, with per-row cadence + label", async () => {
    getStripeMock.mockReturnValue(makeStripe().stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    // Legacy plans lead — v2 SKUs are auto-appended after (see next test).
    expect(rows.slice(0, 8).map((r) => r.planId)).toEqual([
      "founding50",
      "growth",
      "growth_annual",
      "credits_5",
      "credits_10",
      "credits_25",
      "credits_50",
      "credits_100",
    ]);
    expect(rowFor(rows, "founding50").cadence).toBe("one-off");
    expect(rowFor(rows, "growth").cadence).toBe("monthly");
    expect(rowFor(rows, "growth_annual").cadence).toBe("yearly");
    expect(rowFor(rows, "credits_5").label).toBe("5 credits pack");
    expect(rowFor(rows, "growth").label).toBe("Growth — monthly");
    expect(rowFor(rows, "growth_annual").label).toBe("Growth — annual");
  });

  it("auto-derives v2 SKU audit rows from GENERATED_PLANS with the correct envVar-based remediation", async () => {
    getStripeMock.mockReturnValue(makeStripe().stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const { rows } = await runStripePricingAudit();
    // A representative v2 SKU (founder_starter — monthly, price A$29).
    const founderStarter = rowFor(rows, "founder_starter");
    expect(founderStarter.cadence).toBe("monthly");
    expect(founderStarter.expectedCents).toBe(2900);
    expect(founderStarter.expectedAud).toBe(29);
    expect(founderStarter.status).toBe("missing_price_id");
    // Env var name follows the plans.csv stripe_env_var column.
    expect(founderStarter.remediation).toContain("STRIPE_PRICE_FOUNDER_STARTER");

    // One-off v2 SKU (founder_package — A$149).
    const pkg = rowFor(rows, "founder_package");
    expect(pkg.cadence).toBe("one-off");
    expect(pkg.expectedCents).toBe(14900);
    expect(pkg.remediation).toContain("STRIPE_PRICE_STARTUP_PACKAGE");

    // Accelerator SKU uses non-obvious env-var name (STRIPE_PRICE_ACCEL_STARTER,
    // not the naive STRIPE_PRICE_ACCELERATOR_STARTER derivation).
    const accel = rowFor(rows, "accelerator_starter");
    expect(accel.remediation).toContain("STRIPE_PRICE_ACCEL_STARTER");

    // Contact-sales / free / zero-price SKUs are excluded.
    expect(rows.find((r) => r.planId === "founder_free")).toBeUndefined();
    expect(rows.find((r) => r.planId === "investor_vc_ent")).toBeUndefined();
  });
});

// ─── runStripePricingAudit — aggregate flags + generatedAt ──────────────────

describe("stripe-pricing-audit — aggregate result envelope", () => {
  it("hasMissingIds true / hasDrift false / stripeConfigured true when nothing is wired", async () => {
    getStripeMock.mockReturnValue(makeStripe().stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const result = await runStripePricingAudit();
    expect(result.hasMissingIds).toBe(true);
    expect(result.hasDrift).toBe(false);
    expect(result.stripeConfigured).toBe(true);
    expect(typeof result.generatedAt).toBe("string");
    expect(() => new Date(result.generatedAt)).not.toThrow();
    // 8 legacy plans + auto-derived v2 SKUs from GENERATED_PLANS. Exact length
    // grows as plans.csv gains SKUs; assert lower bound so this test survives
    // future catalogue expansion without unrelated breakage.
    expect(result.rows.length).toBeGreaterThanOrEqual(8);
  });

  it("stripeConfigured false when getStripe() returns null AND a price id is set", async () => {
    stripePriceMap.founding50 = "price_founding50";
    getStripeMock.mockReturnValue(null);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const result = await runStripePricingAudit();
    expect(result.stripeConfigured).toBe(false);
  });

  it("stripeConfigured stays true when getStripe() is null but NO plan has an env var (missing_price_id short-circuit)", async () => {
    // Module short-circuits before touching getStripe() when the id is null,
    // so every row is missing_price_id (not stripe_not_configured) and
    // stripeConfigured reads true — pins that behaviour.
    getStripeMock.mockReturnValue(null);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const result = await runStripePricingAudit();
    expect(result.stripeConfigured).toBe(true);
    expect(result.rows.every((r) => r.status === "missing_price_id")).toBe(true);
  });

  it("hasDrift is true when at least one row is drift OR archived", async () => {
    stripePriceMap.founding50 = "price_founding50";
    stripePriceMap.growth = "price_growth";
    const { stripe } = makeStripe({
      prices: {
        price_founding50: { unit_amount: 500, currency: "aud", active: false }, // archived
        price_growth: { unit_amount: 9900, currency: "aud", active: true }, // match
      },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const result = await runStripePricingAudit();
    expect(result.hasDrift).toBe(true);
  });
});

// ─── createFreshStripePrice — guard rails + product find-or-create ───────────

describe("stripe-pricing-audit — createFreshStripePrice", () => {
  it("returns ok:false for an unknown plan id (no Stripe call)", async () => {
    const res = await createFreshStripePrice("mystery_plan");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unknown plan: mystery_plan");
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(getPlatformConfigMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when Stripe is not configured", async () => {
    getStripeMock.mockReturnValue(null);
    const res = await createFreshStripePrice("founding50");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Stripe not configured.");
  });

  it("reuses an existing product when metadata search hits", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_existing" }] },
      pricesCreateResult: { id: "price_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const res = await createFreshStripePrice("founding50");
    expect(res.ok).toBe(true);
    expect(res.newPriceId).toBe("price_new");
    expect(res.envVarName).toBe("STRIPE_PRICE_FOUNDING50");
    // Verify: product created NOT called (search hit); price created targets the existing product.
    expect(state.productCreateCalls).toEqual([]);
    expect(state.priceCreateCalls).toHaveLength(1);
    expect(state.priceCreateCalls[0].product).toBe("prod_existing");
    expect(state.priceCreateCalls[0].currency).toBe("aud");
    expect(state.priceCreateCalls[0].unit_amount).toBe(500);
    expect(state.priceCreateCalls[0].metadata).toEqual({
      blockid_plan_id: "founding50",
      created_by: "stripe-pricing-audit",
    });
    // one-off cadence -> undefined recurring
    expect(state.priceCreateCalls[0].recurring).toBeUndefined();
    // Search query pins the metadata predicate
    expect(state.productSearchCalls[0]).toEqual({
      query: `metadata["blockid_plan_id"]:"founding50"`,
      limit: 1,
    });
  });

  it("creates a new product when metadata search returns no data", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [] },
      productsCreateResult: { id: "prod_freshly_minted" },
      pricesCreateResult: { id: "price_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const res = await createFreshStripePrice("founding50");
    expect(res.ok).toBe(true);
    expect(state.productCreateCalls).toHaveLength(1);
    expect(state.productCreateCalls[0].name).toBe("Founding 100 (one-off)"); // default label
    expect(state.productCreateCalls[0].metadata).toEqual({ blockid_plan_id: "founding50" });
    expect(state.priceCreateCalls[0].product).toBe("prod_freshly_minted");
  });

  it("honours opts.productName when a new product is minted", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [] },
      productsCreateResult: { id: "prod_custom" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    await createFreshStripePrice("founding50", { productName: "Custom Founding Deal" });
    expect(state.productCreateCalls[0].name).toBe("Custom Founding Deal");
  });

  it("falls through to product create when products.search throws (older accounts)", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: new Error("search not enabled on this account"),
      productsCreateResult: { id: "prod_after_search_error" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const res = await createFreshStripePrice("founding50");
    expect(res.ok).toBe(true);
    expect(state.productCreateCalls).toHaveLength(1);
    expect(state.priceCreateCalls[0].product).toBe("prod_after_search_error");
  });

  it("returns ok:false + Stripe error message when price create throws", async () => {
    const { stripe } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_existing" }] },
      pricesCreateResult: new Error("StripeInvalidRequestError: bad currency"),
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const res = await createFreshStripePrice("founding50");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("StripeInvalidRequestError: bad currency");
    expect(res.newPriceId).toBeUndefined();
    expect(res.envVarName).toBeUndefined();
  });

  it("maps cadence -> recurring — monthly plan sends interval:month", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_growth" }] },
      pricesCreateResult: { id: "price_growth_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    await createFreshStripePrice("growth");
    expect(state.priceCreateCalls[0].recurring).toEqual({ interval: "month" });
    expect(state.priceCreateCalls[0].unit_amount).toBe(9900);
  });

  it("maps cadence -> recurring — yearly plan sends interval:year with growth_annual price", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_growth_annual" }] },
      pricesCreateResult: { id: "price_growth_annual_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    await createFreshStripePrice("growth_annual");
    expect(state.priceCreateCalls[0].recurring).toEqual({ interval: "year" });
    expect(state.priceCreateCalls[0].unit_amount).toBe(95000);
  });

  it("credit-pack cadence yields undefined recurring + uses staticCents from PLANS registry", async () => {
    const { stripe, state } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_credits" }] },
      pricesCreateResult: { id: "price_credits_50_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    await createFreshStripePrice("credits_50");
    expect(state.priceCreateCalls[0].recurring).toBeUndefined();
    expect(state.priceCreateCalls[0].unit_amount).toBe(1500);
    expect(state.priceCreateCalls[0].metadata).toEqual({
      blockid_plan_id: "credits_50",
      created_by: "stripe-pricing-audit",
    });
  });

  it("envVarName upper-cases the plan id (matches STRIPE_PRICE_MAP env-var convention)", async () => {
    const { stripe } = makeStripe({
      productsSearchResult: { data: [{ id: "prod_ga" }] },
      pricesCreateResult: { id: "price_ga_new" },
    });
    getStripeMock.mockReturnValue(stripe);
    getPlatformConfigMock.mockResolvedValue(makeConfig());

    const res = await createFreshStripePrice("growth_annual");
    expect(res.envVarName).toBe("STRIPE_PRICE_GROWTH_ANNUAL");
  });
});
