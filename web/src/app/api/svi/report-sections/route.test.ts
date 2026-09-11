// Colocated tests for GET /api/svi/report-sections — S18-A member access.
//
// Read-only (viewer+). Pins:
//   - latest analysis resolves under the OWNER's email for a member, with
//     the legacy fallback bound to the caller
//   - explicit ?analysisId: the caller's own analysis OR one that belongs to
//     the shared project (owner email + same project_id) is allowed; an
//     owner analysis from ANOTHER project is refused (403)

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

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as { id: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => db.sb,
  isSupabaseConfigured: () => true,
}));

import { GET } from "./route";

function req(analysisId?: string) {
  const u = new URL("http://x/api/svi/report-sections");
  if (analysisId) u.searchParams.set("analysisId", analysisId);
  return new Request(u);
}

function reset(analysisRow?: Record<string, unknown>) {
  Object.assign(scopeState, makeScopeState({ analysis: { id: "an-1" } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({
    report_sections: [{ section_id: "hook_problem", depth: "summary", content: "x", word_count: 1, credits_cost: 0, created_at: "2026-01-01" }],
    svi_analyses: analysisRow ? [analysisRow] : [],
  });
}

beforeEach(() => reset());

describeMemberAccess("GET /api/svi/report-sections", {
  state: scopeState,
  kind: "read",
  reset: () => reset(),
  run: () => GET(req()),
  expectKeyFns: ["findLatestAnalysisWithFallback"],
});

describe("GET /api/svi/report-sections?analysisId — ownership", () => {
  it("member: an analysis stored under the owner's email on the SAME project is readable", async () => {
    reset({ id: "an-9", email: "owner@x.test", project_id: "proj-1" });
    scopeState.role = "viewer";
    const res = await GET(req("an-9"));
    expect(res.status).toBe(200);
    expect((await res.json()).analysisId).toBe("an-9");
  });

  it("member: the owner's analysis from ANOTHER project is refused", async () => {
    reset({ id: "an-8", email: "owner@x.test", project_id: "proj-other" });
    scopeState.role = "editor";
    const res = await GET(req("an-8"));
    expect(res.status).toBe(403);
  });

  it("owner: their own analysis by id is readable regardless of project", async () => {
    reset({ id: "an-7", email: "caller@x.test", project_id: null });
    const res = await GET(req("an-7"));
    expect(res.status).toBe(200);
  });
});
