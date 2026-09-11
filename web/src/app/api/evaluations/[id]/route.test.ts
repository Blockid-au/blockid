// Route tests for PATCH/DELETE /api/evaluations/[id] (T0270).
//   * 401 anonymous; 404 when the caller does not hold the row;
//   * PATCH validates label/notes types (400) and forwards only those keys;
//   * DELETE reports project_kept:true (soft delete — projects row stays).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getEvaluationForUserMock = vi.fn();
const updateEvaluationMock = vi.fn();
const deleteEvaluationMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  getEvaluationForUser: (u: string, id: string) => getEvaluationForUserMock(u, id),
  updateEvaluation: (u: string, id: string, p: unknown) => updateEvaluationMock(u, id, p),
  deleteEvaluation: (u: string, id: string) => deleteEvaluationMock(u, id),
}));

import { DELETE, PATCH } from "./route";

const USER = { id: "u-1", email: "scout@fund.vc", plan: "investor_angel" };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/evaluations/e-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const del = () => new Request("http://localhost/api/evaluations/e-1", { method: "DELETE" });

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getEvaluationForUserMock.mockReset();
  updateEvaluationMock.mockReset();
  deleteEvaluationMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe("/api/evaluations/[id]", () => {
  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await PATCH(patch({ label: "x" }), ctx())).status).toBe(401);
    expect((await DELETE(del(), ctx())).status).toBe(401);
  });

  it("S8-C: PATCH / DELETE refuse browser cross-site requests before auth", async () => {
    const cross = new Request("http://localhost/api/evaluations/e-1", { method: "PATCH", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ label: "x" }) });
    expect((await PATCH(cross, ctx())).status).toBe(403);
    const crossDel = new Request("http://localhost/api/evaluations/e-1", { method: "DELETE", headers: { "sec-fetch-site": "cross-site" } });
    expect((await DELETE(crossDel, ctx())).status).toBe(403);
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(updateEvaluationMock).not.toHaveBeenCalled();
    expect(deleteEvaluationMock).not.toHaveBeenCalled();
    const big = await PATCH(patch({ notes: "n".repeat(70 * 1024) }), ctx());
    expect(big.status).toBe(413);
  });

  it("PATCH 400s non-string label / notes", async () => {
    expect((await PATCH(patch({ label: 42 }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ notes: {} }), ctx())).status).toBe(400);
    expect(updateEvaluationMock).not.toHaveBeenCalled();
  });

  it("PATCH 404s rows the caller does not hold", async () => {
    getEvaluationForUserMock.mockResolvedValue(null);
    const res = await PATCH(patch({ label: "x" }), ctx("e-other"));
    expect(res.status).toBe(404);
    expect(getEvaluationForUserMock).toHaveBeenCalledWith("u-1", "e-other");
    expect(updateEvaluationMock).not.toHaveBeenCalled();
  });

  it("PATCH forwards only label/notes and returns the updated row", async () => {
    getEvaluationForUserMock.mockResolvedValue({ id: "e-1" });
    updateEvaluationMock.mockResolvedValue({ id: "e-1", label: "Cohort 4", notes: null });
    const res = await PATCH(patch({ label: "Cohort 4", notes: null, owner_kind: "founder_claimed" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, evaluation: { id: "e-1", label: "Cohort 4", notes: null } });
    expect(updateEvaluationMock).toHaveBeenCalledWith("u-1", "e-1", { label: "Cohort 4", notes: null });
  });

  it("DELETE is soft and owner-scoped", async () => {
    deleteEvaluationMock.mockResolvedValue(true);
    const res = await DELETE(del(), ctx());
    expect(await res.json()).toEqual({ ok: true, deleted: "e-1", project_kept: true });
    expect(deleteEvaluationMock).toHaveBeenCalledWith("u-1", "e-1");

    deleteEvaluationMock.mockResolvedValue(false);
    expect((await DELETE(del(), ctx())).status).toBe(404);
  });
});
