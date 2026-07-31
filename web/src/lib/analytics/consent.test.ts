// Unit tests for the client-side Google Consent Mode v2 helper.
//
// Pins the four public exports (getConsent / hasResponded / grantConsent /
// denyConsent) plus the three storage side-effects the GA4 measurement-plan
// template (see docs/plans/atlassian-standard-mapping-goal.md §1 phase 7
// P2 gap "GA4 measurement plan template") depends on: localStorage
// mirror, first-party `blockid_consent` cookie, and the gtag
// `consent`/`update` dataLayer push covering ad_storage +
// analytics_storage + ad_user_data + ad_personalization. Also pins the
// SSR-safety contract — every helper must no-op when `window` is
// undefined so a server-render call site cannot crash.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getConsent,
  hasResponded,
  grantConsent,
  denyConsent,
} from "./consent";

const STORAGE_KEY = "blockid_analytics_consent_v1";
const COOKIE_KEY = "blockid_consent";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

interface FakeStorage {
  store: Record<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  throwOnSet?: boolean;
  throwOnGet?: boolean;
}

interface FakeDocument {
  cookieWrites: string[];
  cookie: string;
}

interface FakeWindow {
  localStorage: FakeStorage;
  dataLayer?: unknown[];
}

function makeStorage(): FakeStorage {
  const s: FakeStorage = {
    store: {},
    getItem(k) {
      if (s.throwOnGet) throw new Error("storage_get_boom");
      return Object.prototype.hasOwnProperty.call(s.store, k) ? s.store[k] : null;
    },
    setItem(k, v) {
      if (s.throwOnSet) throw new Error("storage_set_boom");
      s.store[k] = v;
    },
    removeItem(k) {
      delete s.store[k];
    },
  };
  return s;
}

function makeDocument(): FakeDocument {
  const d: FakeDocument = { cookieWrites: [], cookie: "" };
  Object.defineProperty(d, "cookie", {
    get() {
      return "";
    },
    set(v: string) {
      d.cookieWrites.push(v);
    },
    configurable: true,
  });
  return d;
}

function install(win?: Partial<FakeWindow>, doc?: FakeDocument): {
  win: FakeWindow;
  doc: FakeDocument | undefined;
  restore: () => void;
} {
  const storage = win?.localStorage ?? makeStorage();
  const fake: FakeWindow = {
    localStorage: storage,
    dataLayer: win?.dataLayer,
  };
  const g = globalThis as unknown as { window?: FakeWindow; document?: FakeDocument };
  const prevWindow = g.window;
  const prevDocument = g.document;
  g.window = fake;
  if (doc) g.document = doc;
  return {
    win: fake,
    doc,
    restore() {
      if (prevWindow === undefined) delete g.window;
      else g.window = prevWindow;
      if (prevDocument === undefined) delete g.document;
      else g.document = prevDocument;
    },
  };
}

function uninstall(): () => void {
  const g = globalThis as unknown as { window?: FakeWindow; document?: FakeDocument };
  const prevWindow = g.window;
  const prevDocument = g.document;
  delete g.window;
  delete g.document;
  return () => {
    if (prevWindow !== undefined) g.window = prevWindow;
    if (prevDocument !== undefined) g.document = prevDocument;
  };
}

// ── getConsent ────────────────────────────────────────────────────────

describe("getConsent", () => {
  let ctx: ReturnType<typeof install>;
  beforeEach(() => {
    ctx = install();
  });
  afterEach(() => {
    ctx.restore();
  });

  it("returns { granted:false } when localStorage is empty", () => {
    expect(getConsent()).toEqual({ granted: false });
  });

  it("returns the saved state after a prior write", () => {
    ctx.win.localStorage.store[STORAGE_KEY] = JSON.stringify({
      granted: true,
      timestamp: "2026-07-31T00:00:00.000Z",
    });
    expect(getConsent()).toEqual({
      granted: true,
      timestamp: "2026-07-31T00:00:00.000Z",
    });
  });

  it("falls back to default when the persisted payload is malformed JSON", () => {
    ctx.win.localStorage.store[STORAGE_KEY] = "{not json";
    expect(getConsent()).toEqual({ granted: false });
  });

  it("falls back to default when localStorage throws on read", () => {
    ctx.win.localStorage.throwOnGet = true;
    expect(getConsent()).toEqual({ granted: false });
  });

  it("returns default when window is undefined (SSR safety)", () => {
    const restore = uninstall();
    try {
      expect(getConsent()).toEqual({ granted: false });
    } finally {
      restore();
    }
  });
});

// ── hasResponded ──────────────────────────────────────────────────────

describe("hasResponded", () => {
  let ctx: ReturnType<typeof install>;
  beforeEach(() => {
    ctx = install();
  });
  afterEach(() => {
    ctx.restore();
  });

  it("returns false when the user has not answered yet", () => {
    expect(hasResponded()).toBe(false);
  });

  it("returns true when a granted decision is on file", () => {
    ctx.win.localStorage.store[STORAGE_KEY] = JSON.stringify({ granted: true });
    expect(hasResponded()).toBe(true);
  });

  it("returns true when a denied decision is on file", () => {
    ctx.win.localStorage.store[STORAGE_KEY] = JSON.stringify({ granted: false });
    expect(hasResponded()).toBe(true);
  });

  it("returns false when window is undefined (SSR safety)", () => {
    const restore = uninstall();
    try {
      expect(hasResponded()).toBe(false);
    } finally {
      restore();
    }
  });
});

