// G21 P0-C — the paid Cohort Validation Pilot SKUs: amounts, caps, env var
// NAMES, the price label, the configured check (by name, never by value) and
// the includes / metrics lists the offer cards render.

import { afterEach, describe, expect, it } from "vitest";
import { STRIPE_PRICE_CATALOGUE } from "./stripe-map";
import {
  PILOT_CANCEL_PATH,
  PILOT_CONTACT_FALLBACK,
  PILOT_ENTITLEMENT_DAYS,
  PILOT_INCLUDES,
  PILOT_SKU_IDS,
  PILOT_SKUS,
  PILOT_SUCCESS_METRICS,
  PILOT_SUCCESS_PATH,
  formatPilotPrice,
  formatPilotPriceLong,
  getPilotSku,
  isPilotSkuConfigured,
  isPilotSkuId,
} from "./pilot-skus";

const ENV_25 = PILOT_SKUS.cohort_pilot_25.envVar;
const ENV_50 = PILOT_SKUS.cohort_pilot_50.envVar;

afterEach(() => {
  delete process.env[ENV_25];
  delete process.env[ENV_50];
});

describe("PILOT_SKUS — the two sizes", () => {
  it("A$1,500 / 25 applicants and A$2,500 / 50 applicants, one-off, 90-day entitlement", () => {
    expect(PILOT_SKU_IDS).toEqual(["cohort_pilot_25", "cohort_pilot_50"]);
    expect(PILOT_SKUS.cohort_pilot_25.amountInclGstCents).toBe(150000);
    expect(PILOT_SKUS.cohort_pilot_25.applicantsCap).toBe(25);
    expect(PILOT_SKUS.cohort_pilot_50.amountInclGstCents).toBe(250000);
    expect(PILOT_SKUS.cohort_pilot_50.applicantsCap).toBe(50);
    for (const id of PILOT_SKU_IDS) {
      expect(PILOT_SKUS[id].id).toBe(id);
      expect(PILOT_SKUS[id].entitlementDays).toBe(PILOT_ENTITLEMENT_DAYS);
      expect(PILOT_SKUS[id].name).toMatch(/Cohort Validation Pilot/);
      expect(PILOT_SKUS[id].name).toContain(`${PILOT_SKUS[id].applicantsCap} applicants`);
    }
    expect(PILOT_ENTITLEMENT_DAYS).toBe(90);
  });

  it("env var NAMES follow the STRIPE_PRICE_* convention and match the catalogue rows", () => {
    expect(ENV_25).toBe("STRIPE_PRICE_COHORT_PILOT_25");
    expect(ENV_50).toBe("STRIPE_PRICE_COHORT_PILOT_50");
    for (const id of PILOT_SKU_IDS) {
      const row = STRIPE_PRICE_CATALOGUE[PILOT_SKUS[id].envVar];
      expect(row, `${id} catalogue row`).toBeDefined();
      expect(row!.amount_cents).toBe(PILOT_SKUS[id].amountInclGstCents);
      expect(row!.interval).toBe("one_off");
      expect(row!.tax_behavior).toBe("inclusive");
      expect(row!.plan_id).toBe(id);
    }
  });

  it("the granted tier's profile cap covers the applicant cap (Cohort 25 → 25, Cohort 100 → 50)", async () => {
    const { GENERATED_PLANS_BY_ID } = await import("@/config/pricing/plans.generated");
    for (const id of PILOT_SKU_IDS) {
      const tier = GENERATED_PLANS_BY_ID[PILOT_SKUS[id].planTier]!;
      expect(tier.usage_limits.profiles).toBeGreaterThanOrEqual(PILOT_SKUS[id].applicantsCap);
    }
  });

  it("isPilotSkuId narrows; getPilotSku returns the row", () => {
    expect(isPilotSkuId("cohort_pilot_25")).toBe(true);
    expect(isPilotSkuId("cohort_pilot_50")).toBe(true);
    expect(isPilotSkuId("founder_package")).toBe(false);
    expect(isPilotSkuId(null)).toBe(false);
    expect(getPilotSku("cohort_pilot_50").applicantsCap).toBe(50);
  });
});

describe("formatPilotPrice — formatAud, never a literal", () => {
  it("A$1,500 / A$2,500 and the inc. GST long form", () => {
    expect(formatPilotPrice("cohort_pilot_25")).toBe("A$1,500");
    expect(formatPilotPrice("cohort_pilot_50")).toBe("A$2,500");
    expect(formatPilotPriceLong("cohort_pilot_25")).toBe("A$1,500 inc. GST");
    expect(formatPilotPriceLong("cohort_pilot_50")).toBe("A$2,500 inc. GST");
  });
});

describe("isPilotSkuConfigured — by env var NAME, boolean only", () => {
  it("false when unset or blank, true once the founder sets the variable", () => {
    expect(isPilotSkuConfigured("cohort_pilot_25")).toBe(false);
    process.env[ENV_25] = "   ";
    expect(isPilotSkuConfigured("cohort_pilot_25")).toBe(false);
    process.env[ENV_25] = "price_test_placeholder";
    expect(isPilotSkuConfigured("cohort_pilot_25")).toBe(true);
    expect(isPilotSkuConfigured("cohort_pilot_50")).toBe(false);
  });
});

describe("routes + offer lists", () => {
  it("fallback, success and cancel paths", () => {
    expect(PILOT_CONTACT_FALLBACK).toBe("/contact?topic=pilot");
    expect(PILOT_SUCCESS_PATH).toBe("/workspace/accelerator?pilot=paid");
    expect(PILOT_CANCEL_PATH).toBe("/solutions/accelerator#pilot");
  });

  it("eight inclusions and six success metrics, none naming a price or an agent count", () => {
    expect(PILOT_INCLUDES).toHaveLength(8);
    expect(PILOT_SUCCESS_METRICS).toHaveLength(6);
    const text = [...PILOT_INCLUDES, ...PILOT_SUCCESS_METRICS].join("\n");
    expect(text).not.toMatch(/A\$\d/);
    expect(text).not.toMatch(/\d+ (AI )?agents/i);
    expect(text).toMatch(/Startup Value Index/);
    expect(text).toMatch(/Final cohort report/);
    expect(text).toMatch(/Review time per startup/);
  });
});
