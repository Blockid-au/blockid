// Colocated regression suite for `web/src/lib/stripe.ts` — the server-side
// Stripe SDK factory + the plan-id ↔ price-id maps that every checkout,
// change-plan, webhook, and reseller add-on billing surface reads. A silent
// regression here has an outsized blast radius:
//   - drop the cached-null memo in `getStripe()` and every request re-parses
//     env + re-constructs a Stripe client on the missing-key path (which is
//     the exact posture the CI/preview envs run in);
//   - drop a key from `STRIPE_PRICE_MAP` (or rename its env-var source) and
//     the corresponding SKU silently 400s at /api/stripe/checkout because
//     `STRIPE_PRICE_MAP[plan]` resolves to `undefined`;
//   - drop the `?? null` fallback in `ADDON_PRICE_IDS` and a pre-provisioned
//     env crashes the module import at boot rather than gracefully surfacing
//     "add-on not-yet-provisioned" to the caller (per docs comment lines 62-63);
//   - drop the strict equality in `isShareMgmtAddonPrice` and an unrelated
//     price-id could be misclassified as an add-on line, causing the
//     change-plan route to swap the base plan for an add-on top-up.
//
// P9_ship autonomous-loop tick — first test coverage for stripe.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; we install a Stripe constructor spy that captures every
// `new Stripe(secret, opts)` call so we can pin the cached-init contract.
const { stripeCtor } = vi.hoisted(() => ({
  stripeCtor: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    public secret: string;
    public opts: Record<string, unknown>;
    constructor(secret: string, opts: Record<string, unknown>) {
      this.secret = secret;
      this.opts = opts;
      stripeCtor(secret, opts);
    }
  }
  return { default: FakeStripe };
});

// ─── env snapshot helpers ────────────────────────────────────────────────────

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_FOUNDING50",
  "STRIPE_PRICE_FOUNDER",
  "STRIPE_PRICE_GROWTH",
  "STRIPE_PRICE_GROWTH_ANNUAL",
  "STRIPE_PRICE_GROWTH_499",
  "STRIPE_PRICE_PILOT",
  "STRIPE_PRICE_ACCELERATOR",
  "STRIPE_PRICE_SVI_ANALYSIS",
  "STRIPE_PRICE_SVI_ANALYSIS_25",
  "STRIPE_PRICE_CREDITS_5",
  "STRIPE_PRICE_CREDITS_10",
  "STRIPE_PRICE_CREDITS_25",
  "STRIPE_PRICE_CREDITS_50",
  "STRIPE_PRICE_CREDITS_100",
  "STRIPE_PRICE_STARTUP_PACKAGE",
  "STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY",
  "STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

// Import stripe.ts fresh so the module-scope `cached` memo + the
// STRIPE_PRICE_MAP / ADDON_PRICE_IDS constants (captured at import time) see
// the current process.env snapshot.
async function loadStripeMod() {
  vi.resetModules();
  return await import("./stripe");
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  clearEnv();
  stripeCtor.mockClear();
});

afterEach(() => {
  restoreEnv();
});

// ─── isStripeConfigured ──────────────────────────────────────────────────────

describe("isStripeConfigured", () => {
  it("returns false when STRIPE_SECRET_KEY is unset", async () => {
    const mod = await loadStripeMod();
    expect(mod.isStripeConfigured()).toBe(false);
  });

  it("returns true when STRIPE_SECRET_KEY is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xyz";
    const mod = await loadStripeMod();
    expect(mod.isStripeConfigured()).toBe(true);
  });

  it("returns false for empty string (Boolean(\"\") === false)", async () => {
    process.env.STRIPE_SECRET_KEY = "";
    const mod = await loadStripeMod();
    expect(mod.isStripeConfigured()).toBe(false);
  });
});

// ─── getStripe ───────────────────────────────────────────────────────────────

