// G35 P1 — Pricing v5 PAYG catalogue integrity (docs/pricing-v5-plan.md §2,
// §6.1, D25–D28). A red test here means a page could advertise one amount
// while Stripe charges another, or a late webhook could fail to resolve a
// paid session — treat it as a pricing incident, never loosen the pin.

import { describe, expect, it } from "vitest";

import { CONFIG_DEFAULTS } from "@/lib/platform-config";
import {
  LEGACY_REPORT_SKUS,
  LEGACY_REPORT_SKU_IDS,
  PAYG_CONFIG_DEFAULTS,
  PAYG_CONFIG_KEYS,
  PAYG_PRICING_VERSION,
  PAYG_SKUS,
  PAYG_SKU_IDS,
  PAYG_SKU_LIST,
  PAYG_TIERS,
  PAYG_TIER_RANK,
  PAYG_UPGRADES,
  displayDrift,
  displayPriceCents,
  isLegacyReportSkuId,
  isPaygSkuId,
  isPaygTier,
  paygSku,
  priceIdForSku,
  reportSkuForTier,
  resolveSkuId,
  skuForPriceId,
  upgradeSkuFor,
  validatePaygConfig,
} from "./v5-payg";
import { REPORT_SKUS } from "./v3-skus";

const ENV = {
  STRIPE_PRICE_REPORT_SNAPSHOT: "price_snap",
  STRIPE_PRICE_REPORT_FULL: "price_full",
  STRIPE_PRICE_REPORT_VERIFIED: "price_ver",
  STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL: "price_up_sf",
  STRIPE_PRICE_UPGRADE_FULL_VERIFIED: "price_up_fv",
  STRIPE_PRICE_REPORT_FUNDING: "price_fund",
  STRIPE_PRICE_TRUST_REPORT_5AUD: "price_legacy_tbr",
  STRIPE_PRICE_ONE_CLICK_REPORT: "price_legacy_oneclick",
  STRIPE_PRICE_FUNDING_REPORT: "price_legacy_funding",
} as const;

describe("v5-payg catalogue — amounts, env vars, ids", () => {
  it("pins the six founder-approved amounts (AUD cents, GST-inclusive)", () => {
    expect(Object.fromEntries(PAYG_SKU_LIST.map((s) => [s.id, s.amountCents]))).toEqual({
      report_snapshot: 1900,
      report_full: 4900,
      report_verified: 14900,
      upgrade_snapshot_full: 3000,
      upgrade_full_verified: 10000,
      report_funding: 1900,
    });
  });

  it("pins the env var per SKU", () => {
    expect(Object.fromEntries(PAYG_SKU_LIST.map((s) => [s.id, s.envVar]))).toEqual({
      report_snapshot: "STRIPE_PRICE_REPORT_SNAPSHOT",
      report_full: "STRIPE_PRICE_REPORT_FULL",
      report_verified: "STRIPE_PRICE_REPORT_VERIFIED",
      upgrade_snapshot_full: "STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL",
      upgrade_full_verified: "STRIPE_PRICE_UPGRADE_FULL_VERIFIED",
      report_funding: "STRIPE_PRICE_REPORT_FUNDING",
    });
  });

  it("env vars are unique across v5 and never reuse a legacy A$3 env var", () => {
    const v5 = PAYG_SKU_LIST.map((s) => s.envVar);
    expect(new Set(v5).size).toBe(v5.length);
    for (const legacy of Object.values(LEGACY_REPORT_SKUS)) expect(v5).not.toContain(legacy.envVar);
  });

  it("ids match their record key, list order = PAYG_SKU_IDS, kinds and revenue kinds are right", () => {
    for (const [key, sku] of Object.entries(PAYG_SKUS)) expect(sku.id).toBe(key);
    expect(PAYG_SKU_LIST.map((s) => s.id)).toEqual([...PAYG_SKU_IDS]);
    expect(PAYG_SKU_LIST.map((s) => s.kind)).toEqual(["report", "report", "report", "upgrade", "upgrade", "funding"]);
    expect(PAYG_SKU_LIST.map((s) => s.revenueKind)).toEqual([
      "report_snapshot",
      "report_full",
      "report_verified",
      "report_upgrade",
      "report_upgrade",
      "report_funding",
    ]);
    expect(PAYG_PRICING_VERSION).toBe("v5");
  });

  it("every amount is a positive whole number of cents and every SKU lists what is included", () => {
    for (const s of PAYG_SKU_LIST) {
      expect(Number.isInteger(s.amountCents), s.id).toBe(true);
      expect(s.amountCents, s.id).toBeGreaterThan(0);
      expect(s.included.length, s.id).toBeGreaterThan(0);
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(s.productName, s.id).toMatch(/^BlockID /);
    }
  });

  it("report tiers are cumulative: Full includes Snapshot's core, Verified includes everything in Full", () => {
    const snap = PAYG_SKUS.report_snapshot.included;
    const full = PAYG_SKUS.report_full.included;
    const ver = PAYG_SKUS.report_verified.included;
    for (const line of snap.filter((l) => l !== "1-page PDF")) expect(full).toContain(line);
    for (const line of full) expect(ver).toContain(line);
    expect(full).toContain("All 16 sections of the Trusted Business Report");
    expect(ver).toContain("Investor Pack PDF");
  });

  it("v5 never prices a report at A$3 or A$1 (D25–D27)", () => {
    for (const s of PAYG_SKU_LIST) {
      expect(s.amountCents, s.id).not.toBe(300);
      expect(s.amountCents, s.id).not.toBe(100);
    }
  });

  it("type guards", () => {
    expect(isPaygSkuId("report_full")).toBe(true);
    expect(isPaygSkuId("sku_trust_report_5aud")).toBe(false);
    expect(isPaygSkuId("toString")).toBe(false);
    expect(isPaygSkuId(undefined)).toBe(false);
    expect(isPaygTier("verified")).toBe(true);
    expect(isPaygTier("funding")).toBe(false);
    expect(isLegacyReportSkuId("sku_funding_report_3aud")).toBe(true);
    expect(isLegacyReportSkuId("report_funding")).toBe(false);
    expect(paygSku("report_verified").tier).toBe("verified");
    expect(PAYG_TIERS.map(reportSkuForTier)).toEqual(["report_snapshot", "report_full", "report_verified"]);
  });
});

