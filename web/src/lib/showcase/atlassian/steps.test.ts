import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ATLASSIAN_WALKTHROUGH,
  ATLASSIAN_WALKTHROUGH_TOTAL,
  ATLASSIAN_WALKTHROUGH_EXIT_PATH,
  buildStepUrl,
  formatStepHeading,
  getNextStep,
  getPrevStep,
  getStepByNumber,
  keyToNavAction,
} from "./steps";

// Resolves the /web app root — steps.ts sits at web/src/lib/showcase/atlassian,
// so climb four levels to reach /web then descend into src/app for the
// route-resolution guard at the bottom of this file.
const APP_ROOT = path.resolve(__dirname, "../../..", "app");

function routeResolves(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  const segments = pathname.slice(1).split("/").filter(Boolean);
  let dir = APP_ROOT;
  for (const seg of segments) {
    const exact = path.join(dir, seg);
    if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }
    // App Router dynamic segment: look for a single [param] sibling.
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    const dynSib = fs
      .readdirSync(dir)
      .find((entry) => entry.startsWith("[") && entry.endsWith("]"));
    if (!dynSib) return false;
    dir = path.join(dir, dynSib);
  }
  return true;
}

describe("ATLASSIAN_WALKTHROUGH registry", () => {
  it("has exactly 9 steps matching P9_ship success criterion", () => {
    // docs/plans/atlassian-standard-mapping-goal.md P9_ship exit_criteria
    // ("E2E playwright spec proves 9-step logged-out walkthrough") pins the
    // walkthrough length at 9 — any change here must be intentional.
    expect(ATLASSIAN_WALKTHROUGH).toHaveLength(9);
    expect(ATLASSIAN_WALKTHROUGH_TOTAL).toBe(9);
  });

  it("numbers steps 1..N consecutively without gaps", () => {
    const ns = ATLASSIAN_WALKTHROUGH.map((s) => s.n);
    expect(ns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("has non-empty title / guideText / phaseSlug / path on every step", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.guideText.length).toBeGreaterThan(0);
      expect(step.phaseSlug.length).toBeGreaterThan(0);
      expect(step.path.length).toBeGreaterThan(0);
    }
  });

  it("every path is rooted at /showcase/atlassian", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(step.path.startsWith("/showcase/atlassian")).toBe(true);
    }
  });

  it("every phaseSlug is a numeric string in 1..12 (matches PHASE_LABELS)", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      const n = Number(step.phaseSlug);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("all step paths are unique", () => {
    const paths = ATLASSIAN_WALKTHROUGH.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every step path resolves to an App Router folder (exact or [dynamic] sibling)", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(
        routeResolves(step.path),
        `route not resolvable: ${step.path}`,
      ).toBe(true);
    }
  });

  it("exit path returns the viewer to the showcase landing page", () => {
    expect(ATLASSIAN_WALKTHROUGH_EXIT_PATH).toBe("/showcase/atlassian");
    expect(routeResolves(ATLASSIAN_WALKTHROUGH_EXIT_PATH)).toBe(true);
  });
});

describe("getStepByNumber", () => {
  it("returns the matching step for a valid number", () => {
    expect(getStepByNumber(1)?.path).toBe("/showcase/atlassian");
    expect(getStepByNumber(9)?.title).toContain("Wrap-up");
  });

  it("returns null for out-of-range numbers (0, -1, 10, 100)", () => {
    expect(getStepByNumber(0)).toBeNull();
    expect(getStepByNumber(-1)).toBeNull();
    expect(getStepByNumber(10)).toBeNull();
    expect(getStepByNumber(100)).toBeNull();
  });
});

