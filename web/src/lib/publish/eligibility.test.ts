// Colocated spec for the publishing gates.
//
// The property under test throughout: publishing is opt-in, and the bar for a
// public URL is a real one. Two failures would be expensive and both are
// pinned here — a thin analysis slipping through (near-duplicate pages read as
// doorway pages and penalise the whole domain), and a founder-authored field
// that is empty or self-referential making it onto the open web.

import { describe, expect, it } from "vitest";

import type { CompactSvi } from "@/lib/analyses/payload";
import {
  MIN_EVIDENCE_CONFIDENCE,
  MIN_ONE_LINER_CHARS,
  PUBLISH_SECTORS,
  RESERVED_SLUGS,
  SVI_DIMENSION_KEYS,
  checkAnalysisDepth,
  isValidSlug,
  normalisePublishFields,
  pickFreeSlug,
  slugify,
} from "./eligibility";

function svi(overrides: Partial<CompactSvi> = {}): CompactSvi {
  return {
    version: "2.1.0",
    totalSVI: 118,
    stage: 2,
    stageLabel: "MVP / Prototype",
    summary: "A summary.",
    confidenceMultiplier: 0.5,
    dimensions: Object.fromEntries(SVI_DIMENSION_KEYS.map((k) => [k, 55])),
    nextActions: [
      { priority: "P0", title: "One", detail: "A detail long enough to count." },
      { priority: "P0", title: "Two", detail: "A detail long enough to count." },
      { priority: "P1", title: "Three", detail: "A detail long enough to count." },
    ],
    valuation: {
      low: 1_000_000,
      mid: 2_000_000,
      high: 3_000_000,
      method: "Berkus (50%) + Scorecard (50%)",
      confidence: 55,
      currency: "AUD",
    },
    ...overrides,
  };
}

const ONE_LINER =
  "A GP-first triage tool that cuts avoidable emergency-department referrals for regional Australian clinics.";

describe("checkAnalysisDepth", () => {
  it("passes a run with eight dimensions, a valuation and real evidence", () => {
    expect(checkAnalysisDepth(svi())).toEqual({ ok: true, reasons: [] });
  });

  it("refuses a run with no score at all", () => {
    const result = checkAnalysisDepth(null);
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });

  // The single most load-bearing rule. Anything scored from typed text alone
  // carries self_declared confidence (0.20); a live site, an uploaded deck or
  // a connected source starts at 0.35. Publishing the first kind is how a
  // directory fills up with pages nobody would want to land on.
  it("refuses a score built on typed text alone", () => {
    const result = checkAnalysisDepth(svi({ confidenceMultiplier: 0.2 }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/typed text alone/i);
  });

  it("accepts exactly the evidence floor", () => {
    expect(
      checkAnalysisDepth(svi({ confidenceMultiplier: MIN_EVIDENCE_CONFIDENCE })).ok,
    ).toBe(true);
  });

  it("refuses a half-scored run", () => {
    const partial = svi();
    delete (partial.dimensions as Record<string, number>).tre;
    const result = checkAnalysisDepth(partial);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/dimensions/i);
  });

  it("refuses a run with no valuation range", () => {
    const result = checkAnalysisDepth(
      svi({
        valuation: {
          low: 0,
          mid: 0,
          high: 0,
          method: "",
          confidence: 0,
          currency: "AUD",
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/valuation/i);
  });

  it("refuses a run with fewer than three usable next steps", () => {
    const result = checkAnalysisDepth(
      svi({
        nextActions: [
          { priority: "P0", title: "One", detail: "A detail long enough." },
          { priority: "P0", title: "Two", detail: "short" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/next steps/i);
  });

  it("reports every failure at once rather than one at a time", () => {
    const result = checkAnalysisDepth(
      svi({ confidenceMultiplier: 0.2, nextActions: [], stageLabel: "" }),
    );
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("normalisePublishFields", () => {
  const good = {
    companyName: "  Corella   Health ",
    oneLiner: ONE_LINER,
    sector: "HealthTech",
    websiteUrl: "corellahealth.com.au",
  };

  it("accepts and tidies a complete submission", () => {
    const result = normalisePublishFields(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.companyName).toBe("Corella Health");
    expect(result.fields.sector).toBe("healthtech");
    expect(result.fields.websiteUrl).toBe("https://corellahealth.com.au/");
  });

  it("treats the website as optional", () => {
    const result = normalisePublishFields({ ...good, websiteUrl: "  " });
    expect(result.ok).toBe(true);
    expect(result.ok && result.fields.websiteUrl).toBeNull();
  });

  // Every one of the retired sample listings pointed its "website" back at
  // blockid.au. A directory whose outbound links are all self-referential is
  // a doorway signal in its own right.
  it("refuses a website that points back at blockid.au", () => {
    const result = normalisePublishFields({
      ...good,
      websiteUrl: "https://blockid.au/listings/whatever",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons.join(" ")).toMatch(/your own website/i);
  });

  // The floor on founder-written prose is the cheapest guard against a
  // directory of pages that differ only by name.
  it(`refuses a description shorter than ${MIN_ONE_LINER_CHARS} characters`, () => {
    const result = normalisePublishFields({ ...good, oneLiner: "We do health." });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons.join(" ")).toMatch(
      /at least 60 characters/i,
    );
  });

  it("counts collapsed whitespace, not padding, toward the minimum", () => {
    const padded = `${"a ".repeat(40)}`;
    const result = normalisePublishFields({ ...good, oneLiner: padded });
    expect(result.ok).toBe(true);
  });

  it("refuses a sector that is not one we offer", () => {
    const result = normalisePublishFields({ ...good, sector: "web3-vibes" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons.join(" ")).toMatch(/sector/i);
  });

  it("offers only real sector keys in the picker", () => {
    expect(PUBLISH_SECTORS).toContain("healthtech");
    expect(PUBLISH_SECTORS.length).toBeGreaterThan(10);
  });
});

describe("slugify", () => {
  it("produces a lowercase kebab slug", () => {
    expect(slugify("Corella Health Pty Ltd")).toBe("corella-health-pty-ltd");
  });

  it("strips diacritics rather than dropping the word", () => {
    expect(slugify("Café Ràpid")).toBe("cafe-rapid");
  });

  it("never collides with the legacy uppercase ticker namespace", () => {
    expect(slugify("SAMPLE-01")).toBe("sample-01");
    expect(slugify("Anything")).toMatch(/^[a-z0-9-]+$/);
  });

  it("refuses to mint a slug that would shadow a real path", () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(slugify(reserved)).not.toBe(reserved);
    }
  });

  it("returns empty for a name with no Latin content, so the caller can fall back", () => {
    expect(slugify("株式会社")).toBe("");
    expect(slugify("!!")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts what slugify produces and rejects the rest", () => {
    expect(isValidSlug("corella-health")).toBe(true);
    expect(isValidSlug("Corella-Health")).toBe(false);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("../../etc/passwd")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
  });
});

describe("pickFreeSlug", () => {
  it("takes the plain slug when it is free", () => {
    expect(pickFreeSlug("corella-health", [], "abc123")).toBe("corella-health");
  });

  it("suffixes rather than overwriting an existing company's URL", () => {
    expect(pickFreeSlug("corella-health", ["corella-health"], "abc123")).toBe(
      "corella-health-2",
    );
    expect(
      pickFreeSlug("corella-health", ["corella-health", "corella-health-2"], "abc"),
    ).toBe("corella-health-3");
  });

  it("still returns a valid slug when the name slugs to nothing", () => {
    expect(isValidSlug(pickFreeSlug("", [], "abc123"))).toBe(true);
  });
});
