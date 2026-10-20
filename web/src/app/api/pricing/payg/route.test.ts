// G35 P3 — GET /api/pricing/payg: public DISPLAY prices for client surfaces.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  return { readPaygConfig: async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current }) };
});

import { GET } from "./route";

beforeEach(() => {
  paygConfig.current = { payg_enabled: false };
});

describe("GET /api/pricing/payg", () => {
  it("flag off → { enabled: false } only", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("flag on → tiers with display prices, delivery and Money Finder A$19 / 19 credits", async () => {
    paygConfig.current = { payg_enabled: true, payg_snapshot_cents: 2100 };
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ok: true, enabled: true, billingNote: "One-off, inc. GST.", slaBusinessDays: 2 });
    expect(body.tiers.map((t: { tier: string; priceLabel: string }) => [t.tier, t.priceLabel])).toEqual([
      ["snapshot", "A$21"],
      ["full", "A$49"],
      ["verified", "A$149"],
    ]);
    expect(body.funding).toEqual({ sku: "report_funding", amountCents: 1900, priceLabel: "A$19", credits: 19 });
  });
});
