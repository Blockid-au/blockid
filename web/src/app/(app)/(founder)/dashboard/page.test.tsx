import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B review P2-8 — render test for /dashboard (the largest converted
// page), mirroring dashboard/svi/page.test.tsx. Pins:
//   owner    → own record (find-or-create), editable, onboarding redirect
//              still fires for a fresh owner with no analysis
//   member   → the OWNER's analyses / account / snapshots / evidence /
//              cap table / criteria; credits, share views + actions the
//              CALLER's; report_sections per ANALYSIS (P1); Money Radar
//              keyed on the owner with the caller-pays note (P2-7); never
//              bounced to onboarding (P2-6); never inserts svi_accounts
//   viewer   → readOnly on LivingSVIDashboard + the view-only note
//   no proj  → legacy owner path

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
const userState = vi.hoisted(() => ({ onboardingCompleted: true }));
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return {
    getCurrentUser: async () => ({ ...founderUser(await scopeState), onboardingCompleted: userState.onboardingCompleted }),
  };
});
const getBalanceMock = vi.fn();
vi.mock("@/lib/credits", () => ({ getBalance: (id: string) => getBalanceMock(id) }));
const tileMock = vi.fn();
vi.mock("@/lib/funding/tile-data", () => ({
  getMoneyRadarTileData: (...a: unknown[]) => tileMock(...a),
}));
vi.mock("@/lib/analysis/aggregate-startup-summary", () => ({ getAllStartupSummaries: async () => [] }));
vi.mock("@/lib/onboarding-steps", () => ({ getCompletedOnboardingSteps: async () => [] }));
vi.mock("@/lib/github", () => ({ fetchRepoStats: async () => null, parseRepoInput: () => null }));
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
  LivingSVIDashboard: (p: {
    readOnly?: boolean;
    userEmail: string;
    creditBalance: number;
    evidenceCount: number;
    shareViews: number;
    analysis: { totalSVI: number };
    savedSections?: Array<{ section_id: string; depth: string }>;
  }) => (
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
vi.mock("@/components/dashboard/money-radar-tile", () => ({
  MoneyRadarTile: (p: { data: { state: string }; creditNote?: string | null }) => (
    <div data-radar data-radar-state={p.data.state} data-radar-note={p.creditNote ?? ""} />
  ),
}));
const NULL = () => null;
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: NULL }));
vi.mock("@/components/dashboard/onboarding-welcome-modal", () => ({ OnboardingWelcomeModal: NULL }));
vi.mock("@/components/role/role-landing-intro", () => ({ RoleLandingIntro: NULL }));
vi.mock("@/components/dashboard/journey-bar", () => ({ JourneyBar: NULL }));
vi.mock("@/components/dashboard/journey-step-ladder", () => ({ JourneyStepLadder: NULL }));
vi.mock("@/components/dashboard/growth-roadmap", () => ({ GrowthRoadmap: NULL }));
vi.mock("@/components/dashboard/growth-progress-dashboard", () => ({ GrowthProgressDashboard: NULL }));
vi.mock("@/components/dashboard/cap-table-mini", () => ({ CapTableMini: NULL }));
vi.mock("@/components/dashboard/activity-feed", () => ({ ActivityFeed: NULL }));
vi.mock("@/components/dashboard/status-cards", () => ({ StatusCards: NULL }));
vi.mock("@/components/dashboard/scn-position-hero", () => ({ ScnPositionHero: NULL }));
vi.mock("@/components/dashboard/scn-direction-navigator", () => ({ ScnDirectionNavigator: NULL }));
vi.mock("@/components/dashboard/ai-confidence-action-plan", () => ({ AIConfidenceActionPlan: NULL }));
vi.mock("@/components/dashboard/github-evidence-card", () => ({ GitHubEvidenceCard: NULL }));
vi.mock("@/components/svi/score-history-chart", () => ({ ScoreHistoryChart: NULL }));
vi.mock("@/components/dashboard/ai-evaluation-summary", () => ({ AIEvaluationSummary: NULL }));
vi.mock("@/components/dashboard/value-impact-banner", () => ({ ValueImpactBanner: NULL }));
vi.mock("@/components/dashboard/svi-dimension-chart", () => ({ SviDimensionChart: NULL }));
vi.mock("@/components/dashboard/data-room-readiness-card", () => ({ DataRoomReadinessCard: NULL }));
vi.mock("@/components/dashboard/next-unlock-card", () => ({ NextUnlockCard: NULL }));
vi.mock("@/components/dashboard/widget-grid", () => ({ WidgetGrid: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/founder/revenue-tracker-tile", () => ({ RevenueTrackerTile: NULL }));
vi.mock("@/components/founder/health-score-widget", () => ({ HealthScoreWidget: NULL }));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(sp: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve(sp) }));
}

