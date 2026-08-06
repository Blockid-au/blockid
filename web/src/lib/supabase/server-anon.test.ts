// Colocated vitest for the anon-key Supabase SSR client factories.
//
// `supabase/server-anon.ts` is the SSO-bridge module: unlike the
// service-role admin client, it produces a *user-scoped* Supabase client
// that carries session cookies via `@supabase/ssr`. Every RSC that reads
// `auth.getUser()`, every middleware that refreshes an expired JWT, and
// every server action that writes RLS-guarded rows depends on the pinned
// contracts below:
//
//   • isSupabaseAnonConfigured returns false when EITHER env var is
//     missing or empty — a stray `""` in one slot must not fool the
//     factories into constructing a client with `undefined` credentials
//   • getServerAnonClient / getMiddlewareClient return `null` (not
//     throw) when unconfigured, mirroring `getSupabaseAdmin` so tests
//     and local dev without secrets do not crash on import
//   • getServerAnonClient's cookies.getAll adapter yields `{name,value}`
//     pairs (no `options`) — that is the shape @supabase/ssr expects
//     for the read side
//   • getServerAnonClient's cookies.setAll adapter writes each cookie
//     into the RSC jar with the base options MERGED with any per-cookie
//     options passed by @supabase/ssr (the base ships `path:'/'`,
//     `sameSite:'lax'`, `httpOnly:true`, `secure:true` in prod +
//     `domain:'.blockid.au'` in prod)
//   • per-cookie `options` from @supabase/ssr override the base — this
//     is how the library sets a longer `maxAge` on the refresh cookie
//     than the access-token cookie
//   • setAll swallows synchronous throws — Next.js forbids mutating
//     cookies once the RSC tree has started streaming; middleware
//     performs the durable write, so a throw here must never bubble
//   • getMiddlewareClient's setAll mirrors each cookie onto
//     `request.cookies.set(name, value)` (so downstream reads in the
//     same middleware invocation see the fresh token) AND onto
//     `response.cookies.set({name, value, ...base, ...options})` (so
//     the browser stores them)
//   • the prod cookie domain is `.blockid.au` — apex so /dashboard,
//     /workspace, and marketing share one SSO session; a leading-dot
//     regression here would silently break cross-subdomain SSO
//   • `secure` follows NODE_ENV — false in dev (so localhost:3000
//     works), true in production
//
// Uses vi.mock for `next/headers` + `@supabase/ssr` so both branches
// can be exercised without a live request scope or Supabase server.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── mock state ────────────────────────────────────────────────────────

interface JarSetCall {
  arg: Record<string, unknown>;
}

interface FakeJar {
  entries: Array<{ name: string; value: string }>;
  setCalls: JarSetCall[];
  setShouldThrow: boolean;
}

const jarState: FakeJar = {
  entries: [],
  setCalls: [],
  setShouldThrow: false,
};

function resetJar() {
  jarState.entries = [];
  jarState.setCalls = [];
  jarState.setShouldThrow = false;
}

interface CreateServerClientCall {
  url: string;
  key: string;
  options: Record<string, unknown>;
}

interface FakeSsr {
  calls: CreateServerClientCall[];
  clientHandle: symbol;
}

const ssrState: FakeSsr = {
  calls: [],
  clientHandle: Symbol("supabase-client"),
};

function resetSsr() {
  ssrState.calls = [];
}

// ─── module mocks (must precede import under test) ────────────────────

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll() {
      return jarState.entries.map((e) => ({ name: e.name, value: e.value }));
    },
    set(arg: Record<string, unknown>) {
      if (jarState.setShouldThrow) throw new Error("cookies mutated after stream start");
      jarState.setCalls.push({ arg });
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, options: Record<string, unknown>) => {
    ssrState.calls.push({ url, key, options });
    return ssrState.clientHandle;
  },
}));

// Import after mocks hoist.
import {
  getMiddlewareClient,
  getServerAnonClient,
  isSupabaseAnonConfigured,
} from "./server-anon";

// ─── env helpers ──────────────────────────────────────────────────────

const ENV_URL = "NEXT_PUBLIC_SUPABASE_URL";
const ENV_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

