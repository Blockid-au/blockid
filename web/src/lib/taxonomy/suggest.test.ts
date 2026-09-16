import { describe, expect, it } from "vitest";

import { PROTECTED_TAGS, isBusinessModel, isIndustry, isStageKey, isSuggestableTag } from "./startup-taxonomy";
import { AUTO_FILL_MIN_CONFIDENCE, suggestInputFromAnalysis, suggestTaxonomy } from "./suggest";

const NOW = new Date("2026-09-16T00:00:00Z");

describe("suggestTaxonomy — shape and determinism", () => {
  it("returns a fully-populated, canonical suggestion for empty / junk input (never throws)", () => {
    for (const input of [undefined, null, {}, { description: "" }, { rawText: null, stage: "??" }, "x" as unknown as object]) {
      const s = suggestTaxonomy(input as never, NOW);
      expect(s.taxonomy_version).toBe("1.0.0");
      expect(s.industry).toBe("unclassified");
      expect(s.business_model).toBe("unclassified");
      expect(s.customer_types).toEqual([]);
      expect(s.stage_key).toBe("idea");
      expect(s.hq_state).toBeNull();
      expect(s.geo_scope).toBeNull();
      expect(s.tags).toEqual([]);
      expect(s.confidence.industry).toBe(0);
      expect(s.sources).toEqual({});
      expect(s.suggested_at).toBe(NOW.toISOString());
    }
  });

  it("is deterministic and tolerates very long text", () => {
    const input = { description: "B2B SaaS for accountants ".repeat(5000) };
    const a = suggestTaxonomy(input, NOW);
    const b = suggestTaxonomy(input, NOW);
    expect(a).toEqual(b);
    expect(a.industry).toBe("software_saas");
  });
});

describe("suggestTaxonomy — industry (DQ-1: ≥ 0.5 or unclassified)", () => {
  it("classifies a clear fintech pitch with a detectSector slug, sub_industry kept, regulated tag set", () => {
    const s = suggestTaxonomy({
      name: "PayFlow",
      description: "PayFlow is a payments platform for Australian SMEs. We hold an AFSL and process card payments with a transaction fee per payment.",
      sector: "fintech",
      stage: 3,
      state: "NSW",
    }, NOW);
    expect(s.industry).toBe("fintech");
    expect(s.sub_industry).toBe("fintech");
    expect(s.business_model).toBe("transactional_fintech");
    expect(s.customer_types[0]).toBe("b2b");
    expect(s.stage_key).toBe("seed");
    expect(s.hq_state).toBe("NSW");
    expect(s.tags).toContain("regulated");
    expect(s.confidence.industry).toBeGreaterThanOrEqual(AUTO_FILL_MIN_CONFIDENCE);
    expect(s.sources.industry).toBe("auto");
    expect(s.sources.business_model).toBe("auto");
    expect(s.sources.stage_key).toBe("auto");
    expect(s.sources.hq_state).toBe("auto");
    expect(s.sources.tags).toEqual({ regulated: "auto" });
  });

  it("uses the §B.2 NEW regexes for ai_ml / defence_dualuse / mining_resources_tech (no detectSector slug exists)", () => {
    expect(suggestTaxonomy({ description: "We build LLM copilots using machine learning and generative AI for legal teams." }, NOW).industry).toBe("ai_ml");
    const d = suggestTaxonomy({ description: "Sovereign capability: dual-use counter-drone systems for the ADF and defence primes." }, NOW);
    expect(d.industry).toBe("defence_dualuse");
    expect(d.tags).toEqual(expect.arrayContaining(["defence_dualuse", "regulated"]));
    expect(suggestTaxonomy({ description: "METS software for mining exploration drilling data at iron ore mine sites." }, NOW).industry).toBe("mining_resources_tech");
  });

  it("intake industry tags (INDUSTRY_OPTIONS) are the strongest signal and map through the crosswalk", () => {
    const s = suggestTaxonomy({ industryTags: ["cleantech_renewables", "climate"], description: "Widgets." }, NOW);
    expect(s.industry).toBe("climate_cleantech");
    expect(s.tags).toContain("climate_impact");
    expect(s.confidence.industry).toBeGreaterThanOrEqual(0.9);
  });

  it("a free-text projects.industry that is a legacy key fills; a vague one alone does not reach the floor", () => {
    expect(suggestTaxonomy({ industry: "Healthtech" }, NOW).industry).toBe("healthtech_medtech");
    const vague = suggestTaxonomy({ description: "We help people do things better." }, NOW);
    expect(vague.industry).toBe("unclassified");
    expect(vague.confidence.industry).toBeLessThan(AUTO_FILL_MIN_CONFIDENCE);
    expect(vague.evidence.join(" ")).toMatch(/unclassified/);
  });

  it("a single stray keyword stays unclassified but records the best guess and its confidence", () => {
    const s = suggestTaxonomy({ description: "Our team once worked at a hospital." }, NOW);
    expect(s.industry).toBe("unclassified");
    expect(s.confidence.industry).toBeGreaterThan(0);
    expect(s.confidence.industry).toBeLessThan(AUTO_FILL_MIN_CONFIDENCE);
  });

  it("industry_secondary is set only when a second industry is independently confident", () => {
    const s = suggestTaxonomy({
      industryTags: ["fintech", "proptech"],
      description: "Fintech lending for property investors — mortgage payments, rental yield, landlords and tenants.",
    }, NOW);
    expect(s.industry).toBe("fintech");
    expect(s.industry_secondary).toBe("proptech_construction");
    expect(s.sources.industry_secondary).toBe("auto");
  });

  it("always emits canonical enum values", () => {
    const samples = [
      "Marketplace connecting tradies with homeowners in Brisbane",
      "Quantum photonics spin-out from UNSW with two patents",
      "Shopify D2C skincare brand shipping nationally",
      "Mobile app for parents, 50k downloads on the App Store",
      "Consulting agency billing day rates to corporate clients",
      "Clinical-stage biotech, phase 2 trial, TGA pathway",
    ];
    for (const description of samples) {
      const s = suggestTaxonomy({ description }, NOW);
      expect(isIndustry(s.industry)).toBe(true);
      expect(isBusinessModel(s.business_model)).toBe(true);
      expect(isStageKey(s.stage_key)).toBe(true);
      for (const t of s.tags) expect(isSuggestableTag(t)).toBe(true);
    }
  });
});

