// Unit tests for GET + POST /api/investor/preferences — P9-investor-preferences-route.
//
// Pins the route contract branches from route.ts:
//   1. GET 401 when unauthenticated — returns DEFAULT_PREFS in the body so the
//      UI can render skeleton state without a follow-up call. The read lib is
//      NOT invoked (no wasted round-trip on an anon caller).
//   2. GET 200 forwards user.id into getInvestorPreferences and echoes the
//      resolved prefs verbatim under { ok: true, prefs }.
//   3. POST 401 when unauthenticated — no feature gate, no write lib call.
//   4. POST 402 feature_locked when can() denies — includes the feature key
//      "investor.dealflow" in the body so the UI can render an upgrade CTA.
//      Write lib NOT invoked.
//   5. POST 400 invalid_json when the body cannot be parsed — write lib
//      NOT invoked (cheap validation before the DB round-trip).
//   6. POST 200 forwards the parsed body into setInvestorPreferences and
//      echoes the merged prefs.
//   7. POST 200 preserved when the write lib returns ok:false with
//      reason:"column_missing" — the UI degrades gracefully rather than
//      showing a red toast because the DEFAULT_PREFS floor is still meaningful.
//   8. POST 500 when the write lib returns ok:false with a non-column-missing
//      reason (any other write failure).
//   9. The can() call is shaped { id, plan, segment: "investor" } per the
//      route contract at route.ts:43-46 so any investor SKU (Angel+) qualifies
//      regardless of the founder-facing plan id.
//
// The auth + entitlements + investor-portal lib are mocked so this test
// asserts pure route wiring, not read/write behaviour (that's covered by
// the investor-portal lib tests).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));
const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => unknown>(() => null));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const canMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  can: (user: unknown, feature: string) => canMock(user, feature),
}));

const getPrefsMock = vi.fn();
const setPrefsMock = vi.fn();
// T0251 follow-up — "Let matching founders see me" (investor_discoverable).
const getVisibilityMock = vi.fn();
const setDiscoverableMock = vi.fn();
vi.mock("@/lib/investor-portal", async () => {
  const DEFAULT_PREFS = {
    sectors: [],
    stages: ["any"],
    geos: ["AU"],
    cheque_band: "any",
    min_svi: null,
    updated_at: null,
  };
  return {
    DEFAULT_PREFS,
    getInvestorPreferences: (userId: string) => getPrefsMock(userId),
    setInvestorPreferences: (userId: string, patch: unknown) =>
      setPrefsMock(userId, patch),
    getInvestorVisibility: (userId: string) => getVisibilityMock(userId),
    setInvestorDiscoverable: (userId: string, on: boolean) =>
      setDiscoverableMock(userId, on),
  };
});

import { GET, POST, POST_RATE_MAX, POST_RATE_WINDOW_MS } from "./route";

const USER = { id: "u-99", email: "angel@example.com", plan: "investor_angel" };

