// Colocated vitest for /api/investor/mandates (G13-W3-T2, Appendix 1).
// Pins: 401 anonymous, 402 feature_locked (+ recordGateHit), GET shape
// (mandates / primary / draft + source / limit / can_edit_weights /
// evaluator), PUT/POST create → 201 with the parsed 7-section body reaching
// the lib, PATCH without id → 400, invalid body → 400 with issues, the
// Scout limit → 402 limit_reached, not_found → 404, not_migrated → 503,
// weights stripped below Program, DELETE ?id= validation, and that every
// mutating verb is apiRoute()-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { userMock, canMock, gateHitMock, visMock, listMock, draftMock, limitMock, upsertMock, deactivateMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  canMock: vi.fn(),
  gateHitMock: vi.fn(),
  visMock: vi.fn(),
  listMock: vi.fn(),
  draftMock: vi.fn(),
  limitMock: vi.fn(),
  upsertMock: vi.fn(),
  deactivateMock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f), recordGateHit: (u: unknown, f: string, s: string) => gateHitMock(u, f, s) }));
vi.mock("@/lib/investor-portal", () => ({
  FIRM_MAX_LEN: 80,
  THESIS_MAX_LEN: 200,
  getInvestorVisibility: (u: string) => visMock(u),
  getInvestorPreferences: async () => ({}),
  setInvestorPreferences: async () => ({ ok: true, prefs: {} }),
  setInvestorDiscoverable: async () => ({ ok: true, discoverable: false }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/investors/mandates", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    listMandates: (u: string) => listMock(u),
    mandateDraftFor: (u: string, d: boolean) => draftMock(u, d),
    mandateLimitFor: (p: string) => limitMock(p),
    upsertMandate: (u: unknown, i: unknown) => upsertMock(u, i),
    deactivateMandate: (u: string, id: string) => deactivateMock(u, id),
  };
});

import { DELETE, GET, PATCH, POST, PUT, dynamic } from "./route";
import { readFileSync } from "node:fs";
import path from "node:path";

const SCOUT = { id: "u-1", email: "a@example.com", plan: "investor_angel" };
const PROGRAM = { id: "u-2", email: "p@example.com", plan: "investor_vc_small" };
const MID = "22222222-2222-4222-8222-222222222222";
const MANDATE = { id: MID, label: "Sydney Angels", discoverable: true, is_default: true, weights: {} };

function req(method: string, body?: unknown, url = "http://localhost/api/investor/mandates"): NextRequest {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest;
}

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(SCOUT);
  canMock.mockReset().mockResolvedValue(true);
  gateHitMock.mockReset().mockResolvedValue(undefined);
  visMock.mockReset().mockResolvedValue({ evaluator: true, discoverable: true });
  listMock.mockReset().mockResolvedValue({ migrated: true, mandates: [MANDATE], primary: MANDATE });
  draftMock.mockReset().mockResolvedValue({ draft: { id: MID, label: "Sydney Angels" }, source: "mandate", mandateId: MID });
  limitMock.mockReset().mockResolvedValue(1);
  upsertMock.mockReset().mockResolvedValue({ ok: true, mandate: MANDATE, org: { id: "o1" }, created: true, mirror: { ok: true } });
  deactivateMock.mockReset().mockResolvedValue(true);
});