describe("suggestTaxonomy — business model", () => {
  it("marketplace sector slug → marketplace_platform even when the industry is unclassified", () => {
    const s = suggestTaxonomy({ sector: "marketplace", description: "A two-sided marketplace with a 12% take rate." }, NOW);
    expect(s.industry).toBe("unclassified");
    expect(s.business_model).toBe("marketplace_platform");
    expect(s.sub_industry).toBeNull();
  });

  it("falls back to the industry prior at exactly the DQ-1 floor when no model keywords exist", () => {
    const s = suggestTaxonomy({ industryTags: ["biotech_pharma"] }, NOW);
    expect(s.business_model).toBe("biotech_regulated_pipeline");
    expect(s.confidence.business_model).toBe(AUTO_FILL_MIN_CONFIDENCE);
    expect(s.tags).toContain("regulated");
  });

  it("recognises hardware / agency / consumer app / ecommerce / deeptech licensing", () => {
    expect(suggestTaxonomy({ description: "We manufacture our device with a BOM under $40; firmware and sensors in-house." }, NOW).business_model).toBe("hardware_devices");
    expect(suggestTaxonomy({ description: "A design agency billing day rates on a retainer." }, NOW).business_model).toBe("agency_consultancy");
    expect(suggestTaxonomy({ description: "Consumer app with 20k DAU and in-app purchases on Google Play." }, NOW).business_model).toBe("consumer_app");
    expect(suggestTaxonomy({ description: "Direct-to-consumer online store on Shopify with 120 SKUs." }, NOW).business_model).toBe("ecommerce_d2c");
    expect(suggestTaxonomy({ description: "Patented novel material; IP licensing deals with manufacturers; TRL 4." }, NOW).business_model).toBe("deeptech_ip_licensing");
  });
});

