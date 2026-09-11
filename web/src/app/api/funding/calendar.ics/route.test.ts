// Colocated vitest for GET /api/funding/calendar.ics (T0245).
// Pins: token auth (401 malformed / unknown), the money_radar re-check on
// every fetch (403), and a text/calendar body with one VEVENT per dated
// match carrying 30/14/3-day VALARMs; ?download=1 sets the attachment header.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => unknown>(() => null));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const state = vi.hoisted(() => ({
  user: { id: "u1", email: "f@x.au", plan: "founder_starter" } as { id: string; email: string | null; plan: string | null } | null,
  flags: ["grant_finder", "money_radar"] as string[],
  rows: [] as unknown[],
}));

vi.mock("@/lib/funding/calendar-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/funding/calendar-token")>("@/lib/funding/calendar-token");
  return {
    ...actual,
    userForCalendarToken: async (t: string) => (actual.isCalendarTokenShape(t) ? state.user : null),
    loadFundingCalendarRows: async () => state.rows,
  };
});
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async () => state.flags }));

import { GET, ICS_RATE_MAX, ICS_RATE_WINDOW_MS, dynamic } from "./route";

const TOKEN = "t".repeat(32);
/** 30 days out — inside the 12-month horizon whatever "now" is. */
const SOON = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const url = (q = `token=${TOKEN}`) => `http://x/api/funding/calendar.ics?${q}`;

describe("GET /api/funding/calendar.ics", () => {
  beforeEach(() => {
    state.user = { id: "u1", email: "f@x.au", plan: "founder_starter" };
    state.flags = ["grant_finder", "money_radar"];
    state.rows = [
      { ref_kind: "grant", ref_id: "mvp", closes_at: SOON, score: 80, status_at_match: "open", name: "MVP Ventures", official_url: "https://mvp" },
      { ref_kind: "program", ref_id: "sm", closes_at: null, score: 70, status_at_match: "open", name: "Rolling", official_url: null },
    ];
  });

  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("S8-C: rate-limits token guesses per IP before any lookup", async () => {
    enforceRateLimitMock.mockClear();
    enforceRateLimitMock.mockReturnValueOnce(new Response(JSON.stringify({ ok: false }), { status: 429 }));
    const limited = await GET(new Request(url("token=" + "z".repeat(32))));
    expect(limited.status).toBe(429);
    expect(enforceRateLimitMock).toHaveBeenCalledWith("funding-calendar-ics", null, expect.any(Request), ICS_RATE_MAX, ICS_RATE_WINDOW_MS);
    enforceRateLimitMock.mockReturnValue(null);
  });

  it("401 when the token is missing, malformed or unknown", async () => {
    expect((await GET(new Request(url("")))).status).toBe(401);
    expect((await GET(new Request(url("token=short")))).status).toBe(401);
    state.user = null;
    expect((await GET(new Request(url()))).status).toBe(401);
  });

  it("403 when the user no longer has money_radar", async () => {
    state.flags = ["grant_finder"];
    const r = await GET(new Request(url()));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("money_radar_required");
  });

  it("returns text/calendar with one VEVENT per dated match and 30/14/3 alarms", async () => {
    const r = await GET(new Request(url()));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/calendar");
    expect(r.headers.get("content-disposition")).toBeNull();
    const body = await r.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("PRODID:-//BlockID.au//Money Radar//EN");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(body).toContain("SUMMARY:Grant closes: MVP Ventures");
    expect(body).toContain("TRIGGER:-P30D");
    expect(body).toContain("TRIGGER:-P14D");
    expect(body).toContain("TRIGGER:-P3D");
  });

  it("?download=1 sets the attachment header", async () => {
    const r = await GET(new Request(url(`token=${TOKEN}&download=1`)));
    expect(r.headers.get("content-disposition")).toContain('filename="money-radar.ics"');
  });
});
