// Colocated vitest for the server-only BlockID magic-link / password /
// Google auth surface (`web/src/lib/auth.ts`) — the module every
// /api/auth/*, verify route, and getCurrentUser() call site funnels
// through. Silent regressions here are load-bearing across the entire
// authenticated surface:
//
//   - dropping normaliseEmail on the magic_links insert or on the
//     app_users select-by-email would fork "Foo@Bar.com" and
//     "foo@bar.com" into two rows, so the same founder logs in twice
//     with a split cap-table / dataroom / SVI history
//   - dropping the consumed_at flip before the app_users upsert would
//     let a stolen magic link replay indefinitely
//   - dropping the expires_at guard on consumeMagicLink or the
//     session TTL check on getCurrentUser would let 15-minute /
//     90-day windows silently become "forever"
//   - dropping the is(consumed_at, null) guard on the consume UPDATE
//     would let a race between two concurrent /auth/verify hits both
//     flip the flag and both mint sessions
//   - flipping the "invalid password → no session" contract on
//     loginWithPassword to fall back on any DB-null branch would
//     silently upgrade an anonymous attacker to a session cookie
//   - dropping the two-step "existing user with null password_hash"
//     merge branch on registerWithPassword would surface a hostile
//     "email_taken" 400 to a founder who signed up via Google first
//     and is now trying to add a password — the merge branch is the
//     documented UX per the route comment
//   - flipping the "reveal user exists" branch on resetWithTempPassword
//     from ok:true-with-no-body to ok:false would leak the enumeration
//     the comment explicitly protects
//
// Pins:
//   - constants (SESSION_COOKIE, SESSION_TTL_DAYS, MAGIC_LINK_TTL_MIN,
//     ADMIN_EMAIL) — every caller reads these directly, a rename would
//     break the cookie header + the SQL migration + the email copy
//   - pure helpers (newMagicLinkToken 24 chars, newSessionToken 32 chars,
//     normaliseEmail trim+lowercase, isValidEmail regex + 320-char cap,
//     generateTempPassword 10 chars from the no-confusables alphabet)
//   - requestMagicLink — token generation, expires_at math, TTL override,
//     supabase-null degrade to reason:"not_configured", insert-error
//     degrade to reason:"db_error", pending_payload default {}, ip_hash
//     null default
//   - consumeMagicLink — not_found / expired / already_used / db_error
//     reason ladder, consumed_at flip before app_users upsert, referral
//     + reseller processing on new-user branch only, no double-invoke on
//     re-entry, existing-user branch bumps last_login_at
//   - createSessionRow — SESSION_TTL_DAYS math, token shape, null on
//     supabase absence, null on insert error
//   - setSessionCookie / clearSessionCookie / destroySession — HttpOnly
//     + SameSite=lax + maxAge math, secure flag driven by
//     NEXT_PUBLIC_SITE_URL prefix, destroy deletes DB row + clears cookie
//   - getCurrentUser — cookies-throw graceful degrade, unconfigured
//     supabase graceful degrade, expired session cleanup + null return,
//     mapAppUser role/plan/nulls contract
//   - loginWithGoogle — google_id-first lookup, email-fallback, admin
//     role assignment via ADMIN_EMAIL, session created after upsert,
//     new-user side-effects fire once
//   - registerWithPassword — 8-char min guard, email_taken vs merge
//     branch, bcrypt hash written, credits/notification/referral fired
//     only on new-user branch
//   - loginWithPassword — invalid_credentials on missing user, no_password
//     when hash is null, invalid_credentials on bcrypt mismatch, session
//     minted on success
//   - autoCreateUserWithTempPassword — existing user → no temp password,
//     new user → temp password issued + credits initialised
//   - resetWithTempPassword — enumeration protection (ok:true w/o body
//     when user missing), db_error passthrough on the update path

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// State + fake supabase / cookies / dependent-module mocks
// ---------------------------------------------------------------------------

interface Resp { data?: unknown; error?: { message: string } | null }
interface CallLog {
  table: string;
  op: "insert" | "select" | "update" | "delete";
  payload?: Record<string, unknown>;
  selectCols?: string;
  eqs: Array<{ col: string; val: unknown }>;
  iss: Array<{ col: string; val: unknown }>;
  terminal?: "single" | "maybeSingle" | "await";
  hadInsertSelect?: boolean;
}

interface State {
  adminConfigured: boolean;
  cookieStoreThrows: boolean;
  cookies: Map<string, string>;
  cookieSets: Array<Record<string, unknown>>;
  cookieDeletes: string[];
  scripts: Map<string, Resp[]>;    // key: `${table}:${op}` (op = insert|select|update|delete)
  calls: CallLog[];
  sideEffects: {
    initializeCredits: string[];
    processReferral: Array<{ userId: string; code: string }>;
    processAttribution: Array<{ userId: string; code: string }>;
    notificationInserts: number;
  };
}

