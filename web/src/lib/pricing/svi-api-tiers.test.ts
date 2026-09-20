import { describe, expect, it } from "vitest";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import {
  INDEX_API_DAILY_CALLS,
  INDEX_API_MONTHLY_AUD,
  INSTITUTIONAL_CONTACT_HREF,
  sviApiTierPriceLabel,
} from "./svi-api-tiers";

describe("svi-api-tiers (G18-A)", () => {
  it("Team price is the index_api plans.csv row, in whole dollars", () => {
    expect(INDEX_API_MONTHLY_AUD).toBe(GENERATED_PLANS_BY_ID.index_api!.price_aud_cents / 100);
    expect(INDEX_API_MONTHLY_AUD).toBe(299);
  });

  it("daily calls match the index_api usage limit", () => {
    expect(INDEX_API_DAILY_CALLS).toBe(
      Number(GENERATED_PLANS_BY_ID.index_api!.usage_limits.api_daily_calls),
    );
  });

  it("labels: A$299 for Team, A$0 for Free, Custom for Institutional", () => {
    expect(sviApiTierPriceLabel(INDEX_API_MONTHLY_AUD)).toBe("A$299");
    expect(sviApiTierPriceLabel(0)).toBe("A$0");
    expect(sviApiTierPriceLabel(null)).toBe("Custom");
  });

  it("Institutional routes to the contact-sales page for VC Enterprise", () => {
    expect(INSTITUTIONAL_CONTACT_HREF).toBe("/contact?plan=investor_vc_ent");
  });
});
