// G25-D — the review-before-pay order model (pure).
import { describe, expect, it } from "vitest";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { PLANS_V2 } from "@/lib/plans-v2";
import { STARTUP_PACKAGE_AMOUNT_CENTS, STARTUP_PACKAGE_PLAN_ID } from "@/lib/startup-package/price";
import { STRIPE_PRICE_CATALOGUE } from "@/lib/pricing/stripe-map";
import {
  CHECKOUT_ENTRIES,
  backToPricingHref,
  checkoutReviewHref,
  normaliseCheckoutEntry,
  parseCheckoutReviewParams,
  resolveCheckoutOrder,
  reviewUrlFor,
  signedOutContinueHref,
} from "./checkout-review";

const plan = (id: string) => PLANS_V2.find((p) => p.id === id)!;

describe("checkoutReviewHref ↔ parseCheckoutReviewParams (round trip)", () => {
  it("plan · monthly · trial · entry", () => {
    const href = checkoutReviewHref({ plan: "founder_starter", trial: true, entry: "pricing_card" });
    expect(href).toBe("/checkout/review?plan=founder_starter&trial=1&entry=pricing_card");
    expect(parseCheckoutReviewParams({ plan: "founder_starter", trial: "1", entry: "pricing_card" })).toEqual({
      kind: "plan",
      planId: "founder_starter",
      interval: "monthly",
      trial: true,
      entry: "pricing_card",
    });
  });

  it("plan · annual rides the shared `interval=annual` spelling; VI mirror path; onboarding origin", () => {
    expect(checkoutReviewHref({ plan: "investor_angel", interval: "annual", trial: true, entry: "billing", locale: "vi" })).toBe(
      "/vi/checkout/review?plan=investor_angel&trial=1&entry=billing&interval=annual",
    );
    expect(checkoutReviewHref({ plan: "founder_growth", trial: true, entry: "onboarding", origin: "onboarding" })).toBe(
      "/checkout/review?plan=founder_growth&trial=1&origin=onboarding&entry=onboarding",
    );
    expect(parseCheckoutReviewParams({ plan: "founder_growth", interval: "annual", origin: "onboarding" })).toEqual({
      kind: "plan",
      planId: "founder_growth",
      interval: "annual",
      trial: false,
      entry: "other",
      origin: "onboarding",
    });
  });

  it("pack and sku", () => {
    expect(checkoutReviewHref({ pack: 25, entry: "credits" })).toBe("/checkout/review?pack=25&entry=credits");
    expect(parseCheckoutReviewParams({ pack: "25" })).toEqual({ kind: "pack", credits: 25, entry: "other" });
    expect(checkoutReviewHref({ sku: STARTUP_PACKAGE_PLAN_ID, entry: "startup_package", projectId: "abc-123" })).toBe(
      "/checkout/review?sku=founder_package&projectId=abc-123&entry=startup_package",
    );
    expect(parseCheckoutReviewParams({ sku: "svi_api_team", entry: "svi_api" })).toEqual({ kind: "sku", sku: "svi_api_team", entry: "svi_api" });
  });

  it("rejects what is not sellable: nothing, junk ids, unknown skus, non-integer packs", () => {
    expect(parseCheckoutReviewParams({})).toBeNull();
    expect(parseCheckoutReviewParams({ plan: "<script>" })).toBeNull();
    expect(parseCheckoutReviewParams({ plan: "Founder Starter" })).toBeNull();
    expect(parseCheckoutReviewParams({ sku: "cohort_pilot_25" })).toBeNull();
    expect(parseCheckoutReviewParams({ pack: "2.5" })).toBeNull();
    expect(parseCheckoutReviewParams({ pack: "0" })).toBeNull();
    // A bad projectId is dropped, not fatal.
    expect(parseCheckoutReviewParams({ sku: "founder_package", projectId: "../x" })).toEqual({ kind: "sku", sku: "founder_package", entry: "other" });
  });

  it("unknown entry surfaces collapse to `other`", () => {
    expect(normaliseCheckoutEntry("pricing_card")).toBe("pricing_card");
    expect(normaliseCheckoutEntry("javascript:alert(1)")).toBe("other");
    expect(normaliseCheckoutEntry(undefined)).toBe("other");
    expect(CHECKOUT_ENTRIES).toContain("other");
  });
});

