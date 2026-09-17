// G14-S38 — /api/v1/evaluations/{id}/assessment. The real `authenticateV1`
// runs over mocked api-keys / entitlements so every documented refusal is
// exercised end-to-end (401 · 429 · 402 · 403 · 404); the loaders are
// mocked at the same seams the session route test uses. Pins:
//   * a founder-owned key (the row's founder, not its evaluator) gets 404
//     — never the assessment, never 403;
//   * GET reads through getAssessment with the assessor viewer;
//   * POST and PUT both delegate to upsertAssessment with the key owner as
//     assessor + the project name (webhook copy) — no bypass of validation
//     (400 with issue paths) or of the 422 submit rules;
//   * both mutations are apiRoute-wrapped; rate-limit headers on 200.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const validateMock = vi.fn();
const rateLimitMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({ validateApiKey: (k: string) => validateMock(k), checkRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));
const canMock = vi.fn(async () => true);
vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...(a as [])) }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/assessment-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/assessment-access")>()),
  resolveAssessmentAccess: (...a: unknown[]) => resolveAccessMock(...(a as [])),
}));
const getAssessmentMock = vi.fn();
const upsertMock = vi.fn();
vi.mock("@/lib/evaluations/assessments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/assessments")>()),
  getAssessment: (...a: unknown[]) => getAssessmentMock(...(a as [])),
  upsertAssessment: (...a: unknown[]) => upsertMock(...(a as [])),
}));
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: async () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { GET, POST, PUT } from "./route";

const KEY = `bk_live_${"c".repeat(48)}`;
const ACCESS = { evaluation: { id: "e-1" }, project: { id: "p-1", name: "Acme" }, role: "assessor" as const, viaOrgId: null };
const ROW = { id: "a-1", version: 1, status: "draft", decision: null, updatedAt: "2026-09-16T00:00:00Z" };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
type Req = Parameters<typeof GET>[0];
function req(method: string, body?: unknown, auth: string | null = `Bearer ${KEY}`, id = "e-1"): Req {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.authorization = auth;
  return new Request(`http://localhost/api/v1/evaluations/${id}/assessment`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }) as unknown as Req;
}

beforeEach(() => {
  validateMock.mockReset().mockResolvedValue({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:write"], email: "k@example.com" });
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date(Date.now() + 30_000) });
  canMock.mockReset().mockResolvedValue(true);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  getAssessmentMock.mockReset().mockResolvedValue({ available: true, mine: ROW, history: [ROW], sharedWithFounder: null });
  upsertMock.mockReset().mockResolvedValue({ ok: true, assessment: ROW, created: true, version: 1, history: [ROW] });
});

describe("auth ladder", () => {
  it("401 without a key / with a revoked key; 429 with Retry-After when the budget is spent; 402 when api.access lapsed; 403 without the scope", async () => {
    expect((await GET(req("GET", undefined, null), ctx())).status).toBe(401);
    validateMock.mockResolvedValueOnce({ valid: false });
    expect((await GET(req("GET"), ctx())).status).toBe(401);

    rateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(Date.now() + 10_000) });
    const limited = await GET(req("GET"), ctx());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    canMock.mockResolvedValueOnce(false);
    const lapsed = await GET(req("GET"), ctx());
    expect(lapsed.status).toBe(402);
    expect((await lapsed.json()).error.code).toBe("plan_required");

    validateMock.mockResolvedValue({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:read"] });
    const readOnly = await PUT(req("PUT", { decision: "pass" }), ctx());
    expect(readOnly.status).toBe(403);
    expect((await readOnly.json()).error.required_scope).toBe("evaluations:write");
    expect(upsertMock).not.toHaveBeenCalled();
    // read scope still serves GET
    expect((await GET(req("GET"), ctx())).status).toBe(200);
  });
});

describe("ownership", () => {
  it("404 for an unknown / malformed id (resolveAssessmentAccess → null) and for a FOUNDER-owned key (role=founder) — never 403, never the assessment", async () => {
    resolveAccessMock.mockResolvedValueOnce(null);
    expect((await GET(req("GET"), ctx())).status).toBe(404);

    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    const founderGet = await GET(req("GET"), ctx());
    expect(founderGet.status).toBe(404);
    expect(JSON.stringify(await founderGet.json())).not.toContain("a-1");
    expect(getAssessmentMock).not.toHaveBeenCalled();
    const founderPut = await PUT(req("PUT", { decision: "pass" }), ctx());
    expect(founderPut.status).toBe(404);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("resolves access with the KEY OWNER (plan + account type from the key), not a session", async () => {
    await GET(req("GET"), ctx());
    expect(resolveAccessMock).toHaveBeenCalledWith("e-1", expect.objectContaining({ id: "u-eval" }));
  });
});

describe("GET", () => {
  it("200 → own current row + history through getAssessment as assessor; rate-limit headers; no-store", async () => {
    const res = await GET(req("GET"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, available: true, assessment: ROW, history: [ROW] });
    expect(getAssessmentMock).toHaveBeenCalledWith("e-1", { userId: "u-eval", role: "assessor" });
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("99");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("POST | PUT", () => {
  it("both are apiRoute-wrapped", () => {
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(PUT)).toBe(true);
  });

  it("400 invalid JSON and 400 Zod issues with paths — upsert never reached", async () => {
    expect((await PUT(req("PUT", "{nope"), ctx())).status).toBe(400);
    const bad = await POST(req("POST", { conviction: 9 }), ctx());
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.error.code).toBe("invalid_body");
    expect(body.error.issues[0].path).toBe("conviction");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("delegates to upsertAssessment with the key owner as assessor + startup name; POST and PUT are aliases; 422 codes pass through", async () => {
    const res = await PUT(req("PUT", { decision: "track", conviction: 3 }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, created: true, version: 1 });
    expect(upsertMock).toHaveBeenCalledWith({ evaluationId: "e-1", projectId: "p-1", assessorUserId: "u-eval", orgId: null, startupName: "Acme" }, { decision: "track", conviction: 3 });

    upsertMock.mockResolvedValueOnce({ ok: false, error: "missing_decision", message: "Choose pass / track / proceed" });
    const submit = await POST(req("POST", { status: "submitted" }), ctx());
    expect(submit.status).toBe(422);
    expect((await submit.json()).error.code).toBe("missing_decision");
    upsertMock.mockResolvedValueOnce({ ok: false, error: "unavailable", message: "not yet" });
    expect((await POST(req("POST", {}), ctx())).status).toBe(503);
  });

  it("stamps the seat's org when the key owner acts via an org seat", async () => {
    resolveAccessMock.mockResolvedValueOnce({ ...ACCESS, viaOrgId: "org-9" });
    await PUT(req("PUT", { decision: "pass" }), ctx());
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ orgId: "org-9" });
  });
});
