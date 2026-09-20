// G18-D — subscription-state: phase classification, cancel outcomes, and the
// trial-truth assertion (Stripe's trial_start→trial_end span equals the
// plan row's trial_days, because checkout passes `trial_period_days` from it).

import { describe, expect, it } from "vitest";
import { PLANS_V2 } from "@/lib/plans-v2";
import {
  daysUntil,
  describeSubscription,
  formatBillingDate,
  pickLiveSubscription,
  planIdFromSubscriptionMetadata,
  snapshotFromMirrorRow,
  snapshotFromStripe,
  trialLengthDays,
} from "./subscription-state";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const DAY = 86_400;
const nowSecs = Math.floor(NOW.getTime() / 1000);

/** A Stripe.Subscription-shaped fixture the way checkout mints it for a plan row. */
function stripeTrialFixture(planId: string, trialDays: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `sub_${planId}`,
    status: "trialing",
    cancel_at_period_end: false,
    created: nowSecs - 60,
    trial_start: nowSecs,
    trial_end: nowSecs + trialDays * DAY,
    default_payment_method: "pm_card",
    metadata: { plan_id: planId, user_id: "u1" },
    items: { data: [{ current_period_end: nowSecs + trialDays * DAY, price: { id: "price_x", lookup_key: planId } }] },
    ...overrides,
  };
}

describe("trial truth — Stripe trial span equals plans.trial_days", () => {
  const trialPlans = PLANS_V2.filter((p) => p.trial_days > 0);

  it("covers every plan with a trial (7-day founder/evaluator rungs, 14-day cohort rungs)", () => {
    expect(trialPlans.length).toBeGreaterThan(0);
    expect(new Set(trialPlans.map((p) => p.trial_days))).toEqual(new Set([7, 14]));
  });

  it.each(trialPlans.map((p) => [p.id, p.trial_days] as const))(
    "%s → a subscription minted with trial_period_days=%s reports exactly that many days",
    (planId, trialDays) => {
      const snap = snapshotFromStripe(stripeTrialFixture(planId, trialDays));
      expect(trialLengthDays(snap)).toBe(trialDays);
      const view = describeSubscription(snap, NOW);
      expect(view.phase).toBe("trialing");
      expect(view.trialDaysLeft).toBe(trialDays);
      expect(view.planId).toBe(planId);
      // First charge = trial_end, and the card is on file.
      expect(view.nextChargeOn).toBe(new Date((nowSecs + trialDays * DAY) * 1000).toISOString());
      expect(view.paymentMethodSaved).toBe(true);
    },
  );

  it("founder_starter's trial is 7 days (the number the checkout passes to Stripe)", () => {
    expect(PLANS_V2.find((p) => p.id === "founder_starter")?.trial_days).toBe(7);
  });

  it("trialLengthDays is null without both bounds or with an inverted span", () => {
    expect(trialLengthDays({ trialStart: null, trialEnd: "2026-09-27T00:00:00Z" })).toBeNull();
    expect(trialLengthDays({ trialStart: "2026-09-27T00:00:00Z", trialEnd: "2026-09-20T00:00:00Z" })).toBeNull();
  });
});

