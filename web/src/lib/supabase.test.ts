// Colocated vitest for the server-side `supabase.ts` admin-client module —
// the sibling of `supabase/browser.ts` for the SERVICE_ROLE_KEY path.
//
// Two silent-failure modes matter:
//   (1) forgetting the "null when envs unset" fallback, which breaks the
//       marketing site's server-render preview during local dev (the module
//       comment calls this out explicitly), and
//   (2) caching the null verdict, which would break the "retry once env is
//       available" contract the module comment pins.
//
// The module memoises via a module-level `cached` binding, so every test
// isolates via `vi.resetModules()` before re-importing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

async function loadFresh() {
  vi.resetModules();
  return await import("./supabase");
}

const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => ({ __tag: "supabase-admin-client" }));
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
});

describe("isSupabaseConfigured", () => {
  it("returns false when both envs are unset", async () => {
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when only URL is set", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when only SERVICE_ROLE_KEY is set", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when URL is the empty string (falsy Boolean guard)", async () => {
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when SERVICE_ROLE_KEY is the empty string (falsy Boolean guard)", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns false when both envs are empty strings", async () => {
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns true when both envs are set", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("returns a strict boolean (Boolean(...) wraps the &&-expression)", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { isSupabaseConfigured } = await loadFresh();
    const result = isSupabaseConfigured();
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  it("is a pure predicate — never invokes createClient", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { isSupabaseConfigured } = await loadFresh();
    isSupabaseConfigured();
    isSupabaseConfigured();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("treats the literal string 'undefined' as truthy (no special-case guard)", async () => {
    // Pinning current behaviour: if a shell exports SUPABASE_URL="undefined"
    // by accident, the module trusts the string. A well-meaning guard that
    // added a special case would diverge from Node's process.env semantics.
    process.env.SUPABASE_URL = "undefined";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "undefined";
    const { isSupabaseConfigured } = await loadFresh();
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("getSupabaseAdmin — envs unset", () => {
  it("returns null when both envs are unset", async () => {
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns null when only URL is set", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns null when only SERVICE_ROLE_KEY is set", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns null when URL is the empty string (falsy guard)", async () => {
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns null when SERVICE_ROLE_KEY is the empty string (falsy guard)", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("getSupabaseAdmin — envs set", () => {
  it("returns a client when both envs are set", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    const client = getSupabaseAdmin();
    expect(client).not.toBeNull();
    expect(client).toEqual({ __tag: "supabase-admin-client" });
  });

  it("passes URL and SERVICE_ROLE_KEY through to createClient in that order", async () => {
    process.env.SUPABASE_URL = "https://alpha.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "alpha-service-key";
    const { getSupabaseAdmin } = await loadFresh();
    getSupabaseAdmin();
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const call = createClientMock.mock.calls[0];
    expect(call[0]).toBe("https://alpha.supabase.co");
    expect(call[1]).toBe("alpha-service-key");
  });

  it("passes exactly three positional arguments (url, key, options)", async () => {
    process.env.SUPABASE_URL = "https://beta.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "beta-service-key";
    const { getSupabaseAdmin } = await loadFresh();
    getSupabaseAdmin();
    const call = createClientMock.mock.calls[0];
    expect(call).toHaveLength(3);
  });

  it("passes { auth: { persistSession: false, autoRefreshToken: false } } (RLS-bypass admin posture)", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    getSupabaseAdmin();
    const options = createClientMock.mock.calls[0][2] as {
      auth: { persistSession: boolean; autoRefreshToken: boolean };
    };
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  it("passes { db: { schema: 'public' } } to createClient", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    getSupabaseAdmin();
    const options = createClientMock.mock.calls[0][2] as { db: { schema: string } };
    expect(options.db.schema).toBe("public");
  });

  it("propagates the exact object returned by createClient (no wrapping)", async () => {
    const stub = { auth: { fake: true }, from: () => null };
    createClientMock.mockReturnValue(stub);
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBe(stub);
  });
});

describe("getSupabaseAdmin — memoisation", () => {
  it("returns the same client instance on repeat calls", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    const a = getSupabaseAdmin();
    const b = getSupabaseAdmin();
    expect(a).toBe(b);
  });

  it("calls createClient exactly once across many invocations", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    for (let i = 0; i < 10; i += 1) getSupabaseAdmin();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("returns a stable identity even when the factory would produce a fresh object each call", async () => {
    // Guard against a rewrite that forgets to memoise: without the cache,
    // two calls would produce two distinct objects even though the factory
    // is stable.
    let n = 0;
    createClientMock.mockImplementation(() => ({ n: (n += 1) }));
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    const a = getSupabaseAdmin() as unknown as { n: number };
    const b = getSupabaseAdmin() as unknown as { n: number };
    expect(a.n).toBe(1);
    expect(b.n).toBe(1);
    expect(a).toBe(b);
  });

  it("does NOT cache the null verdict — a later env appearance in the same module load succeeds", async () => {
    // Pinning the module comment: "don't cache null; allow retry once env
    // is available". This is the divergence from `supabase/browser.ts`,
    // which does cache null.
    const { getSupabaseAdmin } = await loadFresh();
    expect(getSupabaseAdmin()).toBeNull();
    process.env.SUPABASE_URL = "https://late.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "late-service-key";
    const client = getSupabaseAdmin();
    expect(client).not.toBeNull();
    expect(client).toEqual({ __tag: "supabase-admin-client" });
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("caches the client verdict — a later env unset in the same module load is ignored", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    const first = getSupabaseAdmin();
    expect(first).not.toBeNull();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const second = getSupabaseAdmin();
    expect(second).toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying the null path — 5 calls before envs appear = 0 createClient calls", async () => {
    const { getSupabaseAdmin } = await loadFresh();
    for (let i = 0; i < 5; i += 1) expect(getSupabaseAdmin()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("resetting modules gives a fresh cache (env swap simulation)", async () => {
    process.env.SUPABASE_URL = "https://one.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "key-one";
    const first = await loadFresh();
    first.getSupabaseAdmin();
    process.env.SUPABASE_URL = "https://two.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "key-two";
    const second = await loadFresh();
    second.getSupabaseAdmin();
    expect(createClientMock).toHaveBeenCalledTimes(2);
    expect(createClientMock.mock.calls[0][0]).toBe("https://one.supabase.co");
    expect(createClientMock.mock.calls[0][1]).toBe("key-one");
    expect(createClientMock.mock.calls[1][0]).toBe("https://two.supabase.co");
    expect(createClientMock.mock.calls[1][1]).toBe("key-two");
  });

  it("resetting modules re-checks env presence (unset → set)", async () => {
    const first = await loadFresh();
    expect(first.getSupabaseAdmin()).toBeNull();
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const second = await loadFresh();
    expect(second.getSupabaseAdmin()).not.toBeNull();
  });

  it("resetting modules re-checks env presence (set → unset)", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const first = await loadFresh();
    expect(first.getSupabaseAdmin()).not.toBeNull();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const second = await loadFresh();
    expect(second.getSupabaseAdmin()).toBeNull();
  });
});

describe("getSupabaseAdmin — createClient contract", () => {
  it("does not swallow a synchronous throw from createClient", async () => {
    createClientMock.mockImplementation(() => {
      throw new Error("admin client init failed");
    });
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    expect(() => getSupabaseAdmin()).toThrow("admin client init failed");
  });

  it("does NOT cache a throw — a retry after the factory recovers succeeds", async () => {
    // The assignment `cached = createClient(...)` never runs on throw, so
    // `cached` stays null and the next call re-enters the factory. Pinning
    // this so a future rewrite that wraps in try/catch and caches null
    // would have to be a deliberate change.
    let attempts = 0;
    createClientMock.mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return { __tag: "recovered" };
    });
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    const { getSupabaseAdmin } = await loadFresh();
    expect(() => getSupabaseAdmin()).toThrow("transient");
    expect(getSupabaseAdmin()).toEqual({ __tag: "recovered" });
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it("uses process.env values captured at call time (not module load time)", async () => {
    // The factory reads process.env inside getSupabaseAdmin(), not at import
    // time, so a caller can flip envs between module load and first call.
    const { getSupabaseAdmin } = await loadFresh();
    process.env.SUPABASE_URL = "https://after-import.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "after-import-key";
    const client = getSupabaseAdmin();
    expect(client).not.toBeNull();
    expect(createClientMock.mock.calls[0][0]).toBe("https://after-import.supabase.co");
    expect(createClientMock.mock.calls[0][1]).toBe("after-import-key");
  });
});

describe("module surface", () => {
  it("exports isSupabaseConfigured as a function", async () => {
    const mod = await loadFresh();
    expect(typeof mod.isSupabaseConfigured).toBe("function");
  });

  it("exports getSupabaseAdmin as a function", async () => {
    const mod = await loadFresh();
    expect(typeof mod.getSupabaseAdmin).toBe("function");
  });

  it("isSupabaseConfigured has arity 0", async () => {
    const mod = await loadFresh();
    expect(mod.isSupabaseConfigured.length).toBe(0);
  });

  it("getSupabaseAdmin has arity 0", async () => {
    const mod = await loadFresh();
    expect(mod.getSupabaseAdmin.length).toBe(0);
  });

  it("does not eagerly call createClient at import time", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service.role.jwt";
    await loadFresh();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