describe("resolveCheckoutOrder — catalogue facts, never typed", () => {
  it("Starter monthly with trial: A$29 inc. GST, GST share 1/11, 7-day trial, posts {plan}", () => {
    const o = resolveCheckoutOrder({ kind: "plan", planId: "founder_starter", interval: "monthly", trial: true, entry: "pricing_card" })!;
    expect(o.kind).toBe("plan");
    expect(o.name).toBe("Starter");
    expect(o.amountCents).toBe(plan("founder_starter").monthly_aud! * 100);
    expect(o.amountCents).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_FOUNDER_STARTER!.amount_cents);
    expect(o.gstCents).toBe(Math.round(o.amountCents / 11));
    expect(o.interval).toBe("monthly");
    expect(o.trialDays).toBe(plan("founder_starter").trial_days);
    expect(o.trialDays).toBe(7);
    expect(o.segment).toBe("founder");
    expect(o.included).toEqual(plan("founder_starter").features);
    expect(o.postPath).toBe("/api/stripe/checkout");
    expect(o.postBody).toEqual({ plan: "founder_starter" });
    expect(o.contactOnly).toBe(false);
    expect(o.annualFallback).toBe(false);
  });

  it("Scout annual when the rung has an annual price: A$790, interval annual in the body; public name Scout", () => {
    const o = resolveCheckoutOrder({ kind: "plan", planId: "investor_angel", interval: "annual", trial: true, entry: "pricing_card" }, { annualAvailable: ["investor_angel"] })!;
    expect(o.name).toBe("Scout");
    expect(o.interval).toBe("annual");
    expect(o.amountCents).toBe(plan("investor_angel").annual_aud! * 100);
    expect(o.amountCents).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_INVESTOR_ANGEL_ANNUAL!.amount_cents);
    expect(o.postBody).toEqual({ plan: "investor_angel", interval: "annual" });
    expect(o.segment).toBe("evaluator");
  });

  it("annual requested on a rung with no annual Stripe price → monthly + annualFallback (never a figure checkout cannot charge)", () => {
    const o = resolveCheckoutOrder({ kind: "plan", planId: "founder_starter", interval: "annual", trial: true, entry: "billing" }, { annualAvailable: [] })!;
    expect(o.interval).toBe("monthly");
    expect(o.annualFallback).toBe(true);
    expect(o.amountCents).toBe(2900);
    expect(o.postBody).toEqual({ plan: "founder_starter" });
  });

  it("Programs rung: 14-day trial, programs segment; onboarding origin rides the body", () => {
    const o = resolveCheckoutOrder({ kind: "plan", planId: "accelerator_intake", interval: "annual", trial: true, entry: "onboarding", origin: "onboarding" }, { annualAvailable: ["accelerator_intake"] })!;
    expect(o.trialDays).toBe(14);
    expect(o.segment).toBe("programs");
    expect(o.postBody).toEqual({ plan: "accelerator_intake", interval: "annual", origin: "onboarding" });
  });

  it("custom-priced rung → contactOnly, no amount; Free rung and unknown plan → null (404)", () => {
    const ent = resolveCheckoutOrder({ kind: "plan", planId: "founder_enterprise", interval: "monthly", trial: false, entry: "other" })!;
    expect(ent.contactOnly).toBe(true);
    expect(ent.amountCents).toBe(0);
    expect(resolveCheckoutOrder({ kind: "plan", planId: "founder_free", interval: "monthly", trial: true, entry: "other" })).toBeNull();
    expect(resolveCheckoutOrder({ kind: "plan", planId: "no_such_plan", interval: "monthly", trial: true, entry: "other" })).toBeNull();
  });

  it("credit packs: every CREDIT_PACKS row resolves at its catalogue amount, one-off, no trial, posts {amount}", () => {
    for (const pack of CREDIT_PACKS) {
      const o = resolveCheckoutOrder({ kind: "pack", credits: pack.credits, entry: "credits" })!;
      expect(o.id).toBe(`credits_${pack.credits}`);
      expect(o.amountCents).toBe(pack.priceAudCents);
      expect(o.amountCents).toBe(STRIPE_PRICE_CATALOGUE[`STRIPE_PRICE_CREDITS_${pack.credits}`]!.amount_cents);
      expect(o.interval).toBe("once");
      expect(o.trialDays).toBe(0);
      expect(o.postPath).toBe("/api/credits");
      expect(o.postBody).toEqual({ amount: pack.credits });
    }
    expect(resolveCheckoutOrder({ kind: "pack", credits: 7, entry: "credits" })).toBeNull();
  });

  it("Startup Package: A$149 one-off from the csv row, posts {plan:'founder_package'[, projectId]}", () => {
    const o = resolveCheckoutOrder({ kind: "sku", sku: STARTUP_PACKAGE_PLAN_ID, entry: "startup_package", projectId: "p1" })!;
    expect(o.amountCents).toBe(STARTUP_PACKAGE_AMOUNT_CENTS);
    expect(o.amountCents).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_STARTUP_PACKAGE!.amount_cents);
    expect(o.interval).toBe("once");
    expect(o.trialDays).toBe(0);
    expect(o.included.length).toBeGreaterThan(3);
    expect(o.postPath).toBe("/api/stripe/checkout");
    expect(o.postBody).toEqual({ plan: "founder_package", projectId: "p1" });
  });

  it("Index API Team: A$299/mo from the index_api rung, no trial, posts {tier:'team'} to /api/svi-api/checkout", () => {
    const o = resolveCheckoutOrder({ kind: "sku", sku: "svi_api_team", entry: "svi_api" })!;
    expect(o.amountCents).toBe(plan("index_api").monthly_aud! * 100);
    expect(o.amountCents).toBe(STRIPE_PRICE_CATALOGUE.STRIPE_PRICE_INDEX_API!.amount_cents);
    expect(o.interval).toBe("monthly");
    expect(o.trialDays).toBe(0);
    expect(o.postPath).toBe("/api/svi-api/checkout");
    expect(o.postBody).toEqual({ tier: "team" });
  });
});