describe("/api/investor/mandates", () => {
  it("is force-dynamic and every mutating verb is apiRoute()-wrapped", () => {
    expect(dynamic).toBe("force-dynamic");
    const src = readFileSync(path.join(__dirname, "route.ts"), "utf8");
    for (const m of ["PUT", "POST", "PATCH", "DELETE"]) expect(src).toMatch(new RegExp(`export const ${m} = apiRoute\\(`));
  });

  it("401 anonymous on every verb; 402 feature_locked with recordGateHit(api)", async () => {
    userMock.mockResolvedValue(null);
    for (const fn of [GET, PUT, POST, PATCH, DELETE]) expect((await fn(req("GET"))).status).toBe(401);
    userMock.mockResolvedValue(SCOUT);
    canMock.mockResolvedValue(false);
    const res = await PUT(req("PUT", { label: "x" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: "feature_locked", feature: "investor.dealflow" });
    expect(gateHitMock).toHaveBeenCalledWith({ id: "u-1", plan: "investor_angel", segment: "investor" }, "investor.dealflow", "api");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("GET returns mandates, primary, the draft + its source, the plan limit, can_edit_weights and the persona flags — never an email", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, migrated: true, primary: { id: MID }, draft_source: "mandate", limit: 1, can_edit_weights: false, evaluator: true, discoverable: true });
    expect(body.mandates).toHaveLength(1);
    expect(draftMock).toHaveBeenCalledWith("u-1", true);
    expect(JSON.stringify(body)).not.toContain("a@example.com");
    limitMock.mockResolvedValue(Number.MAX_SAFE_INTEGER);
    expect((await (await GET(req("GET"))).json()).limit).toBeNull();
  });

  it("PUT creates → 201 with the parsed 7-section body reaching upsertMandate (defaults filled, chips deduped, weights stripped for Scout)", async () => {
    const res = await PUT(req("PUT", { label: " Sydney Angels ", thesis: "Pre-seed B2B", discoverable: true, sectors_include: ["fintech", "fintech"], stages: ["seed"], geographies: ["NSW"], min_svi: 50, weights: { industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, created: true, mandate: { id: MID }, discoverable: true });
    const [user, input] = upsertMock.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(user).toEqual({ id: "u-1", plan: "investor_angel", evaluator: true });
    expect(input).toMatchObject({ label: "Sydney Angels", thesis: "Pre-seed B2B", discoverable: true, sectors_include: ["fintech"], sectors_exclude: [], stages: ["seed"], geographies: ["NSW"], min_svi: 50, cheque_min_aud: null, weights: {} });
    // POST is the same handler
    expect((await POST(req("POST", { label: "x" }))).status).toBe(201);
  });

  it("Program keeps its weights override; PATCH updates → 200; PATCH without id → 400", async () => {
    userMock.mockResolvedValue(PROGRAM);
    upsertMock.mockResolvedValue({ ok: true, mandate: MANDATE, org: null, created: false, mirror: { ok: true } });
    const res = await PATCH(req("PATCH", { id: MID, label: "Fund II", weights: { industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 } }));
    expect(res.status).toBe(200);
    expect((upsertMock.mock.calls[0][1] as Record<string, unknown>).weights).toEqual({ industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 });
    const noId = await PATCH(req("PATCH", { label: "Fund II" }));
    expect(noId.status).toBe(400);
    expect(await noId.json()).toMatchObject({ ok: false, error: "invalid_body", issues: [{ path: "id" }] });
  });

  it("validation: invalid body → 400 with issue paths; bad JSON → 400", async () => {
    const res = await PUT(req("PUT", { label: "", sectors_include: ["saas"], cheque_min_aud: 500, cheque_max_aud: 100, weights: { industry: 99 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
    const paths = body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["label", "weights"]));
    expect(paths.some((p: string) => p.startsWith("sectors_include"))).toBe(true);
    // object-level refinements run once the shape is clean
    const range = await PUT(req("PUT", { label: "x", cheque_min_aud: 500, cheque_max_aud: 100 }));
    expect(range.status).toBe(400);
    expect((await range.json()).issues.map((i: { path: string }) => i.path)).toEqual(["cheque_max_aud"]);
    expect(upsertMock).not.toHaveBeenCalled();
    const bad = await PUT(new Request("http://localhost/api/investor/mandates", { method: "PUT", body: "{nope", headers: { "content-type": "application/json" } }) as unknown as NextRequest);
    expect(bad.status).toBe(400);
  });

  it("lib outcomes map to status: limit_reached 402 (+limit), not_found 404, not_migrated 503, db_error 500", async () => {
    upsertMock.mockResolvedValueOnce({ ok: false, reason: "limit_reached", limit: 1 });
    let res = await PUT(req("PUT", { label: "Second" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ ok: false, error: "limit_reached", limit: 1 });
    upsertMock.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    res = await PATCH(req("PATCH", { id: MID, label: "x" }));
    expect(res.status).toBe(404);
    upsertMock.mockResolvedValueOnce({ ok: false, reason: "not_migrated" });
    expect((await PUT(req("PUT", { label: "x" }))).status).toBe(503);
    upsertMock.mockResolvedValueOnce({ ok: false, reason: "db_error" });
    expect((await PUT(req("PUT", { label: "x" }))).status).toBe(500);
  });

  it("DELETE ?id= soft-deactivates; malformed id → 400; unknown → 404", async () => {
    expect((await DELETE(req("DELETE", undefined, `http://localhost/api/investor/mandates?id=${MID}`))).status).toBe(200);
    expect(deactivateMock).toHaveBeenCalledWith("u-1", MID);
    expect((await DELETE(req("DELETE", undefined, "http://localhost/api/investor/mandates?id=nope"))).status).toBe(400);
    deactivateMock.mockResolvedValue(false);
    expect((await DELETE(req("DELETE", undefined, `http://localhost/api/investor/mandates?id=${MID}`))).status).toBe(404);
  });
});
