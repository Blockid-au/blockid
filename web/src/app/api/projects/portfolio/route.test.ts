// /api/projects/portfolio route-handler smoke test.
//
// Covers the two branches the handler owns:
//   1. Unauthenticated → 401 { ok: false, error }
//   2. Authenticated   → 200 { ok: true, rows } shape passed through from
//      getPortfolioRows unchanged.
//
// The Supabase-heavy fan-out inside getPortfolioRows is exercised
// separately by portfolio.test.ts; here we mock the module boundary so
// this test stays runtime-free.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PortfolioRow } from "@/lib/portfolio";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/portfolio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portfolio")>();
  return {
    ...actual,
    getPortfolioRows: vi.fn(),
  };
});

// Imports must come AFTER vi.mock so the mocked bindings are hoisted first.
import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioRows } from "@/lib/portfolio";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getPortfolioRowsMock = vi.mocked(getPortfolioRows);

describe("GET /api/projects/portfolio", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getPortfolioRowsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/auth/i);
    expect(getPortfolioRowsMock).not.toHaveBeenCalled();
  });

  it("returns rows from getPortfolioRows unchanged for authed user", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u1",
      email: "founder@example.com",
      displayName: null,
      createdAt: "",
      lastLoginAt: null,
      role: "user",
      plan: "free",
      googleId: null,
      avatarUrl: null,
      discountPct: null,
      startupName: null,
      startupStage: null,
      industry: null,
      onboardingCompleted: true,
      startupGoals: null,
    });
    const rows: PortfolioRow[] = [
      {
        id: "p1",
        slug: "acme",
        name: "Acme",
        current_svi_score: 62,
        canonical_stage: "mvp_early_revenue",
        credits_used_mtd: 3.5,
        last_activity_at: "2026-07-20T00:00:00.000Z",
        next_action: { label: "Set up equity", url: "/workspace/equity-setup" },
        svi_history: [],
      },
    ];
    getPortfolioRowsMock.mockResolvedValue(rows);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rows: PortfolioRow[] };
    expect(body.ok).toBe(true);
    expect(body.rows).toEqual(rows);
    expect(getPortfolioRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", email: "founder@example.com" }),
    );
  });

  it("returns empty rows without crashing when the helper yields []", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u2",
      email: "empty@example.com",
      displayName: null,
      createdAt: "",
      lastLoginAt: null,
      role: "user",
      plan: "free",
      googleId: null,
      avatarUrl: null,
      discountPct: null,
      startupName: null,
      startupStage: null,
      industry: null,
      onboardingCompleted: true,
      startupGoals: null,
    });
    getPortfolioRowsMock.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rows: PortfolioRow[] };
    expect(body).toEqual({ ok: true, rows: [] });
  });
});