const state: State = {
  adminConfigured: true,
  cookieStoreThrows: false,
  cookies: new Map(),
  cookieSets: [],
  cookieDeletes: [],
  scripts: new Map(),
  calls: [],
  sideEffects: {
    initializeCredits: [],
    processReferral: [],
    processAttribution: [],
    notificationInserts: 0,
  },
};

function resetState() {
  state.adminConfigured = true;
  state.cookieStoreThrows = false;
  state.cookies = new Map();
  state.cookieSets = [];
  state.cookieDeletes = [];
  state.scripts = new Map();
  state.calls = [];
  state.sideEffects = {
    initializeCredits: [],
    processReferral: [],
    processAttribution: [],
    notificationInserts: 0,
  };
}

function push(table: string, op: CallLog["op"], resp: Resp): void {
  const key = `${table}:${op}`;
  const arr = state.scripts.get(key) ?? [];
  arr.push(resp);
  state.scripts.set(key, arr);
}

function pop(table: string, op: CallLog["op"]): Resp {
  const key = `${table}:${op}`;
  const arr = state.scripts.get(key);
  if (!arr || arr.length === 0) return { data: null, error: null };
  return arr.shift()!;
}

// A chain object that (a) captures every call, (b) is thenable so
// `await supabase.from().insert().eq()` resolves, and (c) exposes
// .single() / .maybeSingle() terminals that also resolve.
function makeChain(table: string): unknown {
  const log: CallLog = { table, op: "select", eqs: [], iss: [] };
  state.calls.push(log);

  const resolve = (terminal: CallLog["terminal"]): Promise<Resp> => {
    log.terminal ??= terminal;
    return Promise.resolve(pop(log.table, log.op));
  };

  const chain: Record<string, unknown> = {};
  chain.select = (cols: string) => {
    log.selectCols = cols;
    // insert().select().single() branch — log.op stays "insert"
    if (log.op === "insert") log.hadInsertSelect = true;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    log.op = "insert";
    log.payload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    log.op = "update";
    log.payload = payload;
    return chain;
  };
  chain.delete = () => {
    log.op = "delete";
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    log.eqs.push({ col, val });
    return chain;
  };
  chain.is = (col: string, val: unknown) => {
    log.iss.push({ col, val });
    return chain;
  };
  chain.single = () => resolve("single");
  chain.maybeSingle = () => resolve("maybeSingle");
  chain.then = (onF: (v: Resp) => unknown, onR?: (e: unknown) => unknown) =>
    resolve("await").then(onF, onR);
  return chain;
}

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (state.cookieStoreThrows) throw new Error("outside request scope");
    return {
      get(name: string) {
        const v = state.cookies.get(name);
        return v === undefined ? undefined : { name, value: v };
      },
      set(opts: Record<string, unknown>) {
        state.cookieSets.push(opts);
        state.cookies.set(String(opts.name), String(opts.value));
      },
      delete(name: string) {
        state.cookieDeletes.push(name);
        state.cookies.delete(name);
      },
    };
  },
}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => state.adminConfigured,
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return { from: (t: string) => makeChain(t) };
  },
}));

vi.mock("./credits", () => ({
  initializeCredits: async (userId: string) => {
    state.sideEffects.initializeCredits.push(userId);
  },
}));

vi.mock("./referrals", () => ({
  processReferral: async (userId: string, code: string) => {
    state.sideEffects.processReferral.push({ userId, code });
  },
}));

vi.mock("./reseller/process-attribution", () => ({
  processAttribution: async (userId: string, code: string) => {
    state.sideEffects.processAttribution.push({ userId, code });
  },
}));

// Import after all vi.mock hoists.
import {
  ADMIN_EMAIL,
  MAGIC_LINK_TTL_MIN,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  autoCreateUserWithTempPassword,
  clearSessionCookie,
  consumeMagicLink,
  createSessionRow,
  destroySession,
  generateTempPassword,
  getCurrentUser,
  isValidEmail,
  loginWithGoogle,
  loginWithPassword,
  newMagicLinkToken,
  newSessionToken,
  normaliseEmail,
  registerWithPassword,
  requestMagicLink,
  resetWithTempPassword,
  setSessionCookie,
} from "./auth";

