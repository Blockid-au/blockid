// Colocated vitest for POST /api/founder/competitors/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with competitor suggestions when authenticated + project exists
//   - Suggestions match the expected shape (name, category, threat_level)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (registered BEFORE route import) ──────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string } | null>>(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));

import { POST } from "./route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabase(project: { name: string; industry: string; stage: number } | null) {
  const single = vi.fn().mockResolvedValue({ data: project, error: null });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/founder/competitors/ai-fill", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "auth" });
  });

  it("returns 503 when Supabase is unavailable", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "db" });
  });

  it("returns 400 when no active project", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(null));
    mocks.getProjectIdFromRequest.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "no project" });
  });

  it("returns 200 with competitor suggestions for a SaaS project", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 })
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestions: Array<{ name: string; category: string; threat_level: string }>;
      meta: { sector: string; stage: number };
    };
    expect(body.ok).toBe(true);

    // Should have at least 1 suggestion
    expect(body.suggestions.length).toBeGreaterThan(0);

    // Each suggestion must have the required shape fields
    for (const s of body.suggestions) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(["direct", "indirect", "substitute"]).toContain(s.category);
      expect(["low", "medium", "high"]).toContain(s.threat_level);
    }

    // Meta should reflect the project context
    expect(body.meta.sector).toBe("saas");
    expect(body.meta.stage).toBe(2);
  });

  it("falls back to default templates for an unknown sector", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "MysteryStartup", industry: "unknown-sector-xyz", stage: 0 })
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
