// Unit tests for POST /api/auth/logout — P9-auth-logout-route-test.
//
// Tiny handler with an oversized blast radius: it is the ONLY app-visible
// exit door for a founder's session (bell dropdown "Sign out", account menu,
// account-deletion flow, session-expiry recovery). Silent regressions here
// would either (a) leave the HttpOnly cookie set after "logout" — a
// session-fixation footgun on shared devices — or (b) redirect through an
// attacker-controlled host if the fallback base URL ever gets tainted.
//
// Route contract pinned:
//   1. calls destroySession() exactly once, before responding;
//   2. returns a Next.js redirect Response — 3xx status, Location header set
//      to the site root "/" resolved against NEXT_PUBLIC_SITE_URL when set,
//      falling back to https://blockid.au (hard-coded production host, NOT
//      an env-derived string an attacker could shadow via a header);
//   3. `dynamic = "force-dynamic"` so the redirect is never cached / SSG'd.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const destroySessionMock = vi.fn<() => Promise<void>>();
vi.mock("@/lib/auth", () => ({
  destroySession: () => destroySessionMock(),
}));

import { POST, dynamic } from "./route";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  destroySessionMock.mockReset();
  destroySessionMock.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  }
});

describe("POST /api/auth/logout — module surface", () => {
  it('exports dynamic = "force-dynamic" so the redirect is never cached / prerendered (a cached 302 would strand a signed-in user)', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports POST as an async function (guards against an accidental default export or GET rename)", () => {
    expect(typeof POST).toBe("function");
    expect(POST.constructor.name).toBe("AsyncFunction");
  });
});

describe("POST /api/auth/logout — session teardown", () => {
  it("calls destroySession() exactly once per request (idempotency is the caller's job, not ours)", async () => {
    await POST();
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
  });

  it("calls destroySession() with zero arguments (the helper reads the cookie itself; passing an id/token would silently be ignored and hide a bug)", async () => {
    await POST();
    expect(destroySessionMock).toHaveBeenCalledWith();
  });

  it("awaits destroySession() before returning — a synchronous return would race the response past the cookie clear + DB delete", async () => {
    let resolved = false;
    destroySessionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });
    const res = await POST();
    expect(resolved).toBe(true);
    expect(res.status).toBeGreaterThanOrEqual(300);
  });

  it("propagates a destroySession() rejection to the caller (route does NOT swallow the error into a false-positive 302 — a broken logout must be observable)", async () => {
    destroySessionMock.mockRejectedValue(new Error("supabase down"));
    await expect(POST()).rejects.toThrow("supabase down");
  });

  it("does NOT call destroySession() twice on a single request (guards against a copy-paste double-teardown)", async () => {
    await POST();
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/auth/logout — redirect response", () => {
  it("returns a 3xx redirect (NextResponse.redirect defaults to 307 for POST — anything <300 or ≥400 breaks the browser handoff)", async () => {
    const res = await POST();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });

  it("sets a Location header (the only signal the browser uses to navigate after logout)", async () => {
    const res = await POST();
    expect(res.headers.get("location")).toBeTruthy();
  });

  it("redirects to the site root ('/') — not /login, not /goodbye, not / with a trailing message (that would confuse the cache-buster + analytics)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au";
    const res = await POST();
    const loc = res.headers.get("location") ?? "";
    expect(new URL(loc).pathname).toBe("/");
  });

  it("uses NEXT_PUBLIC_SITE_URL as the base when set (staging/preview envs redirect back to themselves, not to production blockid.au)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au";
    const res = await POST();
    const loc = res.headers.get("location") ?? "";
    expect(new URL(loc).host).toBe("staging.blockid.au");
  });

  it("falls back to https://blockid.au when NEXT_PUBLIC_SITE_URL is UNSET (production host is hard-coded, not derived from a request header)", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const res = await POST();
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.host).toBe("blockid.au");
    expect(url.protocol).toBe("https:");
  });

  it("falls back to https://blockid.au when NEXT_PUBLIC_SITE_URL is empty string (`|| fallback` treats '' as falsy — important for envs that set the var to '')", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    const res = await POST();
    const loc = res.headers.get("location") ?? "";
    expect(new URL(loc).host).toBe("blockid.au");
  });

  it("preserves the http scheme when NEXT_PUBLIC_SITE_URL is http:// (localhost dev), does NOT force https on the redirect", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:4001";
    const res = await POST();
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.protocol).toBe("http:");
    expect(url.host).toBe("localhost:4001");
  });

  it("returns a Response instance (fetch-standard shape — NextResponse.redirect must not be replaced with a raw string or plain object)", async () => {
    const res = await POST();
    expect(res).toBeInstanceOf(Response);
  });
});

describe("POST /api/auth/logout — ordering & side-effect isolation", () => {
  it("clears the session BEFORE issuing the redirect — a browser that ignores the redirect body still sees a cleared cookie", async () => {
    const events: string[] = [];
    destroySessionMock.mockImplementation(async () => {
      events.push("destroy");
    });
    const res = await POST();
    // The response is constructed AFTER destroySession resolves (await),
    // so by the time we hold the Response, "destroy" is already logged.
    expect(events).toEqual(["destroy"]);
    expect(res.status).toBeGreaterThanOrEqual(300);
  });

  it("does NOT read the incoming request body (POST /logout must work with an empty body — a body-parser call here would 400 on the account menu button)", async () => {
    // POST() is called with zero args from the route contract; that alone
    // proves the route does not depend on a Request/NextRequest. This test
    // pins that signature so a future refactor to `POST(req)` gets caught.
    expect(POST.length).toBe(0);
  });

  it("multiple sequential calls each trigger their own destroySession() (no memoisation of the teardown across requests)", async () => {
    await POST();
    await POST();
    await POST();
    expect(destroySessionMock).toHaveBeenCalledTimes(3);
  });

  it("concurrent calls each trigger their own destroySession() (no shared in-flight promise — every logout must run the cookie clear)", async () => {
    await Promise.all([POST(), POST()]);
    expect(destroySessionMock).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/auth/logout — env sensitivity", () => {
  it("re-reads NEXT_PUBLIC_SITE_URL on every call (no module-load-time caching — swapping env between calls updates the redirect host)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://a.example";
    const r1 = await POST();
    expect(new URL(r1.headers.get("location")!).host).toBe("a.example");

    process.env.NEXT_PUBLIC_SITE_URL = "https://b.example";
    const r2 = await POST();
    expect(new URL(r2.headers.get("location")!).host).toBe("b.example");
  });

  it("throws (not silently falls back) when NEXT_PUBLIC_SITE_URL is a MALFORMED URL like 'not-a-url' — surfaces a misconfigured env early instead of redirecting to an attacker-controlled string", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    // new URL('/', 'not-a-url') throws TypeError. The route intentionally
    // does not catch this — a broken deploy config must fail loudly.
    await expect(POST()).rejects.toThrow();
  });
});
