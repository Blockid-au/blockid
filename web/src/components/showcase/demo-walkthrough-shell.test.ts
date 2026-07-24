// Unit tests for the DemoWalkthroughShell — exercised through the pure
// navigation helpers the shell delegates to. The shell itself only wires
// these helpers into a router.push / addEventListener plumbing, so testing
// the helpers is testing the shell's behaviour without dragging JSDOM or
// @testing-library into a repo that ships neither.
//
// Test file is co-located under src/ so the existing vitest include
// (src/**/*.test.ts) picks it up — matching the convention set by
// data-room-templates.test.ts, gallery.test.ts, and every other unit
// test in this codebase.
//
// Cases covered:
//   1. formatStepHeading returns 'Step 3 of 9 — <title>' for currentStep=3.
//   2. Prev button target for step 3 is step 2's URL.
//   3. Next button target for step 3 is step 4's URL.
//   4. ArrowRight keydown resolves to a 'next' action pointing at step N+1.
//   5. ArrowLeft keydown resolves to a 'prev' action pointing at step N-1.
//   6. Escape returns to /showcase/atlassian.
//   7. Prev on step 1 is null (button becomes disabled).
//   8. Next on the last step is null (button becomes disabled).
//   9. Non-navigation keys return null (no hijack).

import { describe, expect, it } from "vitest";
import {
  ATLASSIAN_WALKTHROUGH,
  ATLASSIAN_WALKTHROUGH_EXIT_PATH,
  ATLASSIAN_WALKTHROUGH_TOTAL,
  buildStepUrl,
  formatStepHeading,
  getNextStep,
  getPrevStep,
  getStepByNumber,
  keyToNavAction,
} from "@/lib/showcase/atlassian/steps";

describe("DemoWalkthroughShell — step navigation contract", () => {
  it("formats 'Step 3 of 9 — <title>' for currentStep=3", () => {
    const step = getStepByNumber(3);
    expect(step).not.toBeNull();
    const heading = formatStepHeading(step!);
    expect(heading.startsWith("Step 3 of 9 — ")).toBe(true);
    expect(heading).toContain(step!.title);
  });

  it("uses the registry length as the default total (9)", () => {
    expect(ATLASSIAN_WALKTHROUGH_TOTAL).toBe(9);
    expect(ATLASSIAN_WALKTHROUGH).toHaveLength(9);
  });

  it("prev button on step 3 navigates to step 2's URL", () => {
    const prev = getPrevStep(3);
    expect(prev).not.toBeNull();
    expect(prev!.n).toBe(2);
    expect(buildStepUrl(prev!)).toBe("/showcase/atlassian/dashboard?step=2");
  });

  it("next button on step 3 navigates to step 4's URL", () => {
    const next = getNextStep(3);
    expect(next).not.toBeNull();
    expect(next!.n).toBe(4);
    expect(buildStepUrl(next!)).toBe("/showcase/atlassian/growth-phases?step=4");
  });

  it("ArrowRight keydown resolves to a next action pointing at step N+1", () => {
    const action = keyToNavAction("ArrowRight", 4);
    if (action === null) throw new Error("expected non-null action");
    expect(action.kind).toBe("next");
    if (action.kind === "next") {
      expect(action.target.n).toBe(5);
      expect(buildStepUrl(action.target)).toBe(
        "/showcase/atlassian/agents/ceo?step=5",
      );
    }
  });

  it("ArrowLeft keydown resolves to a prev action pointing at step N-1", () => {
    const action = keyToNavAction("ArrowLeft", 4);
    if (action === null) throw new Error("expected non-null action");
    expect(action.kind).toBe("prev");
    if (action.kind === "prev") {
      expect(action.target.n).toBe(3);
    }
  });

  it("Escape returns to /showcase/atlassian", () => {
    const action = keyToNavAction("Escape", 5);
    if (action === null) throw new Error("expected non-null action");
    expect(action.kind).toBe("exit");
    if (action.kind === "exit") {
      expect(action.targetPath).toBe(ATLASSIAN_WALKTHROUGH_EXIT_PATH);
      expect(action.targetPath).toBe("/showcase/atlassian");
    }
  });

  it("prev on step 1 returns null (button disabled at first step)", () => {
    expect(getPrevStep(1)).toBeNull();
    // ArrowLeft on step 1 also returns null so the shell won't preventDefault.
    expect(keyToNavAction("ArrowLeft", 1)).toBeNull();
  });

  it("next on the last step returns null (button disabled at end)", () => {
    expect(getNextStep(ATLASSIAN_WALKTHROUGH_TOTAL)).toBeNull();
    expect(keyToNavAction("ArrowRight", ATLASSIAN_WALKTHROUGH_TOTAL)).toBeNull();
  });

  it("non-navigation keys return null so the shell doesn't hijack them", () => {
    expect(keyToNavAction("Enter", 3)).toBeNull();
    expect(keyToNavAction(" ", 3)).toBeNull();
    expect(keyToNavAction("a", 3)).toBeNull();
    expect(keyToNavAction("Tab", 3)).toBeNull();
  });

  it("every registered step exposes a non-empty guideText", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(step.guideText.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.path.startsWith("/showcase/atlassian")).toBe(true);
    }
  });
});
