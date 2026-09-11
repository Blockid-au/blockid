// Route tests for GET/POST /api/evaluations (T0270). Pins:
//   1. Anonymous → 401 auth_required, nothing else called.
//   2. Non-evaluator (no dealflow flag, founder account) → 402 feature_locked
//      + recordGateHit(..., "api"); no list / create call.
//   3. GET → 200 { ok, evaluations, used, limit }.
//   4. POST invalid JSON → 400; invalid_input → 400.
//   5. POST limit reached → 402 evaluation_limit_reached with limit/used.
//   6. POST happy path → 201 with evaluation, invite_sent, used, limit.
// The lib is mocked — its behaviour has its own colocated suite.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => unknown>(() => null));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  recordGateHit: (u: unknown, f: string, s: string) => recordGateHitMock(u, f, s),
}));

const isEvaluatorUserMock = vi.fn();
const listEvaluationsMock = vi.fn();
const getEvaluationQuotaMock = vi.fn();
const createEvaluationMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({
  isEvaluatorUser: (u: unknown) => isEvaluatorUserMock(u),
  listEvaluations: (id: string) => listEvaluationsMock(id),
  getEvaluationQuota: (u: unknown) => getEvaluationQuotaMock(u),
  createEvaluation: (u: unknown, i: unknown) => createEvaluationMock(u, i),
}));

import { CREATE_RATE_MAX, CREATE_RATE_WINDOW_MS, GET, POST, dynamic } from "./route";

const USER = { id: "u-1", email: "scout@fund.vc", plan: "investor_angel", displayName: "Sam" };

function post(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/evaluations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  recordGateHitMock.mockReset();
  isEvaluatorUserMock.mockReset();
  listEvaluationsMock.mockReset();
  getEvaluationQuotaMock.mockReset();
  createEvaluationMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  isEvaluatorUserMock.mockResolvedValue(true);
  getEvaluationQuotaMock.mockResolvedValue({ used: 1, limit: 25 });
});

describe("/api/evaluations", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401s anonymous callers on both verbs", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const g = await GET();
    expect(g.status).toBe(401);
    const p = await POST(post({ name: "Acme" }));
    expect(p.status).toBe(401);
    expect(isEvaluatorUserMock).not.toHaveBeenCalled();
    expect(createEvaluationMock).not.toHaveBeenCalled();
  });

  it("S8-C: GET is private/no-store; POST caps the body at 16 KB and rate-limits per user (cross-site refusal moved to the S9-A proxy gate — src/proxy.test.ts)", async () => {
    listEvaluationsMock.mockResolvedValue([]);
    const g = await GET();
    expect(g.headers.get("cache-control")).toBe("private, no-store");

    enforceRateLimitMock.mockClear();
    enforceRateLimitMock.mockReturnValueOnce(new Response("{}", { status: 429 }));
    expect((await POST(post({ name: "Acme" }))).status).toBe(429);
    expect(enforceRateLimitMock).toHaveBeenCalledWith("evaluations-create", "u-1", expect.any(Request), CREATE_RATE_MAX, CREATE_RATE_WINDOW_MS);
    expect(createEvaluationMock).not.toHaveBeenCalled();

    const big = await POST(post({ name: "Acme", description: "x".repeat(20 * 1024) }));
    expect(big.status).toBe(413);
    expect(createEvaluationMock).not.toHaveBeenCalled();
  });

  it("402s non-evaluators and records the gate hit", async () => {
    isEvaluatorUserMock.mockResolvedValue(false);
    const res = await POST(post({ name: "Acme" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ ok: false, error: "feature_locked", feature: "investor.dealflow" });
    expect(recordGateHitMock).toHaveBeenCalledWith(
      { id: "u-1", plan: "investor_angel", segment: "investor" },
      "investor.dealflow",
      "api",
    );
    expect(createEvaluationMock).not.toHaveBeenCalled();
    expect(listEvaluationsMock).not.toHaveBeenCalled();
  });

  it("GET lists the caller's evaluations with the plan quota", async () => {
    listEvaluationsMock.mockResolvedValue([{ id: "e-1", projectName: "Acme" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      evaluations: [{ id: "e-1", projectName: "Acme" }],
      used: 1,
      limit: 25,
    });
    expect(listEvaluationsMock).toHaveBeenCalledWith("u-1");
  });

  it("POST 400s invalid JSON and invalid input", async () => {
    const bad = await POST(post("{not json", true));
    expect(bad.status).toBe(400);
    expect(createEvaluationMock).not.toHaveBeenCalled();

    createEvaluationMock.mockResolvedValue({ ok: false, error: "invalid_input", message: "Startup name is required" });
    const res = await POST(post({ name: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_input", message: "Startup name is required" });
  });

  it("POST 402s with the plan's limit when evaluation_limit_reached", async () => {
    createEvaluationMock.mockResolvedValue({
      ok: false, error: "evaluation_limit_reached", limit: 25, used: 25, message: "Your plan tracks up to 25 startups. Upgrade to add more.",
    });
    const res = await POST(post({ name: "Acme" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: "evaluation_limit_reached", limit: 25, used: 25 });
  });

  it("POST 201s on the happy path and forwards the body to the lib", async () => {
    createEvaluationMock.mockResolvedValue({
      ok: true,
      evaluation: { id: "e-1", projectName: "Acme", ownerKind: "founder_invited" },
      inviteSent: true,
      used: 2,
      limit: 25,
    });
    const res = await POST(post({ name: "Acme", founder_email: "jo@acme.io", state: "NSW" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      evaluation: { id: "e-1", projectName: "Acme", ownerKind: "founder_invited" },
      invite_sent: true,
      used: 2,
      limit: 25,
    });
    expect(createEvaluationMock).toHaveBeenCalledWith(USER, { name: "Acme", founder_email: "jo@acme.io", state: "NSW" });
  });
});
