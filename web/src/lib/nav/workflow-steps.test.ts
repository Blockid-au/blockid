// Unit test for the pure workflow-step catalogue + phase mapper.
//
// Colocated per vitest.config.ts include glob. Pins the 6-step canonical
// ordering, the PHASE_TO_STEP / STEP_TO_PHASE inverse round-trip, the
// STEP_LABEL ≤12-char UI budget, and the currentPhaseToStep branch matrix
// including the documented quirk where the 6-bucket and legacy 12-phase
// domains overlap on 1..5 and resolve via the 6-bucket table.

import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STEPS,
  PHASE_TO_STEP,
  STEP_TO_PHASE,
  STEP_LABEL,
  currentPhaseToStep,
  type WorkflowStep,
  type GrowthPhase,
} from "@/lib/nav/workflow-steps";

describe("WORKFLOW_STEPS", () => {
  it("has exactly 6 steps in canonical order", () => {
    expect(WORKFLOW_STEPS).toEqual([
      "ideate",
      "validate",
      "build",
      "fundraise",
      "grow",
      "exit",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(WORKFLOW_STEPS).size).toBe(WORKFLOW_STEPS.length);
  });
});

describe("PHASE_TO_STEP", () => {
  it("covers all six growthPhase keys 0..5 with no gaps", () => {
    const keys = Object.keys(PHASE_TO_STEP).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("value at index N equals WORKFLOW_STEPS[N]", () => {
    for (let n = 0; n < WORKFLOW_STEPS.length; n++) {
      expect(PHASE_TO_STEP[n as GrowthPhase]).toBe(WORKFLOW_STEPS[n]);
    }
  });

  it("is frozen — Object.freeze prevents runtime mutation", () => {
    expect(Object.isFrozen(PHASE_TO_STEP)).toBe(true);
  });
});

describe("STEP_TO_PHASE", () => {
  it("covers all six workflow steps", () => {
    expect(Object.keys(STEP_TO_PHASE).sort()).toEqual(
      [...WORKFLOW_STEPS].sort(),
    );
  });

  it("is frozen", () => {
    expect(Object.isFrozen(STEP_TO_PHASE)).toBe(true);
  });

  it("is the exact inverse of PHASE_TO_STEP (round-trip)", () => {
    for (const step of WORKFLOW_STEPS) {
      const phase = STEP_TO_PHASE[step];
      expect(PHASE_TO_STEP[phase]).toBe(step);
    }
    for (let n = 0; n < WORKFLOW_STEPS.length; n++) {
      const step = PHASE_TO_STEP[n as GrowthPhase];
      expect(STEP_TO_PHASE[step]).toBe(n);
    }
  });
});

describe("STEP_LABEL", () => {
  it("covers all six workflow steps", () => {
    expect(Object.keys(STEP_LABEL).sort()).toEqual(
      [...WORKFLOW_STEPS].sort(),
    );
  });

  it("is frozen", () => {
    expect(Object.isFrozen(STEP_LABEL)).toBe(true);
  });

  it("every label is non-empty and ≤12 chars (tooltip budget)", () => {
    for (const step of WORKFLOW_STEPS) {
      const label = STEP_LABEL[step];
      expect(label.length).toBeGreaterThan(0);
      expect(label.length).toBeLessThanOrEqual(12);
    }
  });

  it("pins the shipped human-readable copy", () => {
    expect(STEP_LABEL).toEqual({
      ideate: "Ideate",
      validate: "Validate",
      build: "Build",
      fundraise: "Fundraise",
      grow: "Grow",
      exit: "Exit",
    });
  });
});

describe("currentPhaseToStep — nullish + NaN guards", () => {
  it("returns 'ideate' for null", () => {
    expect(currentPhaseToStep(null)).toBe<WorkflowStep>("ideate");
  });

  it("returns 'ideate' for undefined", () => {
    expect(currentPhaseToStep(undefined)).toBe<WorkflowStep>("ideate");
  });

  it("returns 'ideate' for NaN", () => {
    expect(currentPhaseToStep(Number.NaN)).toBe<WorkflowStep>("ideate");
  });
});

describe("currentPhaseToStep — non-positive integers collapse to 'ideate'", () => {
  it("returns 'ideate' for 0", () => {
    expect(currentPhaseToStep(0)).toBe("ideate");
  });

  it("returns 'ideate' for -1", () => {
    expect(currentPhaseToStep(-1)).toBe("ideate");
  });

  it("returns 'ideate' for large negative", () => {
    expect(currentPhaseToStep(-100)).toBe("ideate");
  });

  it("Math.round(-0.4) === 0 → 'ideate' via the p <= 0 gate", () => {
    expect(currentPhaseToStep(-0.4)).toBe("ideate");
  });
});

describe("currentPhaseToStep — 6-bucket direct-lookup domain (1..5)", () => {
  it("1 → validate", () => expect(currentPhaseToStep(1)).toBe("validate"));
  it("2 → build", () => expect(currentPhaseToStep(2)).toBe("build"));
  it("3 → fundraise", () => expect(currentPhaseToStep(3)).toBe("fundraise"));
  it("4 → grow", () => expect(currentPhaseToStep(4)).toBe("grow"));
  it("5 → exit", () => expect(currentPhaseToStep(5)).toBe("exit"));
});

describe("currentPhaseToStep — legacy 12-phase bucketing (6..12+)", () => {
  it("6 → fundraise (legacy 6..8 bucket)", () =>
    expect(currentPhaseToStep(6)).toBe("fundraise"));
  it("7 → fundraise", () => expect(currentPhaseToStep(7)).toBe("fundraise"));
  it("8 → fundraise", () => expect(currentPhaseToStep(8)).toBe("fundraise"));
  it("9 → grow (legacy 9..11 bucket)", () =>
    expect(currentPhaseToStep(9)).toBe("grow"));
  it("10 → grow", () => expect(currentPhaseToStep(10)).toBe("grow"));
  it("11 → grow", () => expect(currentPhaseToStep(11)).toBe("grow"));
  it("12 → exit (legacy top of range)", () =>
    expect(currentPhaseToStep(12)).toBe("exit"));
  it("13 → exit (out-of-range falls through to final)", () =>
    expect(currentPhaseToStep(13)).toBe("exit"));
  it("99 → exit", () => expect(currentPhaseToStep(99)).toBe("exit"));
});

describe("currentPhaseToStep — Math.round semantics on floats", () => {
  it("1.4 rounds to 1 → validate", () =>
    expect(currentPhaseToStep(1.4)).toBe("validate"));
  it("1.6 rounds to 2 → build", () =>
    expect(currentPhaseToStep(1.6)).toBe("build"));
  it("5.4 rounds to 5 → exit (still direct-lookup)", () =>
    expect(currentPhaseToStep(5.4)).toBe("exit"));
  it("5.6 rounds to 6 → fundraise (crosses into legacy bucket)", () =>
    expect(currentPhaseToStep(5.6)).toBe("fundraise"));
  it("11.5 rounds to 12 → exit", () =>
    expect(currentPhaseToStep(11.5)).toBe("exit"));
  it("12.4 rounds to 12 → exit", () =>
    expect(currentPhaseToStep(12.4)).toBe("exit"));
});

describe("currentPhaseToStep — documented domain-overlap quirk", () => {
  // The 6-bucket domain (0..5) and legacy 12-phase domain (0..12) both
  // include the values 1..5. Because the direct-lookup branch fires first,
  // a caller passing "3" from a legacy 12-phase context gets "fundraise"
  // (6-bucket meaning) not "build" (legacy 12-phase bucketing would place
  // 3..5 into "build"). Callers with legacy phase numbers must translate
  // upstream before calling this helper.
  it("legacy caller passing 3 receives 6-bucket 'fundraise', not legacy-intent 'build'", () => {
    expect(currentPhaseToStep(3)).toBe("fundraise");
  });

  it("legacy caller passing 5 receives 6-bucket 'exit', not legacy-intent 'build'", () => {
    expect(currentPhaseToStep(5)).toBe("exit");
  });
});

describe("currentPhaseToStep — full 0..13 sweep pinned as a table", () => {
  const expected: Array<[number, WorkflowStep]> = [
    [0, "ideate"],
    [1, "validate"],
    [2, "build"],
    [3, "fundraise"],
    [4, "grow"],
    [5, "exit"],
    [6, "fundraise"],
    [7, "fundraise"],
    [8, "fundraise"],
    [9, "grow"],
    [10, "grow"],
    [11, "grow"],
    [12, "exit"],
    [13, "exit"],
  ];

  it.each(expected)("input %i → %s", (input, out) => {
    expect(currentPhaseToStep(input)).toBe(out);
  });
});
