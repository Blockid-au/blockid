import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /dashboard/svi — the page the review named
// (`findOrCreateSVIAccount(user.email, projectId)` at first render). Pins:
// owner path unchanged; a member reads analyses / account / snapshots /
// evidence under the OWNER's key and never calls findOrCreateSVIAccount;
// credits, share views and actions stay the CALLER's; a viewer gets
// `readOnly` on LivingSVIDashboard + the note; a member whose owner has no
// analysis yet sees the empty state with no svi_accounts insert.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => founderUser(await scopeState) };
});
const getBalanceMock = vi.fn();
vi.mock("@/lib/credits", () => ({ getBalance: (id: string) => getBalanceMock(id) }));
vi.mock("@/lib/svi-analysis", () => ({ computeFundingReadiness: () => null }));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/components/dashboard/empty-dashboard-state", () => ({
  EmptyDashboardState: (p: { title: string }) => <div data-empty>{p.title}</div>,
}));
vi.mock("@/components/dashboard/living-svi-dashboard", () => ({
  LivingSVIDashboard: (p: { readOnly?: boolean; userEmail: string; creditBalance: number; evidenceCount: number; shareViews: number; analysis: { totalSVI: number }; savedSections?: Array<{ section_id: string; depth: string }> }) => (
    <div
      data-living
      data-readonly={String(Boolean(p.readOnly))}
      data-email={p.userEmail}
      data-credits={p.creditBalance}
      data-evidence={p.evidenceCount}
      data-views={p.shareViews}
      data-svi={p.analysis.totalSVI}
      data-sections={(p.savedSections ?? []).map((s) => `${s.section_id}:${s.depth}`).join(",")}
    />
  ),
}));
const NULL = () => null;
vi.mock("@/components/svi/score-history-chart", () => ({ ScoreHistoryChart: NULL }));
vi.mock("@/components/svi/svi-score-ring", () => ({ SviScoreRing: NULL }));
vi.mock("@/components/dashboard/next-best-action-widget", () => ({ NextBestActionWidget: NULL }));
vi.mock("@/components/dashboard/next-step-tile", () => ({ NextStepTile: NULL }));
vi.mock("@/components/dashboard/investor-readiness-tile", () => ({ InvestorReadinessTile: NULL }));
vi.mock("@/components/dashboard/cohort-retention-tile", () => ({ CohortRetentionTile: NULL }));
vi.mock("@/components/dashboard/deep-valuation-card", () => ({ DeepValuationCard: NULL }));
vi.mock("@/components/dashboard/scn-action-plan-card", () => ({ ScnActionPlanCard: NULL }));
vi.mock("@/components/dashboard/svi-explainer-card", () => ({ SviExplainerCard: NULL }));
vi.mock("@/components/dashboard/antler-signals-card", () => ({ AntlerSignalsCard: NULL }));
vi.mock("@/components/dashboard/accelerator-readiness-card", () => ({ AcceleratorReadinessCard: NULL }));
vi.mock("@/components/founder/tech-intelligence-row", () => ({ TechIntelligenceRow: NULL }));
vi.mock("@/components/workspace/funding-readiness-tile", () => ({ FundingReadinessTile: NULL }));
vi.mock("@/components/workspace/series-a-action-plan", () => ({ SeriesAActionPlan: NULL }));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;
let sb: FakeSupabase;

const ANALYSIS = { id: "an-1", analysis_json: { totalSVI: 64, stageLabel: "Validated", subs: [] }, total_svi: 64, created_at: "2026-09-01", raw_input: "x" };

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  getBalanceMock.mockReset();
  getBalanceMock.mockResolvedValue(12);
  sb = fakeSupabase({
    svi_analyses: [ANALYSIS],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme", current_svi: 64, current_stage: 2 }],
    svi_snapshots: [{ snapshot_date: "2026-09-01", svi_total: 64, delta: 3 }],
    svi_evidence: [{ id: "e1" }, { id: "e2" }, { id: "e3" }],
    report_sections: [],
    scores: [{ id: "s1" }],
    score_views: [{ id: "v1" }, { id: "v2" }],
    user_actions: [],
    tech_analyses: [],
  });
  sbState.sb = sb;
});

describe("/dashboard/svi (S18-B)", () => {
  it("owner: analyses + account under own email (find-or-create), living dashboard editable", async () => {
    const out = await html();
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "evidence")).toBe("3");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (editor): the OWNER's analyses / account / snapshots / evidence; credits, share views + actions stay the CALLER's", async () => {
    state.role = "editor";
    const out = await html();
    // project record → owner key
    expect(sb.hasEq("svi_analyses", "email", state.ownerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(sb.hasEq("svi_snapshots", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
    // per-caller
    expect(getBalanceMock).toHaveBeenCalledWith(state.callerId);
    expect(sb.hasEq("scores", "email", state.callerEmail)).toBe(true);
    expect(sb.hasEq("user_actions", "email", state.callerEmail)).toBe(true);
    // report_sections are per ANALYSIS (review P1) — never filtered by the caller
    expect(sb.hasEq("report_sections", "analysis_id", "an-1")).toBe(true);
    expect(sb.hasEq("report_sections", "user_id", state.callerId)).toBe(false);
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "email")).toBe(state.callerEmail);
    expect(dataAttr(out, "credits")).toBe("12");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member sees the sections the OWNER unlocked as saved (review P1 — no re-buy)", async () => {
    state.role = "editor";
    sb.rows.report_sections = [
      { section_id: "market", depth: "full", content: "## Market", word_count: 900, credits_cost: 0.75, user_id: state.ownerId },
      { section_id: "executive", depth: "summary", content: "## Exec", word_count: 200, credits_cost: 0, user_id: state.ownerId },
    ];
    const out = await html();
    expect(dataAttr(out, "sections")).toBe("market:full,executive:summary");
    expect(sb.hasEq("report_sections", "user_id", state.callerId)).toBe(false);
    expect(sb.hasEq("report_sections", "user_id", state.ownerId)).toBe(false);
  });

  it("member (viewer): same owner data, readOnly + view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
  });

  it("member whose owner has no analysis / account yet: empty state, no svi_accounts insert", async () => {
    state.role = "viewer";
    state.account = null;
    sb.rows.svi_analyses = [];
    const out = await html();
    expect(out).toContain("data-empty");
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("no project: legacy owner path (own email, project_id IS NULL, find-or-create)", async () => {
    state.projectId = null;
    await html();
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(sb.calls.some((c) => c.table === "svi_analyses" && c.op === "is" && c.args[0] === "project_id")).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: null },
    ]);
  });
});