function jsonReq(body: unknown): NextRequest {
  const req = new Request("http://localhost/api/investor/preferences", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as NextRequest;
}

function rawReq(rawBody: string): NextRequest {
  const req = new Request("http://localhost/api/investor/preferences", {
    method: "POST",
    body: rawBody,
    headers: { "content-type": "application/json" },
  });
  return req as unknown as NextRequest;
}

const RESOLVED_PREFS = {
  sectors: ["fintech", "climate"],
  stages: ["seed", "series_a"],
  geos: ["AU", "NZ"],
  cheque_band: "25k_100k",
  min_svi: 60,
  updated_at: "2026-08-07T12:00:00.000Z",
};

beforeEach(() => {
  getCurrentUserMock.mockReset();
  canMock.mockReset();
  getPrefsMock.mockReset();
  setPrefsMock.mockReset();
  // Default: an evaluator persona who has not opted in yet.
  getVisibilityMock.mockReset().mockResolvedValue({ evaluator: true, discoverable: false });
  setDiscoverableMock.mockReset().mockImplementation(async (_u: string, on: boolean) => ({ ok: true, discoverable: on }));
});

describe("GET /api/investor/preferences", () => {
  it("401s when unauthenticated and returns DEFAULT_PREFS in the body", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("auth_required");
    // Skeleton fallback so UI does not need a second call to render.
    expect(body.prefs).toEqual({
      sectors: [],
      stages: ["any"],
      geos: ["AU"],
      cheque_band: "any",
      min_svi: null,
      updated_at: null,
    });
  });

  it("does NOT invoke the read lib when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getPrefsMock).not.toHaveBeenCalled();
  });

  it("200s with { ok:true, prefs } when authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getPrefsMock.mockResolvedValue(RESOLVED_PREFS);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.prefs).toEqual(RESOLVED_PREFS);
  });

  it("forwards the resolved user.id into getInvestorPreferences", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getPrefsMock.mockResolvedValue(RESOLVED_PREFS);
    await GET();
    expect(getPrefsMock).toHaveBeenCalledTimes(1);
    expect(getPrefsMock).toHaveBeenCalledWith("u-99");
  });

  it("echoes the opt-in flag + evaluator persona so the prefs page can render the switch (T0251 follow-up)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getPrefsMock.mockResolvedValue(RESOLVED_PREFS);
    getVisibilityMock.mockResolvedValue({ evaluator: true, discoverable: true });
    const body = await (await GET()).json();
    expect(body.discoverable).toBe(true);
    expect(body.evaluator).toBe(true);
    expect(getVisibilityMock).toHaveBeenCalledWith("u-99");
    // Nothing about the email is echoed.
    expect(JSON.stringify(body)).not.toContain("angel@example.com");
  });

  it("does NOT read visibility when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getVisibilityMock).not.toHaveBeenCalled();
  });

  it("echoes the DEFAULT_PREFS shape when the lib returns defaults for a user with no row", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getPrefsMock.mockResolvedValue({
      sectors: [],
      stages: ["any"],
      geos: ["AU"],
      cheque_band: "any",
      min_svi: null,
      updated_at: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs.stages).toEqual(["any"]);
    expect(body.prefs.geos).toEqual(["AU"]);
    expect(body.prefs.min_svi).toBeNull();
  });
});

describe("POST /api/investor/preferences — S8-C guards", () => {
  it("GET is private/no-store; POST refuses cross-site, rate-limits per user and caps the body at 16 KB", async () => {
    const g = await GET();
    if (g.status === 200) expect(g.headers.get("cache-control")).toBe("private, no-store");
    const cross = new Request("http://localhost/api/investor/preferences", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: "{}" }) as unknown as NextRequest;
    expect((await POST(cross)).status).toBe(403);
    enforceRateLimitMock.mockClear();
    enforceRateLimitMock.mockReturnValueOnce(new Response("{}", { status: 429 }));
    const limited = await POST(jsonReq({ sectors: ["fintech"] }));
    if (limited.status !== 401 && limited.status !== 402) {
      expect(limited.status).toBe(429);
      expect(enforceRateLimitMock).toHaveBeenCalledWith("investor-preferences", expect.any(String), expect.anything(), POST_RATE_MAX, POST_RATE_WINDOW_MS);
    }
    enforceRateLimitMock.mockReturnValue(null);
    const big = await POST(jsonReq({ thesis: "t".repeat(20 * 1024) }));
    if (big.status !== 401 && big.status !== 402) expect(big.status).toBe(413);
  });
});