describe("signed-out continuation — sign-up / sign-in with next=, never Stripe", () => {
  it("founder plan → /signup?plan=…&trial=1&next=<review>; evaluator + programs → segment=evaluator; annual survives", () => {
    const starter = resolveCheckoutOrder({ kind: "plan", planId: "founder_starter", interval: "monthly", trial: true, entry: "pricing_card" })!;
    expect(signedOutContinueHref(starter)).toBe(
      `/signup?plan=founder_starter&trial=1&next=${encodeURIComponent("/checkout/review?plan=founder_starter&trial=1&entry=pricing_card")}`,
    );
    const scout = resolveCheckoutOrder({ kind: "plan", planId: "investor_angel", interval: "annual", trial: true, entry: "pricing_card" }, { annualAvailable: ["investor_angel"] })!;
    expect(signedOutContinueHref(scout)).toBe(
      `/signup?segment=evaluator&plan=investor_angel&trial=1&next=${encodeURIComponent("/checkout/review?plan=investor_angel&trial=1&entry=pricing_card&interval=annual")}&interval=annual`,
    );
    const intake = resolveCheckoutOrder({ kind: "plan", planId: "accelerator_intake", interval: "monthly", trial: true, entry: "pricing_card" })!;
    expect(signedOutContinueHref(intake)).toMatch(/^\/signup\?segment=evaluator&plan=accelerator_intake&trial=1&next=/);
  });

  it("packs, SKUs and contact-only rungs → /auth/login?next=<review>", () => {
    const pack = resolveCheckoutOrder({ kind: "pack", credits: 10, entry: "credits" })!;
    expect(signedOutContinueHref(pack)).toBe(`/auth/login?next=${encodeURIComponent("/checkout/review?pack=10&entry=credits")}`);
    const pkg = resolveCheckoutOrder({ kind: "sku", sku: STARTUP_PACKAGE_PLAN_ID, entry: "startup_package" })!;
    expect(signedOutContinueHref(pkg, "vi")).toBe(`/auth/login?next=${encodeURIComponent("/vi/checkout/review?sku=founder_package&entry=startup_package")}`);
    const ent = resolveCheckoutOrder({ kind: "plan", planId: "founder_enterprise", interval: "monthly", trial: false, entry: "other" })!;
    expect(signedOutContinueHref(ent)).toMatch(/^\/auth\/login\?next=/);
  });

  it("reviewUrlFor reproduces the URL for every kind; backToPricingHref names the surface", () => {
    const scout = resolveCheckoutOrder({ kind: "plan", planId: "investor_angel", interval: "monthly", trial: true, entry: "upgrade_modal" })!;
    expect(reviewUrlFor(scout, "vi")).toBe("/vi/checkout/review?plan=investor_angel&trial=1&entry=upgrade_modal");
    expect(backToPricingHref(scout)).toBe("/pricing?segment=evaluator");
    expect(backToPricingHref(scout, "vi")).toBe("/vi/pricing?segment=evaluator");
    expect(backToPricingHref(resolveCheckoutOrder({ kind: "pack", credits: 5, entry: "credits" })!)).toBe("/workspace/billing#credits");
    expect(backToPricingHref(resolveCheckoutOrder({ kind: "sku", sku: STARTUP_PACKAGE_PLAN_ID, entry: "startup_package" })!)).toBe("/startup-package");
    expect(backToPricingHref(resolveCheckoutOrder({ kind: "sku", sku: "svi_api_team", entry: "svi_api" })!)).toBe("/workspace/settings/enterprise");
    expect(backToPricingHref(resolveCheckoutOrder({ kind: "plan", planId: "founder_starter", interval: "monthly", trial: true, entry: "billing" })!)).toBe("/pricing");
  });
});