describe("getStripe", () => {
  it("returns null when STRIPE_SECRET_KEY is unset and does NOT call the Stripe constructor", async () => {
    const mod = await loadStripeMod();
    expect(mod.getStripe()).toBeNull();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("constructs a Stripe client when STRIPE_SECRET_KEY is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    const mod = await loadStripeMod();
    const client = mod.getStripe();
    expect(client).not.toBeNull();
    expect(stripeCtor).toHaveBeenCalledTimes(1);
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_abc", { typescript: true });
  });

  it("caches the null result — a 2nd call does not re-check env even after env changes", async () => {
    // First call: env unset → cache null.
    const mod = await loadStripeMod();
    expect(mod.getStripe()).toBeNull();
    // Now set the env; the cached null must survive so downstream callers
    // don't get a mid-request client swap.
    process.env.STRIPE_SECRET_KEY = "sk_test_late";
    expect(mod.getStripe()).toBeNull();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("caches the Stripe client — repeated calls return the same instance and construct only once", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_cached";
    const mod = await loadStripeMod();
    const first = mod.getStripe();
    const second = mod.getStripe();
    const third = mod.getStripe();
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(stripeCtor).toHaveBeenCalledTimes(1);
  });

  it("passes the secret key from env verbatim (no trimming or mutation)", async () => {
    process.env.STRIPE_SECRET_KEY = "  sk_test_padded  ";
    const mod = await loadStripeMod();
    mod.getStripe();
    expect(stripeCtor).toHaveBeenCalledWith("  sk_test_padded  ", { typescript: true });
  });
});

// ─── STRIPE_PRICE_MAP ────────────────────────────────────────────────────────

describe("STRIPE_PRICE_MAP", () => {
  it("exposes every documented plan + credit-pack + add-on key", async () => {
    const mod = await loadStripeMod();
    // Frozen key set — a rename here forces a paired update at every checkout
    // / change-plan / webhook site, so the test file becomes the ledger.
    const expectedKeys = [
      "founding50",
      "founder",
      "growth",
      "growth_annual",
      "growth_499",
      "pilot",
      "accelerator",
      "svi_analysis",
      "svi_analysis_25",
      "credits_5",
      "credits_10",
      "credits_25",
      "credits_50",
      "credits_100",
      "founder_package",
      "addon_share_mgmt_monthly",
      "addon_share_mgmt_annual",
      "one_click_report",
    ] as const;
    const actualKeys = Object.keys(mod.STRIPE_PRICE_MAP).sort();
    expect(actualKeys).toEqual([...expectedKeys].sort());
  });

  it("reads env vars at import time — each plan maps to its dedicated env source", async () => {
    process.env.STRIPE_PRICE_FOUNDING50 = "price_f50";
    process.env.STRIPE_PRICE_FOUNDER = "price_founder";
    process.env.STRIPE_PRICE_GROWTH = "price_growth";
    process.env.STRIPE_PRICE_GROWTH_ANNUAL = "price_growth_annual";
    process.env.STRIPE_PRICE_GROWTH_499 = "price_growth_499";
    process.env.STRIPE_PRICE_PILOT = "price_pilot";
    process.env.STRIPE_PRICE_ACCELERATOR = "price_accel";
    process.env.STRIPE_PRICE_SVI_ANALYSIS = "price_svi";
    process.env.STRIPE_PRICE_SVI_ANALYSIS_25 = "price_svi25";
    process.env.STRIPE_PRICE_CREDITS_5 = "price_c5";
    process.env.STRIPE_PRICE_CREDITS_10 = "price_c10";
    process.env.STRIPE_PRICE_CREDITS_25 = "price_c25";
    process.env.STRIPE_PRICE_CREDITS_50 = "price_c50";
    process.env.STRIPE_PRICE_CREDITS_100 = "price_c100";
    process.env.STRIPE_PRICE_STARTUP_PACKAGE = "price_startup_pkg";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_share_y";
    const mod = await loadStripeMod();
    expect(mod.STRIPE_PRICE_MAP.founding50).toBe("price_f50");
    expect(mod.STRIPE_PRICE_MAP.founder).toBe("price_founder");
    expect(mod.STRIPE_PRICE_MAP.growth).toBe("price_growth");
    expect(mod.STRIPE_PRICE_MAP.growth_annual).toBe("price_growth_annual");
    expect(mod.STRIPE_PRICE_MAP.growth_499).toBe("price_growth_499");
    expect(mod.STRIPE_PRICE_MAP.pilot).toBe("price_pilot");
    expect(mod.STRIPE_PRICE_MAP.accelerator).toBe("price_accel");
    expect(mod.STRIPE_PRICE_MAP.svi_analysis).toBe("price_svi");
    expect(mod.STRIPE_PRICE_MAP.svi_analysis_25).toBe("price_svi25");
    expect(mod.STRIPE_PRICE_MAP.credits_5).toBe("price_c5");
    expect(mod.STRIPE_PRICE_MAP.credits_10).toBe("price_c10");
    expect(mod.STRIPE_PRICE_MAP.credits_25).toBe("price_c25");
    expect(mod.STRIPE_PRICE_MAP.credits_50).toBe("price_c50");
    expect(mod.STRIPE_PRICE_MAP.credits_100).toBe("price_c100");
    expect(mod.STRIPE_PRICE_MAP.founder_package).toBe("price_startup_pkg");
    expect(mod.STRIPE_PRICE_MAP.addon_share_mgmt_monthly).toBe("price_share_m");
    expect(mod.STRIPE_PRICE_MAP.addon_share_mgmt_annual).toBe("price_share_y");
  });

  it("leaves each entry as undefined when its env var is not set", async () => {
    const mod = await loadStripeMod();
    for (const key of Object.keys(mod.STRIPE_PRICE_MAP)) {
      expect(mod.STRIPE_PRICE_MAP[key]).toBeUndefined();
    }
  });

  it("only reads its own dedicated env var — a partial env leaves other slots undefined", async () => {
    // Only set the growth env; every other slot must remain undefined.
    process.env.STRIPE_PRICE_GROWTH = "price_growth_only";
    const mod = await loadStripeMod();
    expect(mod.STRIPE_PRICE_MAP.growth).toBe("price_growth_only");
    expect(mod.STRIPE_PRICE_MAP.founding50).toBeUndefined();
    expect(mod.STRIPE_PRICE_MAP.founder).toBeUndefined();
    expect(mod.STRIPE_PRICE_MAP.credits_100).toBeUndefined();
    expect(mod.STRIPE_PRICE_MAP.founder_package).toBeUndefined();
  });
});

// ─── ADDON_PRICE_IDS ─────────────────────────────────────────────────────────

describe("ADDON_PRICE_IDS", () => {
  it("exposes exactly the share_management_{monthly,annual} keys", async () => {
    const mod = await loadStripeMod();
    expect(Object.keys(mod.ADDON_PRICE_IDS).sort()).toEqual([
      "share_management_annual",
      "share_management_monthly",
    ]);
  });

  it("falls back to null (not undefined) when the env var is unset — module import must not crash callers on the not-yet-provisioned path", async () => {
    const mod = await loadStripeMod();
    expect(mod.ADDON_PRICE_IDS.share_management_monthly).toBeNull();
    expect(mod.ADDON_PRICE_IDS.share_management_annual).toBeNull();
  });

  it("reflects the env var value when set", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m_env";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_share_y_env";
    const mod = await loadStripeMod();
    expect(mod.ADDON_PRICE_IDS.share_management_monthly).toBe("price_share_m_env");
    expect(mod.ADDON_PRICE_IDS.share_management_annual).toBe("price_share_y_env");
  });

  it("resolves each cadence independently — monthly env alone leaves annual null", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m_only";
    const mod = await loadStripeMod();
    expect(mod.ADDON_PRICE_IDS.share_management_monthly).toBe("price_share_m_only");
    expect(mod.ADDON_PRICE_IDS.share_management_annual).toBeNull();
  });
});

