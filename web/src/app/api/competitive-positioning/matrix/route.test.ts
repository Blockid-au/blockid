// Colocated tests for GET /api/competitive-positioning/matrix — S18-A
// review P2-2: viewer+ read, explicit `?projectId=` verified through
// `assertProjectScope` (404 non-member), data keyed on the project OWNER's
// user id so a member reads the same matrix as the owner.

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

const auth = vi.hoisted(() => ({
  user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const lib = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/competitive-positioning", () => ({
  getCompetitivePositioningContext: (...a: unknown[]) => lib.context(...a),
  computeMpcBoostFromCompetitiveAnalysis: () => 3,
  computeSvmBoostFromCompetitiveDifferentiation: () => 2,
}));

import { GET } from "./route";

function get(qs = "") {
  return new Request(`http://x/api/competitive-positioning/matrix${qs}`);
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  lib.context.mockReset().mockResolvedValue({
    competitors_analyzed: 2,
    total_features_extracted: 10,
    avg_parity_score: 50,
    avg_differentiation_score: 40,
    positioning_statement_generated: true,
    confidence_score: 0.8,
  });
}
beforeEach(reset);

describeMemberAccess("GET /api/competitive-positioning/matrix", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(get()),
});

describe("/api/competitive-positioning/matrix — data key + explicit ids", () => {
  it("viewer on a shared project: context computed under the OWNER's user id", async () => {
    scopeState.role = "viewer";
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(lib.context).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-1");
    expect(await res.json()).toMatchObject({ ok: true, mpcBoost: 3, svmBoost: 2, totalSviLift: 5 });
  });

  it("owner: keyed on the owner's own id", async () => {
    await GET(get());
    expect(lib.context).toHaveBeenCalledWith(expect.objectContaining({ id: "user-caller" }), "proj-1");
  });

  it("explicit ?projectId the caller is NOT a member of → 404, no compute", async () => {
    scopeState.nonMember = true;
    const res = await GET(get("?projectId=proj-foreign"));
    expect(res.status).toBe(404);
    expect(lib.context).not.toHaveBeenCalled();
  });

  it("explicit ?projectId the caller is a member of → that project, owner-keyed", async () => {
    scopeState.role = "editor";
    const res = await GET(get("?projectId=proj-explicit"));
    expect(res.status).toBe(200);
    expect(lib.context).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-explicit");
  });

  it("no project → zeroed context, no compute", async () => {
    scopeState.projectId = null;
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, totalSviLift: 0, context: { competitors_analyzed: 0 } });
    expect(lib.context).not.toHaveBeenCalled();
  });
});
