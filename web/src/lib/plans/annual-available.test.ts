import { describe, expect, it, vi } from "vitest";

const plansMock = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock("@/lib/plans-db", () => ({
  getPlansCached: async () => {
    if (plansMock.fail) throw new Error("db down");
    return plansMock.rows;
  },
}));

import { annualAvailablePlanIds, purchasablePlanIds } from "./annual-available";

describe("plan availability from the plans table", () => {
  it("purchasablePlanIds = rows with a monthly Stripe price; Fund / Intake without one render Contact sales (W4 review P1)", async () => {
    plansMock.rows = [
      { id: "investor_vc_small", stripe_price_id: "price_prog", stripe_price_id_annual: "price_prog_y", annual_price_aud_cents: 349000 },
      { id: "investor_fund", stripe_price_id: null, stripe_price_id_annual: null, annual_price_aud_cents: 999000 },
      { id: "accelerator_intake", stripe_price_id: null, stripe_price_id_annual: null, annual_price_aud_cents: 249000 },
    ];
    expect(await purchasablePlanIds()).toEqual(["investor_vc_small"]);
    expect(await annualAvailablePlanIds()).toEqual(["investor_vc_small"]);
  });

  it("DB failure → undefined for purchasable (trust the catalogue), [] for annual", async () => {
    plansMock.fail = true;
    expect(await purchasablePlanIds()).toBeUndefined();
    expect(await annualAvailablePlanIds()).toEqual([]);
    plansMock.fail = false;
  });
});
