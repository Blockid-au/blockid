// Colocated vitest for POST /api/founder/team/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with LLM-generated team plan (callAI mocked)
//   - Roles match the founder-UI form shape (role_title, role_category,
//     equity_pct, salary_aud, start_date, status, notes) and salaries are
//     clamped inside AU_SALARY_BENCHMARKS bands.
//   - Fallback path: parse-fail and thrown-provider both still return 200
//     with deterministic hires so the UI is never blocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string } | null>>(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn<() => Promise<string | null>>(),
  callAI: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => mocks.callAI(opts),
}));

import { POST } from "./route";

// Route calls .from("projects").select().eq().eq().single()
// and       .from("team_members").select().eq().eq()  (list result)
function makeSupabase(project: { name: string; industry: string; stage: number } | null) {
  const from = vi.fn((table: string) => {
    if (table === "projects") {
      const single = vi.fn().mockResolvedValue({ data: project, error: null });
      const eq2 = vi.fn().mockReturnValue({ single });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      return { select };
    }
    // team_members — list resolves to empty by default
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    return { select };
  });
  return { from };
}

const LLM_SUCCESS = JSON.stringify([
  {
    role: "Senior Full-Stack Engineer",
    priority: "critical",
    hire_by_phase: "current",
    salary_aud_min: 140000,
    salary_aud_max: 170000,
    equity_pct_min: 0.5,
    equity_pct_max: 1.5,
    rationale: "Ship MVP faster; unblocks first paying customer.",
  },
  {
    role: "Product Manager",
    priority: "important",
    hire_by_phase: "next_3_months",
    salary_aud_min: 145000,
    salary_aud_max: 180000,
    equity_pct_min: 0.5,
    equity_pct_max: 1.0,
    rationale: "Owns discovery loop across 20+ AU interviews.",
  },
  {
    role: "Designer",
    priority: "nice_to_have",
    hire_by_phase: "next_6_months",
    salary_aud_min: 120000,
    salary_aud_max: 150000,
    equity_pct_min: 0.25,
    equity_pct_max: 0.5,
    rationale: "Landing-page conversion lift.",
  },
]);

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
  mocks.callAI.mockReset();
  mocks.callAI.mockResolvedValue({ text: LLM_SUCCESS, provider: "groq", model: "test" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/founder/team/ai-fill", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "auth" });
  });

  it("returns 503 when Supabase is unavailable", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "db" });
  });

  it("returns 400 when no active project", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(null));
    mocks.getProjectIdFromRequest.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "no project" });
  });

  it("returns 200 with LLM team suggestions", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 }),
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestions: Array<{
        role_title: string;
        role_category: string;
        equity_pct: number | null;
        salary_aud: number | null;
        start_date: string;
        status: "open" | "planned";
        notes: string;
      }>;
    };
    expect(body.ok).toBe(true);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    // First LLM role flowed through
    expect(body.suggestions[0]?.role_title).toBe("Senior Full-Stack Engineer");
    // Critical → open, important/nice_to_have → planned
    expect(body.suggestions[0]?.status).toBe("open");
    expect(body.suggestions[1]?.status).toBe("planned");
    // Form-shape invariants
    for (const s of body.suggestions) {
      expect(typeof s.role_title).toBe("string");
      expect(["founder", "hire", "advisor"]).toContain(s.role_category);
      expect(s.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof s.notes).toBe("string");
    }
    // Salaries stay within AU_SALARY_BENCHMARKS bands (Software Engineer
    // senior p25=130000, p75=180000). The clamp should keep engineer
    // salary in that band.
    const engineer = body.suggestions.find((s) =>
      s.role_title.toLowerCase().includes("engineer"),
    );
    expect(engineer?.salary_aud).toBeGreaterThanOrEqual(130000);
    expect(engineer?.salary_aud).toBeLessThanOrEqual(180000);
  });

  it("falls back to deterministic hires when the LLM returns unparseable text", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 }),
    );
    mocks.callAI.mockResolvedValue({ text: "not-json", provider: "groq", model: "test" });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic hires when the LLM call itself throws", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-3");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "Mystery", industry: "unknown-xyz", stage: 0 }),
    );
    mocks.callAI.mockRejectedValue(new Error("provider chain exhausted"));

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