beforeEach(() => {
  resetJar();
  resetSsr();
  vi.stubEnv(ENV_URL, "https://project.supabase.co");
  vi.stubEnv(ENV_KEY, "anon-key-xyz");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── isSupabaseAnonConfigured ─────────────────────────────────────────

describe("isSupabaseAnonConfigured", () => {
  it("returns true when both URL and key are set", () => {
    expect(isSupabaseAnonConfigured()).toBe(true);
  });

  it("returns false when only URL is set", () => {
    vi.stubEnv(ENV_KEY, "");
    expect(isSupabaseAnonConfigured()).toBe(false);
  });

  it("returns false when only key is set", () => {
    vi.stubEnv(ENV_URL, "");
    expect(isSupabaseAnonConfigured()).toBe(false);
  });

  it("returns false when both envs are empty strings", () => {
    vi.stubEnv(ENV_URL, "");
    vi.stubEnv(ENV_KEY, "");
    expect(isSupabaseAnonConfigured()).toBe(false);
  });

  it("returns false when URL is a whitespace-empty string (Boolean('') === false)", () => {
    vi.stubEnv(ENV_URL, "");
    expect(isSupabaseAnonConfigured()).toBe(false);
  });
});

// ─── getServerAnonClient — env-guard ──────────────────────────────────

describe("getServerAnonClient env-guard", () => {
  it("returns null when unconfigured (URL missing)", async () => {
    vi.stubEnv(ENV_URL, "");
    expect(await getServerAnonClient()).toBeNull();
    expect(ssrState.calls).toHaveLength(0);
  });

  it("returns null when unconfigured (key missing)", async () => {
    vi.stubEnv(ENV_KEY, "");
    expect(await getServerAnonClient()).toBeNull();
    expect(ssrState.calls).toHaveLength(0);
  });

  it("returns a client instance when configured", async () => {
    const client = await getServerAnonClient();
    expect(client).toBe(ssrState.clientHandle);
  });

  it("passes the anon URL and key straight through to createServerClient", async () => {
    vi.stubEnv(ENV_URL, "https://custom.supabase.co");
    vi.stubEnv(ENV_KEY, "custom-anon");
    await getServerAnonClient();
    expect(ssrState.calls).toHaveLength(1);
    expect(ssrState.calls[0].url).toBe("https://custom.supabase.co");
    expect(ssrState.calls[0].key).toBe("custom-anon");
  });
});

// ─── getServerAnonClient — cookies.getAll adapter ─────────────────────

describe("getServerAnonClient cookies.getAll", () => {
  it("returns an empty array when the RSC jar is empty", async () => {
    await getServerAnonClient();
    const cookieOpts = ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
    };
    expect(cookieOpts.getAll()).toEqual([]);
  });

  it("maps jar entries to {name,value} pairs (no options leaked)", async () => {
    jarState.entries = [
      { name: "sb-access-token", value: "eyJ.aaa" },
      { name: "sb-refresh-token", value: "eyJ.bbb" },
    ];
    await getServerAnonClient();
    const getAll = (ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
    }).getAll;
    expect(getAll()).toEqual([
      { name: "sb-access-token", value: "eyJ.aaa" },
      { name: "sb-refresh-token", value: "eyJ.bbb" },
    ]);
  });

  it("re-reads jar entries on every call (no stale snapshot)", async () => {
    await getServerAnonClient();
    const getAll = (ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
    }).getAll;
    expect(getAll()).toEqual([]);
    jarState.entries.push({ name: "sb", value: "v1" });
    expect(getAll()).toEqual([{ name: "sb", value: "v1" }]);
  });
});

// ─── getServerAnonClient — cookies.setAll adapter ─────────────────────

