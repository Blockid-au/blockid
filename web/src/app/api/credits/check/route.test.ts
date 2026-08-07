// Colocated vitest for POST /api/credits/check — P9-credits-check-route-test.
//
// This route is the *pre-flight* gate every credit-priced surface hits before
// asking the user to confirm a spend. It is the surface behind the
// "Transparent Pricing" memory rule: no feature may charge credits without
// first showing the user the exact cost + resulting balance. Silent drift here
// would either (a) let a caller bypass the affordability check by passing a
// misspelled feature name that is silently treated as free, or (b) leak the
// full FEATURE_COSTS registry to an unauthenticated caller who probes with a
// bogus feature key.
//
// The five branches:
//   1. no session → 401 "Authentication required" (never touches canAfford)
//   2. invalid JSON body → 400 "Invalid JSON body"
//   3. missing / wrong-typed feature → 400 "Feature name is required"
//   4. feature not in FEATURE_COSTS → 400 with the *catalogue* enumerated
//      (a support-visible signal, not a stack trace)
//   5. happy path → 200 with the canAfford() result spread into `{ok: true, ...}`
//
// The catalogue is mocked as a *stable, small* subset so the enumeration
// assertion in branch 4 does not have to be refreshed every time a new feature
// key lands in the production FEATURE_COSTS map.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

interface AffordResult {
  allowed: boolean;
  balance: number;
  cost: number;
  reason?: string;
}

// vi.mock factories are hoisted to the top of the file, so any variable they
// reference must be created via vi.hoisted (which runs alongside the hoist).
const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  canAffordMock: vi.fn<(userId: string, feature: string) => Promise<AffordResult>>(),
  // Stable test catalogue — small enough to enumerate in the "unknown feature"
  // branch assertion without churning as production adds new priced features.
  FEATURE_COSTS_FIXTURE: {
    svi_analysis: 25,
    dataroom_export: 10,
    free_ping: 0,
  } as Record<string, number>,
}));

const { getCurrentUserMock, canAffordMock, FEATURE_COSTS_FIXTURE } = mocks;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => mocks.canAffordMock(userId, feature),
  FEATURE_COSTS: mocks.FEATURE_COSTS_FIXTURE,
}));

// Route import MUST come after the mocks are registered.
import { POST, dynamic } from "./route";