describe("describeSubscription — phases and what cancelling does", () => {
  const periodEnd = "2026-10-20T00:00:00.000Z";

  it("no row → none: nothing to cancel, nothing to resume", () => {
    const v = describeSubscription(null, NOW);
    expect(v.phase).toBe("none");
    expect(v.canCancel).toBe(false);
    expect(v.canResume).toBe(false);
    expect(v.nextChargeOn).toBeNull();
  });

  it("trialing → cancel ends access today, no charge; days left counts to trial_end", () => {
    const v = describeSubscription(snapshotFromStripe(stripeTrialFixture("investor_angel", 7)), NOW);
    expect(v.phase).toBe("trialing");
    expect(v.canCancel).toBe(true);
    expect(v.canResume).toBe(false);
    expect(v.accessEndsOnCancel).toBe(NOW.toISOString());
    expect(v.trialDaysLeft).toBe(7);
  });

  it("active → cancel keeps access until the period end (no refund), next charge = renewal", () => {
    const v = describeSubscription(
      { subscriptionId: "sub_a", planId: "founder_growth", status: "active", trialStart: null, trialEnd: null, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, paymentMethodSaved: true },
      NOW,
    );
    expect(v.phase).toBe("active");
    expect(v.canCancel).toBe(true);
    expect(v.accessEndsOnCancel).toBe(periodEnd);
    expect(v.nextChargeOn).toBe(periodEnd);
    expect(v.trialDaysLeft).toBe(0);
  });

  it("past_due behaves like active for cancel purposes", () => {
    const v = describeSubscription(
      { subscriptionId: "sub_p", planId: "founder_starter", status: "past_due", trialStart: null, trialEnd: null, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, paymentMethodSaved: true },
      NOW,
    );
    expect(v.phase).toBe("past_due");
    expect(v.canCancel).toBe(true);
  });

  it("cancel_at_period_end → cancel_scheduled: no further charge, Resume available, cancel button gone (idempotent UI)", () => {
    const v = describeSubscription(
      { subscriptionId: "sub_c", planId: "founder_growth", status: "active", trialStart: null, trialEnd: null, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true, paymentMethodSaved: true },
      NOW,
    );
    expect(v.phase).toBe("cancel_scheduled");
    expect(v.canCancel).toBe(false);
    expect(v.canResume).toBe(true);
    expect(v.nextChargeOn).toBeNull();
    expect(v.accessEndsOnCancel).toBe(periodEnd);
  });

  it("a trial cancelled at period end (portal path) still reads cancel_scheduled with access to trial_end", () => {
    const snap = snapshotFromStripe(stripeTrialFixture("founder_starter", 7, { cancel_at_period_end: true }));
    const v = describeSubscription(snap, NOW);
    expect(v.phase).toBe("cancel_scheduled");
    expect(v.accessEndsOnCancel).toBe(snap.currentPeriodEnd);
  });

  it("canceled / trial_ended_no_payment → canceled: nothing to do", () => {
    for (const status of ["canceled", "trial_ended_no_payment", "incomplete_expired"]) {
      const v = describeSubscription(
        { subscriptionId: "sub_x", planId: null, status, trialStart: null, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, paymentMethodSaved: false },
        NOW,
      );
      expect(v.phase, status).toBe("canceled");
      expect(v.canCancel).toBe(false);
      expect(v.canResume).toBe(false);
    }
  });
});

describe("snapshot builders", () => {
  it("snapshotFromStripe reads item-level current_period_end, falls back to the legacy top-level field", () => {
    const withItem = snapshotFromStripe(stripeTrialFixture("founder_starter", 7));
    expect(withItem.currentPeriodEnd).toBe(new Date((nowSecs + 7 * DAY) * 1000).toISOString());
    const legacy = snapshotFromStripe({ id: "sub_l", status: "active", cancel_at_period_end: false, current_period_end: nowSecs + 30 * DAY, items: { data: [{}] } });
    expect(legacy.currentPeriodEnd).toBe(new Date((nowSecs + 30 * DAY) * 1000).toISOString());
  });

  it("explicit planId wins over metadata; metadata plan_id beats blockid_plan", () => {
    const sub = stripeTrialFixture("founder_starter", 7, { metadata: { plan_id: "a", blockid_plan: "b" } });
    expect(snapshotFromStripe(sub).planId).toBe("a");
    expect(snapshotFromStripe(sub, { planId: "override" }).planId).toBe("override");
    expect(planIdFromSubscriptionMetadata({ ...sub, metadata: { blockid_plan: "b" } })).toBe("b");
    expect(planIdFromSubscriptionMetadata({ ...sub, metadata: {} })).toBeNull();
  });

  it("snapshotFromMirrorRow normalises nulls; null row → null", () => {
    expect(snapshotFromMirrorRow(null)).toBeNull();
    expect(snapshotFromMirrorRow({ status: "active", cancel_at_period_end: null })).toMatchObject({ status: "active", cancelAtPeriodEnd: false, paymentMethodSaved: false, planId: null });
  });

  it("pickLiveSubscription ignores canceled subs and prefers trialing > active > past_due, newest first", () => {
    expect(pickLiveSubscription([{ status: "canceled" }, { status: "incomplete" }])).toBeNull();
    const picked = pickLiveSubscription([
      { status: "canceled", id: "old" },
      { status: "active", id: "a", created: 1 },
      { status: "trialing", id: "t", created: 2 },
    ]);
    expect(picked?.id).toBe("t");
    const newest = pickLiveSubscription([{ status: "active", id: "a1", created: 1 }, { status: "active", id: "a2", created: 5 }]);
    expect(newest?.id).toBe("a2");
  });

  it("daysUntil / formatBillingDate tolerate junk", () => {
    expect(daysUntil(null)).toBe(0);
    expect(daysUntil("not a date")).toBe(0);
    expect(daysUntil("2026-09-27T00:00:00Z", NOW)).toBe(7);
    expect(formatBillingDate(null)).toBe("—");
    expect(formatBillingDate("junk")).toBe("—");
    expect(formatBillingDate("2026-09-27T00:00:00Z")).toMatch(/2026/);
  });
});
