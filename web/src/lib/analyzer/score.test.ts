import { describe, expect, it } from "vitest";
import { scoreAnalyzer, valuationAdjusterFor } from "./score";
import type { GithubSignals, WebsiteSignals } from "./types";

const weakGithub: GithubSignals = {
  commitsPerMonth: 0,
  contributors: 1,
  stars: 0,
  primaryLanguage: null,
  hasTests: false,
  hasCI: false,
  license: null,
  readmeCompleteness: 5,
};

const weakWebsite: WebsiteSignals = {
  https: false,
  ttfbMs: 2500,
  perf: 20,
  seo: 25,
  a11y: 30,
  hasSitemap: false,
  hasRobots: false,
  metaTagCount: 1,
};

const mediumGithub: GithubSignals = {
  commitsPerMonth: 8,
  contributors: 3,
  stars: 50,
  primaryLanguage: "TypeScript",
  hasTests: true,
  hasCI: false,
  license: "MIT",
  readmeCompleteness: 55,
};

const mediumWebsite: WebsiteSignals = {
  https: true,
  ttfbMs: 700,
  perf: 65,
  seo: 70,
  a11y: 60,
  hasSitemap: true,
  hasRobots: true,
  metaTagCount: 5,
};

const strongGithub: GithubSignals = {
  commitsPerMonth: 40,
  contributors: 12,
  stars: 800,
  primaryLanguage: "Rust",
  hasTests: true,
  hasCI: true,
  license: "Apache-2.0",
  readmeCompleteness: 95,
};

const strongWebsite: WebsiteSignals = {
  https: true,
  ttfbMs: 150,
  perf: 95,
  seo: 92,
  a11y: 90,
  hasSitemap: true,
  hasRobots: true,
  metaTagCount: 10,
};

describe("scoreAnalyzer — fixtures", () => {
  it("weak signals yield sub_score < 40 and -10% adjuster", () => {
    const r = scoreAnalyzer({ github: weakGithub, website: weakWebsite });
    expect(r.sub_score).toBeLessThan(40);
    expect(r.valuation_adjuster_pct).toBe(-10);
    expect(r.rationale.some((s) => s.startsWith("Gap:"))).toBe(true);
  });

  it("medium signals yield sub_score in [40, 85) with a non-negative adjuster", () => {
    const r = scoreAnalyzer({ github: mediumGithub, website: mediumWebsite });
    expect(r.sub_score).toBeGreaterThanOrEqual(40);
    expect(r.sub_score).toBeLessThan(85);
    expect([0, 5]).toContain(r.valuation_adjuster_pct);
  });

  it("strong signals yield sub_score >= 85 and +12% adjuster", () => {
    const r = scoreAnalyzer({ github: strongGithub, website: strongWebsite });
    expect(r.sub_score).toBeGreaterThanOrEqual(85);
    expect(r.valuation_adjuster_pct).toBe(12);
    expect(r.rationale.some((s) => s.startsWith("Strong:"))).toBe(true);
  });

  it("only-github and only-website inputs still score", () => {
    const gOnly = scoreAnalyzer({ github: strongGithub });
    expect(gOnly.breakdown.websiteSide).toBeNull();
    expect(gOnly.sub_score).toBeGreaterThan(70);

    const wOnly = scoreAnalyzer({ website: strongWebsite });
    expect(wOnly.breakdown.githubSide).toBeNull();
    expect(wOnly.sub_score).toBeGreaterThan(70);
  });
});

describe("valuationAdjusterFor — thresholds", () => {
  it("maps score bands to adjuster percentages", () => {
    expect(valuationAdjusterFor(0)).toBe(-10);
    expect(valuationAdjusterFor(39)).toBe(-10);
    expect(valuationAdjusterFor(40)).toBe(0);
    expect(valuationAdjusterFor(69)).toBe(0);
    expect(valuationAdjusterFor(70)).toBe(5);
    expect(valuationAdjusterFor(84)).toBe(5);
    expect(valuationAdjusterFor(85)).toBe(12);
    expect(valuationAdjusterFor(100)).toBe(12);
  });
});