describe("getPrevStep / getNextStep", () => {
  it("getPrevStep(1) returns null (no step before the first)", () => {
    expect(getPrevStep(1)).toBeNull();
  });

  it("getPrevStep(N) returns the step with n=N-1 for 2..TOTAL", () => {
    for (let n = 2; n <= ATLASSIAN_WALKTHROUGH_TOTAL; n += 1) {
      expect(getPrevStep(n)?.n).toBe(n - 1);
    }
  });

  it("getNextStep(TOTAL) returns null (no step after the last)", () => {
    expect(getNextStep(ATLASSIAN_WALKTHROUGH_TOTAL)).toBeNull();
  });

  it("getNextStep(N) returns the step with n=N+1 for 1..TOTAL-1", () => {
    for (let n = 1; n < ATLASSIAN_WALKTHROUGH_TOTAL; n += 1) {
      expect(getNextStep(n)?.n).toBe(n + 1);
    }
  });

  it("getPrevStep clamps early: negative currentN also returns null", () => {
    expect(getPrevStep(0)).toBeNull();
    expect(getPrevStep(-5)).toBeNull();
  });

  it("getNextStep clamps late: currentN >= TOTAL returns null", () => {
    expect(getNextStep(ATLASSIAN_WALKTHROUGH_TOTAL + 1)).toBeNull();
    expect(getNextStep(999)).toBeNull();
  });
});

describe("buildStepUrl", () => {
  it("appends ?step=N to the step path", () => {
    const step = getStepByNumber(2);
    expect(step).not.toBeNull();
    expect(buildStepUrl(step!)).toBe("/showcase/atlassian/dashboard?step=2");
  });

  it("uses the step's own n as the query value on every step", () => {
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(buildStepUrl(step)).toBe(`${step.path}?step=${step.n}`);
    }
  });
});

describe("formatStepHeading", () => {
  it("renders 'Step N of TOTAL — Title' with the default total", () => {
    const step = getStepByNumber(1)!;
    expect(formatStepHeading(step)).toBe(
      `Step 1 of ${ATLASSIAN_WALKTHROUGH_TOTAL} — ${step.title}`,
    );
  });

  it("respects an explicit total override (useful for filtered walkthroughs)", () => {
    const step = getStepByNumber(3)!;
    expect(formatStepHeading(step, 5)).toBe(`Step 3 of 5 — ${step.title}`);
  });
});

describe("keyToNavAction", () => {
  it("ArrowRight from a non-terminal step yields a next intent", () => {
    const action = keyToNavAction("ArrowRight", 1);
    expect(action).not.toBeNull();
    expect(action!.kind).toBe("next");
    if (action!.kind === "next") expect(action.target.n).toBe(2);
  });

  it("ArrowRight from the last step yields null", () => {
    expect(keyToNavAction("ArrowRight", ATLASSIAN_WALKTHROUGH_TOTAL)).toBeNull();
  });

  it("ArrowLeft from the first step yields null", () => {
    expect(keyToNavAction("ArrowLeft", 1)).toBeNull();
  });

  it("ArrowLeft from a mid step yields a prev intent", () => {
    const action = keyToNavAction("ArrowLeft", 5);
    expect(action).not.toBeNull();
    expect(action!.kind).toBe("prev");
    if (action!.kind === "prev") expect(action.target.n).toBe(4);
  });

  it("Escape yields an exit intent pointing at ATLASSIAN_WALKTHROUGH_EXIT_PATH", () => {
    const action = keyToNavAction("Escape", 4);
    expect(action).not.toBeNull();
    expect(action!.kind).toBe("exit");
    if (action!.kind === "exit") {
      expect(action.targetPath).toBe(ATLASSIAN_WALKTHROUGH_EXIT_PATH);
    }
  });

  it("returns null for unhandled keys so the browser handles them", () => {
    expect(keyToNavAction("Enter", 3)).toBeNull();
    expect(keyToNavAction("a", 3)).toBeNull();
    expect(keyToNavAction(" ", 3)).toBeNull();
    expect(keyToNavAction("Tab", 3)).toBeNull();
  });

  it("Escape fires the exit intent even at the last step (unaffected by boundary)", () => {
    const action = keyToNavAction("Escape", ATLASSIAN_WALKTHROUGH_TOTAL);
    expect(action).not.toBeNull();
    expect(action!.kind).toBe("exit");
  });

  it("ArrowLeft at currentN=2 lands on the landing step (n=1)", () => {
    const action = keyToNavAction("ArrowLeft", 2);
    expect(action).not.toBeNull();
    if (action!.kind === "prev") {
      expect(action.target.n).toBe(1);
      expect(action.target.path).toBe("/showcase/atlassian");
    }
  });
});
