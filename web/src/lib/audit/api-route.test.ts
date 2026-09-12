import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  apiRoute,
  auditNote,
  buildAuditRecord,
  flushAudits,
  isAuditedHandler,
  isStreamingResponse,
  setAuditSink,
  statusFromNextDigest,
  type AuditRecord,
} from "./api-route";
import { getAuditContext, newAuditContext, setAuditActor, setAuditProject } from "./context";

// S20-A — the apiRoute wrapper: one audit row per invocation, for 2xx, 4xx
// AND 5xx (and thrown errors, rethrown untouched); the sink can never throw
// into the handler; body never read; ids only.
// S20-A review P2-1/P2-2: the write is fire-and-forget (an SSE first byte and
// a rethrow are never held behind the insert — `flushAudits()` is the test
// seam), streaming responses carry `streamed: true`, and a thrown
// redirect()/notFound() is recorded with the status Next will send.

const ROUTE = "api/projects/[id]/members/route.ts";
const UID = "11111111-2222-4333-8444-555555555555";
const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function req(url = "https://blockid.au/api/projects/x/members?token=SECRET", init?: RequestInit) {
  return new Request(url, {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
      ...(init?.headers as Record<string, string> | undefined),
    },
    ...init,
  });
}

let records: AuditRecord[];

beforeEach(() => {
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  setAuditSink(null);
  vi.restoreAllMocks();
});

describe("apiRoute — records every outcome", () => {
  it("2xx: one row with method/route/family/status, actor from context, params ids only", async () => {
    const POST = apiRoute({ route: ROUTE, method: "POST" }, async (_r: Request, ctx: { params: Promise<{ id: string }> }) => {
      setAuditActor({ userId: UID, kind: "user", role: "user" });
      setAuditProject({ projectId: PID, role: "owner" });
      auditNote(null, { invited_count: 2, email: "leak@example.com" });
      await ctx.params;
      return NextResponse.json({ ok: true }, { status: 201 });
    });
    const res = await POST(req(), { params: Promise.resolve({ id: PID }) });
    expect(res.status).toBe(201);
    await flushAudits();
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.user_id).toBe(UID);
    expect(r.actor).toBe("user");
    expect(r.action).toBe("project.member.invited"); // manifest override wins
    expect(r.resource_type).toBe("project_member");
    expect(r.resource_id).toBe(PID);
    expect(r.detail.method).toBe("POST");
    expect(r.detail.route).toBe("/api/projects/:id/members");
    expect(r.detail.family).toBe("projects.members");
    expect(r.detail.status).toBe(201);
    expect(r.detail.project_id).toBe(PID);
    expect(r.detail.actor_role).toBe("owner");
    expect(r.detail.params).toEqual({ id: PID });
    expect(r.detail.ua_family).toBe("chrome");
    expect(r.detail.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    // note is redacted: email key dropped, numbers kept
    expect(r.detail.note).toEqual({ invited_count: 2 });
    // nothing from the query string / body is ever stored
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("203.0.113.9");
    expect(JSON.stringify(r)).not.toContain("leak@example.com");
  });

  it("4xx: recorded with status and anonymous actor when nobody authenticated", async () => {
    const DELETE = apiRoute({ route: "api/keys/[id]/route.ts", method: "DELETE" }, async () =>
      NextResponse.json({ ok: false }, { status: 401 }),
    );
    await DELETE(req("https://blockid.au/api/keys/abc", { method: "DELETE" }));
    await flushAudits();
    expect(records[0].detail.status).toBe(401);
    expect(records[0].user_id).toBeNull();
    expect(records[0].actor).toBe("anonymous");
    expect(records[0].action).toBe("api_key.revoked");
  });

  it("5xx: recorded with status 500", async () => {
    const PUT = apiRoute({ route: "api/svi/answers/route.ts", method: "PUT" }, async () =>
      NextResponse.json({ ok: false }, { status: 500 }),
    );
    await PUT(req());
    await flushAudits();
    expect(records[0].detail.status).toBe(500);
    expect(records[0].action).toBe("svi.answers.update");
    expect(records[0].resource_type).toBe("answer");
  });

  it("thrown error: recorded as 500 + threw, error rethrown untouched", async () => {
    const boom = new Error("boom");
    const PATCH = apiRoute({ route: "api/evidence/[id]/route.ts", method: "PATCH" }, async () => {
      throw boom;
    });
    await expect(PATCH(req())).rejects.toBe(boom);
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail.status).toBe(500);
    expect(records[0].detail.threw).toBe(true);
    expect(records[0].detail.streamed).toBeUndefined();
    expect(records[0].action).toBe("evidence.update");
  });

  it("handler returning nothing is recorded as 500 (Next will 500) and passed through", async () => {
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => undefined);
    const out = await POST(req());
    expect(out).toBeUndefined();
    await flushAudits();
    expect(records[0].detail.status).toBe(500);
  });

  it("explicit action/entity/redact overrides", async () => {
    const POST = apiRoute(
      {
        route: "api/svi/score/route.ts",
        method: "POST",
        action: "svi.rescore",
        entity: "svi_account",
        redact: (d) => ({ ...d, ua_family: "none" }),
      },
      async () => new Response("ok", { status: 200 }),
    );
    await POST(req());
    await flushAudits();
    expect(records[0].action).toBe("svi.rescore");
    expect(records[0].resource_type).toBe("svi_account");
    expect(records[0].detail.ua_family).toBe("none");
  });
});

