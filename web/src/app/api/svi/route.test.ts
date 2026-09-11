// Colocated tests for POST /api/svi — S18-A member access gate.
//
// An analysis writes svi_analyses + the project's svi_accounts row → editor+
// on a shared project. The gate runs right after the credit check, before
// scraping / AI / persistence. Pins:
//   - viewer on a shared project → 403 (nothing persisted, no spend)
//   - editor → the svi_analyses row + svi_accounts key use the OWNER's
//     email; the caller's wallet is charged
//   - guest (no session) → scope helper never consulted, body email keys

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const cookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => db.sb,
  isSupabaseConfigured: () => true,
}));

const analysisStub = {
  totalSVI: 100,
  stage: 1,
  stageLabel: "Idea",
  netAdjustment: 0,
  confidenceMultiplier: 1,
  version: "t",
  subs: [{ label: "FTV", value: 10 }],
  sector: "saas",
};
vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({}),
  computeSVI: () => ({ ...analysisStub }),
  computeFundingReadiness: () => ({ score: 1 }),
}));
vi.mock("@/lib/rnd-input", () => ({
  detectInputType: () => "idea",
  scrapeUrl: async () => null,
  deepTechAudit: async () => null,
}));
vi.mock("@/lib/competitive-intelligence", () => ({
  analyzeWebsiteCI: async () => null,
  computeHeuristicSCI: () => null,
}));
vi.mock("@/lib/project-name-extractor", () => ({
  extractProjectName: () => ({ name: "Acme", source: "text", confidence: "low" }),
}));
vi.mock("@/lib/agents/deep-valuation", () => ({ buildDeepValuationAnalysis: () => null }));
vi.mock("@/lib/agents/scn-action-plan", () => ({ buildScnActionPlan: () => null }));
vi.mock("@/lib/agents/maturity-detector", () => ({
  detectMaturity: () => ({ level: "idea" }),
  maturityValuationGuard: (v: unknown) => v,
}));
vi.mock("@/lib/agents/cohort-percentile", () => ({ computeCohortPercentile: async () => ({ source: "fallback", percentile: 50 }) }));
vi.mock("@/lib/agents/antler-signals", () => ({ evaluateAntlerSignals: () => null }));
vi.mock("@/lib/agents/accelerator-readiness", () => ({ evaluateAcceleratorReadiness: async () => null }));
vi.mock("@/lib/founder-profile", () => ({
  loadFounderProfileByEmail: async () => null,
  profileToSviInputText: () => "",
}));
vi.mock("@/lib/analytics/server", () => ({ emitEvent: () => {} }));
vi.mock("@/lib/email", () => ({ sendSVIReport: async () => {}, sendWelcomeWithReport: async () => {} }));
vi.mock("@/lib/email-drip", () => ({ enqueueOnboardingDrip: async () => {} }));
vi.mock("@/lib/auth", () => ({ autoCreateUserWithTempPassword: async () => ({ ok: false }) }));
vi.mock("@/lib/google-drive", () => ({ getOrCreateUserFolder: async () => ({ folderId: "f", folderUrl: "u" }) }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  FEATURE_COSTS: { svi_analysis: 1 },
}));

import { POST } from "./route";

function req() {
  return new Request("http://x/api/svi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "caller@x.test", input: { rawText: "A startup idea about widgets" } }),
  });
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  cookieStore.clear();
  cookieStore.set("blockid_session", "tok");
  db.sb = fakeSupabase({ sessions: [{ user_id: "user-caller" }], svi_analyses: [], svi_accounts: [] });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 1 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 9 });
});

describe("POST /api/svi — member access", () => {
  it("viewer on a shared project: 403 before persistence or spend", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(scopeState.lastMinRole).toBe("editor");
    expect(db.sb!.find("svi_analyses", "insert")).toEqual([]);
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("editor: analysis row + account key use the OWNER's email; caller's wallet pays", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    const insert = db.sb!.find("svi_analyses", "insert")[0];
    expect((insert.args[0] as { email: string; project_id: string }).email).toBe("owner@x.test");
    expect((insert.args[0] as { project_id: string }).project_id).toBe("proj-1");
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "svi_analysis", expect.anything());
    const acct = scopeState.calls.find((c) => c.fn === "findOrCreateSVIAccount");
    expect(acct?.email).toBe("owner@x.test");
    expect(acct?.projectId).toBe("proj-1");
  });

  it("guest (no session): scope helper never consulted; body email keys the row", async () => {
    cookieStore.clear();
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(scopeState.lastMinRole).toBeUndefined();
    const insert = db.sb!.find("svi_analyses", "insert")[0];
    expect((insert.args[0] as { email: string }).email).toBe("caller@x.test");
  });
});
