// G32 SV0 guards for rubric@v1: one entry per scope.ts guiding question and per
// overlay item, complete anchors/checks/examples/evidence/applicability, owner
// from the registry, FTV fairness terms, and no numeric weights (D24-f).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REANALYSIS_SCOPES } from "@/lib/reanalysis/scope";
import { FTV_FORBIDDEN_EN, FTV_FORBIDDEN_VI, collectStrings } from "./fairness";
import { DIMENSION_LEAD, SCREENING_DIMENSIONS, SCREENING_ITEMS, SCREENING_STAGES, screeningItem } from "./registry";
import {
  FOUNDER_CLAIM_LEVEL_CEILING, RUBRIC_ENTRIES, RUBRIC_LEVELS, RUBRIC_LEVEL_MEANING, RUBRIC_VERSION,
  applicableQuestions, levelCeiling, rubricFor, rubricForItem, rubricOwnedBy,
} from "./rubric";
import { CGH_RUBRIC } from "./rubric-data/cgh";
import { FTV_RUBRIC } from "./rubric-data/ftv";
import { IRI_RUBRIC } from "./rubric-data/iri";
import { LCO_RUBRIC } from "./rubric-data/lco";
import { MPC_RUBRIC } from "./rubric-data/mpc";
import { PTD_RUBRIC } from "./rubric-data/ptd";
import { SVM_RUBRIC } from "./rubric-data/svm";
import { TRE_RUBRIC } from "./rubric-data/tre";

const NATIVE = REANALYSIS_SCOPES.filter(scope => scope.question);
const OVERLAY_ITEMS = SCREENING_ITEMS.filter(item => item.overlay);
const RAW = [FTV_RUBRIC, MPC_RUBRIC, PTD_RUBRIC, TRE_RUBRIC, CGH_RUBRIC, IRI_RUBRIC, LCO_RUBRIC, SVM_RUBRIC].flat();
const TIERS = new Set(["T1", "T2", "T3", "T4"]);

describe("rubric@v1 coverage (G32 SV0)", () => {
  it("has exactly one entry per scope.ts guiding question and per overlay item — 52 + 51 = 103", () => {
    expect(NATIVE).toHaveLength(52);
    expect(OVERLAY_ITEMS).toHaveLength(51);
    expect(RUBRIC_ENTRIES).toHaveLength(103);
    const ids = RUBRIC_ENTRIES.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scope of NATIVE) {
      expect(RUBRIC_ENTRIES.filter(entry => entry.id === scope.id), scope.id).toHaveLength(1);
    }
    for (const item of OVERLAY_ITEMS) {
      expect(RUBRIC_ENTRIES.filter(entry => entry.kind === "overlay" && entry.itemId === item.id), item.id).toHaveLength(1);
    }
    const questionEntries = RUBRIC_ENTRIES.filter(entry => entry.kind === "question");
    expect(questionEntries.map(entry => entry.id).sort()).toEqual(NATIVE.map(scope => scope.id).sort());
  });

  it("binds each question to the catalogue item that maps it, with the exact scope.ts text and criterion", () => {
    for (const scope of NATIVE) {
      const entry = rubricFor(scope.id)!;
      const owners = SCREENING_ITEMS.filter(item => item.questionRefs.includes(scope.id));
      expect(owners, scope.id).toHaveLength(1);
      expect(entry.itemId, scope.id).toBe(owners[0].id);
      expect(entry.prompt, scope.id).toBe(scope.question);
      expect([entry.criterion], scope.id).toEqual(scope.criteria);
    }
    for (const entry of RUBRIC_ENTRIES.filter(e => e.kind === "overlay")) {
      expect(entry.id).toBe(entry.itemId);
      expect(entry.criterion).toBeNull();
      expect(entry.prompt).toBe(screeningItem(entry.itemId)!.question.en);
    }
    // Overlays inherit the item's applicability; authors never restate it.
    for (const input of RAW.filter(i => !i.item)) {
      expect(input.stages, input.id).toBeUndefined();
      expect(input.question, input.id).toBeUndefined();
    }
  });

  it("takes the owner (and required judges) from the registry — the single owner source (D24-c)", () => {
    for (const entry of RUBRIC_ENTRIES) {
      const item = screeningItem(entry.itemId)!;
      expect(entry.dimension, entry.id).toBe(item.dimension);
      expect(entry.ownerAgent, entry.id).toBe(item.ownerAgent);
      expect(entry.ownerAgent, entry.id).toBe(DIMENSION_LEAD[entry.dimension]);
      expect(entry.requiredJudgeAgents, entry.id).toEqual(item.requiredJudgeAgents);
    }
    for (const entry of RUBRIC_ENTRIES.filter(e => e.criterion === "revenue")) expect(entry.requiredJudgeAgents, entry.id).toContain("cfo");
    expect(rubricOwnedBy("cro").every(entry => entry.dimension === "TRE")).toBe(true);
    expect(rubricForItem("IRI-01").map(entry => entry.id)).toHaveLength(5);
  });
});