describe("apiRoute — never throws into the handler", () => {
  it("sink rejection is swallowed and the response still returns", async () => {
    setAuditSink(async () => {
      throw new Error("db down");
    });
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => NextResponse.json({ ok: true }));
    const res = await POST(req());
    expect(res.status).toBe(200);
    await flushAudits();
  });

  it("sink that hangs is bounded by the write timeout", async () => {
    vi.useFakeTimers();
    setAuditSink(() => new Promise<void>(() => undefined));
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => NextResponse.json({ ok: true }));
    const p = POST(req());
    await vi.advanceTimersByTimeAsync(1600);
    const res = await p;
    expect(res.status).toBe(200);
    await flushAudits();
    vi.useRealTimers();
  });

  it("broken redact() keeps the row", async () => {
    const POST = apiRoute(
      {
        route: "api/x/route.ts",
        method: "POST",
        redact: () => {
          throw new Error("nope");
        },
      },
      async () => NextResponse.json({ ok: true }),
    );
    await POST(req());
    await flushAudits();
    expect(records).toHaveLength(1);
  });

  it("rejects a GET meta at wrap time (never at request time)", () => {
    expect(() =>
      apiRoute({ route: "api/x/route.ts", method: "GET" as unknown as "POST" }, async () => new Response()),
    ).toThrow(/not a mutation method/);
  });
});

describe("apiRoute — context isolation + shape preservation", () => {
  it("each invocation gets its own context (no actor bleed between requests)", async () => {
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async (r: Request) => {
      if (r.headers.get("x-who") === "a") setAuditActor({ userId: UID });
      return NextResponse.json({ ok: true });
    });
    await Promise.all([POST(req(undefined, { headers: { "x-who": "a" } })), POST(req(undefined, { headers: { "x-who": "b" } }))]);
    await flushAudits();
    const actors = records.map((r) => r.user_id).sort();
    expect(actors).toEqual([null, UID].sort());
    expect(getAuditContext()).toBeUndefined();
  });

  it("preserves the handler arity and marks the export as audited", async () => {
    const zero = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => new Response());
    const two = apiRoute({ route: "api/x/route.ts", method: "POST" }, async (_r: Request, _c: { params: Promise<{ id: string }> }) => new Response());
    expect(zero.length).toBe(0);
    expect(two.length).toBe(2);
    expect(isAuditedHandler(zero)).toBe(true);
    expect(isAuditedHandler(() => undefined)).toBe(false);
  });

  it("actor set by a later null lookup never erases an earlier user", () => {
    const ctx = newAuditContext();
    ctx.actorUserId = UID;
    ctx.actorKind = "api_key";
    const rec = buildAuditRecord({
      meta: { route: "api/x/route.ts", method: "POST" },
      ctx,
      headers: new Headers(),
      status: 200,
      params: null,
      durationMs: 3.6,
    });
    expect(rec.user_id).toBe(UID);
    expect(rec.actor).toBe("api_key");
    expect(rec.detail.ip_hash).toBeNull();
    expect(rec.detail.ua_family).toBe("none");
    expect(rec.detail.duration_ms).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// S20-A review P2-1 — non-blocking finalize + streaming rows
// ---------------------------------------------------------------------------

function slowSink(ms: number) {
  setAuditSink(
    (r) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          records.push(r);
          resolve();
        }, ms);
      }),
  );
}

function sseResponse(status = 200) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: open\n\n"));
      // The stream stays open — exactly what an SSE handler does.
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

describe("apiRoute — audit write never holds the response (P2-1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("SSE: headers are returned immediately even with a slow sink; row says status + streamed", async () => {
    vi.useFakeTimers();
    slowSink(1000);
    const POST = apiRoute({ route: "api/svi/dimensions/stream/route.ts", method: "POST" }, async () => sseResponse());
    // No timer advance before this await: a blocking finalize would hang here.
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(records).toHaveLength(0); // the write is still in flight
    await vi.advanceTimersByTimeAsync(1000);
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail.status).toBe(200);
    expect(records[0].detail.streamed).toBe(true);
    expect(records[0].detail.threw).toBeUndefined();
  });

  it("JSON: response returns before the write lands; no `streamed` flag", async () => {
    vi.useFakeTimers();
    slowSink(1000);
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => NextResponse.json({ ok: true }));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail.streamed).toBeUndefined();
  });

  it("throw path: the error is rethrown immediately, not after the write", async () => {
    vi.useFakeTimers();
    slowSink(1000);
    const boom = new Error("boom");
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => {
      throw boom;
    });
    await expect(POST(req())).rejects.toBe(boom);
    expect(records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail).toMatchObject({ status: 500, threw: true });
  });

  it("the write still lands when the handler is long gone (context captured synchronously)", async () => {
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => {
      setAuditActor({ userId: UID });
      auditNote(PID);
      return sseResponse(201);
    });
    await POST(req());
    await flushAudits();
    expect(records[0].user_id).toBe(UID);
    expect(records[0].resource_id).toBe(PID);
    expect(records[0].detail.status).toBe(201);
    expect(records[0].detail.streamed).toBe(true);
  });
});