const state = await scopeState;
let sb: FakeSupabase;

const ANALYSIS = {
  id: "an-1",
  analysis_json: { totalSVI: 64, stageLabel: "Validated", stage: 2, subs: [], summary: "s" },
  total_svi: 64,
  created_at: "2026-09-01",
  raw_input: "x",
  input_type: "text",
};

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.accountId = "acct-1";
  state.calls.length = 0;
  userState.onboardingCompleted = true;
  getBalanceMock.mockReset();
  getBalanceMock.mockResolvedValue(12);
  tileMock.mockReset();
  tileMock.mockResolvedValue({ state: "buyer" });
  sb = fakeSupabase({
    svi_analyses: [ANALYSIS],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme", current_svi: 64, current_stage: 2 }],
    svi_snapshots: [{ snapshot_date: "2026-09-01", svi_total: 64, delta: 3 }],
    svi_evidence: [{ id: "e1" }, { id: "e2" }, { id: "e3" }],
    report_sections: [],
    scores: [{ id: "s1" }],
    score_views: [{ id: "v1" }, { id: "v2" }],
    user_actions: [],
    shareholders: [],
    evaluation_criteria: [],
  });
  sbState.sb = sb;
});

describe("/dashboard (S18-B)", () => {
  it("owner: analyses + account under own email (find-or-create), editable, tile keyed on self, no note", async () => {
    const out = await html();
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "project_id", "proj-1")).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(sb.hasEq("svi_accounts", "id", "acct-1")).toBe(true);
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "evidence")).toBe("3");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
    // Money Radar: owner keys = self, no credit note
    expect(tileMock).toHaveBeenCalledTimes(1);
    expect(tileMock.mock.calls[0][3]).toEqual({ ownerUserId: state.callerId, dataEmail: state.callerEmail });
    expect(dataAttr(out, "radar-state")).toBe("buyer");
    expect(dataAttr(out, "radar-note")).toBe("");
  });

  it("member (editor): the OWNER's record everywhere; credits, share views + actions the CALLER's; sections per analysis; radar on owner + caller-pays note", async () => {
    state.role = "editor";
    sb.rows.report_sections = [{ section_id: "market", depth: "full", content: "## M", word_count: 900, credits_cost: 0.75, user_id: state.ownerId }];
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
    expect(sb.hasEq("shareholders", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("evaluation_criteria", "account_id", "acct-1")).toBe(true);
    // per-caller
    expect(getBalanceMock).toHaveBeenCalledWith(state.callerId);
    expect(sb.hasEq("scores", "email", state.callerEmail)).toBe(true);
    expect(sb.hasEq("user_actions", "email", state.callerEmail)).toBe(true);
    // P1: report_sections per ANALYSIS, never filtered by the caller
    expect(sb.hasEq("report_sections", "analysis_id", "an-1")).toBe(true);
    expect(sb.hasEq("report_sections", "user_id", state.callerId)).toBe(false);
    expect(dataAttr(out, "sections")).toBe("market:full");
    // P2-7: Money Radar keyed on the owner, caller-pays note on the tile
    expect(tileMock.mock.calls[0][3]).toEqual({ ownerUserId: state.ownerId, dataEmail: state.ownerEmail });
    expect(dataAttr(out, "radar-note")).toContain("your own credits");
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "email")).toBe(state.callerEmail);
    expect(dataAttr(out, "credits")).toBe("12");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("member (viewer): same owner data, readOnly + view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(dataAttr(out, "svi")).toBe("64");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
  });

  it("P2-6: a member who has not completed onboarding is NOT bounced to /dashboard/onboarding", async () => {
    state.role = "editor";
    userState.onboardingCompleted = false;
    const out = await html();
    expect(out).toContain("data-living");
    // the caller-email svi_analyses count for the redirect never ran
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
  });

  it("owner who has not completed onboarding and has no analysis IS redirected (unchanged)", async () => {
    userState.onboardingCompleted = false;
    sb.rows.svi_analyses = [];
    await expect(html()).rejects.toThrow("REDIRECT:/dashboard/onboarding");
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
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
    expect(tileMock.mock.calls[0][1]).toBeNull();
    expect(tileMock.mock.calls[0][3]).toEqual({ ownerUserId: state.callerId, dataEmail: state.callerEmail });
  });

  it("a failed Money Radar read never breaks the dashboard", async () => {
    tileMock.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await html();
    expect(out).toContain("data-living");
    expect(out).not.toContain("data-radar");
    warn.mockRestore();
  });
});
