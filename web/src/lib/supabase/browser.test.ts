// Colocated vitest for `browser.ts` — the singleton Supabase browser
// client used by AuthSyncClient. Two silent-failure modes matter:
// (1) a stale cache serving a client for the wrong project after an
//     env swap (rare, but corrupts local dev), and
// (2) forgetting the "null when envs unset" fallback, which breaks the
//     marketing site's server-render preview during local dev.
//
// The module memoises via a module-level `cached` binding, so every test
// isolates via `vi.resetModules()` before re-importing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => createBrowserClientMock(...args),
}));

async function loadFresh() {
  vi.resetModules();
  return await import("./browser");
}

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  createBrowserClientMock.mockReset();
  createBrowserClientMock.mockImplementation(() => ({ __tag: "supabase-client" }));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
});

describe("getBrowserSupabase — envs unset", () => {
  it("returns null when both envs are unset", async () => {
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("returns null when only URL is set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("returns null when only anon KEY is set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("returns null when URL is the empty string (falsy guard)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("returns null when anon KEY is the empty string (falsy guard)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("returns null when both envs are empty strings", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });
});

describe("getBrowserSupabase — envs set", () => {
  it("returns a client when both envs are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    const client = getBrowserSupabase();
    expect(client).not.toBeNull();
    expect(client).toEqual({ __tag: "supabase-client" });
  });

  it("passes URL and anon KEY through to createBrowserClient in that order", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://alpha.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "alpha-anon-key";
    const { getBrowserSupabase } = await loadFresh();
    getBrowserSupabase();
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://alpha.supabase.co",
      "alpha-anon-key",
    );
  });

  it("does not pass extra positional arguments beyond URL and KEY", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://beta.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "beta-anon-key";
    const { getBrowserSupabase } = await loadFresh();
    getBrowserSupabase();
    const call = createBrowserClientMock.mock.calls[0];
    expect(call).toHaveLength(2);
  });
});

describe("getBrowserSupabase — memoisation", () => {
  it("returns the same client instance on repeat calls", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    const a = getBrowserSupabase();
    const b = getBrowserSupabase();
    expect(a).toBe(b);
  });

  it("calls createBrowserClient exactly once across many invocations", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    for (let i = 0; i < 10; i += 1) getBrowserSupabase();
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh instance if the counter increments per call (proves memoisation, not accidental identity)", async () => {
    // Guard against a rewrite that always returns a new client from the
    // factory itself: without memoisation, two calls would produce two
    // distinct objects even though the factory is stable.
    let n = 0;
    createBrowserClientMock.mockImplementation(() => ({ n: (n += 1) }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    const a = getBrowserSupabase() as { n: number };
    const b = getBrowserSupabase() as { n: number };
    expect(a.n).toBe(1);
    expect(b.n).toBe(1);
    expect(a).toBe(b);
  });

  it("caches the null verdict — a later env change in the same module load is ignored", async () => {
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBeNull();
    // Envs appear later in the same process — the memoised null wins.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://late.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "late-anon";
    expect(getBrowserSupabase()).toBeNull();
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("caches the client verdict — a later env unset in the same module load is ignored", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    const first = getBrowserSupabase();
    expect(first).not.toBeNull();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const second = getBrowserSupabase();
    expect(second).toBe(first);
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
  });

  it("resetting modules gives a fresh cache (env swap simulation)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://one.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key-one";
    const first = await loadFresh();
    first.getBrowserSupabase();
    // Simulate an env swap plus a module reload (as would happen in a
    // fresh dev-server compile cycle).
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://two.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key-two";
    const second = await loadFresh();
    second.getBrowserSupabase();
    expect(createBrowserClientMock).toHaveBeenCalledTimes(2);
    expect(createBrowserClientMock.mock.calls[0]).toEqual([
      "https://one.supabase.co",
      "key-one",
    ]);
    expect(createBrowserClientMock.mock.calls[1]).toEqual([
      "https://two.supabase.co",
      "key-two",
    ]);
  });

  it("resetting modules re-checks env presence (unset → set)", async () => {
    // First load: envs absent, null cached.
    const first = await loadFresh();
    expect(first.getBrowserSupabase()).toBeNull();
    // Envs appear before a reload.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const second = await loadFresh();
    expect(second.getBrowserSupabase()).not.toBeNull();
  });

  it("resetting modules re-checks env presence (set → unset)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const first = await loadFresh();
    expect(first.getBrowserSupabase()).not.toBeNull();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const second = await loadFresh();
    expect(second.getBrowserSupabase()).toBeNull();
  });
});

describe("getBrowserSupabase — factory contract", () => {
  it("propagates the exact object returned by createBrowserClient (no wrapping)", async () => {
    const stub = { auth: { fake: true }, from: () => null };
    createBrowserClientMock.mockReturnValue(stub);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).toBe(stub);
  });

  it("does not swallow a synchronous throw from createBrowserClient", async () => {
    createBrowserClientMock.mockImplementation(() => {
      throw new Error("ssr client init failed");
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    expect(() => getBrowserSupabase()).toThrow("ssr client init failed");
  });

  it("does NOT cache a throw — a retry after the factory recovers succeeds", async () => {
    // Establish current behaviour: the assignment `cached = createBrowserClient(...)`
    // never runs on throw, so `cached` stays `undefined` and the next call
    // re-enters the factory. This test pins that so a future rewrite that
    // wraps in try/catch and caches null would have to be deliberate.
    let attempts = 0;
    createBrowserClientMock.mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return { __tag: "recovered" };
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon.jwt.value";
    const { getBrowserSupabase } = await loadFresh();
    expect(() => getBrowserSupabase()).toThrow("transient");
    expect(getBrowserSupabase()).toEqual({ __tag: "recovered" });
    expect(createBrowserClientMock).toHaveBeenCalledTimes(2);
  });

  it("treats an env value of the literal string 'undefined' as truthy (does not special-case it)", async () => {
    // If a shell exports NEXT_PUBLIC_SUPABASE_URL="undefined" by accident,
    // the module trusts the string. Pinning this prevents a well-meaning
    // guard from adding a special-case that would diverge from
    // Next.js's own treatment of process.env values.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "undefined";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "undefined";
    const { getBrowserSupabase } = await loadFresh();
    expect(getBrowserSupabase()).not.toBeNull();
    expect(createBrowserClientMock).toHaveBeenCalledWith("undefined", "undefined");
  });
});

describe("module surface", () => {
  it("exports getBrowserSupabase as a function", async () => {
    const mod = await loadFresh();
    expect(typeof mod.getBrowserSupabase).toBe("function");
  });

  it("has arity 0 (no arguments — factory decides based on process.env only)", async () => {
    const mod = await loadFresh();
    expect(mod.getBrowserSupabase.length).toBe(0);
  });
});
