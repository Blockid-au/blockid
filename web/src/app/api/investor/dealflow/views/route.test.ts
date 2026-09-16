// Colocated vitest for /api/investor/dealflow/views (G13-W3-T2, §B.10 T6).
// Pins: 401 / 402, GET lists, POST validates (Zod saveViewBodySchema) →
// 201 with the view, 402 limit_reached at 10, DELETE ?id= validation, and
// POST / DELETE apiRoute()-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

const { userMock, canMock, gateHitMock, listMock, saveMock, deleteMock } = vi.hoisted(() => ({
  userMock: vi.fn(), canMock: vi.fn(), gateHitMock: vi.fn(), listMock: vi.fn(), saveMock: vi.fn(), deleteMock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f), recordGateHit: (u: unknown, f: string, s: string) => gateHitMock(u, f, s) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/investors/dealflow", () => ({
  listSavedViews: (u: string) => listMock(u),
  saveView: (u: string, i: unknown) => saveMock(u, i),
  deleteView: (u: string, id: string) => deleteMock(u, id),
}));

import { DELETE, GET, POST } from "./route";

const USER = { id: "u-1", email: "a@example.com", plan: "investor_angel" };
const VIEW = { id: "abc12345", name: "Seed NSW", filters: { industry: [], business_model: [], stage: ["seed"], state: ["NSW"], tags: [], sort: "fit" }, sort: "fit", created_at: "2026-09-16T00:00:00Z" };

function req(method: string, body?: unknown, url = "http://localhost/api/investor/dealflow/views"): NextRequest {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as NextRequest;
}

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(USER);
  canMock.mockReset().mockResolvedValue(true);
  gateHitMock.mockReset().mockResolvedValue(undefined);
  listMock.mockReset().mockResolvedValue([VIEW]);
  saveMock.mockReset().mockResolvedValue({ ok: true, view: VIEW, views: [VIEW] });
  deleteMock.mockReset().mockResolvedValue({ ok: true, views: [] });
});

describe("/api/investor/dealflow/views", () => {
  it("POST and DELETE are apiRoute()-wrapped", () => {
    const src = readFileSync(path.join(__dirname, "route.ts"), "utf8");
    expect(src).toMatch(/export const POST = apiRoute\(/);
    expect(src).toMatch(/export const DELETE = apiRoute\(/);
  });

  it("401 anonymous; 402 feature_locked", async () => {
    userMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", {}))).status).toBe(401);
    userMock.mockResolvedValue(USER);
    canMock.mockResolvedValue(false);
    expect((await POST(req("POST", { name: "x", filters: {} }))).status).toBe(402);
    expect(gateHitMock).toHaveBeenCalled();
  });

  it("GET lists the user's views", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, views: [VIEW] });
  });

  it("POST validates and saves → 201; invalid → 400; limit → 402", async () => {
    const res = await POST(req("POST", { name: " Seed NSW ", filters: { stage: ["seed"], state: ["NSW"], min_fit: 60 } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, view: { id: "abc12345" } });
    expect(saveMock).toHaveBeenCalledWith("u-1", { name: "Seed NSW", filters: expect.objectContaining({ stage: ["seed"], state: ["NSW"], min_fit: 60, industry: [], sort: "fit" }), sort: undefined });
    expect((await POST(req("POST", { name: "", filters: {} }))).status).toBe(400);
    expect((await POST(req("POST", { name: "x", filters: { stage: ["pre_seed"] } }))).status).toBe(400);
    saveMock.mockResolvedValue({ ok: false, reason: "limit_reached", views: [VIEW] });
    const over = await POST(req("POST", { name: "x", filters: {} }));
    expect(over.status).toBe(402);
    expect(await over.json()).toMatchObject({ ok: false, error: "limit_reached" });
  });

  it("DELETE ?id= → 200 / 404; malformed → 400", async () => {
    expect((await DELETE(req("DELETE", undefined, "http://localhost/api/investor/dealflow/views?id=abc12345"))).status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("u-1", "abc12345");
    deleteMock.mockResolvedValue({ ok: false, views: [] });
    expect((await DELETE(req("DELETE", undefined, "http://localhost/api/investor/dealflow/views?id=abc12345"))).status).toBe(404);
    expect((await DELETE(req("DELETE", undefined, "http://localhost/api/investor/dealflow/views?id=NOPE!"))).status).toBe(400);
  });
});
