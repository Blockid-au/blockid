// Colocated vitest for FIT_WEIGHTS_V2 (G13-W3-T2, BA spec §B.8). Pins the
// weight table (sum 100, floor 40), every axis rule with the §B.8 worked
// numbers (industry 25 / secondary 12 / stage adjacent 10 / geo same-country
// 5 / cheque unknown 5 / tags pro-rata / floors), the hard gates
// (sectors_exclude, tags_exclude, min_svi, verified revenue / growth), the
// DQ-3 "unclassified never scores full" rule, the per-mandate weights
// override validation, both ranking directions and the legacy fallback.

import { describe, expect, it } from "vitest";
import {
  FIT_AXES_V2,
  FIT_FLOOR_V2,
  FIT_WEIGHTS_V2,
  emptyFitMandate,
  fitStartupFromLegacy,
  rankMandatesForStartup,
  rankStartupsForMandate,
  resolveWeights,
  scoreFit,
  validateWeights,
  type FitStartup,
} from "./fit-v2";

const PAYFLOW: FitStartup = {
  project_id: "p-payflow",
  taxonomy: {
    industry: "fintech",
    industry_secondary: "software_saas",
    business_model: "transactional_fintech",
    customer_types: ["b2b"],
    stage_key: "seed",
    hq_state: "NSW",
    hq_country: "AU",
    geo_scope: "national",
    tags: ["esic_eligible", "rdti_claimant"],
  },
  svi: 62,
  revenue_aud: 250_000,
  growth_pct: 30,
  raise_aud: 1_500_000,
};

const SEED_FINTECH = emptyFitMandate({
  id: "m-1",
  sectors_include: ["fintech"],
  business_models: ["transactional_fintech", "saas_subscription"],
  customer_types: ["b2b"],
  stages: ["seed"],
  cheque_min_aud: 250_000,
  cheque_max_aud: 2_000_000,
  lead_or_follow: "lead",
  geographies: ["NSW", "VIC"],
  min_svi: 50,
  tags_include: ["esic_eligible"],
});

const pointsOf = (r: ReturnType<typeof scoreFit>, axis: (typeof FIT_AXES_V2)[number]) => r.breakdown.find((b) => b.axis === axis)!.points;

describe("FIT_WEIGHTS_V2 table", () => {
  it("is industry 25 / business_model 15 / stage 20 / geo 10 / cheque 10 / tags 10 / floors 10 — sum 100, floor 40", () => {
    expect(FIT_WEIGHTS_V2).toEqual({ industry: 25, business_model: 15, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 });
    expect(FIT_AXES_V2.reduce((a, k) => a + FIT_WEIGHTS_V2[k], 0)).toBe(100);
    expect(FIT_FLOOR_V2).toBe(40);
  });
});

