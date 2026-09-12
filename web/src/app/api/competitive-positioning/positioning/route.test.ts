// Colocated tests for /api/competitive-positioning/positioning — S18-A
// review P2-2.
//
// Before: the route trusted `?projectId=` / `body.projectId` (no membership
// check) and keyed every read/write on the CALLER's user id, so a member
// read nothing and POST wrote an orphan (member id, owner project) row.
// Now: GET is viewer+, POST is editor+, an explicit id goes through
// `assertProjectScope` (404 non-member / 403 below the role) and the data
// key is the project OWNER's user id.

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

const lib = vi.hoisted(() => ({
  getLatest: vi.fn(),
  save: vi.fn(),
  context: vi.fn(),
  matrix: vi.fn(),
}));
vi.mock("@/lib/competitive-positioning", () => ({
  getLatestPositioningStatement: (...a: unknown[]) => lib.getLatest(...a),
  savePositioningStatement: (...a: unknown[]) => lib.save(...a),
  getCompetitivePositioningContext: (...a: unknown[]) => lib.context(...a),
  buildAnonymizedCompetitiveMatrix: (...a: unknown[]) => lib.matrix(...a),
}));

const ai = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ callAI: (...a: unknown[]) => ai.callAI(...a) }));

import { GET, POST } from "./route";

function get(qs = "") {
  return new Request(`http://x/api/competitive-positioning/positioning${qs}`);
}
function post(body: unknown = {}) {
  return new Request("http://x/api/competitive-positioning/positioning", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  lib.getLatest.mockReset().mockResolvedValue({ id: "st-1", statement_text: "We're X for Y" });
  lib.save.mockReset().mockResolvedValue({ id: "st-2" });
  lib.context.mockReset().mockResolvedValue({
    competitors_analyzed: 2,
    total_features_extracted: 10,
    avg_parity_score: 50,
    avg_differentiation_score: 40,
    positioning_statement_generated: false,
    confidence_score: null,
  });
  lib.matrix.mockReset().mockResolvedValue({ competitors: [] });
  ai.callAI.mockReset().mockResolvedValue({
    text: JSON.stringify({ statement: "We're A for B, C", category: "A", targetSegment: "B", uniqueValueProp: "C" }),
  });
}
beforeEach(reset);

describeMemberAccess("GET /api/competitive-positioning/positioning", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(get()),
});
describeMemberAccess("POST /api/competitive-positioning/positioning", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(post({})),
  skipNoProject: true,
});

describe("/api/competitive-positioning/positioning — data key + explicit ids", () => {
  it("GET as viewer: statement read under the OWNER's user id for the project", async () => {
    scopeState.role = "viewer";
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(lib.getLatest).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-1");
  });

  it("GET as owner: keyed on the owner's own id", async () => {
    await GET(get());
    expect(lib.getLatest).toHaveBeenCalledWith(expect.objectContaining({ id: "user-caller" }), "proj-1");
  });

  it("GET with an explicit ?projectId the caller is NOT a member of → 404, no read", async () => {
    scopeState.nonMember = true;
    const res = await GET(get("?projectId=proj-foreign"));
    expect(res.status).toBe(404);
    expect(lib.getLatest).not.toHaveBeenCalled();
  });

  it("GET with an explicit ?projectId the caller is a member of → that project, owner-keyed", async () => {
    scopeState.role = "viewer";
    const res = await GET(get("?projectId=proj-explicit"));
    expect(res.status).toBe(200);
    expect(lib.getLatest).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-explicit");
  });

  it("GET with no project → { statement: null } and no read", async () => {
    scopeState.projectId = null;
    const res = await GET(get());
    expect(await res.json()).toEqual({ ok: true, statement: null });
    expect(lib.getLatest).not.toHaveBeenCalled();
  });

  it("POST as viewer: 403 before the AI call or any write", async () => {
    scopeState.role = "viewer";
    const res = await POST(post({}));
    expect(res.status).toBe(403);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(lib.save).not.toHaveBeenCalled();
  });

  it("POST as editor: context / matrix / save all keyed on the OWNER's user id (no orphan member-id row)", async () => {
    scopeState.role = "editor";
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(lib.context).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-1");
    expect(lib.matrix).toHaveBeenCalledWith(expect.objectContaining({ id: "user-owner" }), "proj-1");
    expect(lib.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-owner" }),
      "proj-1",
      expect.objectContaining({ text: "We're A for B, C", generatedBy: "ai" }),
    );
    expect(lib.save.mock.calls[0][0]).not.toMatchObject({ id: "user-caller" });
  });

  it("POST with an explicit body.projectId the caller is NOT a member of → 404, no AI, no write", async () => {
    scopeState.nonMember = true;
    const res = await POST(post({ projectId: "proj-foreign" }));
    expect(res.status).toBe(404);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(lib.save).not.toHaveBeenCalled();
  });

  it("POST with an explicit body.projectId as a viewer → 403", async () => {
    scopeState.role = "viewer";
    const res = await POST(post({ projectId: "proj-explicit" }));
    expect(res.status).toBe(403);
    expect(lib.save).not.toHaveBeenCalled();
  });

  it("POST with no project → 400, no AI call", async () => {
    scopeState.projectId = null;
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(ai.callAI).not.toHaveBeenCalled();
  });
});
