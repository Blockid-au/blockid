// Colocated vitest for `session-hint.ts` — the cheap server-side cookie
// sniff that lets Server Components pick the "Continue to your Business
// ID" CTA before running a real Supabase getUser() call. A silent
// regression here can either (a) render "Create Your Business ID" to a
// signed-in founder (a jarring landing) or (b) render the signed-in CTA
// to an anonymous visitor (a click then a bounce to /login).
//
// Mocks `next/headers` with a per-test cookie store per the pattern in
// `lib/i18n.test.ts` — no jsdom / Next request scope needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CookieState {
  store: Map<string, string>;
}

const state: CookieState = {
  store: new Map(),
};

function resetState() {
  state.store = new Map();
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      const v = state.store.get(name);
      return v === undefined ? undefined : { name, value: v };
    },
    getAll() {
      return Array.from(state.store.entries()).map(([name, value]) => ({
        name,
        value,
      }));
    },
  }),
}));

import { readSignedInHint, SIGNED_IN_LANDING_HREF } from "./session-hint";

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("readSignedInHint — known cookie names (legacy)", () => {
  it("returns false on an empty cookie jar", async () => {
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("returns true when sb-access-token is set", async () => {
    state.store.set("sb-access-token", "jwt.header.payload.sig");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns true when sb:token is set (legacy name)", async () => {
    state.store.set("sb:token", "legacy-token");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns false when sb-access-token has an empty string value", async () => {
    // The `v.length > 0` guard rejects a wiped cookie that has not yet
    // been evicted from the jar by the browser.
    state.store.set("sb-access-token", "");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("returns false when sb:token has an empty string value", async () => {
    state.store.set("sb:token", "");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("returns true when both known cookies are present", async () => {
    state.store.set("sb-access-token", "j");
    state.store.set("sb:token", "k");
    await expect(readSignedInHint()).resolves.toBe(true);
  });
});

describe("readSignedInHint — Supabase SSR helper cookie regex", () => {
  it("returns true for sb-<project>-auth-token", async () => {
    state.store.set("sb-abc123-auth-token", "session-blob");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns true for the .0 chunk suffix (Supabase SSR chunked cookies)", async () => {
    // Supabase's SSR helper splits large session cookies into `.0`, `.1`
    // etc chunks — the regex explicitly matches `(\.\d+)?` so a chunked
    // cookie still fires the hint.
    state.store.set("sb-abc123-auth-token.0", "chunk-0");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns true for the .1 chunk suffix", async () => {
    state.store.set("sb-abc123-auth-token.1", "chunk-1");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns true when a chunked cookie is present with only the .N tail (no unchunked twin)", async () => {
    state.store.set("sb-project-xyz-auth-token.7", "tail-chunk");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("does NOT match sb-<something>-refresh-token (only auth-token is a signal)", async () => {
    // The SSR helper writes separate refresh + auth cookies; only the
    // auth-token counts as a signed-in signal. A wrapping match against
    // `-refresh-token` would over-count.
    state.store.set("sb-abc-refresh-token", "refresh");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("does NOT match a lookalike that lacks the sb- prefix", async () => {
    state.store.set("blockid-auth-token", "not-supabase");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("does NOT match a chunk suffix with non-numeric characters", async () => {
    // Regex is `(\.\d+)?` — `.abc` does not match, so the whole cookie
    // name fails the auth-token regex.
    state.store.set("sb-abc-auth-token.abc", "bad-chunk");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("returns false when a matching auth-token cookie has an empty value", async () => {
    // Zero-length values in the getAll() loop are guarded by
    // `c.value.length > 0`.
    state.store.set("sb-abc-auth-token", "");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("returns false when a matching chunk cookie has an empty value", async () => {
    state.store.set("sb-abc-auth-token.0", "");
    await expect(readSignedInHint()).resolves.toBe(false);
  });
});

describe("readSignedInHint — mixed cookie jars", () => {
  it("returns true when at least one matching cookie has a value alongside empty ones", async () => {
    state.store.set("sb-access-token", "");
    state.store.set("sb-abc-auth-token", "real-blob");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns true when both a known cookie and a regex cookie are set", async () => {
    state.store.set("sb-access-token", "x");
    state.store.set("sb-def-auth-token.0", "y");
    await expect(readSignedInHint()).resolves.toBe(true);
  });

  it("returns false when only unrelated cookies (blockid_lang, csrf, GA) are present", async () => {
    state.store.set("blockid_lang", "vi");
    state.store.set("csrf_token", "abc");
    state.store.set("_ga", "GA1.2.123.456");
    await expect(readSignedInHint()).resolves.toBe(false);
  });

  it("prefers the known-names short-circuit over the regex fallback", async () => {
    // Even if a bogus regex-matching cookie name is malformed, a valid
    // known cookie still returns true.
    state.store.set("sb-access-token", "known");
    state.store.set("sb-abc-auth-token.abc", "regex-miss");
    await expect(readSignedInHint()).resolves.toBe(true);
  });
});

describe("SIGNED_IN_LANDING_HREF", () => {
  it("is the canonical /dashboard route", async () => {
    expect(SIGNED_IN_LANDING_HREF).toBe("/dashboard");
  });

  it("is a bare pathname (no scheme / host) so it composes safely into next/link", async () => {
    expect(SIGNED_IN_LANDING_HREF.startsWith("/")).toBe(true);
    expect(SIGNED_IN_LANDING_HREF).not.toMatch(/^https?:/);
  });
});
