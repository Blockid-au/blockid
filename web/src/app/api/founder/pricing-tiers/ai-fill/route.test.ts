// Colocated vitest for POST /api/founder/pricing-tiers/ai-fill
//
// Pins:
//   - 401 when unauthenticated
//   - 503 when Supabase unavailable
//   - 400 when no active project
//   - 200 with LLM-generated pricing tiers (callAI mocked)
//   - Tiers preserve the founder-UI form shape (model, price_monthly_aud,
//     price_annual_aud, billing_note, features[], target_segment,
//     cta_label, sort_order)
//   - Fallback path: parse-fail and thrown-provider both still return 200
//     with deterministic tiers so the UI is never blocked by an LLM outage.

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

function makeSupabase(project: { name: string; industry: string; stage: number } | null) {
  const single = vi.fn().mockResolvedValue({ data: project, error: null });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

const LLM_SUCCESS = JSON.stringify([
  {
    name: "LLM-Starter",
    price_aud_monthly: 0,
    target_segment: "Solo founder exploring",
    features: ["1 project", "Basic SVI"],
    positioning: "Free forever.",
  },
  {
    name: "LLM-Growth",
    price_aud_monthly: 79,
    target_segment: "Early-stage SaaS founder",
    features: ["3 projects", "Full SVI", "GTM builder"],
    positioning: "Priced to hit 78% GM with <12mo CAC payback.",
  },
  {
    name: "LLM-Scale",
    price_aud_monthly: 249,
    target_segment: "Series A founder scaling revenue",
    features: ["Unlimited", "API", "Investor exports"],
    positioning: "Per-seat scale tier.",
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

describe("POST /api/founder/pricing-tiers/ai-fill", () => {
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

  it("returns 200 with LLM pricing tiers for a SaaS project", async () => {
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
        name: string;
        model: string;
        price_monthly_aud: number | null;
        price_annual_aud: number | null;
        billing_note: string;
        features: string[];
        target_segment: string;
        cta_label: string;
        sort_order: number;
      }>;
      meta: { sector: string; stage: number };
    };

    expect(body.ok).toBe(true);
    expect(mocks.callAI).toHaveBeenCalledOnce();
    // LLM output was used — first suggestion is the LLM's tier name.
    expect(body.suggestions[0]?.name).toBe("LLM-Starter");
    // Free tier billing hint preserved.
    expect(body.suggestions[0]?.model).toBe("freemium");
    // Paid tier annual = round(monthly*12*0.8)
    const growth = body.suggestions[1];
    expect(growth?.price_monthly_aud).toBe(79);
    expect(growth?.price_annual_aud).toBe(Math.round(79 * 12 * 0.8));
    // Scale tier becomes per_seat regardless of sector default.
    expect(body.suggestions[2]?.model).toBe("per_seat");
    // Form-shape invariants
    for (const s of body.suggestions) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.billing_note).toBe("string");
      expect(Array.isArray(s.features)).toBe(true);
      expect(typeof s.cta_label).toBe("string");
      expect(typeof s.sort_order).toBe("number");
    }
    expect(body.meta.sector).toBe("saas");
    expect(body.meta.stage).toBe(2);
  });

  it("falls back to deterministic tiers when the LLM returns unparseable text", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1" });
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-2");
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({ name: "AcmeSaaS", industry: "saas", stage: 2 }),
    );
    mocks.callAI.mockResolvedValue({ text: "not-json at all", provider: "groq", model: "test" });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      suggestions: Array<{ name: string; price_monthly_aud: number | null }>;
    };
    expect(body.ok).toBe(true);
    // Deterministic fallback returns Starter / Growth / Scale
    const names = body.suggestions.map((s) => s.name);
    expect(names).toContain("Starter");
  });

  it("falls back to deterministic tiers when the LLM call itself throws", async () => {
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
