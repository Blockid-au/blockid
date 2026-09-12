// Colocated vitest for DELETE /api/evidence/dim/[id] — release QA-4 P2-e.
//
// The owner check used to select `projects.owner_id` (no such column) and so
// denied everyone. It now goes through assertProjectAccess(editor): owner
// allowed, other user 404, viewer-only member 403, and the delete never
// runs when access is refused.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertProjectAccessMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  assertProjectAccess: (...a: unknown[]) => assertProjectAccessMock(...a),
}));

const assessMock = vi.fn(async () => ({ score: 42 }));
vi.mock("@/lib/computeEvidenceCompleteness", () => ({
  assessEvidenceQuality: (...a: unknown[]) => assessMock(...a),
}));

const deleteEq = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn((table: string) => {
  if (table === "svi_dimension_evidence") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "ev-1", project_id: "proj-1" }, error: null }) }),
      }),
      delete: () => ({ eq: deleteEq }),
    };
  }
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

class AccessErr extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProjectAccessError";
    this.code = code;
  }
}

import { DELETE } from "./route";

const call = (id = "ev-1") =>
  DELETE(new Request(`http://x/api/evidence/dim/${id}`, { method: "DELETE" }) as unknown as NextRequest, {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "owner-1", email: "o@x.co" });
  assertProjectAccessMock.mockReset().mockResolvedValue({ role: "owner", isOwner: true });
  deleteEq.mockClear();
  assessMock.mockClear();
});

describe("DELETE /api/evidence/dim/[id] — access", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(assertProjectAccessMock).not.toHaveBeenCalled();
  });

  it("owner: access checked at editor on the row's project, row deleted, completeness recomputed", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(assertProjectAccessMock).toHaveBeenCalledWith("owner-1", "proj-1", "editor");
    expect(deleteEq).toHaveBeenCalledWith("id", "ev-1");
    expect(assessMock).toHaveBeenCalledWith("proj-1");
    expect((await res.json()).completeness).toEqual({ score: 42 });
  });

  it("other user (non-member) → 404, nothing deleted", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger", email: "s@x.co" });
    assertProjectAccessMock.mockRejectedValue(new AccessErr("not_found"));
    const res = await call();
    expect(res.status).toBe(404);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it("viewer-only member → 403, nothing deleted", async () => {
    assertProjectAccessMock.mockRejectedValue(new AccessErr("forbidden"));
    const res = await call();
    expect(res.status).toBe(403);
    expect(deleteEq).not.toHaveBeenCalled();
  });
});
