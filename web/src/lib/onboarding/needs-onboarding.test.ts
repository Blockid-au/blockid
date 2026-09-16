import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { decideOnboarding, needsOnboarding, type OnboardingFacts } from "./needs-onboarding";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const base: OnboardingFacts = { persona: "founder", onboardingCompleted: false, analysisCount: 0, evaluationCount: 0, isMember: false };

describe("decideOnboarding — pure per-persona rule (S-IA4 §B.3)", () => {
  it("founder: not completed + no analysis + not a member → wizard", () => {
    expect(decideOnboarding(base)).toBe(true);
  });
  it("founder: any analysis on record → no wizard", () => {
    expect(decideOnboarding({ ...base, analysisCount: 1 })).toBe(false);
  });
  it("founder: completed flag → no wizard even with nothing scored", () => {
    expect(decideOnboarding({ ...base, onboardingCompleted: true })).toBe(false);
  });
  it("founder: a project member is never bounced (S18-B P2-6)", () => {
    expect(decideOnboarding({ ...base, isMember: true })).toBe(false);
  });
  it("evaluators: not completed + zero evaluations → wizard; one evaluation → done", () => {
    for (const persona of ["investor_angel", "investor_vc", "advisor", "accelerator"] as const) {
      expect(decideOnboarding({ ...base, persona }), persona).toBe(true);
      expect(decideOnboarding({ ...base, persona, evaluationCount: 1 }), `${persona} +eval`).toBe(false);
      expect(decideOnboarding({ ...base, persona, onboardingCompleted: true }), `${persona} completed`).toBe(false);
    }
  });
  it("evaluators ignore the founder analysis / member facts", () => {
    expect(decideOnboarding({ ...base, persona: "advisor", analysisCount: 5, isMember: true })).toBe(true);
  });
  it("flow=none personas never see the wizard", () => {
    for (const persona of ["reseller", "mentor", "innovator", "journalist", "admin"] as const) {
      expect(decideOnboarding({ ...base, persona }), persona).toBe(false);
    }
  });
});

describe("needsOnboarding — reads only what the flow needs", () => {
  const user = { id: "u-1", email: "f@x.test", onboardingCompleted: false };

  it("founder with nothing scored → true; reads svi_analyses by email then analyses by user id", async () => {
    const sb = fakeSupabase({ svi_analyses: [], analyses: [] });
    expect(await needsOnboarding({ user, persona: "founder", supabase: sb })).toBe(true);
    expect(sb.hasEq("svi_analyses", "email", "f@x.test")).toBe(true);
    expect(sb.hasEq("analyses", "user_id", "u-1")).toBe(true);
    expect(sb.find("evaluations", "select")).toEqual([]);
  });

  it("founder with a scored analysis → false without touching `analyses`", async () => {
    const sb = fakeSupabase({ svi_analyses: [{ id: "a" }] });
    expect(await needsOnboarding({ user, persona: "founder", supabase: sb })).toBe(false);
    expect(sb.find("analyses", "select")).toEqual([]);
  });

  it("founder member → false with zero reads", async () => {
    const sb = fakeSupabase({ svi_analyses: [] });
    expect(await needsOnboarding({ user, persona: "founder", isMember: true, supabase: sb })).toBe(false);
    expect(sb.calls).toEqual([]);
  });

  it("completed (from the page's app_users read) → false with zero reads", async () => {
    const sb = fakeSupabase({});
    expect(await needsOnboarding({ user, persona: "investor_vc", onboardingCompleted: true, supabase: sb })).toBe(false);
    expect(sb.calls).toEqual([]);
  });

  it("evaluator with no evaluations → true; reads evaluations by evaluator_user_id only", async () => {
    const sb = fakeSupabase({ evaluations: [] });
    expect(await needsOnboarding({ user, persona: "investor_angel", supabase: sb })).toBe(true);
    expect(sb.hasEq("evaluations", "evaluator_user_id", "u-1")).toBe(true);
    expect(sb.find("svi_analyses", "select")).toEqual([]);
  });

  it("evaluator holding an evaluation → false", async () => {
    const sb = fakeSupabase({ evaluations: [{ id: "e1" }] });
    expect(await needsOnboarding({ user, persona: "accelerator", supabase: sb })).toBe(false);
  });

  it("no Supabase → never traps the user (false)", async () => {
    expect(await needsOnboarding({ user, persona: "founder", supabase: null })).toBe(false);
    expect(await needsOnboarding({ user, persona: "advisor", supabase: null })).toBe(false);
  });

  it("flow=none → false with zero reads", async () => {
    const sb = fakeSupabase({});
    expect(await needsOnboarding({ user, persona: "reseller", supabase: sb })).toBe(false);
    expect(sb.calls).toEqual([]);
  });
});
