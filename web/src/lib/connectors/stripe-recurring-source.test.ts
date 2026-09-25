import { describe, expect, it, vi } from "vitest";
import { fetchStripeRecurringSource, STRIPE_SOURCE_API_VERSION } from "./stripe-recurring-source";

const binding = { sourceAccountId: "acct_123", livemode: true };
const now = () => Date.parse("2026-09-24T00:00:00Z");
const sub = (id = "sub_1", extra = {}) => ({ id, object: "subscription", status: "active", livemode: true,
  currency: "aud", customer: "cus_1", collection_method: "charge_automatically", cancel_at_period_end: false,
  discounts: [], default_tax_rates: [], automatic_tax: { enabled: false }, ...extra });
const item = (id = "si_1", extra = {}) => ({ id, object: "subscription_item", subscription: "sub_1", quantity: 1,
  discounts: [], tax_rates: [], price: { id: "price_1", object: "price", livemode: true, currency: "aud", type: "recurring",
    billing_scheme: "per_unit", tax_behavior: "exclusive", unit_amount: 10000,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } }, ...extra });
const page = (data: unknown[], has_more = false) => ({ object: "list", data, has_more });
const customer = { id: "cus_1", object: "customer", livemode: true, discount: null };
function fixture(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    "/v1/account": { id: "acct_123", object: "account" },
    "/v1/balance": { object: "balance", livemode: true },
    "/v1/subscriptions?status=active&limit=100": page([sub()]),
    "/v1/customers/cus_1": customer,
    "/v1/subscription_items?subscription=sub_1&limit=100": page([item()]), ...overrides,
  };
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url).startsWith("https://api.stripe.com/v1/")).toBe(true);
    expect(init?.headers).toMatchObject({ "Stripe-Version": STRIPE_SOURCE_API_VERSION, Authorization: "Bearer test-only-token" });
    expect(init?.redirect).toBe("error");
    const u = new URL(String(url)), body = responses[u.pathname + u.search];
    if (body instanceof Error) throw body;
    if (body instanceof Response) return body;
    if (body === undefined) throw new Error("Unexpected request");
    return Response.json(body);
  });
}
const collect = (fetcher: typeof fetch, options = {}) => fetchStripeRecurringSource("test-only-token", binding, { fetch: fetcher, now, ...options });
describe("strict native-AUD recurring source", () => {
  it("traverses subscription and item pagination; rounds combined rational amounts once", async () => {
    const annual = { ...item().price, unit_amount: 100, recurring: { interval: "year", interval_count: 2, usage_type: "licensed" } };
    const fetcher = fixture({
      "/v1/subscriptions?status=active&limit=100": page([sub()], true),
      "/v1/subscriptions?status=active&limit=100&starting_after=sub_1": page([sub("sub_2")]),
      "/v1/subscription_items?subscription=sub_1&limit=100": page([item("si_1", { price: annual })], true),
      "/v1/subscription_items?subscription=sub_1&limit=100&starting_after=si_1": page([item("si_2", { price: annual })]),
      "/v1/subscription_items?subscription=sub_2&limit=100": page([item("si_3", { subscription: "sub_2", price: annual })]),
    });
    const result = await collect(fetcher);
    expect(result).toMatchObject({ mrrAud: 0.13, activeSubscriptions: 2, activeSubscriptionCustomers: 1, itemCount: 3, complete: true, eligibleForValuation: false, requests: 8 });
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("test-only-token");
    expect(result.pages).toHaveLength(8);
  });
  it("accepts explicit zero only after authenticated complete source checks", async () => {
    expect(await collect(fixture({ "/v1/subscriptions?status=active&limit=100": page([]) }))).toMatchObject({ mrrAud: 0, activeSubscriptions: 0, requests: 3 });
    expect(await collect(fixture({ "/v1/subscription_items?subscription=sub_1&limit=100": page([item("si_1", { price: { ...item().price, unit_amount: 0 } })]) }))).toMatchObject({ mrrAud: 0, itemCount: 1 });
  });
  it("accepts explicit null discounts from the pinned Stripe API, but not absent discount state", async () => {
    expect(await collect(fixture({
      "/v1/subscriptions?status=active&limit=100": page([sub("sub_1", { discounts: null })]),
      "/v1/subscription_items?subscription=sub_1&limit=100": page([item("si_1", { discounts: null })]),
    }))).toMatchObject({ mrrAud: 100 });
    await expect(collect(fixture({ "/v1/subscriptions?status=active&limit=100": page([sub("sub_1", { discounts: undefined })]) }))).rejects.toMatchObject({ code: "unsupported_contract" });
  });
  it.each([401, 429, 500])("does not turn upstream HTTP %s into zero", async status => {
    await expect(collect(fixture({ "/v1/subscriptions?status=active&limit=100": new Response("private provider error", { status }) }))).rejects.toMatchObject({ status, code: "connector_http_error" });
  });
  it.each([
    ["/v1/account", { id: "acct_other", object: "account" }],
    ["/v1/balance", { object: "balance", livemode: false }],
    ["/v1/customers/cus_1", { ...customer, id: "cus_other" }],
  ])("rejects source identity/mode mismatch at %s", async (path, body) => {
    await expect(collect(fixture({ [path as string]: body }))).rejects.toMatchObject({ code: "invalid_binding" });
  });
  it("refuses test-mode grant before any request, even for an empty account", async () => {
    const fetcher = fixture();
    await expect(fetchStripeRecurringSource("test-only-token", { ...binding, livemode: false }, { fetch: fetcher, now })).rejects.toMatchObject({ code: "invalid_binding" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ discounts: ["di_1"] }, { pause_collection: {} }, { schedule: "sub_sched_1" }, { cancel_at_period_end: true }, { currency: "usd" }, { pending_update: {} }, { trial_end: 99 }])("rejects unsupported subscription %j", async extra => {
    await expect(collect(fixture({ "/v1/subscriptions?status=active&limit=100": page([sub("sub_1", extra)]) }))).rejects.toMatchObject({ code: "unsupported_contract" });
  });
  it.each([{ unit_amount: null }, { currency: "usd" }, { tax_behavior: "inclusive" }, { billing_scheme: "tiered" }, { transform_quantity: {} }, { unit_amount_decimal: "1.5" }, { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }, { recurring: { interval: "month", interval_count: 0, usage_type: "licensed" } }])("rejects unsupported price %j", async extra => {
    await expect(collect(fixture({ "/v1/subscription_items?subscription=sub_1&limit=100": page([item("si_1", { price: { ...item().price, ...extra } })]) }))).rejects.toMatchObject({ code: "unsupported_contract" });
  });
  it("rejects customer-level discounts and missing quantities", async () => {
    await expect(collect(fixture({ "/v1/customers/cus_1": { ...customer, discount: { id: "di_1" } } }))).rejects.toMatchObject({ code: "unsupported_contract" });
    await expect(collect(fixture({ "/v1/subscription_items?subscription=sub_1&limit=100": page([item("si_1", { quantity: undefined })]) }))).rejects.toMatchObject({ code: "unsupported_contract" });
  });
  it("rejects missing pagination, empty continuation and duplicate cursor rows", async () => {
    for (const body of [{ data: [] }, { object: "list", data: [] }, page([], true), page([sub(), sub()])]) {
      await expect(collect(fixture({ "/v1/subscriptions?status=active&limit=100": body }))).rejects.toBeInstanceOf(Error);
    }
  });
  it("aborts bounded requests/items or transport failure without returning partial sum", async () => {
    await expect(collect(fixture(), { maxRequests: 3 })).rejects.toMatchObject({ code: "incomplete_source" });
    await expect(collect(fixture(), { maxItems: 1 })).rejects.toMatchObject({ code: "incomplete_source" });
    await expect(collect(fixture({ "/v1/subscriptions?status=active&limit=100": new Error("timeout private token") }))).rejects.toMatchObject({ message: "source_unavailable" });
    let clock = now();
    await expect(collect(fixture(), { now: () => { const t = clock; clock += 60_001; return t; } })).rejects.toMatchObject({ code: "incomplete_source" });
  });
});
