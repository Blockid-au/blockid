// Vitest coverage for the 13-criterion evaluation taxonomy that grounds the
// SVI enhanced score + investor-readiness sub-scores (P5) + atlassian-showcase
// fixture cross-consistency guard (P4). The module is a pure static
// registry + a pair of lookup helpers + two scoring helpers; drift in any
// of them silently corrupts the readiness tile, the atlassian fixture
// coverage guard, and the composite SVI score, so we pin the branch matrix.

import { describe, expect, it } from "vitest";

import {
  CRITERIA,
  CRITERION_KEYS,
  QUALITY_LEVELS,
  computeEvaluationProgress,
  computeQuality,
  getCriteriaByAgent,
  getCriteriaByDimension,
  getCriterion,
  type CriterionKey,
  type QualityLevel,
} from "./evaluation-criteria";

const KNOWN_AGENTS = new Set([
  "ceo",
  "cfo",
  "cto",
  "cmo",
  "coo",
  "cpo",
  "cro",
  "clo",
  "chro",
  "cdo",
  "ciso",
]);

const KNOWN_DIMENSIONS = new Set([
  "mpc",
  "svm",
  "ftv",
  "ptd",
  "tre",
  "iri",
  "lco",
  "cgh",
]);

describe("CRITERION_KEYS registry", () => {
  it("has exactly 13 keys, each unique", () => {
    expect(CRITERION_KEYS.length).toBe(13);
    expect(new Set(CRITERION_KEYS).size).toBe(13);
  });

  it("CRITERIA has one entry per key with matching order", () => {
    expect(CRITERIA.length).toBe(CRITERION_KEYS.length);
    for (let i = 0; i < CRITERIA.length; i += 1) {
      expect(CRITERIA[i].key).toBe(CRITERION_KEYS[i]);
    }
  });

  it("weights sum to exactly 100 (SVI composite invariant)", () => {
    const total = CRITERIA.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });

  it("QUALITY_LEVELS contains the canonical 5-level ladder", () => {
    expect([...QUALITY_LEVELS]).toEqual([
      "incomplete",
      "basic",
      "good",
      "strong",
      "exceptional",
    ]);
  });
});

