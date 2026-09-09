// Colocated spec for the published-profile view model.
//
// Two things matter here and both are privacy- or SEO-load-bearing:
//
//   1. Every field on a PublicProfile comes from either the founder's own
//      published fields or the derived score summary. There is no path from
//      an input URL, a filename, an email or raw text into this object, and
//      the shape test below is what keeps it that way.
//   2. Titles, descriptions and structured data are built per profile from
//      that profile's own figures — a single template with a swapped name is
//      the doorway-page pattern.

import { describe, expect, it } from "vitest";

import type { CompactSvi } from "@/lib/analyses/payload";
import { SVI_DIMENSION_KEYS } from "./eligibility";
import {
  buildProfileJsonLd,
  buildPublicProfile,
  describeStanding,
  formatAud,
  formatAuDate,
  profileDescription,
  profileTitle,
  splitValuationMethods,
} from "./profile";

const svi: CompactSvi = {
  version: "2.1.0",
  totalSVI: 122,
  stage: 2,
  stageLabel: "MVP / Prototype",
  summary: "A summary.",
  confidenceMultiplier: 0.5,
  dimensions: {
    ftv: 72,
    mpc: 64,
    ptd: 58,
    tre: 31,
    cgh: 45,
    iri: 50,
    lco: 40,
    svm: 55,
  },
  nextActions: [
    { priority: "P0", title: "Add revenue proof", detail: "Connect Stripe." },
    { priority: "P1", title: "", detail: "no title, must be dropped" },
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

function build() {
  return buildPublicProfile({
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
}

describe("buildPublicProfile", () => {
  it("carries exactly the founder's published fields and nothing else", () => {
    const p = build();
    // The whole privacy argument in one assertion: this is the complete set
    // of keys a published page can render. No input_text, input_url,
    // input_filename, email, anon_key or intake.
    expect(Object.keys(p).sort()).toEqual(
      [
        "analysedAt",
        "benchmark",
        "companyName",
        "dimensions",
        "nextActions",
        "oneLiner",
        "publishedAt",
        "sector",
        "sectorLabel",
        "slug",
        "sviTotal",
        "stage",
        "stageLabel",
        "standing",
        "strongest",
        "updatedAt",
        "url",
        "valuation",
        "weakest",
        "websiteUrl",
      ].sort(),
    );
  });

  it("renders all eight dimensions, clamped and banded", () => {
    const p = build();
    expect(p.dimensions.map((d) => d.key)).toEqual([...SVI_DIMENSION_KEYS]);
    expect(p.dimensions.find((d) => d.key === "ftv")?.band).toBe("strong");
    expect(p.dimensions.find((d) => d.key === "mpc")?.band).toBe("developing");
    expect(p.dimensions.find((d) => d.key === "tre")?.band).toBe("early");
  });

  it("names the strongest and weakest dimension for the page's own prose", () => {
    const p = build();
    expect(p.strongest?.key).toBe("ftv");
    expect(p.weakest?.key).toBe("tre");
  });

  it("drops a next action with no title rather than rendering a blank step", () => {
    expect(build().nextActions).toHaveLength(1);
  });

  it("resolves the sector label and the canonical URL", () => {
    const p = build();
    expect(p.sectorLabel).toBe("HealthTech / MedTech");
    expect(p.url).toBe("https://blockid.au/listings/corella-health");
  });

  it("survives a dimension missing from the stored blob", () => {
    const p = buildPublicProfile({
      slug: "x-co",
      companyName: "X",
      oneLiner: "y",
      sector: "saas",
      svi: { ...svi, dimensions: { ftv: 50 } },
      analysedAt: "2026-09-08T04:00:00.000Z",
    });
    expect(p.dimensions).toHaveLength(8);
    expect(p.dimensions.find((d) => d.key === "tre")?.value).toBe(0);
  });
});

describe("splitValuationMethods", () => {
  // "No methodology weighting on customer surfaces" — the named methods are
  // the useful half; the percentage split is internal.
  it("keeps the method names and drops the weighting", () => {
    expect(splitValuationMethods("Berkus (50%) + Scorecard (50%)")).toEqual([
      "Berkus",
      "Scorecard",
    ]);
  });

  it("handles a single method and an empty one", () => {
    expect(splitValuationMethods("Berkus")).toEqual(["Berkus"]);
    expect(splitValuationMethods(undefined)).toEqual([]);
  });
});

describe("describeStanding", () => {
  it("places an index value inside the published band for its stage", () => {
    // Stage 2 band: p10 85, p25 100, p50 115, p75 130, p90 145.
    expect(describeStanding(80, 2)).toMatch(/bottom 10%/i);
    expect(describeStanding(110, 2)).toMatch(/below the median/i);
    expect(describeStanding(122, 2)).toMatch(/above the median/i);
    expect(describeStanding(150, 2)).toMatch(/top 10%/i);
  });
});

describe("formatting", () => {
  it("formats Australian dollars the way a founder writes them", () => {
    expect(formatAud(2_400_000)).toBe("A$2.40M");
    expect(formatAud(24_000_000)).toBe("A$24.0M");
    expect(formatAud(750_000)).toBe("A$750k");
    expect(formatAud(0)).toBe("—");
  });

  it("formats dates in Australian English", () => {
    expect(formatAuDate("2026-09-08T04:00:00.000Z")).toBe("8 September 2026");
    expect(formatAuDate(null)).toBe("");
    expect(formatAuDate("not a date")).toBe("");
  });
});

describe("metadata", () => {
  it("builds a title from this profile's own figures", () => {
    const t = profileTitle(build());
    expect(t).toContain("Corella Health");
    expect(t).toContain("HealthTech / MedTech");
    expect(t).toContain("122");
  });

  it("leads the description with the founder's own words", () => {
    const d = profileDescription(build());
    expect(d.startsWith("A GP-first triage tool")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(300);
  });
});

describe("buildProfileJsonLd", () => {
  it("emits an Organization for the company and a Dataset for the score", () => {
    const graph = buildProfileJsonLd(build()) as {
      "@graph": Record<string, unknown>[];
    };
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "Dataset"]);
  });

  it("exposes every dimension as a machine-readable measurement", () => {
    const graph = buildProfileJsonLd(build()) as {
      "@graph": Record<string, unknown>[];
    };
    const dataset = graph["@graph"][1];
    const measured = dataset.variableMeasured as { name: string }[];
    // 1 index value + 8 dimensions + 2 valuation bounds.
    expect(measured).toHaveLength(11);
    expect(measured.map((m) => m.name)).toContain("Traction & Revenue");
  });

  it("points the Dataset at the company, not at a duplicate of it", () => {
    const graph = buildProfileJsonLd(build()) as {
      "@graph": Record<string, unknown>[];
    };
    expect(graph["@graph"][1].about).toEqual({
      "@id": "https://blockid.au/listings/corella-health#organization",
    });
  });

  it("never leaks a founder contact point into structured data", () => {
    const json = JSON.stringify(buildProfileJsonLd(build()));
    expect(json).not.toMatch(/@[a-z0-9.-]+\.(com|au|io)/i);
  });
});