beforeEach(() => {
  resetState();
  // Silence expected console.error / console.warn from graceful-degrade branches
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("auth — module constants", () => {
  it("SESSION_COOKIE pinned to 'blockid_session'", () => {
    expect(SESSION_COOKIE).toBe("blockid_session");
  });

  it("SESSION_TTL_DAYS pinned to 90", () => {
    expect(SESSION_TTL_DAYS).toBe(90);
  });

  it("MAGIC_LINK_TTL_MIN pinned to 15", () => {
    expect(MAGIC_LINK_TTL_MIN).toBe(15);
  });

  it("ADMIN_EMAIL defaults to 'admin@blockid.au'", () => {
    // Env override tested via readable string — the module reads on import.
    expect(ADMIN_EMAIL).toBe("admin@blockid.au");
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("auth — pure helpers", () => {
  it("newMagicLinkToken returns a 24-char nanoid", () => {
    const t = newMagicLinkToken();
    expect(t).toHaveLength(24);
    expect(typeof t).toBe("string");
  });

  it("newSessionToken returns a 32-char nanoid", () => {
    const t = newSessionToken();
    expect(t).toHaveLength(32);
    expect(typeof t).toBe("string");
  });

  it("newMagicLinkToken and newSessionToken return distinct values on repeat calls", () => {
    const a = newMagicLinkToken();
    const b = newMagicLinkToken();
    expect(a).not.toBe(b);
    const c = newSessionToken();
    const d = newSessionToken();
    expect(c).not.toBe(d);
  });

  it("normaliseEmail trims and lowercases", () => {
    expect(normaliseEmail("  Foo@BAR.com  ")).toBe("foo@bar.com");
    expect(normaliseEmail("ada@Example.ORG")).toBe("ada@example.org");
  });

  it("isValidEmail accepts typical addresses and rejects garbage", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("no domain@x.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail({})).toBe(false);
  });

  it("isValidEmail rejects strings longer than 320 chars", () => {
    const long = "a".repeat(320) + "@x.co"; // 325 chars — over the cap
    expect(long.length).toBeGreaterThan(320);
    expect(isValidEmail(long)).toBe(false);
    const okBoundary = "a".repeat(315) + "@x.co"; // exactly 320
    expect(okBoundary.length).toBe(320);
    expect(isValidEmail(okBoundary)).toBe(true);
  });

  it("generateTempPassword returns 10 chars from the no-confusables alphabet", () => {
    const allowed = /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;
    for (let i = 0; i < 25; i++) {
      const pw = generateTempPassword();
      expect(pw).toHaveLength(10);
      expect(pw).toMatch(allowed);
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });
});

// ---------------------------------------------------------------------------
// requestMagicLink
// ---------------------------------------------------------------------------

describe("auth — requestMagicLink", () => {
  it("returns not_configured when supabase is unconfigured (still returns a token for dev)", async () => {
    state.adminConfigured = false;
    const out = await requestMagicLink({ email: "founder@example.com", intent: "login" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("not_configured");
    expect(out.token).toHaveLength(24);
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("inserts a magic_links row with normalised email, intent, and 15-min expiry by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    push("magic_links", "insert", { error: null });
    const out = await requestMagicLink({
      email: "  Foo@BAR.com  ",
      intent: "save_founder_pack",
    });
    expect(out.ok).toBe(true);
    expect(out.reason).toBeUndefined();
    const insert = state.calls.find((c) => c.table === "magic_links" && c.op === "insert");
    expect(insert).toBeTruthy();
    expect(insert!.payload!.email).toBe("foo@bar.com");
    expect(insert!.payload!.intent).toBe("save_founder_pack");
    expect(insert!.payload!.token).toBe(out.token);
    expect(insert!.payload!.pending_payload).toEqual({});
    expect(insert!.payload!.ip_hash).toBeNull();
    // expires_at ≈ now + 15min
    const dt = new Date(out.expiresAt).getTime() - Date.parse("2026-08-07T00:00:00.000Z");
    expect(dt).toBe(MAGIC_LINK_TTL_MIN * 60_000);
  });

  it("honours a positive ttlMinutes override (24-hour wholesale-provisioning flow)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    push("magic_links", "insert", { error: null });
    const out = await requestMagicLink({
      email: "a@b.co",
      intent: "login",
      ttlMinutes: 24 * 60,
    });
    expect(out.ok).toBe(true);
    const dt = new Date(out.expiresAt).getTime() - Date.parse("2026-08-07T00:00:00.000Z");
    expect(dt).toBe(24 * 60 * 60_000);
  });

  it("ignores a non-positive / non-finite ttlMinutes and falls back to MAGIC_LINK_TTL_MIN", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    push("magic_links", "insert", { error: null });
    push("magic_links", "insert", { error: null });
    const zero = await requestMagicLink({ email: "a@b.co", intent: "login", ttlMinutes: 0 });
    const neg = await requestMagicLink({ email: "a@b.co", intent: "login", ttlMinutes: -5 });
    const zdt = new Date(zero.expiresAt).getTime() - Date.parse("2026-08-07T00:00:00.000Z");
    const ndt = new Date(neg.expiresAt).getTime() - Date.parse("2026-08-07T00:00:00.000Z");
    expect(zdt).toBe(MAGIC_LINK_TTL_MIN * 60_000);
    expect(ndt).toBe(MAGIC_LINK_TTL_MIN * 60_000);
  });

  it("carries pending_payload and ip_hash into the insert when supplied", async () => {
    push("magic_links", "insert", { error: null });
    const payload = { referralCode: "REF-XYZ", next: "/dashboard" };
    await requestMagicLink({
      email: "a@b.co",
      intent: "login",
      pendingPayload: payload,
      ipHash: "sha256-hash",
    });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.payload!.pending_payload).toEqual(payload);
    expect(insert.payload!.ip_hash).toBe("sha256-hash");
  });

  it("returns db_error when the magic_links insert fails", async () => {
    push("magic_links", "insert", { error: { message: "duplicate token" } });
    const out = await requestMagicLink({ email: "a@b.co", intent: "login" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("db_error");
    expect(out.token).toHaveLength(24);
  });
});

// ---------------------------------------------------------------------------
// consumeMagicLink
// ---------------------------------------------------------------------------

describe("auth — consumeMagicLink", () => {
  it("returns not_configured when supabase is unconfigured", async () => {
    state.adminConfigured = false;
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns db_error when the initial magic_links read errors", async () => {
    push("magic_links", "select", { data: null, error: { message: "read boom" } });
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "db_error" });
  });

  it("returns not_found when the token row is absent", async () => {
    push("magic_links", "select", { data: null, error: null });
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns already_used when consumed_at is set on the row", async () => {
    push("magic_links", "select", {
      data: {
        email: "a@b.co",
        intent: "login",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: new Date().toISOString(),
        pending_payload: {},
      },
      error: null,
    });
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "already_used" });
  });

  it("returns expired when expires_at is in the past", async () => {
    push("magic_links", "select", {
      data: {
        email: "a@b.co",
        intent: "login",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        consumed_at: null,
        pending_payload: {},
      },
      error: null,
    });
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "expired" });
  });

  it("returns db_error when the consume UPDATE fails (link is not further processed)", async () => {
    push("magic_links", "select", {
      data: {
        email: "a@b.co",
        intent: "login",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        pending_payload: {},
      },
      error: null,
    });
    push("magic_links", "update", { error: { message: "update boom" } });
    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "db_error" });
    // Second UPDATE guard: the consume UPDATE targeted magic_links with .is(consumed_at, null)
    const consumeCall = state.calls.find((c) => c.table === "magic_links" && c.op === "update");
    expect(consumeCall).toBeTruthy();
    expect(consumeCall!.iss.some((i) => i.col === "consumed_at" && i.val === null)).toBe(true);
    // No app_users side-effect fired
    expect(state.calls.filter((c) => c.table === "app_users").length).toBe(0);
  });

  it("existing-user branch bumps last_login_at, does NOT re-initialise credits, and returns user + payload", async () => {
    const validRow = {
      email: "  Foo@BAR.com  ",
      intent: "login",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
      pending_payload: { next: "/dashboard" },
    };
    push("magic_links", "select", { data: validRow, error: null });
    push("magic_links", "update", { error: null });
    // existing-user lookup
    push("app_users", "select", {
      data: { id: "u-1", email: "foo@bar.com", display_name: "Founder", created_at: "2026-01-01T00:00:00Z", last_login_at: null },
      error: null,
    });
    // last_login bump
    push("app_users", "update", { error: null });
    // final re-read
    push("app_users", "select", {
      data: {
        id: "u-1",
        email: "foo@bar.com",
        display_name: "Founder",
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-08-07T00:00:00Z",
        role: "user",
        plan: null,
        google_id: null,
        avatar_url: null,
        discount_pct: null,
        startup_name: null,
        startup_stage: null,
        industry: null,
        onboarding_completed: false,
        startup_goals: null,
      },
      error: null,
    });

    const out = await consumeMagicLink("tok");
    expect(out.ok).toBe(true);
    expect(out.user?.id).toBe("u-1");
    expect(out.user?.email).toBe("foo@bar.com");
    expect(out.intent).toBe("login");
    expect(out.pendingPayload).toEqual({ next: "/dashboard" });
    // Existing-user branch never touches credits / referrals / attribution
    expect(state.sideEffects.initializeCredits).toEqual([]);
    expect(state.sideEffects.processReferral).toEqual([]);
    expect(state.sideEffects.processAttribution).toEqual([]);
  });

  it("new-user branch grants credits, processes referral + reseller codes, and returns user", async () => {
    push("magic_links", "select", {
      data: {
        email: "new@founder.com",
        intent: "save_founder_pack",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        pending_payload: { referralCode: "REF-1", resellerCode: "VIA-2" },
      },
      error: null,
    });
    push("magic_links", "update", { error: null });
    push("app_users", "select", { data: null, error: null }); // no existing user
    push("app_users", "insert", {
      data: { id: "u-new", email: "new@founder.com", display_name: null, created_at: "2026-08-07T00:00:00Z", last_login_at: "2026-08-07T00:00:00Z" },
      error: null,
    });
    push("app_users", "insert", { error: null }); // welcome notification
    push("app_users", "select", {
      data: {
        id: "u-new",
        email: "new@founder.com",
        display_name: null,
        created_at: "2026-08-07T00:00:00Z",
        last_login_at: "2026-08-07T00:00:00Z",
        role: "user",
        plan: null,
        google_id: null,
        avatar_url: null,
        discount_pct: null,
        startup_name: null,
        startup_stage: null,
        industry: null,
        onboarding_completed: false,
        startup_goals: null,
      },
      error: null,
    });
    // Notification insert (fire-and-forget on notifications table)
    push("notifications", "insert", { error: null });

    const out = await consumeMagicLink("tok");
    expect(out.ok).toBe(true);
    expect(out.user?.id).toBe("u-new");
    expect(state.sideEffects.initializeCredits).toEqual(["u-new"]);
    expect(state.sideEffects.processReferral).toEqual([{ userId: "u-new", code: "REF-1" }]);
    expect(state.sideEffects.processAttribution).toEqual([{ userId: "u-new", code: "VIA-2" }]);
  });

  it("new-user branch returns db_error when the app_users insert fails (no side-effects)", async () => {
    push("magic_links", "select", {
      data: {
        email: "new@founder.com",
        intent: "login",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        pending_payload: {},
      },
      error: null,
    });
    push("magic_links", "update", { error: null });
    push("app_users", "select", { data: null, error: null });
    push("app_users", "insert", { data: null, error: { message: "insert boom" } });

    const out = await consumeMagicLink("tok");
    expect(out).toEqual({ ok: false, reason: "db_error" });
    expect(state.sideEffects.initializeCredits).toEqual([]);
    expect(state.sideEffects.processReferral).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createSessionRow
// ---------------------------------------------------------------------------

describe("auth — createSessionRow", () => {
  it("returns null on supabase absence", async () => {
    state.adminConfigured = false;
    const t = await createSessionRow({ userId: "u-1" });
    expect(t).toBeNull();
  });

  it("returns null on insert error", async () => {
    push("sessions", "insert", { error: { message: "boom" } });
    const t = await createSessionRow({ userId: "u-1" });
    expect(t).toBeNull();
  });

  it("returns a 32-char token and inserts with 90-day expiry + null defaults for ipHash/userAgent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T00:00:00.000Z"));
    push("sessions", "insert", { error: null });
    const t = await createSessionRow({ userId: "u-1" });
    expect(t).not.toBeNull();
    expect(t!.length).toBe(32);
    const insert = state.calls.find((c) => c.table === "sessions" && c.op === "insert")!;
    expect(insert.payload!.user_id).toBe("u-1");
    expect(insert.payload!.ip_hash).toBeNull();
    expect(insert.payload!.user_agent).toBeNull();
    const dt = new Date(insert.payload!.expires_at as string).getTime() -
      Date.parse("2026-08-07T00:00:00.000Z");
    expect(dt).toBe(SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("forwards ipHash + userAgent when supplied", async () => {
    push("sessions", "insert", { error: null });
    await createSessionRow({
      userId: "u-1",
      ipHash: "hash-1",
      userAgent: "ua-1",
    });
    const insert = state.calls.find((c) => c.table === "sessions" && c.op === "insert")!;
    expect(insert.payload!.ip_hash).toBe("hash-1");
    expect(insert.payload!.user_agent).toBe("ua-1");
  });
});

// ---------------------------------------------------------------------------
// setSessionCookie / clearSessionCookie / destroySession
// ---------------------------------------------------------------------------

describe("auth — session cookie helpers", () => {
  it("setSessionCookie stamps HttpOnly + SameSite=lax + 90-day maxAge + path=/", async () => {
    await setSessionCookie("tok-1");
    expect(state.cookieSets).toHaveLength(1);
    const opts = state.cookieSets[0];
    expect(opts.name).toBe(SESSION_COOKIE);
    expect(opts.value).toBe("tok-1");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_TTL_DAYS * 24 * 60 * 60);
  });

  it("setSessionCookie's secure flag is driven by NEXT_PUBLIC_SITE_URL prefix", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    try {
      process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:4001";
      await setSessionCookie("tok-a");
      process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
      await setSessionCookie("tok-b");
      expect(state.cookieSets[0].secure).toBe(false);
      expect(state.cookieSets[1].secure).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it("clearSessionCookie deletes only the blockid_session cookie", async () => {
    state.cookies.set(SESSION_COOKIE, "tok");
    state.cookies.set("other", "keep-me");
    await clearSessionCookie();
    expect(state.cookieDeletes).toEqual([SESSION_COOKIE]);
    expect(state.cookies.has("other")).toBe(true);
  });

  it("destroySession deletes the DB row AND the cookie", async () => {
    state.cookies.set(SESSION_COOKIE, "sess-tok");
    push("sessions", "delete", { error: null });
    await destroySession();
    expect(state.cookieDeletes).toContain(SESSION_COOKIE);
    const del = state.calls.find((c) => c.table === "sessions" && c.op === "delete");
    expect(del).toBeTruthy();
    expect(del!.eqs).toContainEqual({ col: "token", val: "sess-tok" });
  });

  it("destroySession is a no-op on the DB when no cookie is present", async () => {
    // No cookie set → no sessions delete call
    await destroySession();
    expect(state.calls.filter((c) => c.table === "sessions").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser
// ---------------------------------------------------------------------------

describe("auth — getCurrentUser", () => {
  it("returns null when supabase is unconfigured (does not throw)", async () => {
    state.adminConfigured = false;
    const out = await getCurrentUser();
    expect(out).toBeNull();
  });

  it("returns null when cookies() throws (build-time / static prerender path)", async () => {
    state.cookieStoreThrows = true;
    const out = await getCurrentUser();
    expect(out).toBeNull();
  });

  it("returns null when the session cookie is absent", async () => {
    // adminConfigured=true, cookie not set
    const out = await getCurrentUser();
    expect(out).toBeNull();
  });

  it("returns null and cleans up an expired session row", async () => {
    state.cookies.set(SESSION_COOKIE, "expired-tok");
    push("sessions", "select", {
      data: {
        token: "expired-tok",
        user_id: "u-1",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });
    push("sessions", "delete", { error: null });
    const out = await getCurrentUser();
    expect(out).toBeNull();
    const del = state.calls.find((c) => c.table === "sessions" && c.op === "delete");
    expect(del).toBeTruthy();
  });

  it("returns the mapped AppUser on a valid session (role/plan/goals null-safe defaults)", async () => {
    state.cookies.set(SESSION_COOKIE, "live-tok");
    push("sessions", "select", {
      data: {
        token: "live-tok",
        user_id: "u-42",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
      error: null,
    });
    push("app_users", "select", {
      data: {
        id: "u-42",
        email: "founder@example.com",
        display_name: null,
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: null,
        role: "user",
        plan: null,
        google_id: null,
        avatar_url: null,
        discount_pct: null,
        startup_name: null,
        startup_stage: null,
        industry: null,
        onboarding_completed: null,
        startup_goals: null,
      },
      error: null,
    });
    const out = await getCurrentUser();
    expect(out).toEqual({
      id: "u-42",
      email: "founder@example.com",
      displayName: null,
      createdAt: "2026-01-01T00:00:00Z",
      lastLoginAt: null,
      role: "user",
      plan: null,
      googleId: null,
      avatarUrl: null,
      discountPct: null,
      startupName: null,
      startupStage: null,
      industry: null,
      onboardingCompleted: false,
      startupGoals: null,
    });
  });

  it("mapAppUser coerces role='admin' when the row explicitly says admin", async () => {
    state.cookies.set(SESSION_COOKIE, "admin-tok");
    push("sessions", "select", {
      data: {
        token: "admin-tok",
        user_id: "u-admin",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
      error: null,
    });
    push("app_users", "select", {
      data: { id: "u-admin", email: "admin@blockid.au", role: "admin", created_at: "2026-01-01" },
      error: null,
    });
    const out = await getCurrentUser();
    expect(out?.role).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// loginWithGoogle
// ---------------------------------------------------------------------------

describe("auth — loginWithGoogle", () => {
  it("returns not_configured when supabase is unconfigured", async () => {
    state.adminConfigured = false;
    const out = await loginWithGoogle({ sub: "g-1", email: "a@b.co" });
    expect(out).toEqual({ ok: false, reason: "not_configured" });
  });

  it("existing-by-google_id branch: updates and re-reads, does NOT insert app_users", async () => {
    push("app_users", "select", { data: { id: "u-1" }, error: null }); // by google_id
    push("app_users", "update", { error: null });
    push("sessions", "insert", { error: null });
    push("app_users", "select", {
      data: {
        id: "u-1",
        email: "founder@example.com",
        display_name: "Founder",
        created_at: "2026-01-01",
        last_login_at: "2026-08-07",
        role: "user",
      },
      error: null,
    });

    const out = await loginWithGoogle({ sub: "g-1", email: "founder@example.com", name: "Founder", picture: "https://x/y.png" });
    expect(out.ok).toBe(true);
    expect(out.sessionToken).toBeTruthy();
    expect(out.user?.id).toBe("u-1");
    // No app_users insert on the existing-by-google_id branch
    expect(state.calls.filter((c) => c.table === "app_users" && c.op === "insert")).toHaveLength(0);
    // New-user side-effects skipped
    expect(state.sideEffects.initializeCredits).toEqual([]);
  });

  it("new-user branch: inserts, grants credits, processes ref/attribution codes, admin role for ADMIN_EMAIL", async () => {
    push("app_users", "select", { data: null, error: null }); // google_id miss
    push("app_users", "select", { data: null, error: null }); // email miss
    push("app_users", "insert", { data: { id: "u-new" }, error: null });
    push("notifications", "insert", { error: null });
    push("sessions", "insert", { error: null });
    push("app_users", "select", {
      data: {
        id: "u-new",
        email: ADMIN_EMAIL,
        role: "admin",
        created_at: "2026-08-07",
      },
      error: null,
    });

    const out = await loginWithGoogle(
      { sub: "g-2", email: ADMIN_EMAIL, name: "Admin", picture: null as unknown as string },
      { referralCode: "R", resellerCode: "V" },
    );
    expect(out.ok).toBe(true);
    expect(out.user?.role).toBe("admin");
    expect(state.sideEffects.initializeCredits).toEqual(["u-new"]);
    expect(state.sideEffects.processReferral).toEqual([{ userId: "u-new", code: "R" }]);
    expect(state.sideEffects.processAttribution).toEqual([{ userId: "u-new", code: "V" }]);
    // Insert payload includes role=admin because email matches ADMIN_EMAIL
    const insert = state.calls.find((c) => c.table === "app_users" && c.op === "insert")!;
    expect(insert.payload!.role).toBe("admin");
    expect(insert.payload!.google_id).toBe("g-2");
  });

  it("returns db_error when the createSessionRow step fails", async () => {
    push("app_users", "select", { data: { id: "u-1" }, error: null }); // by google_id
    push("app_users", "update", { error: null });
    push("sessions", "insert", { error: { message: "boom" } }); // session insert fails
    const out = await loginWithGoogle({ sub: "g-1", email: "a@b.co" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("db_error");
  });
});

// ---------------------------------------------------------------------------
// registerWithPassword
// ---------------------------------------------------------------------------

describe("auth — registerWithPassword", () => {
  it("returns weak_password when password is shorter than 8 chars", async () => {
    const out = await registerWithPassword({ email: "a@b.co", password: "short" });
    expect(out).toEqual({ ok: false, reason: "weak_password" });
    // No supabase round-trip
    expect(state.calls.length).toBe(0);
  });

  it("returns not_configured when supabase is unconfigured (short-circuits before weak_password check)", async () => {
    state.adminConfigured = false;
    const out = await registerWithPassword({ email: "a@b.co", password: "longenough" });
    expect(out).toEqual({ ok: false, reason: "not_configured" });
  });

  it("email_taken when the row exists AND already has a password_hash", async () => {
    push("app_users", "select", {
      data: { id: "u-1", password_hash: "$2a$12$existinghashvalueXXXXXXXXXXXXXXXXXXXXXXXX" },
      error: null,
    });
    const out = await registerWithPassword({ email: "a@b.co", password: "passw0rd!" });
    expect(out).toEqual({ ok: false, reason: "email_taken" });
    // No update / insert / session fired
    expect(state.calls.filter((c) => c.op === "insert" || c.op === "update").length).toBe(0);
  });

  it("merge branch: existing row with null password_hash → sets password, mints session, no new credits", async () => {
    push("app_users", "select", { data: { id: "u-1", password_hash: null }, error: null });
    push("app_users", "update", { error: null });
    push("sessions", "insert", { error: null });
    push("app_users", "select", {
      data: {
        id: "u-1",
        email: "a@b.co",
        display_name: "Founder",
        created_at: "2026-01-01",
        role: "user",
      },
      error: null,
    });
    const out = await registerWithPassword({ email: "a@b.co", password: "passw0rd!" });
    expect(out.ok).toBe(true);
    expect(out.sessionToken).toBeTruthy();
    // Merge branch does NOT re-initialise credits (no double free-credit grant)
    expect(state.sideEffects.initializeCredits).toEqual([]);
    // The update payload carried a bcrypt hash (starts with "$2")
    const upd = state.calls.find((c) => c.table === "app_users" && c.op === "update")!;
    expect(String(upd.payload!.password_hash)).toMatch(/^\$2[aby]\$/);
  });

  it("new-user branch: bcrypt-hashes, inserts, grants credits + notification, admin role for ADMIN_EMAIL", async () => {
    push("app_users", "select", { data: null, error: null }); // no existing
    push("app_users", "insert", { data: { id: "u-new" }, error: null });
    push("notifications", "insert", { error: null });
    push("sessions", "insert", { error: null });
    push("app_users", "select", {
      data: { id: "u-new", email: ADMIN_EMAIL, role: "admin", created_at: "2026-08-07" },
      error: null,
    });
    const out = await registerWithPassword({
      email: ADMIN_EMAIL,
      password: "passw0rd!",
      referralCode: "R",
      resellerCode: "V",
    });
    expect(out.ok).toBe(true);
    expect(state.sideEffects.initializeCredits).toEqual(["u-new"]);
    expect(state.sideEffects.processReferral).toEqual([{ userId: "u-new", code: "R" }]);
    expect(state.sideEffects.processAttribution).toEqual([{ userId: "u-new", code: "V" }]);
    const insert = state.calls.find((c) => c.table === "app_users" && c.op === "insert")!;
    expect(insert.payload!.role).toBe("admin");
    expect(String(insert.payload!.password_hash)).toMatch(/^\$2[aby]\$/);
  });

  it("returns db_error when the new-user app_users insert fails (no credits granted)", async () => {
    push("app_users", "select", { data: null, error: null });
    push("app_users", "insert", { data: null, error: { message: "insert boom" } });
    const out = await registerWithPassword({ email: "new@x.co", password: "passw0rd!" });
    expect(out).toEqual({ ok: false, reason: "db_error" });
    expect(state.sideEffects.initializeCredits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loginWithPassword
// ---------------------------------------------------------------------------

describe("auth — loginWithPassword", () => {
  it("returns not_configured when supabase is unconfigured", async () => {
    state.adminConfigured = false;
    const out = await loginWithPassword({ email: "a@b.co", password: "x" });
    expect(out).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns db_error on select error", async () => {
    push("app_users", "select", { data: null, error: { message: "db boom" } });
    const out = await loginWithPassword({ email: "a@b.co", password: "x" });
    expect(out).toEqual({ ok: false, reason: "db_error" });
  });

  it("returns invalid_credentials when the user row is absent (no enumeration signal)", async () => {
    push("app_users", "select", { data: null, error: null });
    const out = await loginWithPassword({ email: "ghost@x.co", password: "x" });
    expect(out).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns no_password when the row exists but password_hash is null (Google-only account)", async () => {
    push("app_users", "select", { data: { id: "u-1", password_hash: null }, error: null });
    const out = await loginWithPassword({ email: "a@b.co", password: "x" });
    expect(out).toEqual({ ok: false, reason: "no_password" });
  });

  it("returns invalid_credentials when bcrypt.compare fails", async () => {
    const hash = await bcrypt.hash("actual-password", 4);
    push("app_users", "select", { data: { id: "u-1", password_hash: hash }, error: null });
    const out = await loginWithPassword({ email: "a@b.co", password: "wrong-password" });
    expect(out).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns a session on a valid password match", async () => {
    const hash = await bcrypt.hash("correct-pw", 4);
    push("app_users", "select", {
      data: {
        id: "u-1",
        email: "a@b.co",
        password_hash: hash,
        display_name: "F",
        created_at: "2026-01-01",
        role: "user",
      },
      error: null,
    });
    push("app_users", "update", { error: null }); // last_login bump
    push("sessions", "insert", { error: null });
    const out = await loginWithPassword({ email: "a@b.co", password: "correct-pw" });
    expect(out.ok).toBe(true);
    expect(out.sessionToken).toBeTruthy();
    expect(out.sessionToken!.length).toBe(32);
    expect(out.user?.id).toBe("u-1");
  });
});

// ---------------------------------------------------------------------------
// autoCreateUserWithTempPassword + resetWithTempPassword
// ---------------------------------------------------------------------------

describe("auth — autoCreateUserWithTempPassword", () => {
  it("existing user: returns isNewUser:false, no temp password, no credits granted", async () => {
    push("app_users", "select", { data: { id: "u-1", password_hash: "$2a$xxx" }, error: null });
    const out = await autoCreateUserWithTempPassword("a@b.co");
    expect(out.ok).toBe(true);
    expect(out.isNewUser).toBe(false);
    expect(out.userId).toBe("u-1");
    expect(out.tempPassword).toBeUndefined();
    expect(state.sideEffects.initializeCredits).toEqual([]);
  });

  it("new user: issues a 10-char temp password, initialises credits, seeds notification", async () => {
    push("app_users", "select", { data: null, error: null });
    push("app_users", "insert", { data: { id: "u-new" }, error: null });
    push("notifications", "insert", { error: null });
    const out = await autoCreateUserWithTempPassword("new@x.co");
    expect(out.ok).toBe(true);
    expect(out.isNewUser).toBe(true);
    expect(out.userId).toBe("u-new");
    expect(out.tempPassword).toHaveLength(10);
    expect(state.sideEffects.initializeCredits).toEqual(["u-new"]);
    // Insert payload carries the bcrypt hash of that temp password
    const insert = state.calls.find((c) => c.table === "app_users" && c.op === "insert")!;
    const hash = String(insert.payload!.password_hash);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(out.tempPassword!, hash)).toBe(true);
  });

  it("new user: DB insert error surfaces reason:'db_error' with isNewUser:true", async () => {
    push("app_users", "select", { data: null, error: null });
    push("app_users", "insert", { data: null, error: { message: "insert boom" } });
    const out = await autoCreateUserWithTempPassword("new@x.co");
    expect(out).toEqual({ ok: false, isNewUser: true, reason: "db_error" });
  });
});

describe("auth — resetWithTempPassword", () => {
  it("returns not_configured when supabase is unconfigured", async () => {
    state.adminConfigured = false;
    const out = await resetWithTempPassword("a@b.co");
    expect(out).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns ok:true with NO tempPassword when the user does not exist (enumeration guard)", async () => {
    push("app_users", "select", { data: null, error: null });
    const out = await resetWithTempPassword("ghost@x.co");
    expect(out).toEqual({ ok: true });
    // No update fires
    expect(state.calls.filter((c) => c.op === "update").length).toBe(0);
  });

  it("existing user: issues a new temp password + writes the bcrypt hash", async () => {
    push("app_users", "select", { data: { id: "u-1" }, error: null });
    push("app_users", "update", { error: null });
    const out = await resetWithTempPassword("a@b.co");
    expect(out.ok).toBe(true);
    expect(out.tempPassword).toHaveLength(10);
    const upd = state.calls.find((c) => c.table === "app_users" && c.op === "update")!;
    const hash = String(upd.payload!.password_hash);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(out.tempPassword!, hash)).toBe(true);
  });

  it("db_error surfaces on the update path", async () => {
    push("app_users", "select", { data: { id: "u-1" }, error: null });
    push("app_users", "update", { error: { message: "update boom" } });
    const out = await resetWithTempPassword("a@b.co");
    expect(out).toEqual({ ok: false, reason: "db_error" });
  });
});
