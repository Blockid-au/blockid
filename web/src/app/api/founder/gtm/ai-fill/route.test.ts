// Colocated vitest for POST /api/founder/gtm/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with an LLM-augmented GTM suggestion (callAI mocked)
//   - Fallback path: when callAI throws OR returns unparseable text, the
//     endpoint still returns 200 with deterministic GTM scaffolding so the
//     UI is never blocked by an LLM outage.

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

function makeSupabase(project: { name: string; industry: string; stage: number; description?: string } | null) {
  const single = vi.fn().mockResolvedValue({ data: project, error: null });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

const LLM_SUCCESS = JSON.stringify({
  positioning: "The AU-native navigation system for early-stage SaaS founders.",
  channels: [
    { name: "seo-content", priority: "high", rationale: "E-E-A-T offsets SGE." },
    { name: "partnerships", priority: "medium", rationale: "Accelerator warm intros." },
    { name: "paid-ads", priority: "low", rationale: "Only after CAC payback." },
  ],
  first90Days: [
    "Week 1-2: 20 discovery calls with AU seed founders.",
    "Week 3-4: launch waitlist with SVI hook.",
    "Month 2: 5 design partners.",
    "Month 3: first public cohort.",
  ],
  keyMetrics: ["Monthly Recurring Revenue (A$)", "Paying customers", "CAC payback"],
});

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

describe("POST /api/founder/gtm/ai-fill", () => {
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

  it("returns 200 with an LLM-augmented GTM suggestion for a SaaS project", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2, description: "AU SaaS" })
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestion: {
        target_segment: string;
        positioning: string;
        primary_channel: string;
        secondary_channels: string[];
        launch_plan: string;
        north_star_metric: string;
        north_star_target: number;
      };
      meta: { sector: string; stage: number };
    };
    expect(body.ok).toBe(true);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    // LLM values flowed through
    expect(body.suggestion.positioning).toContain("AU-native navigation");
    expect(body.suggestion.primary_channel).toBe("seo-content"); // top-priority channel
    expect(body.suggestion.secondary_channels).toContain("partnerships");
    expect(body.suggestion.launch_plan).toContain("discovery calls");
    // Metric was picked from LLM key metrics
    expect(body.suggestion.north_star_metric).toContain("Monthly Recurring Revenue");
    expect(body.suggestion.north_star_target).toBeGreaterThan(0);
    // Deterministic scaffolding survives
    expect(body.suggestion.target_segment).toMatch(/SAAS/);
    expect(body.meta.sector).toBe("saas");
  });

  it("falls back to deterministic scaffolding when the LLM returns garbage", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 })
    );
    mocks.callAI.mockResolvedValue({ text: "definitely not json", provider: "groq", model: "test" });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestion: { positioning: string; primary_channel: string; launch_plan: string };
    };
    expect(body.ok).toBe(true);
    // Deterministic positioning references the strategic-multiple benchmark
    expect(body.suggestion.positioning).toMatch(/multiples|Strategic|SVI/i);
    expect(typeof body.suggestion.primary_channel).toBe("string");
    expect(body.suggestion.launch_plan.length).toBeGreaterThan(0);
  });

  it("falls back when the LLM call throws", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-3");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 4 })
    );
    mocks.callAI.mockRejectedValue(new Error("all providers rate-limited"));

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestion: { primary_channel: string } };
    expect(body.ok).toBe(true);
    expect(body.suggestion.primary_channel.length).toBeGreaterThan(0);
  });
});
