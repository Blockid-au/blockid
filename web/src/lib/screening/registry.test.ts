// G34 BT0 guards for the screening catalogue (plan §4.1): unique ids, full
// ownership/judge/tier data, per-stage coverage, questionRefs that resolve in
// scope.ts, fixed per-dimension counts, bands only (no numeric weights) and
// the FTV fairness rule.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { REANALYSIS_SCOPES } from "@/lib/reanalysis/scope";
import {
  DIMENSION_EMPHASIS, SCREENING_CATALOG_VERSION, SCREENING_DIMENSIONS, SCREENING_ITEMS, SCREENING_STAGES,
  itemsFor, itemsForStage, ownerFor, screeningItem,
} from "./registry";

const EXPECTED_COUNTS = { FTV: 9, MPC: 9, PTD: 8, TRE: 13, CGH: 10, IRI: 9, LCO: 12, SVM: 8 } as const;
const BANDS = new Set(["VeryHigh", "High", "Medium", "Low"]);
const TIERS = new Set(["T1", "T2", "T3", "T4"]);
const SIGNALS = new Set(["team", "traction", "moat", "liquidity", "capital_structure", "ip", null]);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("screening registry (G34 BT0)", () => {
  it("has 78 items with the planned per-dimension counts and a catalogue version", () => {
    expect(SCREENING_CATALOG_VERSION).toBe("catalog@v1");
    expect(SCREENING_ITEMS).toHaveLength(78);
    for (const dim of SCREENING_DIMENSIONS) expect(itemsFor(dim), dim).toHaveLength(EXPECTED_COUNTS[dim]);
  });

  it("uses unique, stable, dimension-prefixed ids numbered 01…n", () => {
    const ids = SCREENING_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dim of SCREENING_DIMENSIONS) {
      expect(itemsFor(dim).map(item => item.id)).toEqual(itemsFor(dim).map((_, i) => `${dim}-${String(i + 1).padStart(2, "0")}`));
      expect(itemsFor(dim).every(item => item.dimension === dim)).toBe(true);
    }
    expect(screeningItem("TRE-04")?.metricsKey).toBe("nrr");
    const flagKeys = SCREENING_ITEMS.flatMap(item => item.redFlags.map(flag => flag.key));
    expect(new Set(flagKeys).size).toBe(flagKeys.length);
  });

  it("gives every item an owner, a 2-judge panel, tiers, sources, freshness, red flags and bilingual text", () => {
    for (const item of SCREENING_ITEMS) {
      expect(item.ownerAgent, item.id).toBeTruthy();
      expect(item.judges, item.id).toBe(2);
      expect(item.supporting.length, item.id).toBeGreaterThan(0);
      expect(item.supporting, item.id).not.toContain(item.ownerAgent);
      expect(item.evidence.acceptedTiers.length, item.id).toBeGreaterThan(0);
      expect(item.evidence.acceptedTiers.every(tier => TIERS.has(tier)), item.id).toBe(true);
      expect(item.evidence.sources.length, item.id).toBeGreaterThan(0);
      expect(item.evidence.freshnessDays, item.id).toBeGreaterThan(0);
      expect(item.redFlags.length, item.id).toBeGreaterThan(0);
      for (const flag of item.redFlags) expect(flag.key, item.id).toMatch(new RegExp(`^${item.dimension.toLowerCase()}\\.[a-z0-9_]+$`));
      for (const text of [item.title.en, item.title.vi, item.question.en, item.question.vi]) expect(text.trim().length, item.id).toBeGreaterThan(3);
      expect(item.rubricVersion).toBe("rubric@v1");
      expect(SIGNALS.has(item.signal), item.id).toBe(true);
      expect(item.benchmarkRef === null || /\S/.test(item.benchmarkRef), item.id).toBe(true);
    }
  });

  it("is the single owner source: owner = dimension lead, matching dimension-owners.ts (D24-c)", () => {
    for (const dim of SCREENING_DIMENSIONS) {
      expect(ownerFor(dim), dim).toBe(DIMENSION_OWNERS[dim.toLowerCase() as DimKey].primary);
      for (const item of itemsFor(dim)) expect(item.ownerAgent, item.id).toBe(ownerFor(dim));
    }
    for (const id of ["IRI-02", "IRI-03", "IRI-08"]) expect(screeningItem(id)?.requiredJudgeAgents).toContain("cfo");
    for (const item of SCREENING_ITEMS.filter(i => i.questionRefs.some(ref => ref.startsWith("blockid:question:revenue:")))) {
      expect(item.requiredJudgeAgents, item.id).toContain("cfo");
    }
  });

  it("covers every stage in every dimension, and emphasis bands mirror §4.3 for the item's stages only", () => {
    for (const dim of SCREENING_DIMENSIONS) for (const stage of SCREENING_STAGES) {
      expect(itemsFor(dim).some(item => item.stages.includes(stage)), `${dim} @ ${stage}`).toBe(true);
    }
    for (const item of SCREENING_ITEMS) {
      expect(item.stages.length, item.id).toBeGreaterThan(0);
      expect(Object.keys(item.emphasisBand).sort(), item.id).toEqual([...item.stages].sort());
      for (const stage of item.stages) {
        expect(BANDS.has(item.emphasisBand[stage]!), item.id).toBe(true);
        expect(item.emphasisBand[stage], item.id).toBe(DIMENSION_EMPHASIS[item.dimension][stage]);
      }
    }
    for (const stage of SCREENING_STAGES) expect(itemsForStage(stage).every(item => item.stages.includes(stage))).toBe(true);
    expect(itemsForStage("PS").map(item => item.id)).toContain("TRE-02");
    expect(itemsForStage("PS").map(item => item.id)).not.toContain("TRE-04");
  });

  it("resolves every questionRef in scope.ts; maps each of the 52 guiding questions exactly once; overlay ⇔ no refs", () => {
    const native = REANALYSIS_SCOPES.filter(scope => scope.question).map(scope => scope.id);
    expect(native).toHaveLength(52);
    const refs = SCREENING_ITEMS.flatMap(item => item.questionRefs);
    for (const ref of refs) expect(native, ref).toContain(ref);
    expect([...refs].sort()).toEqual([...native].sort());
    for (const item of SCREENING_ITEMS) expect(item.overlay, item.id).toBe(item.questionRefs.length === 0);
    // Plan §4.2: CGH and LCO have no primary questions today — all overlay.
    expect(itemsFor("CGH").every(item => item.overlay)).toBe(true);
    expect(itemsFor("LCO").every(item => item.overlay)).toBe(true);
  });

  it("carries bands only — no numeric weights anywhere in the registry (D24-f)", () => {
    const NUMERIC_OK = new Set(["judges", "freshnessDays"]);
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        const key = path.split(".").at(-1)!;
        expect(NUMERIC_OK.has(key), `numeric value at ${path}`).toBe(true);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          expect(key, `${path}.${key}`).not.toMatch(/weight|coefficient|multiplier|points|score/i);
          walk(child, `${path}.${key}`);
        }
      }
    };
    for (const item of SCREENING_ITEMS) walk(item, item.id);
    const dir = join(__dirname);
    const files = [...readdirSync(dir).map(f => join(dir, f)), ...readdirSync(join(dir, "modules")).map(f => join(dir, "modules", f))]
      .filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/\bweights?\s*[:=]\s*[\d.{[]/i);
  });

  it("FTV never references age, education prestige or gender", () => {
    const EN = /\b(age|aged|ages|young|younger|youth|old|older|elderly|school|schools|university|universities|college|degree|degrees|education|educated|alma|ivy|elite|prestige|prestigious|gender|male|female|man|men|woman|women|sex|mother|father|married)\b/i;
    const VI = /(tuổi|trẻ tuổi|giới tính|nam giới|nữ giới|phụ nữ|đàn ông|học vấn|bằng cấp|trường học|trường đại học|đại học|danh tiếng)/i;
    for (const item of itemsFor("FTV")) {
      for (const text of strings(item)) {
        expect(text, item.id).not.toMatch(EN);
        expect(text, item.id).not.toMatch(VI);
      }
    }
  });

  it("encodes the mandatory screening rules (§4.2)", () => {
    expect(screeningItem("LCO-01")?.redFlags.some(flag => flag.hard)).toBe(true);
    expect(screeningItem("LCO-01")?.stages).toEqual(SCREENING_STAGES);
    expect(screeningItem("TRE-02")?.stages).toEqual(["PS"]);
    expect(screeningItem("TRE-02")?.rule).toMatch(/TRE-04.*TRE-06/);
    expect(screeningItem("CGH-01")?.rule).toMatch(/s169/);
    expect(screeningItem("CGH-01")?.evidence.sources).toContain("asic");
  });
});
