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

// G14-S36 / D4 — the founder's confidenceLevel is capped at document_uploaded.
describe("/api/svi/evidence-completeness — confidence cap (S36)", () => {
  function postWith(confidenceLevel: string) {
    return new NextRequest("http://x/api/svi/evidence-completeness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dimension: "lco", evidenceType: "abn_registration", evidenceLabel: "ABN", confidenceLevel }),
    });
  }

  it("a founder POST of third_party_verified is stored as document_uploaded with the verification withdrawn", async () => {
    scopeState.role = "editor";
    const res = await POST(postWith("third_party_verified"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, confidenceLevel: "document_uploaded", requestedConfidenceLevel: "third_party_verified", confidenceCapped: true });
    const upserts = db.sb!.find("svi_dimension_evidence", "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args[0]).toMatchObject({ confidence_level: "document_uploaded", is_verified: false, verified_at: null, verified_by_user_id: null });
  });

  it("a lower level (public_url) is kept and reported as not capped", async () => {
    scopeState.role = "editor";
    const res = await POST(postWith("public_url"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ confidenceLevel: "public_url", confidenceCapped: false });
  });

  it("GET returns the per-row verification state (id, level, review_status) alongside the completeness", async () => {
    db.sb = fakeSupabase({
      svi_snapshots: [],
      svi_accounts: [],
      svi_dimension_evidence: [
        { id: "ev-1", project_id: "proj-1", dimension: "lco", evidence_type: "abn_registration", confidence_level: "document_uploaded", is_verified: false, review_status: "pending" },
        { id: "ev-2", project_id: "proj-1", dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "public_url", is_verified: false },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projectId).toBe("proj-1");
    expect(json.rows).toEqual([
      expect.objectContaining({ id: "ev-1", projectId: "proj-1", dimension: "lco", confidence_level: "document_uploaded", is_verified: false, review_status: "pending" }),
      expect.objectContaining({ id: "ev-2", review_status: "none", review_note: null }),
    ]);
  });
});