// ── grantConsent ──────────────────────────────────────────────────────

describe("grantConsent", () => {
  let ctx: ReturnType<typeof install>;
  let doc: FakeDocument;
  beforeEach(() => {
    doc = makeDocument();
    ctx = install(undefined, doc);
  });
  afterEach(() => {
    ctx.restore();
  });

  it("persists { granted:true, timestamp:ISO } to localStorage", () => {
    grantConsent();
    const raw = ctx.win.localStorage.store[STORAGE_KEY];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);
    expect(parsed.granted).toBe(true);
    expect(typeof parsed.timestamp).toBe("string");
    expect(Number.isFinite(Date.parse(parsed.timestamp))).toBe(true);
  });

  it("writes the first-party `blockid_consent=granted` cookie with SameSite=Lax + 1y max-age", () => {
    grantConsent();
    expect(doc.cookieWrites).toHaveLength(1);
    const c = doc.cookieWrites[0];
    expect(c.startsWith(`${COOKIE_KEY}=granted`)).toBe(true);
    expect(c).toContain("path=/");
    expect(c).toContain(`max-age=${COOKIE_MAX_AGE_SEC}`);
    expect(c).toContain("SameSite=Lax");
  });

  it("pushes a Consent Mode v2 update onto window.dataLayer with all four keys granted", () => {
    grantConsent();
    expect(ctx.win.dataLayer).toBeDefined();
    const layer = ctx.win.dataLayer!;
    expect(layer).toHaveLength(1);
    // gtag() pushes its arguments as a single Arguments-like array/object.
    // The consent-update helper spreads (kind, action, params) so the entry
    // reads like ["consent", "update", { ad_storage, ... }].
    const entry = layer[0] as unknown[];
    expect(Array.from(entry)).toEqual([
      "consent",
      "update",
      {
        ad_storage: "granted",
        analytics_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      },
    ]);
  });

  it("initialises window.dataLayer when it is missing before the call", () => {
    // No `dataLayer` on the stubbed window — grantConsent() must create one.
    expect(ctx.win.dataLayer).toBeUndefined();
    grantConsent();
    expect(Array.isArray(ctx.win.dataLayer)).toBe(true);
    expect(ctx.win.dataLayer).toHaveLength(1);
  });

  it("swallows a throwing localStorage.setItem so consent still flows to gtag", () => {
    ctx.win.localStorage.throwOnSet = true;
    expect(() => grantConsent()).not.toThrow();
    // The consent-update should still fire — gtag telemetry must not be
    // gated on localStorage availability (private-mode / storage-full).
    expect(ctx.win.dataLayer).toHaveLength(1);
  });

  it("does not throw when window is undefined (SSR safety)", () => {
    const restore = uninstall();
    try {
      expect(() => grantConsent()).not.toThrow();
    } finally {
      restore();
    }
  });
});

// ── denyConsent ───────────────────────────────────────────────────────

describe("denyConsent", () => {
  let ctx: ReturnType<typeof install>;
  let doc: FakeDocument;
  beforeEach(() => {
    doc = makeDocument();
    ctx = install(undefined, doc);
  });
  afterEach(() => {
    ctx.restore();
  });

  it("persists { granted:false, timestamp:ISO } to localStorage", () => {
    denyConsent();
    const raw = ctx.win.localStorage.store[STORAGE_KEY];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);
    expect(parsed.granted).toBe(false);
    expect(typeof parsed.timestamp).toBe("string");
    expect(Number.isFinite(Date.parse(parsed.timestamp))).toBe(true);
  });

  it("writes the first-party `blockid_consent=denied` cookie", () => {
    denyConsent();
    expect(doc.cookieWrites).toHaveLength(1);
    expect(doc.cookieWrites[0].startsWith(`${COOKIE_KEY}=denied`)).toBe(true);
  });

  it("pushes a Consent Mode v2 update with all four keys denied", () => {
    denyConsent();
    const layer = ctx.win.dataLayer!;
    expect(layer).toHaveLength(1);
    const entry = layer[0] as unknown[];
    expect(Array.from(entry)).toEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
  });

  it("does not throw when window is undefined (SSR safety)", () => {
    const restore = uninstall();
    try {
      expect(() => denyConsent()).not.toThrow();
    } finally {
      restore();
    }
  });
});

// ── Round-trip: write → read ──────────────────────────────────────────

describe("consent state round-trip", () => {
  let ctx: ReturnType<typeof install>;
  let doc: FakeDocument;
  beforeEach(() => {
    doc = makeDocument();
    ctx = install(undefined, doc);
  });
  afterEach(() => {
    ctx.restore();
  });

  it("grantConsent() → getConsent() returns granted:true with a timestamp", () => {
    grantConsent();
    const state = getConsent();
    expect(state.granted).toBe(true);
    expect(typeof state.timestamp).toBe("string");
  });

  it("denyConsent() → getConsent() returns granted:false with a timestamp", () => {
    denyConsent();
    const state = getConsent();
    expect(state.granted).toBe(false);
    expect(typeof state.timestamp).toBe("string");
  });

  it("denyConsent() after grantConsent() overwrites the prior decision", () => {
    grantConsent();
    denyConsent();
    const state = getConsent();
    expect(state.granted).toBe(false);
    // hasResponded remains true — a denial is still an explicit answer.
    expect(hasResponded()).toBe(true);
  });
});
