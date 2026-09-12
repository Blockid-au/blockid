// Colocated tests for GET /api/oauth/github/callback — S18-A member access.
//
// Linking GitHub evidence onto the project's (OWNER's) svi_accounts row is
// admin+. The caller is a browser mid-OAuth-redirect, so a refused role is
// answered with a redirect carrying `?error=github_forbidden_role` — and it
// happens BEFORE the code exchange so the one-shot code is not consumed.
// On success the evidence is keyed on the OWNER's account (found via
// `dataEmail`), while the oauth_connections row stays under the CALLER's
// email (their own GitHub identity).

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

vi.mock("@/lib/github-repo-audit", () => ({ auditGitHubRepo: async () => null }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { GET } from "./route";

const SESSION = "sess-0123456789abcdef-rest";
const fetchSpy = vi.fn();

function stateParam(email = "caller@x.test") {
  return Buffer.from(JSON.stringify({ email, csrf: SESSION.slice(0, 16) })).toString("base64url");
}

function run(email?: string) {
  return GET(new Request(`http://x/api/oauth/github/callback?code=one-shot&state=${stateParam(email)}`));
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  cookieStore.clear();
  cookieStore.set("blockid_session", SESSION);
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.test";
  db.sb = fakeSupabase({ svi_evidence: [], oauth_connections: [] });
  fetchSpy.mockReset().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("login/oauth/access_token")) return { ok: true, json: async () => ({ access_token: "gh-token" }) };
    if (u.endsWith("/user")) {
      return { ok: true, json: async () => ({ login: "octocat", html_url: "https://github.com/octocat", public_repos: 3, followers: 1, bio: null, created_at: "2020-01-01" }) };
    }
    if (u.includes("/user/repos")) return { ok: true, json: async () => [] };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

function location(res: Response) {
  return new URL(res.headers.get("location")!);
}

describe("GET /api/oauth/github/callback — member access", () => {
  it.each(["editor", "viewer"] as const)(
    "%s: redirected with error=github_forbidden_role BEFORE the code exchange",
    async (role) => {
      scopeState.role = role;
      const res = await run();
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const loc = location(res);
      expect(loc.pathname).toBe("/workspace/evidence");
      expect(loc.searchParams.get("error")).toBe("github_forbidden_role");
      expect(loc.searchParams.get("code")).toBe("forbidden");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
      expect(db.sb!.calls).toEqual([]);
      expect(scopeState.lastMinRole).toBe("admin");
    },
  );

  it("admin on a shared project: evidence on the OWNER's account; connection under the CALLER's email", async () => {
    scopeState.role = "admin";
    const res = await run();
    expect(location(res).searchParams.get("connected")).toBe("github");
    expect(fetchSpy.mock.calls[0][0]).toContain("login/oauth/access_token");
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("owner@x.test");
    expect(acct.projectId).toBe("proj-1");
    const upserts = db.sb!.find("oauth_connections", "upsert");
    expect((upserts[0].args[0] as { user_email: string }).user_email).toBe("caller@x.test");
    expect(db.sb!.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
  });

  it("owner: evidence keyed on the owner's own email", async () => {
    const res = await run();
    expect(location(res).searchParams.get("connected")).toBe("github");
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("caller@x.test");
  });

  it("CSRF mismatch: redirected before the role gate or the code exchange", async () => {
    cookieStore.set("blockid_session", "different-session-token");
    const res = await run();
    expect(location(res).searchParams.get("error")).toBe("github_csrf_mismatch");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(scopeState.lastMinRole).toBeUndefined();
  });
});

// S18-A review P1-2 — the callback is bound to the SESSION: the state
// email must be the signed-in user's (case-insensitive), the no-project
// fallback is `user.email` (never the state value), and an unauthenticated
// or mismatched caller is redirected before the code exchange or any write.
describe("GET /api/oauth/github/callback — session binding (S18-A P1-2)", () => {
  it("state email ≠ session email: redirected with error=github_email_mismatch; no exchange, no writes", async () => {
    const res = await run("victim@x.test");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = location(res);
    expect(loc.pathname).toBe("/workspace/evidence");
    expect(loc.searchParams.get("error")).toBe("github_email_mismatch");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
    expect(db.sb!.calls).toEqual([]);
    expect(scopeState.lastMinRole).toBeUndefined();
  });

  it("unauthenticated: redirected with error=github_unauthenticated; no exchange, no writes", async () => {
    auth.user = null;
    const res = await run();
    expect(location(res).searchParams.get("error")).toBe("github_unauthenticated");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(keyCalls(scopeState, "findOrCreateSVIAccount")).toEqual([]);
    expect(db.sb!.calls).toEqual([]);
  });

  it("no project + case-different state email: linked under the SESSION email (fallback is user.email, not state.email)", async () => {
    scopeState.projectId = null;
    const res = await run("Caller@X.TEST");
    expect(location(res).searchParams.get("connected")).toBe("github");
    const [acct] = keyCalls(scopeState, "findOrCreateSVIAccount");
    expect(acct.email).toBe("caller@x.test");
    expect(acct.projectId).toBeNull();
    const upserts = db.sb!.find("oauth_connections", "upsert");
    expect((upserts[0].args[0] as { user_email: string }).user_email).toBe("caller@x.test");
  });
});
