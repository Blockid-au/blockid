// G8-P8 — the generated unlock docs must match the code they are derived
// from. Re-renders the matrix here and diffs against the committed
// `docs/user/menu-walkthrough.md` + `web/content/generated/unlock-matrix.json`.
// When this fails, run `node scripts/docs/render-unlock-matrix.mjs` from
// web/ and commit the result together with the nav / gate change.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/workspace/nav-groups";
import { PHASE_EXIT_RULES } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_IDS, growthPhaseOrder } from "@/lib/growth/phase-taxonomy";
import { currentPhaseToStep } from "@/lib/nav/workflow-steps";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import {
  applyToDoc,
  buildUnlockMatrix,
  cellText,
  COLUMN_PLAN_IDS,
  GROWTH_PHASE_TO_WORKFLOW_STEP,
  MATRIX_BEGIN,
  MATRIX_END,
  renderMatrixMarkdown,
  renderRulesMarkdown,
  renderSidebar,
  RULES_BEGIN,
  RULES_END,
  sidebarPhaseFor,
  spliceGenerated,
} from "./unlock-matrix.mjs";

const WEB_ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(WEB_ROOT, "../docs/user/menu-walkthrough.md");
const JSON_PATH = resolve(WEB_ROOT, "content/generated/unlock-matrix.json");

const RERENDER = "stale — run `node scripts/docs/render-unlock-matrix.mjs` from web/ and commit";

describe("unlock-matrix — generated docs track the code", () => {
  const matrix = buildUnlockMatrix();

  it("docs/user/menu-walkthrough.md carries the freshly rendered tables", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(doc, "markers missing").toContain(MATRIX_BEGIN);
    expect(doc, "markers missing").toContain(RULES_BEGIN);
    expect(applyToDoc(doc, matrix), RERENDER).toBe(doc);
  });

  it("web/content/generated/unlock-matrix.json is the freshly rendered matrix", () => {
    const committed = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    expect(committed, RERENDER).toEqual(JSON.parse(JSON.stringify(matrix)));
  });

  it("covers all 12 growth phases and the 7 plan columns", () => {
    expect(matrix.phases.map((p) => p.id)).toEqual([...GROWTH_PHASE_IDS]);
    expect(matrix.columns.map((c) => c.id)).toEqual([...COLUMN_PLAN_IDS]);
    expect(matrix.rules.map((r) => r.id)).toEqual(Object.keys(PHASE_EXIT_RULES));
    for (const row of matrix.phases) {
      const step = matrix.steps[String(row.sidebarPhase)];
      for (const col of matrix.columns) {
        expect(step[col.id].map((c) => c.id).sort()).toEqual(NAV_GROUPS.map((g) => g.id).sort());
      }
    }
  });
});

describe("unlock-matrix — 12 phases → 6 sidebar steps bridge", () => {
  it("agrees with workflow-steps.ts currentPhaseToStep() where that function is reachable (ordinals 1, 6..12)", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const ordinal = growthPhaseOrder(id);
      if (ordinal === 1 || ordinal >= 6) {
        expect(GROWTH_PHASE_TO_WORKFLOW_STEP[id], id).toBe(currentPhaseToStep(ordinal));
      }
    }
  });

  it("is monotonic — a later phase never maps to an earlier sidebar step", () => {
    let last = 0;
    for (const id of GROWTH_PHASE_IDS) {
      const p = sidebarPhaseFor(id);
      expect(p, id).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(sidebarPhaseFor("vision")).toBe(1);
    expect(sidebarPhaseFor("funding")).toBe(5);
  });
});

