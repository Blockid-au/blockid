// G14-S38 — GET /api/v1/evaluations. Real `authenticateV1` over mocked
// api-keys / entitlements (401 · 429 · 402 · 403), query validation (400,
// limit ≤ 100), and the page is read for the KEY OWNER through
// listEvaluationsV1 (never another user id). Rate-limit headers on 200.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const validateMock = vi.fn();
const rateLimitMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({ validateApiKey: (k: string) => validateMock(k), checkRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));
const canMock = vi.fn(async () => true);
vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...(a as [])) }));
const listMock = vi.fn();
vi.mock("@/lib/api-v1/evaluations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-v1/evaluations")>()),
  listEvaluationsV1: (...a: unknown[]) => listMock(...(a as [])),
}));

import { dynamic, runtime, GET } from "./route";

const KEY = `bk_live_${"d".repeat(48)}`;
type Req = Parameters<typeof GET>[0];
function req(qs = "", auth: string | null = `Bearer ${KEY}`): Req {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  const r = new Request(`http://localhost/api/v1/evaluations${qs}`, { headers }) as unknown as Req & { nextUrl: URL };
  r.nextUrl = new URL(`http://localhost/api/v1/evaluations${qs}`);
  return r;
}
const PAGE = { data: [{ id: "ev-1" }], next_cursor: null, has_more: false, meta: { fit_source: "no_mandate", mandate_id: null } };

beforeEach(() => {
  validateMock.mockReset().mockResolvedValue({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:read"] });
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 42, resetAt: new Date(Date.now() + 30_000) });
  canMock.mockReset().mockResolvedValue(true);
  listMock.mockReset().mockResolvedValue(PAGE);
});

describe("module", () => {
  it("force-dynamic + nodejs", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
  });
});

describe("auth ladder", () => {
  it("401 bad key · 429 budget (Retry-After) · 402 plan · 403 scope — the list is never read on a refusal", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    validateMock.mockResolvedValueOnce({ valid: false });
    expect((await GET(req())).status).toBe(401);
    rateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(Date.now() + 5_000) });
    const limited = await GET(req());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    canMock.mockResolvedValueOnce(false);
    expect((await GET(req())).status).toBe(402);
    validateMock.mockResolvedValueOnce({ valid: true, userId: "u-eval", keyHash: "hash-1", rateLimitPerMin: 100, scopes: ["analyze"] });
    const scoped = await GET(req());
    expect(scoped.status).toBe(403);
    expect((await scoped.json()).error.code).toBe("insufficient_scope");
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe("query + page", () => {
  it("400 invalid_query for limit > 100, a bad cursor or an out-of-range stage", async () => {
    for (const qs of ["?limit=101", "?limit=0", "?cursor=***", "?stage=99", "?min_fit=200"]) {
      const res = await GET(req(qs));
      expect(res.status, qs).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_query");
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it("200 → page for the KEY OWNER with the parsed filters; rate-limit headers; private no-store", async () => {
    const res = await GET(req("?limit=10&industry=Fintech&stage=3&min_fit=40"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: [{ id: "ev-1" }], has_more: false, meta: { fit_source: "no_mandate" } });
    expect(listMock).toHaveBeenCalledWith("u-eval", { limit: 10, cursor: null, industry: "Fintech", stage: 3, min_fit: 40 });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("42");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
