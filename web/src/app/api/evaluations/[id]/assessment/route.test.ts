// Route tests for /api/evaluations/[id]/assessment (G13-W4-D2, S-D2).
//   * 401 anonymous; 404 (never 403) for malformed ids (no DB call), rows
//     the caller cannot access, a lapsed evaluator seat, and a FOUNDER
//     trying to PUT;
//   * GET: assessor gets mine + history (+ prefill only when asked and
//     empty); founder gets ONLY the shared projection;
//   * PUT: Zod issue paths on a bad body, 413 over the cap, 422 for
//     missing decision / conviction on submit, 503 while 0392 is missing,
//     200 with the saved row; the lib is called with the evaluation's ids
//     and the caller as assessor; the handler is apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveAccessMock(id, uid) }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const getAssessmentMock = vi.fn();
const upsertMock = vi.fn();
vi.mock("@/lib/evaluations/assessments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/assessments")>()),
  getAssessment: (...a: unknown[]) => getAssessmentMock(...a),
  upsertAssessment: (...a: unknown[]) => upsertMock(...a),
}));
const prefillMock = vi.fn(async () => ({ seeded: true, thesisFitPct: 70 }));
vi.mock("@/lib/evaluations/assessment-prefill", () => ({ prefillFromFit: (...a: unknown[]) => prefillMock(...(a as [])) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
// S-D3: the write stamps the seat's acting org (null here — no org tables in the test).
const actingOrgMock = vi.fn(async (): Promise<{ id: string } | null> => null);
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: () => actingOrgMock() }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { GET, PUT } from "./route";

const USER = { id: "u-eval", email: "scout@fund.vc", plan: "investor_angel" };
const ACCESS = { evaluation: { id: "e-1" }, project: { id: "p-1" }, role: "assessor" as const };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const get = (id = "e-1", qs = "") => new Request(`http://localhost/api/evaluations/${id}/assessment${qs}`);
const put = (body: unknown, id = "e-1") =>
  new Request(`http://localhost/api/evaluations/${id}/assessment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ROW = { id: "a-1", version: 1, status: "draft", decision: null, updatedAt: "2026-09-16T00:00:00Z" };

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  getAssessmentMock.mockReset().mockResolvedValue({ available: true, mine: ROW, history: [ROW], sharedWithFounder: null });
  upsertMock.mockReset().mockResolvedValue({ ok: true, assessment: ROW, created: true, version: 1, history: [ROW] });
  prefillMock.mockClear();
});

describe("access", () => {
  it("401 anonymous; 404 malformed id without a lookup; 404 stranger; 404 lapsed evaluator seat", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET(get(), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    expect((await GET(get("e 1"), ctx("e 1"))).status).toBe(404);
    expect(resolveAccessMock).not.toHaveBeenCalled();
    resolveAccessMock.mockResolvedValue(null);
    const stranger = await GET(get(), ctx());
    expect(stranger.status).toBe(404);
    expect(await stranger.json()).toEqual({ ok: false, error: "not_found" });
    resolveAccessMock.mockResolvedValue(ACCESS);
    isEvaluatorMock.mockResolvedValue(false);
    expect((await PUT(put({ conviction: 3 }), ctx())).status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("a claimed founder may GET the shared projection only and never PUT (404, not 403)", async () => {
    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    getAssessmentMock.mockResolvedValue({ available: true, mine: null, history: [], sharedWithFounder: { id: "a-1", version: 1, sharedFields: ["risks"], risks: [] } });
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, role: "founder", available: true, sharedWithFounder: { id: "a-1", version: 1, sharedFields: ["risks"], risks: [] } });
    expect(getAssessmentMock).toHaveBeenCalledWith("e-1", { userId: "u-eval", role: "founder" });
    expect(isEvaluatorMock).not.toHaveBeenCalled();
    const write = await PUT(put({ conviction: 3 }), ctx());
    expect(write.status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("assessor: mine + history, private no-store; prefill only with ?prefill=1 and only when there is no row", async () => {
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toMatchObject({ ok: true, role: "assessor", assessment: ROW, history: [ROW], prefill: null });
    expect(prefillMock).not.toHaveBeenCalled();
    await GET(get("e-1", "?prefill=1"), ctx());
    expect(prefillMock).not.toHaveBeenCalled(); // a row exists
    getAssessmentMock.mockResolvedValue({ available: true, mine: null, history: [], sharedWithFounder: null });
    const empty = await GET(get("e-1", "?prefill=1"), ctx());
    expect((await empty.json()).prefill).toEqual({ seeded: true, thesisFitPct: 70 });
    expect(prefillMock).toHaveBeenCalledWith({ userId: "u-eval", projectId: "p-1" });
  });
});

describe("PUT", () => {
  it("is apiRoute-wrapped", () => {
    expect(isAuditedHandler(PUT)).toBe(true);
  });

  it("400 invalid JSON; 400 Zod issues with paths; 413 over the byte cap", async () => {
    expect((await PUT(put("{nope"), ctx())).status).toBe(400);
    const bad = await PUT(put({ decision: "maybe", dimension_ratings: { TRE: { rating: 7, stance: "agree" } }, junk: 1 }), ctx());
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.error).toBe("invalid_body");
    expect(body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(["decision", "dimension_ratings.TRE.rating"]));
    const huge = await PUT(put({ private_notes: "x".repeat(70_000) }), ctx());
    expect(huge.status).toBe(413);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("200 saves through the lib with the evaluation's ids and the caller as assessor", async () => {
    const res = await PUT(put({ status: "draft", conviction: 3, dimension_ratings: { TRE: { rating: 4, stance: "agree" } } }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assessment: ROW, created: true, version: 1, history: [ROW] });
    expect(upsertMock).toHaveBeenCalledWith({ evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval", orgId: null }, { status: "draft", conviction: 3, dimension_ratings: { TRE: { rating: 4, stance: "agree" } } });
  });

  it("422 missing_decision / missing_conviction on submit; 503 while 0392 is missing; 500 db_error", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: "missing_decision", message: "Choose pass / track / proceed" });
    const r1 = await PUT(put({ status: "submitted" }), ctx());
    expect(r1.status).toBe(422);
    expect(await r1.json()).toEqual({ ok: false, error: "missing_decision", message: "Choose pass / track / proceed" });
    upsertMock.mockResolvedValue({ ok: false, error: "missing_conviction", message: "Rate your conviction 1–5" });
    expect((await PUT(put({ status: "submitted", decision: "pass" }), ctx())).status).toBe(422);
    upsertMock.mockResolvedValue({ ok: false, error: "unavailable", message: "not yet" });
    expect((await PUT(put({ conviction: 1 }), ctx())).status).toBe(503);
    upsertMock.mockResolvedValue({ ok: false, error: "db_error", message: "boom" });
    expect((await PUT(put({ conviction: 1 }), ctx())).status).toBe(500);
  });
});