describe("unlock-matrix — visibility pipeline mirrors workspace-layout.tsx", () => {
  const founderFree = { planId: "founder_free", segment: "founder" as const, features: new Set<string>() };

  it("phase-locked groups are hidden, not dimmed (D2), and the 3 core groups always show", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 1 });
    const state = Object.fromEntries(cells.map((c) => [c.id, c.state]));
    expect(state.home).toBe("visible");
    expect(state.validate).toBe("visible");
    expect(state.account).toBe("visible");
    expect(state.build).toBe("hidden_phase");
    expect(state.fundraise).toBe("hidden_phase");
    expect(state["scale-exit"]).toBe("hidden_phase");
    // Roles carries only evaluator rows → resolves empty for a founder.
    expect(state.roles).toBe("empty");
  });

  it("groups more than 3 steps ahead fold under the Later-phases preview (pre-SVI step 0)", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 0 });
    expect(cells.find((c) => c.id === "scale-exit")?.state).toBe("later_preview");
    expect(cells.find((c) => c.id === "build")?.state).toBe("hidden_phase");
  });

  it("tier-locked rows stay visible and are counted as upgrade / add-on dims", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 5 });
    const build = cells.find((c) => c.id === "build")!;
    expect(build.state).toBe("visible");
    expect(build.upgradeItems).toBeGreaterThan(0);
    // ESOP Setup + Vesting carry addOnKey share_management.
    expect(build.addOnItems).toBe(2);
    const growth = renderSidebar({ planId: "founder_growth", segment: "founder", currentPhase: 5, features: new Set(["cap_table.write"]) });
    expect(growth.find((c) => c.id === "build")!.upgradeItems).toBeLessThan(build.upgradeItems);
  });

  it("evaluator overlays drop the founder groups", () => {
    const scout = renderSidebar({ planId: "investor_angel", segment: "investor_angel", currentPhase: 5, features: new Set() });
    const state = Object.fromEntries(scout.map((c) => [c.id, c.state]));
    expect(state.validate).toBe("hidden_segment");
    expect(state.build).toBe("hidden_segment");
    expect(state["scale-exit"]).toBe("hidden_segment");
    expect(state.roles).toBe("visible");
    expect(state.fundraise).toBe("visible");
  });

  it("cellText omits hidden groups and annotates dims", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 1 });
    const text = cellText(cells);
    expect(text).toMatch(/^Home · Validate \(\d+ upgrade\) · Account \(\d+ upgrade\)$/);
    expect(text).not.toContain("Build");
  });
});

describe("unlock-matrix — rules table", () => {
  const matrix = buildUnlockMatrix();

  it("mirrors PHASE_EXIT_RULES criteria and floors phase by phase", () => {
    for (const rule of matrix.rules) {
      const src = PHASE_EXIT_RULES[rule.id];
      expect(rule.requiredCriteria.map((c) => c.key)).toEqual([...src.requiredCriteria]);
      expect(Object.fromEntries(rule.dimensionFloors.map((f) => [f.dimension, f.floor]))).toEqual(src.dimensionFloors);
    }
    expect(matrix.rules.at(-1)!.requiredCriteria).toHaveLength(CRITERION_KEYS.length);
    expect(matrix.rules.at(-1)!.nextPhase).toBeNull();
  });

  it("renders founder language, never the raw code-only vocabulary", () => {
    const md = renderRulesMarkdown(matrix) + renderMatrixMarkdown(matrix);
    expect(md).toContain("Market & Problem (MPC) ≥ 40");
    expect(md).toContain("all 13 criteria");
    expect(md).not.toContain("PhD");
    expect(md).not.toContain("undefined");
  });

  it("spliceGenerated replaces only the marked block and throws when markers are missing", () => {
    const doc = `intro\n${MATRIX_BEGIN}\nold\n${MATRIX_END}\nrest\n${RULES_BEGIN}\nx\n${RULES_END}\n`;
    const out = spliceGenerated(doc, MATRIX_BEGIN, MATRIX_END, "new");
    expect(out).toBe(`intro\n${MATRIX_BEGIN}\nnew\n${MATRIX_END}\nrest\n${RULES_BEGIN}\nx\n${RULES_END}\n`);
    expect(() => spliceGenerated("no markers", MATRIX_BEGIN, MATRIX_END, "x")).toThrow(/markers not found/);
  });
});
