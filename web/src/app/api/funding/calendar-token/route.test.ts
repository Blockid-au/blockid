// Colocated vitest for GET /api/funding/calendar-token (T0245).
// Pins: 401 signed-out, 403 without money_radar, 503 when the mint fails,
// and the { token, url, webcal } shape with no-store caching.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "f@x.au", plan: "founder_starter" } as { id: string; email: string; plan: string | null } | null,
  allowed: true,
  token: "k".repeat(32) as string | null,
  canCalls: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/entitlements", () => ({
  can: async (user: unknown, feature: string) => {
    state.canCalls.push([user, feature]);
    return state.allowed;
  },
}));
vi.mock("@/lib/funding/calendar-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/funding/calendar-token")>("@/lib/funding/calendar-token");
  return { ...actual, getOrMintCalendarToken: async () => state.token };
});

import { GET, dynamic } from "./route";

describe("GET /api/funding/calendar-token", () => {
  beforeEach(() => {
    state.user = { id: "u1", email: "f@x.au", plan: "founder_starter" };
    state.allowed = true;
    state.token = "k".repeat(32);
    state.canCalls = [];
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  });

  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401 signed out", async () => {
    state.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("403 without money_radar (checked via can(user, 'money_radar'))", async () => {
    state.allowed = false;
    const r = await GET();
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("money_radar_required");
    expect(state.canCalls[0]).toEqual([{ id: "u1", plan: "founder_starter", segment: "founder" }, "money_radar"]);
  });

  it("503 when the mint fails", async () => {
    state.token = null;
    expect((await GET()).status).toBe(503);
  });

  it("returns token + https + webcal URLs, never cached", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(await r.json()).toEqual({
      ok: true,
      token: "k".repeat(32),
      url: `https://blockid.au/api/funding/calendar.ics?token=${"k".repeat(32)}`,
      webcal: `webcal://blockid.au/api/funding/calendar.ics?token=${"k".repeat(32)}`,
    });
  });
});
