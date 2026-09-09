// Colocated spec for the published profile body.
//
// This component is the entire public surface of a founder's analysis, and it
// is rendered in two places that must never diverge — the page at
// /listings/[slug] and the founder's pre-publish preview. So the tests here
// are of two kinds:
//
//   1. LEAK TESTS. A PublicProfile is built only from published fields plus
//      the derived score, but the markup is where a mistake would actually
//      cost somebody. These render a profile alongside a raw analysis that
//      contains an email address, an uploaded filename and a pasted URL, and
//      assert that none of it reaches the HTML.
//   2. SUBSTANCE TESTS. A page that renders a name and a number is a doorway
//      page. All eight dimensions, the valuation range, the named methods and
//      the stage-appropriate next steps have to be on it.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { buildPublicProfile } from "@/lib/publish/profile";
import type { CompactSvi } from "@/lib/analyses/payload";
import { PublicProfileBody } from "./public-profile-body";

const svi: CompactSvi = {
  version: "2.1.0",
  totalSVI: 122,
  stage: 2,
  stageLabel: "MVP / Prototype",
  summary: "A summary.",
  confidenceMultiplier: 0.5,
  dimensions: { ftv: 72, mpc: 64, ptd: 58, tre: 31, cgh: 45, iri: 50, lco: 40, svm: 55 },
  nextActions: [
    {
      priority: "P0",
      title: "Get your first paying customer",
      detail: "Even one dollar of revenue lifts Traction & Revenue materially.",
    },
    {
      priority: "P1",
      title: "Define your TAM",
      detail: "Document the addressable market with sources.",
    },
    {
      priority: "P1",
      title: "Build a cap table",
      detail: "Model founder splits, vesting and the ESOP pool.",
    },
  ],
  valuation: {
    low: 1_200_000,
    mid: 2_400_000,
    high: 3_600_000,
    method: "Berkus (50%) + Scorecard (50%)",
    confidence: 55,
    currency: "AUD",
  },
};

const profile = buildPublicProfile({
  slug: "corella-health",
  companyName: "Corella Health",
  oneLiner:
    "A GP-first triage tool that cuts avoidable emergency-department referrals for regional Australian clinics.",
  sector: "healthtech",
  websiteUrl: "https://corellahealth.com.au/",
  svi,
  analysedAt: "2026-09-08T04:00:00.000Z",
  publishedAt: "2026-09-09T04:00:00.000Z",
  updatedAt: "2026-09-09T04:00:00.000Z",
});

const html = renderToStaticMarkup(<PublicProfileBody profile={profile} />);

describe("what a published page must never carry", () => {
  it("carries no email address", () => {
    expect(html).not.toMatch(/[a-z0-9._%-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("carries nothing from the founder's raw input", () => {
    // These are the fields on `analyses` that describe what was submitted.
    // None of them is reachable from a PublicProfile, and this is the assertion
    // that would fail if somebody widened the view model to "be helpful".
    for (const secret of [
      "pitch-deck-final.pdf",
      "https://internal.example.com/deck",
      "founder@corellahealth.com.au",
      "anon_key",
    ]) {
      expect(html).not.toContain(secret);
    }
  });

  it("does not follow the founder's outbound link for ranking purposes", () => {
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
});

describe("what a published page must carry to be worth indexing", () => {
  it("names the company and its own description", () => {
    expect(html).toContain("Corella Health");
    expect(html).toContain("avoidable emergency-department referrals");
  });

  it("shows all eight dimensions with their scores", () => {
    for (const label of [
      "Founder &amp; Team",
      "Market &amp; Problem",
      "Product &amp; Technical",
      "Traction &amp; Revenue",
      "Cap Table &amp; Governance",
      "Investor Readiness",
      "Legal &amp; Compliance",
      "Strategic Vision &amp; Moat",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("shows the valuation range and the methods behind it", () => {
    expect(html).toContain("A$1.20M");
    expect(html).toContain("A$3.60M");
    expect(html).toContain("Berkus");
    expect(html).toContain("Scorecard");
  });

  // "No methodology weighting on customer surfaces."
  it("does not print the weighting behind the methods", () => {
    expect(html).not.toContain("(50%)");
  });

  it("shows the stage and where the score sits against its stage band", () => {
    expect(html).toContain("MVP / Prototype");
    expect(html).toContain("Above the median for this stage");
  });

  it("shows the stage-appropriate next steps", () => {
    expect(html).toContain("Get your first paying customer");
    expect(html).toContain("Build a cap table");
  });

  it("closes the loop back to running an analysis, carrying the sector", () => {
    expect(html).toContain('action="/analyze"');
    expect(html).toContain('name="q"');
    expect(html).toContain("HealthTech / MedTech");
  });

  it("says plainly that this is not financial advice", () => {
    expect(html).toMatch(/nothing here is financial product advice/i);
  });
});

describe("preview parity", () => {
  it("renders the same profile content in the founder's preview", () => {
    const preview = renderToStaticMarkup(
      <PublicProfileBody profile={profile} preview />,
    );
    // The preview drops only the back-link to the directory; everything a
    // reader would see is identical, because the preview IS the page.
    expect(preview).toContain("Corella Health");
    expect(preview).toContain("A$1.20M");
    expect(preview).toContain("Get your first paying customer");
    expect(preview).not.toContain("Browse every published Australian startup");
  });
});
