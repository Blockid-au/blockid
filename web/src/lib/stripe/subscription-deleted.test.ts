import { describe, expect, it } from "vitest";
import { decideSubscriptionDeleted } from "./subscription-deleted";

describe("decideSubscriptionDeleted (G36)", () => {
  it("Stripe lists another live plan subscription → keep the plan", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(
        decideSubscriptionDeleted({
          deletedId: "sub_old",
          recorded: { stripe_subscription_id: "sub_old", status: "active" },
          customerSubscriptions: [
            { id: "sub_old", status: "canceled" },
            { id: "sub_new", status },
          ],
        }),
      ).toEqual({ downgrade: false, reason: "other_live_subscription", survivorId: "sub_new" });
    }
  });

  it("Stripe lists nothing else live → downgrade, even when the record points elsewhere (stale record)", () => {
    expect(
      decideSubscriptionDeleted({
        deletedId: "sub_b",
        recorded: { stripe_subscription_id: "sub_a", status: "active" },
        customerSubscriptions: [
          { id: "sub_a", status: "canceled" },
          { id: "sub_b", status: "canceled" },
          { id: "sub_api", status: "active", metadata: { sviApiTier: "pro" } }, // Index API sub never carries a plan
        ],
      }),
    ).toEqual({ downgrade: true, reason: "no_other_live_subscription" });
  });

  it("Stripe unavailable: a live recorded subscription that is not the deleted one keeps the plan", () => {
    expect(
      decideSubscriptionDeleted({
        deletedId: "sub_old",
        recorded: { stripe_subscription_id: "sub_new", status: "active" },
        customerSubscriptions: null,
      }),
    ).toEqual({ downgrade: false, reason: "recorded_subscription_differs", survivorId: "sub_new" });
  });

  it("Stripe unavailable: the recorded subscription ended, or no record → downgrade", () => {
    expect(
      decideSubscriptionDeleted({ deletedId: "sub_1", recorded: { stripe_subscription_id: "sub_1", status: "active" }, customerSubscriptions: null }),
    ).toEqual({ downgrade: true, reason: "recorded_subscription_ended" });
    expect(
      decideSubscriptionDeleted({ deletedId: "sub_1", recorded: { stripe_subscription_id: "sub_0", status: "canceled" }, customerSubscriptions: null }),
    ).toEqual({ downgrade: true, reason: "recorded_subscription_ended" });
    expect(decideSubscriptionDeleted({ deletedId: "sub_1", recorded: null, customerSubscriptions: null })).toEqual({
      downgrade: true,
      reason: "no_recorded_subscription",
    });
  });
});
