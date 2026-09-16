import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SECTOR_KEYS } from "@/lib/valuation/sector-multiples-static";
import { isBenchmarkSector } from "@/lib/svi/sector-map";
import { INDUSTRY_OPTIONS, INTAKE_STAGES } from "@/lib/funding/intake";
import { FOUNDER_STAGES } from "@/lib/agents/grant-advisor-rules";
import { LEGACY_SVI_STAGE_LABELS, SECTOR_LABELS, detectSector } from "@/lib/svi-analysis";
import { STAGE_BANDS } from "@/lib/investor-portal";
import { STAGES as BENCHMARK_STAGES } from "@/lib/benchmarks";
import { GROWTH_PHASE_IDS } from "@/lib/journey-map";
import { CANONICAL_STAGES, sviStageToCanonical } from "@/lib/journey-vocabulary";
import { AU_STATES } from "@/lib/evaluations";

import {
  BUSINESS_MODELS,
  BUSINESS_MODEL_LABELS,
  CUSTOMER_TYPES,
  GEO_SCOPES,
  HQ_STATES,
  INDUSTRIES,
  INDUSTRY_ANZSIC,
  INDUSTRY_LABELS,
  INDUSTRY_PATTERNS,
  INDUSTRY_TO_BENCHMARK_SECTOR,
  INDUSTRY_TO_INTAKE_OPTION,
  INDUSTRY_TO_LISTING_SECTOR,
  INDUSTRY_TO_MULTIPLES_KEY,
  LEGACY_SECTOR_TO_INDUSTRY,
  LEGACY_STAGE_TO_STAGE_KEY,
  LEGACY_TO_BUSINESS_MODEL,
  PROTECTED_TAGS,
  STAGE_BAND_TO_STAGE_KEYS,
  SUGGESTABLE_TAGS,
  TAGS,
  TAG_LABELS,
  TAXONOMY_VERSION,
  crosswalkBusinessModel,
  crosswalkIndustry,
  crosswalkIndustryDetailed,
  crosswalkStage,
  crosswalkStageDetailed,
  isBusinessModel,
  isIndustry,
  isRegulatedByRule,
  isStageKey,
  multiplesKeyFor,
} from "./startup-taxonomy";

const SRC = resolve(__dirname, "..", "..");

/** Keys of a `const NAME: Record<string, string> = { key: "…", … }` literal in a source file (non-exported vocabularies). */
function recordKeys(file: string, name: string): string[] {
  const text = readFileSync(resolve(SRC, file), "utf8");
  const m = text.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return [...m[1].matchAll(/^\s*"?([a-z_]+)"?\s*:/gm)].map((x) => x[1]);
}