describe("isStreamingResponse", () => {
  it("true for SSE / ndjson / chunked; false for JSON, text, no body", () => {
    expect(isStreamingResponse(sseResponse())).toBe(true);
    expect(isStreamingResponse(new Response("x", { headers: { "content-type": "application/x-ndjson" } }))).toBe(true);
    expect(isStreamingResponse(new Response("x", { headers: { "content-type": "text/event-stream; charset=utf-8" } }))).toBe(true);
    expect(isStreamingResponse(new Response("x", { headers: { "transfer-encoding": "chunked" } }))).toBe(true);
    expect(isStreamingResponse(NextResponse.json({ ok: true }))).toBe(false);
    expect(isStreamingResponse(new Response("ok"))).toBe(false);
    expect(isStreamingResponse(new Response(null, { status: 204 }))).toBe(false);
    expect(isStreamingResponse(undefined)).toBe(false);
    expect(isStreamingResponse({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S20-A review P2-2 — redirect()/notFound() thrown inside a handler
// ---------------------------------------------------------------------------

function nextError(digest: string): Error & { digest: string } {
  const e = new Error(digest) as Error & { digest: string };
  e.digest = digest;
  return e;
}

describe("statusFromNextDigest", () => {
  it("maps NEXT_REDIRECT to the digest's code (307 default), NEXT_HTTP_ERROR_FALLBACK and NEXT_NOT_FOUND", () => {
    expect(statusFromNextDigest(nextError("NEXT_REDIRECT;replace;/login;307;"))).toBe(307);
    expect(statusFromNextDigest(nextError("NEXT_REDIRECT;push;/x;308;"))).toBe(308);
    expect(statusFromNextDigest(nextError("NEXT_REDIRECT;replace;/a;b;c;308;"))).toBe(308); // url with ';'
    expect(statusFromNextDigest(nextError("NEXT_REDIRECT"))).toBe(307);
    expect(statusFromNextDigest(nextError("NEXT_HTTP_ERROR_FALLBACK;404"))).toBe(404);
    expect(statusFromNextDigest(nextError("NEXT_HTTP_ERROR_FALLBACK;403"))).toBe(403);
    expect(statusFromNextDigest(nextError("NEXT_HTTP_ERROR_FALLBACK;401"))).toBe(401);
    expect(statusFromNextDigest(nextError("NEXT_NOT_FOUND"))).toBe(404);
  });

  it("null for ordinary errors, non-errors and unrelated digests", () => {
    expect(statusFromNextDigest(new Error("boom"))).toBeNull();
    expect(statusFromNextDigest(nextError("1234567890"))).toBeNull(); // React error digest
    expect(statusFromNextDigest(null)).toBeNull();
    expect(statusFromNextDigest("NEXT_REDIRECT")).toBeNull();
    expect(statusFromNextDigest({ digest: 42 })).toBeNull();
  });
});

describe("apiRoute — thrown redirect()/notFound() (P2-2)", () => {
  it("redirect(): recorded as 307 without `threw`, error rethrown unchanged", async () => {
    const err = nextError("NEXT_REDIRECT;replace;/login;307;");
    const POST = apiRoute({ route: "api/auth/logout/route.ts", method: "POST" }, async () => {
      throw err;
    });
    await expect(POST(req())).rejects.toBe(err);
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail.status).toBe(307);
    expect(records[0].detail.threw).toBeUndefined();
  });

  it("permanentRedirect(): 308 from the digest", async () => {
    const err = nextError("NEXT_REDIRECT;replace;/new;308;");
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => {
      throw err;
    });
    await expect(POST(req())).rejects.toBe(err);
    await flushAudits();
    expect(records[0].detail.status).toBe(308);
    expect(records[0].detail.threw).toBeUndefined();
  });

  it("notFound(): recorded as 404 without `threw` (both digest generations)", async () => {
    for (const digest of ["NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_NOT_FOUND"]) {
      records = [];
      const err = nextError(digest);
      const DELETE = apiRoute({ route: "api/x/[id]/route.ts", method: "DELETE" }, async () => {
        throw err;
      });
      await expect(DELETE(req(undefined, { method: "DELETE" }))).rejects.toBe(err);
      await flushAudits();
      expect(records[0].detail.status).toBe(404);
      expect(records[0].detail.threw).toBeUndefined();
    }
  });

  it("an ordinary error with a digest is still 500 + threw", async () => {
    const err = nextError("3141592653");
    const POST = apiRoute({ route: "api/x/route.ts", method: "POST" }, async () => {
      throw err;
    });
    await expect(POST(req())).rejects.toBe(err);
    await flushAudits();
    expect(records[0].detail).toMatchObject({ status: 500, threw: true });
  });
});