describe("getServerAnonClient cookies.setAll", () => {
  it("writes each cookie via jar.set with the base options merged in (non-prod: no domain)", async () => {
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([{ name: "sb", value: "v", options: {} }]);
    expect(jarState.setCalls).toHaveLength(1);
    const arg = jarState.setCalls[0].arg;
    expect(arg.name).toBe("sb");
    expect(arg.value).toBe("v");
    expect(arg.path).toBe("/");
    expect(arg.sameSite).toBe("lax");
    expect(arg.httpOnly).toBe(true);
    expect(arg.secure).toBe(false);
    expect(arg.domain).toBeUndefined();
  });

  it("sets secure:true and domain:'.blockid.au' in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([{ name: "sb", value: "v", options: {} }]);
    expect(jarState.setCalls).toHaveLength(1);
    const arg = jarState.setCalls[0].arg;
    expect(arg.secure).toBe(true);
    expect(arg.domain).toBe(".blockid.au");
  });

  it("does NOT set domain outside production (localhost dev must work)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([{ name: "sb", value: "v", options: {} }]);
    expect(jarState.setCalls[0].arg.domain).toBeUndefined();
    expect(jarState.setCalls[0].arg.secure).toBe(false);
  });

  it("merges per-cookie options AFTER base so the caller wins on conflicts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([
      {
        name: "sb-refresh",
        value: "v",
        options: { maxAge: 60 * 60 * 24 * 30, sameSite: "strict" },
      },
    ]);
    const arg = jarState.setCalls[0].arg;
    expect(arg.maxAge).toBe(60 * 60 * 24 * 30);
    expect(arg.sameSite).toBe("strict"); // caller override wins
    expect(arg.domain).toBe(".blockid.au"); // base preserved when not overridden
  });

  it("iterates over every cookie in the input array", async () => {
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([
      { name: "a", value: "1", options: {} },
      { name: "b", value: "2", options: {} },
      { name: "c", value: "3", options: {} },
    ]);
    expect(jarState.setCalls.map((c) => c.arg.name)).toEqual(["a", "b", "c"]);
    expect(jarState.setCalls.map((c) => c.arg.value)).toEqual(["1", "2", "3"]);
  });

  it("swallows a synchronous throw from jar.set (RSC boundary case)", async () => {
    jarState.setShouldThrow = true;
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    // Must NOT throw — middleware performs the durable write.
    expect(() => setAll([{ name: "sb", value: "v", options: {} }])).not.toThrow();
  });

  it("empty input array is a no-op", async () => {
    await getServerAnonClient();
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([]);
    expect(jarState.setCalls).toHaveLength(0);
  });
});

// ─── getMiddlewareClient — env-guard ──────────────────────────────────

interface FakeMiddlewareCookies {
  entries: Map<string, string>;
  setCalls: Array<{ name: string; value: string; arg?: Record<string, unknown> }>;
}

interface FakeReq {
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    set: (name: string, value: string) => void;
  };
  _state: FakeMiddlewareCookies;
}

interface FakeRes {
  cookies: {
    set: (arg: Record<string, unknown>) => void;
  };
  _state: FakeMiddlewareCookies;
}

