// Route tests for /api/evaluations/[id]/assessment/share (G13-W4-D2, S-D2).
//   * 401 / 404 (never 403) for strangers, lapsed seats and founder callers
//     on both verbs;
//   * POST: the allow-list is enforced at the boundary (Zod: `decision`,
//     `private_notes`, empty list → 400 with paths), 409 when nothing is
//     saved yet, 200 echoes shared_with_founder_at + shared_fields + the
//     founder projection;
//   * DELETE: 200 { revoked } through the lib; both handlers apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveAccessMock(id, uid) }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const shareMock = vi.fn();
const revokeMock = vi.fn();
vi.mock("@/lib/evaluations/assessments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/assessments")>()),
  shareAssessment: (...a: unknown[]) => shareMock(...a),
  revokeAssessmentShare: (...a: unknown[]) => revokeMock(...a),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { DELETE, POST } from "./route";

const USER = { id: "u-eval", email: "scout@fund.vc", plan: "investor_angel" };
const ACCESS = { evaluation: { id: "e-1" }, project: { id: "p-1" }, role: "assessor" as const };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://localhost/api/evaluations/e-1/assessment/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = () => new Request("http://localhost/api/evaluations/e-1/assessment/share", { method: "DELETE" });
const PREVIEW = { id: "a-1", evaluationId: "e-1", version: 1, sharedWithFounderAt: "2026-09-16T00:00:00Z", sharedFields: ["risks"], risks: [] };

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  shareMock.mockReset().mockResolvedValue({ ok: true, assessment: { sharedWithFounderAt: "2026-09-16T00:00:00Z", sharedFields: ["risks"] }, founderPreview: PREVIEW });
  revokeMock.mockReset().mockResolvedValue({ ok: true, revoked: 1 });
});

describe("access", () => {
  it("401 anonymous, 404 stranger / lapsed seat / founder on both verbs", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ fields: ["risks"] }), ctx())).status).toBe(401);
    expect((await DELETE(del(), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    resolveAccessMock.mockResolvedValue(null);
    expect((await POST(post({ fields: ["risks"] }), ctx())).status).toBe(404);
    expect((await DELETE(del(), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    expect((await POST(post({ fields: ["risks"] }), ctx())).status).toBe(404);
    expect((await DELETE(del(), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue(ACCESS);
    isEvaluatorMock.mockResolvedValue(false);
    expect((await POST(post({ fields: ["risks"] }), ctx())).status).toBe(404);
    expect(shareMock).not.toHaveBeenCalled();
    expect(revokeMock).not.toHaveBeenCalled();
  });
});

describe("POST share", () => {
  it("wrapped", () => {
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(DELETE)).toBe(true);
  });

  it("enforces the allow-list at the boundary: decision / private_notes / empty → 400 with paths", async () => {
    for (const fields of [["decision"], ["private_notes"], ["risks", "conviction"], []]) {
      const res = await POST(post({ fields }), ctx());
      expect(res.status, JSON.stringify(fields)).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_body");
      expect(body.issues[0].path).toMatch(/^fields/);
    }
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("200 echoes the stored share + the founder projection; the lib gets the caller as assessor", async () => {
    const res = await POST(post({ fields: ["risks", "shared_notes"] }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, shared_with_founder_at: "2026-09-16T00:00:00Z", shared_fields: ["risks"], founder_preview: PREVIEW });
    expect(shareMock).toHaveBeenCalledWith({ evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval" }, ["risks", "shared_notes"]);
  });

  it("409 nothing_to_share when no row is saved yet; 503 while 0392 is missing", async () => {
    shareMock.mockResolvedValue({ ok: false, error: "not_found", message: "Save an assessment before sharing it" });
    const res = await POST(post({ fields: ["risks"] }), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "nothing_to_share", message: "Save an assessment before sharing it" });
    shareMock.mockResolvedValue({ ok: false, error: "unavailable", message: "x" });
    expect((await POST(post({ fields: ["risks"] }), ctx())).status).toBe(503);
  });
});

describe("DELETE revoke", () => {
  it("200 { revoked } through the lib", async () => {
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revoked: 1 });
    expect(revokeMock).toHaveBeenCalledWith({ evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval" });
  });
});