describe("v5-payg — upgrades (D28: own one-time Price, never a coupon)", () => {
  it("each upgrade Price equals the difference of the two tier Prices (3000 / 10000)", () => {
    for (const u of PAYG_UPGRADES) {
      const diff = PAYG_SKUS[reportSkuForTier(u.to)].amountCents - PAYG_SKUS[reportSkuForTier(u.from)].amountCents;
      expect(PAYG_SKUS[u.sku].amountCents, u.sku).toBe(diff);
      expect(PAYG_SKUS[u.sku].fromTier).toBe(u.from);
      expect(PAYG_SKUS[u.sku].tier).toBe(u.to);
      expect(PAYG_TIER_RANK[u.to]).toBeGreaterThan(PAYG_TIER_RANK[u.from]);
    }
    expect(PAYG_SKUS.upgrade_snapshot_full.amountCents).toBe(3000);
    expect(PAYG_SKUS.upgrade_full_verified.amountCents).toBe(10000);
  });

  it("upgradeSkuFor maps the two sold paths and refuses everything else", () => {
    expect(upgradeSkuFor("snapshot", "full")).toBe("upgrade_snapshot_full");
    expect(upgradeSkuFor("full", "verified")).toBe("upgrade_full_verified");
    expect(upgradeSkuFor("snapshot", "verified")).toBeNull();
    expect(upgradeSkuFor("full", "snapshot")).toBeNull();
    expect(upgradeSkuFor("verified", "full")).toBeNull();
    expect(upgradeSkuFor("full", "full")).toBeNull();
  });

  it("an upgrade lists only what it adds", () => {
    expect(PAYG_SKUS.upgrade_snapshot_full.included).not.toContain("SVI score and 8-dimension radar");
    expect(PAYG_SKUS.upgrade_snapshot_full.included).toContain("All 16 sections of the Trusted Business Report");
    expect(PAYG_SKUS.upgrade_full_verified.included).toEqual([
      "Evidence reviewed by the BlockID team",
      "Investor Pack PDF",
      "\"BlockID Reviewed\" badge",
      "Delivered within 2 business days",
    ]);
  });
});

describe("v5-payg — credits (D27 / D25)", () => {
  it("Snapshot 19 / Full 49 / Money Finder 19 credits; Verified and upgrades are card-only", () => {
    expect(PAYG_SKUS.report_snapshot.creditCost).toBe(19);
    expect(PAYG_SKUS.report_full.creditCost).toBe(49);
    expect(PAYG_SKUS.report_funding.creditCost).toBe(19);
    expect(PAYG_SKUS.report_verified.creditCost).toBeNull();
    expect(PAYG_SKUS.upgrade_snapshot_full.creditCost).toBeNull();
    expect(PAYG_SKUS.upgrade_full_verified.creditCost).toBeNull();
  });

  // FEATURE_COSTS.report_snapshot / report_full must equal the catalogue — the
  // credits module is server-only, so read the literal from source.
  it("FEATURE_COSTS.report_snapshot / report_full (lib/credits.ts) equal the catalogue credit costs", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "credits.ts"), "utf8");
    const pick = (key: string) => Number(new RegExp(`^\\s*${key}:\\s*([0-9.]+),`, "m").exec(src)?.[1]);
    expect(pick("report_snapshot")).toBe(PAYG_SKUS.report_snapshot.creditCost);
    expect(pick("report_full")).toBe(PAYG_SKUS.report_full.creditCost);
  });
});

