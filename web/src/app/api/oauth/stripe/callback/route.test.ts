// Colocated tests for GET /api/oauth/stripe/callback — S18-A review P1-2.
//
// The callback is bound to the SESSION: the state email must be the
// signed-in user's (case-insensitive), the no-project fallback is
// `user.email` (never the state value), and an unauthenticated or
// mismatched caller is redirected BEFORE the code exchange or any write.
// The admin+ project gate (S18-A) still runs after the session check.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState, keyCalls } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

vi.mock("stripe", () => ({
  default: class StripeMock {
    accounts = { retrieve: async () => ({ id: "acct_1", business_profile: { name: "Acme" }, country: "AU", default_currency: "aud", charges_enabled: true }) };
    balance = { retrieve: async () => ({ available: [{ currency: "aud", amount: 1000 }] }) };
    charges = { list: async () => ({ data: [] }) };
    subscriptions = { list: async () => ({ data: [] }) };
    customers = { list: async () => ({ data: [] }) };
  },
}));

import { GET } from "./route";

const SESSION = "sess-0123456789abcdef-rest";
const fetchSpy = vi.fn();

function stateParam(email = "caller@x.test") {
  return Buffer.from(JSON.stringify({ email, csrf: SESSION.slice(0, 16) })).toString("base64url");
}

function run(email?: string) {
  return GET(new Request(`http://x/api/oauth/stripe/callback?code=one-shot&state=${stateParam(email)}`));
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  cookieStore.clear();
  cookieStore.set("blockid_session", SESSION);
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.test";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_CLIENT_SECRET = "sk_test_x";
  db.sb = fakeSupabase({ svi_evidence: [], oauth_connections: [] });
  fetchSpy.mockReset().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("connect.stripe.com/oauth/token")) {
      return { ok: true, json: async () => ({ access_token: "st-token", stripe_user_id: "acct_1" }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function location(res: Response) {
  return new URL(res.headers.get("location")!);
}

describe("GET /api/oauth/stripe/callback — session binding (S18-A P1-2)", () => {
  it("state email ≠ session email: redirected with error=stripe_email_mismatch; no exchange, no writes", async () => {
    const res = await run("victim@x.test");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = location(res);
    expect(loc.pathname).toBe("/workspace/evidence");
    expect(loc.searchParams.get("error")).toBe("stripe_email_mismatch");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
    expect(db.sb!.calls).toEqual([]);
    expect(scopeState.lastMinRole).toBeUndefined();
  });

  it("unauthenticated: redirected with error=stripe_unauthenticated; no exchange, no writes", async () => {
    auth.user = null;
    const res = await run();
    expect(location(res).searchParams.get("error")).toBe("stripe_unauthenticated");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
    expect(db.sb!.calls).toEqual([]);
  });

  it("CSRF mismatch still wins first: redirected before the session check", async () => {
    cookieStore.set("blockid_session", "different-session-token");
    auth.user = null;
    const res = await run();
    expect(location(res).searchParams.get("error")).toBe("stripe_csrf_mismatch");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("happy path (owner): exchange runs, connection + evidence written on the owner's own record", async () => {
    const res = await run();
    expect(location(res).searchParams.get("connected")).toBe("stripe");
    expect(fetchSpy).toHaveBeenCalled();
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("caller@x.test");
    expect(acct.projectId).toBe("proj-1");
    expect(db.sb!.find("oauth_connections", "upsert").length).toBe(1);
    expect(db.sb!.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
  });

  it("admin on a shared project: evidence keyed on the OWNER's account", async () => {
    scopeState.role = "admin";
    const res = await run();
    expect(location(res).searchParams.get("connected")).toBe("stripe");
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("owner@x.test");
    expect(scopeState.lastMinRole).toBe("admin");
  });

  it("editor: redirected with error=stripe_forbidden_role after the session check, before the exchange", async () => {
    scopeState.role = "editor";
    const res = await run();
    expect(location(res).searchParams.get("error")).toBe("stripe_forbidden_role");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.sb!.calls).toEqual([]);
  });

  it("no project + case-different state email: linked under the SESSION email (fallback is user.email, not state.email)", async () => {
    scopeState.projectId = null;
    const res = await run("Caller@X.TEST");
    expect(location(res).searchParams.get("connected")).toBe("stripe");
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("caller@x.test");
    expect(acct.projectId).toBeNull();

  });
});
