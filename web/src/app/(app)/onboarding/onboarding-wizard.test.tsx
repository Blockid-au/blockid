import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// G13-W4-IA4 — the single wizard renders 3 steps for both flows. SSR
// render (no DOM): the step reached via `?step=` + persona is asserted by
// its `data-wizard-step` marker, the rail by its labels, and the annual
// interval by the step-3 markers / trial line.

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { OnboardingWizard } from "./onboarding-wizard";

const USER = {
  id: "u-1",
  email: "f@x.test",
  displayName: null,
  createdAt: "",
  lastLoginAt: null,
  role: "user" as const,
  plan: "founder_free",
  googleId: null,
  avatarUrl: null,
  discountPct: null,
  startupName: null,
  startupStage: null,
  industry: null,
  onboardingCompleted: false,
  startupGoals: null,
};

function render(params: Record<string, string>, defaultPersona?: "founder" | "investor_angel" | "investor_vc" | "advisor" | "accelerator") {
  return renderToStaticMarkup(<OnboardingWizard user={USER} initialParams={params} defaultPersona={defaultPersona ?? null} nav={<nav data-nav />} footer={<footer data-footer />} />);
}

const stepMarker = (out: string) => out.match(/data-wizard-step="([a-z-]+)"/)?.[1];

describe("OnboardingWizard — 3 steps × 2 flows (S-IA4 §B.3)", () => {
  it("step 1 is the persona radiogroup with five options and one Continue (both flows)", () => {
    const out = render({});
    expect(out).toContain('data-onboarding-wizard="v4"');
    expect(out).toContain('data-wizard-step="1"');
    expect(stepMarker(out)).toBe("persona");
    expect(out).toContain('role="radiogroup"');
    for (const p of ["founder", "investor_angel", "investor_vc", "advisor", "accelerator"]) expect(out).toContain(`data-persona-option="${p}"`);
    expect(out).toContain('aria-label="Founder"');
    expect(out).toContain('data-testid="wizard-continue"');
    expect(out).not.toContain('data-testid="wizard-back"');
    // rail: 3 labels, step 1 current
    expect(out).toContain('aria-label="Step 1: Who are you"');
    expect(out).toContain('aria-current="step"');
    expect(out).not.toMatch(/Step [4-6]:/);
    // no tier / trial / payment vocabulary anywhere
    expect(out).not.toMatch(/Payment|Choose a plan|Trial consent/);
  });

  it("account persona preselects step 1", () => {
    const out = render({}, "advisor");
    expect(out).toContain('data-persona-option="advisor" data-on="1"');
    expect(out).toContain('data-persona-option="founder" data-on="0"');
  });

  it("founder flow: step 2 = Your startup (create / skip), rail labels founder", () => {
    const out = render({ step: "2", segment: "founder" });
    expect(out).toContain('data-wizard-flow="founder"');
    expect(stepMarker(out)).toBe("startup");
    expect(out).toContain("What are you building?");
    expect(out).toContain('data-testid="wizard-skip"');
    expect(out).toContain('data-testid="wizard-back"');
    expect(out).toContain('aria-label="Step 2: Your startup"');
    expect(out).toContain('aria-label="Step 1: Who are you (completed)"');
    expect(out).toContain("First analysis");
  });

  it("evaluator flow: step 2 = Your mandate (sectors · stages · geos · cheque · min SVI), rail labels evaluator", () => {
    const out = render({ step: "2", persona: "investor_vc" });
    expect(out).toContain('data-wizard-flow="evaluator"');
    expect(stepMarker(out)).toBe("mandate");
    expect(out).toContain('data-chips="sectors"');
    expect(out).toContain('data-chips="stages"');
    expect(out).toContain('data-chips="geographies"');
    expect(out).toContain("Cheque size (A$)");
    expect(out).toContain("Minimum SVI (0–100)");
    expect(out).toContain('aria-label="Step 2: Your mandate"');
    expect(out).toContain("First startup");
    expect(out).not.toContain("What are you building?");
  });

  it("founder step 3: Run analysis → /analyze, skip → /dashboard?onboarding=complete", () => {
    const out = render({ step: "3", segment: "founder" });
    expect(stepMarker(out)).toBe("first-value");
    expect(out).toContain("Run your first analysis");
    expect(out).toContain('data-testid="wizard-continue" data-href="/analyze"');
    expect(out).toContain('data-testid="wizard-skip" data-href="/dashboard?onboarding=complete"');
    expect(out).not.toContain('data-testid="wizard-secondary"');
  });

  it("evaluator step 3: Add a startup → /workspace/evaluations?add=1, Startup Index secondary, skip → persona landing", () => {
    const out = render({ step: "3", persona: "accelerator" });
    expect(out).toContain("Add the first startup you&#x27;re evaluating");
    expect(out).toContain('data-testid="wizard-continue" data-href="/workspace/evaluations?add=1"');
    expect(out).toContain('data-testid="wizard-secondary" data-href="/startup-index"');
    expect(out).toContain('data-testid="wizard-skip" data-href="/workspace/accelerator?onboarding=complete"');
  });

  it("pricing-card hand-off: ?plan=&interval=annual survives to step 3 — primary is the trial → Billing with interval=annual", () => {
    const out = render({ step: "3", segment: "investor_angel", plan: "investor_angel", interval: "annual", trial: "1" });
    expect(out).toContain('data-wizard-interval="annual"');
    expect(out).toContain('data-testid="wizard-continue" data-href="/workspace/billing?plan=investor_angel&amp;interval=annual"');
    expect(out).toContain("Start your Scout trial");
    expect(out).toContain("Annual billing after the trial");
    expect(out).toContain('data-testid="wizard-secondary" data-href="/workspace/evaluations?add=1"');
  });

  it("monthly hand-off has no interval param", () => {
    const out = render({ step: "3", segment: "founder", plan: "founder_growth" });
    expect(out).toContain('data-wizard-interval="monthly"');
    expect(out).toContain('data-href="/workspace/billing?plan=founder_growth"');
    expect(out).toContain("Monthly billing after the trial");
  });

  it("a ?step=2 without any persona falls back to step 1", () => {
    const out = render({ step: "2" });
    expect(stepMarker(out)).toBe("persona");
  });

  it("nav / footer slots render inside the lux wrapper; signed-in line", () => {
    const out = render({});
    expect(out).toMatch(/data-theme="lux"[\s\S]*<nav data-nav[\s\S]*<footer data-footer/);
    expect(out).toContain("Signed in as f@x.test");
  });
});
