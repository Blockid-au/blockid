/**
 * Route-handler tests for POST /api/reseller/validate-promo-code (task M2).
 *
 * The handler delegates the lookup to `resolvePromoCode()` — the single
 * audited unscoped read of the promotion table (see R-10 note in route.ts).
 * These tests mock that resolver rather than Supabase, so they pin the
 * route's own contract (validation, rate limiting, response shape,
 * fail-closed behaviour) without re-testing the resolver's internals.
 * `resolve-promo.test.ts` covers the resolver itself.
 *
 * Non-enumeration invariant: every lookup failure — code absent, code
 * inactive, redemptions exhausted, reseller terminated, Stripe id still a
 * pending_* placeholder — collapses to the SAME `{ok:false, reason:"unknown"}`
 * response. The resolver returns null for all of them, so an attacker
 * cannot distinguish "no such code" from "code exists but is disabled" and
 * therefore cannot enumerate the reseller roster.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedPromo } from "@/lib/reseller/resolve-promo";

// ── module mocks ─────────────────────────────────────────────────────
// Backing state that individual tests mutate before calling POST().
type Store = {
  resolved: ResolvedPromo | null;
  throwOnResolve: boolean;
  lastCodeSeen: string | null;
};

const store: Store = {
  resolved: null,
  throwOnResolve: false,
  lastCodeSeen: null,
};

let rateLimitAllowed = true;

function resetStore() {
  store.resolved = null;
  store.throwOnResolve = false;
  store.lastCodeSeen = null;
  rateLimitAllowed = true;
}

/** Build a fully-populated ResolvedPromo for the happy path. */
function makeResolved(over: Partial<ResolvedPromo> = {}): ResolvedPromo {
  return {
    resellerId: "r-1",
    resellerCode: "INFOVISION",
    resellerSlug: "INFOVISION",
    resellerDisplayName: "InfoVision",
    discountPct: 20,
    stripeCouponId: "Qxr6eDzr",
    stripePromotionCodeId: "promo_1Tz7RIJ7OAnXQ9sVftNKXihs",
    code: "IFV20",
    promoRowId: "p-1",
    ...over,
  };
}

vi.mock("@/lib/reseller/resolve-promo", () => ({
  resolvePromoCode: async (code: string) => {
    store.lastCodeSeen = code;
    if (store.throwOnResolve) throw new Error("db offline");
    return store.resolved;
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
  it("returns discount + reseller identity for an active code", async () => {
    store.resolved = makeResolved();
    const { status, json } = await post({ code: "ifv20" });
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      code: "IFV20",
      discountPct: 20,
      resellerSlug: "INFOVISION",
      resellerDisplayName: "InfoVision",
    });
  });

  it("normalises punctuation and case before the lookup", async () => {
    store.resolved = makeResolved();
    const { json } = await post({ code: "if.v-20" });
    expect((json as { ok: boolean }).ok).toBe(true);
    // The route normalises before delegating, so the resolver never sees
    // the punctuated form.
    expect(store.lastCodeSeen).toBe("IFV20");
  });

  it("surfaces a 0% attribution-only code as a valid result", async () => {
    // Tier-0 codes carry no Stripe objects — they exist purely to attribute
    // the signup. They must still validate so the founder sees confirmation.
    store.resolved = makeResolved({
      code: "IFV",
      discountPct: 0,
      stripeCouponId: null,
      stripePromotionCodeId: null,
    });
    const { json } = await post({ code: "IFV" });
    expect(json).toEqual({
      ok: true,
      code: "IFV",
      discountPct: 0,
      resellerSlug: "INFOVISION",
      resellerDisplayName: "InfoVision",
    });
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

  it("400 invalid on a malformed JSON body", async () => {
    const { POST } = await import("./route");
    const req = new Request(
      "http://localhost/api/reseller/validate-promo-code",
      {
        method: "POST",
        body: "{not json",
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("invalid");
  });

  it("returns unknown for every resolver miss — the non-enumeration invariant", async () => {
    // The resolver collapses absent / inactive / capped / terminated-reseller
    // / pending-Stripe-id into a single null. The route must not distinguish
    // them, otherwise the response becomes a roster-enumeration oracle.
    store.resolved = null;
    for (const code of ["MISSING", "OLD", "CAPPED", "TERMINATED", "PENDING"]) {
      const { status, json } = await post({ code });
      expect(status).toBe(200);
      expect(json).toEqual({ ok: false, reason: "unknown" });
    }
  });

  it("returns unknown when the resolver throws (fail-closed)", async () => {
    store.throwOnResolve = true;
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

  it("does not consult the resolver when rate-limited", async () => {
    rateLimitAllowed = false;
    await post({ code: "IFV20" });
    expect(store.lastCodeSeen).toBeNull();
  });
});
