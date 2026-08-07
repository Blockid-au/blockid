// Unit tests for POST /api/analytics/ingest — P9-analytics-ingest-route-test.
//
// The route is the client SDK's single ingress into our analytics pipeline:
// it authenticates the caller (bearer token → resolveUserId), enforces a
// 100-events-per-minute-per-identity rate limit, validates the batched
// payload with zod, scrubs PII (both by key name and by value regex), and
// fans each surviving event out to `emitEvent()` before a final `flush()`.
// Because the client retries lost batches with the same event_id, `flush()`
// must run on every successful path so the emitter's idempotent sink can
// dedupe on the server side.
//
// Silent regressions this pins against:
//   - dropping the try/catch on request.json() and letting a text/plain
//     body crash the ingress with 500 (client SDK retries would storm);
//   - relaxing the zod .min(1) on the events array (empty batches would
//     silently be treated as successful "no-ops" and mask a broken client);
//   - relaxing the zod .max(50) and letting one caller flood the emitter;
//   - dropping the EMAIL_RE / PHONE_RE / CC_RE PII regexes and letting a
//     free-text `page_path` param leak a customer email into GA4;
//   - dropping the PII_KEYS set and letting a param literally called
//     `password` or `tfn` reach the emitter;
//   - swapping `k.toLowerCase()` for a case-sensitive compare — the JS
//     ecosystem sends `Email` / `EMAIL` freely and the guard would miss it;
//   - dropping the `enforceRateLimit` short-circuit (route would run the
//     PII scrub + emitEvent loop before returning the 429);
//   - passing the raw Authorization header (with "Bearer ") into
//     `admin.auth.getUser()` — the token slice is what makes it work;
//   - hardcoding `source: 'server'` on emitEvent (the ingest path MUST
//     mark events as `source: 'client'` so the funnel can distinguish
//     server-emitted checkout events from SDK-fired page_view events);
//   - dropping the `await flush()` and letting a client retry the same
//     batch — the emitter's `event_id` unique index only dedupes on rows
//     that actually reached the sink;
//   - swapping the `accepted / rejected / rejections[]` shape (the client
//     SDK reads `rejected > 0` to skip retrying poisoned events);
//   - dropping `export const runtime = "nodejs"` and letting the route
//     land on the Edge runtime (supabase-js and node:crypto both fail);
//   - dropping `export const dynamic = "force-dynamic"` and having Next.js
//     try to prerender the ingest ingress into the static shell.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const emitEventMock = vi.fn<(input: unknown) => Promise<void>>();
const flushMock = vi.fn<() => Promise<void>>();
vi.mock("@/lib/analytics/server", () => ({
  emitEvent: (input: unknown) => emitEventMock(input),
  flush: () => flushMock(),
}));

const enforceRateLimitMock = vi.fn<
  (
    route: string,
    identity: string | null | undefined,
    request: Request,
    max: number,
    windowMs: number,
  ) => unknown | null
>();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (
    route: string,
    identity: string | null | undefined,
    request: Request,
    max: number,
    windowMs: number,
  ) => enforceRateLimitMock(route, identity, request, max, windowMs),
}));

const getUserMock = vi.fn<
  (token: string) => Promise<{
    data: { user: { id: string } | null } | null;
    error: unknown;
  }>
>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST, dynamic, runtime } from "./route";

function makeReq(
  body: unknown,
  opts: { headers?: Record<string, string>; rawText?: string } = {},
): Request {
  return {
    headers: {
      get(k: string) {
        const h = opts.headers ?? {};
        return h[k.toLowerCase()] ?? h[k] ?? null;
      },
    },
    json: async () => {
      if (opts.rawText !== undefined) throw new SyntaxError("bad json");
      return body;
    },
  } as unknown as Request;
}

const VALID_EVENT = {
  name: "page_view",
  params: { page: "/home" },
  consent_granted: true,
};

const VALID_PAYLOAD = { events: [VALID_EVENT] };

beforeEach(() => {
  emitEventMock.mockReset();
  emitEventMock.mockResolvedValue(undefined);
  flushMock.mockReset();
  flushMock.mockResolvedValue(undefined);
  enforceRateLimitMock.mockReset();
  enforceRateLimitMock.mockReturnValue(null);
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({
    auth: { getUser: (t: string) => getUserMock(t) },
  });
});