describe("v5-payg — Stripe Price id lookup (forward + reverse + legacy)", () => {
  it("priceIdForSku reads the SKU's env var; blank / unset → null", () => {
    expect(priceIdForSku("report_full", ENV)).toBe("price_full");
    expect(priceIdForSku("report_funding", ENV)).toBe("price_fund");
    expect(priceIdForSku("sku_trust_report_5aud", ENV)).toBe("price_legacy_tbr");
    expect(priceIdForSku("report_full", {})).toBeNull();
    expect(priceIdForSku("report_full", { STRIPE_PRICE_REPORT_FULL: "   " })).toBeNull();
    expect(priceIdForSku("report_full", { STRIPE_PRICE_REPORT_FULL: " price_x \n" })).toBe("price_x");
  });

  it("skuForPriceId resolves every v5 Price id to its SKU", () => {
    for (const s of PAYG_SKU_LIST) {
      const r = skuForPriceId(ENV[s.envVar as keyof typeof ENV], ENV);
      expect(r, s.id).toEqual({ sku: s.id, legacy: false, pricingVersion: "v5", fulfilAs: s.id });
    }
  });

  it("skuForPriceId still resolves the three legacy A$3 Prices (late webhooks after the cut-over)", () => {
    expect(skuForPriceId("price_legacy_tbr", ENV)).toEqual({ sku: "sku_trust_report_5aud", legacy: true, pricingVersion: "v3", fulfilAs: "report_full" });
    expect(skuForPriceId("price_legacy_oneclick", ENV)).toEqual({ sku: "sku_one_click_report_3aud", legacy: true, pricingVersion: "v3", fulfilAs: "report_full" });
    expect(skuForPriceId("price_legacy_funding", ENV)).toEqual({ sku: "sku_funding_report_3aud", legacy: true, pricingVersion: "v3", fulfilAs: "report_funding" });
  });

  it("skuForPriceId returns null for unknown, blank and nullish ids, and never matches an unset env var", () => {
    expect(skuForPriceId("price_nope", ENV)).toBeNull();
    expect(skuForPriceId("", ENV)).toBeNull();
    expect(skuForPriceId(null, ENV)).toBeNull();
    expect(skuForPriceId(undefined, ENV)).toBeNull();
    expect(skuForPriceId("price_full", {})).toBeNull();
  });

  it("resolveSkuId accepts v5 and legacy metadata values only", () => {
    expect(resolveSkuId("report_verified")).toMatchObject({ sku: "report_verified", legacy: false });
    expect(resolveSkuId("sku_one_click_report_3aud")).toMatchObject({ legacy: true, fulfilAs: "report_full" });
    expect(resolveSkuId("sku_trust_report_credits")).toBeNull();
    expect(resolveSkuId(42)).toBeNull();
  });

  it("the legacy table mirrors v3-skus.ts (ids + A$3 amounts) so nothing sold under v3 is orphaned", () => {
    expect([...LEGACY_REPORT_SKU_IDS].sort()).toEqual(REPORT_SKUS.map((s) => s.id).sort());
    for (const v3 of REPORT_SKUS) {
      expect(LEGACY_REPORT_SKUS[v3.id].amountCents, v3.id).toBe(v3.unit_amount_incl_gst_cents);
    }
    expect(LEGACY_REPORT_SKUS.sku_trust_report_5aud.envVar).toBe("STRIPE_PRICE_TRUST_REPORT_5AUD");
    expect(LEGACY_REPORT_SKUS.sku_one_click_report_3aud.envVar).toBe("STRIPE_PRICE_ONE_CLICK_REPORT");
    expect(LEGACY_REPORT_SKUS.sku_funding_report_3aud.envVar).toBe("STRIPE_PRICE_FUNDING_REPORT");
  });
});

