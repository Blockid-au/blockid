// Pins the runtime shape of `AGENT_ROLES` and `REPORT_TIER_CONFIG` — the two
// runtime exports from `types.ts` that gate every consumer of the multi-agent
// report pipeline (agent-dispatcher, section-assembler, orchestrator, paywall,
// credit charging, DOCX renderer). Silent renames, reordered roles, or a
// tier-config drift (min/max words, credit cost, docx/charts flag) would leak
// straight into pricing + report length + tier gating.

import { describe, expect, it } from "vitest";
import { AGENT_ROLES, REPORT_TIER_CONFIG } from "./types";

const CANONICAL_ROLES = [
  "ceo",
  "cto",
  "cfo",
  "cpo",
  "cmo",
  "cro",
  "clo",
  "chro",
  "ciso",
  "cdo",
  "coo",
] as const;

const CANONICAL_TIERS = ["standard", "premium", "investor_memo"] as const;

describe("AGENT_ROLES", () => {
  it("has exactly 11 entries — the full C-Level roster", () => {
    expect(AGENT_ROLES).toHaveLength(11);
  });

  it("preserves the shipped role order", () => {
    expect(AGENT_ROLES).toEqual([...CANONICAL_ROLES]);
  });

  it("has unique role ids", () => {
    expect(new Set(AGENT_ROLES).size).toBe(AGENT_ROLES.length);
  });

  it("uses lowercase snake-free abbreviations (3-4 letters, no whitespace)", () => {
    for (const r of AGENT_ROLES) {
      expect(r).toMatch(/^[a-z]{3,4}$/);
    }
  });

  it("includes each canonical C-Level role", () => {
    const shipped = new Set<string>(AGENT_ROLES);
    for (const canon of CANONICAL_ROLES) {
      expect(shipped.has(canon)).toBe(true);
    }
  });

  it("does not include any legacy or aliased role names", () => {
    const shipped = new Set<string>(AGENT_ROLES);
    // Common misspellings / historical aliases that must never re-appear
    for (const bad of ["cxo", "ceo1", "svp", "cco", "cro-legacy"]) {
      expect(shipped.has(bad)).toBe(false);
    }
  });

  it("puts CEO first — the orchestrator's wave-1 lead", () => {
    expect(AGENT_ROLES[0]).toBe("ceo");
  });

  it("puts COO last — the ops closer in the roster", () => {
    expect(AGENT_ROLES[AGENT_ROLES.length - 1]).toBe("coo");
  });

  it("is a readonly tuple (`as const`) — the array is a plain-Object literal", () => {
    // We can't observe TS types at runtime, but we can confirm the shipped
    // value is a plain array (not a subclass) and every entry is a string.
    expect(Array.isArray(AGENT_ROLES)).toBe(true);
    expect(Object.getPrototypeOf(AGENT_ROLES)).toBe(Array.prototype);
    for (const r of AGENT_ROLES) {
      expect(typeof r).toBe("string");
    }
  });
});