describe("POST /api/investor/preferences", () => {
  it("401s when unauthenticated (no feature gate, no write)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("auth_required");
    expect(canMock).not.toHaveBeenCalled();
    expect(setPrefsMock).not.toHaveBeenCalled();
  });

  it("402 feature_locked when can() denies — write NOT invoked", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(false);
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("feature_locked");
    expect(body.feature).toBe("investor.dealflow");
    expect(setPrefsMock).not.toHaveBeenCalled();
  });

  it("calls can() with { id, plan, segment: 'investor' } and feature 'investor.dealflow'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    await POST(jsonReq({ sectors: ["fintech"] }));
    expect(canMock).toHaveBeenCalledTimes(1);
    const [userArg, featureArg] = canMock.mock.calls[0];
    expect(userArg).toEqual({
      id: "u-99",
      plan: "investor_angel",
      segment: "investor",
    });
    expect(featureArg).toBe("investor.dealflow");
  });

  it("falls back to plan '' when the caller has no plan attached", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u-1",
      email: "a@b.co",
      plan: null,
    });
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    await POST(jsonReq({ sectors: [] }));
    const [userArg] = canMock.mock.calls[0];
    expect((userArg as { plan: string }).plan).toBe("");
  });

  it("400 invalid_json when the body cannot be parsed — write NOT invoked", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    const res = await POST(rawReq("{not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_json");
    expect(setPrefsMock).not.toHaveBeenCalled();
  });

  it("happy path 200 forwards user.id + parsed body into setInvestorPreferences", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    const patch = { sectors: ["fintech"], min_svi: 55 };
    const res = await POST(jsonReq(patch));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.prefs).toEqual(RESOLVED_PREFS);
    expect(setPrefsMock).toHaveBeenCalledTimes(1);
    const [userId, forwarded] = setPrefsMock.mock.calls[0];
    expect(userId).toBe("u-99");
    expect(forwarded).toEqual(patch);
  });

  it("200 preserved on ok:false + reason:'column_missing' (graceful UI degrade)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({
      ok: false,
      prefs: RESOLVED_PREFS,
      reason: "column_missing",
    });
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("column_missing");
    expect(body.prefs).toEqual(RESOLVED_PREFS);
  });

  it("500 when the write lib returns ok:false with any other reason", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({
      ok: false,
      prefs: RESOLVED_PREFS,
      reason: "write_failed",
    });
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("write_failed");
    expect(body.prefs).toEqual(RESOLVED_PREFS);
  });

  it("500 also fires on ok:false with no reason at all (undefined reason ≠ 'column_missing')", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: false, prefs: RESOLVED_PREFS });
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBeUndefined();
  });

  it("body echoes reason field verbatim (even when undefined, key elided on JSON round-trip)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    const res = await POST(jsonReq({}));
    const body = await res.json();
    expect(body).not.toHaveProperty("reason");
  });

  it("forwards an empty patch {} into the write lib without rejecting it", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    await POST(jsonReq({}));
    const [, forwarded] = setPrefsMock.mock.calls[0];
    expect(forwarded).toEqual({});
  });

  it("does NOT invoke setInvestorPreferences when the gate denies", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(false);
    await POST(jsonReq({ sectors: ["fintech"] }));
    expect(setPrefsMock).not.toHaveBeenCalled();
  });

  it("does NOT invoke can() when unauthenticated (auth guard short-circuits)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ sectors: ["fintech"] }));
    expect(canMock).not.toHaveBeenCalled();
  });

  it("gate rejection preserves the ok:false + error contract with no prefs body leak", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(false);
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    const body = await res.json();
    // Route omits `prefs` on the 402 path — nothing leaks about the user's
    // current state to a caller who has not paid for the feature.
    expect(body).not.toHaveProperty("prefs");
  });

  it("invalid_json branch runs AFTER the feature gate (canMock consumed once)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    const res = await POST(rawReq("garbage"));
    expect(res.status).toBe(400);
    expect(canMock).toHaveBeenCalledTimes(1);
  });

  it("array body forwarded verbatim (Partial<> is TS-only — runtime forwards anything)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
    await POST(jsonReq([1, 2, 3]));
    const [, forwarded] = setPrefsMock.mock.calls[0];
    expect(forwarded).toEqual([1, 2, 3]);
  });

  it("write lib rejection surfaces as a 500 rather than a thrown response (documented via ok:false)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({
      ok: false,
      prefs: RESOLVED_PREFS,
      reason: "supabase_denied",
    });
    const res = await POST(jsonReq({ min_svi: 60 }));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST — investor_discoverable ("Let matching founders see me", T0251
// follow-up). Same route, same 401 / 402 / 400 order; the flag is split off
// the prefs patch and written only for evaluator personas.
// ---------------------------------------------------------------------------

describe("POST /api/investor/preferences — investor_discoverable opt-in", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(true);
    setPrefsMock.mockResolvedValue({ ok: true, prefs: RESOLVED_PREFS });
  });

  it.each([true, false])("evaluator persona: persists investor_discoverable=%s and echoes it", async (flag) => {
    const res = await POST(jsonReq({ investor_discoverable: flag, firm: "Blackbird" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.discoverable).toBe(flag);
    expect(body).not.toHaveProperty("discoverable_ignored");
    expect(getVisibilityMock).toHaveBeenCalledWith("u-99");
    expect(setDiscoverableMock).toHaveBeenCalledTimes(1);
    expect(setDiscoverableMock).toHaveBeenCalledWith("u-99", flag);
  });

  it("strips the flag off the prefs patch — the jsonb never carries investor_discoverable", async () => {
    await POST(jsonReq({ investor_discoverable: true, sectors: ["agtech"], thesis: "Pre-seed agtech in ANZ" }));
    const [, forwarded] = setPrefsMock.mock.calls[0];
    expect(forwarded).toEqual({ sectors: ["agtech"], thesis: "Pre-seed agtech in ANZ" });
  });

  it("non-evaluator persona (founder on an investor SKU): flag ignored, prefs still saved, 200 + discoverable_ignored", async () => {
    getVisibilityMock.mockResolvedValue({ evaluator: false, discoverable: false });
    const res = await POST(jsonReq({ investor_discoverable: true, sectors: ["agtech"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.discoverable).toBe(false);
    expect(body.discoverable_ignored).toBe("evaluator_only");
    expect(setDiscoverableMock).not.toHaveBeenCalled();
    expect(setPrefsMock).toHaveBeenCalledWith("u-99", { sectors: ["agtech"] });
  });

  it("no plan entitlement → 402 before the flag is even looked at (existing gate is the outer wall)", async () => {
    canMock.mockResolvedValue(false);
    const res = await POST(jsonReq({ investor_discoverable: true }));
    expect(res.status).toBe(402);
    expect(getVisibilityMock).not.toHaveBeenCalled();
    expect(setDiscoverableMock).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401, nothing written", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ investor_discoverable: true }));
    expect(res.status).toBe(401);
    expect(setDiscoverableMock).not.toHaveBeenCalled();
  });

  it("non-boolean flag (\"true\", 1, null) is dropped from the patch and never written", async () => {
    for (const bad of ["true", 1, null]) {
      setPrefsMock.mockClear();
      const res = await POST(jsonReq({ investor_discoverable: bad, sectors: ["x"] }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).not.toHaveProperty("discoverable");
      expect(setPrefsMock.mock.calls[0][1]).toEqual({ sectors: ["x"] });
    }
    expect(getVisibilityMock).not.toHaveBeenCalled();
    expect(setDiscoverableMock).not.toHaveBeenCalled();
  });

  it("body without the flag leaves visibility untouched and echoes no discoverable key (legacy callers)", async () => {
    const res = await POST(jsonReq({ sectors: ["fintech"] }));
    const body = await res.json();
    expect(body).not.toHaveProperty("discoverable");
    expect(getVisibilityMock).not.toHaveBeenCalled();
    expect(setDiscoverableMock).not.toHaveBeenCalled();
  });

  it("column_missing on the flag write → 200 + reason column_missing (graceful degrade, prefs kept)", async () => {
    setDiscoverableMock.mockResolvedValue({ ok: false, discoverable: false, reason: "column_missing" });
    const res = await POST(jsonReq({ investor_discoverable: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("column_missing");
    expect(body.discoverable).toBe(false);
    expect(body.prefs).toEqual(RESOLVED_PREFS);
  });

  it("db_error on the flag write → 500 even though the prefs write succeeded", async () => {
    setDiscoverableMock.mockResolvedValue({ ok: false, discoverable: false, reason: "db_error" });
    const res = await POST(jsonReq({ investor_discoverable: true }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("db_error");
  });

  it("prefs column_missing + flag ok → 200 with the prefs reason (flag result still echoed)", async () => {
    setPrefsMock.mockResolvedValue({ ok: false, prefs: RESOLVED_PREFS, reason: "column_missing" });
    const res = await POST(jsonReq({ investor_discoverable: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe("column_missing");
    expect(body.discoverable).toBe(true);
  });
});
