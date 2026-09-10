// Unit tests for GET + PUT /api/dashboard/layout — G4 #4 server-synced
// dashboard layout. Pins the route contract:
//   1. GET 401 when signed out (store not touched); 200 { ok, layout } otherwise.
//   2. PUT 401 when signed out; 429 passthrough when the limiter says so.
//   3. PUT 413 when the raw body is over LAYOUT_MAX_BYTES — before JSON.parse.
//   4. PUT 400 invalid_json / invalid_layout (bad shape, missing stamp).
//   5. PUT normalises through the allow-list: unknown ids dropped, duplicates
//      collapsed, pinned removed from order, and only the clean layout is
//      written under the caller's own user id.
//   6. PUT 200 ok:false column_missing (migration 0326 not applied) — soft;
//      500 on any other write failure.
// auth, rate-limit and the store are mocked: this asserts route wiring only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { LAYOUT_MAX_BYTES } from "@/lib/dashboard/widget-layout";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const enforceRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

const getLayoutMock = vi.fn();
const setLayoutMock = vi.fn();
vi.mock("@/lib/dashboard/layout-store", () => ({
  getDashboardLayout: (userId: string) => getLayoutMock(userId),
  setDashboardLayout: (userId: string, layout: unknown) => setLayoutMock(userId, layout),
}));

import { GET, PUT, PUT_RATE_MAX, PUT_RATE_WINDOW_MS } from "./route";

const USER = { id: "u-42", email: "founder@example.com", plan: "founder_starter" };
const STAMP = "2026-09-01T00:00:00.000Z";

function putReq(body: unknown): NextRequest {
  const req = new Request("http://localhost/api/dashboard/layout", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as NextRequest;
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  getLayoutMock.mockReset();
  setLayoutMock.mockReset().mockResolvedValue({ ok: true });
});

describe("GET /api/dashboard/layout", () => {
  it("401 when signed out and never reads the store", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "auth_required", layout: null });
    expect(getLayoutMock).not.toHaveBeenCalled();
  });

  it("200 echoes the stored layout for the caller's own id, no-store", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const stored = { v: 1, order: ["metrics"], pinned: [], updated_at: STAMP };
    getLayoutMock.mockResolvedValue(stored);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, layout: stored });
    expect(getLayoutMock).toHaveBeenCalledWith("u-42");
  });

  it("200 with layout:null when the founder never customised", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getLayoutMock.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, layout: null });
  });
});

describe("PUT /api/dashboard/layout — auth + limits", () => {
  it("401 when signed out; limiter and store untouched", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PUT(putReq({ v: 1, order: [], pinned: [], updated_at: STAMP }));
    expect(res.status).toBe(401);
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(setLayoutMock).not.toHaveBeenCalled();
  });

  it("rate-limits per user id like sibling routes and returns the 429 as-is", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const limited = NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
    enforceRateLimitMock.mockReturnValue(limited);
    const res = await PUT(putReq({ v: 1, order: [], pinned: [], updated_at: STAMP }));
    expect(res.status).toBe(429);
    expect(enforceRateLimitMock).toHaveBeenCalledWith(
      "dashboard-layout",
      "u-42",
      expect.anything(),
      PUT_RATE_MAX,
      PUT_RATE_WINDOW_MS,
    );
    expect(setLayoutMock).not.toHaveBeenCalled();
  });

  it("413 when the raw body exceeds the 4 KB cap, before parsing", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const big = { v: 1, order: ["metrics"], pinned: [], updated_at: STAMP, pad: "x".repeat(LAYOUT_MAX_BYTES) };
    const res = await PUT(putReq(big));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ ok: false, error: "payload_too_large", max_bytes: LAYOUT_MAX_BYTES });
    expect(setLayoutMock).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, not characters", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    // ~1.1k chars of 4-byte emoji ≈ 4.4 KB
    const body = { v: 1, order: [], pinned: [], updated_at: STAMP, pad: "😀".repeat(1100) };
    const res = await PUT(putReq(body));
    expect(res.status).toBe(413);
  });
});

describe("PUT /api/dashboard/layout — validation", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER);
  });

  it("400 invalid_json", async () => {
    const res = await PUT(putReq("{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(setLayoutMock).not.toHaveBeenCalled();
  });

  it.each([
    ["array body", []],
    ["wrong version", { v: 2, order: [], pinned: [], updated_at: STAMP }],
    ["order not an array", { v: 1, order: "metrics", pinned: [], updated_at: STAMP }],
    ["missing stamp", { v: 1, order: [], pinned: [] }],
    ["unparseable stamp", { v: 1, order: [], pinned: [], updated_at: "soon" }],
    ["hidden not an array", { v: 1, order: [], pinned: [], hidden: {}, updated_at: STAMP }],
  ])("400 invalid_layout — %s", async (_label, body) => {
    const res = await PUT(putReq(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_layout" });
    expect(setLayoutMock).not.toHaveBeenCalled();
  });

  it("drops ids outside the allow-list and writes only the clean layout for the caller", async () => {
    const res = await PUT(
      putReq({
        v: 1,
        order: ["metrics", "evil-widget", "metrics", 3, "health-score"],
        pinned: ["health-score", "../../etc/passwd"],
        hidden: ["cohort-benchmark", "nope"],
        updated_at: STAMP,
        extra: "ignored",
      }),
    );
    expect(res.status).toBe(200);
    const clean = {
      v: 1,
      order: ["metrics"],
      pinned: ["health-score"],
      hidden: ["cohort-benchmark"],
      updated_at: STAMP,
    };
    expect(await res.json()).toEqual({ ok: true, layout: clean });
    expect(setLayoutMock).toHaveBeenCalledTimes(1);
    expect(setLayoutMock).toHaveBeenCalledWith("u-42", clean);
  });

  it("clamps a far-future stamp so one bad clock cannot lock the layout", async () => {
    const before = Date.now();
    const res = await PUT(putReq({ v: 1, order: [], pinned: [], updated_at: "2999-01-01T00:00:00.000Z" }));
    const json = (await res.json()) as { layout: { updated_at: string } };
    const stamp = Date.parse(json.layout.updated_at);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });
});

describe("PUT /api/dashboard/layout — store outcomes", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER);
  });

  it("column_missing (0326 not applied) is a soft 200 ok:false", async () => {
    setLayoutMock.mockResolvedValue({ ok: false, reason: "column_missing" });
    const res = await PUT(putReq({ v: 1, order: ["metrics"], pinned: [], updated_at: STAMP }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: "column_missing" });
  });

  it("db_error → 500", async () => {
    setLayoutMock.mockResolvedValue({ ok: false, reason: "db_error" });
    const res = await PUT(putReq({ v: 1, order: ["metrics"], pinned: [], updated_at: STAMP }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "db_error" });
  });
});
