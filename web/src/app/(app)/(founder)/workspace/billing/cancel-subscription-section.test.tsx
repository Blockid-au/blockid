// G18-D — CancelSubscriptionSection: what each phase renders (static markup,
// no testing-library) and the outcome copy per phase.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { describeSubscription, type SubscriptionSnapshot } from "@/lib/billing/subscription-state";
import { CancelSubscriptionSection, cancelOutcomeCopy } from "./cancel-subscription-section";

const NOW = new Date("2026-09-20T00:00:00Z");
const TRIAL_END = "2026-09-27T00:00:00.000Z";
const PERIOD_END = "2026-10-20T00:00:00.000Z";

function snap(over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    subscriptionId: "sub_1",
    planId: "founder_starter",
    status: "active",
    trialStart: null,
    trialEnd: null,
    currentPeriodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    paymentMethodSaved: true,
    ...over,
  };
}

describe("CancelSubscriptionSection", () => {
  it("Free / no subscription → renders nothing (no cancel button anywhere)", () => {
    const html = renderToStaticMarkup(<CancelSubscriptionSection subscription={describeSubscription(null, NOW)} planLabel={null} />);
    expect(html).toBe("");
  });

  it("canceled → renders nothing", () => {
    const view = describeSubscription(snap({ status: "canceled" }), NOW);
    expect(renderToStaticMarkup(<CancelSubscriptionSection subscription={view} planLabel="Starter" />)).toBe("");
  });

  it("trialing → 'Cancel trial', trial-end date, days left, first-charge line, no refund link", () => {
    const view = describeSubscription(snap({ status: "trialing", trialStart: "2026-09-20T00:00:00.000Z", trialEnd: TRIAL_END, currentPeriodEnd: TRIAL_END, planId: "investor_angel" }), NOW);
    const html = renderToStaticMarkup(<CancelSubscriptionSection subscription={view} planLabel="Scout" />);
    expect(html).toContain('data-phase="trialing"');
    expect(html).toContain('data-testid="cancel-subscription"');
    expect(html).toContain("Cancel trial");
    expect(html).toContain("7 days left");
    expect(html).toContain("Card on file.");
    expect(html).toMatch(/First charge on .*27 Sept? 2026/);
    expect(html).toContain("cancel any time before then and there is no charge");
    expect(html).not.toContain("/legal/terms#refunds");
    expect(html).not.toContain('data-testid="resume-subscription"');
  });

  it("active → 'Cancel subscription', renewal date, access-until copy, refund terms link", () => {
    const view = describeSubscription(snap({}), NOW);
    const html = renderToStaticMarkup(<CancelSubscriptionSection subscription={view} planLabel="Starter" />);
    expect(html).toContain('data-phase="active"');
    expect(html).toContain("Cancel subscription");
    expect(html).toMatch(/renews .*20 Oct 2026/);
    expect(html).toContain("There is no refund for the current period.");
    expect(html).toContain('href="/legal/terms#refunds"');
  });

  it("cancel scheduled → 'Cancels on <date>' + Resume, cancel button gone", () => {
    const view = describeSubscription(snap({ cancelAtPeriodEnd: true }), NOW);
    const html = renderToStaticMarkup(<CancelSubscriptionSection subscription={view} planLabel="Growth" />);
    expect(html).toContain('data-phase="cancel_scheduled"');
    expect(html).toContain("Cancellation scheduled");
    expect(html).toMatch(/Growth cancels on .*20 Oct 2026/);
    expect(html).toContain('data-testid="resume-subscription"');
    expect(html).not.toContain('data-testid="cancel-subscription"');
    expect(html).toContain("You will not be charged again.");
  });

  it("the confirm dialog is closed at rest (exit survey not mounted)", () => {
    const view = describeSubscription(snap({}), NOW);
    const html = renderToStaticMarkup(<CancelSubscriptionSection subscription={view} planLabel="Starter" />);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Before you go");
  });
});

describe("cancelOutcomeCopy", () => {
  it("names the plan in every phase and falls back to 'your plan'", () => {
    const active = describeSubscription(snap({}), NOW);
    expect(cancelOutcomeCopy(active, "Starter").headline).toBe("Cancel Starter");
    expect(cancelOutcomeCopy(active, null).headline).toBe("Cancel your plan");
    const trial = describeSubscription(snap({ status: "trialing", trialEnd: TRIAL_END }), NOW);
    expect(cancelOutcomeCopy(trial, "Scout").body).toMatch(/card is not charged/);
    expect(cancelOutcomeCopy(describeSubscription(null, NOW), null).headline).toBe("No subscription to cancel");
  });
});
