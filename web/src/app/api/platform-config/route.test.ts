// Colocated vitest for GET /api/platform-config — P9-platform-config-route-test.
//
// The public read of platform config used by every client component that
// needs pricing / promo / waitlist state. This route is the single guard
// preventing admin-only PlatformConfig fields (referral_credits,
// credit_cost_*, svi_weights, stage_thresholds, growth_plan_credits_monthly,
// linkedin_post_enabled) from leaking to unauthenticated visitors, so a
// silent regression here becomes a privacy incident:
//
//   - adding a new admin-only field to CONFIG_DEFAULTS without also gating
//     it in the route's publicConfig projection would leak it as soon as
//     the defaults ship;
//   - dropping the projection entirely and returning `cfg` directly would
//     expose credit cost internals + SVI weight tuning to competitors;
//   - dropping the Cache-Control header would take the CDN cache off and
//     hammer the platform_config table for every client mount;
//   - dropping the s-maxage=60 alignment with `export const revalidate = 60`
//     would create a stale-vs-fresh split between ISR and CDN;
//   - a rewrite that made the projection dynamic (`Object.keys(cfg)`) would
//     silently regress the safe-fields whitelist the moment a new admin
//     field appears in defaults.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_DEFAULTS, type PlatformConfig } from "@/lib/platform-config";

// --- Mocks (registered BEFORE route import) --------------------------------

const getPlatformConfigMock = vi.fn<() => Promise<PlatformConfig>>();
vi.mock("@/lib/platform-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform-config")>(
    "@/lib/platform-config",
  );
  return {
    ...actual,
    getPlatformConfig: () => getPlatformConfigMock(),
  };
});

// Route import MUST come after mocks are registered.
import { GET, revalidate } from "./route";

beforeEach(() => {
  getPlatformConfigMock.mockReset();
  getPlatformConfigMock.mockResolvedValue({ ...CONFIG_DEFAULTS });
});

afterEach(() => {
  vi.clearAllMocks();
});

// The 12 fields the route explicitly whitelists into publicConfig. Pinned
// here so any deletion/addition to the projection is a conscious PR.
const PUBLIC_KEYS = [
  "founding_plan_name",
  "founding_spots_total",
  "founding_price_cents",
  "founding_credits",
  "founding_plan_active",
  "waitlist_mode",
  "free_credits_on_signup",
  "growth_price_monthly_cents",
  "growth_price_yearly_cents",
  "promo_code",
  "promo_label",
  "early_bird_deadline",
] as const;

// Admin-only fields that MUST NEVER appear in the public payload.
const ADMIN_ONLY_KEYS = [
  "referral_credits",
  "credit_cost_svi_analysis",
  "credit_cost_term_sheet",
  "credit_cost_rnd_report",
  "credit_cost_evidence_analyze",
  "svi_weights",
  "stage_thresholds",
  "growth_plan_credits_monthly",
  "linkedin_post_enabled",
] as const;

async function callGet(): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await GET();
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body };
}