// --- Helpers ---------------------------------------------------------------

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  const payload = opts?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/credits/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const USER: AppUser = { id: "user-abc", email: "u@example.com" };

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  canAffordMock.mockReset().mockResolvedValue({
    allowed: true,
    balance: 100,
    cost: 25,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Module invariants
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — module invariants", () => {
  it('exports dynamic = "force-dynamic" so pre-flight checks are never statically cached', () => {
    // A cached balance would tell every subsequent caller the same "allowed"
    // verdict — most dangerous right after a spend, where a stale ok:true would
    // let the client double-charge.
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — auth gate", () => {
  it("returns 401 when no user session — body never parsed, canAfford never called", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ feature: "svi_analysis" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("401 fires even when the body itself is malformed — auth is the outermost gate", async () => {
    // The auth check must run *before* JSON parsing so that anonymous probes
    // can never learn whether their body is malformed (info-leak surface).
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("Authentication required");
  });

  it("401 fires even when feature is missing — auth precedes shape validation", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("401 fires even when feature is unknown — auth precedes catalogue lookup so unauthenticated callers cannot enumerate FEATURE_COSTS", async () => {
    // Without this ordering, an anonymous prober could send `{feature:"x"}` and
    // receive the full priced-feature catalogue in the 400 response body.
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ feature: "totally_made_up" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(String(body.reason)).not.toContain("svi_analysis");
    expect(String(body.reason)).not.toContain("dataroom_export");
  });
});

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — body parsing", () => {
  it("returns 400 on invalid JSON — canAfford never called", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Invalid JSON body" });
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("accepts an empty JSON object body as *parseable* — falls through to feature-missing 400", async () => {
    // The distinction matters for observability: a "bad JSON" 400 and a
    // "missing feature" 400 tell ops different things.
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Feature name is required");
  });
});

// ---------------------------------------------------------------------------
// Feature-name validation
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — feature validation", () => {
  it("returns 400 when feature is missing entirely", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Feature name is required" });
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feature is the empty string (truthiness check trips)", async () => {
    // `!feature` catches "" — pin so a refactor to `feature === undefined`
    // doesn't accept "" and then hand it to canAfford().
    const res = await POST(req({ feature: "" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Feature name is required");
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feature is null", async () => {
    const res = await POST(req({ feature: null }));
    expect(res.status).toBe(400);
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feature is a number (typeof check trips)", async () => {
    const res = await POST(req({ feature: 42 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Feature name is required");
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feature is an object", async () => {
    const res = await POST(req({ feature: { name: "svi_analysis" } }));
    expect(res.status).toBe(400);
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body itself is JSON null (nullish-fallback protects the destructure)", async () => {
    // JSON.stringify(null) → "null" — the `(body as {...}) ?? {}` fallback is
    // what prevents a "Cannot read property 'feature' of null" 500 here.
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is a JSON array (destructure gives feature=undefined)", async () => {
    const res = await POST(req(["svi_analysis"]));
    expect(res.status).toBe(400);
    expect(canAffordMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unknown-feature branch
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — unknown feature", () => {
  it("returns 400 when feature is not in FEATURE_COSTS — canAfford never called", async () => {
    const res = await POST(req({ feature: "not_a_real_feature" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(canAffordMock).not.toHaveBeenCalled();
  });

  it("enumerates every valid feature name in the reason string — support signal, not a stack trace", async () => {
    // The catalogue enumeration is what lets a founder self-diagnose a typo
    // without opening a ticket. Pin every key in the fixture so a refactor to
    // e.g. `.slice(0, 5)` or a truncated list is caught.
    const res = await POST(req({ feature: "typo" }));
    const body = await json(res);
    const reason = String(body.reason);
    expect(reason).toContain('Unknown feature "typo"');
    for (const key of Object.keys(FEATURE_COSTS_FIXTURE)) {
      expect(reason).toContain(key);
    }
  });

  it("uses undefined-check (not falsiness) so a cost-0 feature is still recognised as valid", async () => {
    // The `FEATURE_COSTS[feature] === undefined` guard is the *only* thing
    // stopping `free_ping` (cost 0) from being reported as an unknown feature
    // via the JS truthiness trap where `!0` is true.
    const res = await POST(req({ feature: "free_ping" }));
    expect(res.status).toBe(200);
    expect(canAffordMock).toHaveBeenCalledWith(USER.id, "free_ping");
  });
});

// ---------------------------------------------------------------------------
// Happy path — canAfford result is spread verbatim
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — happy path", () => {
  it("returns 200 with ok:true and every canAfford field spread into the body", async () => {
    canAffordMock.mockResolvedValue({
      allowed: true,
      balance: 500,
      cost: 25,
    });
    const res = await POST(req({ feature: "svi_analysis" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      allowed: true,
      balance: 500,
      cost: 25,
    });
  });

  it("passes the authenticated user's id (not email) to canAfford", async () => {
    // canAfford keys its billing / balance lookups on user.id — passing the
    // email would silently miss the correct row and (worst case) charge a
    // sibling account.
    await POST(req({ feature: "svi_analysis" }));
    expect(canAffordMock).toHaveBeenCalledTimes(1);
    expect(canAffordMock).toHaveBeenCalledWith(USER.id, "svi_analysis");
  });

  it("passes the *exact* feature string through — no trim, no case-fold", async () => {
    // Feature keys are internal identifiers, not user-typed coupon codes. A
    // silent lowercase would let "SVI_ANALYSIS" through even though the
    // catalogue lookup above rejected it — dangerous divergence.
    await POST(req({ feature: "svi_analysis" }));
    expect(canAffordMock).toHaveBeenCalledWith(USER.id, "svi_analysis");
  });

  it("returns ok:false-shaped affordability result verbatim when canAfford denies", async () => {
    // The route does NOT collapse `allowed:false` into a 402 — the caller (a
    // client-side dialog) needs the balance + cost to render the "top-up N
    // credits to continue" CTA. Pin the shape.
    canAffordMock.mockResolvedValue({
      allowed: false,
      balance: 5,
      cost: 25,
      reason: "insufficient_credits",
    });
    const res = await POST(req({ feature: "svi_analysis" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      allowed: false,
      balance: 5,
      cost: 25,
      reason: "insufficient_credits",
    });
  });

  it("preserves canAfford's own reason string (e.g. unknown_feature) — spread order puts result last", async () => {
    // The `{ok: true, ...result}` spread means canAfford's `reason` overrides
    // any outer key of the same name. Pin so a refactor to `{...result, ok:true}`
    // does not swap the order and start clobbering downstream reasons.
    canAffordMock.mockResolvedValue({
      allowed: false,
      balance: 0,
      cost: 0,
      reason: "unknown_feature",
    });
    const res = await POST(req({ feature: "svi_analysis" }));
    const body = await json(res);
    expect(body.reason).toBe("unknown_feature");
    expect(body.ok).toBe(true);
  });

  it("returns 200 with cost:0 for a legitimately-free feature (allowed:true, balance:0)", async () => {
    canAffordMock.mockResolvedValue({ allowed: true, balance: 0, cost: 0 });
    const res = await POST(req({ feature: "free_ping" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true, allowed: true, balance: 0, cost: 0 });
  });
});

// ---------------------------------------------------------------------------
// Ordering / precedence — gates fire in the documented order
// ---------------------------------------------------------------------------

describe("POST /api/credits/check — gate precedence", () => {
  it("auth (401) > body parse (400)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(401);
  });

  it("body parse (400 bad-json) > feature validation (400 missing)", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Invalid JSON body");
  });

  it("feature-missing (400) > unknown-feature (400) — an empty string never reaches the catalogue check", async () => {
    const res = await POST(req({ feature: "" }));
    const body = await json(res);
    expect(body.reason).toBe("Feature name is required");
    expect(String(body.reason)).not.toContain("Unknown feature");
  });

  it("unknown-feature (400) > canAfford — the catalogue is the last gate before spending compute", async () => {
    const res = await POST(req({ feature: "bogus_key" }));
    expect(res.status).toBe(400);
    expect(canAffordMock).not.toHaveBeenCalled();
  });
});