describe("rubric@v1 content", () => {
  it("gives every entry five distinct, non-empty anchors for levels 0–4", () => {
    expect(RUBRIC_LEVELS).toEqual([0, 1, 2, 3, 4]);
    for (const level of RUBRIC_LEVELS) expect(RUBRIC_LEVEL_MEANING[level].length).toBeGreaterThan(20);
    for (const entry of RUBRIC_ENTRIES) {
      expect(entry.anchors, entry.id).toHaveLength(5);
      for (const anchor of entry.anchors) {
        expect(anchor.trim().length, entry.id).toBeGreaterThan(20);
        expect(anchor.trim(), entry.id).toMatch(/\.$|\)$/);
      }
      expect(new Set(entry.anchors).size, entry.id).toBe(5);
    }
  });

  it("gives every entry 2–4 binary checks and level-2 / level-4 examples", () => {
    for (const entry of RUBRIC_ENTRIES) {
      expect(entry.checklist.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(entry.checklist.length, entry.id).toBeLessThanOrEqual(4);
      for (const check of entry.checklist) expect(check.trim(), entry.id).toMatch(/^\S.{8,}\?$/);
      expect(entry.examples.level2.trim().length, entry.id).toBeGreaterThan(15);
      expect(entry.examples.level4.trim().length, entry.id).toBeGreaterThan(15);
      expect(entry.examples.level2, entry.id).not.toBe(entry.examples.level4);
    }
  });

  it("names evidence types, level-4 tiers (never founder-stated) and a freshness window", () => {
    for (const entry of RUBRIC_ENTRIES) {
      const item = screeningItem(entry.itemId)!;
      expect(entry.evidence.types.length, entry.id).toBeGreaterThan(0);
      expect(entry.evidence.level4Tiers.length, entry.id).toBeGreaterThan(0);
      expect(entry.evidence.level4Tiers.every(tier => TIERS.has(tier)), entry.id).toBe(true);
      expect(entry.evidence.level4Tiers, entry.id).not.toContain("T4");
      expect(entry.evidence.freshnessDays, entry.id).toBe(item.evidence.freshnessDays);
      expect(entry.rubricVersion).toBe(RUBRIC_VERSION);
      expect(RUBRIC_VERSION).toBe("rubric@v1");
    }
  });

  it("states stage applicability and an N/A rule for every entry, covering every stage in every dimension", () => {
    for (const entry of RUBRIC_ENTRIES) {
      expect(entry.stages.length, entry.id).toBeGreaterThan(0);
      expect(entry.stages.every(stage => SCREENING_STAGES.includes(stage)), entry.id).toBe(true);
      expect(entry.notApplicable.trim().length, entry.id).toBeGreaterThan(8);
      if (entry.kind === "overlay") expect(entry.stages, entry.id).toEqual(screeningItem(entry.itemId)!.stages);
      else expect(entry.stages.some(stage => screeningItem(entry.itemId)!.stages.includes(stage)), entry.id).toBe(true);
    }
    for (const dim of SCREENING_DIMENSIONS) for (const stage of SCREENING_STAGES) {
      expect(applicableQuestions(stage).some(entry => entry.dimension === dim), `${dim} @ ${stage}`).toBe(true);
    }
    const ps = applicableQuestions("PS").map(entry => entry.id);
    expect(ps).not.toContain("TRE-04");
    expect(ps).not.toContain("FTV-09");
    expect(ps).toContain("LCO-01");
    expect(ps).not.toContain("blockid:question:team_structure:a188bb064bd37212");
    expect(applicableQuestions("B+").map(entry => entry.id)).toContain("TRE-11");
    expect(rubricFor("does-not-exist")).toBeUndefined();
  });

  it("caps founder-stated evidence at level 2, weaker-than-required evidence at 3, and treats no evidence as N/A", () => {
    const mrr = rubricFor("blockid:question:revenue:e95923a31d3bcb97")!;
    expect(mrr.evidence.level4Tiers).toEqual(["T1"]);
    expect(levelCeiling(mrr, [])).toBeNull();
    expect(levelCeiling(mrr, ["T4"])).toBe(FOUNDER_CLAIM_LEVEL_CEILING);
    expect(FOUNDER_CLAIM_LEVEL_CEILING).toBe(2);
    expect(levelCeiling(mrr, ["T3", "T4"])).toBe(3);
    expect(levelCeiling(mrr, ["T4", "T1"])).toBe(4);
    const problem = rubricFor("blockid:question:idea:fc1b2eb085dbce9b")!;
    // A stronger tier than required also supports level 4.
    expect(levelCeiling(problem, ["T1"])).toBe(4);
    expect(levelCeiling(problem, ["T4"])).toBe(2);
  });
});

describe("rubric@v1 guards", () => {
  it("FTV rubric text never references age, education prestige or gender (registry guard terms)", () => {
    const ftv = RUBRIC_ENTRIES.filter(entry => entry.dimension === "FTV");
    expect(ftv.length).toBe(15);
    for (const entry of ftv) {
      for (const text of collectStrings(entry)) {
        expect(text, entry.id).not.toMatch(FTV_FORBIDDEN_EN);
        expect(text, entry.id).not.toMatch(FTV_FORBIDDEN_VI);
      }
    }
  });

  it("carries no numeric weights, budgets or point values (D24-f)", () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        expect(path.split(".").at(-1), `numeric value at ${path}`).toBe("freshnessDays");
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          expect(key, `${path}.${key}`).not.toMatch(/weight|coefficient|multiplier|points|score|budget/i);
          walk(child, `${path}.${key}`);
        }
      }
    };
    for (const entry of RUBRIC_ENTRIES) {
      walk(entry, entry.id);
      for (const text of collectStrings(entry)) expect(text, entry.id).not.toMatch(/\bweight(s|ed|ing)?\b|\bB_q\b|\d\s*points?\b|\bpoints? (budget|value)/i);
    }
    const dir = join(__dirname, "rubric-data");
    const files = [join(__dirname, "rubric.ts"), ...readdirSync(dir).filter(f => f.endsWith(".ts")).map(f => join(dir, f))];
    expect(files.length).toBe(10);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/\bweights?\s*[:=]\s*[\d.{[]/i);
  });

  it("is frozen data", () => {
    expect(Object.isFrozen(RUBRIC_ENTRIES)).toBe(true);
    expect(RUBRIC_ENTRIES.every(entry => Object.isFrozen(entry))).toBe(true);
  });
});
