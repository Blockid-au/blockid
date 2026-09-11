// Colocated tests for /api/svi/evidence-completeness — S18-A member access.
//
// Rows are keyed on project_id only, so the role gate carries the whole
// policy: GET viewer+, POST / DELETE editor+ (viewer → 403 before any row).

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

vi.mock("@/lib/svi-completeness", () => ({
  calculateDimensionCompleteness: () => [],
  generateFixRoadmap: () => [],
  forecastRoadmapImpact: () => null,
  EVIDENCE_CATALOG: {},
}));

import { GET, POST, DELETE } from "./route";
import { NextRequest } from "next/server";

function post() {
  return new NextRequest("http://x/api/svi/evidence-completeness", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dimension: "ftv", evidenceType: "pitch_deck", evidenceLabel: "Deck" }),
  });
}
function del() {
  return new NextRequest("http://x/api/svi/evidence-completeness?dimension=ftv&evidenceType=pitch_deck", {
    method: "DELETE",
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ svi_snapshots: [], svi_dimension_evidence: [], svi_accounts: [] });
}

beforeEach(reset);

describeMemberAccess("GET /api/svi/evidence-completeness", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(),
});

describeMemberAccess("POST /api/svi/evidence-completeness", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(post()),
  skipNoProject: true, // 400 "No project found" is the pre-existing contract
});

describeMemberAccess("DELETE /api/svi/evidence-completeness", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => DELETE(del()),
  skipNoProject: true,
});

describe("/api/svi/evidence-completeness — project key", () => {
  it("DELETE as editor targets the shared project id", async () => {
    scopeState.role = "editor";
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("svi_dimension_evidence", "project_id", "proj-1")).toBe(true);
  });

  it("DELETE as viewer: 403 and nothing deleted", async () => {
    scopeState.role = "viewer";
    const res = await DELETE(del());
    expect(res.status).toBe(403);
    expect(db.sb!.find("svi_dimension_evidence", "delete")).toEqual([]);
  });
});
