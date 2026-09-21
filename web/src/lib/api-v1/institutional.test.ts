// G21 P3-B — the institutional API core: the auth ladder maps to the one
// envelope (401 · 402 · 403 · 429/min), the hourly budget (600 / key) adds
// its own 429 with Retry-After + hourly headers, every 200 / 304 writes an
// `institutional.read` audit row (key id, never the key) + the FI event,
// ETag round-trips to 304, Cache-Control is private, query parsing 400s
// with issues, ids are 404 never 400.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const validateMock = vi.fn();
const rateLimitMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({ validateApiKey: (k: string) => validateMock(k), checkRateLimit: (...a: unknown[]) => rateLimitMock(...(a as [])) }));
const canMock = vi.fn(async () => true);
vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...(a as [])) }));
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));
const fiMock = vi.fn();
vi.mock("@/lib/analytics/fi-events", () => ({ emitFiEvent: (...a: unknown[]) => fiMock(...(a as [])) }));
const hourlyMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => hourlyMock(...(a as [])) }));

import { z } from "zod";
import { INSTITUTIONAL_HOURLY_LIMIT, authenticateInstitutional, etagFor, etagMatches, institutionalOk, notFound, parseId, parseQuery, stageParam } from "./institutional";

const KEY = `bk_live_${"e".repeat(48)}`;
function req(path = "/api/v1/institutional/methodology", headers: Record<string, string> = {}, auth: string | null = `Bearer ${KEY}`): Request {
  const h: Record<string, string> = { ...headers };
  if (auth) h.authorization = auth;
  return new Request(`http://localhost${path}`, { headers: h });
}

beforeEach(() => {
  validateMock.mockReset().mockResolvedValue({ valid: true, userId: "u-inst", keyHash: "hash-inst", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:read"] });
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 42, resetAt: new Date(Date.now() + 30_000) });
  canMock.mockReset().mockResolvedValue(true);
  hourlyMock.mockReset().mockReturnValue({ allowed: true, remaining: 599, resetIn: 3_600_000 });
  auditMock.mockClear();
  fiMock.mockClear();
});

describe("authenticateInstitutional", () => {
  it("maps the evaluator ladder onto { ok:false, error, message }: 401 · 429/min (Retry-After) · 402 · 403", async () => {
    const anon = await authenticateInstitutional(req("/x", {}, null));
    expect(anon.ok).toBe(false);
    if (anon.ok) throw new Error("expected refusal");
    expect(anon.response.status).toBe(401);
    expect(await anon.response.json()).toMatchObject({ ok: false, error: "unauthorized" });

    rateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(Date.now() + 5_000) });
    const minute = await authenticateInstitutional(req());
    if (minute.ok) throw new Error("expected refusal");
    expect(minute.response.status).toBe(429);
    expect(minute.response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await minute.response.json()).toMatchObject({ ok: false, error: "rate_limited" });

    canMock.mockResolvedValueOnce(false);
    const plan = await authenticateInstitutional(req());
    if (plan.ok) throw new Error("expected refusal");
    expect(plan.response.status).toBe(402);
    expect(await plan.response.json()).toMatchObject({ ok: false, error: "plan_required" });

    validateMock.mockResolvedValueOnce({ valid: true, userId: "u-inst", keyHash: "hash-inst", rateLimitPerMin: 100, scopes: ["analyze"] });
    const scope = await authenticateInstitutional(req());
    if (scope.ok) throw new Error("expected refusal");
    expect(scope.response.status).toBe(403);
    expect(await scope.response.json()).toMatchObject({ ok: false, error: "insufficient_scope", required_scope: "evaluations:read" });
    expect(hourlyMock).not.toHaveBeenCalled();
  });

  it("applies the 600 / hour ceiling per key hash and refuses with Retry-After + hourly headers", async () => {
    const ok = await authenticateInstitutional(req());
    expect(ok.ok).toBe(true);
    expect(hourlyMock).toHaveBeenCalledWith("rl:institutional:hash-inst", INSTITUTIONAL_HOURLY_LIMIT, 3_600_000);
    if (ok.ok) expect(ok.principal.hourly).toMatchObject({ limit: 600, remaining: 599 });

    hourlyMock.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 120_000 });
    const spent = await authenticateInstitutional(req());
    if (spent.ok) throw new Error("expected refusal");
    expect(spent.response.status).toBe(429);
    expect(spent.response.headers.get("Retry-After")).toBe("120");
    expect(spent.response.headers.get("X-RateLimit-Limit")).toBe("600");
    expect(spent.response.headers.get("X-RateLimit-Window")).toBe("hour");
    expect(await spent.response.json()).toMatchObject({ ok: false, error: "rate_limited", retry_after_seconds: 120 });
  });
});

