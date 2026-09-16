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
    expect(out).toContain("Start 7-day evaluator trial");
  });

  it("founder: no evaluator allowance line", () => {
    const out = renderToStaticMarkup(
      <SignupForm segment="founder" trialPlans={[FOUNDER]} defaultPlanId="founder_starter" stripePublishableKey="pk_test_x" />,
    );
    expect(out).not.toContain("evaluator-trial-included");
    expect(out).not.toContain("included during the trial");
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