describe("scoreFit — §B.8 worked examples", () => {
  it("worked example 1: a seed fintech mandate against PayFlow scores 100 with a reason per axis and no gaps", () => {
    const r = scoreFit(SEED_FINTECH, PAYFLOW);
    expect(r.score).toBe(100);
    expect(r.blockers).toEqual([]);
    expect(r.gaps).toEqual([]);
    expect(r.passes_floor).toBe(true);
    expect(r.weights_overridden).toBe(false);
    expect(r.breakdown.map((b) => [b.axis, b.points])).toEqual([
      ["industry", 25],
      ["business_model", 15],
      ["stage", 20],
      ["geo", 10],
      ["cheque", 10],
      ["tags", 10],
      ["floors", 10],
    ]);
    expect(r.reasons).toContain("Invests in fintech");
    expect(r.reasons).toContain("SVI 62 clears their 50 floor");
  });

  it("worked example 2: only industry_secondary matches → 12 of 25 (score 87)", () => {
    const m = emptyFitMandate({ ...SEED_FINTECH, sectors_include: ["software_saas"] });
    const r = scoreFit(m, PAYFLOW);
    expect(pointsOf(r, "industry")).toBe(12);
    expect(r.score).toBe(87);
    expect(r.gaps).toContain("Primary sector fintech outside their focus");
  });

  it("worked example 3: adjacent stage → 10 of 20 (series_a mandate vs a seed startup → 90)", () => {
    const m = emptyFitMandate({ ...SEED_FINTECH, stages: ["series_a"] });
    const r = scoreFit(m, PAYFLOW);
    expect(pointsOf(r, "stage")).toBe(10);
    expect(r.score).toBe(90);
    // two steps away → 0
    expect(pointsOf(scoreFit(emptyFitMandate({ ...SEED_FINTECH, stages: ["series_b_c"] }), PAYFLOW), "stage")).toBe(0);
  });

  it("worked example 4: same country only → geo 5 of 10; an unknown ask → cheque 5 of 10", () => {
    const geo = scoreFit(emptyFitMandate({ ...SEED_FINTECH, geographies: ["VIC"] }), { ...PAYFLOW, taxonomy: { ...PAYFLOW.taxonomy!, geo_scope: "local" } });
    expect(pointsOf(geo, "geo")).toBe(5);
    expect(geo.score).toBe(95);
    const ask = scoreFit(SEED_FINTECH, { ...PAYFLOW, raise_aud: null });
    expect(pointsOf(ask, "cheque")).toBe(5);
    expect(ask.gaps).toContain("Raise amount not stated");
  });

  it("worked example 5: tags pro-rata — 1 of 2 requested → 5 of 10", () => {
    const r = scoreFit(emptyFitMandate({ ...SEED_FINTECH, tags_include: ["esic_eligible", "female_founded"] }), PAYFLOW);
    expect(pointsOf(r, "tags")).toBe(5);
    expect(r.gaps).toContain("Missing female founded");
  });

  it("worked example 6: revenue floor with unverified data → floors 5 + 'revenue not verified'; verified below → hard gate", () => {
    const unknown = scoreFit(emptyFitMandate({ ...SEED_FINTECH, revenue_min_aud: 100_000 }), { ...PAYFLOW, revenue_aud: null });
    expect(pointsOf(unknown, "floors")).toBe(5);
    expect(unknown.gaps.join(" ")).toContain("revenue not verified");
    expect(unknown.blockers).toEqual([]);
    const below = scoreFit(emptyFitMandate({ ...SEED_FINTECH, revenue_min_aud: 1_000_000 }), PAYFLOW);
    expect(below.blockers).toEqual(["revenue_floor"]);
    expect(below.score).toBe(0);
  });
});

describe("hard gates", () => {
  it("sectors_exclude zeroes the score and names the blocker (row still returned)", () => {
    const r = scoreFit(emptyFitMandate({ sectors_exclude: ["fintech"] }), PAYFLOW);
    expect(r.score).toBe(0);
    expect(r.blockers).toEqual(["industry_excluded"]);
    expect(r.passes_floor).toBe(false);
    expect(r.breakdown.find((b) => b.axis === "industry")!.points).toBe(0);
    // the other axes are still described so the UI can explain the gate
    expect(r.breakdown.find((b) => b.axis === "stage")!.points).toBe(20);
  });

  it("tags_exclude hit → 0", () => {
    const r = scoreFit(emptyFitMandate({ tags_exclude: ["rdti_claimant"] }), PAYFLOW);
    expect(r.score).toBe(0);
    expect(r.blockers).toEqual(["tag_excluded"]);
  });

  it("min_svi: below the floor or not scored → svi_floor gate", () => {
    expect(scoreFit(emptyFitMandate({ min_svi: 70 }), PAYFLOW).blockers).toEqual(["svi_floor"]);
    const unscored = scoreFit(emptyFitMandate({ min_svi: 50 }), { ...PAYFLOW, svi: null });
    expect(unscored.blockers).toEqual(["svi_floor"]);
    expect(unscored.gaps).toContain("SVI not scored (floor 50)");
    expect(scoreFit(emptyFitMandate({ min_svi: 62 }), PAYFLOW).blockers).toEqual([]);
  });

  it("growth floor: verified below → gate; unknown → 5 + 'growth not verified'", () => {
    expect(scoreFit(emptyFitMandate({ growth_min_pct: 50 }), PAYFLOW).blockers).toEqual(["growth_floor"]);
    const r = scoreFit(emptyFitMandate({ growth_min_pct: 50 }), { ...PAYFLOW, growth_pct: null });
    expect(pointsOf(r, "floors")).toBe(5);
    expect(r.gaps.join(" ")).toContain("growth not verified");
  });
});

