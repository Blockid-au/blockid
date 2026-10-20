// G35 Pricing v5 P3 — the review-before-pay offer (plan §6.4.1 / D28 / D29).

import { describe, expect, it } from "vitest";
import {
  PAYG_BILLING_NOTE,
  VERIFIED_FULL_MESSAGE,
  buildPaygOffer,
  highestOwnedOrder,
  paygDeliveryText,
  paygTierLabel,
  priceLabelCents,
  resolveUpgradeSource,
  verifiedCapacityLeft,
} from "./payg-offer";
import { PAYG_CONFIG_DEFAULTS } from "./v5-payg";

const ON = { ...PAYG_CONFIG_DEFAULTS, payg_enabled: true };

describe("buildPaygOffer", () => {
  it("flag off → { enabled: false } (the A$3 surfaces render unchanged)", () => {
    expect(buildPaygOffer({ config: PAYG_CONFIG_DEFAULTS, orders: [], openVerifiedCount: 0 })).toEqual({ enabled: false });
    expect(buildPaygOffer({ config: null, orders: [], openVerifiedCount: 0 })).toEqual({ enabled: false });
  });

  it("flag on → three tiers with included bullets, display price, one-off GST note and delivery", () => {
    const offer = buildPaygOffer({ config: ON, orders: [], openVerifiedCount: 0 });
    if (!offer.enabled) throw new Error("expected enabled");
    expect(offer.billingNote).toBe(PAYG_BILLING_NOTE);
    expect(offer.billingNote).toBe("One-off, GST incl.");
    expect(offer.tiers.map((t) => [t.tier, t.sku, t.amountCents, t.priceLabel, t.creditCost])).toEqual([
      ["snapshot", "report_snapshot", 1900, "A$19", 19],
      ["full", "report_full", 4900, "A$49", 49],
      ["verified", "report_verified", 14900, "A$149", null],
    ]);
    expect(offer.tiers[2].delivery).toBe("Within 2 business days (team review)");
    expect(offer.tiers[0].delivery).toMatch(/within an hour/);
    expect(offer.tiers.every((t) => t.available && t.included.length >= 4)).toBe(true);
    expect(offer.upgrades).toEqual([]);
    expect(offer.owned).toBeNull();
  });

  it("display prices come from platform_config (charged amount stays the Stripe Price)", () => {
    const offer = buildPaygOffer({ config: { ...ON, payg_full_cents: 5500, verified_sla_business_days: 3 }, orders: [], openVerifiedCount: 0 });
    if (!offer.enabled) throw new Error("expected enabled");
    expect(offer.tiers[1]).toMatchObject({ amountCents: 5500, priceLabel: "A$55" });
    expect(offer.tiers[2].delivery).toBe("Within 3 business days (team review)");
  });

  it("D29: Verified is unavailable while open Verified work ≥ payg_verified_max_open (0 hides it)", () => {
    const full = buildPaygOffer({ config: ON, orders: [], openVerifiedCount: 5 });
    if (!full.enabled) throw new Error("expected enabled");
    expect(full.tiers[2]).toMatchObject({ available: false, unavailableReason: VERIFIED_FULL_MESSAGE });
    expect(full.tiers[1].available).toBe(true);
    const zero = buildPaygOffer({ config: { ...ON, payg_verified_max_open: 0 }, orders: [], openVerifiedCount: 0 });
    if (!zero.enabled) throw new Error("expected enabled");
    expect(zero.tiers[2].available).toBe(false);
    expect(verifiedCapacityLeft(ON, 4)).toBe(true);
    expect(verifiedCapacityLeft(ON, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("D28: a delivered Snapshot owner is offered Snapshot → Full at the price difference", () => {
    const offer = buildPaygOffer({
      config: ON,
      orders: [{ id: "snap-1", status: "READY", product_sku: "report_snapshot" }],
      openVerifiedCount: 0,
    });
    if (!offer.enabled) throw new Error("expected enabled");
    expect(offer.upgrades).toEqual([
      expect.objectContaining({ from: "snapshot", to: "full", sku: "upgrade_snapshot_full", amountCents: 3000, priceLabel: "A$30", orderId: "snap-1", available: true }),
    ]);
    expect(offer.owned).toEqual({ orderId: "snap-1", tier: "snapshot", status: "READY" });
  });

  it("D28: a delivered Full owner (incl. legacy A$3) is offered Full → Verified A$100, hidden when Verified is full", () => {
    const legacy = [{ id: "a3", status: "READY", product_sku: "sku_trust_report_5aud" }];
    const offer = buildPaygOffer({ config: ON, orders: legacy, openVerifiedCount: 0 });
    if (!offer.enabled) throw new Error("expected enabled");
    expect(offer.upgrades).toEqual([expect.objectContaining({ from: "full", to: "verified", amountCents: 10000, orderId: "a3", available: true })]);
    const busy = buildPaygOffer({ config: ON, orders: legacy, openVerifiedCount: 9 });
    if (!busy.enabled) throw new Error("expected enabled");
    expect(busy.upgrades[0]).toMatchObject({ available: false, unavailableReason: VERIFIED_FULL_MESSAGE });
  });

  it("no upgrade while the lower tier is still being prepared, or once a higher tier is held", () => {
    const preparing = buildPaygOffer({ config: ON, orders: [{ id: "s", status: "GENERATING", product_sku: "report_snapshot" }], openVerifiedCount: 0 });
    if (!preparing.enabled) throw new Error("expected enabled");
    expect(preparing.upgrades).toEqual([]);
    const both = buildPaygOffer({
      config: ON,
      orders: [
        { id: "s", status: "READY", product_sku: "report_snapshot" },
        { id: "u", status: "READY", product_sku: "upgrade_snapshot_full" },
      ],
      openVerifiedCount: 0,
    });
    if (!both.enabled) throw new Error("expected enabled");
    // Snapshot was lifted to Full by the upgrade order → only Full → Verified remains.
    expect(both.upgrades.map((u) => [u.sku, u.orderId])).toEqual([["upgrade_full_verified", "u"]]);
  });
});

describe("resolveUpgradeSource (server truth for the checkout)", () => {
  it("codes: no path / not owned / already higher / in progress / ok", () => {
    expect(resolveUpgradeSource([], "verified")).toMatchObject({ ok: false, code: "no_upgrade_path" });
    expect(resolveUpgradeSource([], "snapshot")).toMatchObject({ ok: false, code: "not_owned" });
    expect(resolveUpgradeSource([{ id: "x", status: "REFUNDED", product_sku: "report_snapshot" }], "snapshot")).toMatchObject({ ok: false, code: "not_owned" });
    expect(resolveUpgradeSource([{ id: "f", status: "READY", product_sku: "report_full" }], "snapshot")).toMatchObject({ ok: false, code: "already_higher" });
    expect(resolveUpgradeSource([{ id: "s", status: "PAID", product_sku: "report_snapshot" }], "snapshot")).toMatchObject({ ok: false, code: "in_progress" });
    expect(resolveUpgradeSource([{ id: "s", status: "SHARED", product_sku: "report_snapshot" }], "snapshot")).toEqual({ ok: true, orderId: "s", sku: "upgrade_snapshot_full", to: "full" });
  });

  it("Funding / unknown SKUs never count as an owned report", () => {
    expect(highestOwnedOrder([{ id: "m", status: "READY", product_sku: "report_funding" }, { id: "z", status: "READY", product_sku: "bogus" }])).toBeNull();
  });
});

describe("labels", () => {
  it("tier label, delivery and price formatting", () => {
    expect(paygTierLabel("verified")).toBe("Verified report");
    expect(paygDeliveryText("verified", 1)).toBe("Within 1 business day (team review)");
    expect(paygDeliveryText("verified", 0)).toBe("Within 2 business days (team review)");
    expect(priceLabelCents(1900)).toBe("A$19");
    expect(priceLabelCents(1950)).toBe("A$19.50");
  });
});
