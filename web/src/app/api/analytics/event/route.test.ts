// G16-A — POST /api/analytics/event (client → server funnel-event ingest).
// Pins the security contract the funnel numbers depend on:
//   - only CLIENT_EMITTABLE_EVENTS are accepted (sign_up / trust_report_purchased
//     from a browser → 400), anonymous callers only paywall_view / share_link_open
//     and only with a session id;
//   - user_id / qa / email / session_id in the body are stripped; the server sets
//     user_id from the cookie session and qa from the account e-mail;
//   - source is "client", the rate limiter runs per user (or per session/IP);
//   - PII-looking values are rejected by trackEvent (400, nothing emitted).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const emitEventMock = vi.fn(async () => {});
vi.mock("@/lib/analytics/server", () => ({ emitEvent: (i: unknown) => emitEventMock(i) }));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string | null } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({ readAnonKey: () => readAnonKeyMock() }));

const enforceRateLimitMock = vi.fn<(route: string, id: string | null | undefined, req: Request, max: number, win: number) => NextResponse | null>();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (route: string, id: string | null | undefined, req: Request, max: number, win: number) => enforceRateLimitMock(route, id, req, max, win),
}));

import { POST, RATE_MAX, RATE_WINDOW_MS, dynamic, runtime } from "./route";

function req(body: unknown, raw = false): Request {
  return new Request("http://x/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function emitted(): Promise<Record<string, unknown>> {
  await new Promise((r) => setTimeout(r, 0));
  return emitEventMock.mock.calls[emitEventMock.mock.calls.length - 1][0] as Record<string, unknown>;
}

beforeEach(() => {
  emitEventMock.mockClear();
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "u1", email: "jane@example.com" });
  readAnonKeyMock.mockReset().mockResolvedValue(null);
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/analytics/event — module invariants", () => {
  it("nodejs runtime, never prerendered, 60/min", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(RATE_MAX).toBe(60);
    expect(RATE_WINDOW_MS).toBe(60_000);
  });
});

describe("POST /api/analytics/event — signed-in caller", () => {
  it("accepts an allow-listed event, sets user_id from the session, source client, strips server-only keys", async () => {
    const res = await POST(
      req({
        name: "paywall_view",
        params: { surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300, project_id: "p1", user_id: "someone-else", qa: true, Email: "x" },
        consent_granted: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const e = await emitted();
    expect(e.name).toBe("paywall_view");
    expect(e.params).toEqual({ surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300, project_id: "p1" });
    expect(e.userId).toBe("u1");
    expect(e.source).toBe("client");
    expect(e.consentGranted).toBe(true);
    expect(enforceRateLimitMock).toHaveBeenCalledWith("analytics-event", "u1", expect.any(Request), 60, 60_000);
  });

  it("stamps qa:true from the account e-mail (never from the body)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-qa", email: "qa-live-20260919-0415@blockid.au" });
    await POST(req({ name: "checkout", params: { sku: "trust_report_5aud", amount_cents: 300, qa: false } }));
    const e = await emitted();
    expect(e.params).toEqual({ sku: "trust_report_5aud", amount_cents: 300, qa: true });
  });

  it("rejects a server-only event name with 400 and emits nothing", async () => {
    for (const name of ["sign_up", "trust_report_purchased", "svi_analyze", "nope"]) {
      const res = await POST(req({ name, params: {} }));
      expect(res.status, name).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "event_not_allowed" });
    }
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("400s on bad JSON / bad payload; 429 passes through from the limiter", async () => {
    expect((await POST(req("{bad", true))).status).toBe(400);
    expect((await POST(req({ params: {} }))).status).toBe(400);
    expect((await POST(req({ name: "", params: {} }))).status).toBe(400);
    enforceRateLimitMock.mockReturnValue(NextResponse.json({ ok: false }, { status: 429 }));
    expect((await POST(req({ name: "report_view", params: { tier: "free", project_id: "p" } }))).status).toBe(429);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("400s when a param value looks like PII (trackEvent's guard) and emits nothing", async () => {
    const res = await POST(req({ name: "report_view", params: { tier: "free", project_id: "founder@example.com" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/pii/);
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/analytics/event — anonymous caller", () => {
  beforeEach(() => getCurrentUserMock.mockResolvedValue(null));

  it("paywall_view with the blockid_anon cookie as session id is accepted (user_id null)", async () => {
    readAnonKeyMock.mockResolvedValue("anon-key-000000000000000");
    const res = await POST(req({ name: "paywall_view", params: { surface: "tbr_locked_chapter", sku: "trust_report_5aud", amount_cents: 300 } }));
    expect(res.status).toBe(200);
    const e = await emitted();
    expect(e.userId).toBeNull();
    expect(e.sessionId).toBe("anon-key-000000000000000");
    expect(e.params).toEqual({ surface: "tbr_locked_chapter", sku: "trust_report_5aud", amount_cents: 300 });
    expect(enforceRateLimitMock).toHaveBeenCalledWith("analytics-event", "anon-key-000000000000000", expect.any(Request), 60, 60_000);
  });

  it("body.session_id is accepted when there is no cookie; neither → 400 session_required", async () => {
    expect((await POST(req({ name: "share_link_open", params: { link_kind: "report", token_hash: "abc" }, session_id: "sess-12345678" }))).status).toBe(200);
    expect((await emitted()).sessionId).toBe("sess-12345678");
    const res = await POST(req({ name: "paywall_view", params: { surface: "x", sku: "s", amount_cents: 300 } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "session_required" });
  });

  it("a signed-in-only event from an anonymous browser → 401", async () => {
    readAnonKeyMock.mockResolvedValue("anon-key-000000000000000");
    for (const name of ["checkout", "report_view", "dashboard_view"]) {
      const res = await POST(req({ name, params: {} }));
      expect(res.status, name).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: "auth_required" });
    }
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("a throwing session lookup is treated as anonymous, not a 500", async () => {
    getCurrentUserMock.mockRejectedValueOnce(new Error("cookies() outside request scope"));
    readAnonKeyMock.mockResolvedValue("anon-key-000000000000000");
    const res = await POST(req({ name: "paywall_view", params: { surface: "x", sku: "s", amount_cents: 300 } }));
    expect(res.status).toBe(200);
    expect((await emitted()).userId).toBeNull();
  });
});
