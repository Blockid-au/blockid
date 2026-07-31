import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// plans-v2 — colocated tests for the previously-untested pure
// `src/lib/plans-v2.ts` — the 12-SKU pricing catalogue rendered by the
// Homepage v2 `<PricingMatrix />` (founder × 5, investor × 4, accelerator × 3).
// A silent drift in per-plan price, feature copy, `most_popular` flag, or the
// `founder_free` public-suppression filter would leak straight into the
// marketing / onboarding pricing surfaces, so this suite pins the tariff
// shape + segment routing + formatting + annual-saving math.
// ---------------------------------------------------------------------------

import {
  PLANS_V2,
  PUBLIC_HIDDEN_PLAN_IDS,
  plansForSegment,
  publicPlansForSegment,
  formatAud,
  annualSavingPct,
  type Plan,
  type Segment,
  type CtaKind,
} from "./plans-v2";

const SEGMENTS: readonly Segment[] = [
  "founder",
  "investor",
  "advisor",
  "accelerator",
];
const CTA_KINDS: readonly CtaKind[] = ["trial", "contact"];

// ---------------------------------------------------------------------------
// PLANS_V2 catalogue shape
// ---------------------------------------------------------------------------

describe("PLANS_V2 catalogue", () => {
  it("ships exactly 12 SKUs (5 founder + 4 investor + 3 accelerator)", () => {
    expect(PLANS_V2).toHaveLength(12);
    expect(PLANS_V2.filter((p) => p.segment === "founder")).toHaveLength(5);
    expect(PLANS_V2.filter((p) => p.segment === "investor")).toHaveLength(4);
    expect(PLANS_V2.filter((p) => p.segment === "accelerator")).toHaveLength(3);
  });

  it("has zero rows in the `advisor` segment (advisor tab reuses investor)", () => {
    expect(PLANS_V2.filter((p) => p.segment === "advisor")).toHaveLength(0);
  });

  it("every id is unique", () => {
    const ids = PLANS_V2.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every id is a non-empty snake_case string starting with its segment", () => {
    for (const p of PLANS_V2) {
      expect(p.id).toMatch(/^[a-z_]+$/);
      expect(p.id.startsWith(`${p.segment}_`)).toBe(true);
    }
  });

  it("every plan has a non-empty name + non-empty features array", () => {
    for (const p of PLANS_V2) {
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
      expect(Array.isArray(p.features)).toBe(true);
      expect(p.features.length).toBeGreaterThan(0);
      for (const feature of p.features) {
        expect(typeof feature).toBe("string");
        expect(feature.length).toBeGreaterThan(0);
      }
    }
  });

  it("every plan has a valid segment + cta_kind", () => {
    for (const p of PLANS_V2) {
      expect(SEGMENTS).toContain(p.segment);
      expect(CTA_KINDS).toContain(p.cta_kind);
    }
  });

  it("every plan has a non-negative integer trial_days", () => {
    for (const p of PLANS_V2) {
      expect(Number.isInteger(p.trial_days)).toBe(true);
      expect(p.trial_days).toBeGreaterThanOrEqual(0);
    }
  });

  it("null monthly_aud implies null annual_aud + cta_kind === 'contact' for the enterprise SKUs", () => {
    for (const p of PLANS_V2) {
      if (p.monthly_aud === null) {
        expect(p.annual_aud).toBeNull();
      }
    }
  });

  it("non-null prices are non-negative numbers", () => {
    for (const p of PLANS_V2) {
      if (p.monthly_aud !== null) expect(p.monthly_aud).toBeGreaterThanOrEqual(0);
      if (p.annual_aud !== null) expect(p.annual_aud).toBeGreaterThanOrEqual(0);
    }
  });

  it("annual price is never more expensive than 12x monthly (annual saves)", () => {
    for (const p of PLANS_V2) {
      if (p.monthly_aud !== null && p.annual_aud !== null && p.monthly_aud > 0) {
        expect(p.annual_aud).toBeLessThanOrEqual(p.monthly_aud * 12);
      }
    }
  });

  it("at most one `most_popular: true` plan per segment", () => {
    for (const segment of ["founder", "investor", "accelerator"] as const) {
      const highlighted = PLANS_V2.filter(
        (p) => p.segment === segment && p.most_popular === true,
      );
      expect(highlighted.length).toBeLessThanOrEqual(1);
    }
  });

  it("founder tier ladder (free < starter < growth < scale < enterprise) is present in canonical order", () => {
    const founderIds = PLANS_V2.filter((p) => p.segment === "founder").map(
      (p) => p.id,
    );
    expect(founderIds).toEqual([
      "founder_free",
      "founder_starter",
      "founder_growth",
      "founder_scale",
      "founder_enterprise",
    ]);
  });

  it("investor tier ladder (angel < advisor < vc_sm < vc_ent) is present in canonical order", () => {
    const investorIds = PLANS_V2.filter((p) => p.segment === "investor").map(
      (p) => p.id,
    );
    expect(investorIds).toEqual([
      "investor_angel",
      "investor_advisor",
      "investor_vc_sm",
      "investor_vc_ent",
    ]);
  });

  it("accelerator tier ladder (starter < growth < enterprise) is present in canonical order", () => {
    const acceleratorIds = PLANS_V2.filter(
      (p) => p.segment === "accelerator",
    ).map((p) => p.id);
    expect(acceleratorIds).toEqual([
      "accelerator_starter",
      "accelerator_growth",
      "accelerator_enterprise",
    ]);
  });

  it("founder_free is the only $0 SKU (per Round 5.11 'no indefinite free tier for new signups')", () => {
    const freeSkus = PLANS_V2.filter((p) => p.monthly_aud === 0);
    expect(freeSkus).toHaveLength(1);
    expect(freeSkus[0]!.id).toBe("founder_free");
  });

  it("founder pricing anchors (starter=A$29, growth=A$99, scale=A$299) are stable", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    expect(byId.get("founder_starter")!.monthly_aud).toBe(29);
    expect(byId.get("founder_growth")!.monthly_aud).toBe(99);
    expect(byId.get("founder_scale")!.monthly_aud).toBe(299);
  });

  it("investor pricing anchors (angel=A$79, advisor=A$149, vc_sm=A$349) are stable", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    expect(byId.get("investor_angel")!.monthly_aud).toBe(79);
    expect(byId.get("investor_advisor")!.monthly_aud).toBe(149);
    expect(byId.get("investor_vc_sm")!.monthly_aud).toBe(349);
  });

  it("accelerator pricing anchors (starter=A$500, growth=A$1500, enterprise=A$3500) are stable", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    expect(byId.get("accelerator_starter")!.monthly_aud).toBe(500);
    expect(byId.get("accelerator_growth")!.monthly_aud).toBe(1500);
    expect(byId.get("accelerator_enterprise")!.monthly_aud).toBe(3500);
  });

  it("`most_popular` in the raw catalogue points to founder_growth + investor_angel + accelerator_growth", () => {
    const highlighted = PLANS_V2.filter((p) => p.most_popular === true).map(
      (p) => p.id,
    );
    expect(highlighted.sort()).toEqual([
      "accelerator_growth",
      "founder_growth",
      "investor_angel",
    ]);
  });

  it("enterprise SKUs use cta_kind='contact' (custom pricing)", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    expect(byId.get("founder_enterprise")!.cta_kind).toBe("contact");
    expect(byId.get("investor_vc_ent")!.cta_kind).toBe("contact");
    expect(byId.get("accelerator_enterprise")!.cta_kind).toBe("contact");
  });

  it("every enterprise SKU has null monthly + null annual price", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    for (const id of [
      "founder_enterprise",
      "investor_vc_ent",
    ]) {
      expect(byId.get(id)!.monthly_aud).toBeNull();
      expect(byId.get(id)!.annual_aud).toBeNull();
    }
  });

  it("non-enterprise paid founder SKUs use trial_days=7", () => {
    const byId = new Map(PLANS_V2.map((p) => [p.id, p]));
    for (const id of ["founder_starter", "founder_growth", "founder_scale"]) {
      expect(byId.get(id)!.trial_days).toBe(7);
    }
  });

  it("founder_free trial_days = 0 (no trial on the free tier)", () => {
    const free = PLANS_V2.find((p) => p.id === "founder_free");
    expect(free!.trial_days).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// plansForSegment()
// ---------------------------------------------------------------------------

describe("plansForSegment()", () => {
  it("founder segment returns exactly the 5 founder SKUs including founder_free", () => {
    const founder = plansForSegment("founder");
    expect(founder).toHaveLength(5);
    expect(founder.map((p) => p.id)).toContain("founder_free");
    for (const p of founder) expect(p.segment).toBe("founder");
  });

  it("investor segment returns exactly the 4 investor SKUs", () => {
    const investor = plansForSegment("investor");
    expect(investor).toHaveLength(4);
    for (const p of investor) expect(p.segment).toBe("investor");
  });

  it("accelerator segment returns exactly the 3 accelerator SKUs", () => {
    const accelerator = plansForSegment("accelerator");
    expect(accelerator).toHaveLength(3);
    for (const p of accelerator) expect(p.segment).toBe("accelerator");
  });

  it("advisor segment reuses the investor catalogue (4 rows, all segment='investor')", () => {
    const advisor = plansForSegment("advisor");
    expect(advisor).toHaveLength(4);
    for (const p of advisor) expect(p.segment).toBe("investor");
  });

  it("advisor tab highlights investor_advisor and demotes the others", () => {
    const advisor = plansForSegment("advisor");
    const highlighted = advisor.filter((p) => p.most_popular === true);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.id).toBe("investor_advisor");
    // The default catalogue highlights investor_angel; the advisor remap
    // must have flipped it off.
    const angel = advisor.find((p) => p.id === "investor_angel");
    expect(angel!.most_popular).toBe(false);
  });

  it("advisor remap is non-mutating on the underlying investor catalogue", () => {
    // Second call after an advisor remap must still surface investor_angel
    // as the raw catalogue's most_popular highlight.
    plansForSegment("advisor");
    const investor = plansForSegment("investor");
    const angel = investor.find((p) => p.id === "investor_angel");
    expect(angel!.most_popular).toBe(true);
    const advisorRow = investor.find((p) => p.id === "investor_advisor");
    // The raw investor catalogue never highlighted the advisor SKU.
    expect(advisorRow!.most_popular).toBeFalsy();
  });

  it("advisor remap preserves every non-most_popular field on each plan", () => {
    const advisor = plansForSegment("advisor");
    const investor = plansForSegment("investor");
    const byId = new Map(investor.map((p) => [p.id, p]));
    for (const p of advisor) {
      const raw = byId.get(p.id)!;
      expect(p.id).toBe(raw.id);
      expect(p.name).toBe(raw.name);
      expect(p.monthly_aud).toBe(raw.monthly_aud);
      expect(p.annual_aud).toBe(raw.annual_aud);
      expect(p.trial_days).toBe(raw.trial_days);
      expect(p.features).toEqual(raw.features);
      expect(p.cta_kind).toBe(raw.cta_kind);
      expect(p.tagline).toBe(raw.tagline);
    }
  });
});

// ---------------------------------------------------------------------------
// PUBLIC_HIDDEN_PLAN_IDS + publicPlansForSegment()
// ---------------------------------------------------------------------------

describe("PUBLIC_HIDDEN_PLAN_IDS", () => {
  it("hides exactly `founder_free` (per 2026-07-24 'no indefinite free tier' directive)", () => {
    expect([...PUBLIC_HIDDEN_PLAN_IDS]).toEqual(["founder_free"]);
  });

  it("every hidden id resolves to a real plan in PLANS_V2", () => {
    const ids = new Set(PLANS_V2.map((p) => p.id));
    for (const id of PUBLIC_HIDDEN_PLAN_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe("publicPlansForSegment()", () => {
  it("strips founder_free from the founder segment (4 rows instead of 5)", () => {
    const founder = publicPlansForSegment("founder");
    expect(founder).toHaveLength(4);
    for (const p of founder) {
      expect(PUBLIC_HIDDEN_PLAN_IDS).not.toContain(p.id);
    }
  });

  it("investor segment is unchanged by the public filter (nothing hidden)", () => {
    const raw = plansForSegment("investor");
    const publicOnly = publicPlansForSegment("investor");
    expect(publicOnly).toHaveLength(raw.length);
    expect(publicOnly.map((p) => p.id)).toEqual(raw.map((p) => p.id));
  });

  it("accelerator segment is unchanged by the public filter", () => {
    const raw = plansForSegment("accelerator");
    const publicOnly = publicPlansForSegment("accelerator");
    expect(publicOnly).toHaveLength(raw.length);
  });

  it("advisor segment is unchanged by the public filter (founder_free never lived here)", () => {
    const raw = plansForSegment("advisor");
    const publicOnly = publicPlansForSegment("advisor");
    expect(publicOnly).toHaveLength(raw.length);
    expect(publicOnly.map((p) => p.id)).toEqual(raw.map((p) => p.id));
  });

  it("founder segment retains order (starter → growth → scale → enterprise)", () => {
    const founder = publicPlansForSegment("founder");
    expect(founder.map((p) => p.id)).toEqual([
      "founder_starter",
      "founder_growth",
      "founder_scale",
      "founder_enterprise",
    ]);
  });
});

// ---------------------------------------------------------------------------
// formatAud()
// ---------------------------------------------------------------------------

describe("formatAud()", () => {
  it("returns 'Custom' for null (contact-sales SKUs)", () => {
    expect(formatAud(null)).toBe("Custom");
  });

  it("returns 'A$0' exactly for 0 (free-tier short-circuit)", () => {
    expect(formatAud(0)).toBe("A$0");
  });

  it("formats a small integer without thousands separator", () => {
    expect(formatAud(29)).toBe("A$29");
    expect(formatAud(99)).toBe("A$99");
    expect(formatAud(299)).toBe("A$299");
  });

  it("formats a 4-digit integer with an en-AU comma separator", () => {
    expect(formatAud(1500)).toBe("A$1,500");
    expect(formatAud(3500)).toBe("A$3,500");
  });

  it("formats a 5+ digit integer with a comma separator", () => {
    expect(formatAud(15000)).toBe("A$15,000");
    expect(formatAud(35000)).toBe("A$35,000");
  });

  it("passes fractional amounts through toLocaleString (default fraction handling)", () => {
    // Sanity check: fractional values are allowed on the number type, and
    // formatAud does not attempt to floor them. Runtime formatting comes
    // from Number#toLocaleString which drops trailing zeros by default.
    expect(formatAud(99.5)).toMatch(/^A\$99\.5\d*$/);
  });
});

// ---------------------------------------------------------------------------
// annualSavingPct()
// ---------------------------------------------------------------------------

function fixture(overrides: Partial<Plan>): Plan {
  return {
    id: "test",
    segment: "founder",
    name: "Test",
    monthly_aud: 100,
    annual_aud: 1000,
    trial_days: 7,
    cta_kind: "trial",
    features: ["x"],
    ...overrides,
  };
}

describe("annualSavingPct()", () => {
  it("returns null when monthly_aud is null (custom SKU)", () => {
    expect(annualSavingPct(fixture({ monthly_aud: null, annual_aud: 1000 }))).toBeNull();
  });

  it("returns null when annual_aud is null (custom SKU)", () => {
    expect(annualSavingPct(fixture({ monthly_aud: 100, annual_aud: null }))).toBeNull();
  });

  it("returns null when both prices are null (enterprise SKU)", () => {
    expect(
      annualSavingPct(fixture({ monthly_aud: null, annual_aud: null })),
    ).toBeNull();
  });

  it("returns null when monthly_aud is 0 (free tier — no annual saving on a free plan)", () => {
    expect(annualSavingPct(fixture({ monthly_aud: 0, annual_aud: 0 }))).toBeNull();
  });

  it("returns 17% for the canonical 'annual saves ~17% vs 12x monthly' anchor (99×12=1188 vs 990)", () => {
    // (1188 - 990) / 1188 = 0.1666… → Math.round → 17
    expect(annualSavingPct(fixture({ monthly_aud: 99, annual_aud: 990 }))).toBe(17);
  });

  it("returns 17% for founder_starter's 29/290 pricing (same 12x−2×monthly rule)", () => {
    // (348 - 290) / 348 = 0.1666… → 17
    expect(annualSavingPct(fixture({ monthly_aud: 29, annual_aud: 290 }))).toBe(17);
  });

  it("returns 17% for accelerator_starter 500/5000 pricing", () => {
    // (6000 - 5000) / 6000 = 0.1666… → 17
    expect(annualSavingPct(fixture({ monthly_aud: 500, annual_aud: 5000 }))).toBe(17);
  });

  it("returns 0 when annual_aud === 12 × monthly (no discount)", () => {
    expect(annualSavingPct(fixture({ monthly_aud: 100, annual_aud: 1200 }))).toBe(0);
  });

  it("returns 100 when annual_aud is 0 with a positive monthly (100% off)", () => {
    expect(annualSavingPct(fixture({ monthly_aud: 100, annual_aud: 0 }))).toBe(100);
  });

  it("returns a negative percent when annual_aud exceeds 12 × monthly (upsell — never expected in catalogue)", () => {
    // Regression guard: math must not throw or clamp; if a future editor
    // accidentally inverts monthly ↔ annual on a plan row, this should
    // surface via the sign flip rather than being silently swallowed.
    expect(annualSavingPct(fixture({ monthly_aud: 100, annual_aud: 1500 }))).toBe(-25);
  });

  it("uses Math.round (banker's rounding NOT applied) — 0.5 rounds up", () => {
    // (100*12 - 1194)/1200 = 0.005 → Math.round(0.5) → 1
    expect(annualSavingPct(fixture({ monthly_aud: 100, annual_aud: 1194 }))).toBe(1);
  });

  it("every real catalogue plan with a numeric price yields a non-null, non-negative percent (or null)", () => {
    for (const p of PLANS_V2) {
      const pct = annualSavingPct(p);
      if (pct !== null) {
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("catalogue-wide invariant: annualSavingPct is null iff monthly_aud is null OR 0 OR annual_aud is null", () => {
    for (const p of PLANS_V2) {
      const pct = annualSavingPct(p);
      const shouldBeNull =
        p.monthly_aud === null || p.annual_aud === null || p.monthly_aud === 0;
      expect(pct === null).toBe(shouldBeNull);
    }
  });
});