// ─── getShareMgmtAddonPrice ──────────────────────────────────────────────────

describe("getShareMgmtAddonPrice", () => {
  it("returns the monthly price for cadence='monthly'", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_m_ok";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_y_ok";
    const mod = await loadStripeMod();
    expect(mod.getShareMgmtAddonPrice("monthly")).toBe("price_m_ok");
  });

  it("returns the annual price for cadence='annual'", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_m_ok";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_y_ok";
    const mod = await loadStripeMod();
    expect(mod.getShareMgmtAddonPrice("annual")).toBe("price_y_ok");
  });

  it("returns null when the cadence env var is unset — callers must detect the not-yet-provisioned path", async () => {
    const mod = await loadStripeMod();
    expect(mod.getShareMgmtAddonPrice("monthly")).toBeNull();
    expect(mod.getShareMgmtAddonPrice("annual")).toBeNull();
  });

  it("does NOT cross-wire cadences — annual env alone leaves monthly null and vice versa", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_y_only";
    const mod = await loadStripeMod();
    expect(mod.getShareMgmtAddonPrice("annual")).toBe("price_y_only");
    expect(mod.getShareMgmtAddonPrice("monthly")).toBeNull();
  });
});

// ─── isShareMgmtAddonPrice ───────────────────────────────────────────────────

describe("isShareMgmtAddonPrice", () => {
  it("returns false for null", async () => {
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice(null)).toBe(false);
  });

  it("returns false for undefined", async () => {
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice(undefined)).toBe(false);
  });

  it("returns false for empty string (falsy guard)", async () => {
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("")).toBe(false);
  });

  it("returns true when the price matches the monthly add-on env", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m_id";
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("price_share_m_id")).toBe(true);
  });

  it("returns true when the price matches the annual add-on env", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_share_y_id";
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("price_share_y_id")).toBe(true);
  });

  it("returns false for an unrelated price-id", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m_id";
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL = "price_share_y_id";
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("price_random_something")).toBe(false);
  });

  it("returns false when both add-on envs are unset — an arbitrary caller price-id cannot accidentally match null", async () => {
    // Guard against a regression where `priceId === ADDON_PRICE_IDS.share_management_monthly`
    // gets compared as `"price_x" === null` (false — safe), but a subtle
    // refactor to `priceId == ADDON_PRICE_IDS.share_management_monthly` would
    // still be false; the real risk is a future `.includes()` on a null-guarded
    // array. Pin the current strict-equality contract.
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("price_anything")).toBe(false);
  });

  it("is case-sensitive — the monthly price-id capitalised differently does NOT match", async () => {
    process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY = "price_share_m_id";
    const mod = await loadStripeMod();
    expect(mod.isShareMgmtAddonPrice("PRICE_SHARE_M_ID")).toBe(false);
  });
});