describe("institutionalOk", () => {
  it("200 with ETag + private cache + hourly headers, one audit row (key id, resource) and one FI event", async () => {
    const auth = await authenticateInstitutional(req());
    if (!auth.ok) throw new Error("auth");
    const res = await institutionalOk(req(), auth.principal, { data: { a: 1 } }, { resource: "methodology", resourceId: null, detail: { svi_version: "2.2.0" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(res.headers.get("ETag")).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("600");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.json()).toEqual({ ok: true, data: { a: 1 } });

    expect(auditMock).toHaveBeenCalledTimes(1);
    const row = auditMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: "u-inst", actor: "api", action: "institutional.read", resource_type: "methodology", resource_id: null });
    expect(row.detail).toMatchObject({ key_id: "hash-inst", route: "/api/v1/institutional/methodology", status: 200, svi_version: "2.2.0" });
    expect(JSON.stringify(row)).not.toContain(KEY);

    expect(fiMock).toHaveBeenCalledTimes(1);
    expect(fiMock.mock.calls[0]![0]).toBe("institutional_api_read");
    expect(fiMock.mock.calls[0]![1]).toMatchObject({ resource: "methodology", key_id: "hash-inst", channel: "api", status: 200 });
  });

  it("If-None-Match with the current ETag → 304 (still audited); a stale one → 200", async () => {
    const auth = await authenticateInstitutional(req());
    if (!auth.ok) throw new Error("auth");
    const body = { data: { a: 1 } };
    const etag = etagFor({ ok: true, ...body });
    const hit = await institutionalOk(req("/x", { "if-none-match": etag }), auth.principal, body, { resource: "methodology" });
    expect(hit.status).toBe(304);
    expect(hit.headers.get("ETag")).toBe(etag);
    expect((auditMock.mock.calls[0]![0] as { detail: { status: number } }).detail.status).toBe(304);
    const miss = await institutionalOk(req("/x", { "if-none-match": 'W/"stale"' }), auth.principal, body, { resource: "methodology" });
    expect(miss.status).toBe(200);
    expect(etagMatches('"abc", W/"def"', 'W/"def"')).toBe(true);
    expect(etagMatches("*", 'W/"def"')).toBe(true);
    expect(etagMatches(null, 'W/"def"')).toBe(false);
  });

  it("a failing audit ledger never fails the read", async () => {
    auditMock.mockRejectedValueOnce(new Error("ledger down"));
    const auth = await authenticateInstitutional(req());
    if (!auth.ok) throw new Error("auth");
    const res = await institutionalOk(req(), auth.principal, { data: 1 }, { resource: "methodology" });
    expect(res.status).toBe(200);
  });
});

describe("parseQuery / parseId / notFound", () => {
  it("400 invalid_query with issues[]; valid coercion", () => {
    const schema = z.object({ stage: stageParam.optional() });
    const bad = parseQuery(new URLSearchParams("stage=99"), schema);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(400);
    const good = parseQuery(new URLSearchParams("stage=4"), schema);
    expect(good).toEqual({ ok: true, value: { stage: 4 } });
  });
  it("a malformed id reads as not found (404), never 400", async () => {
    expect(parseId("not-a-uuid")).toBeNull();
    expect(parseId("E1A2B3C4-0000-4000-8000-000000000001")).toBe("e1a2b3c4-0000-4000-8000-000000000001");
    const res = notFound("cohort");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: "not_found" });
  });
});
