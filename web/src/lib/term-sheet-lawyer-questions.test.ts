// src/lib/term-sheet-lawyer-questions.test.ts
//
// Deterministic lawyer-question generator for Term Sheet AI v2. Verifies
// severity assignment for founder-hostile clauses, red-first ordering,
// the ≤10 cap, and graceful handling of an empty analysis.

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateLawyerQuestions } from "./term-sheet-lawyer-questions";

describe("generateLawyerQuestions", () => {
  it("produces at least the catch-all question for an empty analysis", () => {
    const qs = generateLawyerQuestions({});
    expect(qs.length).toBeGreaterThanOrEqual(1);
    // Well-formed shape.
    for (const q of qs) {
      expect(["red", "amber", "green"]).toContain(q.severity);
      expect(q.category).toBeTruthy();
      expect(q.question).toBeTruthy();
      expect(q.why).toBeTruthy();
    }
  });

  it("orders red > amber > green (severity rank)", () => {
    const qs = generateLawyerQuestions({
      keyTerms: {
        liquidationPreference: "2x participating",
        boardSeatsToInvestor: 2,
      },
      redline: [
        { clause: "Anti-dilution", issue: "full-ratchet reset" },
        { clause: "Drag-along", issue: "majority drag" },
      ],
    });
    const rankFor = { red: 3, amber: 2, green: 1 } as const;
    for (let i = 0; i < qs.length - 1; i++) {
      expect(rankFor[qs[i]!.severity]).toBeGreaterThanOrEqual(rankFor[qs[i + 1]!.severity]);
    }
    // Founder-hostile signals surfaced as red questions.
    const reds = qs.filter((q) => q.severity === "red");
    expect(reds.length).toBeGreaterThanOrEqual(2);
  });

  it("caps output at 10 questions even when every trigger fires", () => {
    const qs = generateLawyerQuestions({
      keyTerms: {
        liquidationPreference: "3x participating",
        boardSeatsToInvestor: 3,
        optionPoolPostMoneyPct: 20,
        valuationCapAud: 500_000,
        proRataRights: true,
      },
      redline: [
        { clause: "Anti-dilution", issue: "full-ratchet" },
        { clause: "Drag-along", issue: "majority drag" },
        { clause: "ROFR", issue: "first refusal" },
        { clause: "Founder vesting", issue: "reverse vest all shares" },
        { clause: "MFN", issue: "most favoured nation everywhere" },
      ],
    });
    expect(qs.length).toBeLessThanOrEqual(10);
  });

  it("emits a MFN question when the redline mentions most favoured nation", () => {
    const qs = generateLawyerQuestions({
      redline: [{ clause: "MFN", issue: "most favoured nation everywhere" }],
    });
    const mfn = qs.find((q) => q.category === "MFN");
    expect(mfn).toBeDefined();
    expect(mfn!.severity).toBe("amber");
  });

  it("flags a >1x preference as red with the multiple in the question", () => {
    const qs = generateLawyerQuestions({
      keyTerms: { liquidationPreference: "2x non-participating" },
    });
    const reds = qs.filter(
      (q) => q.category === "Liquidation preference" && q.severity === "red",
    );
    expect(reds.length).toBeGreaterThanOrEqual(1);
    expect(reds[0]!.question).toMatch(/2x/);
  });
});
