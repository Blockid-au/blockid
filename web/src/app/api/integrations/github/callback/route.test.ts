// Colocated tests for GET /api/integrations/github/callback — S18-A member access.
//
// Linking a third-party account to the project is admin+ (owner or admin).
// Because the caller is a browser mid-OAuth-redirect, a refused role is
// answered with a redirect carrying `?error=github_forbidden_role` — and it
// happens BEFORE the code exchange so the one-shot code is not consumed.
// On success the token is stored under the CALLER's user_id and the
// signals under the project OWNER's user_id.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeScopeState } from "@/test/project-scope-mock";

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
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

const conn = vi.hoisted(() => ({ saveConnection: vi.fn(), writeSignals: vi.fn(), markSynced: vi.fn() }));
vi.mock("@/lib/oauth-connectors", () => ({
  saveConnection: (...a: unknown[]) => conn.saveConnection(...a),
  writeSignals: (...a: unknown[]) => conn.writeSignals(...a),
  markSynced: (...a: unknown[]) => conn.markSynced(...a),
}));
vi.mock("@/lib/oauth-github-signals", () => ({
  fetchGithubSignals: async () => ({ recentCommits30d: 5, publicRepos: 2, topLanguage: "ts", primaryRepoName: "app", primaryRepoStars: 1 }),
}));

import { GET } from "./route";

const fetchSpy = vi.fn();

function run() {
  return GET(new Request("http://x/api/integrations/github/callback?code=abc&state=s1"));
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  cookieStore.clear();
  cookieStore.set("blockid_gh_state", "s1");
  process.env.GITHUB_OAUTH_CLIENT_ID = "id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
  fetchSpy.mockReset().mockImplementation(async (url: string) => {
    if (String(url).includes("access_token")) {
      return { json: async () => ({ access_token: "gh-token", scope: "repo" }) };
    }
    return { json: async () => ({ login: "octocat", id: 1 }) };
  });
  vi.stubGlobal("fetch", fetchSpy);
  conn.saveConnection.mockReset().mockResolvedValue({ id: "conn-1" });
  conn.writeSignals.mockReset().mockResolvedValue(undefined);
  conn.markSynced.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/integrations/github/callback — member access", () => {
  it("editor: redirected with error=github_forbidden_role BEFORE the code exchange", async () => {
    scopeState.role = "editor";
    const res = await run();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("error")).toBe("github_forbidden_role");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(conn.saveConnection).not.toHaveBeenCalled();
    expect(scopeState.lastMinRole).toBe("admin");
  });

  it("admin: token saved under the CALLER; signals written under the OWNER", async () => {
    scopeState.role = "admin";
    const res = await run();
    expect(new URL(res.headers.get("location")!).searchParams.get("connected")).toBe("github");
    expect(conn.saveConnection).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-caller", projectId: "proj-1" }));
    expect(conn.writeSignals).toHaveBeenCalledWith("user-owner", "proj-1", "github", expect.any(Array));
  });

  it("owner: both keys are the owner's own", async () => {
    const res = await run();
    expect(new URL(res.headers.get("location")!).searchParams.get("connected")).toBe("github");
    expect(conn.writeSignals).toHaveBeenCalledWith("user-caller", "proj-1", "github", expect.any(Array));
  });
});
