// Colocated vitest for POST /api/guest-analysis/create-order — G35 D26.
//
// flag off → the A$3 One-Click SKU exactly as before (a `tier` → 403);
// flag on  → tier snapshot | full required, v5 Stripe Price, amount + tier
//            stamped on the guest row (report_data.payg), metadata.sku = the
//            v5 SKU, ATO invoice; Verified needs sign-in (400).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const { createSessionMock, priceMap } = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  priceMap: { one_click_report: "price_one_click_A3" } as Record<string, string | undefined>,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: (p: unknown) => createSessionMock(p) } } }),
  STRIPE_PRICE_MAP: priceMap,
}));

import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
let db: PaygFakeDb;
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true, getSupabaseAdmin: () => db }));

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

const GOOD = { email: "founder@example.com", inputType: "website_url", inputValue: "https://acme.com.au" };
const req = (b: unknown) => new Request("http://localhost/api/guest-analysis/create-order", { method: "POST", body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  db = new PaygFakeDb({ guest_analyses: [] });
  paygConfig.current = { payg_enabled: false };
  createSessionMock.mockResolvedValue({ id: "cs_g", url: "https://checkout.stripe.com/c/pay/cs_g" });
  process.env.STRIPE_PRICE_REPORT_SNAPSHOT = "price_snap";
  process.env.STRIPE_PRICE_REPORT_FULL = "price_full";
});

describe("POST /api/guest-analysis/create-order", () => {
  it("flag off: A$3 One-Click SKU, no tier stamp, invoice kept", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    const row = db.rows("guest_analyses")[0];
    expect(row).toMatchObject({ amount_paid_aud_cents: 300, status: "pending", stripe_session_id: "cs_g" });
    expect(row.report_data).toBeUndefined();
    const [p] = createSessionMock.mock.calls[0] as [SessionParams];
    expect(p.line_items).toEqual([{ price: "price_one_click_A3", quantity: 1 }]);
    expect(p.metadata).toEqual({ scope: "guest_analysis", guest_analysis_id: row.id, sku: "sku_one_click_report_3aud", email: "founder@example.com" });
    expect(p.invoice_creation.invoice_data.custom_fields[0]).toMatchObject({ name: "Seller ABN" });
  });

  it("flag off: a tier is refused (403) before any row or session", async () => {
    const res = await POST(req({ ...GOOD, tier: "full" }));
    expect(res.status).toBe(403);
    expect(db.rows("guest_analyses")).toHaveLength(0);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["snapshot", "report_snapshot", "price_snap", 1900],
    ["full", "report_full", "price_full", 4900],
  ])("flag on: %s → %s at %s (A$ %s cents), tier stamped on report_data.payg", async (tier, sku, price, cents) => {
    paygConfig.current = { payg_enabled: true };
    const res = await POST(req({ ...GOOD, tier }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tier, sku, amountCents: cents });
    const row = db.rows("guest_analyses")[0];
    expect(row).toMatchObject({ amount_paid_aud_cents: cents, report_data: { payg: { tier, sku, pricing_version: "v5" } } });
    const [p] = createSessionMock.mock.calls[0] as [SessionParams];
    expect(p.line_items).toEqual([{ price, quantity: 1 }]);
    expect(p.metadata).toMatchObject({ scope: "guest_analysis", sku, bid_tier: tier, pricing_version: "v5" });
    expect(p.invoice_creation.invoice_data.description).toContain("BlockID Report");
  });

  it("flag on: Verified needs sign-in; a missing tier is 400", async () => {
    paygConfig.current = { payg_enabled: true };
    const v = await POST(req({ ...GOOD, tier: "verified" }));
    expect(v.status).toBe(400);
    expect(await v.json()).toMatchObject({ code: "sign_in_required" });
    const none = await POST(req(GOOD));
    expect(none.status).toBe(400);
    expect(await none.json()).toMatchObject({ code: "tier_required" });
    expect(db.rows("guest_analyses")).toHaveLength(0);
  });

  it("flag on without the v5 Price → 503", async () => {
    paygConfig.current = { payg_enabled: true };
    delete process.env.STRIPE_PRICE_REPORT_FULL;
    const res = await POST(req({ ...GOOD, tier: "full" }));
    expect(res.status).toBe(503);
    expect(db.rows("guest_analyses")).toHaveLength(0);
  });
});