// ── Route module-level exports ──────────────────────────────────────────

describe("module exports", () => {
  it('exports dynamic = "force-dynamic" so the ingest ingress is never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
  it('exports runtime = "nodejs" (edge cannot host supabase-js + node:crypto)', () => {
    expect(runtime).toBe("nodejs");
  });
});

// ── Rate limit short-circuit ────────────────────────────────────────────

describe("rate limit branch", () => {
  it("returns the enforceRateLimit response verbatim when it fires", async () => {
    const limitResp = NextResponse.json({ ok: false, error: "rl" }, { status: 429 });
    enforceRateLimitMock.mockReturnValue(limitResp);
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res).toBe(limitResp);
    expect(res.status).toBe(429);
  });

  it("does NOT parse the body when rate-limited (avoids wasted CPU on abusive clients)", async () => {
    enforceRateLimitMock.mockReturnValue(
      NextResponse.json({ ok: false }, { status: 429 }),
    );
    const jsonSpy = vi.fn().mockResolvedValue(VALID_PAYLOAD);
    const req = {
      headers: { get: () => null },
      json: jsonSpy,
    } as unknown as Request;
    await POST(req);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("does NOT call emitEvent or flush when rate-limited", async () => {
    enforceRateLimitMock.mockReturnValue(
      NextResponse.json({ ok: false }, { status: 429 }),
    );
    await POST(makeReq(VALID_PAYLOAD));
    expect(emitEventMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
  });

  it('calls enforceRateLimit with route="analytics-ingest", 100/60_000ms window', async () => {
    await POST(makeReq(VALID_PAYLOAD));
    expect(enforceRateLimitMock).toHaveBeenCalledTimes(1);
    const call = enforceRateLimitMock.mock.calls[0];
    expect(call[0]).toBe("analytics-ingest");
    expect(call[3]).toBe(100);
    expect(call[4]).toBe(60_000);
  });

  it("passes the resolved userId as identity when a bearer token is valid", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "founder-42" } },
      error: null,
    });
    await POST(makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer tok" } }));
    expect(enforceRateLimitMock.mock.calls[0][1]).toBe("founder-42");
  });

  it("passes null identity when no bearer token is supplied (enforce falls back to IP)", async () => {
    await POST(makeReq(VALID_PAYLOAD));
    expect(enforceRateLimitMock.mock.calls[0][1]).toBeNull();
  });
});

// ── Body parsing ────────────────────────────────────────────────────────

