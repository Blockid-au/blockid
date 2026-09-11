// Colocated tests for POST /api/integrations/github/manual — S18-A member access.
//
// Replaces the github_repo evidence row on the project's account → editor+.
// Pins: viewer 403 before the write; editor writes under the OWNER's email;
// owner / no project keep the caller's own key.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
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

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

vi.mock("@/lib/github", () => ({
  parseRepoInput: () => ({ owner: "acme", repo: "app" }),
  fetchRepoStats: async () => ({ owner: "acme", repo: "app", commitsLast90: 12, stars: 3, url: "https://github.com/acme/app" }),
}));

import { POST } from "./route";

function req() {
  return new Request("http://x/api/integrations/github/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: "acme/app" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ svi_evidence: [] });
}

beforeEach(reset);

describeMemberAccess("POST /api/integrations/github/manual", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findOrCreateSVIAccount"],
});

describe("POST /api/integrations/github/manual — write target", () => {
  it("editor: evidence row is written on the OWNER's account", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
    const acct = scopeState.calls.find((c) => c.fn === "findOrCreateSVIAccount");
    expect(acct?.email).toBe("owner@x.test");
  });

  it("viewer: 403 and no evidence row touched", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
  });
});
