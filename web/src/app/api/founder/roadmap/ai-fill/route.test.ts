// Colocated vitest for POST /api/founder/roadmap/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with LLM-generated roadmap items (callAI mocked)
//   - Items match the founder-UI form shape (quarter, title, description,
//     category, status, target_date, owner)
//   - Fallback path: parse-fail and thrown-provider both still return 200
//     with deterministic roadmap items so the UI is never blocked.

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
// and       .from("svi_accounts").select().eq().eq().maybeSingle()
function makeSupabase(project: { name: string; industry: string; stage: number; description?: string } | null) {
  const from = vi.fn((table: string) => {
    if (table === "projects") {
      const single = vi.fn().mockResolvedValue({ data: project, error: null });
      const eq2 = vi.fn().mockReturnValue({ single });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      return { select };
    }
    // svi_accounts and any other table — resolve to no data.
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    return { select };
  });
  return { from };
}

const LLM_SUCCESS = JSON.stringify([
  { title: "Ship Stripe MVP", phase: "0-30_days", impact: "high", effort: "medium", category: "product", rationale: "Unlocks first revenue signal." },
  { title: "Publish landing page", phase: "0-30_days", impact: "high", effort: "low", category: "growth", rationale: "Captures waitlist." },
  { title: "Recruit AU advisor", phase: "1-3_months", impact: "medium", effort: "low", category: "team", rationale: "Boosts investor trust." },
  { title: "Open safe round", phase: "3-6_months", impact: "high", effort: "high", category: "fundraise", rationale: "Extends runway." },
  { title: "Harden infra to SOC2-lite", phase: "6-12_months", impact: "medium", effort: "high", category: "infra", rationale: "Enterprise sales unlock." },
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

describe("POST /api/founder/roadmap/ai-fill", () => {
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

  it("returns 200 with LLM roadmap items", async () => {
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
        quarter: string;
        title: string;
        description: string;
        category: string;
        status: string;
        target_date: string;
        owner: string;
      }>;
      meta: { topInsight?: string };
    };
    expect(body.ok).toBe(true);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    // First item flows through from the LLM
    expect(body.suggestions[0]?.title).toBe("Ship Stripe MVP");
    // topInsight surfaces first LLM item's rationale
    expect(body.meta.topInsight).toContain("Ship Stripe MVP");
    // Form-shape invariants
    for (const s of body.suggestions) {
      expect(typeof s.quarter).toBe("string");
      expect(s.quarter).toMatch(/^Q\d\s+\d{4}$/);
      expect(typeof s.title).toBe("string");
      expect(typeof s.description).toBe("string");
      expect(["product", "growth", "team", "fundraise", "infra", "compliance"]).toContain(s.category);
      expect(s.status).toBe("planned");
      expect(s.target_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.owner).toBe("Founder");
    }
  });

  it("falls back to deterministic items when the LLM returns unparseable text", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 0 }),
    );
    mocks.callAI.mockResolvedValue({ text: "not-json", provider: "groq", model: "test" });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic items when the LLM call itself throws", async () => {
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
