// Colocated tests for /api/valuation — V04a (founder decision D22, 2026-09-27).
//
// The route used to run `computeValuation` (Berkus + Scorecard over the SVI
// dimension scores) and bridge it with connected MRR; those suites pinned an
// SVI→dollar path the founder retired and were replaced by these pins:
//   - GET answers "not estimable" + the unlock list, never a dollar range;
//   - the engine and the connected-revenue loader are never called;
//   - member access (S18-A) still reads the OWNER's account;
//   - POST computes nothing and charges no credits.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
  findSVIAccountWithFallback: vi.fn(),
  loadConnectedRevenueSignals: vi.fn(),
  computeValuation: vi.fn(),
  spendCredits: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/credits", () => ({ canAfford: vi.fn(), spendCredits: (...a: unknown[]) => mocks.spendCredits(...a) }));
vi.mock("@/lib/valuation", () => ({ computeValuation: (...a: unknown[]) => mocks.computeValuation(...a) }));
// S18-A — member-aware scope on top of the existing project spy.
const scopeRole = vi.hoisted(() => ({ value: "owner" as "owner" | "admin" | "editor" | "viewer" }));
vi.mock("@/lib/projects", async () => {
  const { scopeAdapter } = await import("@/test/project-scope-mock");
  return {
    ...scopeAdapter(() => mocks.getProjectIdFromRequest(), scopeRole, {
      callerEmail: "founder@example.com",
      callerId: "u-1",
    }),
    findSVIAccountWithFallback: (...args: unknown[]) => mocks.findSVIAccountWithFallback(...args),
  };
});
vi.mock("@/lib/connected-revenue", () => ({
  loadConnectedRevenueSignals: (...args: unknown[]) => mocks.loadConnectedRevenueSignals(...args),
}));

import { GET, POST } from "./route";

const USER = { id: "u-1", email: "founder@example.com" };
const ACCOUNT = { id: "acc-1", current_svi: 120, current_stage: 3 };

async function body() {
  const res = await GET();
  return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  vi.clearAllMocks();
  scopeRole.value = "owner";
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => { throw new Error("no table read expected"); }) });
  mocks.getProjectIdFromRequest.mockResolvedValue("p-1");
  mocks.findSVIAccountWithFallback.mockResolvedValue(ACCOUNT);
});

describe("GET /api/valuation — not estimable (V04a / D22)", () => {
  it("401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await body()).status).toBe(401);
  });

  it("answers not estimable with the unlock list — no dollar figure, no engine, no MRR bridge", async () => {
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(json.valuation.status).toBe("not_estimable");
    expect(json.valuation.line).toMatch(/^Not estimable — add .* to unlock a valuation method\.$/);
    expect(json.valuation.unlock.length).toBeGreaterThan(0);
    expect(json.valuation).not.toHaveProperty("midAud");
    expect(JSON.stringify(json)).not.toMatch(/A\$\s?\d/);
    expect(json.sviScore).toBe(120);
    expect(mocks.computeValuation).not.toHaveBeenCalled();
    expect(mocks.loadConnectedRevenueSignals).not.toHaveBeenCalled();
  });

  it("404 when there is no SVI account", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    expect((await body()).status).toBe(404);
  });
});

describe("GET /api/valuation — member access (S18-A)", () => {
  it("viewer: allowed; account under the OWNER's email, fallback bound to the caller", async () => {
    scopeRole.value = "viewer";
    const { status } = await body();
    expect(status).toBe(200);
    expect(mocks.findSVIAccountWithFallback).toHaveBeenCalledWith(
      "owner@x.test", "p-1", "id, current_svi, current_stage", { callerEmail: "founder@example.com" },
    );
  });

  it("owner: own email", async () => {
    await body();
    expect(mocks.findSVIAccountWithFallback).toHaveBeenCalledWith(
      "founder@example.com", "p-1", "id, current_svi, current_stage", { callerEmail: "founder@example.com" },
    );
  });
});

describe("POST /api/valuation — no SVI scenario, no charge", () => {
  it("returns not estimable and never spends credits", async () => {
    const res = await POST(new Request("http://x/api/valuation", { method: "POST", body: JSON.stringify({ sviScore: 140, stage: "mvp" }) }));
    const json = (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(res.status).toBe(200);
    expect(json.valuation.status).toBe("not_estimable");
    expect(json.charged).toBe(false);
    expect(mocks.spendCredits).not.toHaveBeenCalled();
    expect(mocks.computeValuation).not.toHaveBeenCalled();
  });
});