function makeReq(seed: Array<{ name: string; value: string }> = []): FakeReq {
  const st: FakeMiddlewareCookies = {
    entries: new Map(seed.map((s) => [s.name, s.value])),
    setCalls: [],
  };
  return {
    _state: st,
    cookies: {
      getAll() {
        return Array.from(st.entries.entries()).map(([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        st.setCalls.push({ name, value });
        st.entries.set(name, value);
      },
    },
  };
}

function makeRes(): FakeRes {
  const st: FakeMiddlewareCookies = { entries: new Map(), setCalls: [] };
  return {
    _state: st,
    cookies: {
      set(arg: Record<string, unknown>) {
        st.setCalls.push({
          name: String(arg.name),
          value: String(arg.value),
          arg,
        });
      },
    },
  };
}

describe("getMiddlewareClient env-guard", () => {
  it("returns null when URL is missing", () => {
    vi.stubEnv(ENV_URL, "");
    expect(
      getMiddlewareClient(
        makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
        makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
      ),
    ).toBeNull();
    expect(ssrState.calls).toHaveLength(0);
  });

  it("returns null when key is missing", () => {
    vi.stubEnv(ENV_KEY, "");
    expect(
      getMiddlewareClient(
        makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
        makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
      ),
    ).toBeNull();
  });

  it("returns a client when configured", () => {
    const client = getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    expect(client).toBe(ssrState.clientHandle);
  });

  it("passes anon URL and key through to createServerClient", () => {
    vi.stubEnv(ENV_URL, "https://mw.supabase.co");
    vi.stubEnv(ENV_KEY, "mw-anon");
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    expect(ssrState.calls[0].url).toBe("https://mw.supabase.co");
    expect(ssrState.calls[0].key).toBe("mw-anon");
  });
});

// ─── getMiddlewareClient — cookies.getAll adapter ─────────────────────

describe("getMiddlewareClient cookies.getAll", () => {
  it("returns request cookies mapped to {name,value}", () => {
    const req = makeReq([
      { name: "sb-access-token", value: "eyJ.mw-a" },
      { name: "sb-refresh-token", value: "eyJ.mw-r" },
    ]);
    getMiddlewareClient(
      req as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const getAll = (ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
    }).getAll;
    expect(getAll()).toEqual([
      { name: "sb-access-token", value: "eyJ.mw-a" },
      { name: "sb-refresh-token", value: "eyJ.mw-r" },
    ]);
  });

  it("returns empty array when the request carries no cookies", () => {
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const getAll = (ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
    }).getAll;
    expect(getAll()).toEqual([]);
  });
});

// ─── getMiddlewareClient — cookies.setAll adapter ─────────────────────

describe("getMiddlewareClient cookies.setAll", () => {
  it("mirrors each cookie onto request.cookies.set(name, value) (no options)", () => {
    const req = makeReq();
    const res = makeRes();
    getMiddlewareClient(
      req as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([
      { name: "sb-access-token", value: "new.a", options: {} },
      { name: "sb-refresh-token", value: "new.r", options: {} },
    ]);
    expect(req._state.setCalls).toEqual([
      { name: "sb-access-token", value: "new.a" },
      { name: "sb-refresh-token", value: "new.r" },
    ]);
  });

  it("writes each cookie onto response.cookies.set with base options (non-prod)", () => {
    const res = makeRes();
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([{ name: "sb", value: "v", options: {} }]);
    expect(res._state.setCalls).toHaveLength(1);
    const arg = res._state.setCalls[0].arg!;
    expect(arg.name).toBe("sb");
    expect(arg.value).toBe("v");
    expect(arg.path).toBe("/");
    expect(arg.sameSite).toBe("lax");
    expect(arg.httpOnly).toBe(true);
    expect(arg.secure).toBe(false);
    expect(arg.domain).toBeUndefined();
  });

  it("attaches prod domain '.blockid.au' + secure:true on response cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = makeRes();
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([{ name: "sb", value: "v", options: {} }]);
    const arg = res._state.setCalls[0].arg!;
    expect(arg.domain).toBe(".blockid.au");
    expect(arg.secure).toBe(true);
  });

  it("per-cookie options override base on the response side too", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = makeRes();
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([
      { name: "sb-refresh", value: "v", options: { maxAge: 999, path: "/api" } },
    ]);
    const arg = res._state.setCalls[0].arg!;
    expect(arg.maxAge).toBe(999);
    expect(arg.path).toBe("/api"); // caller override wins
    expect(arg.domain).toBe(".blockid.au"); // base preserved
  });

  it("iterates over every cookie for both request AND response mirrors", () => {
    const req = makeReq();
    const res = makeRes();
    getMiddlewareClient(
      req as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([
      { name: "a", value: "1", options: {} },
      { name: "b", value: "2", options: {} },
      { name: "c", value: "3", options: {} },
    ]);
    expect(req._state.setCalls.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(res._state.setCalls.map((c) => c.name)).toEqual(["a", "b", "c"]);
  });

  it("empty setAll input is a no-op on both request and response", () => {
    const req = makeReq();
    const res = makeRes();
    getMiddlewareClient(
      req as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const setAll = (ssrState.calls[0].options.cookies as {
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    }).setAll;
    setAll([]);
    expect(req._state.setCalls).toHaveLength(0);
    expect(res._state.setCalls).toHaveLength(0);
  });

  it("mirroring a new cookie onto the request is observable via request.cookies.getAll", () => {
    const req = makeReq();
    const res = makeRes();
    getMiddlewareClient(
      req as unknown as Parameters<typeof getMiddlewareClient>[0],
      res as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const cookieAdapter = ssrState.calls[0].options.cookies as {
      getAll: () => Array<{ name: string; value: string }>;
      setAll: (
        input: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      ) => void;
    };
    cookieAdapter.setAll([{ name: "fresh", value: "z", options: {} }]);
    expect(cookieAdapter.getAll()).toEqual([{ name: "fresh", value: "z" }]);
  });
});

// ─── cross-cutting: cookie-adapter shape ──────────────────────────────

describe("cookies adapter shape", () => {
  it("getServerAnonClient supplies both getAll and setAll", async () => {
    await getServerAnonClient();
    const cookies = ssrState.calls[0].options.cookies as Record<string, unknown>;
    expect(typeof cookies.getAll).toBe("function");
    expect(typeof cookies.setAll).toBe("function");
  });

  it("getMiddlewareClient supplies both getAll and setAll", () => {
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    const cookies = ssrState.calls[0].options.cookies as Record<string, unknown>;
    expect(typeof cookies.getAll).toBe("function");
    expect(typeof cookies.setAll).toBe("function");
  });

  it("the two factories are independent — calling one does not construct via the other", async () => {
    await getServerAnonClient();
    expect(ssrState.calls).toHaveLength(1);
    getMiddlewareClient(
      makeReq() as unknown as Parameters<typeof getMiddlewareClient>[0],
      makeRes() as unknown as Parameters<typeof getMiddlewareClient>[1],
    );
    expect(ssrState.calls).toHaveLength(2);
  });
});
