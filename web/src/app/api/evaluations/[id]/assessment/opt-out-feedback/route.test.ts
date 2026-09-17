// Route tests for POST /api/evaluations/[id]/assessment/opt-out-feedback
// (G14-S34): 401 / 404 (never 403) for strangers, lapsed seats and founder
// callers; 400 on a non-boolean / extra key; 409 nothing_saved; 503 before
// 0404; 200 { opt_out, updated } through the store with the caller as the
// seat; audit carries the flag only; apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveAccessMock(id, uid) }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const setMock = vi.fn();
vi.mock("@/lib/evaluations/feedback-letter-store", () => ({ setFeedbackOptOut: (...a: unknown[]) => setMock(...a) }));
const auditMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/audit", () => ({ appendAudit: (a: unknown) => auditMock(a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { POST } from "./route";

const USER = { id: "u-eval", email: "scout@fund.vc", plan: "investor_angel" };
const ACCESS = { evaluation: { id: "e-1" }, project: { id: "p-1" }, role: "assessor" as const };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/api/evaluations/e-1/assessment/opt-out-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  setMock.mockReset().mockResolvedValue({ ok: true, optOut: true, updated: 2 });
  auditMock.mockClear();
});

describe("POST opt-out-feedback", () => {
  it("wrapped", () => {
    expect(isAuditedHandler(POST)).toBe(true);
  });

  it("401 anonymous; 404 stranger / founder caller / lapsed seat — the store is never touched", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ opt_out: true }), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    resolveAccessMock.mockResolvedValue(null);
    expect((await POST(post({ opt_out: true }), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    expect((await POST(post({ opt_out: true }), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue(ACCESS);
    isEvaluatorMock.mockResolvedValue(false);
    expect((await POST(post({ opt_out: true }), ctx())).status).toBe(404);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("400 on a non-boolean or an extra key", async () => {
    for (const body of [{ opt_out: "yes" }, { opt_out: true, decision: "pass" }, {}]) {
      const res = await POST(post(body), ctx());
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe("invalid_body");
    }
    expect(setMock).not.toHaveBeenCalled();
  });

  it("200 { opt_out, updated } — the store gets the evaluation + the CALLER as the seat; audit carries the flag only", async () => {
    const res = await POST(post({ opt_out: true }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, opt_out: true, updated: 2 });
    expect(setMock).toHaveBeenCalledWith("e-1", "u-eval", true);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-eval", action: "assessment.feedback_opt_out", resource_id: "e-1", detail: { evaluation_id: "e-1", project_id: "p-1", opt_out: true, versions: 2 } }));
    setMock.mockResolvedValue({ ok: true, optOut: false, updated: 1 });
    expect(await (await POST(post({ opt_out: false }), ctx())).json()).toEqual({ ok: true, opt_out: false, updated: 1 });
  });

  it("409 nothing_saved when the seat has no row; 503 while 0404 is missing", async () => {
    setMock.mockResolvedValue({ ok: false, error: "not_found", message: "Save an assessment before changing its feedback setting" });
    const res = await POST(post({ opt_out: true }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("nothing_saved");
    setMock.mockResolvedValue({ ok: false, error: "unavailable", message: "x" });
    expect((await POST(post({ opt_out: true }), ctx())).status).toBe(503);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
