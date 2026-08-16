// Colocated vitest for POST /api/founder/competitors/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with LLM-generated competitor suggestions (callAI mocked)
//   - Suggestions match the shape the founder-UI form binds to
//     (name, category ∈ direct|indirect|substitute, threat_level ∈ low|medium|high)
//   - Fallback path: when callAI throws OR returns unparseable text, the
//     endpoint still returns 200 with deterministic sector-template suggestions
//     so the UI is never blocked by an LLM outage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (registered BEFORE route import) ──────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabase(project: { name: string; industry: string; stage: number; description?: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const single = vi.fn().mockResolvedValue({ data: project, error: null });
  const eq2 = vi.fn().mockReturnValue({ single, order });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

const LLM_SUCCESS = JSON.stringify([
  {
    name: "Rival A",
    website: "https://rival-a.example",
    category: "direct",
    region: "AU",
    positioning: "AU-native founder navigation for SaaS",
    pricing: "A$99/month",
    strengths: ["AU support", "Fast onboarding"],
    weaknesses: ["No SVI scoring"],
    ourEdge: "Startup Index™ scoring",
    threatLevel: "high",
  },
  {
    name: "Rival B",
    website: "https://rival-b.example",
    category: "indirect",
    region: "US",
    positioning: "US project mgmt",
    pricing: "US$25/user/mo",
    strengths: ["Big brand"],
    weaknesses: ["No AU compliance"],
    ourEdge: "AU compliance built-in",
    threatLevel: "medium",
  },
]);

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
  mocks.callAI.mockReset();
  // Default: LLM returns valid JSON
  mocks.callAI.mockResolvedValue({ text: LLM_SUCCESS, provider: "groq", model: "test" });
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

  it("returns 200 with LLM competitor suggestions for a SaaS project", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2, description: "AU SaaS for founders" })
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestions: Array<{ name: string; category: string; threat_level: string; strengths: string; weaknesses: string }>;
      meta: { sector: string; stage: number };
    };
    expect(body.ok).toBe(true);
    expect(mocks.callAI).toHaveBeenCalledOnce();

    // LLM output was used — first suggestion is Rival A
    expect(body.suggestions[0]?.name).toBe("Rival A");

    for (const s of body.suggestions) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(["direct", "indirect", "substitute"]).toContain(s.category);
      expect(["low", "medium", "high"]).toContain(s.threat_level);
      // strengths/weaknesses are joined arrays for the form <textarea>
      expect(typeof s.strengths).toBe("string");
      expect(typeof s.weaknesses).toBe("string");
    }

    expect(body.meta.sector).toBe("saas");
    expect(body.meta.stage).toBe(2);
  });

  it("falls back to deterministic sector template when the LLM returns unparseable text", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 })
    );
    mocks.callAI.mockResolvedValue({ text: "not-json at all", provider: "groq", model: "test" });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: Array<{ name: string; category: string }> };
    expect(body.ok).toBe(true);
    // SaaS template uses generic category descriptions (compliance — no real company names)
    const names = body.suggestions.map((s) => s.name);
    expect(names.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic template when the LLM call itself throws", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-3");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "MysteryStartup", industry: "unknown-sector-xyz", stage: 0 })
    );
    mocks.callAI.mockRejectedValue(new Error("provider chain exhausted"));

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; suggestions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
