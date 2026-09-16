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
import { clampNavPhase } from "@/lib/nav/founder-phase-shared";
import { PERSONAS } from "@/lib/nav/persona";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import {
  applyToDoc,
  buildUnlockMatrix,
  cellText,
  COLUMN_PLAN_IDS,
  GROWTH_PHASE_TO_NAV_PHASE,
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

  it("covers all 12 growth phases and the 7 plan columns (one cell per NAV_GROUPS group)", () => {
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

describe("unlock-matrix — 12 phases → 6 sidebar bands bridge", () => {
  it("agrees with clampNavPhase() where the legacy 1..12 ordinal maps directly (ordinals 1, 6..12)", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const ordinal = growthPhaseOrder(id);
      if (ordinal === 1 || ordinal >= 6) {
        expect(GROWTH_PHASE_TO_NAV_PHASE[id], id).toBe(clampNavPhase(ordinal));
      }
    }
    for (const row of buildUnlockMatrix().phases) {
      expect(row.navPhaseName.length, row.id).toBeGreaterThan(0);
      expect(row.navPhaseName).not.toMatch(/\d/);
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

describe("unlock-matrix — visibility pipeline mirrors workspace-layout.tsx (nav v4)", () => {
  const founderFree = { planId: "founder_free", segment: "founder" as const, features: new Set<string>() };

  it("a phase-1 founder sees Home · Prove · Money in place, Company folded under Later phases, evaluator groups hidden", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 1 });
    const state = Object.fromEntries(cells.map((c) => [c.id, c.state]));
    expect(state.home).toBe("visible");
    expect(state.prove).toBe("visible");
    expect(state.money).toBe("visible");
    expect(state.company).toBe("later_preview");
    expect(state["evaluator-home"]).toBe("hidden_segment");
    expect(state.dealflow).toBe("hidden_segment");
    expect(state.reports).toBe("hidden_segment");
    // Persona order wins: founder groups first, in PERSONAS.founder.navGroups order.
    expect(cells.slice(0, 4).map((c) => c.id)).toEqual(PERSONAS.founder.navGroups);
  });

  // "Get investor-ready" is gated on the `startup_package` feature, which
  // only the Package plan's feature_flags carry (plans.generated.ts; free
  // never had it — see LEGACY_FEATURE_FALLBACK), so Free sees 9 rows at
  // band 0 and Package the full 10 of spec §A.1.
  const founderPackage = { planId: "founder_package", segment: "founder" as const, features: new Set(["startup_package"]) };

  it("phase-0 founder sees ≤ 10 leaves across 3 groups (spec §A.1): 9 on Free, 10 with the package feature", () => {
    for (const [ctx, count] of [[founderFree, 9], [founderPackage, 10]] as const) {
      const cells = renderSidebar({ ...ctx, currentPhase: 0 });
      const inPlace = cells.filter((c) => c.state === "visible");
      expect(inPlace.map((c) => c.id)).toEqual(["home", "prove", "money"]);
      expect(inPlace.reduce((n, c) => n + c.visibleItems, 0)).toBe(count);
      expect(cells.find((c) => c.id === "company")?.state).toBe("later_preview");
    }
  });

  it("phase-5 founder sees 4 groups / 20 leaves (19 without the package feature); Company opens at band 2", () => {
    for (const [ctx, count] of [[founderFree, 19], [founderPackage, 20]] as const) {
      const at5 = renderSidebar({ ...ctx, currentPhase: 5 }).filter((c) => c.state === "visible");
      expect(at5.map((c) => c.id)).toEqual(["home", "prove", "money", "company"]);
      expect(at5.reduce((n, c) => n + c.visibleItems, 0)).toBe(count);
    }
    expect(renderSidebar({ ...founderFree, currentPhase: 2 }).find((c) => c.id === "company")?.state).toBe("visible");
  });

  it("tier-locked rows stay visible and are counted as upgrade / add-on dims", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 5 });
    const company = cells.find((c) => c.id === "company")!;
    expect(company.state).toBe("visible");
    expect(company.upgradeItems).toBeGreaterThan(0);
    // ESOP carries addOnKey share_management.
    expect(company.addOnItems).toBe(1);
    const growth = renderSidebar({ planId: "founder_growth", segment: "founder", currentPhase: 5, features: new Set(["esop.manage"]) });
    expect(growth.find((c) => c.id === "company")!.upgradeItems).toBeLessThan(company.upgradeItems);
    expect(growth.find((c) => c.id === "company")!.addOnItems).toBe(0);
  });

  it("evaluator personas get Home · Deal flow · Reports and never a founder group", () => {
    const scout = renderSidebar({ planId: "investor_angel", segment: "investor_angel", currentPhase: 5, features: new Set() });
    const state = Object.fromEntries(scout.map((c) => [c.id, c.state]));
    expect(state.home).toBe("hidden_segment");
    expect(state.prove).toBe("hidden_segment");
    expect(state.money).toBe("hidden_segment");
    expect(state.company).toBe("hidden_segment");
    expect(state["evaluator-home"]).toBe("visible");
    expect(state.dealflow).toBe("visible");
    expect(state.reports).toBe("visible");
    expect(scout.slice(0, 3).map((c) => c.id)).toEqual(PERSONAS.investor_angel.navGroups);
    // Advisor + accelerator share the groups but see their own leaves.
    const advisor = renderSidebar({ planId: "investor_advisor", segment: "advisor", currentPhase: 5, features: new Set() });
    expect(advisor.find((c) => c.id === "evaluator-home")!.visibleItems).toBe(3);
    expect(advisor.find((c) => c.id === "dealflow")!.visibleItems).toBe(2);
  });

  it("cellText omits hidden groups and annotates dims", () => {
    const cells = renderSidebar({ ...founderFree, currentPhase: 1 });
    const text = cellText(cells);
    expect(text).toMatch(/^Home · Prove \(\d+ upgrade\) · Money \(\d+ upgrade\) · Later phases: Company$/);
    expect(text).not.toContain("Deal flow");
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
