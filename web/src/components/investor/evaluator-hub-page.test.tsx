import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G13-W4-IA4 — the shared evaluator hub page: auth → persona → onboarding
// gate → landing. Loaders and the shell are mocked; the persona read and
// the gate reads go through the fake Supabase so their keys are pinned.

const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
const userState = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => userState.user }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: (p: { page: string }) => <div data-page={p.page} /> }));
vi.mock("@/components/workspace/workspace-layout", () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div> }));
vi.mock("@/components/access/FeatureGate", () => ({ FeatureGate: ({ children, feature }: { children: React.ReactNode; feature: string }) => <div data-gate={feature}>{children}</div> }));
const loadMock = vi.fn();
vi.mock("@/lib/investors/landing-data", async () => {
  const real = await vi.importActual<typeof import("@/lib/investors/landing-data")>("@/lib/investors/landing-data");
  return { ...real, loadInvestorLanding: (...a: unknown[]) => loadMock(...a) };
});
vi.mock("./investor-landing", () => ({ InvestorLanding: (p: { data: { persona: string } }) => <div data-landing={p.data.persona} /> }));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/founder-page-harness";
import { EvaluatorHubPage } from "./evaluator-hub-page";

let sb: FakeSupabase;
const USER = { id: "u-1", email: "e@x.test", role: "user", plan: "investor_angel", displayName: "E", onboardingCompleted: true };

async function html(route: "investor" | "advisor" | "accelerator", sp: Record<string, string> = {}) {
  return renderPage(EvaluatorHubPage({ route, searchParams: Promise.resolve(sp) }));
}

beforeEach(() => {
  userState.user = { ...USER };
  loadMock.mockReset();
  loadMock.mockImplementation(async (_u: unknown, persona: string) => ({ persona }));
  sb = fakeSupabase({ app_users: [{ account_type: "investor_angel", segment: null, onboarding_completed: true }], evaluations: [{ id: "ev-1" }] });
  sbState.sb = sb;
});

describe("EvaluatorHubPage", () => {
  it("anonymous → login with next=/workspace/<route>", async () => {
    userState.user = null;
    await expect(html("advisor")).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/advisor");
  });

  it("angel on /workspace/investor: persona read by id, landing rendered ungated, page tracker per route", async () => {
    const out = await html("investor");
    expect(sb.hasEq("app_users", "id", "u-1")).toBe(true);
    expect(out).toContain('data-landing="investor_angel"');
    expect(out).toContain('data-page="workspace-investor"');
    expect(out).not.toContain("data-gate");
    expect(loadMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" }), "investor_angel");
  });

  it("VC on /workspace/investor keeps the VC persona; anyone on /workspace/advisor|accelerator gets that route's variant", async () => {
    sb.rows.app_users = [{ account_type: "investor_vc", segment: null, onboarding_completed: true }];
    expect(await html("investor")).toContain('data-landing="investor_vc"');
    expect(await html("advisor")).toContain('data-landing="advisor"');
    expect(await html("accelerator")).toContain('data-landing="accelerator"');
  });

  it("evaluator who has not completed onboarding and holds no evaluation → /onboarding", async () => {
    userState.user = { ...USER, onboardingCompleted: false };
    sb.rows.app_users = [{ account_type: "advisor", segment: null, onboarding_completed: false }];
    sb.rows.evaluations = [];
    await expect(html("advisor")).rejects.toThrow("REDIRECT:/onboarding");
    expect(sb.hasEq("evaluations", "evaluator_user_id", "u-1")).toBe(true);
  });

  it("evaluator who already holds an evaluation is not bounced even with the flag unset", async () => {
    userState.user = { ...USER, onboardingCompleted: false };
    sb.rows.app_users = [{ account_type: "advisor", segment: null, onboarding_completed: false }];
    const out = await html("advisor");
    expect(out).toContain('data-landing="advisor"');
  });

  it("a founder persona on the URL is wrapped in the investor.dealflow FeatureGate and never sent to the evaluator wizard", async () => {
    userState.user = { ...USER, onboardingCompleted: false, plan: "founder_free" };
    sb.rows.app_users = [{ account_type: "founder", segment: "founder", onboarding_completed: false }];
    sb.rows.evaluations = [];
    const out = await html("investor");
    expect(out).toContain('data-gate="investor.dealflow"');
    expect(out).toContain('data-landing="investor_angel"');
  });

  it("?onboarding=complete renders the one welcome banner", async () => {
    const out = await html("accelerator", { onboarding: "complete" });
    expect(out).toContain('data-landing-banner="onboarding"');
    expect(out).toContain("This is your accelerator desk.");
    expect(await html("accelerator")).not.toContain("data-landing-banner");
  });
});
