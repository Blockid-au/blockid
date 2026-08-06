// Colocated vitest for `use-locale.ts` — the useSyncExternalStore-backed
// hook that reads `blockid_lang` from `document.cookie` and returns a
// `[locale, setLocale]` tuple used by every EN/VI toggle across the app.
//
// The module is tiny (37 lines) but shipping a regression here is highly
// user-visible: (a) losing the cookie regex ships VI copy to EN users (and
// vice-versa) because the read collapses to the default "en", (b) losing the
// SSR branch throws on the first hydration render because `document` is
// undefined, (c) losing the `samesite=lax` on the write means the cookie is
// dropped in Safari when the user follows an OAuth callback, and (d) losing
// the storage-event dispatch means the sibling call sites on the same page
// (footer + navbar language toggle) get out of sync until the next full
// navigation.
//
// The React runtime is not present in the vitest node env so
// `useSyncExternalStore` / `useCallback` are shimmed to invoke the store's
// subscribe + getSnapshot directly. This lets the test drive re-reads by
// re-calling the captured getSnapshot after mutating the fake cookie.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoreSubscribe = (cb: () => void) => () => void;
type StoreGetSnapshot<T> = () => T;

interface CapturedHookState<T> {
  getSnapshot?: StoreGetSnapshot<T>;
  unsubscribe?: () => void;
}

const captured: CapturedHookState<"en" | "vi"> = {};

vi.mock("react", () => ({
  useSyncExternalStore: <T,>(
    subscribe: StoreSubscribe,
    getSnapshot: StoreGetSnapshot<T>,
    getServerSnapshot: StoreGetSnapshot<T>,
  ): T => {
    if (typeof (globalThis as { window?: unknown }).window === "undefined") {
      return getServerSnapshot();
    }
    captured.getSnapshot = getSnapshot as unknown as StoreGetSnapshot<"en" | "vi">;
    captured.unsubscribe = subscribe(() => {
      /* React would re-render; tests re-read via captured.getSnapshot */
    });
    return getSnapshot();
  },
  useCallback: <T,>(fn: T): T => fn,
}));

import { useLocale, type Locale } from "./use-locale";

// ── fake document + window ───────────────────────────────────────────

interface FakeDocument {
  cookieStore: string;
}

interface FakeStorageEvent {
  type: string;
}

interface FakeWindow {
  listeners: Map<string, Set<(e: FakeStorageEvent) => void>>;
  addEventListener(type: string, cb: (e: FakeStorageEvent) => void): void;
  removeEventListener(type: string, cb: (e: FakeStorageEvent) => void): void;
  dispatchEvent(e: FakeStorageEvent): void;
}

// A minimal Event stand-in — `use-locale.ts` calls `new Event("storage")`.
class FakeEventCtor {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
}

let doc: FakeDocument;
let win: FakeWindow;

function installDocument(): FakeDocument {
  doc = { cookieStore: "" };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    get() {
      return {
        get cookie() {
          return doc.cookieStore;
        },
        set cookie(v: string) {
          // Real browsers merge per-cookie; the module only ever writes the
          // single `blockid_lang=…` cookie so an overwrite faithfully models
          // the observable behaviour for this hook.
          doc.cookieStore = v;
        },
      };
    },
  });
  return doc;
}

function uninstallDocument(): void {
  delete (globalThis as { document?: unknown }).document;
}

function installWindow(): FakeWindow {
  const listeners = new Map<string, Set<(e: FakeStorageEvent) => void>>();
  win = {
    listeners,
    addEventListener(type, cb) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener(type, cb) {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent(e) {
      const set = listeners.get(e.type);
      if (!set) return;
      for (const cb of set) cb(e);
    },
  };
  (globalThis as { window?: unknown }).window = win;
  (globalThis as { Event?: unknown }).Event = FakeEventCtor;
  return win;
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { Event?: unknown }).Event;
}

beforeEach(() => {
  installDocument();
  installWindow();
  captured.getSnapshot = undefined;
  captured.unsubscribe = undefined;
});

afterEach(() => {
  captured.unsubscribe?.();
  uninstallWindow();
  uninstallDocument();
});

// ── read-side / cookie parse ────────────────────────────────────────

describe("useLocale — cookie parse", () => {
  it("empty cookie jar defaults to 'en'", () => {
    const [locale] = useLocale();
    expect(locale).toBe("en");
  });

  it("cookie `blockid_lang=vi` yields 'vi'", () => {
    doc.cookieStore = "blockid_lang=vi";
    const [locale] = useLocale();
    expect(locale).toBe("vi");
  });

  it("cookie `blockid_lang=en` yields 'en'", () => {
    doc.cookieStore = "blockid_lang=en";
    const [locale] = useLocale();
    expect(locale).toBe("en");
  });

  it("an unknown value like `blockid_lang=fr` falls back to 'en'", () => {
    // Pins the value guard — anything not literally "vi" collapses to "en"
    // so a stale/corrupted cookie can never crash the render.
    doc.cookieStore = "blockid_lang=fr";
    const [locale] = useLocale();
    expect(locale).toBe("en");
  });

  it("cookie jar with no `blockid_lang` key defaults to 'en'", () => {
    doc.cookieStore = "otherCookie=abc; alsoAnother=1";
    const [locale] = useLocale();
    expect(locale).toBe("en");
  });

  it("`blockid_lang=vi` alongside other cookies is still parsed as 'vi'", () => {
    doc.cookieStore = "foo=bar; blockid_lang=vi; baz=qux";
    const [locale] = useLocale();
    expect(locale).toBe("vi");
  });

  it("`blockid_lang=vi` as the trailing cookie in a multi-cookie jar is parsed as 'vi'", () => {
    doc.cookieStore = "session=abc; blockid_lang=vi";
    const [locale] = useLocale();
    expect(locale).toBe("vi");
  });

  it("cookie name prefix collision (`some_blockid_lang=vi`) still matches the regex — captured as 'vi'", () => {
    // The regex is intentionally permissive on prefix — pin the current
    // behaviour so a later hardening intended to require a word-boundary is
    // an explicit product decision, not a silent parser rewrite.
    doc.cookieStore = "some_blockid_lang=vi";
    const [locale] = useLocale();
    expect(locale).toBe("vi");
  });

  it("locale value satisfies the `Locale` union at the type level", () => {
    // Compile-time guard promoted to runtime: pin the tuple's first slot to
    // one of the two allowed strings so a future widening surfaces here.
    const [locale] = useLocale();
    const check: Locale = locale;
    expect(check === "en" || check === "vi").toBe(true);
  });
});

