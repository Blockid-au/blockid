// G14-S38 — the four documented refusals of the evaluator API, in the
// documented order: 401 (bad key) → 429 (budget) → 402 (api.access lapsed)
// → 403 (scope). Pins that a spent key never reaches the entitlement read
// and that `evaluations:write` satisfies a read route.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/api-keys", () => ({ validateApiKey: vi.fn(), checkRateLimit: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ can: vi.fn() }));

import { authenticateV1, v1AuthFailureResponse, rateLimitHeaders, type V1AuthDeps } from "./auth";

const KEY = `bk_live_${"a".repeat(48)}`;
const RESET = new Date("2026-09-17T10:01:00.000Z");

function req(auth?: string): Request {
  return new Request("https://blockid.au/api/v1/evaluations", { headers: auth ? { authorization: auth } : {} });
}

function deps(over: Partial<V1AuthDeps> & { scopes?: string[]; allowed?: boolean; entitled?: boolean } = {}): V1AuthDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    validate: over.validate ?? (async () => {
      calls.push("validate");
      return { valid: true, userId: "u-eval", keyHash: "hash", rateLimitPerMin: 100, scopes: (over.scopes ?? ["analyze", "evaluations:read"]) as never, email: "k@example.com" };
    }),
    rateLimit: over.rateLimit ?? (async () => {
      calls.push("rateLimit");
      return { allowed: over.allowed ?? true, remaining: 41, resetAt: RESET };
    }),
    entitled: async () => {
      calls.push("entitled");
      return over.entitled ?? true;
    },
    readUser: over.readUser ?? (async () => {
      calls.push("readUser");
      return { plan: "investor_fund", email: "fund@example.com", account_type: "investor" };
    }),
    now: () => new Date("2026-09-17T10:00:37.000Z").getTime(),
  };
}

describe("authenticateV1", () => {
  it("401 for a missing header, a non-bk_live bearer, a wrong-length key and a revoked key — validate is only called for a well-formed key", async () => {
    const d = deps();
    expect((await authenticateV1(req(), "evaluations:read", d)).ok).toBe(false);
    expect((await authenticateV1(req("Bearer sk_live_xxx"), "evaluations:read", d)).ok).toBe(false);
    expect((await authenticateV1(req("Bearer bk_live_short"), "evaluations:read", d)).ok).toBe(false);
    expect(d.calls).toEqual([]);
    const revoked = deps({ validate: async () => ({ valid: false }) });
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", revoked);
    expect(r).toMatchObject({ ok: false, status: 401, code: "unauthorized" });
    expect(revoked.calls).toEqual([]);
  });

  it("429 when the per-minute budget is spent — Retry-After from resetAt, and the plan is NOT read", async () => {
    const d = deps({ allowed: false });
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", d);
    expect(r).toMatchObject({ ok: false, status: 429, code: "rate_limited", retryAfterSec: 23 });
    expect(d.calls).toEqual(["validate", "rateLimit"]);
    const res = v1AuthFailureResponse(r as Extract<typeof r, { ok: false }>);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("23");
  });

  it("402 plan_required when can(user,'api.access') is false — evaluated at every call with segment=investor", async () => {
    const d = deps({ entitled: false });
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", d);
    expect(r).toMatchObject({ ok: false, status: 402, code: "plan_required" });
    expect(d.calls).toEqual(["validate", "rateLimit", "readUser", "entitled"]);
    expect(v1AuthFailureResponse(r as never).status).toBe(402);
  });

  it("403 insufficient_scope when the key lacks the route scope; write implies read; the response names the scope", async () => {
    const analyzeOnly = deps({ scopes: ["analyze"] });
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", analyzeOnly);
    expect(r).toMatchObject({ ok: false, status: 403, code: "insufficient_scope", required: "evaluations:read" });
    const body = await v1AuthFailureResponse(r as never).json();
    expect(body.error.required_scope).toBe("evaluations:read");

    const readOnly = deps({ scopes: ["analyze", "evaluations:read"] });
    expect((await authenticateV1(req(`Bearer ${KEY}`), "evaluations:write", readOnly)).ok).toBe(false);
    const writer = deps({ scopes: ["analyze", "evaluations:write"] });
    expect((await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", writer)).ok).toBe(true);
  });

  it("ok → principal carries userId, plan, keyId (hash, never the key), scopes, account type and the rate-limit headers", async () => {
    const d = deps();
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.principal).toMatchObject({ userId: "u-eval", plan: "investor_fund", keyId: "hash", accountType: "investor", email: "fund@example.com" });
    expect(JSON.stringify(r.principal)).not.toContain(KEY);
    expect(rateLimitHeaders(r.principal)).toEqual({ "X-RateLimit-Limit": "100", "X-RateLimit-Remaining": "41", "X-RateLimit-Reset": String(Math.floor(RESET.getTime() / 1000)) });
  });

  it("a missing app_users row degrades to plan=free (the entitlement decides, never a throw)", async () => {
    const d = deps({ readUser: async () => null, entitled: false });
    const r = await authenticateV1(req(`Bearer ${KEY}`), "evaluations:read", d);
    expect(r).toMatchObject({ ok: false, status: 402 });
  });
});
