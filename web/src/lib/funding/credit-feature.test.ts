// G35 P5 (D25): the credits a member is shown for a Money Finder report must
// equal the credits debited, in both payg_enabled states.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null, isSupabaseConfigured: () => false }));
vi.mock("@/lib/email", () => ({ sendCreditLowAlert: vi.fn(async () => ({ ok: true, id: "test" })) }));

import { FEATURE_COSTS } from "@/lib/credits";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import { PAYG_SKUS } from "@/lib/pricing/v5-payg";
import { fundingCreditFeature } from "./credit-feature";

describe("fundingCreditFeature", () => {
  it("flag OFF debits the legacy grant_match key — unchanged", () => {
    expect(fundingCreditFeature(false)).toBe("grant_match");
    expect(FEATURE_COSTS[fundingCreditFeature(PAYG_OFF_VIEW.enabled)]).toBe(PAYG_OFF_VIEW.fundingCredits);
    expect(FEATURE_COSTS.grant_match).toBe(3);
  });

  it("flag ON debits report_funding = the D25 catalogue credit cost the paywall shows", () => {
    expect(fundingCreditFeature(true)).toBe("report_funding");
    expect(FEATURE_COSTS[fundingCreditFeature(PAYG_ON_VIEW.enabled)]).toBe(PAYG_ON_VIEW.fundingCredits);
    expect(FEATURE_COSTS.report_funding).toBe(PAYG_SKUS.report_funding.creditCost);
    expect(FEATURE_COSTS.report_funding).toBe(19);
  });
});
