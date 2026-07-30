import { describe, it, expect, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Advisor Content — colocated tests for the previously-untested pure
// `src/lib/advisor-content.ts` module. Copy in this module is surfaced on
// the founder dashboard advisor card + nudge / walkthrough surfaces, so a
// silent rename of a stage key, a shape change on a StageAdvice payload,
// or a regression on the greeting boundary hours would break rendering
// without any type error. These tests pin the shape + the copy contract.
// ---------------------------------------------------------------------------

import {
  ADVISOR_GREETING,
  CELEBRATION_COPY,
  GOAL_TIPS,
  STAGE_ADVISOR_CONTENT,
  STAGE_CONTEXT,
  getGreetingByTime,
  getStageAdvice,
  type StageAdvice,
} from "./advisor-content";

afterEach(() => {
  vi.useRealTimers();
});

describe("ADVISOR_GREETING", () => {
  it("exposes exactly the three time-of-day slots consumed by getGreetingByTime", () => {
    expect(Object.keys(ADVISOR_GREETING).sort()).toEqual([
      "afternoon",
      "evening",
      "morning",
    ]);
    expect(ADVISOR_GREETING.morning).toBe("Good morning");
    expect(ADVISOR_GREETING.afternoon).toBe("Good afternoon");
    expect(ADVISOR_GREETING.evening).toBe("Good evening");
  });
});

describe("getGreetingByTime", () => {
  const at = (hour: number) => {
    const d = new Date(2026, 0, 1, hour, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(d);
  };

  it("returns 'Good morning' for hours 0..11 inclusive", () => {
    at(0);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.morning);
    at(11);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.morning);
  });

  it("returns 'Good afternoon' for hours 12..17 inclusive (boundary at 12)", () => {
    at(12);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.afternoon);
    at(17);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.afternoon);
  });

  it("returns 'Good evening' for hours 18..23 inclusive (boundary at 18)", () => {
    at(18);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.evening);
    at(23);
    expect(getGreetingByTime()).toBe(ADVISOR_GREETING.evening);
  });
});

describe("STAGE_CONTEXT", () => {
  it("covers the 5 semantic stage names surfaced on the founder dashboard", () => {
    for (const key of ["idea", "mvp", "launched", "revenue", "raising"]) {
      expect(typeof STAGE_CONTEXT[key]).toBe("string");
      expect(STAGE_CONTEXT[key].length).toBeGreaterThan(20);
    }
  });

  it("covers every SVI numeric stage 0..7 as a string key (matches STAGE_ADVISOR_CONTENT shape)", () => {
    for (let i = 0; i <= 7; i++) {
      const key = String(i);
      expect(typeof STAGE_CONTEXT[key]).toBe("string");
      expect(STAGE_CONTEXT[key].length).toBeGreaterThan(20);
    }
  });

  it("has no empty / whitespace-only entries", () => {
    for (const [key, val] of Object.entries(STAGE_CONTEXT)) {
      expect(val.trim(), `STAGE_CONTEXT[${key}]`).not.toBe("");
    }
  });
});

describe("CELEBRATION_COPY", () => {
  it("sviUp interpolates positive delta with a leading '+'", () => {
    expect(CELEBRATION_COPY.sviUp(7)).toContain("+7");
    expect(CELEBRATION_COPY.sviUp(7)).toMatch(/momentum/i);
  });

  it("sviDown uses Math.abs so a negative delta renders as a positive number", () => {
    const copy = CELEBRATION_COPY.sviDown(-5);
    expect(copy).toContain("5");
    expect(copy).not.toContain("-5");
    expect(copy).not.toContain("--");
  });

  it("sviFirst + sviStable are non-empty static strings", () => {
    expect(CELEBRATION_COPY.sviFirst).toMatch(/first analysis/i);
    expect(CELEBRATION_COPY.sviStable).toMatch(/holding steady/i);
  });
});

describe("STAGE_ADVISOR_CONTENT", () => {
  it("has one entry per SVI stage 0..7 (no gaps)", () => {
    const keys = Object.keys(STAGE_ADVISOR_CONTENT).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("every stage entry satisfies the StageAdvice shape with ≥ 3 items per array field", () => {
    for (const [stageKey, advice] of Object.entries(STAGE_ADVISOR_CONTENT)) {
      const a = advice as StageAdvice;
      expect(a.focusAreas.length, `stage ${stageKey} focusAreas`).toBeGreaterThanOrEqual(3);
      expect(a.pitfalls.length, `stage ${stageKey} pitfalls`).toBeGreaterThanOrEqual(3);
      expect(a.successMetrics.length, `stage ${stageKey} successMetrics`).toBeGreaterThanOrEqual(3);
      expect(a.mentorQuote.trim(), `stage ${stageKey} mentorQuote`).not.toBe("");
      expect(a.weeklyChallenge.trim(), `stage ${stageKey} weeklyChallenge`).not.toBe("");
    }
  });

  it("every focusArea has a non-empty title + detail", () => {
    for (const [stageKey, advice] of Object.entries(STAGE_ADVISOR_CONTENT)) {
      for (const [i, area] of (advice as StageAdvice).focusAreas.entries()) {
        expect(area.title.trim(), `stage ${stageKey} focusAreas[${i}].title`).not.toBe("");
        expect(area.detail.trim(), `stage ${stageKey} focusAreas[${i}].detail`).not.toBe("");
      }
    }
  });

  it("every pitfall + successMetric entry is a non-empty string", () => {
    for (const [stageKey, advice] of Object.entries(STAGE_ADVISOR_CONTENT)) {
      const a = advice as StageAdvice;
      for (const [i, p] of a.pitfalls.entries()) {
        expect(typeof p, `stage ${stageKey} pitfalls[${i}]`).toBe("string");
        expect(p.trim()).not.toBe("");
      }
      for (const [i, m] of a.successMetrics.entries()) {
        expect(typeof m, `stage ${stageKey} successMetrics[${i}]`).toBe("string");
        expect(m.trim()).not.toBe("");
      }
    }
  });
});

describe("getStageAdvice", () => {
  it("returns the exact stage advice object for every valid SVI stage 0..7", () => {
    for (let i = 0; i <= 7; i++) {
      expect(getStageAdvice(i)).toBe(STAGE_ADVISOR_CONTENT[i]);
    }
  });

  it("falls back to stage-0 advice for an out-of-range positive stage", () => {
    expect(getStageAdvice(99)).toBe(STAGE_ADVISOR_CONTENT[0]);
  });

  it("falls back to stage-0 advice for a negative stage", () => {
    expect(getStageAdvice(-1)).toBe(STAGE_ADVISOR_CONTENT[0]);
  });

  it("falls back to stage-0 advice for NaN", () => {
    expect(getStageAdvice(Number.NaN)).toBe(STAGE_ADVISOR_CONTENT[0]);
  });
});

describe("GOAL_TIPS", () => {
  it("exposes the 7 canonical goal keys the onboarding wizard writes", () => {
    expect(Object.keys(GOAL_TIPS).sort()).toEqual([
      "build_mvp",
      "exit_planning",
      "find_cofounder",
      "get_investor_ready",
      "grow_revenue",
      "raise_funding",
      "validate_idea",
    ]);
  });

  it("every tip is a non-empty string with actionable copy (> 30 chars)", () => {
    for (const [key, tip] of Object.entries(GOAL_TIPS)) {
      expect(typeof tip, `GOAL_TIPS[${key}]`).toBe("string");
      expect(tip.trim().length, `GOAL_TIPS[${key}] length`).toBeGreaterThan(30);
    }
  });
});