describe("suggestTaxonomy — customer types, stage, geography", () => {
  it("customer types are multi-select, primary first", () => {
    const s = suggestTaxonomy({ description: "We sell to SMEs and enterprises; businesses pay per seat. Some consumers also use the free tier." }, NOW);
    expect(s.customer_types[0]).toBe("b2b");
    expect(s.customer_types.length).toBeLessThanOrEqual(3);
    expect(s.sources.customer_types).toBe("auto");
  });

  it("b2g from government / council language", () => {
    expect(suggestTaxonomy({ description: "GovTech platform sold to councils and state government agencies via tenders." }, NOW).customer_types[0]).toBe("b2g");
  });

  it("stage: numeric SVI stage is trusted (0.9), legacy strings map (0.7), unknown stays idea with 0 confidence and no source", () => {
    expect(suggestTaxonomy({ stage: 4 }, NOW)).toMatchObject({ stage_key: "series_a", confidence: { stage_key: 0.9 }, sources: { stage_key: "auto" } });
    expect(suggestTaxonomy({ stage: "early_revenue" }, NOW)).toMatchObject({ stage_key: "mvp_early_revenue", confidence: { stage_key: 0.7 } });
    const none = suggestTaxonomy({ stage: "???" }, NOW);
    expect(none.stage_key).toBe("idea");
    expect(none.confidence.stage_key).toBe(0);
    expect(none.sources.stage_key).toBeUndefined();
  });

  it("hq_state: explicit state wins; otherwise the dominant city / state mention; ties → null", () => {
    expect(suggestTaxonomy({ state: "vic" }, NOW).hq_state).toBe("VIC");
    expect(suggestTaxonomy({ state: "national" }, NOW).hq_state).toBe("national");
    expect(suggestTaxonomy({ state: "XX", description: "Based in Perth, Western Australia." }, NOW).hq_state).toBe("WA");
    const tie = suggestTaxonomy({ description: "Offices in Sydney and Melbourne." }, NOW);
    expect(tie.hq_state).toBeNull();
    expect(tie.confidence.hq_state).toBeLessThan(AUTO_FILL_MIN_CONFIDENCE);
  });

  it("geo_scope: widest explicit scope wins", () => {
    expect(suggestTaxonomy({ description: "Local pilot in Geelong, expanding globally next year." }, NOW).geo_scope).toBe("global");
    expect(suggestTaxonomy({ description: "Serving customers Australia-wide." }, NOW).geo_scope).toBe("national");
    expect(suggestTaxonomy({ description: "Trans-Tasman rollout with New Zealand partners." }, NOW).geo_scope).toBe("anz");
    expect(suggestTaxonomy({ description: "Nothing about places here." }, NOW).geo_scope).toBeNull();
  });
});

describe("suggestTaxonomy — tags (DQ-4: protected tags never emitted)", () => {
  it("never emits female_founded / first_nations even when the text says so", () => {
    const s = suggestTaxonomy({
      description: "Female-founded, women-led, Indigenous-owned First Nations social enterprise; female founder and CEO.",
      industryTags: ["social_enterprise"],
    }, NOW);
    for (const p of PROTECTED_TAGS) {
      expect(s.tags).not.toContain(p);
      expect(s.sources.tags?.[p]).toBeUndefined();
    }
    expect(s.tags).toContain("impact_social_enterprise");
  });

  it("detects rdti / spinout / CSIRO ON / accelerator alumni / climate impact; never esic_eligible from text", () => {
    const s = suggestTaxonomy({
      description: "UNSW spin-out, CSIRO ON Accelerate alumni and Startmate 2025; we claim the R&D Tax Incentive and are ESIC eligible; net-zero mission.",
    }, NOW);
    expect(s.tags).toEqual(expect.arrayContaining(["university_spinout", "csiro_on_alumni", "accelerator_alumni", "rdti_claimant", "climate_impact"]));
    expect(s.tags).not.toContain("esic_eligible");
    expect(s.sources.tags?.rdti_claimant).toBe("auto");
  });

  it("intake tags defence_dualuse / climate / social_enterprise become tags", () => {
    const s = suggestTaxonomy({ industryTags: ["defence_dualuse", "social_enterprise"] }, NOW);
    expect(s.tags).toEqual(expect.arrayContaining(["defence_dualuse", "impact_social_enterprise", "regulated"]));
  });
});

describe("suggestInputFromAnalysis", () => {
  it("pulls sector / stage / rawText off an SVIAnalysis-shaped object and keeps extras", () => {
    const input = suggestInputFromAnalysis({ sector: "saas", stage: 2, rawText: "raw" }, { name: "Acme", description: "d", state: "QLD" });
    expect(input).toEqual({ name: "Acme", description: "d", state: "QLD", sector: "saas", stage: 2, rawText: "raw" });
    expect(suggestInputFromAnalysis(null, { stage: "seed" })).toMatchObject({ sector: null, stage: "seed", rawText: null });
  });
});
