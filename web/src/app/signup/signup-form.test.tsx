// Render test for the /signup trial step — release QA-2 F10 (S7-C copy).
//
// The evaluator variant must state what the trial actually includes ("1
// full Trust BizReport included during the trial, then 10/month on Scout")
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
    expect(out).toContain("1 full Trust BizReport included during the trial, then 10/month on Scout");
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
