// Colocated vitest for the anonymous owner key.
//
// This cookie is the only handle a logged-out founder has on their own saved
// analysis, and it is also the thing an attacker would forge to read someone
// else's. Two invariants:
//
//   * `isValidAnonKey` is the gate. Loosening it (accepting a 1-char key, or
//     any string at all) would let a hand-set `blockid_anon=a` cookie be
//     brute-forced against the anon_key column.
//   * `ensureAnonKey` must never throw. It runs inside /api/intake's
//     best-effort persist path, where a throw would cost the founder the
//     analysis they are already looking at.
//
// Also pinned: httpOnly (page scripts and third-party tags must not read it),
// SameSite=Lax, and the 365-day life that makes "come back later" work.

import { beforeEach, describe, expect, it, vi } from "vitest";

interface CookieSet {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
  secure?: boolean;
}

const store: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
let cookiesThrows = false;

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookiesThrows) throw new Error("called outside a request scope");
    return store;
  },
}));

import {
  ANON_COOKIE,
  ANON_COOKIE_MAX_AGE_DAYS,
  clearAnonCookie,
  ensureAnonKey,
  isValidAnonKey,
  newAnonKey,
  readAnonKey,
} from "./anon-key";

beforeEach(() => {
  store.get.mockReset().mockReturnValue(undefined);
  store.set.mockReset();
  store.delete.mockReset();
  cookiesThrows = false;
});

describe("newAnonKey / isValidAnonKey", () => {
  it("mints a 24-char url-safe key", () => {
    const k = newAnonKey();
    expect(k).toHaveLength(24);
    expect(isValidAnonKey(k)).toBe(true);
  });

  it("mints a distinct key every time", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newAnonKey()));
    expect(keys.size).toBe(50);
  });

  it("rejects anything too short to be unguessable", () => {
    expect(isValidAnonKey("a")).toBe(false);
    expect(isValidAnonKey("x".repeat(15))).toBe(false);
    expect(isValidAnonKey("x".repeat(16))).toBe(true);
  });

  it("rejects an over-long key so the column cannot be stuffed", () => {
    expect(isValidAnonKey("x".repeat(65))).toBe(false);
  });

  it("rejects non-strings and injection-shaped values", () => {
    for (const v of [undefined, null, 42, {}, "abc def ghi jklmno", "' or 1=1 --xxxx"]) {
      expect(isValidAnonKey(v)).toBe(false);
    }
  });
});

describe("readAnonKey", () => {
  it("returns the key already on the request", () => {
    store.get.mockReturnValue({ value: "k".repeat(24) });
    return expect(readAnonKey()).resolves.toBe("k".repeat(24));
  });

  it("reads the blockid_anon cookie by name", async () => {
    store.get.mockReturnValue({ value: "k".repeat(24) });
    await readAnonKey();
    expect(store.get).toHaveBeenCalledWith(ANON_COOKIE);
  });

  it("treats a malformed cookie as absent rather than trusting it", async () => {
    store.get.mockReturnValue({ value: "short" });
    await expect(readAnonKey()).resolves.toBeNull();
  });

  it("returns null instead of throwing when there is no cookie store", async () => {
    cookiesThrows = true;
    await expect(readAnonKey()).resolves.toBeNull();
  });
});

describe("ensureAnonKey", () => {
  it("reuses an existing valid key and does NOT re-set the cookie", async () => {
    store.get.mockReturnValue({ value: "k".repeat(24) });
    const out = await ensureAnonKey();
    expect(out).toEqual({ key: "k".repeat(24), issued: false });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("mints and sets an httpOnly, lax, long-lived cookie when absent", async () => {
    const out = await ensureAnonKey();
    expect(out.issued).toBe(true);
    const arg = store.set.mock.calls[0][0] as CookieSet;
    expect(arg.name).toBe(ANON_COOKIE);
    expect(arg.value).toBe(out.key);
    expect(arg.httpOnly).toBe(true);
    expect(arg.sameSite).toBe("lax");
    expect(arg.path).toBe("/");
    expect(arg.maxAge).toBe(ANON_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60);
  });

  it("keeps the cookie for a year — the whole point is coming back later", () => {
    expect(ANON_COOKIE_MAX_AGE_DAYS).toBe(365);
  });

  it("replaces a malformed cookie rather than writing rows against it", async () => {
    store.get.mockReturnValue({ value: "nope" });
    const out = await ensureAnonKey();
    expect(out.issued).toBe(true);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it("still returns a usable key when the cookie store is unavailable", async () => {
    cookiesThrows = true;
    const out = await ensureAnonKey();
    expect(isValidAnonKey(out.key)).toBe(true);
    expect(out.issued).toBe(true);
  });
});

describe("clearAnonCookie", () => {
  it("deletes the cookie after a claim", async () => {
    await clearAnonCookie();
    expect(store.delete).toHaveBeenCalledWith(ANON_COOKIE);
  });

  it("swallows a missing cookie store — a claim must not fail on this", async () => {
    cookiesThrows = true;
    await expect(clearAnonCookie()).resolves.toBeUndefined();
  });
});
