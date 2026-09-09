// Colocated suite for Stripe-subscription -> add-on-entitlement reconciliation.
//
// `decideShareMgmtAddon` is the whole lifecycle in one pure function, so most
// of this file pins that: for every Stripe subscription status and item shape,
// does the founder keep the capability they are paying A$59/month for, and —
// more importantly — do they lose it the moment they stop.

import { beforeEach, describe, expect, it, vi } from "vitest";

const isShareMgmtAddonPriceMock = vi.fn<(id: string | null | undefined) => boolean>();
vi.mock("@/lib/stripe", () => ({
  isShareMgmtAddonPrice: (id: string | null | undefined) =>
    isShareMgmtAddonPriceMock(id),
}));

const grantAddonMock = vi.fn<(a: unknown) => Promise<boolean>>();
const revokeAddonMock = vi.fn<(a: unknown) => Promise<boolean>>();
vi.mock("@/lib/entitlements/user-grants", () => ({
  SHARE_MANAGEMENT_ADDON: "share_management",
  grantAddon: (a: unknown) => grantAddonMock(a),
  revokeAddon: (a: unknown) => revokeAddonMock(a),
}));

import {
  applyAddonDecision,
  decideShareMgmtAddon,
  reconcileSubscriptionAddon,
  revokeAddonForCustomer,
  userIdForCustomer,
} from "./addon-entitlements";

const ADDON_PRICE = "price_addon_equity";
const BASE_PRICE = "price_growth";

function sub(status: string, priceIds: string[] = [ADDON_PRICE]) {
  return {
    id: "sub_1",
    status,
    customer: "cus_1",
    items: {
      data: priceIds.map((p, i) => ({ id: `si_${i}`, price: { id: p } })),
    },
  };
}

function supabaseReturning(row: unknown) {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    client: {
      from(_t: string) {
        return {
          select(_c: string) {
            return {
              eq(col: string, val: unknown) {
                calls.push([col, val]);
                return { maybeSingle: () => Promise.resolve({ data: row }) };
              },
            };
          },
        };
      },
    },
  };
}

