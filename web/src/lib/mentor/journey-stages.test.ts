import { describe, expect, it } from "vitest";
import {
  heatFromDays,
  phaseFromSviScore,
  recommendForFounder,
} from "./journey-stages";

describe("phaseFromSviScore", () => {
  it("null score falls back to idea", () => {
    expect(phaseFromSviScore(null)).toBe("idea");
  });
  it("monotonic thresholds map score to phase", () => {
    expect(phaseFromSviScore(0)).toBe("idea");
    expect(phaseFromSviScore(19.9)).toBe("idea");
    expect(phaseFromSviScore(20)).toBe("validate");
    expect(phaseFromSviScore(40)).toBe("build");
    expect(phaseFromSviScore(60)).toBe("launch");
    expect(phaseFromSviScore(75)).toBe("scale");
    expect(phaseFromSviScore(90)).toBe("exit");
    expect(phaseFromSviScore(100)).toBe("exit");
  });
});

describe("heatFromDays", () => {
  it("null days => cold", () => {
    expect(heatFromDays(null)).toBe("cold");
  });
  it("buckets by recency", () => {
    expect(heatFromDays(0)).toBe("hot");
    expect(heatFromDays(7)).toBe("hot");
    expect(heatFromDays(8)).toBe("warm");
    expect(heatFromDays(14)).toBe("warm");
    expect(heatFromDays(15)).toBe("cool");
    expect(heatFromDays(30)).toBe("cool");
    expect(heatFromDays(31)).toBe("cold");
  });
});

describe("recommendForFounder", () => {
  it("returns the phase baseline agenda when the founder is hot", () => {
    const r = recommendForFounder("build", "hot", 3);
    expect(r.agendaTemplate.length).toBeGreaterThan(0);
    expect(r.suggestedNextStep).toMatch(/MVP/);
    expect(r.riskFlags).not.toContain("Re-engagement needed (>30 days silent)");
  });

  it("prepends a re-engagement flag when the founder is cold", () => {
    const r = recommendForFounder("launch", "cold", 45);
    expect(r.riskFlags[0]).toMatch(/Re-engagement/);
    expect(r.suggestedNextStep).toMatch(/re-engagement/i);
  });

  it("adds a cooling flag between 14 and 30 days", () => {
    const r = recommendForFounder("scale", "cool", 20);
    expect(r.riskFlags.some((f) => f.toLowerCase().includes("cooling"))).toBe(
      true,
    );
  });

  it("covers every phase with a non-empty next step", () => {
    for (const phase of [
      "idea",
      "validate",
      "build",
      "launch",
      "scale",
      "exit",
    ] as const) {
      const r = recommendForFounder(phase, "hot", 1);
      expect(r.suggestedNextStep.length).toBeGreaterThan(0);
      expect(r.agendaTemplate.length).toBeGreaterThan(0);
    }
  });
});
