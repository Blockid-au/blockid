import { describe, expect, it } from "vitest";
import {
  buildTourState,
  chapterSlugForPhase,
  deriveTourPhase,
  shouldShowTour,
  type TourPhaseInput,
} from "./tour-state";

const phase = (order: number, status: string, pct: number): TourPhaseInput => ({
  order,
  status: status as TourPhaseInput["status"],
  completionPct: pct,
});

describe("chapterSlugForPhase", () => {
  it("maps phase 1 to 01-vision", () => {
    expect(chapterSlugForPhase(1)).toBe("01-vision");
  });

  it("maps phase 12 to 12-exit", () => {
    expect(chapterSlugForPhase(12)).toBe("12-exit");
  });

  it("returns null for out-of-range phase", () => {
    expect(chapterSlugForPhase(0)).toBeNull();
    expect(chapterSlugForPhase(13)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(chapterSlugForPhase(NaN)).toBeNull();
    expect(chapterSlugForPhase(Infinity)).toBeNull();
  });
});

describe("deriveTourPhase", () => {
  it("returns null for empty phase list", () => {
    expect(deriveTourPhase([])).toBeNull();
  });

  it("returns first not-started phase", () => {
    const phases = [
      phase(1, "not_started", 0),
      phase(2, "not_started", 0),
      phase(3, "not_started", 0),
    ];
    expect(deriveTourPhase(phases)).toBe(1);
  });

  it("skips completed phases and returns first incomplete", () => {
    const phases = [
      phase(1, "completed", 100),
      phase(2, "completed", 100),
      phase(3, "in_progress", 40),
      phase(4, "not_started", 0),
    ];
    expect(deriveTourPhase(phases)).toBe(3);
  });

  it("returns last phase when every phase is completed", () => {
    const phases = [
      phase(1, "completed", 100),
      phase(2, "completed", 100),
      phase(3, "completed", 100),
    ];
    expect(deriveTourPhase(phases)).toBe(3);
  });

  it("treats completionPct=100 without matching status as complete", () => {
    const phases = [
      phase(1, "in_progress", 100),
      phase(2, "not_started", 0),
    ];
    expect(deriveTourPhase(phases)).toBe(2);
  });

  it("ignores out-of-range order rows", () => {
    const phases = [
      phase(0, "not_started", 0),
      phase(2, "in_progress", 20),
    ];
    expect(deriveTourPhase(phases)).toBe(2);
  });

  it("sorts unordered input before deriving", () => {
    const phases = [
      phase(3, "not_started", 0),
      phase(1, "completed", 100),
      phase(2, "in_progress", 50),
    ];
    expect(deriveTourPhase(phases)).toBe(2);
  });
});

describe("shouldShowTour", () => {
  it("hides when currentPhase is null", () => {
    expect(shouldShowTour({ currentPhase: null, dismissedPhase: null })).toBe(false);
  });

  it("shows when never dismissed", () => {
    expect(shouldShowTour({ currentPhase: 1, dismissedPhase: null })).toBe(true);
  });

  it("hides when dismissed at same phase", () => {
    expect(shouldShowTour({ currentPhase: 3, dismissedPhase: 3 })).toBe(false);
  });

  it("resurfaces on phase transition", () => {
    expect(shouldShowTour({ currentPhase: 4, dismissedPhase: 3 })).toBe(true);
  });

  it("resurfaces when founder regresses to earlier phase", () => {
    expect(shouldShowTour({ currentPhase: 2, dismissedPhase: 5 })).toBe(true);
  });
});

describe("buildTourState", () => {
  it("returns all-null when no phases", () => {
    expect(buildTourState([])).toEqual({
      currentPhase: null,
      chapterSlug: null,
      label: null,
    });
  });

  it("wires phase order to chapter slug and label", () => {
    const state = buildTourState([
      phase(1, "completed", 100),
      phase(2, "in_progress", 30),
      phase(3, "not_started", 0),
    ]);
    expect(state.currentPhase).toBe(2);
    expect(state.chapterSlug).toBe("02-idea-validation");
    expect(state.label?.en).toBe("Idea Validation");
    expect(state.label?.vi).toBe("Xác thực ý tưởng");
  });

  it("uses the final phase when everything is done", () => {
    const phases = Array.from({ length: 12 }, (_, i) => phase(i + 1, "completed", 100));
    const state = buildTourState(phases);
    expect(state.currentPhase).toBe(12);
    expect(state.chapterSlug).toBe("12-exit");
  });
});
