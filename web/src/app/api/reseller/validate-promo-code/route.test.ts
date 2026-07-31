/**
 * Route-handler tests for POST /api/reseller/validate-promo-code (task M2).
 *
 * Stubs Supabase + rate-limit + iphash modules so the handler exercises
 * every branch without a real DB. Uses vitest module-mocking (vi.mock).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── module mocks ─────────────────────────────────────────────────────
// Backing state that individual tests mutate before calling POST().
type PromoRow = {
  code: string;
  tier_pct: number;
  active: boolean;
  reseller_id: string;
  max_redemptions: number | null;
  redemption_count: number;
};
type ResellerRow = { slug: string; display_name: string; status: string };
type Store = {
  promo: PromoRow | null;
  reseller: ResellerRow | null;
  supabaseAvailable: boolean;
  throwOnPromoLookup: boolean;
};

const store: Store = {
  promo: null,
  reseller: null,
  supabaseAvailable: true,
  throwOnPromoLookup: false,
};

let rateLimitAllowed = true;

function resetStore() {
  store.promo = null;
  store.reseller = null;
  store.supabaseAvailable = true;
  store.throwOnPromoLookup = false;
  rateLimitAllowed = true;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!store.supabaseAvailable) return null;
    return {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => {
            if (table === "reseller_promotion_codes") {
              if (store.throwOnPromoLookup) throw new Error("db offline");
              return { data: store.promo, error: null };
            }
            if (table === "resellers") {
              return { data: store.reseller, error: null };
            }
            return { data: null, error: null };
          },
        };
      },
    };
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({
    allowed: rateLimitAllowed,
    remaining: rateLimitAllowed ? 29 : 0,
    resetIn: 60_000,
  }),
}));

vi.mock("@/lib/iphash", () => ({
  clientIpFromHeaders: () => "127.0.0.1",
}));

// ── helpers ──────────────────────────────────────────────────────────
async function post(body: unknown): Promise<{ status: number; json: unknown }> {
  const { POST } = await import("./route");
  const req = new Request("http://localhost/api/reseller/validate-promo-code", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

beforeEach(() => {
  resetStore();
});

// ── tests ────────────────────────────────────────────────────────────

describe("POST /api/reseller/validate-promo-code — happy path", () => {
  it("returns discount + reseller slug for an active code", async () => {
    store.promo = {
      code: "IFV20",
      tier_pct: 20,
      active: true,
      reseller_id: "r-1",
      max_redemptions: null,
      redemption_count: 0,
    };
    store.reseller = {
      slug: "infovision",
      display_name: "InfoVision",
      status: "active",
    };
    const { status, json } = await post({ code: "ifv20" });
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      code: "IFV20",
      discountPct: 20,
      resellerSlug: "infovision",
      resellerDisplayName: "InfoVision",
    });
  });

  it("normalises punctuation before lookup", async () => {
    store.promo = {
      code: "IFV20",
      tier_pct: 20,
      active: true,
      reseller_id: "r-1",
      max_redemptions: null,
      redemption_count: 0,
    };
    store.reseller = { slug: "iv", display_name: "IV", status: "active" };
    const { json } = await post({ code: "if.v-20" });
    expect((json as { ok: boolean }).ok).toBe(true);
  });
});

describe("POST /api/reseller/validate-promo-code — failure branches", () => {
  it("400 invalid on empty / non-string / punctuation-only body", async () => {
    const cases = ["", "-.-", null, undefined, 42];
    for (const c of cases) {
      const { status, json } = await post({ code: c });
      expect(status).toBe(400);
      expect((json as { reason: string }).reason).toBe("invalid");
    }
  });

  it("returns unknown when the code does not exist", async () => {
    store.promo = null;
    const { status, json } = await post({ code: "MISSING" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: false, reason: "unknown" });
  });

  it("returns unknown when the code is inactive (never leaks existence)", async () => {
    store.promo = {
      code: "OLD",
      tier_pct: 10,
      active: false,
      reseller_id: "r-x",
      max_redemptions: null,
      redemption_count: 0,
    };
    const { status, json } = await post({ code: "OLD" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: false, reason: "unknown" });
  });

  it("returns unknown when max_redemptions has been reached", async () => {
    store.promo = {
      code: "CAPPED",
      tier_pct: 10,
      active: true,
      reseller_id: "r-1",
      max_redemptions: 5,
      redemption_count: 5,
    };
    store.reseller = { slug: "iv", display_name: "IV", status: "active" };
    const { json } = await post({ code: "CAPPED" });
    expect(json).toEqual({ ok: false, reason: "unknown" });
  });

  it("returns inactive when reseller status !== 'active'", async () => {
    store.promo = {
      code: "IFV20",
      tier_pct: 20,
      active: true,
      reseller_id: "r-1",
      max_redemptions: null,
      redemption_count: 0,
    };
    store.reseller = {
      slug: "old",
      display_name: "Old",
      status: "terminated",
    };
    const { json } = await post({ code: "IFV20" });
    expect(json).toEqual({ ok: false, reason: "inactive" });
  });

  it("returns unknown when supabase is unavailable (fail-closed)", async () => {
    store.supabaseAvailable = false;
    const { status, json } = await post({ code: "IFV20" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: false, reason: "unknown" });
  });

  it("returns unknown when the lookup throws (defence-in-depth)", async () => {
    store.throwOnPromoLookup = true;
    const { status, json } = await post({ code: "IFV20" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: false, reason: "unknown" });
  });

  it("429 rate_limited when the bucket rejects", async () => {
    rateLimitAllowed = false;
    const { status, json } = await post({ code: "IFV20" });
    expect(status).toBe(429);
    expect((json as { reason: string }).reason).toBe("rate_limited");
  });
});
