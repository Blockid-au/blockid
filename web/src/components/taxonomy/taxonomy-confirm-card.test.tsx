// Render tests for the founder taxonomy confirmation card (G13-W4-D2 E1.4).
// SSR markup only. Pins: the "We classified your startup as … Correct?"
// summary with confidence + Confirm / Edit; the DQ-1 "couldn't classify —
// pick one" state opens the 6-axis form with Not sure toggles and the
// tags list (protected tags labelled founder-declared, disabled for an
// evaluator); the confirmed state (date + never overwritten + "Suggestion
// differs" hint); and taxonomySummary().

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";
import { TaxonomyConfirmCard, taxonomySummary } from "./taxonomy-confirm-card";

const ROW: StartupTaxonomyRow = {
  project_id: "p-1",
  taxonomy_version: "1.0.0",
  industry: "fintech",
  sub_industry: "fintech",
  industry_secondary: null,
  business_model: "marketplace_platform",
  customer_types: ["b2b"],
  stage_key: "seed",
  hq_state: "NSW",
  hq_country: "AU",
  geo_scope: "national",
  tags: ["regulated"],
  anzsic_division: "K",
  anzsic_class: null,
  sources: { industry: "auto", business_model: "auto", stage_key: "auto", customer_types: "auto", tags: { regulated: "auto" } },
  confidence: { industry: 0.82, business_model: 0.55 },
  suggested: { industry: "fintech" },
  confirmed_by: null,
  confirmed_at: null,
  created_at: "2026-09-15T00:00:00Z",
  updated_at: "2026-09-15T00:00:00Z",
};

const html = (props: Partial<React.ComponentProps<typeof TaxonomyConfirmCard>> = {}) =>
  renderToStaticMarkup(<TaxonomyConfirmCard projectId="p-1" projectName="Acme" taxonomy={ROW} {...props} />);

describe("taxonomySummary", () => {
  it("joins the axes as 'Fintech · Marketplace / platform · Seed (Post-PMF) · B2B · NSW'", () => {
    expect(taxonomySummary(ROW)).toBe("Fintech · Marketplace / platform · Seed (Post-PMF) · B2B · NSW");
    expect(taxonomySummary({ ...ROW, industry: "unclassified", customer_types: [], hq_state: null })).toBe("Unclassified · Marketplace / platform · Seed (Post-PMF) · Unclassified");
    expect(taxonomySummary(null)).toBe("not classified yet");
  });
});

describe("TaxonomyConfirmCard", () => {
  it("unconfirmed auto row → summary with 'Correct?', confidence chips, Confirm + Edit", () => {
    const out = html();
    expect(out).toMatch(/data-testid="taxonomy-confirm-card"[^>]*data-confirmed="false"[^>]*data-mode="summary"/);
    expect(out).toContain("We classified your startup as <strong>Fintech · Marketplace / platform · Seed (Post-PMF) · B2B · NSW</strong>. Correct?");
    expect(out).toContain("(82 % sure)");
    expect(out).toContain('data-testid="taxonomy-confirm"');
    expect(out).toContain('data-testid="taxonomy-edit"');
    expect(out).toContain("Regulated");
    expect(out).not.toContain('data-testid="taxonomy-form"');
  });

  it("unclassified industry (DQ-1) → 'couldn't classify — pick one' and the form opens with Not sure toggles, tags and founder-declared labels", () => {
    const out = html({ taxonomy: { ...ROW, industry: "unclassified", sources: {} } });
    expect(out).toContain("We couldn&#x27;t classify your industry — pick one below.");
    expect(out).toContain('data-testid="taxonomy-form"');
    for (const axis of ["industry", "business_model", "stage_key", "geo_scope", "hq_state"]) {
      expect(out).toContain(`id="tax-${axis}"`);
      expect(out).toContain(`for="tax-${axis}"`);
    }
    for (const axis of ["industry", "business_model", "customer_types", "geo_scope", "hq_state"]) expect(out).toContain(`data-testid="taxonomy-notsure-${axis}"`);
    expect(out).not.toContain('data-testid="taxonomy-notsure-stage_key"'); // no honest unknown stage
    expect(out).toContain('id="tax-ct-b2b"');
    expect(out).toContain('id="tax-tag-female_founded"');
    expect(out).toContain("founder-declared");
    expect(out).toContain("Female founded and First Nations founded are founder-declared only");
    expect(out).toContain("Confirm classification");
    expect(out).toContain("Save without confirming");
    // the unclassified option is selectable and pre-selected
    expect(out).toMatch(/<option value="unclassified" selected/);
  });

  it("null taxonomy (pipeline has not run) → form with defaults, no Cancel", () => {
    const out = html({ taxonomy: null });
    expect(out).toContain('data-mode="edit"');
    expect(out).not.toContain(">Cancel<");
  });

  it("evaluator actor: protected tags are disabled and explained", () => {
    const out = html({ taxonomy: { ...ROW, industry: "unclassified" }, actor: "evaluator" });
    expect(out).toMatch(/id="tax-tag-female_founded"[^>]*disabled/);
    expect(out).toContain("can only be declared by the founder");
  });

  it("confirmed row → confirmed date, 'never overwrites', Edit only, and the Suggestion-differs hint", () => {
    const out = html({
      taxonomy: { ...ROW, confirmed_at: "2026-09-16T00:00:00Z", confirmed_by: "u-1", sources: { industry: "founder", business_model: "founder" }, suggested: { industry: "healthtech_medtech", business_model: "marketplace_platform" } },
    });
    expect(out).toContain('data-confirmed="true"');
    expect(out).toContain('data-testid="taxonomy-confirmed"');
    expect(out).toMatch(/Confirmed 16 Sept? 2026/);
    expect(out).toContain("automatic re-analysis never overwrites it");
    expect(out).toContain("Our latest analysis suggests a different industry");
    expect(out).not.toContain('data-testid="taxonomy-confirm"');
    expect(out).toContain('data-testid="taxonomy-edit"');
    expect(out).not.toContain("Correct?");
    expect(out).toContain("✓"); // human-sourced chips
  });
});
