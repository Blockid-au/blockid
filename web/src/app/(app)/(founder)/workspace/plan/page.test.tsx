import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G13-W3-IA3 — /workspace/plan is the Action plan hub root and the new home
// of the ladder / direction / action-plan / growth widgets moved off the
// founder landing (spec §B.2). Pins: the ladder always mounts (coarse nav
// phase), the direction navigator always has three steps, the action-plan
// card mounts only with an analysis, and the S18-B member facts hold
// (owner's record, no svi_accounts insert for a member).

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
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children, currentPhase }: { children: React.ReactNode; currentPhase?: number }) => (
    <div data-shell data-shell-phase={currentPhase}>{children}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const NULL = () => null;
vi.mock("@/components/workspace/roadmap-steps", () => ({ RoadmapSteps: (p: { completedSteps: number[] }) => <div data-roadmap-steps={p.completedSteps.join(",")} /> }));
vi.mock("@/components/workspace/platform-roadmap", () => ({ PlatformRoadmap: NULL }));
vi.mock("@/components/dashboard/journey-step-ladder", () => ({
  JourneyStepLadder: (p: { currentPhase: number; mode?: string }) => <div data-ladder data-ladder-phase={p.currentPhase} data-ladder-mode={p.mode} />,
}));
vi.mock("@/components/dashboard/scn-direction-navigator", () => ({
  ScnDirectionNavigator: (p: { stageLabel: string; steps: unknown[] }) => <div data-direction data-direction-stage={p.stageLabel} data-direction-steps={p.steps.length} />,
}));
vi.mock("@/components/dashboard/scn-action-plan-card", () => ({ ScnActionPlanCard: () => <div data-action-plan /> }));
vi.mock("@/components/dashboard/growth-roadmap", () => ({ GrowthRoadmap: (p: { currentPhase: number }) => <div data-growth-roadmap={p.currentPhase} /> }));
vi.mock("@/components/dashboard/growth-progress-dashboard", () => ({ GrowthProgressDashboard: () => <div data-growth-progress /> }));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;
let sb: FakeSupabase;

const ANALYSIS = { id: "an-1", analysis_json: { totalSVI: 64, stageLabel: "Validated", stage: 2, subs: [], nextActions: [] }, total_svi: 64, created_at: "2026-09-01" };

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.accountId = "acct-1";
  state.calls.length = 0;
  sb = fakeSupabase({
    svi_analyses: [ANALYSIS],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme" }],
    svi_snapshots: [],
    svi_evidence: [{ evidence_type: "public_url", label: "site", dimension: "mpc" }],
  });
  sbState.sb = sb;
});

describe("/workspace/plan (G13-W3-IA3)", () => {
  it("owner: ladder (coarse nav phase), 3-step direction, action-plan card, growth widgets, roadmap steps", async () => {
    const out = await html();
    expect(out).toContain("data-workspace-plan");
    expect(dataAttr(out, "ladder-mode")).toBe("coarse");
    expect(dataAttr(out, "ladder-phase")).toBe("2"); // SVI 64 → band 2
    expect(dataAttr(out, "shell-phase")).toBe("2");
    expect(dataAttr(out, "direction-steps")).toBe("3");
    expect(dataAttr(out, "direction-stage")).toBe("Validated");
    expect(out).toContain("data-action-plan");
    expect(dataAttr(out, "growth-roadmap")).toBe("2");
    expect(out).toContain("data-growth-progress");
    expect(dataAttr(out, "roadmap-steps")).toBe("1,2");
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([{ fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" }]);
  });

  it("no analysis: the ladder + direction fallback still render, the action-plan card does not", async () => {
    sb.rows.svi_analyses = [];
    const out = await html();
    expect(dataAttr(out, "ladder-phase")).toBe("0");
    expect(dataAttr(out, "direction-steps")).toBe("3");
    expect(dataAttr(out, "direction-stage")).toBe("Idea");
    expect(out).not.toContain("data-action-plan");
  });

  it("member: the OWNER's record, never a split svi_accounts row", async () => {
    state.role = "viewer";
    const out = await html();
    expect(out).toContain("data-ladder");
    expect(sb.hasEq("svi_analyses", "email", state.ownerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });
});
