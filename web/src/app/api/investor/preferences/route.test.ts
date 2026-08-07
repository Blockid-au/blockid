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

const canMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  can: (user: unknown, feature: string) => canMock(user, feature),
}));

const getPrefsMock = vi.fn();
const setPrefsMock = vi.fn();
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
  };
});

import { GET, POST } from "./route";

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
