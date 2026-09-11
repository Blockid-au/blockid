// Colocated tests for POST /api/integrations/[provider]/sync — S18-A member access.
//
// A sync refreshes the project's svi_signals from the CALLER's own
// connection (their token, keyed on their user_id) and writes the signals
// under the project OWNER's user_id so owner + members read one set.
// editor+; viewer → 403 before the connection is even looked up.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
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

const conn = vi.hoisted(() => ({
  getConnection: vi.fn(),
  writeSignals: vi.fn(),
  markSynced: vi.fn(),
}));
vi.mock("@/lib/oauth-connectors", () => ({
  getConnection: (...a: unknown[]) => conn.getConnection(...a),
  writeSignals: (...a: unknown[]) => conn.writeSignals(...a),
  markSynced: (...a: unknown[]) => conn.markSynced(...a),
}));
vi.mock("@/lib/oauth-github-signals", () => ({
  fetchGithubSignals: async () => ({ recentCommits30d: 5, publicRepos: 2, topLanguage: "ts", primaryRepoName: "app", primaryRepoStars: 1 }),
}));
vi.mock("@/lib/oauth-stripe-signals", () => ({ fetchStripeSignals: async () => ({}) }));
vi.mock("@/lib/oauth-ga4-signals", () => ({ fetchGa4Signals: async () => ({}) }));

import { POST } from "./route";

function run() {
  return POST(new Request("http://x/api/integrations/github/sync", { method: "POST" }), {
    params: Promise.resolve({ provider: "github" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  conn.getConnection.mockReset().mockResolvedValue({ id: "conn-1", status: "active", accessToken: "t", lastSyncAt: null });
  conn.writeSignals.mockReset().mockResolvedValue(undefined);
  conn.markSynced.mockReset().mockResolvedValue(undefined);
}

beforeEach(reset);

describeMemberAccess("POST /api/integrations/[provider]/sync", {
  state: scopeState,
  kind: "write",
  reset,
  run,
});

describe("POST /api/integrations/[provider]/sync — keys", () => {
  it("editor: uses the CALLER's connection, writes signals under the OWNER's user_id", async () => {
    scopeState.role = "editor";
    const res = await run();
    expect(res.status).toBe(200);
    expect(conn.getConnection).toHaveBeenCalledWith("user-caller", "github", "proj-1");
    expect(conn.writeSignals).toHaveBeenCalledWith("user-owner", "proj-1", "github", expect.any(Array));
  });

  it("owner: signals written under their own user_id", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(conn.writeSignals).toHaveBeenCalledWith("user-caller", "proj-1", "github", expect.any(Array));
  });

  it("viewer: 403 and the connection is never looked up", async () => {
    scopeState.role = "viewer";
    const res = await run();
    expect(res.status).toBe(403);
    expect(conn.getConnection).not.toHaveBeenCalled();
  });
});
