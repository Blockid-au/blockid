import { describe, expect, it } from "vitest";
import {
  CREATE_STARTUP_ERROR_MESSAGES,
  decideCreateStartup,
  normaliseCreateStartupInput,
  WHOLESALE_ATTRIBUTION_SOURCE,
  WHOLESALE_PLAN_ID,
  type WholesaleResellerRow,
} from "./create-startup";

const baseReseller: WholesaleResellerRow = {
  id: "res-1",
  code: "INFOVISION",
  display_name: "InfoVision",
  status: "active",
  can_create_startups: true,
  billing_model: "wholesale",
  allowed_tiers: [0, 10, 20, 30, 40],
};

const validInput = {
  founder_email: "Founder@Example.com  ",
  company_name: "  Acme Pty Ltd  ",
  plan_tier: "founder_growth",
  discount_tier: 20,
  founder_name: "  Jane Doe  ",
};

const promoRow = { id: "promo-20", code: "INFOVISION20", tier_pct: 20 };

describe("normaliseCreateStartupInput", () => {
  it("normalises email + trims strings on happy path", () => {
    const r = normaliseCreateStartupInput(validInput);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      founder_email: "founder@example.com",
      company_name: "Acme Pty Ltd",
      plan_tier: "founder_growth",
      discount_tier: 20,
      founder_name: "Jane Doe",
    });
  });

  it("accepts a numeric discount_tier passed as a string", () => {
    const r = normaliseCreateStartupInput({ ...validInput, discount_tier: "30" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.discount_tier).toBe(30);
  });

  it("emits invalid_email for a malformed address", () => {
    const r = normaliseCreateStartupInput({ ...validInput, founder_email: "not-an-email" });
    expect(r).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("emits company_name_required for an empty company_name", () => {
    const r = normaliseCreateStartupInput({ ...validInput, company_name: "   " });
    expect(r).toEqual({ ok: false, reason: "company_name_required" });
  });

  it("emits company_name_too_long past 200 chars", () => {
    const r = normaliseCreateStartupInput({ ...validInput, company_name: "x".repeat(201) });
    expect(r).toEqual({ ok: false, reason: "company_name_too_long" });
  });

  it("emits invalid_plan_tier for anything other than founder_growth", () => {
    const r = normaliseCreateStartupInput({ ...validInput, plan_tier: "founder_scale" });
    expect(r).toEqual({ ok: false, reason: "invalid_plan_tier" });
  });

  it("emits invalid_discount_tier for tiers outside {0,10,20,30,40}", () => {
    const r = normaliseCreateStartupInput({ ...validInput, discount_tier: 15 });
    expect(r).toEqual({ ok: false, reason: "invalid_discount_tier" });
  });

  it("nulls founder_name when blank", () => {
    const r = normaliseCreateStartupInput({ ...validInput, founder_name: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.founder_name).toBeNull();
  });

  it("clamps founder_name at 120 chars", () => {
    const r = normaliseCreateStartupInput({ ...validInput, founder_name: "n".repeat(300) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.founder_name?.length).toBe(120);
  });
});

describe("decideCreateStartup", () => {
  const normalised = (() => {
    const r = normaliseCreateStartupInput(validInput);
    if (!r.ok) throw new Error("test fixture invalid");
    return r.input;
  })();

  const baseArgs = {
    input: normalised,
    reseller: baseReseller,
    existingUser: null,
    hasActiveProjectAttribution: false,
    promotionCode: promoRow,
  };

  it("emits a plan for a new founder + wholesale reseller (happy path)", () => {
    const r = decideCreateStartup(baseArgs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.createNewUser).toBe(true);
    expect(r.plan.provisional).toBe(true);
    expect(r.plan.reseller_id).toBe("res-1");
    expect(r.plan.reseller_display_name).toBe("InfoVision");
    expect(r.plan.promotion_code_id).toBe("promo-20");
    expect(r.plan.promotion_code).toBe("INFOVISION20");
    expect(r.plan.attribution).toEqual({
      subject_type: "project",
      source: WHOLESALE_ATTRIBUTION_SOURCE,
      metadata: { origin: "wholesale_create", discount_tier: 20 },
    });
    expect(r.plan.magicLink.intent).toBe("login");
    expect(r.plan.magicLink.pendingPayload).toEqual({
      resellerCode: "INFOVISION",
      wholesaleProvisioning: true,
    });
    expect(r.plan.plan_tier).toBe(WHOLESALE_PLAN_ID);
  });

  it("reuses an existing verified user and flips provisional false", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      existingUser: { id: "u-1", verified_at: "2026-01-01T00:00:00Z" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.createNewUser).toBe(false);
    expect(r.plan.provisional).toBe(false);
  });

  it("keeps provisional=true for an unverified existing user", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      existingUser: { id: "u-2", verified_at: null },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.createNewUser).toBe(false);
    expect(r.plan.provisional).toBe(true);
  });

  it("rejects when reseller status is paused or terminated", () => {
    for (const status of ["paused", "terminated"] as const) {
      const r = decideCreateStartup({
        ...baseArgs,
        reseller: { ...baseReseller, status },
      });
      expect(r).toEqual({ ok: false, reason: "reseller_not_active" });
    }
  });

  it("rejects capability_disabled when can_create_startups is false", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      reseller: { ...baseReseller, can_create_startups: false },
    });
    expect(r).toEqual({ ok: false, reason: "capability_disabled" });
  });

  it("rejects retail-billing resellers from the wholesale flow", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      reseller: { ...baseReseller, billing_model: "retail" },
    });
    expect(r).toEqual({ ok: false, reason: "billing_model_not_wholesale" });
  });

  it("rejects a discount_tier that is not in allowed_tiers", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      reseller: { ...baseReseller, allowed_tiers: [0, 10] },
    });
    expect(r).toEqual({ ok: false, reason: "tier_not_allowed" });
  });

  it("rejects a founder who already has an active project attribution", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      existingUser: { id: "u-3", verified_at: "2026-01-01T00:00:00Z" },
      hasActiveProjectAttribution: true,
    });
    expect(r).toEqual({ ok: false, reason: "existing_active_attribution" });
  });

  it("rejects when the (reseller, tier) promotion code has not been minted", () => {
    const r = decideCreateStartup({ ...baseArgs, promotionCode: null });
    expect(r).toEqual({ ok: false, reason: "promotion_code_missing" });
  });

  it("rejects when the promotion code tier mismatches the requested tier", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      promotionCode: { id: "promo-10", code: "INFOVISION10", tier_pct: 10 },
    });
    expect(r).toEqual({ ok: false, reason: "promotion_code_missing" });
  });

  it("treats a null allowed_tiers as no tiers allowed", () => {
    const r = decideCreateStartup({
      ...baseArgs,
      reseller: { ...baseReseller, allowed_tiers: null },
    });
    expect(r).toEqual({ ok: false, reason: "tier_not_allowed" });
  });
});

describe("CREATE_STARTUP_ERROR_MESSAGES", () => {
  it("has a message for every CreateStartupError code", () => {
    // Enumerate the union by using every emitted error path; if a new code is
    // added later, decideCreateStartup surfaces it here as an unmatched key.
    const codes = [
      "invalid_email",
      "company_name_required",
      "company_name_too_long",
      "invalid_plan_tier",
      "invalid_discount_tier",
      "reseller_not_active",
      "capability_disabled",
      "billing_model_not_wholesale",
      "tier_not_allowed",
      "existing_active_attribution",
      "promotion_code_missing",
    ] as const;
    for (const code of codes) {
      expect(CREATE_STARTUP_ERROR_MESSAGES[code]).toMatch(/\S/);
    }
  });
});