describe("DQ-3 — unclassified never scores full", () => {
  const UNCLASSIFIED: FitStartup = {
    ...PAYFLOW,
    taxonomy: { ...PAYFLOW.taxonomy!, industry: "unclassified", industry_secondary: null, business_model: "unclassified" },
  };

  it("sector-agnostic mandate: industry 12 of 25 + the founder-confirmation gap; business model 8 of 15", () => {
    const r = scoreFit(emptyFitMandate(), UNCLASSIFIED);
    expect(pointsOf(r, "industry")).toBe(12);
    expect(pointsOf(r, "business_model")).toBe(8); // round(0.5 × 15)
    expect(r.gaps).toContain("industry unclassified — founder confirmation pending");
    expect(r.gaps).toContain("business model unclassified — founder confirmation pending");
    expect(r.score).toBeLessThan(100);
  });

  it("focused mandate: industry 0, never excluded (no blocker)", () => {
    const r = scoreFit(SEED_FINTECH, UNCLASSIFIED);
    expect(pointsOf(r, "industry")).toBe(0);
    expect(r.blockers).toEqual([]);
  });

  it("no taxonomy row at all behaves as unclassified with the legacy state / stage fallbacks", () => {
    const r = scoreFit(emptyFitMandate({ stages: ["seed"], geographies: ["NSW"] }), { project_id: "p", taxonomy: null, svi: 50, stage_key: "seed", state: "nsw" });
    expect(pointsOf(r, "stage")).toBe(20);
    expect(pointsOf(r, "geo")).toBe(10);
    expect(pointsOf(r, "industry")).toBe(12);
  });
});

describe("axis details", () => {
  it("geo: national / anz / apac / global on either side covers every AU state; a non-AU startup scores 0", () => {
    expect(pointsOf(scoreFit(emptyFitMandate({ geographies: ["anz"] }), PAYFLOW), "geo")).toBe(10);
    expect(pointsOf(scoreFit(emptyFitMandate({ geographies: ["VIC"] }), PAYFLOW), "geo")).toBe(10); // PayFlow geo_scope national
    const nz = { ...PAYFLOW, taxonomy: { ...PAYFLOW.taxonomy!, hq_state: null, hq_country: "NZ", geo_scope: "local" } };
    expect(pointsOf(scoreFit(emptyFitMandate({ geographies: ["VIC"] }), nz), "geo")).toBe(0);
  });

  it("cheque: lead needs the ask inside [min,max]; follow accepts ≤ 3× max; both = either", () => {
    const big = { ...PAYFLOW, raise_aud: 5_000_000 };
    expect(pointsOf(scoreFit(emptyFitMandate({ cheque_min_aud: 250_000, cheque_max_aud: 2_000_000, lead_or_follow: "lead" }), big), "cheque")).toBe(0);
    expect(pointsOf(scoreFit(emptyFitMandate({ cheque_min_aud: 250_000, cheque_max_aud: 2_000_000, lead_or_follow: "follow" }), big), "cheque")).toBe(10);
    expect(pointsOf(scoreFit(emptyFitMandate({ cheque_min_aud: 250_000, cheque_max_aud: 2_000_000, lead_or_follow: "both" }), big), "cheque")).toBe(10);
    expect(pointsOf(scoreFit(emptyFitMandate({ cheque_min_aud: 250_000, cheque_max_aud: 1_000_000, lead_or_follow: "follow" }), big), "cheque")).toBe(0);
    expect(pointsOf(scoreFit(emptyFitMandate(), big), "cheque")).toBe(10);
  });

  it("business model: customer-type mismatch halves the axis and adds a gap", () => {
    const r = scoreFit(emptyFitMandate({ business_models: ["transactional_fintech"], customer_types: ["b2c"] }), PAYFLOW);
    expect(pointsOf(r, "business_model")).toBe(8);
    expect(r.gaps.join(" ")).toContain("Customer type b2b outside b2c");
  });

  it("stage: an unknown stage_key scores 0 with a gap; 'Any stage' when the mandate lists none", () => {
    const r = scoreFit(emptyFitMandate({ stages: ["seed"] }), { ...PAYFLOW, taxonomy: { ...PAYFLOW.taxonomy!, stage_key: "bogus" } });
    expect(pointsOf(r, "stage")).toBe(0);
    expect(scoreFit(emptyFitMandate(), PAYFLOW).reasons).toContain("Any stage");
  });
});