describe("CRITERIA content shape", () => {
  it("every criterion has non-empty title / titleVi / subtitle / icon", () => {
    for (const c of CRITERIA) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.titleVi.length).toBeGreaterThan(0);
      expect(c.subtitle.length).toBeGreaterThan(0);
      expect(c.icon.length).toBeGreaterThan(0);
    }
  });

  it("every criterion carries a positive integer minEvidence and a positive weight", () => {
    for (const c of CRITERIA) {
      expect(Number.isInteger(c.minEvidence)).toBe(true);
      expect(c.minEvidence).toBeGreaterThan(0);
      expect(c.weight).toBeGreaterThan(0);
    }
  });

  it("primary + supporting agents fall inside the known C-Level roster", () => {
    for (const c of CRITERIA) {
      expect(KNOWN_AGENTS.has(c.primaryAgent)).toBe(true);
      for (const s of c.supportingAgents) {
        expect(KNOWN_AGENTS.has(s)).toBe(true);
      }
    }
  });

  it("primary + secondary dimensions map to the canonical 8-dimension SVI keys", () => {
    for (const c of CRITERIA) {
      expect(KNOWN_DIMENSIONS.has(c.primaryDimension)).toBe(true);
      for (const s of c.secondaryDimensions) {
        expect(KNOWN_DIMENSIONS.has(s)).toBe(true);
      }
    }
  });

  it("guidingQuestions has at least 3 prompts per criterion", () => {
    for (const c of CRITERIA) {
      expect(c.guidingQuestions.length).toBeGreaterThanOrEqual(3);
      for (const q of c.guidingQuestions) {
        expect(q.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getCriterion", () => {
  it("returns the CriterionDef for every canonical key", () => {
    for (const key of CRITERION_KEYS) {
      const def = getCriterion(key);
      expect(def).toBeDefined();
      expect(def?.key).toBe(key);
    }
  });

  it("returns undefined for an unknown key", () => {
    expect(getCriterion("not-a-key" as unknown as CriterionKey)).toBeUndefined();
  });
});

describe("getCriteriaByAgent", () => {
  it("returns only entries whose primaryAgent matches", () => {
    const cmoOwned = getCriteriaByAgent("cmo");
    expect(cmoOwned.length).toBeGreaterThan(0);
    for (const c of cmoOwned) expect(c.primaryAgent).toBe("cmo");
  });

  it("supportingAgents-only membership does NOT match (only primary counts)", () => {
    // "cto" is a supporting agent on several criteria but only primary on `code_git`.
    const ctoPrimary = getCriteriaByAgent("cto");
    expect(ctoPrimary.map((c) => c.key)).toEqual(["code_git"]);
  });

  it("returns [] for an agent nobody primary-owns", () => {
    expect(getCriteriaByAgent("ceo")).toEqual([]);
  });
});

describe("getCriteriaByDimension", () => {
  it("matches primary dimension case-insensitively", () => {
    const mpcLower = getCriteriaByDimension("mpc");
    const mpcUpper = getCriteriaByDimension("MPC");
    expect(mpcLower.length).toBeGreaterThan(0);
    expect(mpcLower).toEqual(mpcUpper);
    for (const c of mpcLower) {
      const matches =
        c.primaryDimension === "mpc" || c.secondaryDimensions.includes("mpc");
      expect(matches).toBe(true);
    }
  });

  it("matches secondary dimension too", () => {
    // `roadmap` has `secondaryDimensions: ["ptd"]` — check that a ptd query
    // surfaces it alongside code_git + website (primaryDimension = "ptd").
    const ptdCriteria = getCriteriaByDimension("ptd");
    const keys = new Set(ptdCriteria.map((c) => c.key));
    expect(keys.has("code_git")).toBe(true);
    expect(keys.has("website")).toBe(true);
    expect(keys.has("roadmap")).toBe(true);
  });

  it("returns [] for an unknown dimension", () => {
    expect(getCriteriaByDimension("nope")).toEqual([]);
  });
});

describe("computeQuality — evidence ladder", () => {
  const empty = { text_input: "", files: [], links: [] };

  it("no evidence at all → 'incomplete'", () => {
    expect(computeQuality(empty)).toBe("incomplete");
  });

  it("single evidence item (file only) → 'basic'", () => {
    expect(
      computeQuality({ text_input: "", files: ["a.pdf"], links: [] }),
    ).toBe("basic");
  });

  it("hasText (>50 chars) with no other evidence → 'good' (hasText+totalEvidence>=1 branch fires before basic)", () => {
    const long = "x".repeat(51);
    expect(
      computeQuality({ text_input: long, files: [], links: [] }),
    ).toBe("good");
  });

  it("text at exactly 50 chars is NOT hasText (strict > 50)", () => {
    const border = "x".repeat(50);
    // 0 hasText + 0 files + 0 links → totalEvidence = 0 → 'incomplete'
    expect(
      computeQuality({ text_input: border, files: [], links: [] }),
    ).toBe("incomplete");
  });

  it("two files (no text, no ai_score) → 'good'", () => {
    expect(
      computeQuality({ text_input: "", files: ["a", "b"], links: [] }),
    ).toBe("good");
  });

  it("hasText + one file (totalEvidence=2 via the hasText+>=1 branch) → 'good'", () => {
    const long = "x".repeat(51);
    expect(
      computeQuality({ text_input: long, files: ["a"], links: [] }),
    ).toBe("good");
  });

  it("ai_score=60 + totalEvidence=2 → 'strong'", () => {
    expect(
      computeQuality({
        text_input: "",
        files: ["a", "b"],
        links: [],
        ai_score: 60,
      }),
    ).toBe("strong");
  });

  it("ai_score=80 + totalEvidence=3 → 'exceptional'", () => {
    expect(
      computeQuality({
        text_input: "",
        files: ["a", "b", "c"],
        links: [],
        ai_score: 80,
      }),
    ).toBe("exceptional");
  });

  it("ai_score=80 but only 2 evidence items → 'strong' (fails exceptional totalEvidence>=3 gate)", () => {
    expect(
      computeQuality({
        text_input: "",
        files: ["a", "b"],
        links: [],
        ai_score: 80,
      }),
    ).toBe("strong");
  });

  it("ai_score=null + totalEvidence=3 → 'good' (no ai_score means no strong/exceptional bump)", () => {
    expect(
      computeQuality({
        text_input: "",
        files: ["a", "b", "c"],
        links: [],
        ai_score: null,
      }),
    ).toBe("good");
  });

  it("ai_score=59 + totalEvidence=2 → 'good' (fails strong ≥60 gate)", () => {
    expect(
      computeQuality({
        text_input: "",
        files: ["a", "b"],
        links: [],
        ai_score: 59,
      }),
    ).toBe("good");
  });
});

describe("computeEvaluationProgress", () => {
  it("empty input → 0 (all 13 default to 'incomplete')", () => {
    expect(computeEvaluationProgress([])).toBe(0);
  });

  it("all 13 at 'exceptional' → 100", () => {
    const rows = CRITERION_KEYS.map((k) => ({
      criterion_key: k,
      quality_level: "exceptional",
    }));
    expect(computeEvaluationProgress(rows)).toBe(100);
  });

  it("all 13 at 'basic' → 25", () => {
    const rows = CRITERION_KEYS.map((k) => ({
      criterion_key: k,
      quality_level: "basic",
    }));
    expect(computeEvaluationProgress(rows)).toBe(25);
  });

  it("all 13 at 'strong' → 75", () => {
    const rows = CRITERION_KEYS.map((k) => ({
      criterion_key: k,
      quality_level: "strong",
    }));
    expect(computeEvaluationProgress(rows)).toBe(75);
  });

  it("unknown quality_level defaults to 0 (contributes nothing)", () => {
    const rows = CRITERION_KEYS.map((k) => ({
      criterion_key: k,
      quality_level: "banana",
    }));
    expect(computeEvaluationProgress(rows)).toBe(0);
  });

  it("missing criterion_key defaults to 'incomplete' → 0", () => {
    // Only one criterion supplied at 'exceptional' → 100/13 rounded to nearest int.
    const rows = [
      { criterion_key: "revenue", quality_level: "exceptional" },
    ];
    expect(computeEvaluationProgress(rows)).toBe(Math.round(100 / 13));
  });

  it("ignores rows with unknown criterion_key (they do not double-count)", () => {
    const rows = [
      { criterion_key: "revenue", quality_level: "exceptional" },
      { criterion_key: "ghost-criterion", quality_level: "exceptional" },
    ];
    expect(computeEvaluationProgress(rows)).toBe(Math.round(100 / 13));
  });

  it("mixes 'good' + missing → weighted mean rounds to integer", () => {
    // 3 'good' (50 each) + 10 missing → 150 / 13 ≈ 11.538 → 12
    const rows = [
      { criterion_key: "idea", quality_level: "good" },
      { criterion_key: "market", quality_level: "good" },
      { criterion_key: "revenue", quality_level: "good" },
    ];
    expect(computeEvaluationProgress(rows)).toBe(
      Math.round((3 * 50) / 13),
    );
  });
});

describe("QualityLevel enum round-trip", () => {
  it("every string in QUALITY_LEVELS is a valid QualityLevel and computeQuality output stays in the set", () => {
    const outputs: QualityLevel[] = [
      computeQuality({ text_input: "", files: [], links: [] }),
      computeQuality({ text_input: "", files: ["a"], links: [] }),
      computeQuality({ text_input: "", files: ["a", "b"], links: [] }),
      computeQuality({
        text_input: "",
        files: ["a", "b"],
        links: [],
        ai_score: 60,
      }),
      computeQuality({
        text_input: "",
        files: ["a", "b", "c"],
        links: [],
        ai_score: 80,
      }),
    ];
    for (const out of outputs) {
      expect((QUALITY_LEVELS as readonly string[]).includes(out)).toBe(true);
    }
  });
});
