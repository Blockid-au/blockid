import { describe, it, expect, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshSessionAndInjectHeaders,
  hashEmailPrefix,
  HEADER_USER_ID,
  HEADER_USER_EMAIL,
  HEADER_SESSION_FRESH,
  HEADER_SERVICE_BYPASS,
} from "./refresh-session";

// ── Test doubles ────────────────────────────────────────────────────
//
// NextRequest and NextResponse are heavy; refresh-session only touches
// the cookies/headers surface. We build the minimum shim the module
// needs, cast to the Next types, and don't drag `next/server` into
// vitest (which needs a Next runtime context to instantiate for real).

interface Cookie { name: string; value: string; }

function makeReq(cookies: Cookie[], headers: Record<string, string> = {}): NextRequest {
  const cookieMap = new Map(cookies.map((c) => [c.name, c.value]));
  const headerMap = new Map(Object.entries(headers));
  return {
    cookies: {
      get(name: string) {
        const v = cookieMap.get(name);
        return v === undefined ? undefined : { name, value: v };
      },
      getAll() {
        return Array.from(cookieMap, ([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        cookieMap.set(name, value);
      },
    },
    headers: {
      get(name: string) {
        return headerMap.get(name.toLowerCase()) ?? headerMap.get(name) ?? null;
      },
      set(name: string, value: string) {
        headerMap.set(name, value);
      },
    },
  } as unknown as NextRequest;
}

function makeRes(): NextResponse {
  const headerMap = new Map<string, string>();
  const cookieCalls: Cookie[] = [];
  const res = {
    headers: {
      get(name: string) { return headerMap.get(name) ?? null; },
      set(name: string, value: string) { headerMap.set(name, value); },
    },
    cookies: {
      set(entry: { name: string; value: string }) {
        cookieCalls.push({ name: entry.name, value: entry.value });
      },
    },
    _cookieCalls: cookieCalls,
  } as unknown as NextResponse;
  return res;
}

function stubClient(
  getUserImpl: () => Promise<{ data: { user: unknown } | null; error: unknown }>,
): SupabaseClient {
  return { auth: { getUser: getUserImpl } } as unknown as SupabaseClient;
}

// ── Cases ───────────────────────────────────────────────────────────

describe("refreshSessionAndInjectHeaders", () => {
  it("passes through with no header when no Supabase cookie is present", async () => {
    const req = makeReq([]);
    const res = makeRes();
    const factory = vi.fn();
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: factory,
      logger: () => {},
    });
    expect(result.outcome).toBe("no-cookie");
    expect(factory).not.toHaveBeenCalled();
    expect(req.headers.get(HEADER_USER_ID)).toBeNull();
  });

  it("injects headers when the session is valid", async () => {
    const req = makeReq([{ name: "sb-project-auth-token", value: "abc" }]);
    const res = makeRes();
    const client = stubClient(async () => ({
      data: { user: { id: "user-123", email: "Founder@Example.COM" } },
      error: null,
    }));
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: () => client,
      logger: () => {},
    });
    expect(result.outcome).toBe("header-injected");
    expect(result.userId).toBe("user-123");
    expect(req.headers.get(HEADER_USER_ID)).toBe("user-123");
    expect(res.headers.get(HEADER_USER_ID)).toBe("user-123");
    // Email lowercased before hashing.
    expect(req.headers.get(HEADER_USER_EMAIL))
      .toBe(hashEmailPrefix("founder@example.com"));
    expect(req.headers.get(HEADER_SESSION_FRESH)).toBe("1");
  });

  it("propagates cookie writes from the ssr client (simulated refresh)", async () => {
    // We simulate the refresh side-effect: a real @supabase/ssr client
    // calls setAll() during getUser() when the JWT was expired. Here,
    // the stub client writes onto the response cookies directly (as
    // the real setAll adapter would).
    const req = makeReq([{ name: "sb-project-auth-token", value: "expired" }]);
    const res = makeRes();
    const client = stubClient(async () => {
      // Simulate refresh writing a new cookie.
      (res.cookies as unknown as { set: (c: { name: string; value: string }) => void })
        .set({ name: "sb-project-auth-token", value: "refreshed" });
      return {
        data: { user: { id: "user-999", email: "x@y.com" } },
        error: null,
      };
    });
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: () => client,
      logger: () => {},
    });
    expect(result.outcome).toBe("header-injected");
    const calls = (res as unknown as { _cookieCalls: Cookie[] })._cookieCalls;
    expect(calls).toContainEqual({ name: "sb-project-auth-token", value: "refreshed" });
  });

  it("passes through with no header when getUser errors (unrefreshable / network)", async () => {
    const req = makeReq([{ name: "sb-x-auth-token", value: "stale" }]);
    const res = makeRes();
    const client = stubClient(async () => ({
      data: null,
      error: { message: "refresh_token_not_found" },
    }));
    const warnings: string[] = [];
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: () => client,
      logger: (m) => warnings.push(m),
    });
    expect(result.outcome).toBe("error");
    expect(req.headers.get(HEADER_USER_ID)).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("passes through with no header when getUser throws", async () => {
    const req = makeReq([{ name: "sb-x-auth-token", value: "stale" }]);
    const res = makeRes();
    const client = stubClient(async () => { throw new Error("network down"); });
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: () => client,
      logger: () => {},
    });
    expect(result.outcome).toBe("error");
    expect(req.headers.get(HEADER_USER_ID)).toBeNull();
  });

  it("bypasses entirely when the x-blockid-service header is set", async () => {
    const req = makeReq(
      [{ name: "sb-x-auth-token", value: "irrelevant" }],
      { [HEADER_SERVICE_BYPASS]: "1" },
    );
    const res = makeRes();
    const factory = vi.fn();
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: factory,
      logger: () => {},
    });
    expect(result.outcome).toBe("service-bypass");
    expect(factory).not.toHaveBeenCalled();
  });

  it("passes through when clientFactory returns null (envs unset)", async () => {
    const req = makeReq([{ name: "sb-x-auth-token", value: "present" }]);
    const res = makeRes();
    const result = await refreshSessionAndInjectHeaders(req, res, {
      clientFactory: () => null,
      logger: () => {},
    });
    expect(result.outcome).toBe("no-client");
    expect(req.headers.get(HEADER_USER_ID)).toBeNull();
  });
});
