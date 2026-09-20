// G18-D — ensurePortalConfiguration: list → create-once-if-empty → cache.
//
// Production 2026-09-19: the Stripe account had ZERO portal configurations,
// so every portal session failed. These tests pin the self-provisioning
// contract with a mocked Stripe client (no key, no network).

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PORTAL_CANCELLATION_REASONS,
  PORTAL_HEADLINE,
  PortalConfigurationError,
  cachedPortalConfigurationId,
  ensurePortalConfiguration,
  portalConfigurationCreateParams,
  resetPortalConfigurationCache,
  type PortalConfigurationsClient,
} from "./portal-config";

function fakeStripe(existing: Array<{ id: string; is_default?: boolean }>) {
  const list = vi.fn().mockResolvedValue({ data: existing });
  const create = vi.fn().mockResolvedValue({ id: "bpc_created_1" });
  const client: PortalConfigurationsClient = { billingPortal: { configurations: { list, create } } };
  return { client, list, create };
}

beforeEach(() => {
  resetPortalConfigurationCache();
});

describe("ensurePortalConfiguration", () => {
  it("empty list → creates exactly one configuration and caches its id", async () => {
    const { client, list, create } = fakeStripe([]);
    const id = await ensurePortalConfiguration(client);
    expect(id).toBe("bpc_created_1");
    expect(list).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(cachedPortalConfigurationId()).toBe("bpc_created_1");

    // Second call: served from memory — no list, no create.
    const again = await ensurePortalConfiguration(client);
    expect(again).toBe("bpc_created_1");
    expect(list).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("existing configuration → reuses it and NEVER creates", async () => {
    const { client, create } = fakeStripe([{ id: "bpc_existing" }]);
    expect(await ensurePortalConfiguration(client)).toBe("bpc_existing");
    expect(create).not.toHaveBeenCalled();
  });

  it("prefers Stripe's default configuration when several exist", async () => {
    const { client, create } = fakeStripe([{ id: "bpc_other" }, { id: "bpc_default", is_default: true }]);
    expect(await ensurePortalConfiguration(client)).toBe("bpc_default");
    expect(create).not.toHaveBeenCalled();
  });

  it("cold start re-lists (cache is memory only)", async () => {
    const { client, list } = fakeStripe([{ id: "bpc_existing" }]);
    await ensurePortalConfiguration(client);
    resetPortalConfigurationCache();
    await ensurePortalConfiguration(client);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("concurrent cold-start callers share one in-flight create", async () => {
    const { client, create } = fakeStripe([]);
    const [a, b, c] = await Promise.all([
      ensurePortalConfiguration(client),
      ensurePortalConfiguration(client),
      ensurePortalConfiguration(client),
    ]);
    expect([a, b, c]).toEqual(["bpc_created_1", "bpc_created_1", "bpc_created_1"]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("create failure → PortalConfigurationError (typed, not a raw Stripe error) and nothing cached", async () => {
    const { client, create } = fakeStripe([]);
    create.mockRejectedValue(new Error("Stripe 500"));
    await expect(ensurePortalConfiguration(client)).rejects.toBeInstanceOf(PortalConfigurationError);
    expect(cachedPortalConfigurationId()).toBeNull();
    // Retry after the failure is possible (in-flight cleared).
    create.mockResolvedValue({ id: "bpc_created_2" });
    expect(await ensurePortalConfiguration(client)).toBe("bpc_created_2");
  });

  it("list failure → PortalConfigurationError, no create attempted", async () => {
    const { client, list, create } = fakeStripe([]);
    list.mockRejectedValue(new Error("network"));
    await expect(ensurePortalConfiguration(client)).rejects.toMatchObject({ code: "portal_configuration_unavailable" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("portalConfigurationCreateParams — the feature set the portal exposes", () => {
  const params = portalConfigurationCreateParams("https://blockid.au");

  it("cancel at period end, no proration, reasons collected with the five agreed options", () => {
    expect(params.features?.subscription_cancel).toEqual({
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: { enabled: true, options: PORTAL_CANCELLATION_REASONS },
    });
    expect(PORTAL_CANCELLATION_REASONS).toEqual(["too_expensive", "missing_features", "switched_service", "unused", "other"]);
  });

  it("payment method update + invoice history + customer email/address on; subscription_update OFF (plan changes stay in-app)", () => {
    expect(params.features?.payment_method_update).toEqual({ enabled: true });
    expect(params.features?.invoice_history).toEqual({ enabled: true });
    expect(params.features?.customer_update).toEqual({ enabled: true, allowed_updates: ["email", "address", "name"] });
    expect(params.features?.subscription_update).toEqual({ enabled: false });
  });

  it("headline, legal links and return url point at the site", () => {
    expect(params.business_profile?.headline).toBe(PORTAL_HEADLINE);
    expect(params.business_profile?.terms_of_service_url).toBe("https://blockid.au/legal/terms");
    expect(params.business_profile?.privacy_policy_url).toBe("https://blockid.au/privacy");
    expect(params.default_return_url).toBe("https://blockid.au/workspace/billing");
  });
});