function arrayStrings(file: string, name: string): string[] {
  const text = readFileSync(resolve(SRC, file), "utf8");
  const m = text.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function optionValues(file: string, name: string): string[] {
  const text = readFileSync(resolve(SRC, file), "utf8");
  const m = text.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return [...m[1].matchAll(/(?:value|id|key):\s*"([^"]+)"/g)].map((x) => x[1]);
}

// ─── Legacy vocabularies (the ≥ 6 sector + ≥ 5 stage lists §B.1 names) ───────

const DETECT_SECTOR_SLUGS = [...readFileSync(resolve(SRC, "lib/svi-analysis.ts"), "utf8").matchAll(/return "([a-z]+)";/g)]
  .map((m) => m[1])
  .filter((s, i, arr) => arr.indexOf(s) === i);

const SECTOR_VOCABULARIES: Array<{ name: string; values: string[]; min: number }> = [
  { name: "detectSector slugs (svi-analysis.ts:122)", values: DETECT_SECTOR_SLUGS.filter((s) => s in SECTOR_LABELS), min: 25 },
  { name: "SECTOR_LABELS keys (svi-analysis.ts:94)", values: Object.keys(SECTOR_LABELS), min: 25 },
  { name: "Sector multiples keys (valuation/sector-multiples-static.ts:17)", values: [...SECTOR_KEYS], min: 27 },
  { name: "BenchmarkSector (svi/sector-map.ts:9)", values: ["saas", "marketplace", "fintech", "healthtech", "climatetech", "hardware", "consumer", "deeptech", "default"], min: 9 },
  { name: "INDUSTRY_OPTIONS (funding/intake.ts:52)", values: INDUSTRY_OPTIONS.map((o) => o.value), min: 22 },
  { name: "SECTOR_LABEL (startup-index-listings.ts:10)", values: recordKeys("lib/startup-index-listings.ts", "SECTOR_LABEL"), min: 8 },
  { name: "SECTOR_OPTS (app/startup-index/listings/page.tsx:25)", values: arrayStrings("app/startup-index/listings/page.tsx", "SECTOR_OPTS").filter((s) => s !== "all"), min: 7 },
  { name: "SECTORS (tools/financial-projections/financial-projections-calculator.tsx:18)", values: optionValues("app/tools/financial-projections/financial-projections-calculator.tsx", "SECTORS"), min: 6 },
  { name: "SECTOR_OPTIONS (tools/financial-projections/projections-tool.tsx:24)", values: optionValues("app/tools/financial-projections/projections-tool.tsx", "SECTOR_OPTIONS"), min: 8 },
  { name: "SECTORS (tools/idea-lab/idea-lab-tool.tsx:62)", values: optionValues("app/tools/idea-lab/idea-lab-tool.tsx", "SECTORS"), min: 3 },
];

const STAGE_VOCABULARIES: Array<{ name: string; values: Array<string | number>; min: number }> = [
  { name: "SVI stage int 0–7 (journey-vocabulary.ts:249)", values: [0, 1, 2, 3, 4, 5, 6, 7], min: 8 },
  { name: "FOUNDER_STAGES (agents/grant-advisor-rules.ts:25)", values: [...FOUNDER_STAGES], min: 6 },
  { name: "INTAKE_STAGES (funding/intake.ts:43)", values: INTAKE_STAGES.map((s) => s.value), min: 5 },
  { name: "StageBand (investor-portal.ts:27)", values: [...STAGE_BANDS], min: 6 },
  { name: "benchmarks STAGES (benchmarks.ts:164)", values: Object.keys(BENCHMARK_STAGES), min: 4 },
  { name: "MaturityLevel (agents/maturity-detector.ts:18)", values: ["idea", "early", "growth", "scale", "established"], min: 5 },
  { name: "GrowthPhaseId (journey-map.ts:165)", values: [...GROWTH_PHASE_IDS], min: 12 },
  { name: "LEGACY_SVI_STAGE_LABELS (svi-analysis.ts:19)", values: [...LEGACY_SVI_STAGE_LABELS], min: 8 },
  { name: "STAGE_LABEL (startup-index-listings.ts:21)", values: arrayStrings("lib/startup-index-listings.ts", "STAGE_LABEL"), min: 8 },
  { name: "cfo dashboard STAGE_OPTIONS", values: optionValues("app/(app)/(founder)/dashboard/cfo/cfo-dashboard-client.tsx", "STAGE_OPTIONS"), min: 8 },
  { name: "equity-offer STAGE_OPTIONS", values: optionValues("app/(app)/(founder)/workspace/equity-offer/request/page.tsx", "STAGE_OPTIONS"), min: 4 },
  { name: "CANONICAL_STAGES (identity)", values: [...CANONICAL_STAGES], min: 8 },
];

// ─── Enums ───────────────────────────────────────────────────────────────────

describe("taxonomy enums (§B.2–B.4, Appendix 3)", () => {
  it("has the 22 industries + professional_services + unclassified", () => {
    expect(INDUSTRIES).toHaveLength(24);
    expect(INDUSTRIES.at(-1)).toBe("unclassified");
    expect(INDUSTRIES).toContain("professional_services");
    expect(new Set(INDUSTRIES).size).toBe(24);
  });

  it("has 10 business models + unclassified, 5 customer types, 5 geo scopes, 11 tags, 2 protected", () => {
    expect(BUSINESS_MODELS).toHaveLength(11);
    expect(CUSTOMER_TYPES).toHaveLength(5);
    expect(GEO_SCOPES).toHaveLength(5);
    expect(TAGS).toHaveLength(11);
    expect(PROTECTED_TAGS).toEqual(["female_founded", "first_nations"]);
    expect(SUGGESTABLE_TAGS).toHaveLength(9);
    expect(SUGGESTABLE_TAGS).not.toContain("female_founded");
    expect(SUGGESTABLE_TAGS).not.toContain("first_nations");
    expect(TAXONOMY_VERSION).toBe("1.0.0");
  });

  it("HQ_STATES mirrors AU_STATES in evaluations.ts", () => {
    expect([...HQ_STATES]).toEqual([...AU_STATES]);
  });

  it("every enum value has EN + VI labels and an ANZSIC anchor", () => {
    for (const i of INDUSTRIES) {
      expect(INDUSTRY_LABELS[i].en.length).toBeGreaterThan(0);
      expect(INDUSTRY_LABELS[i].vi.length).toBeGreaterThan(0);
      expect(INDUSTRY_ANZSIC[i]).toBeDefined();
    }
    for (const b of BUSINESS_MODELS) expect(BUSINESS_MODEL_LABELS[b].vi.length).toBeGreaterThan(0);
    for (const t of TAGS) expect(TAG_LABELS[t].en.length).toBeGreaterThan(0);
    expect(INDUSTRY_LABELS.unclassified.en).toBe("Unclassified"); // never "Other" (T1)
    expect(INDUSTRY_ANZSIC.unclassified.division).toBeNull();
  });

  it("derived legacy tables cover every industry with a valid target", () => {
    for (const i of INDUSTRIES) {
      expect(SECTOR_KEYS).toContain(INDUSTRY_TO_MULTIPLES_KEY[i]);
      expect(isBenchmarkSector(INDUSTRY_TO_BENCHMARK_SECTOR[i])).toBe(true);
      expect(recordKeys("lib/startup-index-listings.ts", "SECTOR_LABEL")).toContain(INDUSTRY_TO_LISTING_SECTOR[i]);
      const opt = INDUSTRY_TO_INTAKE_OPTION[i];
      if (opt) expect(INDUSTRY_OPTIONS.map((o) => o.value)).toContain(opt);
    }
  });

  it("multiplesKeyFor: marketplace business model overrides, sub_industry wins, else industry crosswalk", () => {
    expect(multiplesKeyFor({ industry: "fintech", business_model: "marketplace_platform" })).toBe("marketplace");
    expect(multiplesKeyFor({ industry: "fintech", business_model: "transactional_fintech", sub_industry: "wealthtech" })).toBe("wealthtech");
    expect(multiplesKeyFor({ industry: "fintech", business_model: "unclassified" })).toBe("fintech");
    expect(multiplesKeyFor({ industry: "unclassified", business_model: "unclassified" })).toBe("default");
  });
});

// ─── Crosswalk: every legacy vocabulary maps, never throws ───────────────────

describe("crosswalkIndustry — every legacy sector vocabulary", () => {
  for (const vocab of SECTOR_VOCABULARIES) {
    it(`${vocab.name}: ${vocab.values.length} values → canonical or unclassified`, () => {
      expect(vocab.values.length).toBeGreaterThanOrEqual(vocab.min);
      for (const v of vocab.values) {
        const out = crosswalkIndustry(v);
        expect(isIndustry(out), `${vocab.name} value "${v}" → ${out}`).toBe(true);
      }
    });
  }

  it("detectSector slugs: only marketplace maps to unclassified (business model), the rest to a real industry", () => {
    const unclassified = DETECT_SECTOR_SLUGS.filter((s) => crosswalkIndustry(s) === "unclassified");
    expect(unclassified).toEqual(["marketplace"]);
    expect(crosswalkIndustryDetailed("wealthtech")).toEqual({ industry: "fintech", sub_industry: "wealthtech", via: "legacy" });
    expect(crosswalkIndustryDetailed("marketplace").sub_industry).toBeNull();
  });

  it("INDUSTRY_OPTIONS: only social_enterprise (→ tag) is unclassified; merged values land per §B.2", () => {
    const unclassified = INDUSTRY_OPTIONS.map((o) => o.value).filter((v) => crosswalkIndustry(v) === "unclassified");
    expect(unclassified).toEqual(["social_enterprise"]);
    expect(crosswalkIndustry("cleantech_renewables")).toBe("climate_cleantech");
    expect(crosswalkIndustry("climate")).toBe("climate_cleantech");
    expect(crosswalkIndustry("quantum")).toBe("deeptech_quantum");
    expect(crosswalkIndustry("proptech")).toBe("proptech_construction");
    expect(crosswalkIndustry("construction")).toBe("proptech_construction");
    expect(crosswalkIndustry("creative_media")).toBe("media_creative_gaming");
    expect(crosswalkIndustry("tourism_hospitality")).toBe("travel_tourism_hospitality");
    expect(crosswalkIndustry("transport_logistics")).toBe("transport_logistics_mobility");
    expect(crosswalkIndustry("professional_services")).toBe("professional_services");
  });

  it("BenchmarkSector buckets that are not industries stay unclassified (hardware / consumer / marketplace / default)", () => {
    expect(crosswalkIndustry("hardware")).toBe("unclassified");
    expect(crosswalkIndustry("consumer")).toBe("unclassified");
    expect(crosswalkIndustry("default")).toBe("unclassified");
    expect(crosswalkIndustry("climatetech")).toBe("climate_cleantech");
    expect(crosswalkIndustry("ai")).toBe("ai_ml");
  });

  it("canonical values are idempotent; case / whitespace / separators are tolerated", () => {
    for (const i of INDUSTRIES) expect(crosswalkIndustry(i)).toBe(i);
    expect(crosswalkIndustry(" Software / SaaS ")).toBe("software_saas");
    expect(crosswalkIndustry("Healthtech-Medtech")).toBe("healthtech_medtech");
    expect(crosswalkIndustry("FINTECH")).toBe("fintech");
  });

  it("free text (projects.industry style) goes through the regexes; nonsense → unclassified; never throws", () => {
    expect(crosswalkIndustry("B2B SaaS platform for accountants")).toBe("software_saas");
    expect(crosswalkIndustry("Climate tech / hardware")).toBe("climate_cleantech");
    expect(crosswalkIndustry("Fintech — lending")).toBe("fintech");
    expect(crosswalkIndustry("Generative AI copilots")).toBe("ai_ml");
    expect(crosswalkIndustry("Sovereign capability for the ADF")).toBe("defence_dualuse");
    expect(crosswalkIndustry("METS for iron ore exploration")).toBe("mining_resources_tech");
    expect(crosswalkIndustry("Widgets")).toBe("unclassified");
    expect(crosswalkIndustry("")).toBe("unclassified");
    expect(crosswalkIndustry(null)).toBe("unclassified");
    expect(crosswalkIndustry(undefined)).toBe("unclassified");
    expect(crosswalkIndustry(123 as unknown as string)).toBe("unclassified");
    expect(crosswalkIndustry("x".repeat(5000))).toBe("unclassified");
  });

  it("every LEGACY_SECTOR_TO_INDUSTRY target and INDUSTRY_PATTERNS industry is canonical", () => {
    for (const v of Object.values(LEGACY_SECTOR_TO_INDUSTRY)) expect(isIndustry(v)).toBe(true);
    for (const p of INDUSTRY_PATTERNS) expect(isIndustry(p.industry) && p.industry !== "unclassified").toBe(true);
  });

  it("the detectSector regexes and the crosswalk agree on the SECTOR_LABELS sample text", () => {
    // Every SECTOR_LABELS key is itself detectable by detectSector; the crosswalk must accept whatever it returns.
    for (const slug of Object.keys(SECTOR_LABELS)) {
      const detected = detectSector(`${slug}`) ?? slug;
      expect(isIndustry(crosswalkIndustry(detected))).toBe(true);
    }
  });
});

describe("crosswalkStage — every legacy stage vocabulary", () => {
  for (const vocab of STAGE_VOCABULARIES) {
    it(`${vocab.name}: ${vocab.values.length} values → canonical stage, all recognised`, () => {
      expect(vocab.values.length).toBeGreaterThanOrEqual(vocab.min);
      for (const v of vocab.values) {
        const out = crosswalkStageDetailed(v);
        expect(isStageKey(out.stage_key), `${vocab.name} value "${v}" → ${out.stage_key}`).toBe(true);
        expect(out.recognised, `${vocab.name} value "${v}" should be recognised`).toBe(true);
      }
    });
  }

  it("SVI ints follow sviStageToCanonical; out-of-range / junk → idea, unrecognised", () => {
    for (let i = 0; i <= 7; i++) expect(crosswalkStage(i)).toBe(sviStageToCanonical(i));
    expect(crosswalkStage("3")).toBe("seed");
    expect(crosswalkStageDetailed(99)).toEqual({ stage_key: "idea", recognised: false });
    expect(crosswalkStageDetailed(Number.NaN)).toEqual({ stage_key: "idea", recognised: false });
    expect(crosswalkStageDetailed(null)).toEqual({ stage_key: "idea", recognised: false });
    expect(crosswalkStageDetailed("")).toEqual({ stage_key: "idea", recognised: false });
    expect(crosswalkStageDetailed("banana")).toEqual({ stage_key: "idea", recognised: false });
  });

  it("INTAKE_STAGES map per §B.4 (idea, validation, mvp_early_revenue ×2, seed)", () => {
    expect(INTAKE_STAGES.map((s) => crosswalkStage(s.value))).toEqual(["idea", "validation", "mvp_early_revenue", "mvp_early_revenue", "seed"]);
  });

  it("StageBand → sets per §B.4 and a representative single stage", () => {
    expect(STAGE_BAND_TO_STAGE_KEYS.pre_seed).toEqual(["idea", "validation", "mvp_early_revenue"]);
    expect(STAGE_BAND_TO_STAGE_KEYS.seed).toEqual(["seed"]);
    expect(STAGE_BAND_TO_STAGE_KEYS.series_b).toEqual(["series_b_c"]);
    expect(STAGE_BAND_TO_STAGE_KEYS.growth).toEqual(["late_stage", "public_exit"]);
    expect(STAGE_BAND_TO_STAGE_KEYS.any).toHaveLength(8);
    expect(crosswalkStage("series_b")).toBe("series_b_c");
    expect(crosswalkStage("Pre-seed")).toBe("mvp_early_revenue");
    expect(crosswalkStage("Series A+")).toBe("series_a");
    expect(crosswalkStage("series-b")).toBe("series_b_c");
  });

  it("legacy labels by index agree with sviStageToCanonical", () => {
    LEGACY_SVI_STAGE_LABELS.forEach((label, i) => expect(crosswalkStage(label)).toBe(sviStageToCanonical(i)));
  });

  it("all LEGACY_STAGE_TO_STAGE_KEY targets are canonical", () => {
    for (const v of Object.values(LEGACY_STAGE_TO_STAGE_KEY)) expect(isStageKey(v)).toBe(true);
  });
});

describe("crosswalkBusinessModel", () => {
  it("maps legacy sector / bucket keys and never throws", () => {
    expect(crosswalkBusinessModel("marketplace")).toBe("marketplace_platform");
    expect(crosswalkBusinessModel("saas")).toBe("saas_subscription");
    expect(crosswalkBusinessModel("ecommerce")).toBe("ecommerce_d2c");
    expect(crosswalkBusinessModel("consumer")).toBe("consumer_app");
    expect(crosswalkBusinessModel("hardware")).toBe("hardware_devices");
    expect(crosswalkBusinessModel("biotech")).toBe("biotech_regulated_pipeline");
    expect(crosswalkBusinessModel("fintech")).toBe("transactional_fintech");
    expect(crosswalkBusinessModel("professional_services")).toBe("agency_consultancy");
    expect(crosswalkBusinessModel("Two-sided marketplace")).toBe("marketplace_platform");
    expect(crosswalkBusinessModel("healthtech")).toBe("unclassified"); // an industry, not a model
    expect(crosswalkBusinessModel("")).toBe("unclassified");
    expect(crosswalkBusinessModel(null)).toBe("unclassified");
    expect(crosswalkBusinessModel(undefined)).toBe("unclassified");
    for (const b of BUSINESS_MODELS) expect(crosswalkBusinessModel(b)).toBe(b);
    for (const v of Object.values(LEGACY_TO_BUSINESS_MODEL)) expect(isBusinessModel(v)).toBe(true);
  });

  it("every sector vocabulary value yields a canonical business model or unclassified", () => {
    for (const vocab of SECTOR_VOCABULARIES) {
      for (const v of vocab.values) expect(isBusinessModel(crosswalkBusinessModel(v))).toBe(true);
    }
  });
});

describe("regulated auto rule (§B.4 vi)", () => {
  it("fires for fintech/biotech models and healthtech/defence industries only", () => {
    expect(isRegulatedByRule("software_saas", "transactional_fintech")).toBe(true);
    expect(isRegulatedByRule("software_saas", "biotech_regulated_pipeline")).toBe(true);
    expect(isRegulatedByRule("healthtech_medtech", "saas_subscription")).toBe(true);
    expect(isRegulatedByRule("defence_dualuse", "unclassified")).toBe(true);
    expect(isRegulatedByRule("software_saas", "saas_subscription")).toBe(false);
    expect(isRegulatedByRule("unclassified", "unclassified")).toBe(false);
  });
});