// ── SSR posture ─────────────────────────────────────────────────────

describe("useLocale — SSR posture", () => {
  it("when window is undefined getServerSnapshot returns 'en' (no hydration flip)", () => {
    uninstallWindow();
    const [locale] = useLocale();
    expect(locale).toBe("en");
    // Reinstall so afterEach unsubscribe is a no-op.
    installWindow();
  });

  it("when both window AND document are undefined the SSR path still returns 'en'", () => {
    uninstallWindow();
    uninstallDocument();
    const [locale] = useLocale();
    expect(locale).toBe("en");
    installDocument();
    installWindow();
  });

  it("SSR path does NOT touch document.cookie (would throw in strict SSR envs)", () => {
    // Model the failure mode: install a document that throws on read. If the
    // hook's SSR branch is intact, getServerSnapshot short-circuits before
    // we ever hit it.
    uninstallWindow();
    uninstallDocument();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        return {
          get cookie(): string {
            throw new Error("cookie read on the server");
          },
        };
      },
    });
    expect(() => useLocale()).not.toThrow();
    uninstallDocument();
    installDocument();
    installWindow();
  });
});

// ── subscribe / cross-tab ───────────────────────────────────────────

describe("useLocale — subscribe", () => {
  it("registers a storage event listener on mount", () => {
    useLocale();
    const storageListeners = win.listeners.get("storage");
    expect(storageListeners?.size).toBeGreaterThanOrEqual(1);
  });

  it("unsubscribe removes the storage event listener", () => {
    useLocale();
    const before = win.listeners.get("storage")?.size ?? 0;
    captured.unsubscribe?.();
    const after = win.listeners.get("storage")?.size ?? 0;
    expect(after).toBe(before - 1);
    captured.unsubscribe = undefined;
  });

  it("does not register any non-storage listener", () => {
    useLocale();
    // The hook only cares about 'storage'; a stray listener on another event
    // would leak between tabs.
    for (const [type] of win.listeners) {
      expect(type).toBe("storage");
    }
  });
});

// ── setLocale writer ────────────────────────────────────────────────

describe("useLocale — setLocale writer", () => {
  it("setLocale('vi') writes the `blockid_lang=vi` cookie", () => {
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(doc.cookieStore).toMatch(/blockid_lang=vi/);
  });

  it("setLocale('en') writes the `blockid_lang=en` cookie", () => {
    const [, setLocale] = useLocale();
    setLocale("en");
    expect(doc.cookieStore).toMatch(/blockid_lang=en/);
  });

  it("the written cookie scopes to path=/ so every route sees it", () => {
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(doc.cookieStore).toMatch(/path=\//);
  });

  it("the written cookie carries `samesite=lax` — required for OAuth callbacks not to drop it in Safari", () => {
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(doc.cookieStore).toMatch(/samesite=lax/);
  });

  it("the written cookie carries `max-age=31536000` (365 days)", () => {
    // Pins the 1-year retention explicitly — a stealth downgrade to a
    // session cookie would silently reset the locale on every browser
    // restart.
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(doc.cookieStore).toMatch(/max-age=31536000/);
  });

  it("setLocale dispatches a `storage` event so sibling call sites re-read", () => {
    let hits = 0;
    win.addEventListener("storage", () => {
      hits += 1;
    });
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  it("after setLocale('vi'), captured getSnapshot returns 'vi' on the next read", () => {
    const [, setLocale] = useLocale();
    setLocale("vi");
    expect(captured.getSnapshot?.()).toBe("vi");
  });

  it("after setLocale('en'), captured getSnapshot returns 'en' on the next read", () => {
    doc.cookieStore = "blockid_lang=vi";
    const [, setLocale] = useLocale();
    setLocale("en");
    expect(captured.getSnapshot?.()).toBe("en");
  });

  it("the internal subscriber's storage listener does not throw when the dispatched event carries no data", () => {
    // `use-locale.ts` dispatches `new Event('storage')` — no `key` field. If
    // the subscriber were tightened to inspect `.key` it must still handle
    // the null-ish case without throwing.
    useLocale();
    expect(() => win.dispatchEvent({ type: "storage" })).not.toThrow();
  });
});

// ── returned tuple shape ────────────────────────────────────────────

describe("useLocale — return shape", () => {
  it("returns a 2-tuple", () => {
    const tuple = useLocale();
    expect(Array.isArray(tuple)).toBe(true);
    expect(tuple).toHaveLength(2);
  });

  it("slot 0 is a Locale string, slot 1 is a function", () => {
    const [locale, setLocale] = useLocale();
    expect(typeof locale).toBe("string");
    expect(typeof setLocale).toBe("function");
  });
});
