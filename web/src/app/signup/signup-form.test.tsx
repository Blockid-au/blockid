// Render test for the /signup trial step — release QA-2 F10 (S7-C copy).
//
// The evaluator variant must state what the trial actually includes ("1
// full Trusted Business Report included during the trial, then 10/month on Scout")
// next to the 7-day card-required line; the founder variant must not.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => <div data-card-element />,
  useStripe: () => null,
  useElements: () => null,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: async () => null }));

import { SignupForm, type SignupPlanChoice } from "./signup-form";

const SCOUT: SignupPlanChoice = {
  id: "investor_angel",
  name: "Scout",
  priceCents: 7900,
  priceDisplay: "A$79",
  trialDays: 7,
  hasStripePrice: true,
};
const FOUNDER: SignupPlanChoice = {
  id: "founder_starter",
  name: "Starter",
  priceCents: 2900,
  priceDisplay: "A$29",
  trialDays: 7,
  hasStripePrice: true,
};

describe("SignupForm — evaluator trial step copy", () => {
  it("evaluator: shows the 1-report trial allowance then the Scout monthly quota", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[SCOUT]} defaultPlanId="investor_angel" stripePublishableKey="pk_test_x" />,
    );
    expect(out).toContain('data-testid="evaluator-trial-included"');
    expect(out).toContain("1 full Trusted Business Report included during the trial, then 10/month on Scout");
    expect(out).toContain("7-day free trial · card required · cancel anytime · charged on day 8");
    // G25-D: the submit names the card step.
    expect(out).toContain("Add card &amp; start 7-day trial");
  });

  // W4 review P3-b: the CTA follows the plan's trial length (Cohort 25/100 = 14 days).
  it("evaluator on a 14-day rung: CTA and trial line both say 14 days, never 7", () => {
    const COHORT: SignupPlanChoice = { id: "accelerator_starter", name: "Cohort 25", priceCents: 34900, priceDisplay: "A$349", trialDays: 14, hasStripePrice: true };
    const out = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[COHORT]} defaultPlanId="accelerator_starter" stripePublishableKey="pk_test_x" />,
    );
    expect(out).toContain("Add card &amp; start 14-day trial");
    expect(out).toContain("14-day free trial · card required · cancel anytime · charged on day 15");
    expect(out).not.toContain("start 7-day trial");
    expect(out).not.toContain("7-day free trial");
  });

  // G25-D (founder 2026-09-21): the card form sits under an explicit Review
  // block — plan, price inc. GST + the GST share, trial line, renewal,
  // seller, data principle — rendered from the same catalogue strings as
  // /checkout/review; without `review` strings the block is absent.
  it("renders the review block above the card field when review strings are given, with the plan's price, GST share and trial line", () => {
    const review = {
      title: "Review your order",
      hint: "Your card is saved with Stripe now and charged only when the trial ends.",
      gstLine: "includes {gst} GST · ATO tax invoice e-mailed after every charge",
      trialLine: "{n}-day free trial · card required · you can cancel before day {n} and pay nothing · then {price} per {cadence}",
      renewalLine: "Renews automatically each {cadence} at the same price until you cancel. Stripe Billing Portal. {hours} hours.",
      cadenceMonth: "month",
      cadenceYear: "year",
      dataPrinciple: "Your data belongs to your startup.",
      sellerLine: "Auschain PTY LTD (ABN 79 659 615 111)",
    };
    const out = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[SCOUT]} defaultPlanId="investor_angel" stripePublishableKey="pk_test_x" review={review} />,
    );
    expect(out).toContain('data-testid="signup-review"');
    expect(out).toContain('data-plan-id="investor_angel"');
    expect(out).toContain('data-trial-days="7"');
    expect(out).toContain("A$79/mo inc. GST");
    // 7900 / 11 = 718.18 → A$7.18
    expect(out).toContain("includes A$7.18 GST");
    expect(out).toContain("7-day free trial · card required · you can cancel before day 7 and pay nothing · then A$79 per month");
    expect(out).toContain("Renews automatically each month");
    expect(out).toContain("72 hours");
    expect(out).toContain("Auschain PTY LTD (ABN 79 659 615 111)");
    expect(out).toContain("Your data belongs to your startup.");
    expect(out.indexOf('data-testid="signup-review"')).toBeLessThan(out.indexOf('data-testid="signup-card-field"'));
    const without = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[SCOUT]} defaultPlanId="investor_angel" stripePublishableKey="pk_test_x" />,
    );
    expect(without).not.toContain('data-testid="signup-review"');
  });

  it("founder: no evaluator allowance line", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="founder" trialPlans={[FOUNDER]} defaultPlanId="founder_starter" stripePublishableKey="pk_test_x" />,
    );
    expect(out).not.toContain("evaluator-trial-included");
    expect(out).not.toContain("included during the trial");
  });

  // G34-BT2 EM05 (D24-e): a separate marketing checkbox, never pre-ticked, never required.
  it("renders an unticked, optional marketing-consent checkbox separate from the terms", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="founder" trialPlans={[FOUNDER]} defaultPlanId="founder_starter" stripePublishableKey="pk_test_x" />,
    );
    const input = /<input[^>]*data-testid="signup-marketing-consent"[^>]*>/.exec(out)?.[0] ?? "";
    expect(input).not.toBe("");
    expect(input).not.toMatch(/checked/);
    expect(input).not.toMatch(/required/);
    expect(out).toContain("Email me occasional tips, product news and offers from BlockID.");
  });
});

// 2026-09-16 pricing audit: `?interval=annual` from the pricing card. A rung
// with an annual Stripe Price is offered — and billed — per year; one
// without falls back to monthly and says so instead of promising A$290/yr
// at a monthly SKU.
describe("SignupForm — annual interval", () => {
  const SCOUT_ANNUAL: SignupPlanChoice = {
    ...SCOUT,
    annualPriceCents: 79000,
    annualPriceDisplay: "A$790",
    hasAnnualPrice: true,
  };

  it("annual + provisioned rung: picker shows /yr and the after-trial line quotes the yearly price", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[SCOUT_ANNUAL]} defaultPlanId="investor_angel" interval="annual" stripePublishableKey="pk_test_x" />,
    );
    expect(out).toContain("Scout — A$790/yr");
    expect(out).toContain("A$790/year for Scout");
    expect(out).not.toContain("annual-fallback-note");
  });

  it("annual + rung without an annual Price: stays monthly and shows the fallback note", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="founder" trialPlans={[FOUNDER]} defaultPlanId="founder_starter" interval="annual" stripePublishableKey="pk_test_x" />,
    );
    expect(out).toContain("Starter — A$29/mo");
    expect(out).toContain("A$29/mo for Starter");
    expect(out).toContain('data-testid="annual-fallback-note"');
  });

  it("monthly (default) never mentions annual", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="evaluator" trialPlans={[SCOUT_ANNUAL]} defaultPlanId="investor_angel" stripePublishableKey="pk_test_x" />,
    );
    expect(out).toContain("Scout — A$79/mo");
    expect(out).not.toContain("/yr");
    expect(out).not.toContain("annual-fallback-note");
  });
});