beforeEach(() => {
  isShareMgmtAddonPriceMock.mockReset().mockImplementation((id) => id === ADDON_PRICE);
  grantAddonMock.mockReset().mockResolvedValue(true);
  revokeAddonMock.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------

describe("decideShareMgmtAddon — grant", () => {
  it.each(["active", "trialing"])(
    "grants while the subscription is %s and carries the add-on item",
    (status) => {
      const d = decideShareMgmtAddon(sub(status, [BASE_PRICE, ADDON_PRICE]));
      expect(d.action).toBe("grant");
    },
  );

  it("carries the subscription, item and price ids into the audit detail", () => {
    const d = decideShareMgmtAddon(sub("active", [BASE_PRICE, ADDON_PRICE]));
    expect(d).toMatchObject({
      action: "grant",
      addon: "share_management",
      detail: {
        subscription_id: "sub_1",
        subscription_item_id: "si_1",
        price_id: ADDON_PRICE,
        status: "active",
      },
    });
  });
});

describe("decideShareMgmtAddon — revoke", () => {
  // Every status that is not active/trialing is somebody who is not paying.
  it.each([
    "past_due",
    "unpaid",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "paused",
  ])("revokes when the subscription is %s even though the item is present", (status) => {
    const d = decideShareMgmtAddon(sub(status));
    expect(d.action).toBe("revoke");
    expect(d).toMatchObject({ reason: `subscription_status_${status}` });
  });

  it("revokes when the add-on item is no longer on an otherwise healthy subscription", () => {
    const d = decideShareMgmtAddon(sub("active", [BASE_PRICE]));
    expect(d.action).toBe("revoke");
    expect((d as { reason: string }).reason).toContain("addon_item_absent");
  });

  it("revokes on a subscription with no items at all", () => {
    const d = decideShareMgmtAddon({ id: "sub_1", status: "active", items: { data: [] } });
    expect(d.action).toBe("revoke");
  });

  it("revokes on a null/undefined subscription — absence never grants", () => {
    expect(decideShareMgmtAddon(null).action).toBe("revoke");
    expect(decideShareMgmtAddon(undefined).action).toBe("revoke");
  });

  it("revokes on a missing status rather than assuming it is live", () => {
    expect(
      decideShareMgmtAddon({ id: "s", items: { data: [{ id: "i", price: { id: ADDON_PRICE } }] } })
        .action,
    ).toBe("revoke");
  });

  it("revokes on an unrecognised future status", () => {
    expect(decideShareMgmtAddon(sub("some_new_stripe_status")).action).toBe("revoke");
  });

  it("is a pure function — it touches neither grant nor revoke itself", () => {
    decideShareMgmtAddon(sub("active"));
    decideShareMgmtAddon(sub("canceled"));
    expect(grantAddonMock).not.toHaveBeenCalled();
    expect(revokeAddonMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("userIdForCustomer", () => {
  it("resolves the app user behind a Stripe customer", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    expect(await userIdForCustomer(fake.client, "cus_1")).toBe("user-9");
    expect(fake.calls).toEqual([["stripe_customer_id", "cus_1"]]);
  });

  it("returns null for a missing customer id without querying", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    expect(await userIdForCustomer(fake.client, null)).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it("returns null when no app user matches", async () => {
    expect(await userIdForCustomer(supabaseReturning(null).client, "cus_x")).toBeNull();
  });

  it("returns null instead of throwing when the lookup blows up", async () => {
    const broken = {
      from() {
        throw new Error("db down");
      },
    };
    await expect(userIdForCustomer(broken, "cus_1")).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("applyAddonDecision", () => {
  it("routes a grant decision to grantAddon with its detail", async () => {
    await applyAddonDecision("user-9", decideShareMgmtAddon(sub("active")));
    expect(grantAddonMock).toHaveBeenCalledWith({
      userId: "user-9",
      addon: "share_management",
      detail: expect.objectContaining({ price_id: ADDON_PRICE }),
    });
    expect(revokeAddonMock).not.toHaveBeenCalled();
  });

  it("routes a revoke decision to revokeAddon with its reason", async () => {
    await applyAddonDecision("user-9", decideShareMgmtAddon(sub("canceled")));
    expect(revokeAddonMock).toHaveBeenCalledWith({
      userId: "user-9",
      addon: "share_management",
      reason: "subscription_status_canceled",
    });
    expect(grantAddonMock).not.toHaveBeenCalled();
  });
});

describe("reconcileSubscriptionAddon", () => {
  it("grants for the user behind the subscription's customer", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    await reconcileSubscriptionAddon({ supabase: fake.client, subscription: sub("active") });
    expect(grantAddonMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-9" }),
    );
  });

  it("skips the customer lookup when the caller already knows the user", async () => {
    const fake = supabaseReturning({ id: "wrong-user" });
    await reconcileSubscriptionAddon({
      supabase: fake.client,
      subscription: sub("active"),
      userId: "user-9",
    });
    expect(fake.calls).toHaveLength(0);
    expect(grantAddonMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-9" }),
    );
  });

  it("does nothing at all when no app user can be resolved", async () => {
    const fake = supabaseReturning(null);
    await reconcileSubscriptionAddon({ supabase: fake.client, subscription: sub("active") });
    expect(grantAddonMock).not.toHaveBeenCalled();
    expect(revokeAddonMock).not.toHaveBeenCalled();
  });

  it("revokes when the add-on item has been removed from the subscription", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    await reconcileSubscriptionAddon({
      supabase: fake.client,
      subscription: sub("active", [BASE_PRICE]),
    });
    expect(revokeAddonMock).toHaveBeenCalled();
    expect(grantAddonMock).not.toHaveBeenCalled();
  });

  it("is idempotent — redelivering the same event reaches the same state", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    const s = sub("active");
    await reconcileSubscriptionAddon({ supabase: fake.client, subscription: s });
    await reconcileSubscriptionAddon({ supabase: fake.client, subscription: s });
    expect(grantAddonMock).toHaveBeenCalledTimes(2);
    expect(grantAddonMock.mock.calls[0]).toEqual(grantAddonMock.mock.calls[1]);
  });
});

describe("revokeAddonForCustomer", () => {
  it("revokes with the caller's reason", async () => {
    const fake = supabaseReturning({ id: "user-9" });
    await revokeAddonForCustomer({
      supabase: fake.client,
      customerId: "cus_1",
      reason: "subscription_deleted",
    });
    expect(revokeAddonMock).toHaveBeenCalledWith({
      userId: "user-9",
      addon: "share_management",
      reason: "subscription_deleted",
    });
  });

  it("no-ops when the customer maps to no app user", async () => {
    await revokeAddonForCustomer({
      supabase: supabaseReturning(null).client,
      customerId: "cus_x",
      reason: "x",
    });
    expect(revokeAddonMock).not.toHaveBeenCalled();
  });
});
