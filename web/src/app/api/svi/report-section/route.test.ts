// Colocated tests for POST /api/svi/report-section — S18-B review P1.
//
// `report_sections` is unique per (analysis_id, section_id, depth): one
// unlock per project analysis, shared by the owner and every member. Pins:
//   - a second unlock of an existing section (by the owner OR a member) is
//     FREE: no AI call, no spend, `credits_spent: 0`, `alreadyUnlocked`
//   - the existing row's `user_id` (the original purchaser) is never
//     rewritten — no upsert/update is issued at all
//   - the already-unlocked short-circuit runs BEFORE affordability, so a
//     caller with no credits still gets the shared section
//   - a first unlock still generates, charges the CALLER's wallet and
//     inserts with ON CONFLICT DO NOTHING (`ignoreDuplicates`)
//   - viewer → 403 before any AI spend

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
vi.mock("@/lib/project-members/http", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  const { NextResponse } = await import("next/server");
  const mock = projectsMock(scopeState);
  return {
    projectScopeOrDeny: async (minRole?: string) => {
      try {
        return { scope: await mock.getProjectScope(minRole), denied: null };
      } catch (err) {
        const e = err as { code?: string; status?: number };
        return {
          scope: null,
          denied: NextResponse.json({ ok: false, error: e.code }, { status: e.status ?? 500 }),
        };
      }
    },
  };
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const ai = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => true,
  callAI: (...a: unknown[]) => ai.callAI(...a),
}));

const credits = vi.hoisted(() => ({
  canAfford: vi.fn(),
  spendCredits: vi.fn(),
  getBalance: vi.fn(),
}));
vi.mock("@/lib/credits", () => ({
  FEATURE_COSTS: { report_section_market: 0.75 },
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  getBalance: (...a: unknown[]) => credits.getBalance(...a),
}));

import { POST } from "./route";

const EXISTING = {
  analysis_id: "an-1",
  section_id: "market",
  depth: "full",
  content: "## Market\nowner paid for this",
  word_count: 5,
  credits_cost: 0.75,
  user_id: "user-owner",
  created_at: "2026-09-01T00:00:00Z",
};

function post(body: unknown) {
  return POST(new Request("http://x/api/svi/report-section", { method: "POST", body: JSON.stringify(body) }));
}

function reset(sections: Record<string, unknown>[] = []) {
  Object.assign(
    scopeState,
    makeScopeState({
      account: { id: "acct-1", startup_name: "Acme", current_svi: 120, current_stage: 3 },
      analysis: { id: "an-1", raw_input: "saas", total_svi: 120, analysis_json: {} },
    }),
  );
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ report_sections: sections, svi_evidence: [], evidence_analyses: [] });
  ai.callAI.mockReset().mockResolvedValue({ text: "## Market\nfresh content from ai" });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 0.75 });
  credits.spendCredits.mockReset().mockResolvedValue({ balance: 9.25 });
  credits.getBalance.mockReset().mockResolvedValue(10);
}

beforeEach(() => reset());

describe("POST /api/svi/report-section — shared sections (S18-B P1)", () => {
  it("member (editor) unlocking a section the owner already paid for: free, no AI, user_id untouched", async () => {
    reset([EXISTING]);
    scopeState.role = "editor";
    const res = await post({ sectionId: "market", depth: "full" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.alreadyUnlocked).toBe(true);
    expect(body.credits_spent).toBe(0);
    expect(body.creditsCost).toBe(0);
    expect(body.unlockedBySelf).toBe(false);
    expect(body.content).toBe(EXISTING.content);
    expect(body.wordCount).toBe(5);
    // no generation, no charge
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(credits.canAfford).not.toHaveBeenCalled();
    // no write of any kind → the purchaser's user_id can never flip
    expect(db.sb!.find("report_sections", "upsert")).toEqual([]);
    expect(db.sb!.find("report_sections", "update")).toEqual([]);
    expect(db.sb!.find("report_sections", "insert")).toEqual([]);
    // the lookup is keyed on the OWNER's analysis (resolved via dataEmail)
    expect(scopeState.calls.find((c) => c.fn === "findLatestAnalysisWithFallback")).toMatchObject({
      email: "owner@x.test",
      projectId: "proj-1",
    });
    expect(db.sb!.hasEq("report_sections", "analysis_id", "an-1")).toBe(true);
    expect(db.sb!.hasEq("report_sections", "section_id", "market")).toBe(true);
    expect(db.sb!.hasEq("report_sections", "depth", "full")).toBe(true);
    expect(db.sb!.hasEq("report_sections", "user_id", "user-caller")).toBe(false);
  });

  it("owner re-unlocking their own existing section is also free (idempotent)", async () => {
    reset([{ ...EXISTING, user_id: "user-caller" }]);
    const res = await post({ sectionId: "market", depth: "full" });
    const body = await res.json();
    expect(body.alreadyUnlocked).toBe(true);
    expect(body.unlockedBySelf).toBe(true);
    expect(body.credits_spent).toBe(0);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("report_sections", "upsert")).toEqual([]);
  });

  it("already-unlocked short-circuit runs before affordability: a broke caller still gets the section", async () => {
    reset([EXISTING]);
    scopeState.role = "editor";
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 0.75 });
    credits.getBalance.mockResolvedValue(0);
    const res = await post({ sectionId: "market", depth: "full" });
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyUnlocked).toBe(true);
    expect(credits.canAfford).not.toHaveBeenCalled();
  });

  it("first unlock (member): generates, charges the CALLER, inserts with ignoreDuplicates under the caller's id", async () => {
    scopeState.role = "editor";
    const res = await post({ sectionId: "market", depth: "full" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyUnlocked).toBe(false);
    expect(body.credits_spent).toBe(0.75);
    expect(body.creditsCost).toBe(0.75);
    expect(body.content).toContain("fresh content");
    expect(body.creditNote).toContain("your own credits");
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(credits.canAfford).toHaveBeenCalledWith("user-caller", "report_section_market");
    expect(credits.spendCredits).toHaveBeenCalledWith(
      "user-caller",
      "report_section_market",
      expect.objectContaining({ sectionId: "market", project_id: "proj-1" }),
    );
    const upserts = db.sb!.find("report_sections", "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args[0]).toMatchObject({ analysis_id: "an-1", section_id: "market", depth: "full", user_id: "user-caller" });
    expect(upserts[0].args[1]).toEqual({ onConflict: "analysis_id,section_id,depth", ignoreDuplicates: true });
  });

  it("first unlock with insufficient credits → 402, no AI call", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0.25, cost: 0.75 });
    const res = await post({ sectionId: "market", depth: "full" });
    expect(res.status).toBe(402);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(db.sb!.find("report_sections", "upsert")).toEqual([]);
  });

  it("viewer → 403 before any lookup, AI call or charge", async () => {
    reset([EXISTING]);
    scopeState.role = "viewer";
    const res = await post({ sectionId: "market", depth: "full" });
    expect(res.status).toBe(403);
    expect(ai.callAI).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.calls).toEqual([]);
  });

  it("401 when unauthenticated", async () => {
    auth.user = null;
    expect((await post({ sectionId: "market", depth: "full" })).status).toBe(401);
  });
});