describe("weights override (§B.7 section 7)", () => {
  it("null / {} = defaults, not overridden", () => {
    expect(validateWeights(null)).toEqual({ ok: true, weights: FIT_WEIGHTS_V2, overridden: false });
    expect(validateWeights({})).toEqual({ ok: true, weights: FIT_WEIGHTS_V2, overridden: false });
  });

  it("a full override must sum to 100; partial overrides inherit the defaults for the rest", () => {
    expect(validateWeights({ industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 })).toMatchObject({ ok: true, overridden: true });
    expect(validateWeights({ industry: 30 })).toMatchObject({ ok: false, error: "weights must sum to 100 (got 105)" });
    expect(validateWeights({ industry: 30, business_model: 10 })).toMatchObject({ ok: true, overridden: true, weights: { industry: 30, business_model: 10 } });
  });

  it("rejects unknown axes, non-integers, negatives, > 100 and non-objects", () => {
    expect(validateWeights({ sector: 25 })).toMatchObject({ ok: false, error: "unknown axis: sector" });
    expect(validateWeights({ industry: 25.5 })).toMatchObject({ ok: false });
    expect(validateWeights({ industry: -1 })).toMatchObject({ ok: false });
    expect(validateWeights({ industry: 101 })).toMatchObject({ ok: false });
    expect(validateWeights([25])).toMatchObject({ ok: false });
    expect(validateWeights("x")).toMatchObject({ ok: false });
  });

  it("scoreFit applies a valid override and falls back to the defaults on an invalid one", () => {
    const heavy = emptyFitMandate({ ...SEED_FINTECH, sectors_include: ["software_saas"], weights: { industry: 50, business_model: 10, stage: 10, geo: 10, cheque: 10, tags: 5, floors: 5 } });
    const r = scoreFit(heavy, PAYFLOW);
    expect(r.weights_overridden).toBe(true);
    expect(pointsOf(r, "industry")).toBe(24); // round(0.48 × 50)
    expect(r.breakdown.find((b) => b.axis === "industry")!.weight).toBe(50);
    const bad = scoreFit(emptyFitMandate({ ...SEED_FINTECH, weights: { industry: 99 } }), PAYFLOW);
    expect(bad.weights_overridden).toBe(false);
    expect(bad.score).toBe(100);
    expect(resolveWeights({ industry: 99 })).toEqual(FIT_WEIGHTS_V2);
  });
});

describe("both directions", () => {
  const CLIMATE = emptyFitMandate({ id: "m-climate", sectors_include: ["climate_cleantech"], stages: ["seed", "series_a"] });
  const GENERALIST = emptyFitMandate({ id: "m-any" });
  const ANTI = emptyFitMandate({ id: "m-anti", sectors_exclude: ["fintech"] });
  const SOLAR: FitStartup = { ...PAYFLOW, project_id: "p-solar", taxonomy: { ...PAYFLOW.taxonomy!, industry: "climate_cleantech", industry_secondary: null, business_model: "hardware_devices", tags: [] } };

  it("rankStartupsForMandate: best first, floor applied, ties broken by project id", () => {
    const ranked = rankStartupsForMandate(CLIMATE, [PAYFLOW, SOLAR]);
    expect(ranked.map((r) => r.item.project_id)).toEqual(["p-solar", "p-payflow"]);
    expect(ranked[0].fit.score).toBe(100);
    // PayFlow vs the climate mandate: industry 0 (fintech not listed, not excluded), every other axis open → 75
    expect(ranked[1].fit.score).toBe(75);
    expect(ranked[1].fit.breakdown.map((b) => b.points)).toEqual([0, 15, 20, 10, 10, 10, 10]);
  });

  it("rankMandatesForStartup: the anti-fintech mandate is gated out, generalist and climate ordered by score", () => {
    const ranked = rankMandatesForStartup(PAYFLOW, [ANTI, CLIMATE, GENERALIST]);
    expect(ranked.map((r) => r.item.id)).toEqual(["m-any", "m-climate"]);
    expect(ranked[0].fit.score).toBe(100);
    expect(ranked.find((r) => r.item.id === "m-anti")).toBeUndefined();
  });

  it("limit + floor options", () => {
    expect(rankMandatesForStartup(PAYFLOW, [ANTI, CLIMATE, GENERALIST], { limit: 1 }).map((r) => r.item.id)).toEqual(["m-any"]);
    expect(rankMandatesForStartup(PAYFLOW, [ANTI, CLIMATE, GENERALIST], { floor: 0 }).map((r) => r.item.id)).toEqual(["m-any", "m-climate", "m-anti"]);
  });
});

describe("fitStartupFromLegacy", () => {
  it("crosswalks free-text industry, numeric stage and AU state; everything else unclassified / unknown", () => {
    const s = fitStartupFromLegacy({ id: "p", industry: "AgTech / Food", stage: 3, state: "vic", svi: 55 });
    expect(s.taxonomy).toMatchObject({ industry: "agtech_food", stage_key: "seed", hq_state: "VIC", business_model: "unclassified", hq_country: "AU" });
    expect(s.raise_aud).toBeNull();
    expect(fitStartupFromLegacy({ id: null, industry: null, stage: null, state: "national", svi: null }).taxonomy).toMatchObject({ industry: "unclassified", hq_state: "national", stage_key: "idea" });
  });
});
