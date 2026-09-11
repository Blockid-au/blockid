// Colocated tests for POST /api/svi/report-section — S18-A member access.
//
// The generated section is upserted into report_sections against the
// project's latest analysis → editor+ on a shared project. Pins:
//   - viewer → 403 before any AI call
//   - editor → account + analysis resolved under the OWNER's email (legacy
//     fallback bound to the caller); the section row is stamped with the
//     CALLER's user_id; member creditNote in the response
//   - owner / no project → caller's own key

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
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

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as { id: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const ai = vi.hoisted(() => ({ callAI: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({
  callAI: (...a: unknown[]) => ai.callAI(...a),
  isAIConfigured: () => true,
}));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn(), getBalance: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  getBalance: (...a: unknown[]) => credits.getBalance(...a),
  FEATURE_COSTS: {},
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST } from "./route";

function req() {
  return new Request("http://x/api/svi/report-section", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId: "hook_problem", depth: "summary" }),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({
    account: { id: "acct-1", startup_name: "P", current_svi: 120, current_stage: 2 },
    analysis: { id: "an-1", raw_input: "idea", total_svi: 120, analysis_json: { subs: [] } },
  }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  ai.callAI.mockReset().mockResolvedValue({ text: "Generated section body with several words." });
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 0 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  credits.getBalance.mockReset().mockResolvedValue(10);
  db.sb = fakeSupabase({ svi_evidence: [], evidence_analyses: [] });
}

beforeEach(reset);

describeMemberAccess("POST /api/svi/report-section", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(req()),
  expectKeyFns: ["findSVIAccountWithFallback", "findLatestAnalysisWithFallback"],
});

describe("POST /api/svi/report-section — persistence + notes", () => {
  it("viewer: 403 and the AI is never called", async () => {
    scopeState.role = "viewer";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  it("editor: section row is stamped with the CALLER's user_id; member creditNote", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    const upsert = db.sb!.find("report_sections", "upsert")[0];
    expect(upsert).toBeDefined();
    expect((upsert.args[0] as { user_id: string; analysis_id: string }).user_id).toBe("user-caller");
    expect((upsert.args[0] as { analysis_id: string }).analysis_id).toBe("an-1");
    const body = await res.json();
    expect(body.creditNote).toMatch(/not the project owner/);
  });
});
