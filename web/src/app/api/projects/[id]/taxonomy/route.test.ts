// Route tests for /api/projects/[id]/taxonomy (G13-W4-D2 E1.4).
//   * 401 anonymous; 404 non-member (existence not confirmed); 403 viewer on
//     PATCH; GET is viewer+;
//   * PATCH body: Zod with issue paths (bad enum, protected-tag typo,
//     unknown key, missing confirm); the store gets the parsed body + the
//     caller as founder (or evaluator for an evaluator persona);
//   * 200 echoes the row + changed / dropped protected tags / locked fields
//     / unclassified count; store errors map to 400 / 503 / 500; the PATCH
//     handler is apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const assertAccessMock = vi.fn();
vi.mock("@/lib/projects", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/projects")>();
  return { ...orig, assertProjectAccess: (...a: unknown[]) => assertAccessMock(...a) };
});
const isEvaluatorMock = vi.fn(async () => false);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const confirmMock = vi.fn();
const getTaxonomyMock = vi.fn();
vi.mock("@/lib/taxonomy/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taxonomy/store")>()),
  confirmTaxonomy: (...a: unknown[]) => confirmMock(...a),
  getTaxonomy: (...a: unknown[]) => getTaxonomyMock(...a),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null, isSupabaseConfigured: () => false }));

import { ProjectAccessError } from "@/lib/projects";
import { isAuditedHandler } from "@/lib/audit/api-route";
import { GET, PATCH } from "./route";

const USER = { id: "u-1", email: "jo@acme.io", plan: "free" };
const ctx = (id = "p-1") => ({ params: Promise.resolve({ id }) });
const get = () => new Request("http://localhost/api/projects/p-1/taxonomy");
const patch = (body: unknown) => new Request("http://localhost/api/projects/p-1/taxonomy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ROW = { project_id: "p-1", industry: "fintech", business_model: "unclassified", customer_types: ["b2b"], stage_key: "seed", tags: [], sources: { industry: "founder" }, confidence: {}, suggested: { industry: "fintech" }, confirmed_at: "2026-09-16T00:00:00Z", confirmed_by: "u-1" };

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  assertAccessMock.mockReset().mockResolvedValue({ role: "owner" });
  isEvaluatorMock.mockReset().mockResolvedValue(false);
  confirmMock.mockReset().mockResolvedValue({ ok: true, row: ROW, changed: ["industry"], droppedProtectedTags: [], lockedByFounder: [], unclassifiedCount: 1 });
  getTaxonomyMock.mockReset().mockResolvedValue(ROW);
});

describe("access", () => {
  it("401 anonymous; 404 non-member; 403 viewer on PATCH; GET allows viewers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET(get(), ctx())).status).toBe(401);
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    assertAccessMock.mockRejectedValue(new ProjectAccessError("nope", "not_found"));
    expect((await GET(get(), ctx())).status).toBe(404);
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(404);
    assertAccessMock.mockRejectedValue(new ProjectAccessError("viewer", "forbidden"));
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(403);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(assertAccessMock).toHaveBeenLastCalledWith("u-1", "p-1", "editor");
  });
});

describe("GET", () => {
  it("returns the row with confirmed flag + unclassified count; null row → 3 unclassified", async () => {
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, taxonomy: ROW, suggested: { industry: "fintech" }, confirmed: true, unclassified_count: 1 });
    expect(assertAccessMock).toHaveBeenCalledWith("u-1", "p-1", "viewer");
    getTaxonomyMock.mockResolvedValue(null);
    expect(await (await GET(get(), ctx())).json()).toEqual({ ok: true, taxonomy: null, suggested: null, confirmed: false, unclassified_count: 3 });
  });
});

describe("PATCH", () => {
  it("is apiRoute-wrapped", () => {
    expect(isAuditedHandler(PATCH)).toBe(true);
  });

  it("400 with Zod issue paths: bad enum, unknown tag, unknown key, missing confirm, invalid JSON", async () => {
    const cases: Array<[unknown, string]> = [
      [{ industry: "crypto", confirm: true }, "industry"],
      [{ tags: ["female_founder"], confirm: true }, "tags.0"],
      [{ confirm: true, nope: 1 }, ""],
      [{ industry: "fintech" }, "confirm"],
    ];
    for (const [body, path] of cases) {
      const res = await PATCH(patch(body), ctx());
      expect(res.status, JSON.stringify(body)).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("invalid_body");
      if (path) expect(json.issues.map((i: { path: string }) => i.path)).toContain(path);
    }
    expect((await PATCH(patch("{bad"), ctx())).status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("200: parsed body + founder actor reach the store; the response echoes the store result", async () => {
    const res = await PATCH(patch({ industry: "fintech", not_sure: ["business_model"], tags: ["female_founded"], confirm: true }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, taxonomy: ROW, changed: ["industry"], dropped_protected_tags: [], locked_by_founder: [], unclassified_count: 1, source: "founder" });
    expect(confirmMock).toHaveBeenCalledWith("p-1", { industry: "fintech", not_sure: ["business_model"], tags: ["female_founded"], confirm: true }, { userId: "u-1", source: "founder" });
  });

  it("an evaluator persona writes with source evaluator (T2)", async () => {
    isEvaluatorMock.mockResolvedValue(true);
    const res = await PATCH(patch({ industry: "agtech_food", confirm: false }), ctx());
    expect((await res.json()).source).toBe("evaluator");
    expect(confirmMock).toHaveBeenCalledWith("p-1", { industry: "agtech_food", confirm: false }, { userId: "u-1", source: "evaluator" });
  });

  it("store errors map to 400 invalid / 503 unavailable / 500 db_error", async () => {
    confirmMock.mockResolvedValue({ ok: false, error: "invalid", message: "Invalid value for industry" });
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(400);
    confirmMock.mockResolvedValue({ ok: false, error: "unavailable", message: "x" });
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(503);
    confirmMock.mockResolvedValue({ ok: false, error: "db_error", message: "x" });
    expect((await PATCH(patch({ confirm: true }), ctx())).status).toBe(500);
  });
});