describe("v5-payg — platform_config display prices + validation", () => {
  it("PAYG_CONFIG_DEFAULTS: flag OFF, display = catalogue, SLA 2, cap 5 — and CONFIG_DEFAULTS carries them", () => {
    expect(PAYG_CONFIG_DEFAULTS).toEqual({
      payg_enabled: false,
      payg_snapshot_cents: 1900,
      payg_full_cents: 4900,
      payg_verified_cents: 14900,
      verified_sla_business_days: 2,
      payg_verified_max_open: 5,
    });
    for (const k of PAYG_CONFIG_KEYS) expect(CONFIG_DEFAULTS[k], k).toBe(PAYG_CONFIG_DEFAULTS[k]);
  });

  it("displayPriceCents = catalogue with defaults / no config, and reads config for report tiers", () => {
    for (const s of PAYG_SKU_LIST) {
      expect(displayPriceCents(s.id), s.id).toBe(s.amountCents);
      expect(displayPriceCents(s.id, CONFIG_DEFAULTS), s.id).toBe(s.amountCents);
      expect(displayPriceCents(s.id, null), s.id).toBe(s.amountCents);
    }
    const cfg = { payg_snapshot_cents: 2900, payg_full_cents: 5900, payg_verified_cents: 19900 };
    expect(displayPriceCents("report_snapshot", cfg)).toBe(2900);
    expect(displayPriceCents("report_full", cfg)).toBe(5900);
    expect(displayPriceCents("report_verified", cfg)).toBe(19900);
    // Upgrades show the difference of the displayed tiers; Money Finder stays on the catalogue.
    expect(displayPriceCents("upgrade_snapshot_full", cfg)).toBe(3000);
    expect(displayPriceCents("upgrade_full_verified", cfg)).toBe(14000);
    expect(displayPriceCents("report_funding", cfg)).toBe(1900);
  });

  it("displayPriceCents ignores an invalid config value (falls back to the catalogue)", () => {
    expect(displayPriceCents("report_full", { payg_full_cents: Number.NaN })).toBe(4900);
    expect(displayPriceCents("report_full", { payg_full_cents: 0 })).toBe(4900);
    expect(displayPriceCents("report_full", { payg_full_cents: 49.5 })).toBe(4900);
    expect(displayPriceCents("report_full", { payg_full_cents: "4900" as unknown as number })).toBe(4900);
    // An inverted ladder never yields a negative upgrade price.
    expect(displayPriceCents("upgrade_snapshot_full", { payg_snapshot_cents: 6000, payg_full_cents: 4900 })).toBe(3000);
  });

  it("displayDrift lists only SKUs whose shown price differs from the Stripe catalogue", () => {
    expect(displayDrift(CONFIG_DEFAULTS)).toEqual([]);
    const drift = displayDrift({ payg_full_cents: 5900 });
    expect(drift.map((d) => d.sku)).toEqual(["report_full", "upgrade_snapshot_full", "upgrade_full_verified"]);
    expect(drift[0]).toEqual({ sku: "report_full", displayCents: 5900, catalogueCents: 4900 });
  });

  it("validatePaygConfig accepts the defaults and a sane override", () => {
    expect(validatePaygConfig(PAYG_CONFIG_DEFAULTS)).toEqual([]);
    expect(validatePaygConfig({ ...PAYG_CONFIG_DEFAULTS, payg_enabled: true, payg_full_cents: 5900, payg_verified_max_open: 0 })).toEqual([]);
    expect(validatePaygConfig({})).toEqual([]);
  });

  it("validatePaygConfig rejects bad cents, a broken ladder, a bad SLA, a bad cap and a non-boolean flag", () => {
    expect(validatePaygConfig({ payg_snapshot_cents: 50 })).toHaveLength(1);
    expect(validatePaygConfig({ payg_full_cents: 4900.5 })).toHaveLength(1);
    expect(validatePaygConfig({ payg_verified_cents: 200_000 })).toHaveLength(1);
    expect(validatePaygConfig({ payg_snapshot_cents: 4900 })[0]).toMatch(/Snapshot < Full < Verified/);
    expect(validatePaygConfig({ payg_full_cents: 14900 })[0]).toMatch(/Snapshot < Full < Verified/);
    expect(validatePaygConfig({ verified_sla_business_days: 0 })[0]).toMatch(/verified_sla_business_days/);
    expect(validatePaygConfig({ verified_sla_business_days: 1.5 })).toHaveLength(1);
    expect(validatePaygConfig({ verified_sla_business_days: 11 })).toHaveLength(1);
    expect(validatePaygConfig({ payg_verified_max_open: -1 })[0]).toMatch(/payg_verified_max_open/);
    expect(validatePaygConfig({ payg_verified_max_open: 101 })).toHaveLength(1);
    expect(validatePaygConfig({ payg_enabled: "yes" as unknown as boolean })[0]).toMatch(/payg_enabled/);
  });
});