describe("GET /api/platform-config", () => {
  it("returns 200 with the whitelisted default config on a clean cache", async () => {
    const { res, body } = await callGet();
    expect(res.status).toBe(200);
    for (const key of PUBLIC_KEYS) {
      expect(body).toHaveProperty(key);
      expect(body[key]).toEqual(CONFIG_DEFAULTS[key]);
    }
  });

  it("exposes exactly the 12 whitelisted keys — no more, no less", async () => {
    const { body } = await callGet();
    const returned = new Set(Object.keys(body));
    expect(returned.size).toBe(PUBLIC_KEYS.length);
    for (const key of PUBLIC_KEYS) {
      expect(returned.has(key)).toBe(true);
    }
  });

  it("never leaks any of the admin-only keys", async () => {
    const { body } = await callGet();
    for (const key of ADMIN_ONLY_KEYS) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("in particular does not leak referral_credits", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("referral_credits");
  });

  it("in particular does not leak credit_cost_svi_analysis", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("credit_cost_svi_analysis");
  });

  it("in particular does not leak svi_weights", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("svi_weights");
  });

  it("in particular does not leak stage_thresholds", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("stage_thresholds");
  });

  it("in particular does not leak growth_plan_credits_monthly", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("growth_plan_credits_monthly");
  });

  it("in particular does not leak linkedin_post_enabled", async () => {
    const { body } = await callGet();
    expect(body).not.toHaveProperty("linkedin_post_enabled");
  });

  it("propagates admin overrides on the whitelisted fields", async () => {
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      founding_plan_name: "Founding 50",
      founding_spots_total: 50,
      founding_price_cents: 14900,
      founding_credits: 25,
      waitlist_mode: true,
      promo_code: "SHIP2026",
      early_bird_deadline: "2027-01-31",
    });
    const { body } = await callGet();
    expect(body.founding_plan_name).toBe("Founding 50");
    expect(body.founding_spots_total).toBe(50);
    expect(body.founding_price_cents).toBe(14900);
    expect(body.founding_credits).toBe(25);
    expect(body.waitlist_mode).toBe(true);
    expect(body.promo_code).toBe("SHIP2026");
    expect(body.early_bird_deadline).toBe("2027-01-31");
  });

  it("preserves boolean false on founding_plan_active (does not coerce or drop)", async () => {
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      founding_plan_active: false,
    });
    const { body } = await callGet();
    expect(body).toHaveProperty("founding_plan_active");
    expect(body.founding_plan_active).toBe(false);
  });

  it("preserves boolean false on waitlist_mode (does not coerce or drop)", async () => {
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      waitlist_mode: false,
    });
    const { body } = await callGet();
    expect(body).toHaveProperty("waitlist_mode");
    expect(body.waitlist_mode).toBe(false);
  });

  it("does not project an unknown admin-added field even if getPlatformConfig returned it", async () => {
    // Simulate a future admin field slipping into the resolved config. The
    // route's explicit projection must NOT forward it.
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secret_new_admin_field: "leak-me",
    } as unknown as PlatformConfig);
    const { body } = await callGet();
    expect(body).not.toHaveProperty("secret_new_admin_field");
  });

  it("sets Cache-Control public,s-maxage=60,stale-while-revalidate=30", async () => {
    const { res } = await callGet();
    const cc = res.headers.get("Cache-Control");
    expect(cc).toBe("public, s-maxage=60, stale-while-revalidate=30");
  });

  it("returns application/json content-type", async () => {
    const { res } = await callGet();
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct.toLowerCase()).toContain("application/json");
  });

  it("calls getPlatformConfig exactly once per request", async () => {
    await callGet();
    expect(getPlatformConfigMock).toHaveBeenCalledTimes(1);
  });

  it("does not call getPlatformConfig with any arguments", async () => {
    await callGet();
    const args = getPlatformConfigMock.mock.calls[0] ?? [];
    expect(args.length).toBe(0);
  });

  it("exports revalidate = 60 to align ISR with the s-maxage header", async () => {
    // Split-brain regression check: if a future edit changes one value
    // without the other, the CDN and ISR windows diverge.
    expect(revalidate).toBe(60);
  });

  it("returns numeric fields as JSON numbers, not strings", async () => {
    const { body } = await callGet();
    expect(typeof body.founding_spots_total).toBe("number");
    expect(typeof body.founding_price_cents).toBe("number");
    expect(typeof body.founding_credits).toBe("number");
    expect(typeof body.free_credits_on_signup).toBe("number");
    expect(typeof body.growth_price_monthly_cents).toBe("number");
    expect(typeof body.growth_price_yearly_cents).toBe("number");
  });

  it("returns string fields as strings", async () => {
    const { body } = await callGet();
    expect(typeof body.founding_plan_name).toBe("string");
    expect(typeof body.promo_code).toBe("string");
    expect(typeof body.promo_label).toBe("string");
    expect(typeof body.early_bird_deadline).toBe("string");
  });

  it("returns boolean fields as booleans", async () => {
    const { body } = await callGet();
    expect(typeof body.founding_plan_active).toBe("boolean");
    expect(typeof body.waitlist_mode).toBe("boolean");
  });

  it("propagates a numeric zero without coercing to null (free_credits_on_signup=0 is valid)", async () => {
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      free_credits_on_signup: 0,
    });
    const { body } = await callGet();
    expect(body.free_credits_on_signup).toBe(0);
    expect(body.free_credits_on_signup).not.toBeNull();
  });

  it("propagates an empty string promo_code without dropping the key", async () => {
    getPlatformConfigMock.mockResolvedValue({
      ...CONFIG_DEFAULTS,
      promo_code: "",
    });
    const { body } = await callGet();
    expect(body).toHaveProperty("promo_code");
    expect(body.promo_code).toBe("");
  });

  it("bubbles a thrown error from getPlatformConfig — the route does not catch", async () => {
    // getPlatformConfig() in lib is already defensive (returns CONFIG_DEFAULTS
    // on failure), so the route intentionally has no catch. This pins that
    // the failure mode is loud (500 from Next) rather than silently masked.
    getPlatformConfigMock.mockRejectedValue(new Error("cfg-unreachable"));
    await expect(callGet()).rejects.toThrow(/cfg-unreachable/);
  });

  it("does not include a numeric growth_plan_credits_monthly even if defaults ship one", async () => {
    // Extra pin: growth_plan_credits_monthly is the field most likely to
    // be added to the public projection by mistake because it lives next
    // to the growth_price_* fields that ARE public.
    const { body } = await callGet();
    expect(body).not.toHaveProperty("growth_plan_credits_monthly");
  });

  it("returns fresh values on each call (no in-route memoisation on top of the lib cache)", async () => {
    getPlatformConfigMock.mockResolvedValueOnce({
      ...CONFIG_DEFAULTS,
      founding_plan_name: "Round A",
    });
    getPlatformConfigMock.mockResolvedValueOnce({
      ...CONFIG_DEFAULTS,
      founding_plan_name: "Round B",
    });
    const first = await callGet();
    const second = await callGet();
    expect(first.body.founding_plan_name).toBe("Round A");
    expect(second.body.founding_plan_name).toBe("Round B");
    expect(getPlatformConfigMock).toHaveBeenCalledTimes(2);
  });
});
