// G35 P3 — readPaygConfig / isPaygEnabled fail CLOSED and sanitise values;
// oneOffInvoiceCreation carries the ATO tax-invoice fields (gap G3).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getPlatformConfigMock = vi.fn();
vi.mock("@/lib/platform-config", () => ({ getPlatformConfig: () => getPlatformConfigMock() }));

import { isPaygEnabled, readPaygConfig } from "./payg-flag";
import { PAYG_CONFIG_DEFAULTS } from "./v5-payg";
import { oneOffInvoiceCreation } from "@/lib/stripe/one-off-invoice";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";

beforeEach(() => getPlatformConfigMock.mockReset());

describe("readPaygConfig", () => {
  it("defaults (off) when platform_config says nothing", async () => {
    getPlatformConfigMock.mockResolvedValue({});
    expect(await readPaygConfig()).toEqual(PAYG_CONFIG_DEFAULTS);
    expect(await isPaygEnabled()).toBe(false);
  });

  it("on only for a literal true; out-of-range SLA / cap fall back to defaults", async () => {
    getPlatformConfigMock.mockResolvedValue({ payg_enabled: "true", verified_sla_business_days: 99, payg_verified_max_open: -1 });
    const cfg = await readPaygConfig();
    expect(cfg.payg_enabled).toBe(false);
    expect(cfg.verified_sla_business_days).toBe(2);
    expect(cfg.payg_verified_max_open).toBe(5);
    getPlatformConfigMock.mockResolvedValue({ payg_enabled: true, verified_sla_business_days: 3, payg_verified_max_open: 0 });
    expect(await readPaygConfig()).toMatchObject({ payg_enabled: true, verified_sla_business_days: 3, payg_verified_max_open: 0 });
  });

  it("fails closed when platform_config cannot be read", async () => {
    getPlatformConfigMock.mockRejectedValue(new Error("db down"));
    expect(await isPaygEnabled()).toBe(false);
  });
});

describe("oneOffInvoiceCreation (G3)", () => {
  it("Seller ABN custom field + GST footer + product description", () => {
    expect(oneOffInvoiceCreation("BlockID Report — Full")).toEqual({
      enabled: true,
      invoice_data: {
        description: "BlockID.au — BlockID Report — Full",
        custom_fields: [{ name: "Seller ABN", value: LEGAL_ENTITY.abn }],
        footer: expect.stringMatching(/ACN .* · GST-registered$/),
      },
    });
  });
});