describe("REPORT_TIER_CONFIG", () => {
  it("exposes exactly the 3 canonical tier keys", () => {
    expect(Object.keys(REPORT_TIER_CONFIG).sort()).toEqual(
      [...CANONICAL_TIERS].sort(),
    );
  });

  it("every tier entry carries exactly the 7 documented keys", () => {
    const expected = [
      "label",
      "maxTokensPerAgent",
      "minWords",
      "maxWords",
      "creditCost",
      "includesDocx",
      "includesCharts",
    ].sort();
    for (const tier of CANONICAL_TIERS) {
      expect(Object.keys(REPORT_TIER_CONFIG[tier]).sort()).toEqual(expected);
    }
  });

  it("labels are non-empty and human-readable", () => {
    for (const tier of CANONICAL_TIERS) {
      const cfg = REPORT_TIER_CONFIG[tier];
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.label).toBe(cfg.label.trim());
    }
  });

  it("pins the standard tier — the free-tier baseline", () => {
    const s = REPORT_TIER_CONFIG.standard;
    expect(s.label).toBe("Standard Report");
    expect(s.maxTokensPerAgent).toBe(1500);
    expect(s.minWords).toBe(5000);
    expect(s.maxWords).toBe(8000);
    expect(s.creditCost).toBe(3.0);
    expect(s.includesDocx).toBe(false);
    expect(s.includesCharts).toBe(true);
  });

  it("pins the premium tier — mid tier with DOCX unlock", () => {
    const p = REPORT_TIER_CONFIG.premium;
    expect(p.label).toBe("Premium Report");
    expect(p.maxTokensPerAgent).toBe(3000);
    expect(p.minWords).toBe(8000);
    expect(p.maxWords).toBe(15000);
    expect(p.creditCost).toBe(7.0);
    expect(p.includesDocx).toBe(true);
    expect(p.includesCharts).toBe(true);
  });

  it("pins the investor_memo tier — the top tier", () => {
    const m = REPORT_TIER_CONFIG.investor_memo;
    expect(m.label).toBe("Investor Memo");
    expect(m.maxTokensPerAgent).toBe(4000);
    expect(m.minWords).toBe(12000);
    expect(m.maxWords).toBe(20000);
    expect(m.creditCost).toBe(10.0);
    expect(m.includesDocx).toBe(true);
    expect(m.includesCharts).toBe(true);
  });

  it("minWords is strictly less than maxWords for every tier", () => {
    for (const tier of CANONICAL_TIERS) {
      const cfg = REPORT_TIER_CONFIG[tier];
      expect(cfg.minWords).toBeLessThan(cfg.maxWords);
    }
  });

  it("credit costs are monotonically ascending — standard < premium < investor_memo", () => {
    const s = REPORT_TIER_CONFIG.standard.creditCost;
    const p = REPORT_TIER_CONFIG.premium.creditCost;
    const m = REPORT_TIER_CONFIG.investor_memo.creditCost;
    expect(s).toBeLessThan(p);
    expect(p).toBeLessThan(m);
  });

  it("maxTokensPerAgent is monotonically ascending across tiers", () => {
    const s = REPORT_TIER_CONFIG.standard.maxTokensPerAgent;
    const p = REPORT_TIER_CONFIG.premium.maxTokensPerAgent;
    const m = REPORT_TIER_CONFIG.investor_memo.maxTokensPerAgent;
    expect(s).toBeLessThan(p);
    expect(p).toBeLessThan(m);
  });

  it("minWords is monotonically ascending across tiers", () => {
    expect(REPORT_TIER_CONFIG.standard.minWords).toBeLessThan(
      REPORT_TIER_CONFIG.premium.minWords,
    );
    expect(REPORT_TIER_CONFIG.premium.minWords).toBeLessThan(
      REPORT_TIER_CONFIG.investor_memo.minWords,
    );
  });

  it("maxWords is monotonically ascending across tiers", () => {
    expect(REPORT_TIER_CONFIG.standard.maxWords).toBeLessThan(
      REPORT_TIER_CONFIG.premium.maxWords,
    );
    expect(REPORT_TIER_CONFIG.premium.maxWords).toBeLessThan(
      REPORT_TIER_CONFIG.investor_memo.maxWords,
    );
  });

  it("all numeric fields are positive integers (except creditCost which is decimal-friendly)", () => {
    for (const tier of CANONICAL_TIERS) {
      const cfg = REPORT_TIER_CONFIG[tier];
      expect(Number.isInteger(cfg.maxTokensPerAgent)).toBe(true);
      expect(cfg.maxTokensPerAgent).toBeGreaterThan(0);
      expect(Number.isInteger(cfg.minWords)).toBe(true);
      expect(cfg.minWords).toBeGreaterThan(0);
      expect(Number.isInteger(cfg.maxWords)).toBe(true);
      expect(cfg.maxWords).toBeGreaterThan(0);
      expect(cfg.creditCost).toBeGreaterThan(0);
      expect(Number.isFinite(cfg.creditCost)).toBe(true);
    }
  });

  it("boolean flags are strict booleans (not truthy/falsy strings)", () => {
    for (const tier of CANONICAL_TIERS) {
      const cfg = REPORT_TIER_CONFIG[tier];
      expect(typeof cfg.includesDocx).toBe("boolean");
      expect(typeof cfg.includesCharts).toBe("boolean");
    }
  });

  it("every tier includesCharts (charts are the shared visual baseline)", () => {
    for (const tier of CANONICAL_TIERS) {
      expect(REPORT_TIER_CONFIG[tier].includesCharts).toBe(true);
    }
  });

  it("only paid tiers unlock DOCX export", () => {
    expect(REPORT_TIER_CONFIG.standard.includesDocx).toBe(false);
    expect(REPORT_TIER_CONFIG.premium.includesDocx).toBe(true);
    expect(REPORT_TIER_CONFIG.investor_memo.includesDocx).toBe(true);
  });

  it("the tier key set is stable — no accidental extra keys leaking in", () => {
    const shipped = Object.keys(REPORT_TIER_CONFIG);
    for (const key of shipped) {
      expect(CANONICAL_TIERS as readonly string[]).toContain(key);
    }
  });

  it("labels are unique across tiers so UI listings never collide", () => {
    const labels = CANONICAL_TIERS.map((t) => REPORT_TIER_CONFIG[t].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("credit costs are unique across tiers so pricing rows never collide", () => {
    const costs = CANONICAL_TIERS.map((t) => REPORT_TIER_CONFIG[t].creditCost);
    expect(new Set(costs).size).toBe(costs.length);
  });
});

describe("AGENT_ROLES × REPORT_TIER_CONFIG cross-checks", () => {
  it("has 11 roles × 3 tiers = 33 (agent, tier) combinations the dispatcher iterates over", () => {
    expect(AGENT_ROLES.length * Object.keys(REPORT_TIER_CONFIG).length).toBe(33);
  });

  it("every tier's maxTokensPerAgent × 11 roles stays under a 100k combined-token ceiling for orchestration cost sanity", () => {
    for (const tier of CANONICAL_TIERS) {
      const combined = REPORT_TIER_CONFIG[tier].maxTokensPerAgent * AGENT_ROLES.length;
      expect(combined).toBeLessThanOrEqual(100_000);
    }
  });
});
