// G35 D25 — POST /api/funding/checkout under Pricing v5.
// flag off → the A$3 SKU exactly as before; flag on → `report_funding`
// (A$19, STRIPE_PRICE_REPORT_FUNDING), metadata.sku = report_funding, ATO invoice.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const { createSessionMock, priceMap } = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  priceMap: { funding_report: "price_funding_A3" } as Record<string, string | undefined>,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: (p: unknown) => createSessionMock(p) } } }),
  STRIPE_PRICE_MAP: priceMap,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => {
      const c: Record<string, unknown> = {};
      c.update = () => c;
      c.eq = () => c;
      c.then = (r: (v: unknown) => unknown) => r({ data: null, error: null });
      return c;
    },
  }),
}));
const createPendingMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/reports", () => ({ createPendingGuestReport: (a: unknown) => createPendingMock(a) }));

const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  return { readPaygConfig: async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current }) };
});

import { POST } from "./route";

type SessionParams = {
  line_items: unknown;
  metadata: Record<string, unknown>;
  invoice_creation: { invoice_data: { custom_fields: Array<Record<string, unknown>>; description: string } };
};

const GOOD = { email: "founder@example.com", description: "Soil sensors for grain farmers in regional NSW", state: "NSW", stage: "mvp" };
const req = (b: unknown) =>
  new Request("http://localhost:4001/api/funding/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  paygConfig.current = { payg_enabled: false };
  createPendingMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", access_token: "tok" });
  createSessionMock.mockResolvedValue({ id: "cs_f", url: "https://checkout.stripe.com/c/pay/cs_f" });
  process.env.STRIPE_PRICE_REPORT_FUNDING = "price_funding_v5";
});

describe("POST /api/funding/checkout — Pricing v5 (D25)", () => {
  it("flag off: the A$3 SKU and price, unchanged", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(createPendingMock).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 300 }));
    const [p] = createSessionMock.mock.calls[0] as [SessionParams];
    expect(p.line_items).toEqual([{ price: "price_funding_A3", quantity: 1 }]);
    expect(p.metadata).toMatchObject({ scope: "funding_report", sku: "sku_funding_report_3aud" });
    expect(p.metadata.pricing_version).toBeUndefined();
  });

  it("flag on: report_funding A$19 from STRIPE_PRICE_REPORT_FUNDING with the ATO invoice", async () => {
    paygConfig.current = { payg_enabled: true };
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(createPendingMock).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1900 }));
    const [p] = createSessionMock.mock.calls[0] as [SessionParams];
    expect(p.line_items).toEqual([{ price: "price_funding_v5", quantity: 1 }]);
    expect(p.metadata).toMatchObject({ scope: "funding_report", sku: "report_funding", pricing_version: "v5" });
    expect(p.invoice_creation.invoice_data.custom_fields[0]).toMatchObject({ name: "Seller ABN" });
    expect(p.invoice_creation.invoice_data.description).toContain("Money Finder");
  });

  it("flag on without the v5 Price → 503 naming the v5 env var", async () => {
    paygConfig.current = { payg_enabled: true };
    delete process.env.STRIPE_PRICE_REPORT_FUNDING;
    const res = await POST(req(GOOD));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("STRIPE_PRICE_REPORT_FUNDING") });
    expect(createPendingMock).not.toHaveBeenCalled();
  });
});