describe("invalid JSON branch", () => {
  it("returns 400 { ok:false, error:'invalid_json' } when the body is not JSON", async () => {
    const res = await POST(makeReq(undefined, { rawText: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "invalid_json" });
  });

  it("does NOT emit or flush when the body is unparseable", async () => {
    await POST(makeReq(undefined, { rawText: "garbage" }));
    expect(emitEventMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
  });
});

// ── Zod schema validation ───────────────────────────────────────────────

describe("zod payload validation", () => {
  it("returns 400 error='invalid_payload' with zod flatten() detail on schema failure", async () => {
    const res = await POST(makeReq({ events: "nope" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: false; error: string; detail: unknown };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_payload");
    expect(body.detail).toBeDefined();
  });

  it("rejects an empty events array (zod .min(1))", async () => {
    const res = await POST(makeReq({ events: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects an events array of > 50 items (zod .max(50))", async () => {
    const events = new Array(51).fill(VALID_EVENT);
    const res = await POST(makeReq({ events }));
    expect(res.status).toBe(400);
  });

  it("accepts exactly 50 events (boundary)", async () => {
    const events = new Array(50).fill(0).map((_, i) => ({
      ...VALID_EVENT,
      params: { i },
    }));
    const res = await POST(makeReq({ events }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(50);
  });

  it("rejects an event with an empty name (zod .min(1))", async () => {
    const res = await POST(makeReq({ events: [{ ...VALID_EVENT, name: "" }] }));
    expect(res.status).toBe(400);
  });

  it("rejects an event name > 64 chars (zod .max(64))", async () => {
    const res = await POST(
      makeReq({ events: [{ ...VALID_EVENT, name: "x".repeat(65) }] }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-UUID event_id (zod .uuid())", async () => {
    const res = await POST(
      makeReq({ events: [{ ...VALID_EVENT, event_id: "not-a-uuid" }] }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a session_id > 128 chars (zod .max(128))", async () => {
    const res = await POST(
      makeReq({ events: [{ ...VALID_EVENT, session_id: "s".repeat(129) }] }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-datetime ts value", async () => {
    const res = await POST(
      makeReq({ events: [{ ...VALID_EVENT, ts: "yesterday" }] }),
    );
    expect(res.status).toBe(400);
  });

  it("defaults params to {} when omitted (zod .default({}))", async () => {
    const res = await POST(
      makeReq({ events: [{ name: "click", consent_granted: false }] }),
    );
    expect(res.status).toBe(200);
    const call = emitEventMock.mock.calls[0][0] as { params: unknown };
    expect(call.params).toEqual({});
  });

  it("defaults consent_granted to false when omitted (zod .default(false))", async () => {
    const res = await POST(makeReq({ events: [{ name: "click", params: {} }] }));
    expect(res.status).toBe(200);
    const call = emitEventMock.mock.calls[0][0] as { consentGranted: boolean };
    expect(call.consentGranted).toBe(false);
  });
});

// ── PII scrubbing ───────────────────────────────────────────────────────

describe("PII scrubbing — by key", () => {
  it("rejects an event whose params include a key from PII_KEYS ('email')", async () => {
    const res = await POST(
      makeReq({
        events: [{ ...VALID_EVENT, params: { email: "safe-value" } }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(1);
    expect(body.rejections[0]).toEqual({
      name: "page_view",
      reason: "pii-key:email",
    });
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("rejects a PII key case-insensitively ('Password' → 'password')", async () => {
    const res = await POST(
      makeReq({
        events: [{ ...VALID_EVENT, params: { Password: "hunter2" } }],
      }),
    );
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toBe("pii-key:Password");
  });

  it("rejects 'tfn' (an AU-specific tax-file-number key that would leak to GA4)", async () => {
    const res = await POST(
      makeReq({ events: [{ ...VALID_EVENT, params: { tfn: "digits" } }] }),
    );
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toBe("pii-key:tfn");
  });

  it("rejects 'credit_card', 'cc', 'ssn', 'phone', 'phone_number', 'mobile' keys", async () => {
    for (const key of ["credit_card", "cc", "ssn", "phone", "phone_number", "mobile"]) {
      emitEventMock.mockClear();
      const res = await POST(
        makeReq({ events: [{ ...VALID_EVENT, params: { [key]: "x" } }] }),
      );
      const body = await res.json();
      expect(body.rejected, `key=${key}`).toBe(1);
      expect(body.rejections[0].reason).toBe(`pii-key:${key}`);
      expect(emitEventMock).not.toHaveBeenCalled();
    }
  });
});

describe("PII scrubbing — by value regex", () => {
  it("rejects a param VALUE that contains an email address (pii-email)", async () => {
    const res = await POST(
      makeReq({
        events: [
          {
            ...VALID_EVENT,
            params: { page_path: "/user/founder@example.com/profile" },
          },
        ],
      }),
    );
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toBe("pii-email:page_path");
  });

  it("rejects a param VALUE that matches an AU mobile number (pii-phone)", async () => {
    const res = await POST(
      makeReq({
        events: [
          { ...VALID_EVENT, params: { referrer: "call us at 0412 345 678" } },
        ],
      }),
    );
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toBe("pii-phone:referrer");
  });

  it("rejects a param VALUE that matches a credit-card-shaped number (pii-cc)", async () => {
    const res = await POST(
      makeReq({
        events: [
          { ...VALID_EVENT, params: { note: "4111 1111 1111 1111" } },
        ],
      }),
    );
    const body = await res.json();
    expect(body.rejected).toBe(1);
    expect(body.rejections[0].reason).toBe("pii-cc:note");
  });

  it("does NOT scrub non-string param values (numbers, booleans, arrays pass through)", async () => {
    const res = await POST(
      makeReq({
        events: [
          {
            ...VALID_EVENT,
            params: { count: 42, ok: true, tags: ["a", "b"] },
          },
        ],
      }),
    );
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(0);
  });
});

// ── Happy path + auth + flush ───────────────────────────────────────────

describe("happy path", () => {
  it("returns 200 { ok:true, accepted, rejected, rejections } on a clean batch", async () => {
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      accepted: 1,
      rejected: 0,
      rejections: [],
    });
  });

  it("calls emitEvent once per accepted event with source='client'", async () => {
    await POST(
      makeReq({
        events: [
          { name: "a", params: {}, consent_granted: false },
          { name: "b", params: {}, consent_granted: true },
        ],
      }),
    );
    expect(emitEventMock).toHaveBeenCalledTimes(2);
    const first = emitEventMock.mock.calls[0][0] as { source: string; name: string };
    expect(first.source).toBe("client");
    expect(first.name).toBe("a");
  });

  it("passes the resolved userId through to emitEvent", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "founder-99" } },
      error: null,
    });
    await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer tok" } }),
    );
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBe("founder-99");
  });

  it("passes userId=null to emitEvent when no bearer token is supplied", async () => {
    await POST(makeReq(VALID_PAYLOAD));
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBeNull();
  });

  it("passes sessionId=null to emitEvent when the event omits session_id", async () => {
    await POST(makeReq(VALID_PAYLOAD));
    const arg = emitEventMock.mock.calls[0][0] as { sessionId: string | null };
    expect(arg.sessionId).toBeNull();
  });

  it("forwards session_id and event_id verbatim when supplied", async () => {
    const eid = "11111111-2222-4333-8444-555555555555";
    await POST(
      makeReq({
        events: [{ ...VALID_EVENT, session_id: "sess-abc", event_id: eid }],
      }),
    );
    const arg = emitEventMock.mock.calls[0][0] as {
      sessionId: string | null;
      eventId: string;
    };
    expect(arg.sessionId).toBe("sess-abc");
    expect(arg.eventId).toBe(eid);
  });

  it("always calls flush() exactly once at the end of a successful path (idempotent retry contract)", async () => {
    await POST(makeReq(VALID_PAYLOAD));
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it("still calls flush() when EVERY event in the batch is rejected as PII (client can safely retry a clean batch)", async () => {
    const res = await POST(
      makeReq({
        events: [
          { ...VALID_EVENT, params: { email: "leak" } },
          { ...VALID_EVENT, params: { tfn: "leak" } },
        ],
      }),
    );
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(2);
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a mixed batch and reports counts separately", async () => {
    const res = await POST(
      makeReq({
        events: [
          VALID_EVENT,
          { ...VALID_EVENT, params: { email: "leak@x.com" } },
          { name: "click", params: { count: 1 }, consent_granted: false },
        ],
      }),
    );
    const body = await res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(1);
    expect(body.rejections).toHaveLength(1);
    expect(emitEventMock).toHaveBeenCalledTimes(2);
  });
});

// ── Bearer token resolution ─────────────────────────────────────────────

describe("resolveUserId — bearer token handling", () => {
  it("resolves null when getSupabaseAdmin() is null (dev/no-supabase mode)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer tok" } }),
    );
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBeNull();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("resolves null when there is no Authorization header at all", async () => {
    await POST(makeReq(VALID_PAYLOAD));
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("resolves null when the Authorization header is not 'Bearer …'", async () => {
    await POST(makeReq(VALID_PAYLOAD, { headers: { authorization: "Basic abc" } }));
    expect(getUserMock).not.toHaveBeenCalled();
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBeNull();
  });

  it("strips the 'Bearer ' prefix before calling admin.auth.getUser (raw prefix would fail auth)", async () => {
    await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer my-token-123" } }),
    );
    expect(getUserMock).toHaveBeenCalledWith("my-token-123");
  });

  it("accepts a case-insensitive scheme match ('bearer …' works, not just 'Bearer …')", async () => {
    await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "bearer my-token" } }),
    );
    expect(getUserMock).toHaveBeenCalledWith("my-token");
  });

  it("resolves null when admin.auth.getUser returns an error (invalid token)", async () => {
    getUserMock.mockResolvedValue({
      data: null,
      error: { message: "invalid_token" },
    });
    await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer bad" } }),
    );
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBeNull();
  });

  it("resolves null when admin.auth.getUser throws (network failure never crashes ingest)", async () => {
    getUserMock.mockRejectedValue(new Error("network down"));
    const res = await POST(
      makeReq(VALID_PAYLOAD, { headers: { authorization: "Bearer x" } }),
    );
    expect(res.status).toBe(200);
    const arg = emitEventMock.mock.calls[0][0] as { userId: string | null };
    expect(arg.userId).toBeNull();
  });
});
