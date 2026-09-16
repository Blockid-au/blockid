// SCN direction helpers (moved off the landing in G13-W3-IA3) — pins the
// contract the /workspace/plan navigator relies on: always three steps,
// analysis actions first, no duplicates, hub-shaped routes.

import { describe, expect, it } from "vitest";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { actionToUrl, computeDirectionSteps, fallbackDirectionSteps, weakestLayerLabel } from "./direction-steps";

function analysisWith(actions: SVIAnalysis["nextActions"]): SVIAnalysis {
  return { nextActions: actions, subs: [] } as unknown as SVIAnalysis;
}

describe("direction-steps", () => {
  it("actionToUrl routes by keyword into /workspace and defaults to the evidence vault", () => {
    expect(actionToUrl("Finalise your cap table")).toBe("/workspace/equity/cap-table");
    expect(actionToUrl("Draft your pitch deck")).toBe("/workspace/documents/data-room");
    expect(actionToUrl("Acquire 20 paying customers")).toBe("/workspace/finance/revenue");
    expect(actionToUrl("Open your raise")).toBe("/workspace/raise/round");
    expect(actionToUrl("Something unrecognised")).toBe("/workspace/evidence");
  });

  it("fallbackDirectionSteps returns three P0/P1/P2 steps for every stage band", () => {
    for (const stage of [0, 1, 2, 3, 4, 5, 6, 9]) {
      const steps = fallbackDirectionSteps(stage);
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.priority)).toEqual(["P0", "P1", "P2"]);
      for (const s of steps) expect(s.url).toMatch(/^\/(workspace|analyze)/);
    }
  });

  it("computeDirectionSteps prefers analysis actions and tops up from the fallback without duplicates", () => {
    const merged = computeDirectionSteps(analysisWith([{ priority: "P0", title: "Set up your cap table", detail: "d", impact: "+10 SVI" }]), 1);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ label: "Set up your cap table", url: "/workspace/equity/cap-table" });
    expect(new Set(merged.map((s) => s.label.toLowerCase())).size).toBe(3);
    expect(computeDirectionSteps(null, 3)).toEqual(fallbackDirectionSteps(3));
  });

  it("weakestLayerLabel names the lowest sub-score", () => {
    expect(weakestLayerLabel(undefined)).toBeNull();
    expect(weakestLayerLabel([])).toBeNull();
    expect(
      weakestLayerLabel([
        { label: "Team", key: "ftv", value: 70, adjustment: 0, rationale: "", evidence: [], gaps: [] },
        { label: "Traction", key: "tre", value: 20, adjustment: 0, rationale: "", evidence: [], gaps: [] },
      ]),
    ).toBe("Traction");
  });
});
